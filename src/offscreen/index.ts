/**
 * Offscreen document entry — owns the SQLite WASM database.
 *
 * SW cannot persist OPFS handles across restarts, but offscreen documents can.
 * All db operations are funneled through chrome.runtime.onMessage.
 */

import { initDb, query, exec, transaction, type DbHandle } from './db';
import { simhash64, hamming, bands as simhashBands } from './simhash';
import { extractKeywords, buildFtsMatch } from '../llm/keywords';
import { exportAll } from './export';
import { extract, type ExtractedDoc } from './extract';

let dbReady: Promise<DbHandle> | null = null;

function getDb(): Promise<DbHandle> {
  if (!dbReady) dbReady = initDb();
  return dbReady;
}

// Boot immediately so SW can talk to us right after createDocument.
getDb().then(
  (h) => console.log('[hearth/offscreen] db ready, schema_version =', h.schemaVersion),
  (e) => console.error('[hearth/offscreen] db init failed', e),
);

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const env = raw as { payload?: { type?: string } };
  const msg = env?.payload;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    sendResponse({ ok: false, error: 'bad envelope' });
    return false;
  }
  // Route db.* and capture.* here. Other types ignored.
  if (
    !msg.type ||
    !(
      msg.type.startsWith('db.') ||
      msg.type.startsWith('capture.') ||
      msg.type === 'settings.export' ||
      msg.type === 'recall.probe' ||
      msg.type === 'extract.file'
    )
  ) {
    return false; // let other listeners handle it
  }
  handle(msg as Record<string, unknown>).then(
    (result) => sendResponse({ ok: true, result }),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[hearth/offscreen] handler failed', msg.type, err);
      sendResponse({ ok: false, error: message });
    },
  );
  return true; // async
});

