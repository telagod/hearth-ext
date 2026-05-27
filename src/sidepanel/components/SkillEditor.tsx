import { useEffect, useMemo, useRef, useState } from 'react';
import { sendMsg } from '../api';
import { Icon } from './Icon';
import { highlight, completeAt, type CompletionResult } from './skillHighlight';

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  steps?: number;
  tools?: string[];
}

interface SkillRow {
  id: number;
  name: string;
  version: string;
  body_md: string;
  source: string;
}

export function SkillEditor({
  initial,
  onSaved,
  onClose,
}: {
  initial?: SkillRow;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const [body, setBody] = useState(initial?.body_md ?? STARTER);
  const [validation, setValidation] = useState<ValidationResult>({ ok: false, errors: [], warnings: [] });
  const [busy, setBusy] = useState<'save' | 'dry-run' | null>(null);
  const [dryRunOut, setDryRunOut] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [completionIdx, setCompletionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  const lines = useMemo(() => body.split('\n').length, [body]);
  const highlighted = useMemo(() => highlight(body) + '\n', [body]);

  // Lightweight client-side validation; full validation is performed via
  // skill.run trigger=manual in dry-run mode (server-side).
  useEffect(() => {
    setValidation(quickValidate(body));
  }, [body]);

  async function save() {
    if (!validation.ok) return;
    setBusy('save');
    try {
      const fm = parseFrontmatter(body);
      await sendMsg({
        type: 'db.mutate',
        op: 'skill.upsert',
        payload: {
          name: String(fm.name ?? 'untitled'),
          version: String(fm.version ?? '1.0.0'),
          description: String(fm.description ?? ''),
          trigger_json: JSON.stringify(fm.trigger ?? { type: 'manual' }),
          tools_json: JSON.stringify(fm.tools ?? []),
          permissions_json: JSON.stringify(fm.permissions ?? {}),
          body_md: body,
          source: 'user',
        },
      });
      onSaved?.();
    } catch (e) {
      alert(`保存失败：${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function dryRun() {
    setBusy('dry-run');
    setDryRunOut('运行中…');
    try {
      const fm = parseFrontmatter(body);
      const name = String(fm.name ?? '');
      if (!name) {
        setDryRunOut('× 缺少 name');
        return;
      }
      // Save first (the runner pulls from skills table), then trigger manual.
      await save();
      const r = await sendMsg({ type: 'skill.run', name, trigger: 'manual' });
      setDryRunOut(`✓ 已派发: ${JSON.stringify(r)}\n打开 Skills 面板查看运行历史。`);
    } catch (e) {
      setDryRunOut(`× ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="skill-editor">
      <div className="skill-editor-head">
        <span className="title">
          <Icon name="feather" size={14} />
          {initial ? `编辑 · ${initial.name}` : '新建 skill'}
        </span>
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy !== null} onClick={() => void dryRun()}>
            <Icon name="spark" size={12} /> 干跑
          </button>
          <button className="btn btn-ember" disabled={!validation.ok || busy !== null}
            onClick={() => void save()}>
            <Icon name="check" size={12} /> 保存
          </button>
        </div>
      </div>

      <div className="skill-editor-body">
        <div className="line-gutter" aria-hidden>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="skill-editor-stack">
          <pre className="skill-editor-hl" aria-hidden ref={highlightRef}
            dangerouslySetInnerHTML={{ __html: highlighted }} />
          <textarea
            ref={textareaRef}
            className="skill-editor-area"
            value={body}
            spellCheck={false}
            onScroll={(e) => {
              if (highlightRef.current) {
                highlightRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
                highlightRef.current.scrollLeft = (e.target as HTMLTextAreaElement).scrollLeft;
              }
            }}
            onChange={(e) => {
              const v = e.target.value;
              setBody(v);
              const c = completeAt(v, e.target.selectionStart);
              setCompletion(c && c.suggestions.length > 0 ? c : null);
              setCompletionIdx(0);
            }}
            onKeyDown={(e) => {
              if (completion && completion.suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCompletionIdx((i) => (i + 1) % completion.suggestions.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCompletionIdx((i) => (i - 1 + completion.suggestions.length) % completion.suggestions.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyCompletion(e.currentTarget, body, completion, completionIdx, setBody, () => setCompletion(null));
                  return;
                }
                if (e.key === 'Escape') {
                  setCompletion(null);
                  return;
                }
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                const t = e.currentTarget;
                const s = t.selectionStart;
                const before = t.value.slice(0, s);
                const after = t.value.slice(t.selectionEnd);
                const v = before + '  ' + after;
                setBody(v);
                requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
              }
            }}
          />
          {completion && completion.suggestions.length > 0 && (
            <div className="skill-completion">
              <div className="skill-completion-hint">↑↓ 选择 · ⏎/Tab 确认 · Esc 取消</div>
              {completion.suggestions.map((s, i) => (
                <div key={s} className={`skill-completion-row${i === completionIdx ? ' on' : ''}`}>
                  <span className="t-tool-sample">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="skill-editor-foot">
        <div className={`val-row ${validation.ok ? 'ok' : 'err'}`}>
          <Icon name={validation.ok ? 'check' : 'cross'} size={12} />
          <span>
            {validation.ok
              ? `OK · ${validation.steps ?? 0} 步 · ${(validation.tools ?? []).length} 个工具`
              : `${validation.errors.length} 错误`}
          </span>
        </div>
        {validation.errors.map((m, i) => <div key={`e${i}`} className="val-msg err">× {m}</div>)}
        {validation.warnings.map((m, i) => <div key={`w${i}`} className="val-msg warn">⚠ {m}</div>)}
        {dryRunOut && <pre className="dry-out">{dryRunOut}</pre>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

const STARTER = `---
name: my-skill
version: 1.0.0
description: 描述这个 skill 做什么
trigger:
  type: manual
tools:
  - db.query
permissions:
  llm: none
  network: none
  storage: required
timeout: 30
---

# 步骤

### 1. 查最近 5 条笔记

\`\`\`call:db.query
SELECT id, body_plain FROM notes
WHERE archived = 0
ORDER BY created_at DESC LIMIT 5
\`\`\`
`;

const ALLOWED_TOOLS = new Set([
  'db.query', 'db.upsert', 'db.tag', 'db.link', 'db.archive',
  'llm.summarize', 'llm.tag', 'llm.narrate', 'llm.chat',
  'ui.notify', 'ui.card', 'ui.toast',
  'inbox.list', 'inbox.promote', 'inbox.discard', 'inbox.expire_sweep',
  'extract.web', 'extract.docx', 'extract.pdf', 'extract.ocr',
]);

function quickValidate(body: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fmMatch = body.match(/^---\n([\s\S]+?)\n---/);
  if (!fmMatch) {
    return { ok: false, errors: ['缺少 frontmatter（--- 块）'], warnings: [] };
  }
  const fm = parseFrontmatter(body);

  if (!fm.name || !/^[a-z][a-z0-9-]{1,40}$/.test(String(fm.name))) {
    errors.push('name 必填，slug 风格 (a-z, 0-9, -)');
  }
  if (!fm.version) errors.push('version 必填');
  if (!fm.description) warnings.push('建议加上 description');
  if (!fm.trigger || typeof fm.trigger !== 'object') errors.push('trigger 必填');

  // Find all call:<tool> fences and check tools whitelist.
  const callRe = /```call:([\w.]+)/g;
  const tools = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(body))) tools.add(m[1]!);
  for (const t of tools) {
    if (!ALLOWED_TOOLS.has(t)) errors.push(`未知工具：${t}`);
  }

  const declaredTools: string[] = Array.isArray(fm.tools) ? (fm.tools as string[]) : [];
  for (const t of tools) {
    if (declaredTools.length > 0 && !declaredTools.includes(t)) {
      warnings.push(`步骤用到 ${t}，建议把它加进 frontmatter.tools`);
    }
  }

  const stepRe = /^###\s+\d+\.\s+/gm;
  const stepCount = body.match(stepRe)?.length ?? 0;
  if (stepCount === 0) warnings.push('没有发现步骤标题 (###  1. ...)');
  if (stepCount > 32) errors.push('步骤数超过 32（硬上限）');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    steps: stepCount,
    tools: [...tools],
  };
}

/**
 * Tiny YAML-ish frontmatter parser — handles key:value, nested 1-level,
 * inline arrays/objects, and bullet lists. Sufficient for our skill files.
 */
function parseFrontmatter(body: string): Record<string, unknown> {
  const m = body.match(/^---\n([\s\S]+?)\n---/);
  if (!m) return {};
  const lines = m[1]!.split('\n');
  const out: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) { i += 1; continue; }
    const key = kv[1]!;
    const val = kv[2]!.trim();
    if (!val) {
      // nested object or bullet list — collect indented children
      const children: string[] = [];
      i += 1;
      while (i < lines.length && /^\s/.test(lines[i]!)) {
        children.push(lines[i]!);
        i += 1;
      }
      if (children.every((l) => /^\s+-\s/.test(l))) {
        out[key] = children.map((l) => l.replace(/^\s+-\s+/, '').trim());
      } else {
        const nested: Record<string, unknown> = {};
        for (const c of children) {
          const m2 = c.match(/^\s+(\w+):\s*(.*)$/);
          if (m2) nested[m2[1]!] = coerce(m2[2]!.trim());
        }
        out[key] = nested;
      }
      continue;
    }
    out[key] = coerce(val);
    i += 1;
  }
  return out;
}

function coerce(s: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.startsWith('[') && s.endsWith(']')) {
    return s.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    try { return JSON.parse(s); } catch { /* fallthrough */ }
  }
  return s.replace(/^["']|["']$/g, '');
}

function applyCompletion(
  el: HTMLTextAreaElement,
  body: string,
  completion: CompletionResult,
  selectedIdx: number,
  setBody: (v: string) => void,
  closeCompletion: () => void,
): void {
  const pick = completion.suggestions[selectedIdx]!;
  const caret = el.selectionStart;
  const before = body.slice(0, caret - completion.prefix.length);
  const after = body.slice(caret);
  const next = before + pick + after;
  setBody(next);
  closeCompletion();
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = before.length + pick.length;
    el.focus();
  });
}