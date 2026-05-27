# Hearth · MVP Smoke Test

> **M5 交付状态 · 2026-05-26 · 上架就绪**

## ✅ 交付时间线

| 里程碑 | 范围 | 状态 |
|---|---|---|
| **M1** | 基石（manifest/SW/Offscreen/SQLite/FTS5/浮 bar/Library） | ✅ |
| **M2** | 温度引擎（LLM Adapter ×3 / Recall Orb / Chat / 隐私审计） | ✅ |
| **M3** | 编排（Skill Engine / 5 个内置 skill / Inbox CRUD / 数据导出 / 流式） | ✅ |
| **M4** | 输入源（L0 候选探针 / docx / pdf / 图片 OCR / 拖入 UI） | ✅ |
| **M4.5** | 打磨（Skill 编辑器 / SPA 路由 / SimHash LSH） | ✅ |
| **M5** | 门面（Tesseract 本地化 + i18n + 演示站 + CWS 上架包） | ✅ |

## 🆕 M5 新增能力

### 1. 大库 benchmark（scripts/bench-recall.mjs）

| 路径 | p50 | p95 | 备注 |
|---|---|---|---|
| FTS-only | 5.21 ms | 6.25 ms | 关键词召回 |
| **LSH-banded** | **0.06 ms** | **0.14 ms** | **144× speedup over full scan** |
| Full scan | 9.79 ms | 13.62 ms | O(n) 基线 |

完整报告：`docs/BENCHMARK.md`

### 2. Skill 编辑器打磨

- 自写 syntax highlighter（200 行，无 Monaco 2MB 依赖）
- 实时关键字着色：YAML key / call:tool / SQL / {{ tpl }} / markdown headings
- Tab 自动补全工具名（输入 `db.` → 弹下拉 → ↑↓ 选 → Enter）
- 透明 textarea 覆盖在高亮层上，滚动同步

### 3. Tesseract 本地化

- core + worker 拷进 `dist/tesseract/`（5.6 MB simd-lstm 变体）
- traineddata 首次按需下载到 IndexedDB（10 MB/语言），后续完全离线
- manifest CSP 已加 `https://tessdata.projectnaptha.com` 白名单
- web_accessible_resources 暴露 `tesseract/*`

### 4. i18n 全覆盖

- `src/shared/i18n.ts` + `strings.ts` — 80+ key × zh/en 两套
- React `useT()` hook + 静态 `t(key, vars)`
- 自动检测 `chrome.i18n.getUILanguage()`，Settings 内可切换
- 全部 UI 文案已替换（TabBar / Library / Inbox / Settings / DropZone / Chat）

### 5. 演示站（site/）

```
site/
├── index.html       landing — hero + features + privacy + install + roadmap
├── mockup.html      复用 mockups/index.html 的设计稿
├── docs.html        文档索引
├── css/site.css     共享视觉语言（ink + ember 调色）
└── img/hearth.svg   品牌 SVG
```

直接 `open site/index.html` 即可看；部署到 GitHub Pages 一键：`gh-pages -d site`。

### 6. Chrome Web Store 上架包

- `docs/STORE.md` —— 完整文案 + permission justification + 隐私声明 + 检查清单
- `docs/promo/*.png` —— 1400×560 marquee + 440×280 tile + 1280×800 screenshot fallback + 128 store icon
- `scripts/gen-promos.mjs` —— 用 resvg 渲染 SVG，可重新生成
- `npm run package` —— 自动 build + zip 输出 `hearth-<version>.zip`

## 📦 M5 产物体积（关键收口）

```
dist/                      5.8 MB    (M4 8.5 MB → -2.7 MB)
└── 含 tesseract core + worker

hearth-0.0.1.zip           2.1 MB    上架包（gzip 压缩后）
```

**砍体积手段**：
- 去 production sourcemap（开 `HEARTH_SOURCEMAP=1` 调试用）
- tesseract 只保留 simd-lstm 一个变体（去 non-simd fallback）
- traineddata 全部按需下载到 IndexedDB

