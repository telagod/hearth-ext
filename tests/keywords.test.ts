import { describe, expect, it } from 'vitest';
import { extractKeywords, buildFtsMatch } from '../src/llm/keywords';

describe('extractKeywords', () => {
  it('extracts latin terms and drops stopwords', () => {
    const kw = extractKeywords(
      'The SQLite WAL mode and fsync semantics matter for performance under concurrent writes.',
      { k: 5 },
    );
    expect(kw).toContain('sqlite');
    expect(kw).toContain('wal');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('and');
    expect(kw.length).toBeLessThanOrEqual(5);
  });

  it('handles cjk via bigrams', () => {
    const kw = extractKeywords('SQLite 的 WAL 模式与 fsync 行为决定写入性能', { k: 8 });
    // expect some bigrams from cjk runs
    expect(kw.some((t) => /[一-鿿]/.test(t))).toBe(true);
  });

  it('dedupes near-substrings', () => {
    const kw = extractKeywords('sqlite sqlite-wasm sqlite wasm sqlite-wasm sqlite-wasm', { k: 5 });
    // should keep one canonical token, not all duplicates
    const lower = kw.map((k) => k.toLowerCase());
    const uniques = new Set(lower);
    expect(uniques.size).toBe(lower.length);
  });

  it('returns [] for empty', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords('   ')).toEqual([]);
  });
});

describe('buildFtsMatch', () => {
  it('joins safe tokens with OR', () => {
    expect(buildFtsMatch(['sqlite', 'wal', 'fsync'])).toBe('"sqlite" OR "wal" OR "fsync"');
  });
  it('strips quotes and backslashes from token bodies (FTS phrase quotes remain)', () => {
    const out = buildFtsMatch(['it"s', "a'b", 'c\\d']);
    // Each token body should be cleaned: no embedded quotes/backslashes inside
    const bodies = [...out.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
    expect(bodies.length).toBe(3);
    for (const b of bodies) {
      expect(b).not.toMatch(/["'\\]/);
    }
  });
  it('returns "" for empty', () => {
    expect(buildFtsMatch([])).toBe('');
    expect(buildFtsMatch(['a'])).toBe(''); // dropped because length < 2
  });
});
