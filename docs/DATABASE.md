# Hearth · Database Schema

> SQLite 3.42+，FTS5 必需，OPFS 持久化。

## 表清单

| 表 | 作用 | 关键列 |
|---|---|---|
| `meta` | 元数据 KV | schema_version, installation_id |
| `sources` | 网页/文件统一来源 | uri, kind, title, site_name |
| `notes` | **核心容器**（高亮/笔记/批注/对话/截图 OCR） | body, simhash, keywords_json |
| `notes_fts` | FTS5 全文索引（虚拟表） | body_plain, context_before/after |
| `tags` / `note_tags` | 标签（含层级 parent_id） | name, parent_id, auto |
| `links` | 笔记互链（wiki / similar / reply） | src_id, dst_id, kind, weight |
| `inbox` | L0 候选层（72h TTL） | kind, payload_json, status |
| `conversations` / `messages` | LLM 对话 | role, content, model |
| `skills` / `skill_runs` | skill.md 注册表与运行日志 | trigger_json, status, log |
| `llm_calls` | **出网审计**（每次外部调用都落账） | provider, bytes_out, purpose |
| `usage_events` | 本地行为埋点（不上报） | event, meta_json |
| `errors` | 异常落地 | scope, code, message |

## Views

- `v_recent_highlights` — 最近高亮含 source 元信息
- `v_tag_usage` — 标签使用频次
- `v_cold_notes` — 30 天未访问 + 0 星标，归档候选
- `v_daily_stats` — 每日入库统计

## 关键设计决策

### 1. notes 是统一容器，不分表

`highlight / note / annotation / chat / clip / image_ocr` 全走 `notes` + `kind` 字段。
**原因**：FTS5 一个索引覆盖全库；UI 切换 kind 过滤；导出与迁移简单。
**代价**：列偏稀疏（context_before/after 对 chat 为空），但 SQLite 稀疏列零成本。

### 2. FTS5 用 `unicode61` 分词，`remove_diacritics 2`

- 兼容中英混排
- 对中文是按字符切分，不是分词；规模 < 100k 时召回足够
- 若用户库 > 100k 且抱怨中文召回差，再考虑接 jieba/cppjieba WASM

### 3. SimHash 64-bit 入 `notes.simhash`

- 计算在 Offscreen 内完成
- 召回时按 hamming distance < 12 视为相似候选
- **不是** 用作主检索通道；只是 FTS5 召回之后的 rerank 辅助

### 4. WAL 模式 + Triggers 维 FTS

- WAL 写并发更友好
- FTS 同步用 `AFTER INSERT/UPDATE/DELETE` 触发器，零业务代码侵入
- 性能：10k 笔记 INSERT 约 800ms（一次性导入），单条 < 5ms

### 5. inbox 72h TTL

- `ttl_at` 索引过滤 status='pending'
- 定时 skill `inbox-tidy` 跑 sweep，状态置 'expired'
- **不删除**，便于"误丢"恢复；30 天后才物理删

### 6. llm_calls 强审计

- 每次出网都落一行，含字节数 / token / purpose
- 设置面板查"过去 7/30 天云端调用"
- consent 列记录"是否在明示气泡之后"

## 性能基线

| 操作 | 规模 | 预期 |
|---|---|---|
| 单条 INSERT note | - | < 5 ms |
| FTS5 MATCH 召回 top 30 | 10k notes | < 50 ms |
| SimHash 比对 | 10k | < 100 ms（全量扫，可加 LSH 分桶优化） |
| Daily stats view | 1 年数据 | < 30 ms |
| 全库导出 zip | 10k notes | < 3 s |

## 迁移策略

- 文件名：`NNNN_<slug>.sql`，按字典序执行
- 每个迁移以 `BEGIN; ... COMMIT;` 包裹
- 应用前自动备份 `hearth.db.bak.<ts>`，保留最近 3 份
- 失败回滚：删 `.db`，从备份恢复，schema_version 不变
- 不允许破坏性迁移（不删列、不改类型）；用新列 + 数据迁移 + 旧列冷藏

## 容量规划

| 规模 | DB 大小估算 | 备注 |
|---|---|---|
| 1k notes | ~3 MB | FTS 占 ~40% |
| 10k notes | ~30 MB | |
| 100k notes | ~300 MB | OPFS 可承受，但建议归档 |

> OPFS 单 origin 配额通常 > 6 GB（Chrome），够用十年。
