---
name: monthly-purge
version: 1.0.0
description: 每月 1 号凌晨 3 点，把 30 天未访问且 0 星标的笔记标记为冷藏
trigger:
  type: cron
  schedule: "0 3 1 * *"
tools:
  - db.query
  - db.archive
  - ui.notify
permissions:
  llm: none
  network: none
  storage: required
timeout: 20
---

# 月度冷藏

不删，只是让旧的退后一步。星标永不冷藏。

## 步骤

### 1. 找冷藏候选

```call:db.query
SELECT id FROM v_cold_notes LIMIT 500
```

### 2. 标记冷藏（archived=1）

```call:db.archive
ids: "{{ steps.1.result | map(attribute='id') | list }}"
```

### 3. 通知

```call:ui.notify
when: "{{ steps.1.result | length > 0 }}"
title: "已把 {{ steps.1.result | length }} 条旧笔记移入冷藏"
body: "它们不会出现在主搜索里，但永远在那。需要时点'冷藏'标签查看。"
```
