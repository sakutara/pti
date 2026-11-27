---
type: Data Store
title: documents table
description: Kho chứng từ — mỗi bản ghi là một chứng từ gồm một hay nhiều ảnh, kèm loại, ngày, số tiền và kết quả OCR.
status: draft
generated: { by: claude-sonnet-5-5, at: 2026-11-26T06:00:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string (uuid) | primary key |
| personId | string \| null | NĐBH của chứng từ |
| claimId | string \| null | null = chưa thuộc hồ sơ nào |
| category | 'invoice' \| 'invoice-breakdown' \| 'prescription' \| 'medical-record' \| 'lab-order' \| 'lab-result' \| 'treatment-plan' \| 'dental-record' \| 'xray' \| 'discharge' \| 'surgery-cert' \| 'transfer' \| 'pre-admission' \| 'post-discharge' \| 'other' | index |
| fileIds | string[] | các tệp theo thứ tự (ảnh JPEG hoặc PDF hóa đơn điện tử) → [files](/data/files.md) |
| docDate | string (YYYY-MM-DD) \| null | ngày trên chứng từ |
| amount | number \| null | VNĐ nguyên; chỉ cho hóa đơn |
| amountSource | 'ocr' \| 'manual' \| null | |
| amountConfirmed | boolean | chỉ số đã xác nhận mới vào tổng |
| ocrStatus | 'none' \| 'pending' \| 'done' \| 'failed' | |
| ocrText | string \| null | |
| ocrCandidates | { amount, label, confidence: 'high' \| 'low' }[] | |
| lowResolution | boolean | true khi một ảnh thêm vào có cạnh dài < 1200 px; hiện cảnh báo trong lưới và trình sửa |
| createdAt, updatedAt | number | index updatedAt |
| deleted | 0 \| 1 | |

Indexes: `id, personId, claimId, category, updatedAt`

# Versions

- v3 (add-document-library): table created
