-- ============================================================
-- Hearth Database Schema
-- SQLite >= 3.42 (FTS5 + JSON1 required)
-- Migration: 0001_init
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA recursive_triggers = ON;

-- ------------------------------------------------------------
-- Meta
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta(key, value) VALUES
  ('schema_version', '1'),
  ('created_at', strftime('%s','now')),
  ('installation_id', lower(hex(randomblob(8))));

-- ============================================================
-- 1. Sources (网页 / 文件 / 上传)
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uri         TEXT NOT NULL,           -- url 或 file://hash
  kind        TEXT NOT NULL CHECK (kind IN ('web','docx','pdf','image','md','xlsx','manual')),
  title       TEXT,
  author      TEXT,
  site_name   TEXT,                    -- 域名/站点
  favicon     TEXT,
  lang        TEXT,
  published_at INTEGER,                -- 原文发布时间（如能解析）
  fetched_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  meta_json   TEXT,                    -- 任意附加元数据
  UNIQUE(uri)
);
CREATE INDEX IF NOT EXISTS idx_sources_kind ON sources(kind);
CREATE INDEX IF NOT EXISTS idx_sources_fetched_at ON sources(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_sources_site ON sources(site_name);

-- ============================================================
-- 2. Notes (统一容器：highlight / note / chat / clip)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('highlight','note','annotation','chat','clip','image_ocr')),

  body         TEXT NOT NULL,          -- markdown
  body_plain   TEXT,                   -- 去 md 后的纯文本，给 FTS5
  context_before TEXT,                 -- 高亮前后 200 字
  context_after  TEXT,

  position_json TEXT,                  -- 锚点：xpath/textquote/page no/bbox

  color        TEXT DEFAULT 'amber' CHECK (color IN ('amber','rose','sky','sage','violet','slate')),
  starred      INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0,1)),
  archived     INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),

  simhash      INTEGER,                -- 64-bit SimHash
  keywords_json TEXT,                  -- ["sqlite","wal","fsync"]

  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  accessed_at  INTEGER,                -- 最近一次被打开/召回命中

  CHECK (length(body) > 0)
);
CREATE INDEX IF NOT EXISTS idx_notes_source ON notes(source_id);
CREATE INDEX IF NOT EXISTS idx_notes_kind ON notes(kind);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_starred ON notes(starred) WHERE starred = 1;
CREATE INDEX IF NOT EXISTS idx_notes_simhash ON notes(simhash) WHERE simhash IS NOT NULL;

-- 自动维 updated_at
CREATE TRIGGER IF NOT EXISTS trg_notes_updated
  AFTER UPDATE ON notes
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE notes SET updated_at = strftime('%s','now') WHERE id = NEW.id;
END;

-- ============================================================
-- 3. FTS5 (全文索引)
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  body_plain,
  context_before,
  context_after,
  title UNINDEXED,
  content='notes',
  content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"  -- 中英混排兼容
);

-- FTS 同步触发器
CREATE TRIGGER IF NOT EXISTS trg_notes_ai
  AFTER INSERT ON notes
BEGIN
  INSERT INTO notes_fts(rowid, body_plain, context_before, context_after)
    VALUES (NEW.id, COALESCE(NEW.body_plain, NEW.body), NEW.context_before, NEW.context_after);
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_ad
  AFTER DELETE ON notes
BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, body_plain, context_before, context_after)
    VALUES ('delete', OLD.id, OLD.body_plain, OLD.context_before, OLD.context_after);
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_au
  AFTER UPDATE ON notes
BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, body_plain, context_before, context_after)
    VALUES ('delete', OLD.id, OLD.body_plain, OLD.context_before, OLD.context_after);
  INSERT INTO notes_fts(rowid, body_plain, context_before, context_after)
    VALUES (NEW.id, COALESCE(NEW.body_plain, NEW.body), NEW.context_before, NEW.context_after);
END;

-- ============================================================
-- 4. Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color     TEXT,
  parent_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  auto    INTEGER NOT NULL DEFAULT 0,  -- 1=AI 建议；0=用户手动
  PRIMARY KEY (note_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

-- ============================================================
-- 5. Links (笔记互链：[[wiki]] 风格 + 自动 link-similar)
-- ============================================================
CREATE TABLE IF NOT EXISTS links (
  src_id   INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  dst_id   INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('wiki','similar','reply','followup')),
  weight   REAL NOT NULL DEFAULT 1.0,  -- 相似度分数
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (src_id, dst_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_id);

-- ============================================================
-- 6. Inbox (L0 候选层)
-- ============================================================
CREATE TABLE IF NOT EXISTS inbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('clip','read','image','tab_close','reading_list')),
  payload_json TEXT NOT NULL,           -- 信号 payload
  source_id   INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  score       REAL DEFAULT 0,           -- LLM/规则给的"值得入库"分数
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','discarded','expired')),
  promoted_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  ttl_at      INTEGER NOT NULL,         -- 默认 created_at + 72h
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_ttl ON inbox(ttl_at) WHERE status = 'pending';

