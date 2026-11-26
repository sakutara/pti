---
type: Decision
title: Tên miền riêng pti.fiddle.vn
description: App chạy ở https://pti.fiddle.vn (GitHub Pages với custom domain) thay cho đường dẫn /pti/ của github.io.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T02:10:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Context

Chủ dự án chọn địa chỉ pti.fiddle.vn, giống cách dự án ebook dùng ebook.fiddle.vn.

# Decision

- Base path là `/` (không còn `/pti/`): `vite.config.ts` đặt mặc định `base = '/'`.
- File `public/CNAME` chứa `pti.fiddle.vn`, được chép vào `dist/` và đẩy lên nhánh `gh-pages`.
- DNS: bản ghi CNAME `pti` → `<owner>.github.io`; bật "Enforce HTTPS" trong cài đặt Pages.
- Origin của OAuth Client ID cho Google Drive ([0008](/decisions/0008-gdrive-sync.md)) là `https://pti.fiddle.vn`.
- Service worker và dữ liệu IndexedDB gắn với origin này; đổi tên miền sau này làm người dùng mất dữ liệu trên máy
  (phải sao lưu rồi khôi phục).

# Consequences

- Thêm task đổi base path và tạo CNAME vào change `add-account-and-people`.
