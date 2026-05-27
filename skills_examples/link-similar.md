---
name: link-similar
version: 1.0.0
description: 新笔记入库后，异步查找库内相关笔记并自动加 wiki link
trigger:
  type: event
  event: note.create
tools:
  - db.query
  - db.link
  - llm.narrate
permissions:
  llm: optional
  network: optional
  storage: required
inputs:
  - name: note_id
    type: integer
    required: true
timeout: 15
---

# 自动互链

让新笔记找到它的家人。

## 步骤

### 1. 拉新笔记 + 关键词

```call:db.query
SELECT id, body_plain, keywords_json, simhash
FROM notes WHERE id = {{ inputs.note_id }}
```

### 2. FTS5 + SimHash 召回

```call:db.query
SELECT n.id, n.body, bm25(notes_fts) AS score
FROM notes_fts
JOIN notes n ON n.id = notes_fts.rowid
WHERE notes_fts MATCH '{{ steps.1.result[0].keywords_json | join(" OR ") }}'
  AND n.id != {{ inputs.note_id }}
ORDER BY score
LIMIT 5
```

### 3. 建 similar 链接（weight = 1 - normalized_score）

```call:db.link
src: {{ inputs.note_id }}
candidates: "{{ steps.2.result }}"
kind: similar
threshold: 0.3
```
