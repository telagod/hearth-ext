/**
 * Mini template engine for skill.md tool calls.
 *
 * Supported syntax:
 *   {{ expr }}              — variable interpolation (auto HTML-safe-off)
 *   {{ expr | length }}     — pipe filters: length, join(sep), upper, lower,
 *                             slice(start,end), default(val), trim
 *   {{ steps[0].result.field }}
 *   {% for x in steps[0].result %}...{{ x.body }}...{% endfor %}
 *   {% if expr %}...{% else %}...{% endif %}
 *
 * Intentionally a small subset of Jinja-style. Anything more complex →
 * stop and return null so the runner can fall back to literal step input.
 *
 * Privacy: no eval(), no Function(); pure tokenize + walk.
 */

export interface RenderContext {
  inputs?: Record<string, unknown>;
  steps?: Array<{ result: unknown }>;
  env?: Record<string, unknown>;
}

interface Token {
  kind: 'text' | 'expr' | 'block';
  body: string;
}

const RX = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g;

function tokenize(tpl: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of tpl.matchAll(RX)) {
    const start = m.index!;
    if (start > last) out.push({ kind: 'text', body: tpl.slice(last, start) });
    const tok = m[0]!;
    if (tok.startsWith('{{')) out.push({ kind: 'expr', body: tok.slice(2, -2).trim() });
    else out.push({ kind: 'block', body: tok.slice(2, -2).trim() });
    last = start + tok.length;
  }
  if (last < tpl.length) out.push({ kind: 'text', body: tpl.slice(last) });
  return out;
}

export function render(tpl: string, ctx: RenderContext): string {
  const toks = tokenize(tpl);
  return walk(toks, 0, toks.length, ctx).out;
}

function walk(toks: Token[], i: number, end: number, ctx: RenderContext): { out: string; next: number } {
  let out = '';
  while (i < end) {
    const t = toks[i]!;
    if (t.kind === 'text') {
      out += t.body;
      i += 1;
      continue;
    }
    if (t.kind === 'expr') {
      out += stringify(evalExpr(t.body, ctx));
      i += 1;
      continue;
    }
    // block
    const m = t.body.match(/^(for|if|else|endfor|endif)\b(.*)$/);
    if (!m) {
      i += 1;
      continue;
    }
    const op = m[1]!;
    const rest = m[2]!.trim();

    if (op === 'for') {
      const f = rest.match(/^(\w+)\s+in\s+(.+)$/);
      if (!f) { i += 1; continue; }
      const [_, varName, listExpr] = f;
      void _;
      const matchEnd = findMatchingEnd(toks, i + 1, end, 'for');
      const list = evalExpr(listExpr!, ctx);
      const items = Array.isArray(list) ? list : [];
      for (const item of items) {
        const inner = walk(toks, i + 1, matchEnd, {
          ...ctx,
          inputs: { ...(ctx.inputs ?? {}), [varName!]: item },
        });
        out += inner.out;
      }
      i = matchEnd + 1;
      continue;
    }

    if (op === 'if') {
      const matchEnd = findMatchingEnd(toks, i + 1, end, 'if');
      const elseAt = findElse(toks, i + 1, matchEnd);
      const cond = !!evalExpr(rest, ctx);
      if (cond) {
        out += walk(toks, i + 1, elseAt ?? matchEnd, ctx).out;
      } else if (elseAt !== null) {
        out += walk(toks, elseAt + 1, matchEnd, ctx).out;
      }
      i = matchEnd + 1;
      continue;
    }
    // unknown / else / endif — handled by parents
    i += 1;
  }
  return { out, next: i };
}

