---
type: Decision
title: Gửi hồ sơ bằng Gmail API từ trình duyệt, mailto dự phòng
description: Cách gửi chính là gọi Gmail API (quyền gmail.send) trực tiếp từ trình duyệt kèm PDF; mailto chỉ còn là cách dự phòng. Thay thế decision 0004.
status: stable
supersedes: /decisions/0004-mailto-submission.md
generated: { by: claude-sonnet-5-5, at: 2026-11-26T03:00:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Context

`mailto:` không đính kèm được file, nên người dùng phải tự đính kèm PDF — không đáp ứng nhu cầu gửi thư. Chủ dự án
chọn tích hợp Gmail phía client. Dự án là cá nhân, phi lợi nhuận, không có công ty hay Google Workspace; người dùng là
nhân viên và người thân của họ, nhiều người dùng Gmail cá nhân. Chủ dự án chọn **xác minh ứng dụng với Google**.

# Decision

- Dùng Google Identity Services (token client) trong trình duyệt. Quyền xin: `https://www.googleapis.com/auth/gmail.send`
  (nhóm *sensitive*: chỉ gửi, không đọc hộp thư), cộng `openid` và `email` (không nhạy cảm) để hiện địa chỉ đang kết nối.
  Không xin quyền nào khác (đặc biệt không xin `gmail.readonly`, `gmail.compose`, `gmail.modify` thuộc nhóm *restricted*).
- App dựng email MIME đa phần (nội dung + PDF đính kèm) và gọi `users.messages.send`. Người dùng phải xem và bấm xác nhận
  (người nhận, người gửi, tiêu đề, dung lượng) trước khi gửi; app không bao giờ tự gửi.
- Access token chỉ giữ trong bộ nhớ, hết hạn khoảng 1 giờ, không lưu vào IndexedDB, sao lưu hay outbox; hết hạn thì xin lại
  khi người dùng bấm gửi.
- Đính kèm dưới 15 MB mỗi hồ sơ theo yêu cầu hợp đồng ([0011](/decisions/0011-policy-summary-precedence.md)) (giới hạn của Gmail là 25 MB, base64 làm phình khoảng 33%). Không tách email: ảnh được nén trong giới hạn còn đọc rõ, vẫn quá thì app yêu cầu bớt chứng từ (chủ dự án chọn một tệp PDF, 2026-11-26).
- `mailto:` giữ làm dự phòng khi người dùng không kết nối Gmail, dùng email khác (Outlook…) hoặc chưa cấu hình Client ID.
- OAuth Client ID là thông tin công khai, đặt trong `src/config.ts`; để trống thì tính năng Gmail ẩn đi và app chỉ dùng mailto.
- Dùng chung một OAuth Client với đồng bộ Drive ([0008](/decisions/0008-gdrive-sync.md)); mỗi tính năng chỉ xin quyền của mình
  lúc người dùng bật.
- Xác minh với Google (External, sensitive scope): cần tên miền do chủ dự án sở hữu, trang giới thiệu, chính sách quyền riêng
  tư, video demo. Chi tiết: [Xác minh OAuth với Google](/playbooks/google-oauth-verification.md). Trang giới thiệu và chính sách
  nằm trong change `add-public-pages`.

# Consequences

- Trước khi được Google duyệt, app ở chế độ Testing: tối đa 100 email thử, người dùng thấy cảnh báo "chưa xác minh". Cách
  dự phòng mailto vẫn dùng được.
- Cần một địa chỉ email liên hệ công khai cho trang chính sách và màn hình đồng ý OAuth.
- Gửi email là hành động hướng ra ngoài: luôn có bước xác nhận của người dùng.
