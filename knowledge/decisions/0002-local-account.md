---
type: Decision
title: Tài khoản cục bộ, không OAuth
description: App có mục "Tài khoản" để lưu thông tin người dùng, nhưng tài khoản chỉ nằm trên thiết bị và không kết nối dịch vụ đăng nhập nào.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Context

Người dùng không muốn nhập lại thông tin cá nhân mỗi lần nộp claim, nhưng chủ dự án không muốn tạo
user trên server hay đưa thông tin cá nhân lên server.

# Decision

- Một bản ghi `account` mỗi thiết bị gom NĐBH chính, người thân và cài đặt nộp claim.
- Không mật khẩu, không OAuth, không server. Không có màn hình đăng nhập.
- Chuyển thiết bị bằng sao lưu/khôi phục; đồng bộ Google Drive là tính năng riêng ([0008](/decisions/0008-gdrive-sync.md)).

# Consequences

- Ai cầm được thiết bị đã mở khóa thì xem được dữ liệu; khóa app bằng PIN để giai đoạn 3 (`add-app-lock`).
