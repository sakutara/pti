---
type: Decision
title: Dữ liệu chung của PTI nằm trong repo, làm mới bằng GitHub Action
description: Gói quyền lợi, danh sách CSYT, yêu cầu chứng từ là file JSON trong public/data; một GitHub Action định kỳ lấy dữ liệu CSYT từ PTI và mở PR.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Context

Dữ liệu của PTI ít thay đổi (vài tháng một lần). API CSYT của PTI không cho gọi từ trình duyệt khác
domain (không có CORS). Quy tắc mặc định của skill là không có CI build.

# Decision

- Dữ liệu chung là JSON trong `public/data/`, đóng gói vào bản build và precache.
- Ngoại lệ cho quy tắc "không CI": workflow `.github/workflows/refresh-pti-data.yml` chạy theo lịch
  hàng tháng và chạy tay được. Nó chỉ chạy `scripts/refresh-facilities.mjs`, kiểm tra dữ liệu, và **mở
  PR** khi có thay đổi. Workflow không build, không deploy.
- Kiểm tra an toàn: số cơ sở giảm hơn 30% hoặc thiếu trường bắt buộc thì workflow thất bại, không mở PR.
- Sau khi merge PR, chủ repo pull về; hook post-merge build lại; deploy bằng `npm run deploy` như thường lệ.

# Consequences

- Người dùng thấy dữ liệu mới sau khi app tải bản mới (toast "Có phiên bản mới").
- Gọi API không chính thức: gọi thưa (1 lần/tháng, tuần tự, có nghỉ giữa các trang).
- Playbook: [Làm mới dữ liệu PTI](/playbooks/refresh-pti-data.md).
