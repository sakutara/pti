# Kho chứng từ và đọc tổng tiền bằng OCR

## Why
Mỗi lần đi khám người dùng nhận nhiều hóa đơn và giấy tờ lẻ, thường trước khi nghĩ đến việc lập hồ sơ. App cần một nơi giữ
mọi ảnh lẻ, đọc tổng tiền trên hóa đơn để không phải gõ lại và tự điền vào
[giấy yêu cầu bồi thường](/knowledge/domain/claim-form.md). OCR chạy trên thiết bị bằng VietOCR
([0005](/knowledge/decisions/0005-vietocr-copied.md)), ảnh không rời máy.

## What changes
- Kho chứng từ (`#/documents`): thêm bằng cách chụp, hoặc tải một hay nhiều ảnh và hóa đơn điện tử PDF từ máy; mỗi tệp là một chứng từ, ghép được
  thành chứng từ nhiều trang; phân loại, gán người, ghi ngày và số tiền; lọc; xem phóng to; xóa.
- Cảnh báo tệp trùng và ảnh độ phân giải thấp.
- Hóa đơn điện tử PDF: giữ nguyên tệp gốc, đọc số tiền từ lớp chữ (không cần mô hình); PDF chỉ có ảnh thì đọc bằng OCR.
- OCR: tải mô hình một lần khi người dùng đồng ý (khoảng 117 MB), chạy trong Web Worker, đọc hóa đơn, đề xuất tổng tiền và
  ngày; người dùng xác nhận hoặc sửa. Chưa có mô hình thì nhập tay, ảnh xếp hàng chờ đọc.
- Chép mã VietOCR và mô hình từ chia-tien vào repo.

## Impact
- Capabilities: document-library (ADDED), document-ocr (ADDED).
- Data: bảng `documents` ([documents](/knowledge/data/documents.md)); Dexie v2 → v3; `files.ownerType` thêm 'document'.
- Dependencies: `onnxruntime-web` (cùng phiên bản với chia-tien), `pdfjs-dist`.
- Hosting: `public/ocr/vietocr/` (~105 MB mô hình, ~11 MB WASM), không precache.
- Phụ thuộc change: `add-account-and-people`.
- Offline: thêm, xem, sửa chứng từ chạy offline; tải mô hình cần mạng; sau khi tải xong OCR chạy offline.
- Out of scope: nhập hóa đơn XML; PDF có mật khẩu; OCR ảnh thẻ; đọc đơn thuốc hay chẩn đoán; tự phân loại chứng từ; cảnh báo
  ảnh mờ; đối chiếu hóa đơn với cơ quan thuế.
