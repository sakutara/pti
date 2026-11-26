---
type: Decision
title: Đồng bộ qua Google Drive của người dùng, mã hóa đầu cuối
description: Giai đoạn 2 thêm SyncAdapter Google Drive chạy trong trình duyệt, ghi vào appDataFolder, dữ liệu mã hóa bằng mật khẩu người dùng trước khi tải lên.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Context

Chủ dự án muốn sao lưu, khôi phục và đồng bộ qua Google Drive mà không có server.
Ràng buộc 0001 cho phép thay `localOnlyAdapter` bằng adapter khác mà không sửa tính năng.

# Decision

- Google Identity Services (token client) trong trình duyệt, scope `drive.appdata`. Cần một OAuth
  Client ID công khai với origin `https://pti.fiddle.vn` ([0009](/decisions/0009-custom-domain.md)). Đây là ủy quyền truy cập Drive, không
  phải đăng nhập app ([0002](/decisions/0002-local-account.md)).
- Dữ liệu mã hóa AES-GCM bằng khóa dẫn xuất PBKDF2 từ mật khẩu người dùng trước khi tải lên.
- Mỗi bản ghi một op trong outbox; ảnh là file riêng đánh địa chỉ theo sha256; pull gộp theo
  `updatedAt`, xóa mềm thắng bản cập nhật cũ hơn.
- Token sống khoảng 1 giờ, không có refresh token: hết hạn thì đồng bộ dừng và chờ người dùng cấp lại quyền.

- Dùng chung OAuth Client và màn hình đồng ý với Gmail ([0010](/decisions/0010-gmail-api-submission.md)). Quyền \`drive.appdata\` thuộc nhóm không nhạy cảm nên không cần thêm xác minh riêng.

# Consequences

- Quên mật khẩu = không đọc được bản trên Drive (bản trên máy vẫn còn).
- Không gửi dữ liệu cho bên nào khác ngoài Google Drive của chính người dùng.
