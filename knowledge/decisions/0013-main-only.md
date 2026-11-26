---
type: Decision
title: Chỉ làm việc trên main, không dùng branch hay worktree
description: Mọi thay đổi được commit thẳng vào main; không tạo branch hay git worktree.
status: stable
generated: { by: claude-sonnet-5-5, at: 2026-11-26T14:00:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T14:00:00Z }
---

# Decision

- Commit trực tiếp vào `main`. Không tạo branch, không dùng git worktree, kể cả khi quy trình của skill gợi ý.
- **Không ngoại lệ** (chủ dự án, 2026-11-26):
  - Không có nhánh `gh-pages`: bản deploy là thư mục `docs/` trên `main`; GitHub Pages phát hành từ `main` /`docs`.
  - Workflow làm mới dữ liệu PTI không mở PR: commit thẳng vào `main` sau khi qua kiểm tra an toàn.
- Hook sau merge không chạy trong quy trình này, nên chạy `npm run autobuild` sau khi commit.

# Consequences

- Dữ liệu do workflow cập nhật không có bước duyệt trước khi vào `main`; trang chỉ đổi khi chủ dự án pull và deploy.
- File build nằm trong lịch sử của `main`.
