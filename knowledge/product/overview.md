---
type: Product
title: PTI Claim
description: PWA giúp nhân viên và người thân tra quyền lợi bảo hiểm sức khỏe nhóm PTI, tìm cơ sở bảo lãnh viện phí, chuẩn bị và gửi hồ sơ bồi thường, theo dõi trạng thái — mọi dữ liệu cá nhân nằm trên máy người dùng.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
---

# Purpose

PTI Claim giúp người được bảo hiểm sức khỏe nhóm của PTI (công ty mua qua môi giới Marsh) biết mình
được chi trả gì, đi khám ở đâu không cần ứng tiền, và khi đã ứng tiền thì gom đủ chứng từ, gửi hồ sơ
bồi thường đúng cách và theo dõi kết quả.

Không dùng được app của PTI cho mô hình bảo hiểm nhóm này, nên app thay thế phần tra cứu và nộp hồ sơ.

# Users

- **Người được bảo hiểm chính**: nhân viên công ty, dùng điện thoại, thường chụp chứng từ ngay tại quầy.
- **Người thân được bảo hiểm** (vợ/chồng, con, bố mẹ): thường do nhân viên tạo hồ sơ và nộp claim hộ.
- **Người bảo trì dữ liệu** (chủ repo): duyệt PR cập nhật dữ liệu chung của PTI và triển khai lại app.

Không có vai trò HR hay quản trị trong app: không có server, không có tài khoản trực tuyến.

# Constraints

- [0001 No backend, local-first](/decisions/0001-no-backend-local-first.md)
- [0002 Tài khoản cục bộ](/decisions/0002-local-account.md)
- [0003 Dữ liệu chung PTI nằm trong repo, làm mới bằng GitHub Action](/decisions/0003-pti-datasets-in-repo.md)
- [0010 Gửi hồ sơ bằng Gmail API, mailto dự phòng](/decisions/0010-gmail-api-submission.md)
- [0005 VietOCR chép từ chia-tien](/decisions/0005-vietocr-copied.md)
- [0006 Marsh trước, FHVI/INSMART sau](/decisions/0006-marsh-first.md)
- [0007 Repo công khai chỉ chứa thông tin công khai của PTI](/decisions/0007-public-repo-content.md)
- [0008 Đồng bộ Google Drive có mã hóa](/decisions/0008-gdrive-sync.md)
- [0009 Tên miền pti.fiddle.vn](/decisions/0009-custom-domain.md)

Lộ trình: [Roadmap](/product/roadmap.md). Hành vi nằm trong `/openspec/specs/`.
