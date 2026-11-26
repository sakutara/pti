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
- Hook sau merge không còn chạy trong quy trình này, nên chạy `npm run autobuild` sau khi commit.

# Chưa chốt

- Nhánh `gh-pages` dùng để deploy ([0009](/decisions/0009-custom-domain.md)).
- Workflow làm mới dữ liệu PTI mở PR bằng một branch ([0003](/decisions/0003-pti-datasets-in-repo.md)).
