import { useEffect, useMemo, useState } from 'react';
import { sendMsg } from '../api';
import { NoteCard } from '../components/NoteCard';
import { SearchBox } from '../components/SearchBox';
import { Icon } from '../components/Icon';
import { DropZone } from '../components/DropZone';
import { useT } from '../useT';
import type { Note, Source } from '@shared/types';

interface NoteRow extends Note {
  source_title?: string;
  site_name?: string;
  favicon?: string;
  source_uri?: string;
}

export function Library() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useEffect(() => {
    void load(q, tagFilter, setRows, setLoading);
  }, [q, tagFilter]);

  const grouped = useMemo(() => groupByDay(rows, t), [rows, t]);

  return (
    <div className="library">
      <SearchBox value={q} onChange={setQ} placeholder={t('library_search_ph')} />
      <DropZone onIngested={() => void load(q, tagFilter, setRows, setLoading)} />
      {tagFilter && (
        <div className="filter-row">
          <span>{t('library_filter_by_tag')}</span>
          <button className="pill pill-ember" onClick={() => setTagFilter(null)} type="button">
            <Icon name="tag" size={11} /> {tagFilter}
            <Icon name="cross" size={11} />
          </button>
        </div>
      )}
      {loading && <div className="empty">…</div>}
      {!loading && rows.length === 0 && (
        <div className="empty">
          <p style={{ fontSize: 14, marginBottom: 8 }}>{t('library_empty_title')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('library_empty_hint')}
          </p>
        </div>
      )}
      {grouped.map(([day, items]) => (
        <section key={day}>
          <h3 className="day-header">{day}</h3>
          {items.map((n) => (
            <NoteCard key={n.id} note={n} onTagClick={(tag) => setTagFilter(tag)} />
          ))}
        </section>
      ))}
    </div>
  );
}

async function load(
  q: string,
  tag: string | null,
  setRows: (r: NoteRow[]) => void,
  setLoading: (b: boolean) => void,
) {
  setLoading(true);
  try {
    let rows: NoteRow[];
    if (q.trim()) {
      const safe = q.trim().replace(/["'\\]/g, ' ').split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(' AND ');
      rows = await sendMsg<NoteRow[]>({
        type: 'db.query',
        sql: `SELECT n.id, n.body, n.body_plain, n.kind, n.color, n.starred, n.created_at,
                     s.title AS source_title, s.site_name, s.favicon, s.uri AS source_uri
              FROM notes_fts
              JOIN notes n ON n.id = notes_fts.rowid
              LEFT JOIN sources s ON s.id = n.source_id
              WHERE notes_fts MATCH ? AND n.archived = 0
              ORDER BY bm25(notes_fts)
              LIMIT 60`,
        params: [safe],
      });
    } else if (tag) {
      rows = await sendMsg<NoteRow[]>({
        type: 'db.query',
        sql: `SELECT n.id, n.body, n.body_plain, n.kind, n.color, n.starred, n.created_at,
                     s.title AS source_title, s.site_name, s.favicon, s.uri AS source_uri
              FROM notes n
              JOIN note_tags nt ON nt.note_id = n.id
              JOIN tags t ON t.id = nt.tag_id
              LEFT JOIN sources s ON s.id = n.source_id
              WHERE t.name = ? AND n.archived = 0
              ORDER BY n.created_at DESC
              LIMIT 60`,
        params: [tag],
      });
    } else {
      rows = await sendMsg<NoteRow[]>({
        type: 'db.query',
        sql: `SELECT n.id, n.body, n.body_plain, n.kind, n.color, n.starred, n.created_at,
                     s.title AS source_title, s.site_name, s.favicon, s.uri AS source_uri
              FROM notes n
              LEFT JOIN sources s ON s.id = n.source_id
              WHERE n.archived = 0
              ORDER BY n.created_at DESC
              LIMIT 60`,
      });
    }
    setRows(rows as NoteRow[]);
  } catch (e) {
    console.error('[hearth/library] load failed', e);
    setRows([]);
  } finally {
    setLoading(false);
  }
}

function groupByDay(rows: NoteRow[], t: (k: 'library_today' | 'library_yesterday') => string): Array<[string, NoteRow[]]> {
  const map = new Map<string, NoteRow[]>();
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  for (const r of rows) {
    const d = new Date(r.created_at * 1000); d.setHours(0,0,0,0);
    let label: string;
    if (d.getTime() === today.getTime()) label = t('library_today');
    else if (d.getTime() === yesterday.getTime()) label = t('library_yesterday');
    else label = d.toISOString().slice(0, 10);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(r);
  }
  return [...map.entries()];
}

function _suppressUnused(_x: Source) { return _x; }
