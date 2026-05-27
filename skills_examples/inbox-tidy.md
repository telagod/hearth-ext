---
name: inbox-tidy
version: 1.0.0
description: 每日 22 点清理候选 Inbox，72h 未确认置 expired
trigger:
  type: cron
  schedule: "0 22 * * *"
tools:
  - inbox.list
  - inbox.expire_sweep
  - llm.summarize
  - ui.notify
permissions:
  llm: optional
  network: optional
  storage: required
timeout: 20
---

# Inbox 守炉

候选不入库就让它消散。每日 22 点扫一次。

## 步骤

### 1. TTL 清扫

```call:inbox.expire_sweep
```

### 2. 拉今日新增候选

```call:inbox.list
status: pending
kind: clip
since: "{{ env.now - 86400 }}"
```

### 3. 若超过 5 条，提醒用户

```call:ui.notify
when: "{{ steps.2.result | length > 5 }}"
title: "Inbox 有 {{ steps.2.result | length }} 条候选在等你"
body: "今天你画了不少线，要花 2 分钟收一下吗？"
cardId: "inbox-tidy-{{ env.now }}"
```
