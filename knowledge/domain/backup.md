---
type: Domain Concept
title: Sao lưu và khôi phục
description: File .ptibackup (zip) chứa toàn bộ bảng dữ liệu và ảnh chứng từ để chuyển máy hoặc phòng mất dữ liệu.
tags: [backup]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Định nghĩa

File `pti-backup-YYYYMMDD-HHmm.ptibackup` là một zip:

- `manifest.json`: `app`, `schemaVersion`, `exportedAt`, số bản ghi từng bảng.
- `tables/<table>.json`: bản ghi của từng bảng (trừ `outbox`), gồm cả bản ghi đã xóa mềm.
- `files/<id>`: nội dung nhị phân của từng ảnh/PDF trong bảng [files](/data/files.md).

Khôi phục = gộp theo `updatedAt` (bản mới hơn thắng), giống quy tắc của
[0001](/decisions/0001-no-backend-local-first.md). File sao lưu chứa dữ liệu sức khỏe, nên app nhắc
người dùng cất ở nơi an toàn. Mã hóa bằng mật khẩu được thêm cùng đồng bộ Google Drive (giai đoạn 2).

Hành vi: `/openspec/specs/backup/spec.md`.
