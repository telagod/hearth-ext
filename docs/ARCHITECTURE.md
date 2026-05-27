# Hearth · Architecture

> 本地优先，浏览器原生，**LLM 仅在收口处出场**。

---

## 1 · 高层模块

```
┌──────────────────────────────────────────────────────────────┐
│                  Browser (Chromium MV3)                      │
│                                                              │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Content Script  │  │ Side Panel   │  │ New Tab         │ │
│  │ (per tab)       │  │ (React App)  │  │ (Dashboard)     │ │
│  │                 │  │              │  │                 │ │
│  │ • Float Bar L1  │  │ • Library    │  │ • Today Memory  │ │
│  │ • Recall Orb L2 │  │ • Chat       │  │ • Heatmap       │ │
│  │ • Inbox Probe L0│  │ • Inbox      │  │ • Quick Search  │ │
│  │ • Selection IPC │  │ • Skills     │  │                 │ │
│  └────────┬────────┘  └──────┬───────┘  └────────┬────────┘ │
│           │                  │                   │          │
│           └──────────────────┼───────────────────┘          │
│                              │                              │
│              chrome.runtime.connect (MessageBus)            │
│                              │                              │
│  ┌───────────────────────────▼──────────────────────────┐  │
│  │           Service Worker (background.ts)             │  │
│  │                                                      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │ Router   │ │ Capture  │ │ Skill    │ │ Alarm  │ │  │
│  │  │ (Msg)    │ │ Pipeline │ │ Runner   │ │ Sched  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │  │
│  └────────────────────────────┬─────────────────────────┘  │
│                               │                            │
│  ┌────────────────────────────▼──────────────────────────┐ │
│  │           Offscreen Document (SQLite WASM)           │ │
│  │                                                      │ │
│  │  • sqlite-wasm + OPFS (持久化)                       │ │
│  │  • FTS5 全文索引                                      │ │
│  │  • SimHash 索引表                                     │ │
│  │  • 重活：OCR / docx 抽取 / SimHash 计算               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              LLM Adapter Layer                      │  │
│  │  Anthropic │ OpenAI │ Ollama (local) │ Custom HTTP │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 2 · 为什么用 Offscreen 隔 SQLite

| 候选 | 问题 |
|---|---|
| Service Worker 内跑 SQLite WASM | SW 会被随时杀（5min idle），WAL 写中断会损坏 |
| Sidepanel 内跑 | 关掉面板 = 关掉数据库，定时任务无 host |
| **Offscreen Document** ✅ | 长生命周期 + DOM 上下文 + 可 OPFS 持久化 |

Offscreen 在 Chrome 109+ 可用，正是 Hearth 的目标版本下限。

---

## 3 · 关键数据流

### 3.1 L1 · 选中→入库（同步路径）

```
Content Script: selection event
    ↓ postMessage { type: 'capture', text, ctx, pageMeta }
Service Worker: Router
    ↓ chrome.runtime.sendMessage(offscreen)
Offscreen: db.insert(highlight)
    ↓ ack
Service Worker: schedule skill 'link-similar' (async)
    ↓ chrome.runtime.sendMessage(content)
Content Script: float bar → ✓ confirm animation
```

延迟预算：**< 100ms** 从点按到确认动画。

### 3.2 L2 · 反向召回（异步路径）

```
Content Script: page loaded + scrolled
    ↓ postMessage { type: 'recall.probe', title, snippet }
Service Worker: Capture Pipeline
    ↓ extract keywords (TF-IDF lite, 本地)
    ↓ db.query(fts5_match) → top 30
    ↓ simhash compare → top 5 by score
    ↓ if max_score > threshold:
Service Worker: LLM Adapter
    ↓ prompt(top3_titles + current_page_title) [仅元信息出网]
    ↓ narrative text ← LLM
Service Worker → Content Script
    ↓ render orb ☕ bottom-right
```

整链路 **< 1.5s**，LLM 调用可缓存（同页面 30 分钟内不重复）。

### 3.3 L3 · 周回顾（cron 路径）

```
chrome.alarms 'weekly-review' fires
    ↓
Service Worker: Skill Runner load skills/weekly-review.md
    ↓ parse frontmatter, lint tools whitelist
    ↓ exec step-by-step
       ├─ db.query last 7 days
       ├─ llm.summarize (with consent if needed)
       └─ ui.notify → sidepanel toast
