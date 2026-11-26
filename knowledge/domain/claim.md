---
type: Domain Concept
title: Hồ sơ bồi thường (claim)
description: Yêu cầu PTI hoàn tiền cho chi phí y tế NĐBH đã tự trả — loại claim, vòng đời trạng thái, số tiền.
tags: [claims]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Định nghĩa

Một claim gắn với một [NĐBH](/domain/insured-person.md) và một **đợt điều trị** (ngày điều trị, cơ sở
y tế, chẩn đoán). Có một **lý do** ngắn (dùng cho tiêu đề email và tên tệp). Gồm các **chứng từ**; mỗi hóa đơn có ngày và số tiền, tổng
các hóa đơn là số tiền yêu cầu. Chứng từ theo
([Chứng từ bồi thường](/domain/claim-documents.md)).

# Loại claim (`type`)

`outpatient` (ngoại trú), `dental` (nha khoa), `optical` (kính mắt, chỉ nhân viên), `inpatient` (nội trú), `maternity`
(thai sản). Ba loại đầu nộp qua email; hai loại sau phải nộp bản gốc. **Tai nạn và tử vong không làm qua app**
([0012](/decisions/0012-scope-answers.md)).

# Vòng đời (`status`)

```
draft → ready → submitted → (need_info → submitted)* → approved | partially_approved | rejected → paid
```

| status | nghĩa | ai đổi |
|---|---|---|
| draft | đang nhập | app |
| ready | đủ chứng từ bắt buộc, đã dựng hai tệp nộp | app |
| submitted | người dùng xác nhận đã gửi email | người dùng |
| need_info | PTI/Marsh yêu cầu bổ sung | người dùng |
| approved / partially_approved / rejected | kết quả, kèm số tiền duyệt và lý do | người dùng |
| paid | đã nhận tiền | người dùng |

Mọi lần đổi trạng thái tạo một sự kiện trong [claimEvents](/data/claims.md) để xem lịch sử.
Không có server, nên trạng thái sau `submitted` do người dùng tự cập nhật theo email phản hồi.

# Kiểm tra trước khi nộp

- Thẻ còn hiệu lực vào ngày điều trị.
- Còn trong hạn nộp 365 ngày (`claimDeadlineDays`, xem [Gói quyền lợi](/domain/benefit-plan.md)).
- Ngày hóa đơn trùng ngày khám; lệch thì nhắc kèm phiếu thu.
- Cơ sở không thuộc blacklist ([Cơ sở y tế](/domain/medical-facility.md)).
- Nếu cơ sở có bảo lãnh cho loại điều trị này: nhắc rằng lần sau có thể không cần ứng tiền.

Hành vi: `/openspec/specs/claims/spec.md`, `claim-submission`, `claim-tracking`.
