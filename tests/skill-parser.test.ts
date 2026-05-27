import { describe, expect, it } from 'vitest';
import { parseSkill } from '../src/background/skillRunner';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixtures = ['weekly-review', 'tag-suggest', 'inbox-tidy', 'link-similar', 'monthly-purge'];

describe('parseSkill', () => {
  for (const name of fixtures) {
    it(`parses bundled skill: ${name}`, () => {
      const md = readFileSync(resolve(__dirname, '..', 'skills_examples', `${name}.md`), 'utf-8');
      const parsed = parseSkill(md);
      expect(parsed.manifest.name).toBe(name);
      expect(parsed.manifest.tools.length).toBeGreaterThan(0);
      expect(parsed.steps.length).toBeGreaterThan(0);
    });
  }

  it('rejects unknown tool', () => {
    const md = `---
name: bad-skill
version: 1.0.0
description: tries to use a forbidden tool
trigger: { type: manual }
tools: [eval.dangerous]
permissions: { llm: none, network: none, storage: required }
---

# bad
`;
    expect(() => parseSkill(md)).toThrow(/whitelist/);
  });

  it('rejects invalid name slug', () => {
    const md = `---
name: BAD NAME
version: 1.0.0
description: bad slug
trigger: { type: manual }
tools: []
permissions: { llm: none, network: none, storage: required }
---
`;
    expect(() => parseSkill(md)).toThrow();
  });
});
