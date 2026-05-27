/**
 * Ollama adapter (local). Default endpoint: http://localhost:11434
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * Privacy note: Ollama runs entirely on user's machine. Still logged in
 * llm_calls for transparency, but `consent` flow can be skipped by upstream.
 */

import {
  LLMError,
  type LLMAdapter,
  type LLMConfig,
  type LLMRequest,
  type LLMResponse,
  utf8Bytes,
} from './adapter';

const DEFAULT_ENDPOINT = 'http://localhost:11434';

export class OllamaAdapter implements LLMAdapter {
  readonly provider = 'ollama' as const;
  readonly model: string;
  private readonly base: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(cfg: LLMConfig) {
    this.model = cfg.model || 'llama3.2';
    this.base = (cfg.endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
    this.maxTokens = cfg.max_tokens ?? 1024;
    this.temperature = cfg.temperature ?? 0.6;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const t0 = performance.now();
    const body = this.buildBody(req, false);
    const bytes_out = utf8Bytes(body);
    const r = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: req.signal,
    });
    const text = await r.text();
    const bytes_in = utf8Bytes(text);
    if (!r.ok) throw new LLMError(`ollama ${r.status}: ${text.slice(0, 240)}`, 'http', r.status);
    let json: OllamaResp;
    try { json = JSON.parse(text); }
    catch (e) { throw new LLMError(`parse: ${(e as Error).message}`, 'parse'); }
    const content = json.message?.content ?? '';
    return {
      content,
      usage: {
        tokens_in: json.prompt_eval_count,
        tokens_out: json.eval_count,
        bytes_out,
        bytes_in,
      },
      model: json.model ?? this.model,
      provider: this.provider,
      ms: Math.round(performance.now() - t0),
    };
  }

  /**
   * Ollama uses newline-delimited JSON (NDJSON), not SSE.
   * Each chunk has {message:{content:"..."}, done:false} until {done:true}.
   */
  async *stream(req: LLMRequest): AsyncIterable<string> {
    const body = this.buildBody(req, true);
    const r = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: req.signal,
    });
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => '');
      throw new LLMError(`ollama stream ${r.status}: ${text.slice(0, 240)}`, 'http', r.status);
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const j = JSON.parse(line) as OllamaChunk;
          if (j.message?.content) yield j.message.content;
          if (j.done) return;
        } catch { /* skip malformed line */ }
      }
    }
  }

  private buildBody(req: LLMRequest, stream: boolean): string {
    return JSON.stringify({
      model: this.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
      format: req.json ? 'json' : undefined,
      options: {
        temperature: req.temperature ?? this.temperature,
        num_predict: req.max_tokens ?? this.maxTokens,
        stop: req.stop,
      },
    });
  }
}

interface OllamaResp {
  model?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaChunk {
  message?: { content?: string };
  done?: boolean;
}
