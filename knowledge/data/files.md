---
type: Data Store
title: files table
description: Ảnh và PDF (ảnh thẻ, ảnh chứng từ, tệp PDF nộp hồ sơ) lưu dạng Blob trong IndexedDB.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string (uuid) | primary key |
| ownerType | 'person' \| 'claim' \| 'document' | index [ownerType+ownerId] |
| ownerId | string | |
| kind | 'card-front' \| 'card-back' \| 'document' \| 'bundle' | |
| mime | string | image/jpeg, application/pdf |
| blob | Blob | ảnh đã nén: ảnh thẻ: cạnh dài ≤ 2000 px, JPEG q≈0.8; ảnh chứng từ: ≤ 2400 px, q≈0.85; PDF hóa đơn điện tử giữ nguyên |
| bytes | number | |
| sha256 | string | index; phát hiện ảnh trùng |
| createdAt | number | |
| updatedAt | number | index |
| deleted | 0 \| 1 | |

Outbox chỉ chứa metadata (không chứa blob); adapter đồng bộ sau này tự đọc blob theo `id`.

# Indexes

`id, [ownerType+ownerId], sha256, updatedAt`

# Versions

- v2 (add-account-and-people): table created
- v3 (add-document-library): thêm giá trị `ownerType` 'document'
