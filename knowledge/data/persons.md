---
type: Data Store
title: persons table
description: NĐBH chính và người thân — thông tin cá nhân, hạng bảo hiểm, thẻ, tài khoản nhận tiền.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string (uuid) | primary key |
| accountId | string | index |
| role | 'holder' \| 'dependent' | đúng một holder mỗi account |
| relation | 'self' \| 'spouse' \| 'child' \| 'parent' \| 'other' | holder = 'self' |
| fullName | string | bắt buộc |
| dateOfBirth | string (YYYY-MM-DD) | bắt buộc |
| idNumber | string \| null | CCCD/hộ chiếu/giấy khai sinh |
| phone, email, address | string \| null | |
| employeeCode | string \| null | tùy chọn |
| jobTitle | string \| null | chức danh; chỉ dùng cho NĐBH chính |
| memberType | 'employee' \| 'sponsored' \| 'voluntary' | NĐBH chính luôn là 'employee' |
| tier | 1 \| 2 \| 3 \| 4 | hạng bảo hiểm |
| policyholderName | string \| null | tên công ty mua bảo hiểm |
| contractCode | string \| null | mã HĐ / số GCN |
| cardNumber | string \| null | số thẻ |
| cardValidFrom, cardValidTo | string (YYYY-MM-DD) \| null | |
| cardFrontFileId, cardBackFileId | string \| null | → files.id |
| bank | { bankName, accountName, accountNumber, bankAddress? } \| null | null = dùng account.defaultBank |
| updatedAt | number | index |
| deleted | 0 \| 1 | |

# Indexes

`id, accountId, updatedAt`

# Versions

- v2 (add-account-and-people): table created
