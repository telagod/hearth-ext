/**
 * Skill Runner — load skill.md, validate, execute step-by-step.
 *
 * Hard constraints:
 *   - 30s total timeout (configurable per skill)
 *   - 32 steps max
 *   - tools must be in whitelist
 *   - llm.* honors user consent; db.query is SELECT-only
 *
 * Step body forms (per <code>```call:<tool>```</code> block):
 *
 *   ```call:db.query
 *   SELECT id FROM notes LIMIT 5
 *   ```
 *
 *   ```call:llm.tag
 *   text: "{{ steps.0.result[0].body }}"
 *   k: 3
 *   ```
 *
 * Inline YAML or raw SQL — body type is inferred from tool name.
 */

import matter from 'gray-matter';
import { z } from 'zod';
import type { SkillManifest } from '@shared/types';
import { callTool, TOOL_NAMES } from './tools';
import { sendToOffscreen } from './offscreenBridge';
import { render, evalExpr } from './template';

const TRIGGER_CRON = z.object({ type: z.literal('cron'), schedule: z.string() });
const TRIGGER_EVENT = z.object({ type: z.literal('event'), event: z.string() });
const TRIGGER_MANUAL = z.object({ type: z.literal('manual') });

const ManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  version: z.string(),
  description: z.string().max(200),
  author: z.string().optional(),
  trigger: z.discriminatedUnion('type', [TRIGGER_CRON, TRIGGER_EVENT, TRIGGER_MANUAL]),
  tools: z.array(z.string()).max(16),
  permissions: z.object({
    llm: z.enum(['required', 'optional', 'none']),
    network: z.enum(['optional', 'none']),
    storage: z.literal('required'),
    clipboard: z.enum(['optional', 'none']).optional(),
  }),
  inputs: z.array(z.object({ name: z.string(), type: z.string(), required: z.boolean().optional() })).optional(),
  outputs: z.array(z.object({ name: z.string(), type: z.string() })).optional(),
  timeout: z.number().int().min(1).max(60).default(30),
  schedule_jitter: z.number().int().min(0).max(300).default(0),
});

const TOOL_WHITELIST = new Set(TOOL_NAMES);

export interface ParsedSkill {
  manifest: SkillManifest;
  body: string;
  steps: SkillStep[];
}

export interface SkillStep {
  index: number;
  heading: string;
  tool?: string;
  raw: string;
}

export function parseSkill(md: string): ParsedSkill {
  const { data, content } = matter(md);
  const manifest = ManifestSchema.parse(data) as SkillManifest;
  for (const t of manifest.tools) {
    if (!TOOL_WHITELIST.has(t)) {
      throw new Error(`Skill ${manifest.name}: tool '${t}' not in whitelist`);
    }
  }
  const steps = extractSteps(content);
  if (steps.length > 32) {
    throw new Error(`Skill ${manifest.name}: too many steps (>32)`);
  }
  return { manifest, body: content, steps };
}