## 🧪 M5 体验路径

```bash
npm install --legacy-peer-deps
npm run build               # → dist/ 5.8 MB
npm run package             # → hearth-0.0.1.zip 2.1 MB

# 加载到 Chrome
# chrome://extensions → 开发者模式 → 加载已解压 → dist/

# 跑 benchmark
npx tsx scripts/bench-recall.mjs

# 看演示站
open site/index.html        # 或部署 site/ 到 GH Pages
```

### M5 体验清单

| # | 动作 | 期望 |
|---|---|---|
| 1 | Skills tab → 新建 skill | 编辑器打开，高亮生效 |
| 2 | 输入 `\`\`\`call:db.` | 自动弹补全下拉 |
| 3 | ↑↓ 选 → Enter | 补全填入 |
| 4 | Settings → 界面语言 → English | 整个 UI 切英文 |
| 5 | 拖一张 PNG 截图入 Library | 首次下载 traineddata（联网，~10MB），后续离线 |
| 6 | 打开 `site/index.html` | 看 landing 站 |
| 7 | `npm run package` | hearth-0.0.1.zip 出炉 |

## 📚 测试覆盖 (61 → 74)

```
✓ messages         4 tests
✓ skill-parser     7 tests
✓ simhash         10 tests
✓ keywords         7 tests
✓ warmth           5 tests
✓ llm-adapters     7 tests
✓ template         9 tests
✓ zip              3 tests
✓ extract          4 tests
✓ probe            5 tests
✓ i18n             5 tests   🆕
✓ skillHighlight   8 tests   🆕

Total: 74 tests · 0 flaky
```

## 🔍 下一步（M6 / 持续运维）

1. **真上架** — 跑完 `docs/STORE.md` 检查清单 → 提交 CWS review
2. **演示站部署** — push `site/` 到 gh-pages branch；填进 store description
3. **dogfood 一周** — 真用，记 bug
4. **社区 skill 仓** — `skills_community/` + PR 模板
5. **大库优化** — 100k 实测 + LSH 调阈值
6. **视频/音频** — Whisper.cpp WASM 转写

## 🆕 M4.5 新增能力

### 1. Skill 编辑器（sidepanel/components/SkillEditor.tsx）

- Skills 面板加「新建 skill」按钮 + 每张卡上「编辑」(feather)
- 行号槽位 + tab 转空格 + spellcheck-off 的 plain 编辑器（不上 Monaco —— 包体不让步）
- **实时校验**：frontmatter 形状 / name slug / 工具白名单 / 步骤数硬上限 / declared vs used 工具一致性
- **干跑**：先 upsert 入库 → 调 `skill.run` manual trigger → 运行结果直接显示
- 用户 skill 会带 `source: 'user'` 标签（与 builtin 区分）
- 默认模板（STARTER）包含完整的 frontmatter + 一个 db.query 步骤示范

### 2. SPA 路由探针（content/spa.ts）

统一 hook：
- `history.pushState` / `history.replaceState`（monkey patch）
- `popstate` event
- `hashchange` event

三方订阅：
- recall orb：路由变化 → 隐藏旧 orb → 1.5s 后重探当前页
- deep-read 探针：**完整状态重置**（dwell / scroll / selections / fired flag）
- 未来：tab/badge 跟随路由更新

去重：只有 `location.href` 真变化时才触发，避免 SPA 内部多余调用。

### 3. Tab-close 信号上移到 SW

旧实现：content script `beforeunload` 监听 — 快速关闭时不保证发送。  
新实现：SW 端 `chrome.tabs.onUpdated` 记录 url + openedAt，`chrome.tabs.onRemoved` 计算 dwell，> 25min 入 inbox。  
**可靠性显著提升**，且不依赖页面响应。

### 4. SimHash LSH 分桶（offscreen/simhash.ts + migrations/0002）

把 64-bit hash 切 4 × 16-bit band，每段单独索引：

