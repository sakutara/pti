---
type: Playbook
title: Làm mới dữ liệu PTI
description: Chạy hoặc kiểm tra workflow lấy danh sách CSYT từ PTI, duyệt PR, deploy lại.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Tự động

Workflow `refresh-pti-data` chạy ngày 1 hàng tháng (và chạy tay qua "Run workflow"). Có thay đổi thì
mở PR `data/refresh-facilities-YYYY-MM-DD` với tóm tắt: số cơ sở thêm, bỏ, đổi.

# Duyệt

1. Đọc tóm tắt trong PR; kiểm tra vài cơ sở bị bỏ trên trang https://www.pti.com.vn/benh-vien-lien-ket/.
2. Merge PR trên GitHub, pull về `main` trên máy → hook post-merge chạy autobuild.
3. `.autobuild/status.json` là `passed` thì `npm run deploy`.

# Chạy tay trên máy

`node scripts/refresh-facilities.mjs --out public/data/facilities/pti.json`

# Khi workflow thất bại

- Cấu trúc JSON của API đổi hoặc số cơ sở giảm hơn 30%: sửa `scripts/refresh-facilities.mjs` trên
  branch mới, không sửa tay file dữ liệu.