function extractSteps(body: string): SkillStep[] {
  const steps: SkillStep[] = [];
  const lines = body.split('\n');
  let current: SkillStep | null = null;
  let inBlock = false;
  let blockLang = '';
  const blockBuf: string[] = [];
  let stepIndex = 0;

  for (const line of lines) {
    const head = line.match(/^###\s+\d+\.\s+(.+)$/);
    if (head && !inBlock) {
      if (current) steps.push(current);
      stepIndex += 1;
      current = { index: stepIndex, heading: head[1]!, raw: '' };
      continue;
    }
    const fence = line.match(/^```call:([\w.]+)\s*$/);
    if (fence && current) {
      inBlock = true;
      blockLang = fence[1]!;
      blockBuf.length = 0;
      continue;
    }
    if (inBlock && line.startsWith('```')) {
      inBlock = false;
      if (current) {
        current.tool = blockLang;
        current.raw = blockBuf.join('\n');
      }
      continue;
    }
    if (inBlock) {
      blockBuf.push(line);
    }
  }
  if (current) steps.push(current);
  return steps;
}

// ────────────────────────────────────────────────────────────────────
// Execution
// ────────────────────────────────────────────────────────────────────

export interface RunRequest {
  skill: ParsedSkill;
  trigger: 'cron' | 'manual' | 'event';
  inputs?: Record<string, unknown>;
}

export interface RunResult {
  ok: boolean;
  runId: number | null;
  error?: string;
  steps: Array<{ tool?: string; result?: unknown; error?: string; ms: number }>;
}

export async function runSkill(req: RunRequest): Promise<RunResult> {
  const { skill, trigger } = req;
  const runId = await openRun(skill.manifest.name, trigger);
  const t0 = Date.now();
  const log: string[] = [];
  const stepResults: RunResult['steps'] = [];
  const ctx = {
    skillName: skill.manifest.name,
    runId,
    log(level: 'info'|'warn'|'err', msg: string) { log.push(`[${level}] ${msg}`); },
  };

  const timeoutMs = (skill.manifest.timeout ?? 30) * 1000;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    for (const step of skill.steps) {
      if (abort.signal.aborted) throw new Error(`timeout (>${timeoutMs}ms)`);
      const stepT0 = Date.now();
      const tool = step.tool;
      if (!tool) {
        stepResults.push({ ms: Date.now() - stepT0 });
        continue;
      }
      try {
        const args = parseStepArgs(tool, step.raw, {
          inputs: req.inputs ?? {},
          steps: stepResults.map((s) => ({ result: s.result })),
          env: { now: Math.floor(Date.now() / 1000) },
        });
        const out = await callTool(tool, args, ctx);
        stepResults.push({ tool, result: out, ms: Date.now() - stepT0 });
        ctx.log('info', `step ${step.index} ${tool} ok (${Date.now() - stepT0}ms)`);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        stepResults.push({ tool, error: err, ms: Date.now() - stepT0 });
        ctx.log('err', `step ${step.index} ${tool} failed: ${err}`);
        throw e;
      }
    }
    await closeRun(runId, 'succeeded', log, Date.now() - t0, undefined, { steps: stepResults });
    return { ok: true, runId, steps: stepResults };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await closeRun(runId, 'failed', log, Date.now() - t0, err, { steps: stepResults });
    return { ok: false, runId, error: err, steps: stepResults };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a step body into args, given the tool name.
 * - db.query : raw SQL string → { sql }
 * - other     : YAML-ish "key: value" lines (no nested objects)
 * - templated : substitute {{ }} using context
 */
function parseStepArgs(
  tool: string,
  raw: string,
  ctx: { inputs: Record<string, unknown>; steps: Array<{ result: unknown }>; env: Record<string, unknown> },
): Record<string, unknown> {
  const body = render(raw, ctx).trim();
  if (tool === 'db.query') return { sql: body };
  // Otherwise: parse simple "key: value" lines.
  const args: Record<string, unknown> = {};
  const lines = body.split('\n');
  let curKey: string | null = null;
  let blockBuf: string[] | null = null;
  let blockIndent = 0;

  for (const line of lines) {
    if (blockBuf !== null) {
      // continuation of a "key: |" block
      if (/^\s*$/.test(line) || line.length - line.trimStart().length >= blockIndent) {
        blockBuf.push(line.slice(blockIndent));
        continue;
      }
      args[curKey!] = blockBuf.join('\n').trimEnd();
      blockBuf = null;
      curKey = null;
    }
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const val = m[2]!.trim();
    if (val === '|' || val === '>') {
      curKey = key;
      blockBuf = [];
      blockIndent = (lines[lines.indexOf(line) + 1] ?? '').length
        - (lines[lines.indexOf(line) + 1] ?? '').trimStart().length;
      if (!blockIndent) blockIndent = 2;
      continue;
    }
    args[key] = parseValue(val, ctx);
  }
  if (blockBuf !== null && curKey) args[curKey] = blockBuf.join('\n').trimEnd();
  return args;
}

function parseValue(v: string, ctx: { inputs: Record<string, unknown>; steps: Array<{ result: unknown }>; env: Record<string, unknown> }): unknown {
  const t = v.trim();
  if (!t) return '';
  // If value is purely a {{ expr }}, return the raw evaluation (not stringified).
  const purely = t.match(/^\{\{(.+)\}\}$/);
  if (purely) return evalExpr(purely[1]!.trim(), ctx);
  // Else allow embedded expressions inside a string.
  if (t.includes('{{')) return render(t, ctx);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^["'].*["']$/.test(t)) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) {
    try { return JSON.parse(t); } catch { /* fall through */ }
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    try { return JSON.parse(t); } catch { /* fall through */ }
  }
  return t;
}

// ────────────────────────────────────────────────────────────────────
// skill_runs ledger
// ────────────────────────────────────────────────────────────────────

async function openRun(name: string, trigger: 'cron' | 'manual' | 'event'): Promise<number | null> {
  try {
    const skill = await sendToOffscreen<Array<{ id: number }>>({
      type: 'db.query',
      sql: `SELECT id FROM skills WHERE name = ? LIMIT 1`,
      params: [name],
    });
    const skillId = skill[0]?.id;
    if (!skillId) return null;
    const r = await sendToOffscreen<{ id: number }>({
      type: 'db.audit',
      channel: 'skill_runs',
      payload: {
        skill_id: skillId,
        status: 'running',
        started_at: Math.floor(Date.now() / 1000),
        trigger,
      },
    });
    return r?.id ?? null;
  } catch {
    return null;
  }
}

async function closeRun(
  runId: number | null,
  status: 'succeeded' | 'failed' | 'cancelled',
  log: string[],
  durationMs: number,
  error: string | undefined,
  result: unknown,
) {
  if (runId == null) return;
  try {
    await sendToOffscreen({
      type: 'db.mutate',
      op: 'skill_run.update',
      payload: {
        id: runId,
        status,
        duration_ms: durationMs,
        log: log.slice(-40).join('\n'),
        error: error ?? null,
        result_json: JSON.stringify(result).slice(0, 4000),
      },
    });
  } catch { /* swallow */ }
}
