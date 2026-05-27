---
name: weekly-review
version: 1.0.0
description: 每周一上午 9 点，把上周所有高亮聚成 3-5 张主题卡推给你
author: hearth-team
trigger:
  type: cron
  schedule: "0 9 * * MON"
tools:
  - db.query
  - llm.summarize
  - llm.tag
  - ui.card
permissions:
  llm: required
  network: optional
  storage: required
timeout: 30
schedule_jitter: 60
---

# 上周回顾

把过去 7 天读过的内容，温柔地交还给你。

## 步骤

### 1. 拉取上周高亮

```call:db.query
SELECT n.id, n.body, n.context_before, s.title, s.site_name, n.created_at
FROM notes n
LEFT JOIN sources s ON s.id = n.source_id
WHERE n.kind IN ('highlight','note','annotation')
  AND n.created_at > strftime('%s','now') - 7*86400
  AND n.archived = 0
ORDER BY n.created_at
LIMIT 200
```

### 2. LLM 聚主题

```call:llm.summarize
template: |
  下面是用户过去 7 天的 {{ steps.1.result | length }} 条高亮。
  把它们聚成 3-5 个主题，每个主题给一个标题（≤ 12 字）和 2-3 句温度旁白。
  语气：像在火炉边轻声提醒。不要列表式总结，写成段。

  高亮列表：
  {% for h in steps.1.result %}
  - 【{{ h.title }}】{{ h.body }}
  {% endfor %}

  输出 JSON：[{title, narrative, note_ids: [...]}]
max_tokens: 1200
format: json
```

### 3. 推送到 sidepanel

```call:ui.card
title: "☕ 你上周读了 {{ steps.1.result | length }} 段值得回看的话"
items: "{{ steps.2.result }}"
cta: "去回顾"
```

## 错误处理

- LLM 不可用 → 降级：纯统计 + Top 标签 + 最高亮度的 5 条
- 上周无入库 → 跳过推送，不打扰
