/**
 * SQLite WASM + OPFS host. Lives inside the offscreen document.
 *
 * Uses @sqlite.org/sqlite-wasm with the OO1 API. OPFS provides synchronous
 * file access from workers; offscreen runs on the main thread but the wasm
 * module itself spawns the OPFS worker for us.
 */

import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import migration_0001 from '../db/migrations/0001_init.sql?raw';
import migration_0002 from '../db/migrations/0002_simhash_lsh.sql?raw';

const DB_FILE = 'hearth.db';
const MIGRATIONS: Array<{ version: number; sql: string }> = [
  { version: 1, sql: migration_0001 },
  { version: 2, sql: migration_0002 },
];

export interface DbHandle {
  sqlite3: Sqlite3Static;
  db: Database;
  schemaVersion: number;
}

let cached: Promise<DbHandle> | null = null;

export function initDb(): Promise<DbHandle> {
  if (cached) return cached;
  cached = boot();
  return cached;
}

async function boot(): Promise<DbHandle> {
  const sqlite3 = await sqlite3InitModule({
    print: (...a) => console.log('[sqlite]', ...a),
    printErr: (...a) => console.error('[sqlite]', ...a),
  });

  let db: Database;
  if (sqlite3.oo1?.OpfsDb) {
    db = new sqlite3.oo1.OpfsDb(DB_FILE, 'ct');
    console.log('[hearth/db] OPFS-backed db ready:', DB_FILE);
  } else {
    db = new sqlite3.oo1.DB(`:memory:`, 'ct');
    console.warn('[hearth/db] OPFS unavailable — running in-memory (data will NOT persist)');
  }

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const schemaVersion = applyMigrations(db);
  return { sqlite3, db, schemaVersion };
}

function applyMigrations(db: Database): number {
  // schema_version is stored in meta after first migration runs; bootstrap if missing.
  let current = 0;
  try {
    const rows: Array<[string]> = [];
    db.exec({
      sql: `SELECT value FROM meta WHERE key = 'schema_version'`,
      rowMode: 'array',
      resultRows: rows,
    });
    current = rows[0] ? Number(rows[0][0]) : 0;
  } catch {
    current = 0;
  }

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    console.log('[hearth/db] applying migration', m.version);
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.exec({
        sql: `INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)`,
        bind: [String(m.version)],
      });
      db.exec('COMMIT');
      current = m.version;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return current;
}

export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  h: DbHandle,
  sql: string,
  params: unknown[] = [],
): T[] {
  const rows: T[] = [];
  h.db.exec({
    sql,
    bind: params as never,
    rowMode: 'object',
    resultRows: rows as never,
  });
  return rows;
}

export function exec(h: DbHandle, sql: string, params: unknown[] = []): void {
  h.db.exec({ sql, bind: params as never });
}

export function transaction<T>(h: DbHandle, fn: () => T): T {
  h.db.exec('BEGIN');
  try {
    const out = fn();
    h.db.exec('COMMIT');
    return out;
  } catch (e) {
    h.db.exec('ROLLBACK');
    throw e;
  }
}
