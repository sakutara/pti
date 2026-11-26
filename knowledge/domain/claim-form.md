---
type: Domain Concept
title: Giấy yêu cầu bồi thường (GYC) và gói email nộp hồ sơ
description: Mẫu GYC do chủ dự án cung cấp, nguồn dữ liệu của từng ô, và cấu trúc email nộp hồ sơ (người nhận, tiêu đề, hai tệp đính kèm).
tags: [claims, submission]
status: draft
generated: { by: claude-sonnet-5-5, at: 2026-11-26T06:00:00Z }
sources:
  - id: owner-form
    resource: mẫu Claim Form 2 trang do chủ dự án cung cấp ngày 2026-11-26 (không lưu liên kết hay bản gốc trong repo vì có dữ liệu cá nhân)
---

# Email nộp hồ sơ (theo chủ dự án, 2026-11-26)

| phần | giá trị |
|---|---|
| Đến | `nhanhsbt.mn@pti.com.vn` |
| CC | `vietnamMMBclaims@marsh.com` |
| Tiêu đề | `HS YCBT – <Họ tên NĐBH> – <Số hợp đồng> – <Tên công ty>` ([0011](/decisions/0011-policy-summary-precedence.md)) |
| Đính kèm 1 | `GYC bồi thường <lý do>.pdf` — giấy yêu cầu đã điền |
| Đính kèm 2 | `Chứng từ <lý do>.pdf` — tất cả ảnh hóa đơn và chứng từ của hồ sơ |

# Tệp mẫu

`public/forms/gyc-template.pdf` là bản PDF 2 trang của mẫu, đã **gỡ hẳn** (không chỉ che) mọi giá trị đã điền: tên công ty, số
hợp đồng, thông tin cá nhân, ngân hàng, thông tin điều trị, bảng kê, cùng tiêu đề và cây cấu trúc của PDF. Vị trí từng ô (điểm PDF,
gốc dưới trái, cỡ chữ, màu, bề rộng tối đa, số dòng bảng kê) nằm ở `public/forms/gyc-fields.json`. App chỉ viết dữ liệu của
người dùng đè lên mẫu. Đổi mẫu thì tạo lại cả hai tệp và kiểm tra không còn dữ liệu cũ.

# Cấu trúc mẫu

Trang 1: tiêu đề song ngữ và lời nhắc chứng từ; khung chủ hợp đồng và số hợp đồng; A. Thông tin cá nhân; B. Thanh toán;
C. Thông tin điều trị; khung lưu ý ngoại trú / nằm viện / tai nạn; lời cam đoan; ba ô ký (người được bảo hiểm, nhân viên,
đơn vị mua bảo hiểm kèm dấu).

Trang 2: "Bảng kê chi phí phát sinh" (9 dòng: STT, ngày hóa đơn, số tiền; quá 9 hóa đơn thì thêm bản sao trang 2), tổng bằng số và bằng chữ, lưu ý chung.

# Nguồn dữ liệu của từng ô

| ô | nguồn |
|---|---|
| Chủ hợp đồng, Hợp đồng số | `persons.policyholderName`, `persons.contractCode` của NĐBH (người dùng nhập) |
| Tên bệnh nhân, ngày sinh, mức bảo hiểm | NĐBH của claim: `fullName`, `dateOfBirth`, `tier` |
| Điện thoại | NĐBH; trống thì lấy của nhân viên |
| Tên nhân viên, mã số nhân viên, chức danh, email | NĐBH chính: `fullName`, `employeeCode`, `jobTitle`, `email` |
| Tổng tiền | `claims.totalClaimed` (tổng hóa đơn đã xác nhận) |
| Hình thức | luôn đánh dấu "Chuyển khoản" |
| Số tài khoản, ngân hàng, địa chỉ ngân hàng, người thụ hưởng | tài khoản nhận tiền đã chọn ([persons](/data/persons.md)) |
| Số ngày nghỉ | `claims.daysOff` (mặc định 0) |
| Ngày khám/tai nạn, chẩn đoán, cơ sở y tế | `claims.treatmentDate`, `diagnosis`, `facilityName` |
| Ngày nhập viện, ra viện | `claims.admissionDate`, `dischargeDate` |
| Bảng kê | mỗi [chứng từ](/data/documents.md) loại hóa đơn trong claim là một dòng, theo ngày |
| Người yêu cầu bồi thường | họ tên nhân viên |

Số hợp đồng và tên công ty là thông tin nội bộ: chỉ nằm trên thiết bị, không bao giờ vào repo
([0007](/decisions/0007-public-repo-content.md)).

# Quy tắc ghi trên mẫu

- Giấy tờ y tế và hóa đơn phải có dấu của cơ sở y tế.
- Mua thuốc không quá 5 ngày kể từ ngày kê đơn.
- Hóa đơn VAT xuất đúng ngày khám/mua; xuất muộn thì kèm phiếu thu hoặc phiếu xuất thuốc của ngày thực tế.
- Bản sao chứng từ y tế cần dấu sao y/giáp lai của công ty/tổ chức.
- Nộp càng sớm càng tốt, không quá **365 ngày** kể từ ngày khám/điều trị. Mẫu gốc in 180; tệp mẫu trong repo đã sửa thành
  365 (thêm glyph "6" vào phông Tahoma nhúng trong PDF).

# Chữ ký

Ba ô ký giữ nguyên trên mẫu và để trống; không cần ký tên khi nộp qua email (chủ dự án, 2026-11-26). Hồ sơ tai nạn và tử vong (cần chữ ký và dấu công ty) không làm qua app
([0012](/decisions/0012-scope-answers.md)).

# Tệp chứng từ

Mọi ảnh và hóa đơn điện tử (PDF) của hồ sơ gộp vào **một** tệp PDF. Hai tệp đính kèm cộng lại dưới 15 MB
([0010](/decisions/0010-gmail-api-submission.md)); ảnh chỉ được nén tới mức còn đọc rõ chữ và con dấu.
