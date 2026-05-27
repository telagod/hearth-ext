/**
 * OpenAI Chat Completions adapter.
 * Docs: https://platform.openai.com/docs/api-reference/chat
 *
 * Also serves as the `custom` provider implementation — any OpenAI-compatible
 * endpoint (LM Studio, vLLM, Together, DeepSeek, Moonshot...) works here.
 */

import {
  LLMError,
  type LLMAdapter,
  type LLMConfig,
  type LLMRequest,
  type LLMResponse,
  utf8Bytes,
  sseEvents,
} from './adapter';

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = 'openai' as const;
  readonly model: string;
  private readonly key: string;
  private readonly endpoint: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(cfg: LLMConfig) {
    if (!cfg.api_key) throw new LLMError('OpenAI: api_key required', 'config');
    this.key = cfg.api_key;
    this.model = cfg.model || 'gpt-4o-mini';
    this.endpoint = cfg.endpoint || DEFAULT_ENDPOINT;
    this.maxTokens = cfg.max_tokens ?? 1024;
    this.temperature = cfg.temperature ?? 0.6;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const t0 = performance.now();
    const body = this.buildBody(req, false);
    const bytes_out = utf8Bytes(body);
    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body,
      signal: req.signal,
    });
    const text = await r.text();
    const bytes_in = utf8Bytes(text);
    if (!r.ok) throw new LLMError(`openai ${r.status}: ${text.slice(0, 240)}`, 'http', r.status);
    let json: OpenAIResp;
    try { json = JSON.parse(text); }
    catch (e) { throw new LLMError(`parse: ${(e as Error).message}`, 'parse'); }
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      content,
      usage: {
        tokens_in: json.usage?.prompt_tokens,
        tokens_out: json.usage?.completion_tokens,
        bytes_out,
        bytes_in,
      },
      model: json.model ?? this.model,
      provider: this.provider,
      ms: Math.round(performance.now() - t0),
    };
  }

  async *stream(req: LLMRequest): AsyncIterable<string> {
    const body = this.buildBody(req, true);
    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: { ...this.headers(), accept: 'text/event-stream' },
      body,
      signal: req.signal,
    });
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => '');
      throw new LLMError(`openai stream ${r.status}: ${text.slice(0, 240)}`, 'http', r.status);
    }
    for await (const ev of sseEvents(r.body)) {
      try {
        const j = JSON.parse(ev.data) as OpenAIChunk;
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip malformed chunk */ }
    }
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.key}`,
    };
  }

  private buildBody(req: LLMRequest, stream: boolean): string {
    const payload: Record<string, unknown> = {
      model: this.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.max_tokens ?? this.maxTokens,
      temperature: req.temperature ?? this.temperature,
      stream,
    };
    if (req.json) payload.response_format = { type: 'json_object' };
    if (req.stop?.length) payload.stop = req.stop;
    return JSON.stringify(payload);
  }
}

interface OpenAIResp {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}
