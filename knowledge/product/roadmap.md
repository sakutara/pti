---
type: Product
title: Roadmap
description: Các OpenSpec change theo giai đoạn, thứ tự triển khai và phụ thuộc.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Giai đoạn 1 — MVP

| change | capability | phụ thuộc |
|---|---|---|
| `add-account-and-people` | account, app-shell, backup | — |
| `add-public-pages` | public-pages | — (cần xong trước khi nộp xác minh Google) |
| `add-benefit-plans` | benefits | account |
| `add-facility-directory` | facilities, data-refresh | benefits (bộ nạp dataset) |
| `add-document-library` | document-library, document-ocr | account |
| `add-claim-filing` | claims, claim-submission, gmail-connection, claim-tracking, app-shell | account, benefits, facilities, public-pages, document-library |

Thứ tự archive phải đúng như bảng: `add-claim-filing` sửa (MODIFIED) spec `app-shell` do change đầu tạo.

# Giai đoạn 2

| change | nội dung |
|---|---|
| `add-ocr-checks` | OCR ảnh thẻ, cảnh báo ảnh mờ, tên không khớp, hóa đơn trùng theo số hóa đơn |
| `add-coverage-rules` | engine quy tắc: phân loại từng dòng chi phí được/không được/cần xác minh, ước tính số tiền được trả |
| `add-special-claim-flows` | hướng dẫn từng bước riêng cho thai sản, nội trú |
| `add-limit-tracking` | hạn mức còn lại theo người, theo hạng mục, tính cả đơn đang chờ |
| `add-gdrive-sync` | SyncAdapter Google Drive (appDataFolder), mã hóa đầu cuối |
| `add-tpa-networks` | danh sách CSYT qua FHVI/INSMART (phân tích PDF) |

# Giai đoạn 3

| change | nội dung |
|---|---|
| `add-policy-qa` | hỏi đáp chính sách bằng tìm kiếm cục bộ; tùy chọn dùng API key của người dùng |
| `add-visit-planner` | gợi ý cơ sở bảo lãnh trước khi đi khám theo chuyên khoa, khu vực, hạng thẻ |
| `add-reminders` | nhắc khi mở app và xuất `.ics` cho hạn nộp, ngày theo dõi |
| `add-faq-and-rejections` | FAQ và lý do hay bị từ chối, góp ý qua GitHub Issue |
| `add-english-ui` | giao diện tiếng Anh |
| `add-app-lock` | khóa app bằng PIN/sinh trắc học cục bộ |

Ngoài phạm vi: dashboard HR.
