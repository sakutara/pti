---
type: Decision
title: Chép VietOCR từ chia-tien vào repo này
description: Mã OCR và mô hình ONNX được chép vào repo pti, không tải từ repo chia-tien, để hai app không phụ thuộc nhau.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-26T01:30:00Z }
verified:
  - { by: human:owner, at: 2026-11-26T04:00:00Z }
---

# Decision

- Chép `workers/vietOcrWorker.ts`, `domain/vietOcr.ts`, `domain/ocrLayout.ts`, `lib/imageScan.ts`,
  `lib/imagePreprocess.ts` và test tương ứng từ `~/Work/fee-calculator/app/src/`, cùng
  `public/ocr/vietocr/` (det.onnx, encoder, decoder, ort WASM, LICENSE). Giữ file LICENSE của mô hình.
- Mô hình (~110 MB) không precache; tải khi người dùng bật OCR lần đầu, lưu cache runtime (CacheFirst).
- GitHub Pages không phục vụ file LFS, nên file mô hình phải được commit thường vào nhánh `gh-pages`
  (encoder 84 MB, dưới giới hạn 100 MB/file của GitHub).
- Làm ngay ở giai đoạn 1 (`add-document-library`): đọc tổng tiền hóa đơn để tự điền giấy yêu cầu.
  (Chủ dự án yêu cầu ngày 2026-11-26; trước đó xếp ở giai đoạn 2.)
- Chép thêm các phụ thuộc cần thiết (`lib/documentScan.ts`, `lib/imageCompress.ts` và phần liên quan).
