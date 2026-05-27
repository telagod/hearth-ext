import { useEffect, useState } from 'react';
import { sendMsg } from '../api';
import { Icon } from '../components/Icon';
import { useT } from '../useT';
import type { IconName } from '@shared/icons';

interface InboxRow {
  id: number;
  kind: string;
  payload_json: string;
  status: string;
  created_at: number;
}

export function Inbox({ onChange }: { onChange?: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => { void load(setRows, setLoading); }, []);

  return (
    <div className="inbox">
      {loading && <div className="empty">{t('loading')}</div>}
      {!loading && rows.length === 0 && (
        <div className="empty">
          <p style={{ fontSize: 14 }}>{t('inbox_empty_title')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {t('inbox_empty_hint')}
          </p>
        </div>
      )}
      {rows.map((r) => {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(r.payload_json); } catch { /* */ }
        const isBusy = busy === r.id;
        const text = String(payload.text ?? payload.title ?? '(no preview)');
        return (
          <div key={r.id} className={`inbox-item${isBusy ? ' busy' : ''}`}>
            <span className="kind-pill">
              <Icon name={kindIcon(r.kind)} size={14} />
            </span>
            <div className="text">
              <div className="snippet">{text.slice(0, 140)}</div>
              <div className="meta">
                {String(payload.title ?? payload.url ?? '')} · {new Date(r.created_at * 1000).toLocaleString()}
              </div>
            </div>
            <div className="actions">
              <button className="iconbtn" disabled={isBusy} title={t('inbox_promote')}
                onClick={() => void accept(r, setBusy, setRows, onChange)}>
                <Icon name="check" size={13} />
              </button>
              <button className="iconbtn danger" disabled={isBusy} title={t('inbox_discard')}
                onClick={() => void discard(r, setBusy, setRows, onChange)}>
                <Icon name="cross" size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function kindIcon(kind: string): IconName {
  if (kind === 'clip') return 'clip';
  if (kind === 'read') return 'eye';
  if (kind === 'image') return 'image';
  if (kind === 'tab_close') return 'tab';
  return 'clip';
}

async function load(set: (r: InboxRow[]) => void, setLoading: (b: boolean) => void) {
  setLoading(true);
  try {
    const rows = await sendMsg<InboxRow[]>({
      type: 'db.query',
      sql: `SELECT id, kind, payload_json, status, created_at
            FROM inbox WHERE status = 'pending'
            ORDER BY created_at DESC LIMIT 50`,
    });
    set(rows);
  } catch (e) {
    console.error(e);
    set([]);
  } finally {
    setLoading(false);
  }
}

async function accept(
  r: InboxRow,
  setBusy: (id: number | null) => void,
  setRows: (r: InboxRow[]) => void,
  onChange?: () => void,
) {
  setBusy(r.id);
  try {
    await sendMsg({ type: 'db.mutate', op: 'inbox.promote', payload: { id: r.id } });
    await load(setRows, () => {});
    onChange?.();
  } catch (e) {
    alert(`入库失败：${(e as Error).message}`);
  } finally {
    setBusy(null);
  }
}

async function discard(
  r: InboxRow,
  setBusy: (id: number | null) => void,
  setRows: (r: InboxRow[]) => void,
  onChange?: () => void,
) {
  setBusy(r.id);
  try {
    await sendMsg({ type: 'db.mutate', op: 'inbox.discard', payload: { id: r.id } });
    await load(setRows, () => {});
    onChange?.();
  } catch (e) {
    alert(`丢弃失败：${(e as Error).message}`);
  } finally {
    setBusy(null);
  }
}