# Gói quyền lợi theo hạng

## Why
Người dùng không biết hạng của mình (và của người thân) được chi trả gì, hạn mức bao nhiêu, đồng chi trả
ra sao, khoản nào bị loại trừ và hạn nộp hồ sơ là bao lâu. Bảng quyền lợi là của gói PTI, công khai được
([Gói quyền lợi](/knowledge/domain/benefit-plan.md), [0007](/knowledge/decisions/0007-public-repo-content.md)),
nên nằm trong repo dưới dạng dữ liệu có cấu trúc ([0003](/knowledge/decisions/0003-pti-datasets-in-repo.md)).
Change sau (`add-claim-filing`) dùng cùng dữ liệu để kiểm tra hạn nộp.

## What changes
- Dataset `public/data/benefits/2026.json` (đã có, từ [bảng tóm tắt hợp đồng](/knowledge/domain/policy-2026.md)) và
  `public/data/manifest.json`, kèm bộ nạp dataset dùng chung (kiểm tra schema, đọc được khi offline).
- Trang Quyền lợi (`#/benefits`): chọn người → quyền lợi theo hạng và loại người được bảo hiểm của người đó, nhóm theo hạng
  mục; đồng chi trả; quyền lợi mở rộng; thời gian chờ; loại trừ; hạn nộp; tổng đài.
- So sánh 4 hạng cho cùng loại người được bảo hiểm.
- Nhãn "Chưa xác minh" khi dataset có `verified: false`.
- Lối vào từ Trang chủ và trang người.

## Impact
- Capabilities: benefits (ADDED).
- Data: không đổi Dexie (dùng `persons.tier`, `persons.memberType`).
- Offline: hoàn toàn offline.
- Out of scope: hạn mức còn lại (`add-limit-tracking`); tự tính khoản được trả, kiểm tra tuổi tham gia và thời gian chờ
  (`add-coverage-rules`); hỏi đáp chính sách.