| 距离 | 命中率（理论） | 命中率（实测 100 次） |
|---|---|---|
| ≤ 3 bits | 100%（pigeonhole 严格） | 100% |
| ≤ 8 bits | ~95% | > 60% （deterministic seed） |
| ≤ 18 bits | ~70% | 概率性 |

**召回管道现在是双通道并集**：FTS5 关键词召回 ∪ LSH 近似召回。后者补的是"无关键词重叠但内容近似"——翻译、改写、OCR 错字。

迁移：
- `0002_simhash_lsh.sql` 加 4 列 + 4 索引
- 旧库自动 backfill：SW 启动 1.5s 后 chunks of 500 行 lazy 补齐

## 🧪 M4.5 体验路径

```bash
npm run build
# chrome://extensions → 重新加载扩展
```

### 步骤清单

| # | 动作 | 期望 |
|---|---|---|
| 1 | Skills tab → 新建 skill | 编辑器打开，模板已填好 |
| 2 | 改一行 frontmatter，引入未声明工具如 `db.delete` | 实时 ✗ 红条："未知工具：db.delete" |
| 3 | 改回合法值 → 看到 ✓ 绿条 + 步骤/工具计数 | 校验通过 |
| 4 | 点「干跑」 | upsert + manual trigger，下方 dry-out 显示派发结果 |
| 5 | 回 Skills 列表 → 看到新 skill 带 USER 紫标 + 运行历史 | OK |
| 6 | 在 React/Vue SPA 站（如 react.dev） | 路由切换时 orb 重新探测 |
| 7 | 在 SPA 上停 1min + 滚到底 + 选过 → 路由切换 → 再做一次 | 第二个路由也能触发 deep-read（不再被 fired flag 锁死） |
| 8 | 在浏览器开几个长读 tab 26 分钟以上后关 | Inbox 自动出现 tab_close 候选 |
| 9 | 灌 100 条相似笔记后试 recall | LSH 命中无关键词重叠的近似内容 |

## 📦 M4.5 产物体积

```
dist/                                  ~8.5 MB （M4 → +0.1 MB，主要是 SkillEditor）
└── 各 chunk 略增 1-3 KB
```

闲置时仍只装 4.6 MB；编辑器 / mammoth / pdf / tesseract 全部 lazy。

## 📚 测试覆盖 (56 → 61)

```
✓ tests/messages.test.ts        4 tests
✓ tests/skill-parser.test.ts    7 tests
✓ tests/simhash.test.ts        10 tests   (+5 LSH bands)        🆕
✓ tests/keywords.test.ts        7 tests
✓ tests/warmth.test.ts          5 tests
✓ tests/llm-adapters.test.ts    7 tests
✓ tests/template.test.ts        9 tests
✓ tests/zip.test.ts             3 tests
✓ tests/extract.test.ts         4 tests
✓ tests/probe.test.ts           5 tests

Total: 61 tests · 0 flaky (5x consecutive runs)
```

## 🔍 下一步（M5 / 真上线）

1. **Tesseract 本地化** — 把 worker + traineddata 嵌入 dist，OCR 离线可用
2. **i18n 落地** — zh / en 覆盖全部 UI 文案（目前仍硬编码中文）
3. **演示站 + 文档站** — GitHub Pages，mockup 嵌入，截图视频
4. **Chrome Web Store 准备** — 隐私声明、3 张推广图、justification 文档
5. **大库压测** — 10k / 100k notes benchmark（验证 LSH 实战 speedup）
6. **Skill 社区** — `skills_community/` 仓库 + PR 模板

## 🆕 M4 新增能力

### 1. L0 候选信号源（content/probe.ts）

三个非侵入性探针，全部走 settings 开关：

| 信号 | 触发条件 | 默认 |
|---|---|---|
| **clipboard** | 用户 `Ctrl+C` 复制选区 ≥ 12 字符 | **opt-in**（隐私 — 默认关） |
| **deep-read** | 停留 > 60s + 滚动 > 50% + 至少 1 次选择 | 默认开 |
| **tab-close** | 标签页持有 > 25 分钟后关闭 | 默认开 |

