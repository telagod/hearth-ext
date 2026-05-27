import type { Note } from '@shared/types';

interface NoteRow extends Note {
  source_title?: string;
  site_name?: string;
  favicon?: string;
  source_uri?: string;
}

export function NoteCard({
  note,
  onTagClick,
}: {
  note: NoteRow;
  onTagClick?: (t: string) => void;
}) {
  const t = new Date(note.created_at * 1000);
  const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const body = note.body_plain ?? note.body;
  return (
    <article className="note glass-card" onClick={() => note.source_uri && window.open(note.source_uri, '_blank')}>
      <header className="head">
        {note.favicon ? (
          <img className="fav" src={note.favicon} alt="" />
        ) : (
          <span className="fav fav-placeholder" />
        )}
        <span className="site">{note.site_name ?? note.kind}</span>
        <span className="time">{time}</span>
      </header>
      <div className="body">
        <span className={`hl hl-${note.color}`}>{body.slice(0, 280)}</span>
        {body.length > 280 && '…'}
      </div>
      {/* tag click hook reserved for M2 */}
      <button hidden onClick={() => onTagClick?.('')} />
    </article>
  );
}