async function handle(msg: Record<string, unknown>): Promise<unknown> {
  const db = await getDb();
  switch (msg.type) {
    case 'db.query': {
      const sql = String(msg.sql ?? '');
      const params = (msg.params as unknown[]) ?? [];
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error('only SELECT allowed via db.query');
      return query(db, sql, params);
    }

    case 'db.audit': {
      const channel = String(msg.channel ?? '');
      const payload = (msg.payload ?? {}) as Record<string, unknown>;
      return auditInsert(db, channel, payload);
    }

    case 'db.mutate': {
      const op = String(msg.op ?? '');
      const payload = (msg.payload ?? {}) as Record<string, unknown>;
      return mutate(db, op, payload);
    }

    case 'capture.highlight': {
      const text = String(msg.text ?? '').trim();
      if (!text) throw new Error('empty text');
      const ctx = (msg.ctx ?? {}) as Record<string, string | undefined>;
      const color = String(msg.color ?? 'amber');
      const annotation = msg.annotation as string | undefined;

      return transaction(db, () => {
        const sourceId = upsertSource(db, ctx);
        const hash = simhash64(text);
        const [b0, b1, b2, b3] = simhashBands(hash);
        const bodyMd = annotation
          ? `> ${text.replace(/\n/g, '\n> ')}\n\n${annotation}`
          : text;

        exec(
          db,
          `INSERT INTO notes (source_id, kind, body, body_plain, context_before, context_after, color, simhash, simhash_b0, simhash_b1, simhash_b2, simhash_b3)
           VALUES (?, 'highlight', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sourceId,
            bodyMd,
            text,
            ctx.context_before ?? null,
            ctx.context_after ?? null,
            color,
            String(hash),
            b0, b1, b2, b3,
          ],
        );
        const noteId = lastInsertRowId(db);
        return { noteId, sourceId };
      });
    }

    case 'capture.inbox': {
      const kind = String(msg.kind ?? 'clip');
      const payload = JSON.stringify(msg.payload ?? {});
      const ttl = Math.floor(Date.now() / 1000) + 72 * 3600;
      exec(
        db,
        `INSERT INTO inbox (kind, payload_json, ttl_at) VALUES (?, ?, ?)`,
        [kind, payload, ttl],
      );
      return { id: lastInsertRowId(db) };
    }

    case 'recall.probe': {
      const title = String(msg.title ?? '');
      const snippet = String(msg.snippet ?? '');
      return recallProbe(db, title, snippet);
    }

    case 'settings.export': {
      const format = (msg.format as 'zip' | 'obsidian' | 'json') ?? 'zip';
      return exportAll(db, format);
    }

    case 'extract.file': {
      const filename = String(msg.filename ?? 'file');
      const b64 = String(msg.bytes_b64 ?? '');
      const jobId = String(msg.job_id ?? crypto.randomUUID());
      const promote = msg.promote !== false;     // default = true
      const bytes = base64ToBytes(b64);
      const doc = await extract(filename, bytes, (frac, stage) => {
        // best-effort progress broadcast (any listener ignores)
        try {
          chrome.runtime.sendMessage({
            payload: { type: 'extract.progress', job_id: jobId, frac, stage },
          }).catch(() => {});
        } catch { /* */ }
      });
      if (promote) {
        return ingestExtracted(db, filename, doc, jobId);
      }
      return { job_id: jobId, kind: doc.kind, parts: doc.parts.length, title: doc.title };
    }

    default:
      throw new Error(`unknown offscreen msg: ${String(msg.type)}`);
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function ingestExtracted(db: DbHandle, filename: string, doc: ExtractedDoc, jobId: string) {
  return transaction(db, () => {
    // Create a synthetic source so all parts share provenance.
    const uri = `file://${filename}#${jobId}`;
    exec(
      db,
      `INSERT INTO sources (uri, kind, title, meta_json)
       VALUES (?, ?, ?, ?)`,
      [uri, doc.kind, doc.title, JSON.stringify(doc.meta)],
    );
    const sourceId = lastInsertRowId(db);

    const ids: number[] = [];
    for (const part of doc.parts) {
      const text = part.text.trim();
      if (!text) continue;
      const noteKind = doc.kind === 'image' ? 'image_ocr' : 'clip';
      const hash = simhash64(text);
      const [b0, b1, b2, b3] = simhashBands(hash);
      const body = part.heading
        ? `**${part.heading}**${part.index ? ` · §${part.index}` : ''}\n\n${text}`
        : (part.index ? `§${part.index}\n\n${text}` : text);
      exec(
        db,
        `INSERT INTO notes (source_id, kind, body, body_plain, simhash, simhash_b0, simhash_b1, simhash_b2, simhash_b3, color, position_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sky', ?)`,
        [sourceId, noteKind, body, text, String(hash), b0, b1, b2, b3, JSON.stringify({ part: part.index ?? null })],
      );
      ids.push(lastInsertRowId(db));
    }
    return { source_id: sourceId, note_ids: ids, kind: doc.kind, parts: doc.parts.length };
  });
}

const AUDIT_TABLES: Record<string, { cols: string[]; required?: string[] }> = {
  llm_calls: {
    cols: ['provider','model','endpoint','bytes_out','bytes_in','tokens_in','tokens_out','purpose','consent','ok','error','ms'],
    required: ['provider','purpose'],
  },
  usage_events: { cols: ['event','meta_json'], required: ['event'] },
  errors:       { cols: ['scope','code','message','stack','meta_json'], required: ['scope','message'] },
  skill_runs:   {
    cols: ['skill_id','status','started_at','finished_at','duration_ms','trigger','log','error','result_json'],
    required: ['skill_id','status','trigger'],
  },
};

function auditInsert(db: DbHandle, channel: string, payload: Record<string, unknown>): { id: number } {
  const meta = AUDIT_TABLES[channel];
  if (!meta) throw new Error(`unknown audit channel: ${channel}`);
  for (const r of meta.required ?? []) {
    if (payload[r] === undefined || payload[r] === null) throw new Error(`audit ${channel}: missing ${r}`);
  }
  const cols = meta.cols.filter((c) => payload[c] !== undefined);
  const placeholders = cols.map(() => '?').join(',');
  const vals = cols.map((c) => payload[c] ?? null);
  exec(db, `INSERT INTO ${channel} (${cols.join(',')}) VALUES (${placeholders})`, vals);
  return { id: lastInsertRowId(db) };
}

function mutate(db: DbHandle, op: string, p: Record<string, unknown>): unknown {
  switch (op) {
    case 'note.update': {
      const id = Number(p.id);
      const body = String(p.body ?? '');
      exec(db, `UPDATE notes SET body = ?, body_plain = ? WHERE id = ?`, [body, stripMarkdown(body), id]);
      return { ok: true };
    }
    case 'note.delete': {
      const id = Number(p.id);
      exec(db, `DELETE FROM notes WHERE id = ?`, [id]);
      return { ok: true };
    }
    case 'note.star': {
      const id = Number(p.id);
      const v = p.starred ? 1 : 0;
      exec(db, `UPDATE notes SET starred = ? WHERE id = ?`, [v, id]);
      return { ok: true };
    }
    case 'note.archive': {
      const id = Number(p.id);
      const v = p.archived ? 1 : 0;
      exec(db, `UPDATE notes SET archived = ? WHERE id = ?`, [v, id]);
      return { ok: true };
    }
    case 'inbox.promote': {
      const id = Number(p.id);
      if (!id) throw new Error('inbox.promote: id required');
      return transaction(db, () => {
        const rows = query<{ kind: string; payload_json: string; source_id: number | null }>(
          db,
          `SELECT kind, payload_json, source_id FROM inbox WHERE id = ?`,
          [id],
        );
        const row = rows[0];
        if (!row) throw new Error(`inbox.promote: id ${id} not found`);
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(row.payload_json); } catch { /* */ }

        const text = String(payload.text ?? payload.title ?? '').trim() || '(empty)';
        const url = payload.url as string | undefined;
        const title = payload.title as string | undefined;

        // Reuse / create source if URL is provided.
        let sourceId: number | null = row.source_id;
        if (!sourceId && url) {
          const existing = query<{ id: number }>(db, 'SELECT id FROM sources WHERE uri = ?', [url]);
          if (existing[0]) {
            sourceId = existing[0].id;
          } else {
            exec(
              db,
              `INSERT INTO sources (uri, kind, title) VALUES (?, 'web', ?)`,
              [url, title ?? null],
            );
            sourceId = lastInsertRowId(db);
          }
        }

        const noteKind = row.kind === 'image' ? 'image_ocr' : 'clip';
        const hash = simhash64(text);
        const [b0, b1, b2, b3] = simhashBands(hash);
        exec(
          db,
          `INSERT INTO notes (source_id, kind, body, body_plain, simhash, simhash_b0, simhash_b1, simhash_b2, simhash_b3, color)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sage')`,
          [sourceId, noteKind, text, text, String(hash), b0, b1, b2, b3],
        );
        const noteId = lastInsertRowId(db);

        const now = Math.floor(Date.now() / 1000);
        exec(
          db,
          `UPDATE inbox SET status = 'accepted', promoted_note_id = ?, decided_at = ? WHERE id = ?`,
          [noteId, now, id],
        );
        return { ok: true, note_id: noteId, source_id: sourceId };
      });
    }
    case 'inbox.discard': {
      const id = Number(p.id);
      const now = Math.floor(Date.now() / 1000);
      exec(db, `UPDATE inbox SET status = 'discarded', decided_at = ? WHERE id = ?`, [now, id]);
      return { ok: true };
    }
    case 'consent.grant': {
      // Stored in chrome.storage by the SW; here we just timestamp a usage event.
      exec(db, `INSERT INTO usage_events (event, meta_json) VALUES ('consent.grant', '{}')`);
      return { ok: true };
    }
    case 'skill.upsert': {
      const name = String(p.name);
      const version = String(p.version ?? '1.0.0');
      const description = String(p.description ?? '');
      const trigger_json = String(p.trigger_json ?? '{}');
      const tools_json = String(p.tools_json ?? '[]');
      const permissions_json = String(p.permissions_json ?? '{}');
      const body_md = String(p.body_md ?? '');
      const source = String(p.source ?? 'builtin');
      exec(
        db,
        `INSERT INTO skills (name, version, description, trigger_json, tools_json, permissions_json, body_md, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           version=excluded.version, description=excluded.description,
           trigger_json=excluded.trigger_json, tools_json=excluded.tools_json,
           permissions_json=excluded.permissions_json, body_md=excluded.body_md,
           updated_at=strftime('%s','now')`,
        [name, version, description, trigger_json, tools_json, permissions_json, body_md, source],
      );
      return { ok: true };
    }
    case 'skill.toggle': {
      const id = Number(p.id);
      const v = p.enabled ? 1 : 0;
      exec(db, `UPDATE skills SET enabled = ? WHERE id = ?`, [v, id]);
      return { ok: true };
    }
    case 'skill_run.update': {
      const id = Number(p.id);
      const status = String(p.status ?? 'succeeded');
      const finished_at = Math.floor(Date.now() / 1000);
      const duration_ms = Number(p.duration_ms ?? 0);
      const log = String(p.log ?? '');
      const error = (p.error as string | null | undefined) ?? null;
      const result_json = String(p.result_json ?? '{}');
      exec(
        db,
        `UPDATE skill_runs
            SET status = ?, finished_at = ?, duration_ms = ?, log = ?, error = ?, result_json = ?
          WHERE id = ?`,
        [status, finished_at, duration_ms, log, error, result_json, id],
      );
      exec(db, `UPDATE skills SET last_run_at = ? WHERE id = (SELECT skill_id FROM skill_runs WHERE id = ?)`,
        [finished_at, id]);
      return { ok: true };
    }
    case 'simhash.backfill': {
      // Lazily fill simhash_b0..b3 for any rows that have a simhash but no bands.
      const rows = query<{ id: number; simhash: string }>(
        db,
        `SELECT id, simhash FROM notes
          WHERE simhash IS NOT NULL AND simhash_b0 IS NULL
          LIMIT ?`,
        [Number(p.limit ?? 1000)],
      );
      let n = 0;
      for (const r of rows) {
        try {
          const h = BigInt(r.simhash);
          const [b0, b1, b2, b3] = simhashBands(h);
          exec(db, `UPDATE notes SET simhash_b0 = ?, simhash_b1 = ?, simhash_b2 = ?, simhash_b3 = ? WHERE id = ?`,
            [b0, b1, b2, b3, r.id]);
          n += 1;
        } catch { /* skip malformed */ }
      }
      return { ok: true, backfilled: n, remaining: rows.length === Number(p.limit ?? 1000) ? 'more' : 'done' };
    }
    default:
      throw new Error(`unknown mutate op: ${op}`);
  }
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^>\s+/gm, '')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function upsertSource(db: DbHandle, ctx: Record<string, string | undefined>): number {
  const uri = ctx.url ?? `manual://${crypto.randomUUID()}`;
  const existing = query<{ id: number }>(db, 'SELECT id FROM sources WHERE uri = ?', [uri]);
  if (existing[0]) return existing[0].id;
  exec(
    db,
    `INSERT INTO sources (uri, kind, title, site_name, favicon, author, lang)
     VALUES (?, 'web', ?, ?, ?, ?, ?)`,
    [uri, ctx.title ?? null, ctx.site_name ?? null, ctx.favicon ?? null, ctx.author ?? null, ctx.lang ?? null],
  );
  return lastInsertRowId(db);
}

function lastInsertRowId(db: DbHandle): number {
  const row = query<{ id: number }>(db, 'SELECT last_insert_rowid() AS id');
  return row[0]?.id ?? 0;
}

function recallProbe(db: DbHandle, title: string, snippet: string) {
  const text = `${title}\n${snippet}`;
  const keywords = extractKeywords(text, { k: 8 });
  const probeHash = simhash64(text);
  const [b0, b1, b2, b3] = simhashBands(probeHash);

  // Channel A: FTS5 keyword recall
  const ftsRows: RawRecallRow[] = [];
  const match = buildFtsMatch(keywords);
  if (match) {
    ftsRows.push(...query<RawRecallRow & Record<string, unknown>>(
      db,
      `SELECT n.id, n.body, n.body_plain, n.context_before, n.simhash,
              s.title, s.site_name, n.created_at,
              bm25(notes_fts) AS score
       FROM notes_fts
       JOIN notes n ON n.id = notes_fts.rowid
       LEFT JOIN sources s ON s.id = n.source_id
       WHERE notes_fts MATCH ? AND n.archived = 0
       ORDER BY score
       LIMIT 30`,
      [match],
    ));
  }

  // Channel B: SimHash LSH banding — catches near-duplicates that share no
  // keywords (paraphrase, translation, OCR errors).
  const lshRows = query<RawRecallRow & Record<string, unknown>>(
    db,
    `SELECT n.id, n.body, n.body_plain, n.context_before, n.simhash,
            s.title, s.site_name, n.created_at,
            0.0 AS score
       FROM notes n
       LEFT JOIN sources s ON s.id = n.source_id
      WHERE n.archived = 0
        AND (n.simhash_b0 = ? OR n.simhash_b1 = ? OR n.simhash_b2 = ? OR n.simhash_b3 = ?)
      LIMIT 50`,
    [b0, b1, b2, b3],
  );

  // Merge by id, prefer the lower (better) bm25 score.
  const byId = new Map<number, RawRecallRow>();
  for (const r of ftsRows) byId.set(r.id, r);
  for (const r of lshRows) if (!byId.has(r.id)) byId.set(r.id, r);
  const rows = [...byId.values()];

  if (rows.length === 0) return { cards: [], keywords };

  // Combined score: BM25 + Hamming + recency
  const now = Math.floor(Date.now() / 1000);
  const ranked = rows.map((r) => {
    const h = r.simhash ? BigInt(r.simhash) : null;
    const hamDist = h !== null ? hamming(probeHash, h) : 32;
    const recency = Math.max(0, 1 - (now - r.created_at) / (180 * 86400));
    const bm = -r.score;
    const score =
      bm * 0.5 +
      (1 - hamDist / 64) * 0.4 +
      recency * 0.1;
    return { ...r, hamming: hamDist, combined: score };
  });
  ranked.sort((a, b) => b.combined - a.combined);

  const top = ranked.slice(0, 5).map((r) => {
    let user_annotation: string | undefined;
    const m = r.body.match(/\n\n([^\n].{4,400})$/);
    if (m && r.body.startsWith('>')) user_annotation = m[1]!.trim();
    const titleOut = r.title?.trim() || r.body_plain.slice(0, 48);
    return {
      note_id: r.id,
      title: titleOut,
      excerpt: r.body_plain.slice(0, 240),
      site_name: r.site_name,
      created_at: r.created_at,
      user_annotation,
      score: r.combined,
      hamming: r.hamming,
    };
  });

  if (top.length > 0) {
    const ids = top.map((c) => c.note_id).join(',');
    try {
      exec(db, `UPDATE notes SET accessed_at = ? WHERE id IN (${ids})`, [now]);
    } catch { /* best-effort */ }
  }

  return { cards: top, keywords };
}

interface RawRecallRow {
  id: number;
  body: string;
  body_plain: string;
  context_before: string | null;
  simhash: string | null;
  title: string | null;
  site_name: string | null;
  created_at: number;
  score: number;
}
