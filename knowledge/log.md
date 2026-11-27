# Log

## 2026-11-27

- build: sửa chip lọc hồ sơ, hiện ảnh hóa đơn ở bước Hóa đơn, sửa test e2e chập chờn; thêm e2e nén ảnh vượt 15 MB và Gmail khi offline (client giả)

- archive: cả 6 change đã archive vào openspec/specs; chưa commit, chưa deploy
- build: change add-claim-filing implemented (lập, gửi, theo dõi hồ sơ); chưa gửi Gmail thật

- build: change add-document-library implemented (OCR thật chạy trong trình duyệt offline; 730 unit, 64 e2e); sửa lỗi cache mô hình (MIME, Vary); chưa commit, chưa archive

- build: change add-facility-directory implemented (dữ liệu PTI thật: 232 bảo lãnh, 37 loại trừ; 517 unit, 52 e2e); chưa commit, chưa archive

- build: change add-benefit-plans implemented và kiểm tra đủ (348 unit, 34 e2e), sửa thứ tự cột màn hình rộng; chưa commit, chưa archive

## 2026-11-27

- build: ảnh thẻ lên đầu (chỉ mặt trước) + OCR tự điền; cài đặt nhận hồ sơ dùng chung (Marsh cố định, email mặc định điền sẵn); ngân hàng chỉ của nhân viên, chọn từ danh sách NAPAS của chia-tien; bản đồ Google Maps + xếp CSYT theo khoảng cách; decisions 0014, 0015 (chờ duyệt)

## 2026-11-26

- build: change add-public-pages implemented (trang /about/, /privacy/, email liên hệ do chủ dự án cung cấp); chưa archive, chưa deploy

- decisions: 0013 không ngoại lệ: deploy từ docs/ trên main, workflow dữ liệu commit thẳng vào main

- decisions: 0013 chỉ làm việc trên main, không branch hay worktree

- build: change add-account-and-people implemented (218 unit, 12 e2e pass); 13 icons added; commit trên main, chưa archive

- decisions: 0012 (bỏ hồ sơ tai nạn/tử vong, mẫu sửa 365 ngày, con đến 25, dữ liệu quyền lợi công khai)

- data: nhập bảng tóm tắt hợp đồng 2026–2027: public/data/benefits/2026.json, manifest, domain/policy-2026, decision 0011 (chờ duyệt); thêm memberType, loại claim optical, nộp bản gốc

- planning: tạo mẫu GYC trống public/forms/gyc-template.pdf + gyc-fields.json; không cần ký; một tệp PDF chứng từ gồm ảnh và hóa đơn điện tử; xác nhận hai địa chỉ nhận

- planning: nhận thông tin gửi claim (email, CC, tiêu đề, mẫu GYC, hạn 180 ngày); thêm domain/claim-form, data/documents; OCR tổng tiền và kho chứng từ chuyển vào giai đoạn 1 (change add-document-library); bỏ claimItems/claimDocs

- decisions: chủ dự án duyệt 0001–0010 (0004 deprecated, thay bởi 0010); chờ thông tin từ PTI/Marsh rồi mới chốt kế hoạch và bắt đầu xây dựng

- planning: decision 0010 gửi bằng Gmail API (thay 0004, mailto còn làm dự phòng); playbook google-oauth-verification; thêm change add-public-pages

- planning: thêm decision 0009 tên miền pti.fiddle.vn (chờ duyệt)

- planning: thêm product/overview, product/roadmap; domain (insured-person, account, backup, benefit-plan, medical-facility, claim, claim-documents, claim-channel); data (account, persons, files, claims, static-datasets); decisions 0002–0008; playbooks refresh-pti-data, update-benefits
- bootstrap: created knowledge bundle (product overview, decision 0001, app shell, iconography + icon catalog, deploy playbook)
