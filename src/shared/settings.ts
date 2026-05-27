/**
 * Settings store accessor for SW context.
 *
 * Settings live in chrome.storage.local under 'hearth/settings'.
 * The sidepanel writes them; SW / offscreen read them.
 */

import type { LLMConfig, LLMProvider } from '@llm/adapter';

export interface HearthSettings {
  provider: LLMProvider | 'none';
  api_key: string;
  model: string;
  endpoint: string;
  user_lang: 'zh' | 'en';
  recall_enabled: boolean;
  recall_threshold: number;
  warmth_narrate: boolean;
  clipboard_listen: boolean;
  /** Last consent grant time (epoch sec). Re-confirm after 24h. */
  consent_at?: number;
  /** Optional user-injected hosts beyond defaults. */
  extra_hosts?: string[];
}

export const DEFAULT_SETTINGS: HearthSettings = {
  provider: 'none',
  api_key: '',
  model: 'claude-sonnet-4-6',
  endpoint: '',
  user_lang: 'zh',
  recall_enabled: true,
  recall_threshold: 0.55,
  warmth_narrate: true,
  clipboard_listen: false,
};

const KEY = 'hearth/settings';

let cached: HearthSettings | null = null;
let watching = false;

export async function getSettings(): Promise<HearthSettings> {
  if (cached) return cached;
  const r = await chrome.storage.local.get([KEY]);
  const next: HearthSettings = { ...DEFAULT_SETTINGS, ...(r[KEY] ?? {}) };
  cached = next;
  if (!watching) startWatch();
  return next;
}

export async function setSettings(patch: Partial<HearthSettings>): Promise<HearthSettings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  cached = next;
  return next;
}

function startWatch() {
  if (watching) return;
  watching = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY]) cached = { ...DEFAULT_SETTINGS, ...(changes[KEY].newValue ?? {}) };
  });
}

/** Convert settings → LLM config, or null if user has not configured a provider. */
export function toLLMConfig(s: HearthSettings): LLMConfig | null {
  if (s.provider === 'none') return null;
  if (s.provider !== 'ollama' && !s.api_key) return null;
  return {
    provider: s.provider,
    model: s.model,
    api_key: s.api_key || undefined,
    endpoint: s.endpoint || undefined,
  };
}

/** Whether user has consented to outbound LLM calls in the last 24h. */
export function hasFreshConsent(s: HearthSettings, windowSec = 86400): boolean {
  if (!s.consent_at) return false;
  return Date.now() / 1000 - s.consent_at < windowSec;
}