去重：同一 URL 同一片段会话内只触发一次。  
deny-list：bank / mail / alipay / accounts / notion 默认全屏蔽（在 `probe.ts` 与 `manifest.json` 双层防护）。

### 2. 三种文件抽文（offscreen/extract.ts）

| 格式 | 库 | 切割 |
|---|---|---|
| `.docx` | mammoth.js（lazy ~488K） | 按段落 + heading 启发分块 |
| `.pdf` | pdf.js（lazy ~327K） | 按页号分段 |
| `.png/.jpg/.webp` | tesseract.js（lazy ~11M，首次联网下载） | 英文 + 简中默认；whole image |
| `.md/.txt/.csv` | 内置 | 整文件一段 |

ingestExtracted：
1. 建一个 `sources` 行（uri = `file://<name>#<jobId>`）
2. 每个 part 一条 `notes`（kind = clip / image_ocr）
3. 整个过程在 transaction 内，要么全成要么全回滚

### 3. 文件拖入 UI（sidepanel/components/DropZone.tsx）

- Library 顶部一个拖入区
- 接受拖拽 + 点击选择
- 多文件并行
- **逐文件进度条**（offscreen 通过 `extract.progress` 消息广播 frac + stage）
- 50 MB 硬上限
- 完成后显示 `<kind> · <parts> 段 · note#<id>`

### 4. extract.* 工具白名单已激活

skill body 里可以这样调（未来给 file-watch skill 用）：

```yaml
```call:extract.docx
bytes_b64: "{{ inputs.b64 }}"
```
```

但 M4 实现暂未把 skill 中的 extract.* 接通 ingest 路径（这是 M5 的 skill 编辑器一并解决）。

## 🧪 M4 体验路径

```bash
npm install --legacy-peer-deps   # 已装跳过
npm run build
# chrome://extensions → 加载已解压 → dist/
```

### 步骤清单

| # | 动作 | 期望 |
|---|---|---|
| 1 | Settings → 监听剪贴板 √ → 保存 | clipboard probe 启用 |
| 2 | 任意页面停留 1 分钟、滚到底、选中过文字 | 后台触发 deep-read → Inbox tab 出现一条 read 候选 |
| 3 | 复制一段文字（>12 字符）| Inbox 出现 clip 候选 |
| 4 | Library tab → 拖一个 .docx 到拖入区 | 进度条 0→100，完成后多个 note 入库 |
| 5 | 拖一个 .pdf | 按页拆分入库，每页一个 §N 标记的 note |
| 6 | 拖一张截图 .png（联网） | 首次会下载 tesseract worker + traineddata（~11M）；OCR 文字入库 |
| 7 | Inbox tab → ✓ 把候选转 note | 真转，且对应页面 source 复用 |
| 8 | Library 搜索 PDF 内的关键词 | FTS5 命中页内段落 |

### 限制 / 警告

- ⚠ **Tesseract OCR 首次需联网**：worker JS + traineddata 从 CDN 下载（unpkg/jsdelivr）。Chrome MV3 的 CSP `script-src 'self'` 会阻塞 — M5 将本地化 worker
- ⚠ deep-read 探针不在 SPA 路由变化时重置（M5 再补）
- ⚠ tab-close 信号在快速关闭浏览器时可能丢失（beforeunload 不保证）
- ⚠ extract.docx 当前用 extractRawText 简化版；HTML+表格保留待 M5

## 📦 M4 产物体积

```
dist/                                  ~8.4 MB
├── 初始加载（必装）                    ~4.6 MB
│   ├── sqlite3.wasm                   938 KB
│   ├── sqlite3-worker.js              206 KB
│   ├── offscreen.js                   243 KB    +extract router
│   ├── background.js                  194 KB
│   ├── sidepanel.js                   169 KB    +DropZone
│   ├── messages.js (zod)               58 KB
│   ├── content.js                      16 KB    +probe
│   ├── icons / locales / skills       ~25 KB
│   └── ……
└── Lazy（按需）                       ~3.7 MB
    ├── mammoth.browser.js             488 KB    docx 抽文
    ├── pdf.js                         327 KB    pdf 抽文
    ├── tesseract worker stub           16 KB    image OCR (远程 worker)
    └── adapters / settings              ~7 KB
```

