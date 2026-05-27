/**
 * Lightweight keyword extraction — no model, no deps.
 *
 * Strategy:
 *   1. Tokenize (latin words + CJK 2-4grams).
 *   2. Strip common stopwords (EN + ZH).
 *   3. Score by frequency × position bonus (early-document terms weigh more).
 *   4. Return top-N unique.
 *
 * This is intentionally simple. Replace with TF-IDF against the user's corpus
 * later if recall precision suffers.
 */

const STOPWORDS_EN = new Set([
  'the','a','an','and','or','but','if','then','else','of','to','in','on','at','by','for','with','without',
  'is','are','was','were','be','been','being','do','does','did','have','has','had','will','would','can','could',
  'should','may','might','must','this','that','these','those','it','its','as','from','about','into','also',
  'than','so','such','too','very','more','most','some','any','all','each','one','two','three','no','not','yes',
  'i','you','he','she','we','they','them','his','her','their','our','your','my','me','us','him',
  'we','our','ours','your','yours','their','theirs',
]);

const STOPWORDS_ZH = new Set([
  '的','了','在','是','我','有','和','就','不','人','都','一','一个','上','也','很','到','说','要','去',
  '你','会','着','没有','看','好','自己','这','那','里','就是','还','把','被','让','给','向','从','为',
  '可以','所以','因为','但是','如果','虽然','然后','或者','并且','以及','以为','但','与','及','或',
  '什么','怎么','为什么','哪里','谁','哪个','几','多少',
]);

function tokenizeLatin(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[a-z][a-z0-9'-]{2,}/g)).map((m) => m[0]);
}

function tokenizeCJK(text: string): string[] {
  const out: string[] = [];
  const seq = text.match(/[一-鿿々〆〤]+/g) ?? [];
  for (const run of seq) {
    if (run.length < 2) continue;
    // 2-gram (most informative) and 3-gram (helps multi-char terms)
    for (let i = 0; i < run.length - 1; i++) {
      out.push(run.slice(i, i + 2));
      if (i < run.length - 2) out.push(run.slice(i, i + 3));
    }
  }
  return out;
}

export interface ExtractOptions {
  /** Max number of keywords to return. */
  k?: number;
  /** If true, drop tokens that look like dates, numbers, or single chars. */
  filterNoise?: boolean;
}

export function extractKeywords(text: string, opts: ExtractOptions = {}): string[] {
  const { k = 8, filterNoise = true } = opts;
  if (!text) return [];

  const latin = tokenizeLatin(text);
  const cjk = tokenizeCJK(text);

  // Score: frequency × (1 + 0.5 × position_bonus where earlier = better)
  const counts = new Map<string, { c: number; firstPos: number }>();
  const all = [...latin, ...cjk];
  all.forEach((tok, i) => {
    if (STOPWORDS_EN.has(tok) || STOPWORDS_ZH.has(tok)) return;
    if (filterNoise) {
      if (/^\d+$/.test(tok)) return;
      if (tok.length < 2) return;
    }
    const cur = counts.get(tok);
    if (cur) cur.c += 1;
    else counts.set(tok, { c: 1, firstPos: i });
  });

  const scored = [...counts.entries()].map(([tok, v]) => ({
    tok,
    score: v.c + (1 - v.firstPos / Math.max(1, all.length)) * 0.5,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Dedupe near-substrings: if "sqlite wal" already picked, drop "sqlite" alone
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { tok } of scored) {
    const lower = tok.toLowerCase();
    if (seen.has(lower)) continue;
    if (out.some((p) => p.includes(lower) || lower.includes(p))) continue;
    out.push(tok);
    seen.add(lower);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Build an FTS5 MATCH expression from extracted keywords.
 * Uses OR with phrase quoting so each token is matched verbatim.
 */
export function buildFtsMatch(keywords: string[]): string {
  const safe = keywords
    .map((k) => k.replace(/["'\\]/g, ''))
    .filter((k) => k.length >= 2);
  if (safe.length === 0) return '';
  return safe.map((k) => `"${k}"`).join(' OR ');
}
