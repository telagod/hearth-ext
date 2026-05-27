import { describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from '../src/llm/openai';
import { AnthropicAdapter } from '../src/llm/anthropic';
import { OllamaAdapter } from '../src/llm/ollama';
import { LLMError, sseEvents } from '../src/llm/adapter';

function mockFetch(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    body: null,
  } as unknown as Response);
}

describe('OpenAIAdapter.complete', () => {
  it('parses standard chat completion shape', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: 'hello world' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    try {
      const a = new OpenAIAdapter({ provider: 'openai', model: 'gpt-4o-mini', api_key: 'sk-x' });
      const r = await a.complete({ purpose: 'chat', messages: [{ role: 'user', content: 'hi' }] });
      expect(r.content).toBe('hello world');
      expect(r.usage.tokens_in).toBe(10);
      expect(r.usage.tokens_out).toBe(5);
      expect(r.usage.bytes_out).toBeGreaterThan(0);
      expect(r.usage.bytes_in).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('throws LLMError on 4xx', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch({ error: 'bad key' }, 401);
    try {
      const a = new OpenAIAdapter({ provider: 'openai', model: 'gpt-4o-mini', api_key: 'sk-x' });
      await expect(a.complete({ purpose: 'chat', messages: [{ role: 'user', content: 'hi' }] }))
        .rejects.toThrow(LLMError);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('rejects when api_key missing', () => {
    expect(() => new OpenAIAdapter({ provider: 'openai', model: 'gpt-4o' }))
      .toThrow(/api_key required/);
  });
});

describe('AnthropicAdapter.complete', () => {
  it('parses anthropic shape and joins text blocks', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch({
      model: 'claude-sonnet-4-6',
      content: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
        { type: 'tool_use' },
      ],
      usage: { input_tokens: 12, output_tokens: 3 },
    });
    try {
      const a = new AnthropicAdapter({ provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: 'sk-ant' });
      const r = await a.complete({ purpose: 'chat', messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ]});
      expect(r.content).toBe('hello world');
      expect(r.usage.tokens_in).toBe(12);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('OllamaAdapter.complete', () => {
  it('parses ollama chat shape', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch({
      model: 'llama3.2',
      message: { content: 'hi back' },
      prompt_eval_count: 4,
      eval_count: 2,
    });
    try {
      const a = new OllamaAdapter({ provider: 'ollama', model: 'llama3.2' });
      const r = await a.complete({ purpose: 'chat', messages: [{ role: 'user', content: 'hi' }] });
      expect(r.content).toBe('hi back');
      expect(r.usage.tokens_in).toBe(4);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('sseEvents parser', () => {
  it('parses well-formed SSE chunks', async () => {
    const body = `event: content_block_delta
data: {"delta":{"text":"hi "}}

event: content_block_delta
data: {"delta":{"text":"there"}}

event: message_stop
data: {}

`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const out: Array<{ event?: string; data: string }> = [];
    for await (const ev of sseEvents(stream)) out.push(ev);
    expect(out.length).toBe(3);
    expect(out[0]!.event).toBe('content_block_delta');
    expect(out[2]!.event).toBe('message_stop');
  });

  it('honors [DONE] sentinel', async () => {
    const body = `data: hello

data: [DONE]

`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const out: string[] = [];
    for await (const ev of sseEvents(stream)) out.push(ev.data);
    expect(out).toEqual(['hello']);
  });
});
