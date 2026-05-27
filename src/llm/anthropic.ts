/**
 * Anthropic Messages API adapter.
 * Docs: https://docs.anthropic.com/en/api/messages
 *
 * Notes:
 *   - Requires `anthropic-version` header. Pinned to '2023-06-01'.
 *   - System prompt is a top-level field, not a message.
 *   - Streaming: SSE with named events (message_start, content_block_delta, ...).
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

const API_VERSION = '2023-06-01';
const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic' as const;
  readonly model: string;
  private readonly key: string;
  private readonly endpoint: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(cfg: LLMConfig) {
    if (!cfg.api_key) throw new LLMError('Anthropic: api_key required', 'config');
    this.key = cfg.api_key;
    this.model = cfg.model || 'claude-sonnet-4-6';
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
    if (!r.ok) throw new LLMError(`anthropic ${r.status}: ${text.slice(0, 240)}`, 'http', r.status);
    let json: AnthropicResp;
    try { json = JSON.parse(text); }
    catch (e) { throw new LLMError(`parse: ${(e as Error).message}`, 'parse'); }
    const content = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return {
      content,
      usage: {
        tokens_in: json.usage?.input_tokens,
        tokens_out: json.usage?.output_tokens,
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
      throw new LLMError(`anthropic stream ${r.status}: ${text.slice(0, 240)}`, 'http', r.status);
    }
    for await (const ev of sseEvents(r.body)) {
      if (ev.event === 'content_block_delta') {
        try {
          const j = JSON.parse(ev.data) as AnthropicDeltaEvent;
          const delta = j.delta?.text;
          if (delta) yield delta;
        } catch { /* ignore one bad chunk */ }
      } else if (ev.event === 'message_stop') {
        return;
      }
    }
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.key,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  private buildBody(req: LLMRequest, stream: boolean): string {
    const system = req.messages.find((m) => m.role === 'system')?.content;
    const turns = req.messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const payload: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.max_tokens ?? this.maxTokens,
      temperature: req.temperature ?? this.temperature,
      messages: turns,
      stream,
    };
    if (system) payload.system = system;
    if (req.stop?.length) payload.stop_sequences = req.stop;
    return JSON.stringify(payload);
  }
}

// ----- Response shapes (subset) -----
interface AnthropicResp {
  model?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicDeltaEvent {
  delta?: { text?: string };
}