function findMatchingEnd(toks: Token[], from: number, end: number, kind: 'for' | 'if'): number {
  const opener = kind;
  const closer = `end${kind}`;
  let depth = 1;
  for (let i = from; i < end; i++) {
    const t = toks[i];
    if (!t || t.kind !== 'block') continue;
    const op = t.body.split(/\s+/)[0];
    if (op === opener) depth += 1;
    else if (op === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return end;
}

function findElse(toks: Token[], from: number, end: number): number | null {
  let depth = 0;
  for (let i = from; i < end; i++) {
    const t = toks[i];
    if (!t || t.kind !== 'block') continue;
    const op = t.body.split(/\s+/)[0];
    if (op === 'if') depth += 1;
    else if (op === 'endif') depth -= 1;
    else if (op === 'else' && depth === 0) return i;
  }
  return null;
}

// ----- Expression evaluation (path + filters) -----

export function evalExpr(expr: string, ctx: RenderContext): unknown {
  const parts = splitFilters(expr);
  let val: unknown = resolvePath(parts[0]!, ctx);
  for (let i = 1; i < parts.length; i++) {
    val = applyFilter(parts[i]!, val);
  }
  return val;
}

function splitFilters(expr: string): string[] {
  // split on '|' but ignore those inside parens or quoted strings
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let q: string | null = null;
  for (const ch of expr) {
    if (q) {
      buf += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === '(') { depth += 1; buf += ch; continue; }
    if (ch === ')') { depth -= 1; buf += ch; continue; }
    if (ch === '|' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function resolvePath(path: string, ctx: RenderContext): unknown {
  // Literal numeric / string / boolean shortcuts
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  if (/^["'].*["']$/.test(path)) return path.slice(1, -1);
  if (path === 'true') return true;
  if (path === 'false') return false;
  if (path === 'null' || path === 'none') return null;

  const tokens = path.match(/[\w.[\]"']+/g)?.[0] ?? path;
  void tokens;

  // Walk segments: split on '.' but keep [N] / ["k"] as part of step
  const segs = splitSegments(path);
  let cur: unknown =
    segs[0] === 'inputs' ? ctx.inputs :
    segs[0] === 'steps'  ? ctx.steps :
    segs[0] === 'env'    ? ctx.env :
    (ctx.inputs ?? {})[segs[0] as string];
  for (let i = 1; i < segs.length; i++) {
    if (cur == null) return undefined;
    const k = segs[i]!;
    if (typeof k === 'number') {
      cur = (cur as unknown[])[k];
    } else {
      cur = (cur as Record<string, unknown>)[k];
    }
  }
  return cur;
}

type Segment = string | number;

function splitSegments(path: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  while (i < path.length) {
    const ch = path[i]!;
    if (ch === '.') { flush(); i += 1; continue; }
    if (ch === '[') {
      flush();
      const close = path.indexOf(']', i);
      if (close < 0) break;
      const inner = path.slice(i + 1, close).trim();
      if (/^-?\d+$/.test(inner)) out.push(Number(inner));
      else out.push(inner.replace(/^["']|["']$/g, ''));
      i = close + 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function applyFilter(spec: string, val: unknown): unknown {
  const m = spec.match(/^(\w+)(?:\((.*)\))?$/);
  if (!m) return val;
  const name = m[1]!;
  const argsRaw = m[2];
  const args = argsRaw ? parseArgs(argsRaw) : [];

  switch (name) {
    case 'length': return Array.isArray(val) || typeof val === 'string'
      ? (val as { length: number }).length : 0;
    case 'join':   return Array.isArray(val)
      ? val.map(stringify).join((args[0] as string) ?? ', ') : stringify(val);
    case 'upper':  return String(val ?? '').toUpperCase();
    case 'lower':  return String(val ?? '').toLowerCase();
    case 'trim':   return String(val ?? '').trim();
    case 'slice':  return Array.isArray(val) || typeof val === 'string'
      ? (val as string).slice(Number(args[0] ?? 0), Number(args[1] ?? undefined))
      : val;
    case 'default': return (val == null || val === '') ? args[0] : val;
    case 'first':  return Array.isArray(val) ? val[0] : val;
    case 'last':   return Array.isArray(val) ? val[val.length - 1] : val;
    case 'map': {
      // {{ list | map(attribute='id') }}
      if (!Array.isArray(val)) return val;
      const argMap = parseKwargs(argsRaw ?? '');
      const attr = argMap.attribute as string | undefined;
      if (attr) return val.map((x) => (x as Record<string, unknown>)[attr]);
      return val;
    }
    default: return val;
  }
}

function parseArgs(s: string): unknown[] {
  // Split on top-level commas, respecting quoted strings.
  const parts: string[] = [];
  let buf = '';
  let q: string | null = null;
  for (const ch of s) {
    if (q) {
      buf += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === ',') { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => {
    const t = p.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^["'].*["']$/.test(t)) return t.slice(1, -1);
    return t;
  });
}

function parseKwargs(s: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of s.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (/^["'].*["']$/.test(v)) out[k] = v.slice(1, -1);
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

function stringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Expose for tests */
export const _internal = { tokenize, splitSegments, splitFilters };