闲置时只装 4.6 MB；拖 docx 才装 mammoth，拖图片才装 tesseract——按需付费。

## 📚 测试覆盖 (47 → 56)

```
✓ tests/messages.test.ts        4 tests  (zod schema)
✓ tests/skill-parser.test.ts    7 tests  (skill.md 解析)
✓ tests/simhash.test.ts         5 tests  (LSH)
✓ tests/keywords.test.ts        7 tests  (TF-IDF + cjk)
✓ tests/warmth.test.ts          5 tests  (prompt + fallback)
✓ tests/llm-adapters.test.ts    7 tests  (3 家 + SSE)
✓ tests/template.test.ts        9 tests  (mini jinja)
✓ tests/zip.test.ts             3 tests  (PKZIP)
✓ tests/extract.test.ts         4 tests  (text/md 路径)        🆕
✓ tests/probe.test.ts           5 tests  (deny-list 正则)       🆕

Total: 56 tests
```

## 🔍 下一步（M5）

1. **Tesseract 本地化** — 把 worker + traineddata 嵌入 dist，OCR 离线可用
2. **Skill 编辑器** — sidepanel 写 skill.md，热加载，调试
3. **演示站 + 文档站** — GitHub Pages，含 mockup 嵌入
4. **i18n 落地** — zh / en 两套 messages.json 覆盖全部文案
5. **Chrome Web Store 准备** — 描述、截图、隐私声明、3 张推广图
6. **性能** — 大库 (>5k notes) 引入 SimHash LSH 分桶


## 🆕 M3 新增能力

### 1. Skill Engine 真跑

| 模块 | 文件 | 角色 |
|---|---|---|
| Mini template engine | `src/background/template.ts` | `{{ }}`、`{% for %}`、`{% if %}`、`\| filter` |
| Tool dispatcher | `src/background/tools.ts` | 21 个白名单工具（db / llm / ui / inbox / extract） |
| Skill runner | `src/background/skillRunner.ts` | 步骤执行 + 30s 超时 + skill_runs 落账 |
| Scheduler | `src/background/scheduler.ts` | 启动加载 / cron 计算 / event 触发 / 手动 |

启动时自动加载 `dist/skills/*.md` 5 个内置 skill 入库；cron 用 `cron-parser` 计算下次时间，注册 `chrome.alarms`；alarm 触发 → runner → skill_runs 表持久化。

### 2. Event 触发

`capture.highlight` 入库后自动触发 `note.create` 事件 → 命中 `tag-suggest` / `link-similar` 异步运行。

### 3. Inbox 真 CRUD

- ✓ 按钮：候选 → notes 表（自动建 sources，状态置 accepted）
- × 按钮：状态置 discarded
- 全部走 `db.mutate` op，落审计

### 4. Skills 面板可视化

- 启用/禁用开关（toggle）
- 手动运行按钮
- 展开后显示该 skill 最近 10 次运行历史（时间 / 触发源 / 状态 / 耗时）
- 8 秒自动刷新

### 5. 数据导出三种格式

| 格式 | 内容 |
|---|---|
| **完整 ZIP** | `notes/*.md` + `skills/*.md` + `data/*.json` + `manifest.json` + `README.md` |
| **Obsidian Vault** | `notes/*.md`（YAML frontmatter）+ `skills/*.md`，可直接当 Vault 打开 |
| **JSON 单文件** | 全库 JSON 快照（小库可塞一个文件） |

实现：`src/offscreen/export.ts` + `src/offscreen/zip.ts`（自写 PKZIP store-only，无依赖）。

### 6. Chat 流式 UX

- `chrome.runtime.connect({ name: 'hearth/llm-stream' })` 长连
- SW 接 `adapter.stream()` 的 `AsyncIterable<string>`，逐 token 转发
- Sidepanel 接 `port.onMessage` 累积渲染——token-by-token 出现
- 完成后自动审计 `llm_calls`

