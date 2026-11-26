---
type: Domain Concept
title: Quy tắc hợp đồng 2026–2027
description: Điều kiện tham gia, thời gian chờ, nộp hồ sơ, chứng từ, xử lý bồi thường và bảo lãnh theo bảng tóm tắt hợp đồng 01/06/2026–31/05/2027.
tags: [benefits, claims]
status: draft
generated: { by: claude-sonnet-5-5, at: 2026-11-26T09:00:00Z }
sources:
  - id: owner-summary
    resource: bảng tóm tắt hợp đồng do chủ dự án cung cấp ngày 2026-11-26 (tệp không nằm trong repo)
---

Số liệu quyền lợi, quyền lợi mở rộng, thời gian chờ và 40 điểm loại trừ ở `public/data/benefits/2026.json`.
Không ghi vào repo: tên công ty, số hợp đồng, lịch nhận hồ sơ tại văn phòng, tên và liên hệ cá nhân của người phụ trách
([0007](/decisions/0007-public-repo-content.md)).

# Người được bảo hiểm

| loại (`memberType`) | điều kiện chính |
|---|---|
| employee | 18–65 tuổi (tái tục đến 70) |
| sponsored (người thân được tài trợ) | vợ/chồng, cha mẹ hai bên 18–65 (tái tục đến 70); con 15 ngày–18 tuổi, đến 25 nếu đang học toàn thời gian, chưa kết hôn, phụ thuộc |
| voluntary (người thân tự nguyện) | như trên; đồng chi trả 30%, hạn mức ngoại trú thấp hơn, chờ 6 tháng với bệnh đặc biệt và bệnh có sẵn |

Phần định nghĩa của hợp đồng ghi khác (đến 24 tuổi); app lấy chuẩn **đến hết 25 tuổi** và cảnh báo khi con từ 26 tuổi
([0012](/decisions/0012-scope-answers.md)).
Thai sản không áp dụng cho con. Kính mắt chỉ cho nhân viên.

# Nộp hồ sơ

- Hạn: **365 ngày** từ ngày tai nạn, ngày kết thúc đợt điều trị, ra viện hoặc tử vong. Tử vong phải báo bằng văn bản trong 180 ngày.
- Email (chỉ **ngoại trú và răng**): đến `nhanhsbt.mn@pti.com.vn`, CC `vietnamMMBclaims@marsh.com`, tiêu đề
  `HS YCBT – Họ tên NĐBH – Số hợp đồng – Tên công ty`, dung lượng tệp dưới **15 MB**. Giải quyết trên ảnh/bản scan màu.
- Hồ sơ khác: gửi ảnh để kiểm tra đủ chứng từ trước, nhưng chỉ được giải quyết khi PTI nhận **bản gốc**, nộp trực tiếp về
  trung tâm bồi thường PTI hoặc qua điểm thu hồ sơ của công ty.
  - Miền Nam: Tầng 2, Tòa nhà Thủy Lợi 4, 205 Nguyễn Xí, phường Bình Thạnh, TP. Hồ Chí Minh.
  - Miền Bắc: Zone 2B, Tầng 2, CT1 Tòa nhà Ban Cơ yếu Chính phủ, 43 Lê Văn Lương, phường Thanh Xuân, Hà Nội.
- Giấy yêu cầu không cần chữ ký nhân sự và dấu công ty, **trừ tai nạn và tử vong/thương tật toàn bộ vĩnh viễn**.
- Bồi thường cho người thân có thể trả vào tài khoản nhân viên.
- Tổng đài PTI: 1900 5454 75.

# Thời gian xử lý (ngày làm việc)

Xác nhận nhận hồ sơ: 1. Báo thiếu: 5. Báo kết quả: 5–7 (dưới 20 triệu), 10–15 (20–100 triệu), 15–20 (trên 100 triệu).
Hồ sơ cần xác minh: báo trong 10, xác minh trong 30. Chuyển tiền: 1–3 sau thông báo.

# Chứng từ

- Hóa đơn tài chính (bản gốc) mọi số tiền, kèm bảng kê; có mã tra cứu/đường link với cơ quan thuế; hóa đơn điện tử cần bản
  chuyển đổi. Xuất trong ngày điều trị (ngoại trú, răng) hoặc ngày ra viện (nội trú). Một đơn thuốc không tách nhiều phiếu thu.
  Người mua là **người được bảo hiểm** (họ tên, địa chỉ cư trú khớp hồ sơ y tế; CCCD khuyến khích) và ký ở ô người mua.
- Chứng từ y tế được dùng bản sao không cần dấu công ty. App coi hóa đơn điện tử PDF được chấp nhận như bình thường ([0012](/decisions/0012-scope-answers.md)). PTI có thể yêu cầu bản gốc.
- Đơn thuốc: chẩn đoán, ngày, thuốc, chữ ký và họ tên bác sĩ, dấu; không quá 30 ngày thuốc (bệnh dài ngày tối đa 90); mua trong
  5 ngày. Không mua thuốc hoặc không đòi tiền thuốc thì không cần hóa đơn thuốc.
- Đơn kính có hiệu lực 30 ngày; phải khám tại cơ sở y tế.
- Bệnh viện công: không cần bảng kê khi nội trú dưới 5.000.000 đ, ngoại trú dưới 1.000.000 đ; đơn in có mã bệnh viện không cần dấu.
- Cận lâm sàng không cần phiếu chỉ định nếu phù hợp chẩn đoán, phác đồ và có kết quả, điều trị.
- Răng: phiếu điều trị ghi nguyên nhân, số răng, vật liệu trám; phim X-quang khi chữa tủy hoặc nhổ răng.
- Vật lý trị liệu: chỉ định và phác đồ.
- Tai nạn: tường trình/biên bản; giấy tờ xe và bằng lái; trợ cấp thu nhập cần bảng chấm công hoặc bảng lương, chỉ định nghỉ.

# Bảo lãnh viện phí

Nội trú, ngoại trú, răng, theo danh sách PTI Care trên trang PTI. Giờ (trừ lễ, Tết): thứ 2–6 8:00–12:00 và 13:15–20:00;
thứ 7, Chủ nhật 8:00–12:00 và 13:15–17:30 (chỉ ngoại trú, răng). Không bảo lãnh: tai nạn, cấp cứu, thai sản trọn gói không
bảng kê, chi phí trước/sau nằm viện, trợ cấp, trường hợp chưa đủ cơ sở. Xuất trình thẻ bảo hiểm và giấy tờ tùy thân.

Hợp đồng liệt kê 40 cơ sở bị từ chối bồi thường và cho biết danh sách được cập nhật trên trang PTI; app dùng danh sách
cập nhật từ PTI ([Cơ sở y tế](/domain/medical-facility.md)).