Skill Runner: write skill_runs log
```

---

## 4 · 模块清单

| 模块 | 位置 | 职责 |
|---|---|---|
| `background/router.ts` | SW | 消息总线、权限校验、限流 |
| `background/capture.ts` | SW | L0/L1/L2 信号收集 |
| `background/skillRunner.ts` | SW | skill.md 解析与执行 |
| `background/alarms.ts` | SW | chrome.alarms 与 cron 适配 |
| `offscreen/db.ts` | Offscreen | SQLite WASM + OPFS |
| `offscreen/fts.ts` | Offscreen | FTS5 索引维护 |
| `offscreen/simhash.ts` | Offscreen | SimHash 计算与对比 |
| `offscreen/extract.ts` | Offscreen | docx/pdf/img OCR 抽文 |
| `content/floatBar.tsx` | CS | L1 选中浮 bar |
| `content/recallOrb.tsx` | CS | L2 反向召回小球 |
| `content/probe.ts` | CS | L0 寄生候选信号 |
| `sidepanel/App.tsx` | Sidepanel | React 主壳 |
| `sidepanel/views/Library.tsx` | Sidepanel | 库视图 |
| `sidepanel/views/Chat.tsx` | Sidepanel | LLM 对话 |
| `sidepanel/views/Inbox.tsx` | Sidepanel | 候选清单 |
| `sidepanel/views/Skills.tsx` | Sidepanel | skill 编辑+日志 |
| `sidepanel/views/Settings.tsx` | Sidepanel | API keys、隐私 |
| `shared/messages.ts` | 共享 | 消息类型定义 |
| `shared/types.ts` | 共享 | 数据类型 |
| `llm/adapter.ts` | 共享 | LLM 适配器接口 |
| `llm/anthropic.ts` | 共享 | Anthropic 实现 |
| `llm/openai.ts` | 共享 | OpenAI 实现 |
| `llm/ollama.ts` | 共享 | Ollama 本地实现 |
| `llm/warmth.ts` | 共享 | 温度引擎旁白 prompt |
| `db/schema.sql` | 共享 | DDL |
| `db/migrations/*.sql` | 共享 | 版本迁移 |
| `skills/*.md` | 共享 | 内置 skill 定义 |
| `i18n/zh.json` `i18n/en.json` | 共享 | 多语 |

---

## 5 · 消息协议

所有跨上下文通信走统一 `Message` 类型：

```typescript
type Message =
  | { type: 'capture.highlight'; text: string; ctx: PageCtx; tags?: string[] }
  | { type: 'capture.inbox'; kind: 'clip'|'read'|'image'; payload: any }
  | { type: 'recall.probe'; title: string; snippet: string }
  | { type: 'recall.result'; cards: RecallCard[]; narrative?: string }
  | { type: 'chat.ask'; messages: ChatMsg[]; context?: NoteRef[] }
  | { type: 'chat.stream'; delta: string }
  | { type: 'db.query'; sql: string; params: any[] }      // 只读，白名单
  | { type: 'db.mutate'; op: string; payload: any }       // 受控写
  | { type: 'skill.run'; name: string; args?: any }
  | { type: 'skill.log'; runId: string; line: string; level: 'info'|'warn'|'err' }
  | { type: 'ui.notify'; title: string; body: string; cardId?: string }
  | { type: 'settings.export'; format: 'zip'|'obsidian'|'json' }
```

校验：`zod` schema 在 Router 入口校验，非法消息直接 drop + 日志。

---

## 6 · 安全与权限

### 6.1 manifest 权限请求清单

| 权限 | 用途 | 可否最小化 |
|---|---|---|
| `storage` | 设置 + 简单 KV | 必须 |
| `tabs` | 当前 tab meta 提取 | 必须 |
| `scripting` | 注入 floatBar/recallOrb | 必须 |
| `alarms` | skill cron | 必须 |
| `offscreen` | SQLite host | 必须 |
| `contextMenus` | 右键菜单"存到 Hearth" | 必须 |
| `<all_urls>` host | 内容脚本注入 | ⚠ 必须，但加 settings 黑名单 |
| `clipboardRead` | L0 copy 信号 | **可选**，用户在设置中开启 |
| `notifications` | 周回顾推送 | 必须 |

**不申请**：`history`、`bookmarks`、`webRequest`、`downloads`、`cookies`（任何会引起审核警惕的）。

### 6.2 出网策略

- **CSP**：`default-src 'self'; connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:11434 <用户自定义>;`
- **自定义 endpoint**：用户在设置中加白名单，加入即重写 CSP（manifest v3 用 `declarative_net_request` 或运行时检查）
- **明示气泡**：每个 24h 窗内首次出网，必弹"将向 X 发送 Y 字节"

### 6.3 域名黑名单（L0/L2 自动屏蔽）

默认黑名单不采集任何信号：
```
*.bank.* / *.alipay.com / *.taobao.com/order/* /
*.gov.* / mail.* / *.medical.* / drive.google.com /
github.com/*/private / *.notion.so/secret/* / ...
```

用户可在设置中追加。

---

## 7 · 性能预算

| 指标 | 预算 |
|---|---|
| 包体（含 SQLite WASM） | < 6 MB |
| Tesseract 模型（按需） | < 11 MB（独立 lazy install） |
| L1 浮 bar 入库延迟 | < 100 ms |
| L2 召回总延迟（含 LLM） | < 1.5 s |
| FTS5 搜索（10k 笔记） | < 50 ms |
| 内存（idle） | < 80 MB |
| 内存（peak，OCR 时） | < 300 MB |
| 启动到 sidepanel 可交互 | < 400 ms |

---

## 8 · 持久化

| 数据 | 存储 |
|---|---|
| 主库 `hearth.db` | OPFS（`navigator.storage.getDirectory()`） |
| 图片/截图缩略图 | IndexedDB blob |
| 设置 | `chrome.storage.local` |
| API keys | `chrome.storage.session` + WebCrypto AES-GCM 加密落 `chrome.storage.local` |
| skill.md 文件 | OPFS 中 `/skills/*.md`，与 db 同目录 |

**关键约束**：所有持久化都在 Offscreen Document 内完成，SW 重启不丢数据。

---

## 9 · 升级与迁移

- `db/migrations/0001_init.sql` → `0002_*.sql` 顺序执行
- `meta.schema_version` 表记录已应用版本
- 升级前自动备份到 `hearth.db.bak.<timestamp>`，保留最近 3 份
- 失败回滚：Offscreen 加载 db 时若 schema_version > 当前代码支持，提示"请升级插件"，**不破坏数据**

---

## 10 · 可观测性（本地）

| 信号 | 落地 |
|---|---|
| LLM 调用次数与 token | `llm_calls` 表 |
| skill 运行历史 | `skill_runs` 表 |
| 异常 | `errors` 表 + console |
| 用户行为（仅本地） | `usage_events` 表，可一键清空 |

**不上报任何遥测**。如未来要可选开启，明示 + opt-in + 仅匿名汇总。

---

## 11 · 测试策略

| 层 | 工具 | 重点 |
|---|---|---|
| 单元 | Vitest | adapter、SimHash、skill 解析 |
| 集成 | Playwright + `chromium --load-extension` | 浮 bar、召回、入库 |
| DB | sqlite-wasm in Node | DDL、迁移、FTS5 查询 |
| LLM Mock | MSW | 离线/限流/错误场景 |

CI：GitHub Actions Chromium headless。

---

## 12 · 风险登记册

| 风险 | 影响 | 缓解 |
|---|---|---|
| SW 被频繁回收导致 alarm miss | 周回顾不触发 | offscreen keepalive + 状态恢复 |
| OPFS 跨 origin 限制 | 卸载丢数据 | 出厂提示"先导出"；安装时 oneliner 提醒备份 |
| LLM API 限流/付费 | 温度引擎降级 | 本地 fallback 文案，旁白可关 |
| Chrome Store 审核 `<all_urls>` 被拒 | 上架延期 | 配合 justification + 黑名单 demo |
| Tesseract WASM 巨大 | 用户拒装 | OCR 完全按需 lazy install，提示包体 |
| 复制即记录被认为侵入 | 信任崩塌 | 默认关闭，开启需 opt-in + 教学卡片 |