-- ============================================================
-- 7. Conversations (LLM 对话)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  context_json TEXT,                    -- 关联的 note_ids / source_ids
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content         TEXT NOT NULL,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  model           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_msgs_conv ON messages(conversation_id, created_at);

-- ============================================================
-- 8. Skills (skill.md 注册表)
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  version       TEXT NOT NULL DEFAULT '1.0.0',
  description   TEXT,
  trigger_json  TEXT NOT NULL,          -- {type,schedule|event,...}
  tools_json    TEXT,                   -- ["db.query","llm.summarize"]
  permissions_json TEXT,                -- {llm:'required',network:'optional'}
  body_md       TEXT NOT NULL,          -- skill.md 完整正文
  source        TEXT NOT NULL DEFAULT 'builtin' CHECK (source IN ('builtin','user','community')),
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   INTEGER,
  next_run_at   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled, next_run_at);

-- 8.1 Skill runs (审计日志)
CREATE TABLE IF NOT EXISTS skill_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id    INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','cancelled')),
  started_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  finished_at INTEGER,
  duration_ms INTEGER,
  trigger     TEXT,                     -- 'cron' / 'manual' / 'event'
  log         TEXT,                     -- 步骤日志
  error       TEXT,
  result_json TEXT                      -- 结构化输出
);
CREATE INDEX IF NOT EXISTS idx_skill_runs_skill ON skill_runs(skill_id, started_at DESC);

-- ============================================================
-- 9. LLM call ledger (出网审计)
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_calls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,            -- anthropic / openai / ollama / custom
  model       TEXT,
  endpoint    TEXT,
  bytes_out   INTEGER,                  -- 发送字节
  bytes_in    INTEGER,                  -- 接收字节
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  purpose     TEXT NOT NULL,            -- 'chat' / 'warmth' / 'tag-suggest' / 'summarize'
  consent     INTEGER NOT NULL DEFAULT 1,
  ok          INTEGER NOT NULL DEFAULT 1,
  error       TEXT,
  ms          INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_llm_calls_at ON llm_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_provider ON llm_calls(provider, created_at DESC);

-- ============================================================
-- 10. Usage events (本地行为，仅自看)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event      TEXT NOT NULL,             -- 'note.create' / 'recall.hit' / 'skill.run'
  meta_json  TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_at ON usage_events(created_at DESC);

-- ============================================================
-- 11. Errors
-- ============================================================
CREATE TABLE IF NOT EXISTS errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,             -- 'sw' / 'offscreen' / 'content' / 'sidepanel'
  code       TEXT,
  message    TEXT NOT NULL,
  stack      TEXT,
  meta_json  TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_errors_at ON errors(created_at DESC);

-- ============================================================
-- 12. Views (便利查询)
-- ============================================================

-- 12.1 最近高亮（含 source 信息）
CREATE VIEW IF NOT EXISTS v_recent_highlights AS
SELECT
  n.id, n.body, n.color, n.starred, n.created_at,
  s.uri, s.title AS source_title, s.site_name, s.favicon
FROM notes n
LEFT JOIN sources s ON s.id = n.source_id
WHERE n.archived = 0
ORDER BY n.created_at DESC;

-- 12.2 标签使用量
CREATE VIEW IF NOT EXISTS v_tag_usage AS
SELECT t.id, t.name, t.color, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
GROUP BY t.id, t.name, t.color
ORDER BY note_count DESC;

-- 12.3 冷藏候选（30 天未访问 + 0 星标）
CREATE VIEW IF NOT EXISTS v_cold_notes AS
SELECT n.id, n.body, n.created_at, n.accessed_at
FROM notes n
WHERE n.archived = 0
  AND n.starred = 0
  AND COALESCE(n.accessed_at, n.created_at) < strftime('%s','now') - 30*86400;

-- 12.4 每日入库统计
CREATE VIEW IF NOT EXISTS v_daily_stats AS
SELECT
  date(created_at, 'unixepoch', 'localtime') AS day,
  COUNT(*) AS notes_added,
  SUM(CASE WHEN kind='highlight' THEN 1 ELSE 0 END) AS highlights,
  SUM(CASE WHEN kind='note' THEN 1 ELSE 0 END) AS notes,
  SUM(CASE WHEN kind='chat' THEN 1 ELSE 0 END) AS chats
FROM notes
GROUP BY day
ORDER BY day DESC;
