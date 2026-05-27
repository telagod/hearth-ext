/**
 * Lightweight syntax highlighter for skill.md.
 *
 * Returns a string of HTML where tokens are wrapped in <span class="t-*">.
 * Caller renders the HTML behind a transparent <textarea> for the typical
 * "highlighted editor" feel without a 2MB Monaco dependency.
 */

const ALLOWED_TOOLS = [
  'db.query', 'db.upsert', 'db.tag', 'db.link', 'db.archive',
  'llm.summarize', 'llm.tag', 'llm.narrate', 'llm.chat',
  'ui.notify', 'ui.card', 'ui.toast',
  'inbox.list', 'inbox.promote', 'inbox.discard', 'inbox.expire_sweep',
  'extract.web', 'extract.docx', 'extract.pdf', 'extract.ocr',
];

const SQL_KEYWORDS = new Set([
  'SELECT','FROM','WHERE','AND','OR','NOT','IN','LIKE','GROUP','BY','ORDER',
  'LIMIT','OFFSET','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AS','DISTINCT',
  'COUNT','SUM','AVG','MIN','MAX','CASE','WHEN','THEN','ELSE','END','NULL',
  'IS','EXISTS','UNION','HAVING',
]);

const FM_KEYS = new Set([
  'name','version','description','author','trigger','tools','permissions',
  'inputs','outputs','timeout','schedule_jitter','type','schedule','event',
  'llm','network','storage','clipboard','required','optional','none',
]);

export function highlight(src: string): string {
  const lines = src.split('\n');
  // State: inside frontmatter? inside ```call: block? what tool?
  let inFM = false;
  let fmSeen = 0;
  let inCall: string | null = null;
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === '---') {
      if (!inFM && fmSeen === 0) { inFM = true; fmSeen = 1; }
      else if (inFM) { inFM = false; fmSeen = 2; }
      out += `<span class="t-fence">${esc(line)}</span>\n`;
      continue;
    }
    if (inFM) {
      out += highlightFrontmatter(line) + '\n';
      continue;
    }
    const callOpen = line.match(/^```call:([\w.]+)\s*$/);
    if (callOpen) {
      inCall = callOpen[1]!;
      const tool = inCall;
      const known = ALLOWED_TOOLS.includes(tool);
      out += `<span class="t-fence">\`\`\`call:</span><span class="${known ? 't-tool' : 't-tool-bad'}">${esc(tool)}</span>\n`;
      continue;
    }
    if (inCall && line.startsWith('```')) {
      inCall = null;
      out += `<span class="t-fence">${esc(line)}</span>\n`;
      continue;
    }
    if (inCall) {
      out += (inCall === 'db.query' ? highlightSql(line) : highlightYaml(line)) + '\n';
      continue;
    }
    // body markdown
    out += highlightMarkdown(line) + '\n';
  }
  return out.replace(/\n$/, '');
}

function highlightFrontmatter(line: string): string {
  const kv = line.match(/^(\s*-?\s*)(\w+)(:)(.*)$/);
  if (!kv) return esc(line);
  const [, indent, key, colon, rest] = kv;
  const keyCls = FM_KEYS.has(key!) ? 't-fm-key' : 't-fm-key-x';
  return (
    esc(indent!) +
    `<span class="${keyCls}">${esc(key!)}</span>` +
    `<span class="t-punct">${esc(colon!)}</span>` +
    highlightYamlValue(rest!)
  );
}

function highlightYaml(line: string): string {
  const m = line.match(/^(\s*)(\w+)(:)(.*)$/);
  if (!m) return esc(line);
  const [, indent, key, colon, rest] = m;
  return (
    esc(indent!) +
    `<span class="t-fm-key">${esc(key!)}</span>` +
    `<span class="t-punct">${esc(colon!)}</span>` +
    highlightYamlValue(rest!)
  );
}

function highlightYamlValue(s: string): string {
  // strings, numbers, templated expressions
  let r = esc(s);
  r = r.replace(/(\{\{[^}]+\}\})/g, '<span class="t-tpl">$1</span>');
  r = r.replace(/(&quot;[^&]*&quot;|&#039;[^&]*&#039;)/g, '<span class="t-string">$1</span>');
  r = r.replace(/(\b\d+(?:\.\d+)?\b)/g, '<span class="t-num">$1</span>');
  return r;
}

function highlightSql(line: string): string {
  // wrap keywords, then templated expressions
  let r = esc(line);
  r = r.replace(/(\{\{[^}]+\}\})/g, '<span class="t-tpl">$1</span>');
  r = r.replace(/\b([A-Z]{2,})\b/g, (m: string) => {
    return SQL_KEYWORDS.has(m) ? `<span class="t-sql-kw">${m}</span>` : m;
  });
  // string literals
  r = r.replace(/(&#039;[^&]*&#039;)/g, '<span class="t-string">$1</span>');
  return r;
}

function highlightMarkdown(line: string): string {
  if (/^#{1,6}\s/.test(line)) return `<span class="t-heading">${esc(line)}</span>`;
  if (/^>\s/.test(line)) return `<span class="t-quote">${esc(line)}</span>`;
  let r = esc(line);
  r = r.replace(/(\{\{[^}]+\}\})/g, '<span class="t-tpl">$1</span>');
  r = r.replace(/(\*\*[^*]+\*\*)/g, '<span class="t-bold">$1</span>');
  r = r.replace(/(`[^`]+`)/g, '<span class="t-code">$1</span>');
  return r;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ────────────────────────────────────────────────────────────────────
// Tool name completion
// ────────────────────────────────────────────────────────────────────

export interface CompletionResult {
  prefix: string;
  suggestions: string[];
}

/**
 * Given the editor's full text and the caret offset, return tool-name
 * completion candidates if the caret sits inside a `\`\`\`call:` prefix.
 * Returns null if no completion applies.
 */
export function completeAt(text: string, caret: number): CompletionResult | null {
  const upto = text.slice(0, caret);
  const lineStart = upto.lastIndexOf('\n') + 1;
  const line = upto.slice(lineStart);
  // case 1: "```call:<prefix>"
  const m1 = line.match(/^```call:([\w.]*)$/);
  if (m1) {
    const prefix = m1[1]!;
    return {
      prefix,
      suggestions: ALLOWED_TOOLS.filter((t) => t.startsWith(prefix)),
    };
  }
  // case 2: inside frontmatter "tools:\n  - <prefix>"
  // (the previous non-blank line above us starts with "tools:")
  const above = text.slice(0, lineStart).split('\n');
  for (let i = above.length - 1; i >= 0; i--) {
    const l = above[i]!.trim();
    if (!l) continue;
    if (/^tools:/.test(l)) {
      const m2 = line.match(/^\s*-\s*([\w.]*)$/);
      if (m2) {
        const prefix = m2[1]!;
        return {
          prefix,
          suggestions: ALLOWED_TOOLS.filter((t) => t.startsWith(prefix)),
        };
      }
      break;
    }
    if (/^\w+:/.test(l)) break;
  }
  return null;
}
