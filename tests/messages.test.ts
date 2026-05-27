import { describe, expect, it } from 'vitest';
import { Message, envelope } from '../src/shared/messages';

describe('Message zod schema', () => {
  it('accepts a valid capture.highlight', () => {
    const r = Message.safeParse({
      type: 'capture.highlight',
      text: 'hello',
      ctx: { url: 'https://example.com', title: 'Example' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects mutating db.query (UPDATE)', () => {
    const r = Message.safeParse({
      type: 'db.query',
      sql: "UPDATE notes SET archived = 1",
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty highlight text', () => {
    const r = Message.safeParse({
      type: 'capture.highlight',
      text: '',
      ctx: { url: 'https://example.com', title: '' },
    });
    expect(r.success).toBe(false);
  });

  it('envelope wraps payload', () => {
    const env = envelope('content', {
      type: 'capture.highlight',
      text: 'foo',
      ctx: { url: 'https://x.com', title: 't' },
    });
    expect(env.origin).toBe('content');
    expect(env.payload.type).toBe('capture.highlight');
    expect(env.id).toMatch(/^[0-9a-f-]+$/);
  });
});
