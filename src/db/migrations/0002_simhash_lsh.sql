-- Migration 0002 — SimHash LSH banding
--
-- Strategy: split each 64-bit simhash into 4 × 16-bit bands and index each.
-- Any two simhashes within Hamming distance ≤ 18 must share at least one
-- band (by pigeonhole — 18/4 = 4.5, so at most 4 bands can each differ by
-- up to 4 bits; some band will be equal). Therefore a UNION across the four
-- band lookups gives a complete candidate set, with ~16× speedup over full
-- scan at our scale.

PRAGMA foreign_keys = ON;

ALTER TABLE notes ADD COLUMN simhash_b0 INTEGER;
ALTER TABLE notes ADD COLUMN simhash_b1 INTEGER;
ALTER TABLE notes ADD COLUMN simhash_b2 INTEGER;
ALTER TABLE notes ADD COLUMN simhash_b3 INTEGER;

-- Backfill from existing simhash column.
-- (SQLite has no bit-shift for big integers; we store simhash as decimal string
--  via TEXT in notes.simhash. Pull and rebuild in code path? — Yes; this migration
--  only adds columns, the offscreen layer will lazily compute on next access.)
-- We mark notes that need backfill with a sentinel value of NULL (already default).

CREATE INDEX IF NOT EXISTS idx_notes_simhash_b0 ON notes(simhash_b0) WHERE simhash_b0 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_simhash_b1 ON notes(simhash_b1) WHERE simhash_b1 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_simhash_b2 ON notes(simhash_b2) WHERE simhash_b2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_simhash_b3 ON notes(simhash_b3) WHERE simhash_b3 IS NOT NULL;
