import { describe, expect, it } from 'vitest';
import { narrate, buildPrompt, bytesOf, type WarmthInput } from '../src/llm/warmth';

const sample: WarmthInput = {
  page_title: 'OPFS in modern Chromium',
  page_site: 'developer.chrome.com',
  user_lang: 'zh',
  candidates: [
    {
      title: 'WAL 模式下的 fsync 行为',
      excerpt: 'SQLite 在 WAL 下 fsync 行为非常关键。',
      user_annotation: 'fsync 才是真瓶颈',
      created_at: Math.floor(Date.now() / 1000) - 21 * 86400,
    },
  ],
};

describe('warmth prompt', () => {
  it('builds a system/user prompt with candidates', () => {
    const p = buildPrompt(sample);
    expect(p.system).toContain('Hearth');
    expect(p.user).toContain('OPFS in modern Chromium');
    expect(p.user).toContain('WAL 模式下的 fsync 行为');
    expect(p.user).toContain('fsync 才是真瓶颈');
  });

  it('bytesOf counts UTF-8 bytes', () => {
    const bytes = bytesOf(buildPrompt(sample));
    expect(bytes).toBeGreaterThan(100);
    expect(bytes).toBeLessThan(2000);
  });
});

describe('narrate (no LLM)', () => {
  it('falls back to deterministic ZH line when cfg is null', async () => {
    const r = await narrate(sample, null);
    expect(r.llm).toBeNull();
    expect(r.used).toBe(1);
    expect(r.narrative).toMatch(/相关|笔记/);
  });

  it('returns empty when no candidates', async () => {
    const r = await narrate({ ...sample, candidates: [] }, null);
    expect(r.narrative).toBe('');
    expect(r.used).toBe(0);
  });

  it('EN fallback', async () => {
    const r = await narrate({ ...sample, user_lang: 'en' }, null);
    expect(r.narrative).toMatch(/related notes/i);
  });
});