## 🧪 M3 体验路径

```bash
npm install --legacy-peer-deps   # 已装跳过
npm run build
# chrome://extensions → 加载已解压 → dist/
```

### 步骤清单

| # | 动作 | 期望 |
|---|---|---|
| 1 | 加载扩展 → 等 2-3 秒 | SW 启动 → Skills 面板出现 5 个内置 skill |
| 2 | Skills tab → 点 weekly-review 旁的 ▷ | 手动触发；2-3s 后展开看到 status: succeeded（或 failed 并附错误） |
| 3 | 任意网页选中 → 浮 bar 点保存 | 入库；后台 tag-suggest 自动跑（看 Skills → tag-suggest 历史） |
| 4 | Inbox tab | 候选列表（M4 才有真候选源；可手动 SELECT 模拟） |
| 5 | Settings → 数据 → 完整 ZIP | 弹出下载 `hearth-<时间戳>.zip` |
| 6 | 解压 zip → 查看 notes/*.md | 每个笔记一个 md，含 frontmatter |
| 7 | Chat tab → 配 LLM + 同意 + 输入问题 | **token 一个一个出现**，不是整段砸下来 |
| 8 | Settings → 过去 7 天云端调用 | 出现 chat / warmth 调用记录 |
| 9 | 重启浏览器 | OPFS 持久化 + skills 自动重新调度 |

### 已知局限（→ M4）

- ⚠ 真实 L0 候选信号源（剪贴板 / 深度阅读 / 截图）M4 做
- ⚠ Office/PDF/图片抽文 M4 做（extract.* tool 当前是 stub）
- ⚠ Inbox 无候选时 UI 显示空状态——可在 console 跑 `chrome.runtime.sendMessage` 手动塞测试候选
- ⚠ Skills 编辑器（在 sidepanel 写 skill.md）M5
- ⚠ 反向召回 orb 在 SPA 框架（React/Vue）站点偶尔不重探（pushState hook 已加，但若用 hash 路由就漏）

## 📦 M3 产物体积

```
dist/                                  ~4.9 MB   (M2 → M3 + 0.9 MB)
├── sqlite3.wasm                       938 KB
├── sqlite3-worker.js                  206 KB
├── offscreen.js                       239 KB    + zip + export
├── background.js                      196 KB    + scheduler + cron-parser + skillRunner
├── sidepanel.js                       166 KB
├── messages.js (zod)                   58 KB
├── content.js                          14 KB
├── llm/{anthropic,openai,ollama}.js    各 ~2 KB    code-split lazy
└── icons / _locales / skills           ~ 25 KB
```

cron-parser 进 SW bundle 是体积主增（~50 KB）；M4 可考虑替为自写 5 段 cron。

## 📚 测试覆盖（47 → +12）

```
✓ tests/messages.test.ts        4 tests  (zod schema)
✓ tests/skill-parser.test.ts    7 tests  (skill.md 解析)
✓ tests/simhash.test.ts         5 tests  (LSH)
✓ tests/keywords.test.ts        7 tests  (TF-IDF + cjk)
✓ tests/warmth.test.ts          5 tests  (prompt + fallback)
✓ tests/llm-adapters.test.ts    7 tests  (3 家 + SSE 解析)
✓ tests/template.test.ts        9 tests  (mini jinja)         🆕
✓ tests/zip.test.ts             3 tests  (PKZIP 头/EOCD/CJK)  🆕

Total: 47 tests
```

## 🔍 下一步（M4）

1. **L0 真信号源** — 剪贴板/深度阅读/截图候选自动入 Inbox
2. **Office/PDF/图片抽文** — mammoth + pdf.js + Tesseract（按需 lazy）
3. **Skill 编辑器** — sidepanel 内热加载/校验/调试 skill.md
4. **Recall 性能** — 大库 (>5k 笔记) 时引入 SimHash 分桶 LSH
5. **i18n 落地 + 演示站 + Chrome Web Store 准备**


