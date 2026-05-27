# Hearth · Chrome Web Store 上架材料

> 这份文件包含 CWS（与 Edge Add-ons）发布所需的所有文案与材料清单。
> 上架前请把每节文本填到 Developer Dashboard 对应字段，截图/推广图按尺寸生成。

---

## 1. 单一目的（Single purpose）

**英文版**（必填）

> Hearth helps you remember what you read on the web. It captures highlights
> you select, indexes them locally with SQLite + FTS5, and surfaces older
> related notes as you browse new pages — all entirely on your device.

**中文版**

> Hearth 让你记住读过的内容：捕捉你主动选中的高亮，本地 SQLite + FTS5 索引，
> 浏览新页面时把过去相关的笔记自动浮起 —— 全程在你这台设备上。

---

## 2. 详细描述（Detailed description, ~10k char allowed）

> 仓库与演示站已上线：
> - Repo: https://github.com/telagod/hearth-ext
> - Site: https://telagod.github.io/hearth-ext/

```
Your reading, remembered. Quietly.

Hearth is a local-first knowledge companion that lives in your browser side
panel. It captures the highlights you select, indexes them with on-device
SQLite + FTS5, and proactively resurfaces relevant past notes when you visit
related pages — so old reading isn't lost to your bookmarks bar.

WHY HEARTH IS DIFFERENT
- Local-first: All notes live in your OPFS-backed SQLite database. Nothing
  leaves your device by default.
- Reverse recall: A subtle orb appears on pages where Hearth recognizes
  related notes you've highlighted before. Click to see them.
- BYO LLM: Optionally bring your own Anthropic, OpenAI, or local Ollama key
  to enrich notes with summaries and an AI "warmth narrative" — every call
  is audited locally and visible in Settings.
- Skill engine: write small skill.md files that run on cron or events to
  automate your knowledge maintenance.
- File ingest: drag .docx, .pdf, .png, .md into the side panel to extract
  and index them.

PRIVACY YOU CAN INSPECT
- Past 7 days of every external call is shown in Settings, with byte counts.
- Cloud LLM calls require explicit consent re-confirmed every 24 hours.
- Banks, mail, accounts, and other sensitive hosts are excluded by default.
- Open source under the MIT license — read the code at https://github.com/telagod/hearth-ext.

EXPORT YOUR DATA ANYTIME
- One-click export to ZIP, Obsidian Vault, or single-file JSON.
- Your data stays yours, even if you uninstall.

REQUIRES
- Chromium 116+ (Chrome / Edge / Arc / Brave)
- Optional: API key from Anthropic, OpenAI, or a local Ollama instance.

GETTING STARTED
1. Pin the Hearth icon to your toolbar.
2. Open any article, select a paragraph, and click the save button in the
   floating bar.
3. Open the side panel to see your library grow.
4. Optionally, go to Settings → Provider, set up an LLM, and click "I agree".

Hearth is open source: https://github.com/telagod/hearth-ext
Live demo:             https://telagod.github.io/hearth-ext/
```

---

## 3. Justification 文档（permissions justification）

Each permission requires a 1-2 sentence reason for CWS reviewers.

| Permission | Justification |
|---|---|
| `storage` | Persists user settings (API keys, language, recall toggle). |
| `tabs` | Reads the current tab's title/URL so the recall orb knows what page the user is on. |
| `scripting` | Injects the floating highlight bar and recall orb into pages. |
| `alarms` | Triggers user-defined skills on a schedule (e.g. weekly review). |
| `offscreen` | Hosts the SQLite WASM database with OPFS persistence — required because service workers cannot keep long-lived file handles. |
| `contextMenus` | Adds "Save selection to Hearth" to the page right-click menu. |
| `notifications` | Notifies the user when a scheduled skill produces a result (e.g. weekly review). |
| `sidePanel` | Hosts the main Library / Chat / Inbox / Skills UI. |
| `unlimitedStorage` | Local SQLite database may grow beyond the default 5MB quota for power users. |
| `clipboardRead` (optional) | If user opts in to clipboard-listening L0 candidates. Off by default. |
| `<all_urls>` (host) | The floating bar must be injectable on any page. Excludes are listed in manifest (bank, mail, accounts, alipay) and extensible by users. |
| `https://api.anthropic.com/*` (opt host) | LLM provider (user-selected). |
| `https://api.openai.com/*` (opt host) | LLM provider (user-selected). |
| `http://localhost:11434/*` (opt host) | Local Ollama provider. |

