---
type: Decision
title: Gửi hồ sơ bằng mailto, không SMTP/Graph API
description: App mở email của người dùng bằng mailto có sẵn người nhận, tiêu đề, nội dung; người dùng tự đính kèm gói PDF.
status: deprecated
superseded_by: /decisions/0010-gmail-api-submission.md
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

> Đã bị thay bởi [0010 Gửi bằng Gmail API](/decisions/0010-gmail-api-submission.md). `mailto` còn lại làm cách dự phòng.

# Context

Không có server nên không dùng SMTP hay Graph API. Chủ dự án hỏi dùng `mailto:` thay cho chia sẻ trên
điện thoại. `mailto:` (RFC 6068) điền được người nhận, CC, tiêu đề, nội dung nhưng **không đính kèm
file**. Web Share đính kèm được file nhưng không điền được người nhận.

# Decision

- Cách chính: lưu PDF → mở `mailto:` → người dùng đính kèm và gửi → bấm "Đã gửi".
- Cách phụ: nút chia sẻ file khi `navigator.canShare({ files })` trả `true`; app copy sẵn địa chỉ email vào clipboard.
- Gói hồ sơ PDF giữ dưới 20 MB (0010 hạ xuống 18 MB).

# Consequences

- Thêm một bước thủ công (đính kèm). App hướng dẫn từng bước và không đổi trạng thái sang
  `submitted` cho tới khi người dùng xác nhận.
