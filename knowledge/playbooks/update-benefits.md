---
type: Playbook
title: Cập nhật gói quyền lợi theo năm hợp đồng
description: Thêm hoặc sửa file public/data/benefits/<năm>.json khi có bảng quyền lợi mới từ Marsh/PTI.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

1. Làm trực tiếp trên `main` ([0013](/decisions/0013-main-only.md)).
2. Chép file năm trước thành `public/data/benefits/<năm>.json`; sửa `policyYear`, `effectiveFrom`, `effectiveTo` và giá trị từng hạng.
3. Chỉ đặt `"verified": true` khi đã đối chiếu từng con số với tài liệu gốc, theo đúng cột loại người được bảo hiểm.
4. Không đưa tên công ty, số hợp đồng hay thông tin nội bộ vào file ([0007](/decisions/0007-public-repo-content.md)).
5. Cập nhật `public/data/manifest.json`; chạy `npm test` (có test kiểm tra schema dataset); commit vào `main`.