---

## 4. 隐私实践声明（Privacy practices）

Required CWS form fields:

### Single purpose
✅ As declared in §1.

### Personally identifiable information
- **Collected**: ❌ No
- **Stored**: ❌ No
- **Shared with third parties**: ❌ No

### What user data is handled?
- **Authentication info**: User's own API key (LLM provider) — stored encrypted in chrome.storage.local. Never transmitted to anyone except the provider the user explicitly chose.
- **Web history**: ❌ Not collected. Hearth only stores text the user actively highlights or files they drag in.
- **Personal communications**: ❌ Not collected.
- **Location / Health / Financial / Authentication tokens**: ❌ Not collected.
- **Web content** (the highlights themselves): Stored locally only.

### Data usage
- ✅ Local-only storage
- ✅ User-initiated transmission only (LLM calls require per-24h consent)
- ❌ Sold to third parties
- ❌ Used for advertising
- ❌ Used for creditworthiness or lending

### Remote code
- ❌ No remote code execution.
- Tesseract OCR worker/core are bundled locally. Language traineddata is fetched once per language from https://tessdata.projectnaptha.com/4.0.0 and cached in IndexedDB.

---

## 5. 推广图 / 截图清单

CWS 要求的图像资产（按 1280×800 推荐尺寸）：

| 名称 | 尺寸 | 用途 | 状态 |
|---|---|---|---|
| Small promo tile | 440×280 | 列表预览 | TODO |
| Marquee promo | 1400×560 | 首页特色 | TODO |
| Screenshot 1 | 1280×800 | sidepanel Library | TODO |
| Screenshot 2 | 1280×800 | 选中浮 bar + 召回 orb | TODO |
| Screenshot 3 | 1280×800 | Chat 视图 + 引用块 | TODO |
| Screenshot 4 | 1280×800 | Settings + 出网审计 | TODO |
| Screenshot 5 | 1280×800 | Skill 编辑器 + 高亮 | TODO |

生成建议：用 `npm run mockup` 或站点 `site/index.html` 作背景，浏览器全屏截图后裁切到目标尺寸。

---

## 6. 类目与标签

- **Category**: Productivity
- **Tags**: knowledge management · note-taking · highlights · local-first · ai · privacy · sqlite · open source

---

## 7. 发布检查清单

发布前过一遍：

- [ ] `package.json` version bumped & `manifest.json` version 同步
- [ ] `npm run build` 通过，无警告
- [ ] `npm run test` 全部通过
- [ ] 跑一次 SMOKE.md 完整 9 步
- [ ] 5 张截图就位（含明暗模式各 1）
- [x] **演示站部署成功** → https://telagod.github.io/hearth-ext/
- [x] STORE.md 里 repo / site URL 已填实
- [ ] CWS Developer Dashboard 填好 Homepage URL = 演示站 URL
- [ ] privacy practices 表单填好
- [ ] justification 文档复制进 dashboard
- [ ] `LICENSE` 与 `README.md` 链接更新
- [ ] `npm run package` 生成 `hearth-<version>.zip`
- [ ] 内部 dogfood 1 周后再点 Submit for review

---

## 8. 打包脚本

```bash
# 生成 hearth-0.0.x.zip
npm run package

# 产物：项目根目录的 hearth-<version>.zip
# 直接拖入 CWS Dashboard "Upload new package"
```

`package.json` 已配 `package` 脚本：
```json
"package": "npm run build && cd dist && zip -r ../hearth-${npm_package_version}.zip ./*"
```
