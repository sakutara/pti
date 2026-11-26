---
type: Playbook
title: Làm mới dữ liệu PTI
description: Chạy hoặc kiểm tra workflow lấy danh sách CSYT từ PTI, xem thay đổi, deploy lại.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Tự động

Workflow `refresh-pti-data` chạy ngày 1 hàng tháng (và chạy tay qua "Run workflow"). Có thay đổi thì
commit thẳng vào `main`, nội dung commit là tóm tắt: số cơ sở thêm, bỏ, đổi.

# Xem lại và deploy

1. `git pull`, đọc tóm tắt trong commit; kiểm tra vài cơ sở bị bỏ trên trang https://www.pti.com.vn/benh-vien-lien-ket/.
2. Sai thì `git revert` commit đó.
3. `npm run autobuild` là `passed` thì deploy theo [playbook](/playbooks/deploy.md).

# Chạy tay trên máy

`node scripts/refresh-facilities.mjs --out public/data/facilities/pti.json`

# Khi workflow thất bại

- Cấu trúc JSON của API đổi hoặc số cơ sở giảm hơn 30%: sửa `scripts/refresh-facilities.mjs` rồi commit vào `main`; không sửa tay file dữ liệu.
