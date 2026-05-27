import { describe, expect, it } from 'vitest';
import { highlight, completeAt } from '../src/sidepanel/components/skillHighlight';

describe('skillHighlight', () => {
  it('wraps frontmatter keys', () => {
    const src = `---
name: test
version: 1.0.0
---
`;
    const html = highlight(src);
    expect(html).toContain('class="t-fm-key">name<');
    expect(html).toContain('class="t-fm-key">version<');
    expect(html).toContain('class="t-fence">---<');
  });

  it('marks known tools vs unknown', () => {
    const src = '```call:db.query\nSELECT 1\n```\n```call:eval.evil\n\n```';
    const html = highlight(src);
    expect(html).toContain('class="t-tool">db.query<');
    expect(html).toContain('class="t-tool-bad">eval.evil<');
  });

  it('highlights {{ template }} tokens', () => {
    const src = 'val: "{{ inputs.x }}"';
    const html = highlight(src);
    expect(html).toContain('class="t-tpl">{{ inputs.x }}<');
  });

  it('highlights SQL keywords inside db.query block', () => {
    const src = '```call:db.query\nSELECT id FROM notes WHERE archived = 0\n```';
    const html = highlight(src);
    expect(html).toContain('class="t-sql-kw">SELECT<');
    expect(html).toContain('class="t-sql-kw">FROM<');
    expect(html).toContain('class="t-sql-kw">WHERE<');
  });
});

describe('completeAt', () => {
  it('suggests tools after ```call:', () => {
    const text = 'some body\n```call:db.';
    const r = completeAt(text, text.length);
    expect(r).not.toBeNull();
    expect(r!.prefix).toBe('db.');
    expect(r!.suggestions).toContain('db.query');
    expect(r!.suggestions).toContain('db.tag');
  });

  it('completes inside frontmatter tools list', () => {
    const text = `---
name: x
tools:
  - db.`;
    const r = completeAt(text, text.length);
    expect(r).not.toBeNull();
    expect(r!.suggestions).toContain('db.query');
  });

  it('returns null when caret not at a completion site', () => {
    const text = 'just some markdown\nhello';
    expect(completeAt(text, text.length)).toBeNull();
  });

  it('returns empty suggestions when prefix matches nothing', () => {
    const text = '```call:nope.';
    const r = completeAt(text, text.length);
    expect(r).not.toBeNull();
    expect(r!.suggestions).toEqual([]);
  });
});
