---
type: Decision
title: Ảnh thẻ lên đầu, chỉ mặt trước; cài đặt nhận hồ sơ dùng chung; ngân hàng chỉ của nhân viên
description: Yêu cầu của chủ dự án ngày 2026-11-27 về trang người được bảo hiểm và cài đặt hồ sơ.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-27T05:00:00Z }
---

# Decision

- **Ảnh thẻ trước tiên**: trang người được bảo hiểm và màn hình tạo tài khoản bắt đầu bằng ảnh thẻ. Thẻ PTI không có mặt sau, nên
  chỉ chụp mặt trước. Ảnh được đọc trên máy bằng VietOCR (cùng mô hình đọc hóa đơn, [0005](/decisions/0005-vietocr-copied.md))
  và tự điền họ tên, ngày sinh, số thẻ, số hợp đồng, bên mua bảo hiểm, hiệu lực, hạng, CCCD, mã nhân viên; người dùng kiểm tra rồi lưu.
  Bộ đọc dựa vào nhãn ("Họ tên", "Ngày sinh", "Số thẻ", "Hiệu lực"…), chưa thử trên thẻ thật — cần ảnh thẻ mẫu để chỉnh.
- **Cài đặt nhận hồ sơ dùng chung** cho mọi người trong tài khoản: bên quản lý cố định là Marsh; email nhận và CC điền sẵn
  mặc định của Marsh (`nhanhsbt.mn@pti.com.vn`, CC `vietnamMMBclaims@marsh.com`), không được để trống. Giá trị bằng mặc định lưu là
  "chưa đặt" (null / []); người dùng sửa thì lưu đúng giá trị đã sửa. Danh sách CC của tài khoản **thay** danh sách mặc định.
- **Tài khoản nhận tiền chỉ của nhân viên**: chỉ NĐBH chính khai báo ngân hàng, chọn từ danh sách NAPAS chép từ chia-tien
  (`src/domain/banks.ts`). Hồ sơ của người thân cũng chuyển về tài khoản này. Bỏ "tài khoản mặc định" ở cài đặt; dữ liệu cũ
  (`person.bank` của người thân, `account.defaultBank`) chỉ dùng khi nhân viên chưa có tài khoản.

# Consequences

- Tài khoản đã lưu CC "thêm" theo cách cũ sẽ không còn tự kèm CC Marsh; trang Tài khoản hiện đúng danh sách sẽ dùng để người dùng sửa.
