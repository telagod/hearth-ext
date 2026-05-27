import { useEffect, useRef, useState } from 'react';
import { sendMsg } from '../api';
import { Icon } from '../components/Icon';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  error?: string;
}

interface NoteRef { id: number; title: string; }

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [contextRefs, setContextRefs] = useState<NoteRef[]>([]);
  const [provider, setProvider] = useState<string>('none');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get(['hearth/settings'], (r) => {
      setProvider(r['hearth/settings']?.provider ?? 'none');
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (provider === 'none') {
      setMessages((m) => [...m, {
        id: crypto.randomUUID(), role: 'assistant',
        content: '请先在「设置」里配置 LLM 提供商（Anthropic / OpenAI / Ollama）。',
        error: 'no-config',
      }]);
      setInput('');
      return;
    }

    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text };
    const placeholder: Msg = { id: crypto.randomUUID(), role: 'assistant', content: '', pending: true };
    setMessages((m) => [...m, userMsg, placeholder]);
    setInput('');
    setSending(true);

    try {
      const ctxBlock = await buildContextBlock(contextRefs);
      const sysPrompt = await buildSystemPrompt();
      const fullMessages = [
        { role: 'system' as const, content: sysPrompt },
        ...(ctxBlock ? [{ role: 'user' as const, content: ctxBlock }] : []),
        ...[...messages, userMsg]
          .filter((m) => !m.pending && !m.error)
          .map((m) => ({ role: m.role, content: m.content })),
      ];

      await new Promise<void>((resolve) => {
        const port = chrome.runtime.connect({ name: 'hearth/llm-stream' });
        let assembled = '';
        let done = false;
        const finish = (errorMsg?: string, reason?: string) => {
          if (done) return;
          done = true;
          setMessages((m) => m.map((x) => x.id === placeholder.id ? {
            ...x,
            pending: false,
            content: errorMsg ?? assembled,
            error: errorMsg ? (reason ?? 'stream-error') : undefined,
          } : x));
          try { port.disconnect(); } catch { /* */ }
          resolve();
        };
        port.onMessage.addListener((m: { type: string; delta?: string; error?: string; reason?: string }) => {
          if (m.type === 'stream.delta' && m.delta) {
            assembled += m.delta;
            setMessages((arr) => arr.map((x) => x.id === placeholder.id
              ? { ...x, content: assembled, pending: false }
              : x));
          } else if (m.type === 'stream.done') {
            finish();
          } else if (m.type === 'stream.error') {
            const reason = m.reason ?? 'stream-error';
            const friendly = reason === 'no-consent'
              ? '需要先确认一次「外部 LLM 调用」（24 小时一次）。点 Settings → 隐私 → 我同意。'
              : (m.error ?? '流式响应失败');
            finish(friendly, reason);
          }
        });
        port.onDisconnect.addListener(() => {
          if (!done) finish(assembled ? undefined : '连接已断开', 'disconnected');
        });
        port.postMessage({
          payload: {
            type: 'llm.complete',
            purpose: 'chat',
            messages: fullMessages,
            max_tokens: 1024,
            temperature: 0.7,
          },
        });
      });
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e);
      setMessages((m) => m.map((x) => x.id === placeholder.id ? {
        ...x, pending: false, error: 'exception', content: errText,
      } : x));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      {messages.length === 0 ? (
        <div className="empty chat-empty">
          <span className="chat-empty-glyph" aria-hidden>
            <Icon name="brand" size={28} />
          </span>
          <p style={{ fontSize: 14, marginTop: 8 }}>围炉而坐，问点什么吧。</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            它会以你库内笔记为上下文，引用你自己说过的话。
          </p>
          {provider === 'none' && (
            <p className="chat-warn">
              <Icon name="leaf" size={12} /> 还没配 LLM — 去 Settings 接一家。
            </p>
          )}
        </div>
      ) : (
        <div className="chat-scroll" ref={scrollRef}>
          {messages.map((m) => (
            <div key={m.id} className={`msg msg-${m.role}${m.pending ? ' pending' : ''}${m.error ? ' err' : ''}`}>
              <div className="avatar">
                {m.role === 'assistant'
                  ? <Icon name="brand" size={14} />
                  : <span className="avatar-you">你</span>}
              </div>
              <div className="bubble">
                {m.pending && !m.content ? (
                  <span className="dots-pending"><span></span><span></span><span></span></span>
                ) : (
                  <span className="bubble-text">{m.content}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="chat-context-row">
        {contextRefs.map((c) => (
          <span key={c.id} className="pill pill-ember">
            <Icon name="thread" size={10} /> {c.title.slice(0, 24)}
            <button className="pill-x" onClick={() => setContextRefs((r) => r.filter((x) => x.id !== c.id))}>
              <Icon name="cross" size={10} />
            </button>
          </span>
        ))}
        <button className="add-ctx" onClick={() => void pickContext(setContextRefs)}>
          <Icon name="thread" size={11} /> 加笔记上下文
        </button>
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={provider === 'none' ? '请先在 Settings 配置 LLM …' : '继续问，或拖一段笔记进来…'}
          disabled={sending}
          rows={2}
        />
        <button
          className="send"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          title="Send (Enter)"
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
               strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12 L19 12 M13 6 L19 12 L13 18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

async function buildContextBlock(refs: NoteRef[]): Promise<string | null> {
  if (refs.length === 0) return null;
  const ids = refs.map((r) => r.id).join(',');
  try {
    const rows = await sendMsg<Array<{ body: string; site_name: string | null; created_at: number; title: string | null }>>({
      type: 'db.query',
      sql: `SELECT n.body, s.site_name, n.created_at, s.title
            FROM notes n LEFT JOIN sources s ON s.id = n.source_id
            WHERE n.id IN (${ids})`,
    });
    const lines: string[] = ['【你的相关笔记】'];
    rows.forEach((r, i) => {
      const date = new Date(r.created_at * 1000).toISOString().slice(0, 10);
      lines.push(`${i + 1}. [${date}] ${r.title ?? r.site_name ?? ''} — ${r.body.slice(0, 400)}`);
    });
    return lines.join('\n');
  } catch {
    return null;
  }
}

async function buildSystemPrompt(): Promise<string> {
  return [
    '你是 Hearth，用户的本地知识管家。',
    '- 优先引用用户的笔记（如果上下文中有）。引用时用 「」 包住。',
    '- 不要泛泛而谈，直接给观点。',
    '- 不要恭维，不要"很好的问题"开头。',
    '- 用户用中文你就用中文，用户用英文你就用英文。',
  ].join('\n');
}

async function pickContext(set: (r: (cur: NoteRef[]) => NoteRef[]) => void) {
  // M2 stub — open a tiny picker prompt for now; M3 = full search modal.
  try {
    const rows = await sendMsg<Array<{ id: number; title: string | null; body_plain: string | null }>>({
      type: 'db.query',
      sql: `SELECT n.id, s.title, n.body_plain
            FROM notes n LEFT JOIN sources s ON s.id = n.source_id
            WHERE n.archived = 0
            ORDER BY n.starred DESC, n.created_at DESC LIMIT 5`,
    });
    if (rows.length === 0) {
      alert('库里还没有笔记可作上下文。');
      return;
    }
    const choice = prompt(
      '选一段笔记作上下文（输入序号）：\n' +
      rows.map((r, i) => `${i + 1}. ${(r.title ?? r.body_plain ?? '').slice(0, 50)}`).join('\n'),
      '1',
    );
    const idx = Number(choice) - 1;
    const pick = rows[idx];
    if (pick) {
      set((cur) => {
        if (cur.find((c) => c.id === pick.id)) return cur;
        return [...cur, { id: pick.id, title: pick.title ?? pick.body_plain?.slice(0, 30) ?? `note ${pick.id}` }];
      });
    }
  } catch (e) {
    console.warn('[hearth/chat] pickContext', e);
  }
}