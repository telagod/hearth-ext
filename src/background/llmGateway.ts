/**
 * LLM Gateway — single chokepoint for outbound model calls.
 *
 * Responsibilities:
 *   1. Resolve adapter from current settings (BYOK).
 *   2. Enforce consent (24h re-confirm window).
 *   3. Audit every call to llm_calls table (purpose, bytes, tokens, ok).
 *   4. Rate-limit: max 60 calls per provider per hour, hard.
 *
 * Lives in the service worker — content script and sidepanel both call here.
 */

import {
  createAdapter,
  type LLMAdapter,
  type LLMConfig,
  type LLMPurpose,
  type LLMRequest,
  type LLMResponse,
} from '@llm/adapter';
import { sendToOffscreen } from './offscreenBridge';
import { getSettings, hasFreshConsent, toLLMConfig } from '@shared/settings';

const RATE_LIMIT_PER_HOUR = 60;
const callTimes: number[] = []; // sliding window

let adapterCache: { key: string; adapter: LLMAdapter } | null = null;

export interface CallOptions {
  purpose: LLMPurpose;
  bypassConsent?: boolean;       // for local Ollama (off-machine privacy = N/A)
}

export interface CallResult {
  ok: boolean;
  response?: LLMResponse;
  error?: string;
  reason?: 'no-config' | 'no-consent' | 'rate-limit' | 'llm';
}

export async function llmComplete(req: LLMRequest, opts: CallOptions): Promise<CallResult> {
  const s = await getSettings();
  const cfg = toLLMConfig(s);
  if (!cfg) {
    return { ok: false, error: 'No LLM provider configured. Set BYOK in Settings.', reason: 'no-config' };
  }

  // Ollama is local — bypass consent gate by default.
  const local = cfg.provider === 'ollama';
  const consented = local || opts.bypassConsent || hasFreshConsent(s);
  if (!consented) {
    return { ok: false, error: 'Consent required for cloud LLM calls (24h window).', reason: 'no-consent' };
  }

  if (!checkRate()) {
    return { ok: false, error: `Rate limit: ${RATE_LIMIT_PER_HOUR} calls/hour exceeded`, reason: 'rate-limit' };
  }

  const adapter = await getAdapter(cfg);
  const t0 = Date.now();
  try {
    const resp = await adapter.complete(req);
    callTimes.push(t0);
    void auditCall(resp, opts.purpose, cfg, true);
    return { ok: true, response: resp };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void auditFailure(opts.purpose, cfg, msg, t0);
    return { ok: false, error: msg, reason: 'llm' };
  }
}

function checkRate(): boolean {
  const oneHourAgo = Date.now() - 3600_000;
  while (callTimes.length && callTimes[0]! < oneHourAgo) callTimes.shift();
  return callTimes.length < RATE_LIMIT_PER_HOUR;
}

async function getAdapter(cfg: LLMConfig): Promise<LLMAdapter> {
  const key = `${cfg.provider}::${cfg.model}::${cfg.endpoint ?? ''}::${cfg.api_key ?? ''}`;
  if (adapterCache && adapterCache.key === key) return adapterCache.adapter;
  const adapter = await createAdapter(cfg);
  adapterCache = { key, adapter };
  return adapter;
}

async function auditCall(
  resp: LLMResponse,
  purpose: LLMPurpose,
  cfg: LLMConfig,
  consent: boolean,
) {
  try {
    await sendToOffscreen({
      type: 'db.audit',
      channel: 'llm_calls',
      payload: {
        provider: resp.provider,
        model: resp.model,
        endpoint: cfg.endpoint ?? null,
        bytes_out: resp.usage.bytes_out,
        bytes_in: resp.usage.bytes_in,
        tokens_in: resp.usage.tokens_in ?? null,
        tokens_out: resp.usage.tokens_out ?? null,
        purpose,
        consent: consent ? 1 : 0,
        ok: 1,
        ms: resp.ms,
      },
    });
  } catch (e) {
    console.warn('[hearth/gateway] audit insert failed', e);
  }
}

async function auditFailure(
  purpose: LLMPurpose,
  cfg: LLMConfig,
  err: string,
  t0: number,
) {
  try {
    await sendToOffscreen({
      type: 'db.audit',
      channel: 'llm_calls',
      payload: {
        provider: cfg.provider,
        model: cfg.model,
        endpoint: cfg.endpoint ?? null,
        bytes_out: 0,
        bytes_in: 0,
        purpose,
        consent: 1,
        ok: 0,
        error: err.slice(0, 500),
        ms: Date.now() - t0,
      },
    });
  } catch { /* swallow */ }
}
