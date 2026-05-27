import { useEffect, useState } from 'react';
import { sendMsg } from '../api';
import { Icon } from '../components/Icon';
import { useT } from '../useT';
import { setLang } from '@shared/i18n';
import { DEFAULT_SETTINGS, type HearthSettings } from '@shared/settings';

interface LLMCallRow {
  id: number;
  provider: string;
  model: string;
  purpose: string;
  bytes_out: number;
  bytes_in: number;
  tokens_in: number | null;
  tokens_out: number | null;
  ok: number;
  ms: number;
  created_at: number;
}

const KEY = 'hearth/settings';

const PROVIDER_PRESETS: Record<string, { models: string[]; endpoint?: string }> = {
  anthropic: { models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'] },
  openai:    { models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
  ollama:    { models: ['llama3.2', 'qwen2.5', 'gemma2'], endpoint: 'http://localhost:11434' },
  custom:    { models: [''] },
  none:      { models: [] },
};

export function Settings() {
  const { t, lang } = useT();
  const [s, setS] = useState<HearthSettings>(DEFAULT_SETTINGS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [calls, setCalls] = useState<LLMCallRow[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    chrome.storage.local.get([KEY], (r) => {
      if (r[KEY]) setS({ ...DEFAULT_SETTINGS, ...r[KEY] });
    });
    void loadCalls(setCalls, setLoadingCalls);
  }, []);

  const save = () => {
    chrome.storage.local.set({ [KEY]: s }, () => {
      setSavedAt(Date.now());
      setLang(s.user_lang);  // apply immediately
    });
  };

  const grantConsent = async () => {
    try {
      const r = await sendMsg<{ ok: boolean; consent_at: number }>({ type: 'consent.grant' });
      if (r.ok) {
        setS({ ...s, consent_at: r.consent_at });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const revokeConsent = () => {
    setS({ ...s, consent_at: undefined });
    chrome.storage.local.set({ [KEY]: { ...s, consent_at: undefined } });
  };

  const exportAll = async (format: 'zip' | 'obsidian' | 'json') => {
    try {
      const r = await sendMsg<{ filename: string; mime: string; b64: string; bytes: number }>({
        type: 'settings.export',
        format,
      });
      // Decode base64 → Blob → object URL → chrome.downloads
      const bin = atob(r.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: r.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(`导出失败：${(e as Error).message}`);
    }
  };

  const consentFresh = !!(s.consent_at && Date.now() / 1000 - s.consent_at < 86400);

  return (
    <div className="settings">

      <section className="glass-card setting-section">
        <h3 className="setting-title">LLM 提供商</h3>
        <p className="hint">所有外部调用都需要你 BYO API key — Hearth 不持有任何凭据。</p>
        <div className="setting-grid">
          <label className="field">
            <span>Provider</span>
            <select value={s.provider} onChange={(e) => {
              const p = e.target.value as HearthSettings['provider'];
              const preset = PROVIDER_PRESETS[p];
              setS({
                ...s,
                provider: p,
                model: preset?.models[0] ?? s.model,
                endpoint: preset?.endpoint ?? s.endpoint,
              });
            }}>
              <option value="none">不启用 (纯本地)</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (本地)</option>
              <option value="custom">Custom (OpenAI compatible)</option>
            </select>
          </label>

          {s.provider !== 'none' && s.provider !== 'ollama' && (
            <label className="field">
              <span>API Key</span>
              <input type="password" value={s.api_key}
                onChange={(e) => setS({ ...s, api_key: e.target.value })}
                placeholder="sk-..." />
            </label>
          )}

          {s.provider !== 'none' && (
            <label className="field">
              <span>Model</span>
              <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}
                list="hearth-models" />
              <datalist id="hearth-models">
                {(PROVIDER_PRESETS[s.provider]?.models ?? []).map((m) => <option key={m} value={m} />)}
              </datalist>
            </label>
          )}

          {(s.provider === 'ollama' || s.provider === 'custom') && (
            <label className="field">
              <span>Endpoint</span>
              <input value={s.endpoint}
                onChange={(e) => setS({ ...s, endpoint: e.target.value })}
                placeholder={s.provider === 'ollama' ? 'http://localhost:11434' : 'https://...'} />
            </label>
          )}
        </div>
      </section>

      <section className="glass-card setting-section">
        <h3 className="setting-title">
          <Icon name="shield" size={14} /> 隐私与同意
        </h3>
        <p className="hint">
          云端 LLM 调用需要你 24 小时内点过一次「同意」。本地 Ollama 不需要。
        </p>
        <div className="consent-row">
          <span className={`consent-pill ${consentFresh ? 'ok' : 'stale'}`}>
            {consentFresh
              ? <><Icon name="check" size={11}/> 同意有效 · {Math.round((86400 - (Date.now()/1000 - (s.consent_at ?? 0))) / 3600)}h 后过期</>
              : <><Icon name="cross" size={11}/> 未同意 / 已过期</>}
          </span>
          {consentFresh
            ? <button className="btn" onClick={revokeConsent}>撤销</button>
            : <button className="btn btn-ember" onClick={() => void grantConsent()}>我同意 (24h)</button>}
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={s.recall_enabled}
            onChange={(e) => setS({ ...s, recall_enabled: e.target.checked })}/>
          <span>启用反向召回小球（L2，浏览页面时若命中则浮现）</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={s.warmth_narrate}
            onChange={(e) => setS({ ...s, warmth_narrate: e.target.checked })}/>
          <span>用 LLM 写温度旁白（关闭则用纯统计句子）</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={s.clipboard_listen}
            onChange={(e) => setS({ ...s, clipboard_listen: e.target.checked })}/>
          <span>监听剪贴板复制（L0 候选）</span>
        </label>
      </section>

      <section className="glass-card setting-section">
        <h3 className="setting-title">过去 7 天云端调用</h3>
        <p className="hint">每一次外部调用都被本地审计。这里看得见。</p>
        {loadingCalls ? (
          <div className="empty">加载中…</div>
        ) : calls.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>过去 7 天没有任何云端调用。</div>
        ) : (
          <table className="ledger">
            <thead>
              <tr><th>时间</th><th>用途</th><th>提供商</th><th>↑</th><th>↓</th><th>ms</th></tr>
            </thead>
            <tbody>
              {calls.slice(0, 20).map((c) => (
                <tr key={c.id} className={c.ok ? '' : 'failed'}>
                  <td>{relTime(c.created_at)}</td>
                  <td><span className="pill">{c.purpose}</span></td>
                  <td className="provider">{c.provider} · {c.model}</td>
                  <td>{fmtBytes(c.bytes_out)}</td>
                  <td>{fmtBytes(c.bytes_in)}</td>
                  <td className="ms">{c.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="glass-card setting-section">
        <h3 className="setting-title">数据</h3>
        <p className="hint">
          所有数据存在本机 OPFS — 完整库可一键导出，永远不离开你这台设备。
        </p>
        <div className="export-row">
          <button className="btn" onClick={() => void exportAll('zip')}>
            <Icon name="archive" size={12} /> 完整 ZIP
          </button>
          <button className="btn" onClick={() => void exportAll('obsidian')}>
            <Icon name="leaf" size={12} /> Obsidian Vault
          </button>
          <button className="btn" onClick={() => void exportAll('json')}>
            <Icon name="thread" size={12} /> JSON 单文件
          </button>
        </div>
      </section>

      <div className="setting-actions">
        <button className="btn btn-ember" onClick={save}>保存设置</button>
        {savedAt && (
          <span style={{ marginLeft: 12, color: 'var(--moss-400)', fontSize: 12 }}>
            已保存 · {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

async function loadCalls(set: (c: LLMCallRow[]) => void, setLoading: (b: boolean) => void) {
  setLoading(true);
  try {
    const rows = await sendMsg<LLMCallRow[]>({
      type: 'db.query',
      sql: `SELECT id, provider, model, purpose, bytes_out, bytes_in, tokens_in, tokens_out, ok, ms, created_at
            FROM llm_calls
            WHERE created_at > strftime('%s','now') - 7 * 86400
            ORDER BY created_at DESC LIMIT 50`,
    });
    set(rows);
  } catch {
    set([]);
  } finally {
    setLoading(false);
  }
}

function fmtBytes(n: number): string {
  if (!n) return '0';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

function relTime(ts: number): string {
  const sec = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}