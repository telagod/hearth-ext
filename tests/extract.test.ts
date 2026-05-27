import { describe, expect, it } from 'vitest';
import { extract } from '../src/offscreen/extract';

describe('extract — text/md plain types (no heavy lib)', () => {
  it('reads plain .txt', async () => {
    const bytes = new TextEncoder().encode('hello\nworld');
    const d = await extract('hello.txt', bytes);
    expect(d.kind).toBe('text');
    expect(d.title).toBe('hello');
    expect(d.parts[0]!.text).toBe('hello\nworld');
  });

  it('reads .md as md kind', async () => {
    const bytes = new TextEncoder().encode('# title\ncontent');
    const d = await extract('note.md', bytes);
    expect(d.kind).toBe('md');
    expect(d.parts[0]!.text).toContain('title');
  });

  it('reads .csv as text', async () => {
    const bytes = new TextEncoder().encode('a,b\n1,2');
    const d = await extract('data.csv', bytes);
    expect(d.kind).toBe('text');
  });

  it('rejects unknown extension', async () => {
    await expect(extract('thing.xyz', new Uint8Array([1,2,3])))
      .rejects.toThrow(/Unsupported/);
  });
});
