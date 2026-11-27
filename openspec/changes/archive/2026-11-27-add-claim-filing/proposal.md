# Tạo, gửi và theo dõi hồ sơ bồi thường

## Why
Khi đã tự trả tiền, NĐBH phải gom đúng và đủ chứng từ theo loại điều trị, xuất hóa đơn đúng thông tin, gửi hồ sơ cho
đơn vị quản lý (Marsh) và tự theo dõi kết quả. Thiếu một chứng từ hay hóa đơn sai người mua là hồ sơ bị trả về
([Hồ sơ bồi thường](/knowledge/domain/claim.md), [Chứng từ bồi thường](/knowledge/domain/claim-documents.md)).
Không có server, nên app gửi bằng chính hộp thư Gmail của người dùng qua Gmail API gọi từ trình duyệt, kèm PDF; `mailto`
chỉ là cách dự phòng vì không đính kèm được file
([Kênh nộp](/knowledge/domain/claim-channel.md), [0010](/knowledge/decisions/0010-gmail-api-submission.md)).

## What changes
- Dataset `public/data/claim-requirements.json` (chứng từ theo loại claim, điều kiện theo ngưỡng, hướng dẫn hóa đơn, lấy từ
  hướng dẫn PTI tháng 8/2025 và lưu ý trên mẫu giấy yêu cầu) và `public/data/administrators/marsh.json` (người nhận, CC, mẫu tiêu đề).
- Trình tạo hồ sơ nhiều bước: người → loại claim → đợt điều trị (lý do, ngày, cơ sở, chẩn đoán, ngày nghỉ, tình huống đặc biệt)
  → hóa đơn → chứng từ → xem lại. Hóa đơn và chứng từ lấy từ [kho chứng từ](/knowledge/data/documents.md) hoặc chụp/tải ngay
  trong bước đó. Tổng tiền là tổng các hóa đơn đã xác nhận. Tự lưu nháp.
- Kiểm tra trước khi nộp: thẻ còn hiệu lực, hạn 365 ngày, ngày hóa đơn, tuổi của con, hạng có quyền lợi, cơ sở bị loại trừ, bảo lãnh.
- Thẻ "Xuất hóa đơn cho đúng".
- Hai tệp PDF dựng trên thiết bị theo [mẫu của hợp đồng](/knowledge/domain/claim-form.md): giấy yêu cầu bồi thường đã điền
  (kèm bảng kê, số tiền bằng chữ) và một tệp gộp mọi ảnh và hóa đơn điện tử; hai tệp dưới 15 MB, giữ chất lượng đủ đọc. Giấy yêu cầu điền đè lên
  mẫu trống `public/forms/gyc-template.pdf`, không cần ký.
- Email: đến PTI, CC Marsh, tiêu đề "HS YCBT – Họ tên NĐBH – Số hợp đồng – Tên công ty". Gửi bằng Gmail API (chỉ quyền `gmail.send`)
  sau màn hình xác nhận; dự phòng `mailto` khi không dùng Gmail.
- Theo dõi: người dùng cập nhật trạng thái, số tiền duyệt, lý do; lịch sử; nhắc khi quá thời hạn phản hồi theo số tiền (7/15/20 ngày làm việc).
- Danh sách hồ sơ; Trang chủ đếm số hồ sơ đang xử lý.

- Nội trú, thai sản: hướng dẫn nộp bản gốc (địa chỉ trung tâm bồi thường PTI) và ghi ngày đã nộp. Theo
  [quy tắc hợp đồng](/knowledge/domain/policy-2026.md).
- Loại claim kính mắt cho nhân viên.

## Impact
- Capabilities: claims (ADDED), claim-submission (ADDED), gmail-connection (ADDED), claim-tracking (ADDED), app-shell (MODIFIED: Home summary).
- Data: bảng `claims`, `claimEvents`; dùng bảng `documents`; Dexie v3 → v4 (không có dữ liệu cần migrate).
- Dependencies: `pdf-lib`, `@pdf-lib/fontkit`; font Noto Sans (OFL) trong `public/fonts/`.
- Phụ thuộc change: `add-account-and-people`, `add-benefit-plans`, `add-facility-directory`, `add-public-pages`, `add-document-library`.
- Cấu hình: `src/config.ts` chứa `GOOGLE_CLIENT_ID` (công khai); để trống thì ẩn Gmail. Thư viện Google chỉ tải khi bấm kết nối.
- Offline: tạo hồ sơ, dựng PDF, cập nhật trạng thái chạy offline. Kết nối và gửi Gmail cần mạng; app không tự gửi khi có mạng lại.
- Out of scope: hồ sơ tai nạn và tử vong (không làm qua app, chỉ hiện hướng dẫn liên hệ PTI); phân loại chi phí được/không được trả (`add-coverage-rules`); quy trình riêng (`add-special-claim-flows`);
  hạn mức còn lại (`add-limit-tracking`); ký tên (không cần khi nộp); tách hồ sơ thành nhiều email; xuất giấy yêu cầu dạng Word/Google Docs;
  thanh toán tiền mặt trên giấy yêu cầu; đọc hộp thư; SMTP; Microsoft Graph; đồng bộ Drive; thủ tục xác minh Google.
