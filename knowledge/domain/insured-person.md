---
type: Domain Concept
title: Người được bảo hiểm (NĐBH)
description: Một người có quyền lợi trong hợp đồng bảo hiểm nhóm — nhân viên hoặc người thân của nhân viên.
tags: [account, claims]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
sources:
  - id: pti-guideline
    resource: https://new.pti.com.vn/wp-content/uploads/2025/09/Huongs-dan-chung-tu-boi-thuong-Anh-1.pdf
---

# Định nghĩa

NĐBH là người mà chi phí y tế được PTI chi trả. Trong một [Tài khoản](/domain/account.md) có đúng một
NĐBH **chính** (nhân viên) và 0..n **người thân** (`relation`: spouse, child, parent, other).

# Thông tin cần cho hồ sơ bồi thường

Giấy yêu cầu bồi thường của PTI (mục 1.1)[^pti-guideline] cần:

- Họ tên, ngày sinh của NĐBH.
- Mã hợp đồng / số giấy chứng nhận bảo hiểm, tên bên mua bảo hiểm (công ty).
- Số điện thoại, email liên hệ.
- Tài khoản nhận tiền (của nhân viên, xem bên dưới): ngân hàng, chủ tài khoản, số tài khoản.
Hướng dẫn chung còn nêu hai mục dưới đây, nhưng hợp đồng này không cần ký khi nộp ([mẫu](/domain/claim-form.md)):

- Chữ ký, họ tên NĐBH (hoặc người đại diện nếu NĐBH dưới 18 tuổi).
- Chữ ký, dấu của đại diện bên mua bảo hiểm (trừ khi hợp đồng miễn).

Thêm cho chứng từ y tế và hóa đơn: số CCCD/hộ chiếu (hoặc giấy khai sinh với trẻ em), địa chỉ cư trú.

[Mẫu giấy yêu cầu của hợp đồng](/domain/claim-form.md) còn cần **mã số nhân viên**, **chức danh** của nhân viên và có ô địa chỉ
ngân hàng. Mã nhân viên và chức danh không bắt buộc khi tạo tài khoản, nhưng phải có trước khi nộp hồ sơ.

# Hạng bảo hiểm

Mỗi NĐBH thuộc một trong 4 hạng của gói quyền lợi PTI, xem [Gói quyền lợi](/domain/benefit-plan.md).
Người thân có thể khác hạng với nhân viên. Mỗi người còn có `memberType`: nhân viên, người thân được tài trợ, hoặc người
thân tự nguyện ([quy tắc hợp đồng](/domain/policy-2026.md)).

# Thẻ bảo hiểm

PTI không cấp thẻ điện tử; NĐBH có **ảnh thẻ** — chỉ mặt trước, thẻ không có mặt sau. Khi đi khám ở cơ sở bảo
lãnh, NĐBH xuất trình thẻ bảo hiểm và CCCD/hộ chiếu hoặc giấy khai sinh (trẻ em). App giữ ảnh thẻ để
xem toàn màn hình khi không có mạng, và đọc ảnh trên máy để tự điền thông tin người được bảo hiểm
([0015](/decisions/0015-card-first-shared-settings.md)).

# Tài khoản nhận tiền

Chỉ nhân viên (NĐBH chính) khai báo tài khoản nhận tiền; tiền bồi thường của người thân cũng về tài khoản này.

Lưu tại [persons](/data/persons.md) và [files](/data/files.md).
