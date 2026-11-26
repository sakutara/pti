---
type: Domain Concept
title: Chứng từ bồi thường
description: Chứng từ PTI yêu cầu theo từng loại claim, yêu cầu về hóa đơn, và các điều kiện kèm ngưỡng tiền.
tags: [claims]
status: draft
generated: { by: claude-sonnet-5-5, at: 2026-11-26T09:00:00Z }
sources:
  - id: pti-guideline
    resource: https://new.pti.com.vn/wp-content/uploads/2025/09/Huongs-dan-chung-tu-boi-thuong-Anh-1.pdf
  - id: pti-pas
    resource: https://new.pti.com.vn/wp-content/uploads/2024/12/Huong-dan-thu-tuc-boi-thuong-BH-PHUC-AN-SINH.docx.pdf
---

# Nguồn

Theo [quy tắc hợp đồng 2026–2027](/domain/policy-2026.md) (ưu tiên, [0011](/decisions/0011-policy-summary-precedence.md)); chi tiết
checklist bổ sung từ hướng dẫn chứng từ PTI tháng 8/2025[^pti-guideline]. Dữ liệu máy đọc được:
`public/data/claim-requirements.json`.

Giấy yêu cầu bồi thường do app điền sẵn theo [mẫu](/domain/claim-form.md). Ảnh và hóa đơn điện tử PDF được quản lý trong
[kho chứng từ](/data/documents.md).

# Theo loại claim

| loại | chứng từ |
|---|---|
| Ngoại trú | đơn thuốc hoặc sổ khám; kết quả cận lâm sàng nếu có; hóa đơn + bảng kê; vật lý trị liệu thêm chỉ định và phác đồ |
| Kính mắt (chỉ nhân viên) | sổ khám/phiếu khám có chẩn đoán tại cơ sở y tế; đơn kính (còn hiệu lực 30 ngày); hóa đơn |
| Răng | phiếu điều trị răng; X-quang khi chữa tủy, nhổ răng; hóa đơn |
| Nội trú, thai sản | giấy ra viện; hóa đơn + bảng kê; giấy chứng nhận phẫu thuật nếu mổ; chuyển viện; chứng từ trước và sau nằm viện |

Tai nạn và tử vong không làm qua app.

# Quy tắc chính

Xem mục Chứng từ trong [quy tắc hợp đồng](/domain/policy-2026.md): bảng kê bệnh viện công 5.000.000 / 1.000.000 đ, mua thuốc
trong 5 ngày, người mua trên hóa đơn là người được bảo hiểm.
