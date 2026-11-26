---
type: Domain Concept
title: Gói quyền lợi và hạng bảo hiểm
description: Bảng quyền lợi của 4 hạng trong gói PTI — hạn mức, đồng chi trả, thời gian chờ, loại trừ — theo năm hợp đồng.
tags: [benefits]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Định nghĩa

Một **năm hợp đồng** (`policyYear`, có `effectiveFrom`/`effectiveTo`) có 4 **hạng** (`tier` 1..4).
Mỗi hạng có danh sách **quyền lợi** theo **hạng mục** (`category`):

| category | nghĩa |
|---|---|
| outpatient | ngoại trú (khám, thuốc, cận lâm sàng) |
| inpatient | nội trú (nằm viện, phẫu thuật, trước/sau nhập viện) |
| maternity | thai sản |
| dental | nha khoa |
| optical | kính thuốc |
| accident | tai nạn |
| income | trợ cấp thu nhập/mất thu nhập |

Mỗi quyền lợi có thể có: `limitPerYear`, `limitPerVisit`, `limitPerDay`, `visitsPerYear`,
`copayPercent`, `waitingDays`, `notes`. Tiền là VNĐ, số nguyên. Trường không có = không giới hạn
hoặc chưa biết (`notes` nói rõ).

Hợp đồng có thêm `exclusions` (danh sách loại trừ, kèm từ khóa để cảnh báo sau này) và
`claimDeadlineDays` (hạn nộp hồ sơ tính từ ngày điều trị).

# Nguồn và độ tin cậy

Bảng quyền lợi là của gói PTI, không phải thông tin nội bộ công ty
([0007](/decisions/0007-public-repo-content.md)). Mỗi file dữ liệu có `verified`: `false` khi giá
trị chưa đối chiếu với tài liệu Marsh/PTI; khi đó app hiện nhãn "Chưa xác minh".

Hạn nộp: **365 ngày** kể từ ngày kết thúc đợt điều trị.

Quyền lợi khác nhau theo hạng **và** theo `memberType` (nhân viên, người thân tài trợ, người thân tự nguyện); số liệu thật
ở `public/data/benefits/2026.json`, quy tắc đi kèm ở [quy tắc hợp đồng](/domain/policy-2026.md). Hạng mục thêm `life` (sinh mạng).

Dataset: [Dữ liệu chung](/data/static-datasets.md). Hành vi: `/openspec/specs/benefits/spec.md`.
