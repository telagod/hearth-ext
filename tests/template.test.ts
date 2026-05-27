import { describe, expect, it } from 'vitest';
import { render, evalExpr } from '../src/background/template';

describe('mini template engine', () => {
  it('substitutes simple expressions', () => {
    expect(render('Hello {{ inputs.name }}', { inputs: { name: 'World' } })).toBe('Hello World');
  });

  it('accesses nested paths', () => {
    expect(render('{{ steps[0].result[1].body }}', {
      steps: [{ result: [{ body: 'a' }, { body: 'b' }] }],
    })).toBe('b');
  });

  it('supports filter: length', () => {
    expect(render('{{ inputs.arr | length }}', { inputs: { arr: [1,2,3] } })).toBe('3');
  });

  it('supports filter: join', () => {
    expect(render('{{ inputs.arr | join(",") }}', { inputs: { arr: ['a','b','c'] } })).toBe('a,b,c');
  });

  it('supports filter: map(attribute)', () => {
    const out = render('{{ inputs.arr | map(attribute="id") | join("-") }}', {
      inputs: { arr: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    });
    expect(out).toBe('1-2-3');
  });

  it('supports for loops', () => {
    const tpl = '{% for x in inputs.arr %}<{{ x }}>{% endfor %}';
    expect(render(tpl, { inputs: { arr: ['a','b','c'] } })).toBe('<a><b><c>');
  });

  it('supports if/else', () => {
    expect(render('{% if inputs.n %}yes{% else %}no{% endif %}', { inputs: { n: 1 } })).toBe('yes');
    expect(render('{% if inputs.n %}yes{% else %}no{% endif %}', { inputs: { n: 0 } })).toBe('no');
  });

  it('evalExpr returns native value for pure {{ expr }} (not stringified)', () => {
    const v = evalExpr('inputs.arr | length', { inputs: { arr: [1,2,3] } });
    expect(v).toBe(3);
  });

  it('keeps text outside delimiters verbatim', () => {
    expect(render('Hi! {{ inputs.name }} — welcome.', { inputs: { name: 'Hearth' } }))
      .toBe('Hi! Hearth — welcome.');
  });
});
