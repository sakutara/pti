---
type: Data Store
title: account table
description: Bản ghi tài khoản cục bộ duy nhất của thiết bị — cài đặt nộp claim, ngân hàng mặc định.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string (uuid) | primary key; một bản ghi mỗi thiết bị |
| displayName | string | tên hiển thị |
| administrator | 'marsh' \| 'fhvi' \| 'insmart' | mặc định 'marsh' |
| claimEmail | string \| null | ghi đè email nhận claim khi dataset chưa có |
| claimCc | string[] | CC thêm (vd. email cá nhân, HR) |
| defaultBank | { bankName, accountName, accountNumber, bankAddress? } \| null | |
| onboardedAt | number \| null | epoch ms |
| updatedAt | number (epoch ms) | index; last-write-wins |
| deleted | 0 \| 1 | soft delete |

# Indexes

`id, updatedAt`

# Versions

- v2 (add-account-and-people): table created

# Examples

{ "id": "a1", "displayName": "Leonard", "administrator": "marsh", "claimEmail": null, "claimCc": [], "defaultBank": null, "onboardedAt": 1764120000000, "updatedAt": 1764120000000, "deleted": 0 }
