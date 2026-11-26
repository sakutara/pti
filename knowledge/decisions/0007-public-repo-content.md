---
type: Decision
title: Repo công khai chỉ chứa thông tin công khai của PTI
description: Repo và trang GitHub Pages công khai; chỉ chứa chính sách, gói quyền lợi và danh sách CSYT của PTI, không có thông tin nội bộ của công ty hay dữ liệu cá nhân.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Decision

- Tệp hợp đồng gốc không bao giờ commit (`.gitignore` loại `/*.pdf`). Số liệu quyền lợi trong `public/data/benefits/` được
  chép không kèm tên công ty hay số hợp đồng; chủ dự án xác nhận là số liệu công khai ([0012](/decisions/0012-scope-answers.md)).

- Bổ sung (chủ dự án, 2026-11-26): được đưa vào repo hai địa chỉ nhận hồ sơ `nhanhsbt.mn@pti.com.vn`,
  `vietnamMMBclaims@marsh.com`, và mẫu giấy yêu cầu bồi thường **trống** đã gỡ tên công ty, số hợp đồng và dữ liệu cá nhân.

- Được phép: 4 hạng của gói quyền lợi PTI, quy tắc chứng từ, danh sách CSYT, cấu hình kênh nộp.
- Không được phép: tên công ty, danh sách nhân viên, số hợp đồng, email nội bộ, bất kỳ dữ liệu cá nhân nào.
  Các giá trị đó chỉ nằm trong IndexedDB của người dùng.
- Test fixture dùng dữ liệu giả.
