---
type: Domain Concept
title: Đơn vị quản lý hồ sơ và kênh nộp
description: Ai nhận hồ sơ bồi thường (Marsh, sau này FHVI/INSMART) và cách app gửi hồ sơ: Gmail API là chính, mailto dự phòng.
tags: [claims, submission]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Đơn vị quản lý hồ sơ (`administrator`)

| id | vai trò | trạng thái |
|---|---|---|
| marsh | công ty môi giới; công ty mua bảo hiểm PTI qua Marsh | giai đoạn 1, mặc định |
| fhvi | TPA Fullerton Health Vietnam | sau |
| insmart | TPA Insmart | sau |

Cấu hình mỗi đơn vị nằm ở `public/data/administrators/<id>.json`: email nhận claim, CC, mẫu tiêu đề,
mẫu nội dung, mạng lưới CSYT, ghi chú. Hồ sơ gửi đến `nhanhsbt.mn@pti.com.vn`, CC `vietnamMMBclaims@marsh.com`. Người dùng có thể ghi đè email nhận và thêm CC
trong [Tài khoản](/domain/account.md). Cấu trúc email: [Giấy yêu cầu bồi thường](/domain/claim-form.md). Email là kênh nộp
cho ngoại trú, răng, kính mắt; nội trú, thai sản phải nộp thêm bản gốc ([quy tắc](/domain/policy-2026.md)).

# Kênh gửi

**Chính: Gmail API** ([0010](/decisions/0010-gmail-api-submission.md)). Người dùng kết nối tài khoản Gmail của mình (chỉ quyền
gửi thư). App dựng hai tệp PDF (giấy yêu cầu đã điền và chứng từ), hiện màn hình xác nhận (người gửi, người nhận, CC, tiêu đề, dung lượng), rồi gửi một
email kèm hai tệp từ chính hộp thư của người dùng; thư nằm trong mục Đã gửi. Mỗi hồ sơ là một email; hai tệp cộng lại dưới 15 MB.
Mã thread được lưu để mở lại cuộc trao đổi trong Gmail.

**Dự phòng: mailto** khi không kết nối Gmail hoặc dùng email khác. \`mailto:\` không đính kèm được file, nên quy trình 3 bước:
lưu hai tệp PDF → mở email điền sẵn → người dùng tự đính kèm, gửi, rồi bấm "Đã gửi". Nếu trình duyệt hỗ trợ chia sẻ file
(\`navigator.canShare({ files })\`) thì có thêm nút chia sẻ.

Tiêu đề: `HS YCBT – <Họ tên NĐBH> – <Số hợp đồng> – <Tên công ty>` (người dùng sửa được ở màn hình xác nhận). Độ dài URL mailto giữ dưới 1.800 ký tự.

Token truy cập chỉ nằm trong bộ nhớ, hết hạn khoảng 1 giờ và không bao giờ được lưu hay sao lưu.
