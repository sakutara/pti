---
type: Domain Concept
title: Cơ sở y tế và bảo lãnh viện phí
description: Bệnh viện/phòng khám trong mạng lưới bảo lãnh viện phí (direct billing) của PTI hoặc TPA, và danh sách cơ sở bị loại trừ.
tags: [facilities]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
sources:
  - id: pti-api
    resource: https://www.pti.com.vn/dms-gw/pms-api/public/codebook/pti/medical-facility/search
  - id: pti-page
    resource: https://www.pti.com.vn/benh-vien-lien-ket/
  - id: pti-blvp
    resource: https://new.pti.com.vn/wp-content/uploads/2025/08/4.-Quy-trinh-Bao-lanh-vien-phi.pdf
---

# Định nghĩa

**Bảo lãnh viện phí (BLVP, direct billing)**: NĐBH khám tại cơ sở trong mạng lưới, xuất trình thẻ
bảo hiểm và CCCD/hộ chiếu (giấy khai sinh với trẻ em); cơ sở gửi yêu cầu bảo lãnh cho PTI, PTI trả
lời trong khoảng 15 phút (ngoại trú) hoặc 6 giờ (nội trú)[^pti-blvp]. NĐBH chỉ tự trả phần không
được bảo lãnh. Nếu bị từ chối bảo lãnh, NĐBH tự trả rồi nộp hồ sơ bồi thường.

**Mạng lưới** (`network`):

| network | nguồn | trạng thái |
|---|---|---|
| pti | API JSON công khai của PTI[^pti-api] | giai đoạn 1 |
| fhvi | PDF "Danh sách CSYT bảo lãnh qua FHVI" | giai đoạn 2 |
| insmart | PDF "Danh sách CSYT bảo lãnh qua INSMART" | giai đoạn 2 |

**Cơ sở loại trừ** (blacklist): PTI không chi trả chi phí phát sinh ở đây, kể cả khi NĐBH tự trả.

# Trường dữ liệu từ API PTI

`name`, `nameEn`, `phoneNumber`, `address`, `timeReceiveGuarantee` (giờ nhận bảo lãnh),
`medicalSpecialty`, `inpatientGuarantee` / `outpatientGuarantee` / `dentalGuarantee`
(mã `NVCN028.1`, `NVCN032.1`, `NVCN030.1` = có bảo lãnh), `isPtiGuarantee` (`NVCN031.1`),
`blacklist` (`PLC040.1` = thuộc blacklist). Tham số tìm kiếm: `pageIndex`, `pageSize`, `name`,
`province`, `ward`, `isPtiGuarantee`, `blacklist`. Danh mục tỉnh: `/dms-gw/pms-api/public/codebook/query?subDomainCode=PLC065`.
Ngày 2026-11-27 danh mục có 319 cơ sở: 232 PTI bảo lãnh, 37 loại trừ và 50 ghi rõ không bảo lãnh
(`NVCN031.0`, không có dịch vụ nào; app không hiển thị).

API không trả header CORS, nên trình duyệt trên GitHub Pages không gọi trực tiếp được; dữ liệu được lấy
bằng GitHub Action ([0003](/decisions/0003-pti-datasets-in-repo.md)). API không được PTI công bố chính
thức và có thể đổi bất cứ lúc nào.

Theo trang PTI[^pti-page], danh sách bảo lãnh áp dụng tùy sản phẩm và điều kiện hợp đồng. Với hợp đồng
qua Marsh, app tạm coi mạng lưới là `pti` (chưa xác minh), xem [0006](/decisions/0006-marsh-first.md).

Dataset: [Dữ liệu chung](/data/static-datasets.md). Hành vi: `/openspec/specs/facilities/spec.md`.

# Bảo lãnh theo hợp đồng

Giờ bảo lãnh và trường hợp không bảo lãnh: [quy tắc hợp đồng](/domain/policy-2026.md).
