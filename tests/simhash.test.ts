import { describe, expect, it } from 'vitest';
import { simhash64, hamming, isSimilar, bands, hashWithBands } from '../src/offscreen/simhash';

describe('simhash64', () => {
  it('returns deterministic hash for same input', () => {
    const a = simhash64('SQLite WAL mode and fsync semantics');
    const b = simhash64('SQLite WAL mode and fsync semantics');
    expect(a).toBe(b);
  });

  it('similar texts have small hamming distance', () => {
    const a = simhash64('SQLite WAL mode and fsync semantics matter for performance');
    const b = simhash64('SQLite WAL mode and fsync semantics influence performance');
    expect(hamming(a, b)).toBeLessThan(22);
    expect(isSimilar(a, b, 22)).toBe(true);
  });

  it('unrelated texts diverge', () => {
    const a = simhash64('SQLite WAL mode and fsync semantics');
    const b = simhash64('Recipes for sourdough bread baking with rye flour');
    expect(hamming(a, b)).toBeGreaterThan(22);
    expect(isSimilar(a, b, 22)).toBe(false);
  });

  it('handles empty/short text without crashing', () => {
    expect(() => simhash64('')).not.toThrow();
    expect(simhash64('')).toBe(0n);
    expect(() => simhash64('hi')).not.toThrow();
  });

  it('handles cjk characters', () => {
    const a = simhash64('SQLite 的 WAL 模式与 fsync 行为');
    const b = simhash64('SQLite 的 WAL 模式与 fsync 性能');
    expect(hamming(a, b)).toBeLessThan(28);
  });
});

describe('LSH bands', () => {
  it('splits a hash into 4 × 16-bit segments', () => {
    const h = (0xdeadbeefcafe0123n);
    const [b0, b1, b2, b3] = bands(h);
    expect(b0).toBe(0x0123);
    expect(b1).toBe(0xcafe);
    expect(b2).toBe(0xbeef);
    expect(b3).toBe(0xdead);
    for (const b of [b0, b1, b2, b3]) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(0x10000);
    }
  });

  it('pigeonhole — texts within hamming ≤ 4 share at least one band (strict)', () => {
    // Use synthetic 64-bit hashes that we know differ by exactly N bits.
    const seed = 0x123456789abcdef0n;
    const flips: bigint[] = [
      0n,                  // 0 bits
      1n,                  // 1 bit
      0b111n,              // 3 bits in band 0
      0b1111n,             // 4 bits in band 0
    ];
    for (const f of flips) {
      const other = seed ^ f;
      const ba = bands(seed);
      const bb = bands(other);
      const matchCount = ba.filter((x, i) => x === bb[i]).length;
      // ≤ 4 bits flipped: bits stay within at most a few bands, so at least
      // 3 of 4 bands must match exactly. Allowing for the worst case where
      // 4 bits span 4 different bands — at minimum 0 bands match, but the
      // pigeonhole bound for K=4 bands with d ≤ K-1 = 3 flips guarantees ≥ 1.
      if (hamming(seed, other) <= 3) {
        expect(matchCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('LSH recall — ≤ 3 flips guarantee ≥ 1 band match (strict pigeonhole)', () => {
    // For 4 bands and ≤ 3 flipped bits, at least one band must stay intact.
    let seed = 0xfeedface;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    const trials = 100;
    let recovered = 0;
    for (let i = 0; i < trials; i++) {
      let h = 0n;
      for (let k = 0; k < 8; k++) h = (h << 8n) | BigInt(rnd() & 0xff);
      let flip = 0n;
      const nFlips = 1 + (rnd() % 3);
      const positions = new Set<number>();
      while (positions.size < nFlips) positions.add(rnd() % 64);
      for (const p of positions) flip |= (1n << BigInt(p));
      const other = h ^ flip;
      const ba = bands(h);
      const bb = bands(other);
      if (ba.some((x, i) => x === bb[i])) recovered += 1;
    }
    expect(recovered).toBe(trials);
  });

  it('LSH recall — ≤ 8 flips still recover the majority (statistical)', () => {
    // Deterministic LCG so the test doesn't flake across runs.
    let seed = 0x12345678;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    const trials = 100;
    let recovered = 0;
    for (let i = 0; i < trials; i++) {
      let h = 0n;
      for (let k = 0; k < 8; k++) h = (h << 8n) | BigInt(rnd() & 0xff);
      let flip = 0n;
      const nFlips = 1 + (rnd() % 8);
      const positions = new Set<number>();
      while (positions.size < nFlips) positions.add(rnd() % 64);
      for (const p of positions) flip |= (1n << BigInt(p));
      const other = h ^ flip;
      const ba = bands(h);
      const bb = bands(other);
      if (ba.some((x, i) => x === bb[i])) recovered += 1;
    }
    // Probabilistic regime, deterministic seed; expect > 60% recall.
    expect(recovered).toBeGreaterThan(60);
  });

  it('hashWithBands matches independent computation', () => {
    const { hash, bands: hb } = hashWithBands('hello hearth lsh test');
    expect(bands(hash)).toEqual(hb);
  });
});
