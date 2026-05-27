/**
 * Tiny i18n for Hearth.
 *
 * Why not chrome.i18n.getMessage()?
 *   - It only loads at extension boot (no live language switch)
 *   - JSON files live in _locales/ but cannot be parameterised easily
 *   - Hard to type-check keys
 *
 * Instead: keep both languages inline (small UI, ~80 keys), pick at boot
 * based on chrome.i18n.getUILanguage() or user override in settings.
 */

import { translations, type StringKey } from './strings';

export type Lang = 'zh' | 'en';

let current: Lang = detectInitial();

function detectInitial(): Lang {
  try {
    const ui = chrome.i18n?.getUILanguage?.() ?? navigator.language;
    return /^zh/i.test(ui) ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

const subs = new Set<(lang: Lang) => void>();

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  subs.forEach((f) => { try { f(lang); } catch { /* */ } });
}

export function getLang(): Lang { return current; }

export function onLangChange(fn: (lang: Lang) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/**
 * Translate a key with optional `{var}` interpolation.
 *
 *   t('saved')                        → 'Saved'
 *   t('searched_n', { n: 42 })        → '搜到 42 条' / 'Found 42 results'
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const dict = translations[current] ?? translations.zh;
  const fallback = translations.zh;
  let raw = dict[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      raw = raw.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return raw;
}

/** Pulls saved lang from chrome.storage and applies it. */
export async function loadLangFromSettings(): Promise<void> {
  try {
    const r = await chrome.storage.local.get(['hearth/settings']);
    const s = r['hearth/settings'] ?? {};
    if (s.user_lang === 'zh' || s.user_lang === 'en') setLang(s.user_lang);
  } catch { /* ignore */ }
}
