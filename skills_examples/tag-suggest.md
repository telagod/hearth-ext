---
name: tag-suggest
version: 1.0.0
description: 新笔记入库后，自动建议 3 个标签
trigger:
  type: event
  event: note.create
tools:
  - db.query
  - llm.tag
  - db.tag
permissions:
  llm: optional
  network: optional
  storage: required
inputs:
  - name: note_id
    type: integer
    required: true
timeout: 10
---

# 自动标签

新笔记入库时，先看现有标签云，再让 LLM 建议 3 个——优先复用，避免标签爆炸。

## 步骤

### 1. 拉笔记正文

```call:db.query
SELECT id, body, context_before, context_after
FROM notes WHERE id = {{ inputs.note_id }}
```

### 2. 拉现有标签

```call:db.query
SELECT name FROM tags ORDER BY (
  SELECT COUNT(*) FROM note_tags WHERE tag_id = tags.id
) DESC LIMIT 50
```

### 3. LLM 建议

```call:llm.tag
text: "{{ steps.1.result[0].body }}"
existing_tags: "{{ steps.2.result | map(attribute='name') | list }}"
k: 3
template: |
  从 existing_tags 优先选；如必须新建，名字必须 ≤ 6 字、中英文皆可、不带空格。
  返回 JSON: {reuse: [...], new: [...]}
```

### 4. 入库

```call:db.tag
note_id: {{ inputs.note_id }}
tags: "{{ steps.3.result.reuse + steps.3.result.new }}"
auto: true
```

## 错误处理

- LLM 不可用 → 跳过；不影响入库
- LLM 返回非 JSON → 重试一次，仍失败丢弃
