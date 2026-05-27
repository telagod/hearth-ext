/**
 * LLM Adapter — unified interface for Anthropic / OpenAI / Ollama / custom HTTP.
 *
 * Privacy contract:
 *   1. Every call logs to llm_calls table (bytes, tokens, purpose, ok).
 *   2. Honors user consent (24h re-confirm window, enforced upstream).
 *   3. Sends only what the purpose declares (no full body leakage by accident).
 *
 * No vendor SDKs — raw fetch keeps the extension package light.
 */

export type LLMProvider = 'anthropic' | 'openai' | 'ollama' | 'custom';

export type LLMPurpose =
  | 'chat'
  | 'warmth'      // L2 recall narrative
  | 'tag-suggest'
  | 'summarize'
  | 'skill';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  endpoint?: string;     // custom / ollama
  api_key?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  purpose: LLMPurpose;
  messages: LLMMessage[];
  max_tokens?: number;
  temperature?: number;
  json?: boolean;        // ask provider to return JSON if supported
  stop?: string[];
  signal?: AbortSignal;
}

export interface LLMUsage {
  tokens_in?: number;
  tokens_out?: number;
  bytes_out: number;     // request body bytes
  bytes_in: number;      // response body bytes
}

export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;
  provider: LLMProvider;
  ms: number;
}

export interface LLMAdapter {
  readonly provider: LLMProvider;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
  /** Returns string deltas; throws if provider has no streaming. */
  stream(req: LLMRequest): AsyncIterable<string>;
}

// ----- Errors -----
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind: 'config' | 'http' | 'parse' | 'aborted' | 'unsupported',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// ----- Factory -----
export async function createAdapter(cfg: LLMConfig): Promise<LLMAdapter> {
  switch (cfg.provider) {
    case 'anthropic': {
      const { AnthropicAdapter } = await import('./anthropic');
      return new AnthropicAdapter(cfg);
    }
    case 'openai': {
      const { OpenAIAdapter } = await import('./openai');
      return new OpenAIAdapter(cfg);
    }
    case 'ollama': {
      const { OllamaAdapter } = await import('./ollama');
      return new OllamaAdapter(cfg);
    }
    case 'custom': {
      const { OpenAIAdapter } = await import('./openai');
      return new OpenAIAdapter({ ...cfg, provider: 'openai' });
    }
    default:
      throw new LLMError(`unknown provider: ${cfg.provider}`, 'config');
  }
}

// ----- Shared helpers -----
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Parse a Server-Sent-Events stream into discrete event objects.
 * Yields `{event, data}` where data is the raw string (caller decides JSON parse).
 */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event: string | undefined;
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (!line) continue;
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const data = dataLines.join('\n');
      if (data === '[DONE]') return;
      yield { event, data };
    }
  }
}
