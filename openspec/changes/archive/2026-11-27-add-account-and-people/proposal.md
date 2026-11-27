# Tài khoản cục bộ, người được bảo hiểm và ví thẻ

## Why
Mỗi lần nộp claim, giấy yêu cầu bồi thường của PTI cần cùng một bộ thông tin: họ tên, ngày sinh, mã HĐ/GCN,
bên mua bảo hiểm, liên hệ, tài khoản nhận tiền ([NĐBH](/knowledge/domain/insured-person.md)). Người dùng cần
nhập một lần và dùng lại cho cả mình lẫn người thân, mà không có đăng nhập hay server
([Tài khoản cục bộ](/knowledge/domain/account.md), [0002](/knowledge/decisions/0002-local-account.md)).
PTI chỉ cấp ảnh thẻ, nên app cần giữ ảnh thẻ để xuất trình được cả khi không có mạng.

Đây cũng là change đầu tiên, nên nó dựng khung điều hướng của app và hoàn thiện sao lưu/khôi phục
(bắt buộc vì dữ liệu chỉ nằm trên một thiết bị, [Sao lưu](/knowledge/domain/backup.md)).

## What changes
- Khung app: 4 tab Trang chủ, Hồ sơ claim, Cơ sở y tế, Tài khoản; router dạng hash; chuỗi giao diện nằm trong `src/i18n/vi.ts`.
- Lần đầu mở app: màn hình tạo tài khoản (nhập thông tin NĐBH chính), nhắc cài app lên màn hình chính.
- Tài khoản: sửa thông tin NĐBH chính, cài đặt nộp claim (đơn vị quản lý hồ sơ, email nhận claim, CC), tài khoản ngân hàng mặc định.
- Người thân: thêm, sửa, xóa người thân; mỗi người có hạng bảo hiểm và thẻ riêng.
- Ví thẻ: chụp hoặc chọn ảnh mặt trước/sau thẻ, nén ảnh, xem toàn màn hình kèm họ tên và số thẻ.
- Sao lưu/khôi phục: file `.ptibackup` (zip) gồm mọi bảng và ảnh; xin quyền lưu trữ bền vững; hiện dung lượng đang dùng.

## Impact
- Capabilities: app-shell (ADDED), account (ADDED), backup (ADDED).
- Data: bảng `account`, `persons`, `files`; Dexie v1 → v2 (không có dữ liệu cần migrate).
- Dependencies: thêm `fflate` (zip cho sao lưu).
- Offline: hoàn toàn offline. Không có yêu cầu mạng.
- Out of scope: nhiều tài khoản trên một thiết bị; khóa app bằng PIN; OCR ảnh thẻ (giai đoạn 2,
  `add-ocr-checks`); mã hóa file sao lưu và đồng bộ Google Drive (giai đoạn 2, `add-gdrive-sync`);
  giao diện tiếng Anh; xác thực số CCCD hay số tài khoản với dịch vụ bên ngoài.
