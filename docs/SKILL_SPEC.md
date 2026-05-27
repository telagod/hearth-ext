# Hearth Skill Specification v1.0

> **A skill is one markdown file. One file = one workflow. No nested agents.**

skill.md 是 Hearth 自动化编排的最小单元。灵感取自 Anthropic Agent Skills，
但**强约束线性、可解释、沙箱化**——不是 LangGraph，不是 CrewAI。

---

## 1 · 文件结构

```markdown
---
name: weekly-review            # 必填，slug
version: 1.0.0                 # 必填，SemVer
description: ...               # 必填，< 120 字
author: hearth-team            # 可选

trigger:                       # 必填
  type: cron | event | manual
  schedule: "0 9 * * MON"      # type=cron 时必填，5 段 cron
  event: note.create | inbox.add | tab.recall | ...
                               # type=event 时必填

tools:                         # 必填，白名单
  - db.query
  - db.upsert
  - llm.summarize
  - ui.notify

permissions:                   # 必填
  llm: required | optional | none
  network: optional | none
  storage: required

inputs:                        # 可选，事件触发时传入
  - name: note_id
    type: integer
    required: true

outputs:                       # 可选，声明产物
  - name: cards
    type: array

timeout: 30                    # 秒，硬上限
schedule_jitter: 30            # 秒，cron 错峰
---

# {{ description }}

## 步骤

1. **<动作动词>** ...
2. ...

## 提示词（可选）

```prompt:llm.summarize
你是 Hearth 的周回顾助手……
```

## 错误处理（可选）

- llm 限流 → 退避 60s 重试一次，仍失败则降级为纯统计输出
```

---

## 2 · 触发器（trigger）

### 2.1 `cron`

5 段标准 cron，时区 = 系统本地。
`chrome.alarms` 最小粒度 30 秒，**实际生效粒度 = max(cron, 1min)**。

```yaml
trigger:
  type: cron
  schedule: "0 9 * * MON"      # 每周一 9 点
```

### 2.2 `event`

| event | payload |
|---|---|
| `note.create` | `{ note_id }` |
| `note.update` | `{ note_id, changed_fields }` |
| `inbox.add` | `{ inbox_id }` |
| `tab.recall` | `{ url, title, snippet }` |
| `chat.complete` | `{ conversation_id, message_id }` |
| `app.startup` | `{}` |

### 2.3 `manual`

只能通过 sidepanel → Skills 面板手动触发。

---

## 3 · 工具（tools）白名单

### 3.1 `db.*` — 数据库

| 工具 | 签名 | 权限 |
|---|---|---|
| `db.query(sql, params)` | 任意 SELECT | 只读 |
| `db.upsert(table, row)` | INSERT OR REPLACE | 受控表白名单 |
| `db.tag(note_id, tags[])` | 加标签 | - |
| `db.link(src, dst, kind)` | 建链接 | - |
| `db.archive(note_id)` | 归档 | - |

`db.query` SQL 必须以 `SELECT` 开头，禁用 PRAGMA/ATTACH/INSERT/UPDATE/DELETE。

### 3.2 `llm.*` — LLM 调用

| 工具 | 用途 |
|---|---|
| `llm.summarize({text, max_tokens})` | 摘要 |
| `llm.tag({text, k})` | 抽 k 个标签 |
| `llm.narrate({template, vars})` | 拟人化旁白（温度引擎） |
| `llm.chat({messages, tools})` | 通用对话 |

所有 `llm.*` 调用都走 LLM Adapter，记 `llm_calls` 表，受设置面板的 BYOK 与"出网明示"约束。

### 3.3 `ui.*` — 用户界面

| 工具 | 行为 |
|---|---|
| `ui.notify({title, body, cardId})` | 系统通知 + sidepanel 推送 |
| `ui.card({title, items[]})` | 推一张主题卡到 sidepanel |
| `ui.toast({msg, level})` | 短提示 |

### 3.4 `inbox.*`

| 工具 | 行为 |
|---|---|
| `inbox.list({kind?, status?})` | 列表 |
| `inbox.promote(inbox_id)` | 转为 note |
| `inbox.discard(inbox_id, reason?)` | 丢弃 |
| `inbox.expire_sweep()` | TTL 清理 |

### 3.5 `extract.*` — 抽文（按需）

| 工具 | 行为 |
|---|---|
| `extract.web({url})` | 抓页面并清洗为 md |
| `extract.docx({blob})` | 抽 docx |
| `extract.pdf({blob})` | 抽 pdf 文本 + 页号 |
| `extract.ocr({blob})` | 图像 OCR（lazy load） |

### 3.6 工具调用语法

skill 正文用 fenced code block 声明调用：

````markdown
```call:db.query
SELECT id, body FROM notes
WHERE created_at > strftime('%s','now') - 7*86400
  AND kind = 'highlight'
LIMIT 100
```

```call:llm.summarize
text: |
  {{ steps.1.result | join("\n") }}
max_tokens: 400
```
````

`{{ }}` 是 minijinja 语法。可访问：
- `steps.N.result` — 上一步输出
- `inputs.*` — trigger 传入参数
- `env.now`, `env.user_lang`, `env.installation_id`

---

## 4 · 权限（permissions）

| key | 值 | 含义 |
|---|---|---|
| `llm` | required / optional / none | required: 无 LLM 则停跑；optional: 降级；none: 离线 |
| `network` | optional / none | 是否允许外网（含自定义 endpoint） |
| `storage` | required | 默认 required |
| `clipboard` | optional / none | 是否读剪贴板 |

设置面板按 skill 独立管控，**用户随时可关**。

---

## 5 · 沙箱（执行环境）

| 约束 | 上限 |
|---|---|
| 单次运行总时长 | 30 s |
| 单步 LLM 调用 | 15 s |
| 内存 | 64 MB |
| 步骤数 | 32 |
| db.query 返回行数 | 1000 |
| 调用 ui.notify 频次 | 10/run |

超限：硬中断 + `skill_runs.status = failed`。

---

## 6 · 错误与重试

- 工具调用抛错 → 落 `skill_runs.error`，**默认中断**
- skill 可声明 `on_error: continue` 跳过该步
- 整 skill 失败：保留日志；下次 cron 正常执行（不顺延）

---

## 7 · 内置 skill（M3 交付）

| skill | trigger | 作用 |
|---|---|---|
| `inbox-tidy` | cron 每日 22:00 | 候选打标签 + TTL 清理 |
| `weekly-review` | cron 每周一 09:00 | 主题卡周回顾 |
| `tag-suggest` | event note.create | 自动建议 3 个标签 |
| `link-similar` | event note.create | 找库内相关并加 wiki link |
| `monthly-purge` | cron 每月 1 号 03:00 | 冷藏候选标记 |

样本见 `skills_examples/` 目录。

---

## 8 · 校验与发布

- 加载时用 `zod` 校验 frontmatter
- 工具调用名必须在白名单
- 步骤数、prompt 大小、cron 合法性检查
- 三级发布：
  1. **L0 本地** — 用户自写，无审核
  2. **L1 项目** — 内置 5 个，团队评审
  3. **L2 社区** — 提交到 `skills_community/`，PR 审核

---

## 9 · 反规范（明确禁止）

- ❌ 嵌套 agent / multi-agent collab
- ❌ 任意 shell / fetch / DOM 访问
- ❌ 调用未注册的 tool
- ❌ 递归 skill（skill 调 skill）—— 用 trigger event 解耦
- ❌ 直接读写 OPFS 裸文件
- ❌ 在 frontmatter 之外的隐藏指令
