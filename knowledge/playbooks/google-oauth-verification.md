---
type: Playbook
title: Xác minh OAuth với Google
description: Các bước tạo OAuth Client, khai báo màn hình đồng ý, xác minh tên miền và nộp hồ sơ xác minh cho quyền gmail.send.
status: draft
generated: { by: claude-sonnet-5-5, at: 2026-11-26T03:00:00Z }
---

Dựa trên hiểu biết về quy trình của Google tại thời điểm viết; đối chiếu với tài liệu hiện hành của Google Cloud
(OAuth app verification) trước khi nộp. Quyết định gốc: [0010](/decisions/0010-gmail-api-submission.md).

# Chuẩn bị (làm trước khi nộp)

1. Triển khai change `add-public-pages` lên https://pti.fiddle.vn: trang `/about/` và `/privacy/` truy cập được không cần đăng nhập, không cần JavaScript.
2. Có một địa chỉ email liên hệ công khai (dùng cho trang chính sách và "User support email").
3. Xác minh tên miền `fiddle.vn` trong Google Search Console bằng thuộc tính loại **Domain** (bản ghi DNS TXT). Không cần có website ở tên miền gốc.

# Tạo OAuth Client

1. Google Cloud Console → tạo project "PTI Claim" → bật **Gmail API** (và **Google Drive API** khi làm giai đoạn 2).
2. Google Auth Platform → **Branding**: tên app "PTI Claim", User support email, Application home page `https://pti.fiddle.vn/about/`, Privacy policy `https://pti.fiddle.vn/privacy/`, Authorized domain `fiddle.vn`, Developer contact email. Không tải logo lên (logo kéo theo bước xác minh thương hiệu).
3. **Audience**: User type **External**. Trạng thái Testing: thêm email người thử (tối đa 100).
4. **Data access**: thêm đúng 3 scope `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`.
5. **Clients** → Web application; Authorized JavaScript origins: `https://pti.fiddle.vn` và `http://localhost:5173`. Không cần redirect URI (token client dùng popup).
6. Chép Client ID (công khai) vào `src/config.ts`.

# Nộp xác minh

1. Chuyển **Publishing status** sang In production, rồi **Verification Center** → nộp.
2. Giải trình scope (tiếng Anh): app giúp người dùng nộp hồ sơ bồi thường bảo hiểm sức khỏe; `gmail.send` chỉ dùng để gửi một email do chính người dùng soạn và xác nhận, kèm PDF; không đọc, không lưu, không chia sẻ dữ liệu Gmail; không có server.
3. Video demo (YouTube, chế độ không công khai), có phụ đề tiếng Anh, quay liền mạch: mở app trên pti.fiddle.vn → bấm Kết nối Gmail → màn hình đồng ý (thấy Client ID trên thanh địa chỉ) → cấp quyền → tạo claim mẫu bằng dữ liệu giả → màn hình xác nhận gửi → email xuất hiện trong mục Đã gửi của Gmail → ngắt kết nối.
4. Theo dõi email của Google yêu cầu bổ sung; trả lời bằng cùng tài khoản đã đăng ký project.

# Trong lúc chờ

- App ở chế độ Testing: người dùng thử thấy cảnh báo "Google chưa xác minh ứng dụng này".
- Người dùng khác dùng cách dự phòng mailto.

# Sau khi đổi dữ liệu app

Nếu thêm scope mới hay đổi cách dùng dữ liệu Gmail thì phải xác minh lại; cập nhật trang chính sách trước.
