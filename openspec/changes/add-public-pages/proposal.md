# Trang giới thiệu và chính sách quyền riêng tư

## Why
Để xác minh ứng dụng với Google cho quyền `gmail.send`, ứng dụng cần một trang chủ mô tả rõ nó làm gì và dùng dữ liệu
Gmail vào việc gì, cùng một chính sách quyền riêng tư công khai, cả hai nằm trên tên miền do chủ dự án sở hữu
([0010](/knowledge/decisions/0010-gmail-api-submission.md), [Xác minh OAuth](/knowledge/playbooks/google-oauth-verification.md)).
Người dùng cũng cần biết dữ liệu sức khỏe của mình được xử lý ra sao.

## What changes
- Trang tĩnh `https://pti.fiddle.vn/about/`: app là gì, dành cho ai, tính năng chính, dữ liệu nằm ở đâu, cách dùng quyền
  Gmail, liên kết tới chính sách và tới app. Có phần tóm tắt tiếng Anh cho người duyệt của Google.
- Trang tĩnh `https://pti.fiddle.vn/privacy/`: dữ liệu nào được xử lý, ở đâu, cách dùng dữ liệu người dùng của Google
  (gmail.send, Drive), tuyên bố tuân thủ Chính sách Dữ liệu Người dùng của Google API Services (Limited Use), cách thu hồi
  quyền, cách xóa dữ liệu, thông tin liên hệ, ngày hiệu lực. Song ngữ Việt và Anh.
- Hai trang là HTML thuần, không cần JavaScript, được precache nhưng không bị service worker thay bằng trang app.
- Liên kết tới hai trang từ màn hình tạo tài khoản, trang Tài khoản và chân trang của app.

## Impact
- Capabilities: public-pages (ADDED).
- Data: không có.
- Offline: hai trang đọc được khi offline sau lần mở đầu tiên.
- Out of scope: điều khoản sử dụng; cookie banner (app không dùng cookie, không có analytics); logo thương hiệu (tránh
  bước xác minh thương hiệu của Google); nội dung pháp lý chuyên sâu (chủ dự án tự rà soát văn bản trước khi nộp);
  nhập email liên hệ (chủ dự án cung cấp giá trị thật).
