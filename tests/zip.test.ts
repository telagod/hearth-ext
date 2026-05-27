import { describe, expect, it } from 'vitest';
import { zipFiles } from '../src/offscreen/zip';

describe('zip writer', () => {
  function getU32LE(buf: Uint8Array, off: number): number {
    return buf[off]! | (buf[off+1]! << 8) | (buf[off+2]! << 16) | (buf[off+3]! << 24);
  }
  function getU16LE(buf: Uint8Array, off: number): number {
    return buf[off]! | (buf[off+1]! << 8);
  }

  it('produces a valid PK header and EOCD with file count', () => {
    const zip = zipFiles([
      { name: 'a.txt', data: 'hello' },
      { name: 'sub/b.md', data: '# title' },
    ]);
    // Local file header signature at offset 0
    expect(getU32LE(zip, 0)).toBe(0x04034b50);
    // EOCD trailer in last 22 bytes
    const eocdOff = zip.length - 22;
    expect(getU32LE(zip, eocdOff)).toBe(0x06054b50);
    expect(getU16LE(zip, eocdOff + 10)).toBe(2);   // total entries
  });

  it('stores arbitrary bytes (UTF-8 + binary mix)', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
    const zip = zipFiles([
      { name: '中文.txt', data: '你好 Hearth' },
      { name: 'img.bin', data: bytes },
    ]);
    // structurally valid
    expect(getU32LE(zip, 0)).toBe(0x04034b50);
    expect(getU32LE(zip, zip.length - 22)).toBe(0x06054b50);
  });

  it('handles empty file list (just EOCD)', () => {
    const zip = zipFiles([]);
    expect(zip.length).toBe(22);
    expect(getU32LE(zip, 0)).toBe(0x06054b50);
  });
});
