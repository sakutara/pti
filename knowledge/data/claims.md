---
type: Data Store
title: claims, claimEvents tables
description: Hồ sơ bồi thường và lịch sử trạng thái; chứng từ và số tiền nằm ở bảng documents.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# claims

| field | type | notes |
|---|---|---|
| id | string (uuid) | primary key |
| personId | string | index |
| type | 'outpatient' \| 'dental' \| 'optical' \| 'inpatient' \| 'maternity' | |
| status | xem [Hồ sơ bồi thường](/domain/claim.md) | index |
| treatmentDate | string (YYYY-MM-DD) | ngày khám hoặc ngày nhập viện |
| facilityId | string \| null | id trong dataset CSYT |
| facilityName | string | nhập tay khi không có trong dataset |
| reason | string | lý do ngắn, dùng cho tiêu đề email và tên tệp |
| originalsSubmittedAt | number \| null | ngày đã nộp bản gốc (nội trú, thai sản) |
| daysOff | number | số ngày nghỉ yêu cầu bồi thường, mặc định 0 |
| admissionDate, dischargeDate | string \| null | cho nội trú |
| bank | { bankName, accountName, accountNumber, bankAddress? } \| null | tài khoản nhận tiền chọn riêng cho claim |
| notApplicable | string[] | id yêu cầu tùy chọn được đánh dấu "Không có" |
| diagnosis | string \| null | |
| flags | { multiDayTreatment?, surgery?, transfer?, publicFacility?, rootCanalOrExtraction? } | điều kiện cho checklist |
| totalClaimed | number (VNĐ) | tổng `amount` đã xác nhận của hóa đơn trong claim |
| approvedAmount | number \| null | |
| rejectionReason | string \| null | |
| submittedAt | number \| null | |
| bundleFileIds | string[] | tệp GYC và (các) tệp chứng từ, → files.id (kind 'bundle') |
| wizardStep | 0..5 | bước đang dở của trình tạo hồ sơ |
| sentVia | 'gmail' \| 'mailto' \| null | kênh đã dùng |
| gmailThreadId | string \| null | thread của email đã gửi |
| lastSubmittedFileIds | string[] | ảnh đã gửi lần gần nhất, cho hồ sơ bổ sung |
| updatedAt | number | index |
| deleted | 0 \| 1 | |

Indexes: `id, personId, status, treatmentDate, updatedAt`

# claimEvents

`id, claimId, at (epoch ms), status, note, amount (number|null), updatedAt, deleted`
Indexes: `id, claimId, at, updatedAt`

# settings: gmailSentUnsaved (chỉ trên máy này)

Khóa `gmailSentUnsaved:<claimId>` trong bảng `settings` (`key`, `value`, `updatedAt`). Không vào outbox và không đồng bộ.
`value` là `{ threadId: string, at: number }`. Ghi khi Gmail đã nhận thư nhưng lưu trạng thái `submitted` thất bại; trong
lúc khóa còn, bước gửi không cho gửi lại mà chỉ hiện "Đánh dấu đã nộp" (thử lại việc ghi trạng thái). Khóa bị xóa sau khi
ghi trạng thái thành công.

# Versions

- v4 (add-claim-filing): bảng `claims`, `claimEvents` được tạo
