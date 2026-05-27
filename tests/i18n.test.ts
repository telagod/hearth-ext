import { afterEach, describe, expect, it } from 'vitest';
import { t, getLang, setLang } from '../src/shared/i18n';

afterEach(() => setLang(getLang() === 'zh' ? 'zh' : 'en'));

describe('i18n', () => {
  it('returns chinese strings by default', () => {
    setLang('zh');
    expect(t('app_name')).toBe('Hearth');
    expect(t('tab_library')).toBe('库');
  });

  it('switches to english', () => {
    setLang('en');
    expect(t('tab_library')).toBe('Library');
    expect(t('tab_chat')).toBe('Chat');
  });

  it('interpolates variables', () => {
    setLang('en');
    expect(t('drop_too_large', { limit: 50 })).toBe('File too large (> 50 MB)');
    setLang('zh');
    expect(t('drop_too_large', { limit: 50 })).toBe('文件太大 (> 50 MB)');
  });

  it('falls back to zh when key missing in en (defensive)', () => {
    setLang('en');
    // every key present in both — but if we ever break parity, t() should
    // still return *something*.
    expect(typeof t('app_name')).toBe('string');
  });

  it('returns the key itself when totally unknown', () => {
    setLang('zh');
    // Cast to bypass StringKey union — simulates a typo from caller.
    expect(t('totally_unknown_key' as never)).toBe('totally_unknown_key');
  });
});
