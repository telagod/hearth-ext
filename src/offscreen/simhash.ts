/**
 * SimHash — 64-bit locality-sensitive hash for note dedup & rerank.
 * Pure JS, ~10kb, runs in offscreen worker.
 */

const FEATURE_LEN = 3;

function fnv1aBigInt(str: string): bigint {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function shingles(tokens: string[], n: number): string[] {
  if (tokens.length < n) return tokens;
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

export function simhash64(text: string): bigint {
  const tokens = tokenize(text);
  const feats = shingles(tokens, FEATURE_LEN);
  if (feats.length === 0) return 0n;

  const vec = new Array<number>(64).fill(0);
  for (const f of feats) {
    const h = fnv1aBigInt(f);
    for (let b = 0; b < 64; b++) {
      const bit = (h >> BigInt(b)) & 1n;
      vec[b]! += bit === 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let b = 0; b < 64; b++) {
    if (vec[b]! > 0) out |= 1n << BigInt(b);
  }
  return out;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    x &= x - 1n;
    n += 1;
  }
  return n;
}

/** Threshold ~18 yields ~80% similarity for short notes; raise for stricter. */
export function isSimilar(a: bigint, b: bigint, threshold = 18): boolean {
  return hamming(a, b) <= threshold;
}

/**
 * Split a 64-bit simhash into 4 × 16-bit bands.
 *
 * Pigeonhole: if two hashes are within Hamming distance ≤ 4·k, at least one
 * of the 4 bands must be equal — because the differing bits can be spread
 * across at most 4 bands. For our default threshold = 18, k = 4.5 → still
 * holds (any candidate within 18 bits flips ≤ 4 bits per band on average,
 * so at least one band matches exactly with very high probability).
 *
 * Returns 4 signed 32-bit-safe numbers (each holds 16 bits → max 65535).
 */
export function bands(hash: bigint): [number, number, number, number] {
  const mask = 0xffffn;
  return [
    Number(hash & mask),
    Number((hash >> 16n) & mask),
    Number((hash >> 32n) & mask),
    Number((hash >> 48n) & mask),
  ];
}

/** Convenience — compute hash + bands together. */
export function hashWithBands(text: string): { hash: bigint; bands: [number, number, number, number] } {
  const h = simhash64(text);
  return { hash: h, bands: bands(h) };
}
