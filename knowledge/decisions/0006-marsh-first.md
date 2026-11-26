---
type: Decision
title: Đi theo kênh Marsh trước, FHVI/INSMART sau
description: Công ty mua bảo hiểm PTI qua môi giới Marsh; giai đoạn 1 chỉ hỗ trợ đơn vị quản lý hồ sơ Marsh.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Decision

- `administrator` mặc định là `marsh`; cấu hình ở `public/data/administrators/marsh.json`.
- Thiết kế theo dạng cấu hình để thêm `fhvi`, `insmart` mà không phải sửa tính năng.

# Đã có thông tin (chủ dự án, 2026-11-26)

- Gửi email đến `nhanhsbt.mn@pti.com.vn`, CC `vietnamMMBclaims@marsh.com`.
- Mẫu giấy yêu cầu và gói tệp đính kèm: [Giấy yêu cầu bồi thường](/domain/claim-form.md); hạn nộp theo [0011](/decisions/0011-policy-summary-precedence.md).

# Xác nhận thêm (chủ dự án, 2026-11-26)

- Dùng đúng hai địa chỉ trên và được đưa vào repo.
- Không cần ký tên trên giấy yêu cầu khi nộp.
- Ảnh và hóa đơn điện tử gộp vào một tệp PDF.

# Chưa xác minh (2026-11-26)

- Mạng lưới CSYT áp dụng cho hợp đồng qua Marsh: tạm coi là `pti`.
- Đã có bảng quyền lợi và giới hạn 15 MB ([quy tắc hợp đồng](/domain/policy-2026.md)).
