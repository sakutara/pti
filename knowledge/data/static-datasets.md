---
type: Data Store
title: Dữ liệu chung (public/data)
description: File JSON trong repo, đóng gói vào bản build — gói quyền lợi, CSYT, yêu cầu chứng từ, đơn vị quản lý hồ sơ.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

Không phải bảng Dexie. Các file nằm ở `public/data/`, được Vite chép vào `dist/data/` và được service
worker precache, nên dùng được khi không có mạng. Quyết định: [0003](/decisions/0003-pti-datasets-in-repo.md).

| file | nội dung | cập nhật |
|---|---|---|
| `manifest.json` | `{ datasets: { <name>: { path, updatedAt, version } } }` | mỗi lần đổi dataset |
| `benefits/<policyYear>.json` | 4 hạng, quyền lợi, loại trừ, `claimDeadlineDays`, `verified` | tay, mỗi năm hợp đồng |
| `facilities/pti.json` | `{ fetchedAt, source, count, provinces[], facilities[] }` | GitHub Action hàng tháng |
| `claim-requirements.json` | yêu cầu chứng từ theo loại claim, điều kiện, hướng dẫn hóa đơn | tay, khi PTI đổi hướng dẫn |
| `administrators/marsh.json` | email, CC, mẫu tiêu đề/nội dung, mạng lưới CSYT | tay |

# facilities/pti.json — một phần tử

{ "id": "f-3a9c…", "name": "Bệnh viện Bạch Mai", "nameEn": "BACH MAI HOSPITAL", "phone": "0969 851 616 / 1900 888 866", "address": "Số 78, đường Giải Phóng, Phường Kim Liên, Thành phố Hà Nội", "provinceCode": "01", "provinceName": "Thành phố Hà Nội", "hours": "…", "specialty": "Đa khoa", "inpatient": true, "outpatient": true, "dental": true, "blacklisted": false, "network": "pti" }

`id` = `f-` + 12 ký tự hex đầu của sha1(`name|address` đã chuẩn hóa), để giữ ổn định giữa các lần làm mới.

# claim-requirements.json — một phần tử

{ "id": "outpatient.prescription", "claimTypes": ["outpatient"], "categories": ["prescription", "medical-record"], "title": "Đơn thuốc hoặc sổ khám", "required": true, "when": null, "checklist": ["Tên cơ sở y tế", "Ngày khám", "Họ tên, tuổi NĐBH", "Chẩn đoán", "Chữ ký, họ tên bác sĩ", "Tên, số lượng, cách dùng thuốc", "Dấu cơ sở (trừ đơn in có mã vạch của bệnh viện công)"] }

`when` là điều kiện đơn giản: `{ "flag": "surgery" }`, `{ "not": { ... } }`,
`{ "totalGte": 10000000 }`, hoặc `{ "all": [...] }` / `{ "any": [...] }`.
