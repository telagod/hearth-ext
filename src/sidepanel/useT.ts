import { useEffect, useState } from 'react';
import { getLang, onLangChange, t, type Lang } from '@shared/i18n';
import type { StringKey } from '@shared/strings';

/**
 * React hook for the i18n layer.
 * Returns a stable `t()` and the current language; re-renders on language change.
 */
export function useT(): {
  t: (k: StringKey, vars?: Record<string, string | number>) => string;
  lang: Lang;
} {
  const [lang, setLang] = useState<Lang>(getLang());
  useEffect(() => onLangChange((l) => setLang(l)), []);
  return { t, lang };
}
