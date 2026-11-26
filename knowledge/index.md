---
okf_version: "0.2"
---

# Product

* [Overview](product/overview.md) - PTI Claim dùng để làm gì, cho ai, ràng buộc
* [Roadmap](product/roadmap.md) - Các OpenSpec change theo giai đoạn

# Decisions

* [0001 No backend, local-first](decisions/0001-no-backend-local-first.md) - Dữ liệu chỉ nằm trong IndexedDB
* [0002 Tài khoản cục bộ](decisions/0002-local-account.md) - Tài khoản trên thiết bị, không OAuth
* [0003 Dữ liệu PTI trong repo](decisions/0003-pti-datasets-in-repo.md) - JSON trong public/data, GitHub Action mở PR hàng tháng
* [0004 Gửi bằng mailto](decisions/0004-mailto-submission.md) - Đã bị thay bởi 0010, còn làm cách dự phòng
* [0005 VietOCR chép từ chia-tien](decisions/0005-vietocr-copied.md) - Không phụ thuộc repo khác
* [0006 Marsh trước](decisions/0006-marsh-first.md) - FHVI/INSMART sau; các điểm chưa xác minh
* [0007 Nội dung repo công khai](decisions/0007-public-repo-content.md) - Chỉ thông tin công khai của PTI
* [0008 Đồng bộ Google Drive](decisions/0008-gdrive-sync.md) - appDataFolder, mã hóa đầu cuối
* [0009 Tên miền pti.fiddle.vn](decisions/0009-custom-domain.md) - Base path /, CNAME, origin OAuth
* [0010 Gửi bằng Gmail API](decisions/0010-gmail-api-submission.md) - gmail.send từ trình duyệt, xác minh với Google, mailto dự phòng
* [0011 Ưu tiên bảng tóm tắt hợp đồng](decisions/0011-policy-summary-precedence.md) - Hạn 365 ngày, tiêu đề, 15 MB, nộp bản gốc
* [0013 Chỉ dùng main](decisions/0013-main-only.md) - Không branch, không worktree
* [0012 Phạm vi và các điểm đã chốt](decisions/0012-scope-answers.md) - Không làm tai nạn/tử vong, con đến 25 tuổi, dữ liệu công khai

# Domain

* [Người được bảo hiểm](domain/insured-person.md) - NĐBH chính, người thân, thông tin cho giấy yêu cầu
* [Tài khoản cục bộ](domain/account.md) - Hồ sơ người dùng trên thiết bị
* [Sao lưu và khôi phục](domain/backup.md) - File .ptibackup
* [Quy tắc hợp đồng 2026–2027](domain/policy-2026.md) - Điều kiện, nộp hồ sơ, chứng từ, bảo lãnh
* [Gói quyền lợi](domain/benefit-plan.md) - 4 hạng, hạng mục, hạn mức, hạn nộp
* [Cơ sở y tế](domain/medical-facility.md) - Bảo lãnh viện phí, mạng lưới, blacklist, API PTI
* [Hồ sơ bồi thường](domain/claim.md) - Loại claim, vòng đời trạng thái
* [Chứng từ bồi thường](domain/claim-documents.md) - Chứng từ theo loại, ngưỡng tiền, hóa đơn
* [Giấy yêu cầu bồi thường](domain/claim-form.md) - Mẫu GYC, nguồn dữ liệu từng ô, cấu trúc email nộp
* [Kênh nộp hồ sơ](domain/claim-channel.md) - Đơn vị quản lý hồ sơ, Gmail API và mailto dự phòng

# Data

* [account](data/account.md) - Tài khoản cục bộ
* [persons](data/persons.md) - NĐBH và người thân
* [files](data/files.md) - Ảnh và PDF dạng Blob
* [claims](data/claims.md) - claims, claimEvents
* [documents](data/documents.md) - Kho chứng từ và kết quả OCR
* [Dữ liệu chung](data/static-datasets.md) - JSON trong public/data

# UI

* [App shell layout](ui/app-shell.md) - Mobile bottom bar, PC side nav, fluid tokens
* [Icon-first controls](ui/iconography.md) - When to use icon-only vs icon + label, drawing rules
* [Icon catalog](ui/icons.md) - Every drawn icon and where it is used

# Playbooks

* [Deploy to GitHub Pages](playbooks/deploy.md) - Local build and gh-pages push
* [Xác minh OAuth với Google](playbooks/google-oauth-verification.md) - Màn hình đồng ý, Search Console, video demo
* [Làm mới dữ liệu PTI](playbooks/refresh-pti-data.md) - Workflow CSYT, duyệt PR, deploy
* [Cập nhật gói quyền lợi](playbooks/update-benefits.md) - File benefits theo năm hợp đồng
