---
type: Domain Concept
title: Tài khoản cục bộ
description: Hồ sơ người dùng lưu trên thiết bị để không phải nhập lại thông tin — không đăng nhập, không OAuth, không server.
tags: [account]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Định nghĩa

"Tài khoản" là một bản ghi trên thiết bị gom: NĐBH chính, người thân, tài khoản ngân hàng mặc định,
đơn vị quản lý hồ sơ (mặc định Marsh), địa chỉ email nhận claim do người dùng tự nhập nếu dữ liệu chung
chưa có. Mỗi thiết bị có một tài khoản.

Tài khoản **không** liên kết với Google, Microsoft hay bất kỳ dịch vụ đăng nhập nào. Kết nối Google
Drive (giai đoạn 2) là một tính năng đồng bộ riêng, không phải cách đăng nhập, xem
[0008](/decisions/0008-gdrive-sync.md).

Chuyển sang thiết bị khác bằng sao lưu/khôi phục, xem [Sao lưu](/domain/backup.md).

Lưu tại [account](/data/account.md). Quyết định: [0002](/decisions/0002-local-account.md).
