## 1. Data

- [x] 1.1 Kiểu và Dexie v3
  - Scenarios: document-library.add.capture
  - Files: src/domain/document-types.ts, src/db/db.ts, tests/unit/db.v3.test.ts
  - Test: npx vitest run tests/unit/db.v3.test.ts
  - Done when: `db.verno` = 3, bảng `documents` đúng index; DB v2 mở lên v3 giữ dữ liệu

- [x] 1.2 documents-repo
  - Scenarios: document-library.add.capture, document-library.add.upload-many, document-library.add.einvoice-pdf, document-library.add.low-resolution, document-library.add.unreadable, document-library.add.duplicate, document-library.add.offline, document-library.add.resync, document-library.edit.invoice, document-library.edit.invalid-amount, document-library.edit.merge, document-library.edit.filter, document-library.delete.free, document-ocr.review.confirm, document-ocr.review.other-candidate, document-ocr.review.keep-manual
  - Files: src/data/documents-repo.ts, tests/unit/documents-repo.test.ts
  - Test: npx vitest run tests/unit/documents-repo.test.ts
  - Done when: các hàm trong design; mọi ghi có outbox cùng transaction; tệp trùng sha256 bị bỏ qua; ảnh lưu 2400 px q 0.85, PDF giữ nguyên

## 2. OCR

- [x] 2.1 Chép VietOCR từ chia-tien
  - Scenarios: document-ocr.model.offline-ready
  - Files: package.json (onnxruntime-web cùng phiên bản), src/workers/vietOcrWorker.ts, src/domain/{vietOcr,ocrLayout}.ts, src/lib/{imageScan,imagePreprocess,documentScan,imageCompress}.ts, public/ocr/vietocr/**, tests/unit tương ứng
  - Test: npm test && npm run build
  - Done when: test chép sang pass; build thành công; không import đường dẫn ra ngoài repo; LICENSE mô hình còn nguyên

- [x] 2.2 Đọc tổng tiền và ngày
  - Scenarios: document-ocr.extract.total-label, document-ocr.extract.patient-share, document-ocr.extract.ignore, document-ocr.extract.next-line, document-ocr.extract.low-confidence, document-ocr.extract.none, document-ocr.extract.date
  - Files: src/domain/receipt-amount.ts, src/domain/receipt-date.ts, tests/unit/receipt-amount.test.ts
  - Test: npx vitest run tests/unit/receipt-amount.test.ts
  - Done when: đúng quy tắc trong design, dữ liệu test giả

- [x] 2.2a Đọc PDF
  - Scenarios: document-library.add.einvoice-pdf, document-library.add.protected-pdf, document-ocr.pdf.text, document-ocr.pdf.scanned
  - Files: package.json (pdfjs-dist), src/lib/pdf-read.ts, src/data/ocr-queue.ts, tests/unit/pdf-read.test.ts
  - Test: npx vitest run tests/unit/pdf-read.test.ts
  - Done when: PDF giả có lớp chữ trả đúng dòng và đề xuất số tiền không cần mô hình; PDF không chữ vào hàng đợi; PDF mật khẩu trả lỗi

- [x] 2.3 Tải mô hình và hàng đợi
  - Scenarios: document-ocr.model.consent, document-ocr.model.progress, document-ocr.model.failure, document-ocr.queue.offline, document-ocr.queue.resync, document-ocr.queue.failure
  - Files: src/data/ocr-model.ts, src/data/ocr-queue.ts, vite.config.ts, tests/unit/ocr-model.test.ts, tests/unit/ocr-queue.test.ts
  - Test: npx vitest run tests/unit/ocr-model.test.ts tests/unit/ocr-queue.test.ts
  - Done when: với fetch/cache/engine giả; precache không chứa `ocr/`; tải lại chỉ tải tệp thiếu

## 3. UI

- [x] 3.1 DocumentsPage
  - Scenarios: document-library.add.capture, document-library.add.unreadable, document-library.edit.filter, document-library.delete.in-claim, document-library.add.a11y, document-ocr.model.consent
  - Files: src/pages/DocumentsPage.tsx, src/ui/{AddDocumentBar,OcrModelBanner,DocumentFilters,DocumentCard}.tsx, src/router.ts, src/pages/HomePage.tsx, src/i18n/vi.ts, tests/unit/documents-page.test.tsx
  - Test: npx vitest run tests/unit/documents-page.test.tsx
  - Done when: thêm nhiều ảnh, lọc, banner tải mô hình, nút "Chứng từ" ở Trang chủ

- [x] 3.2 DocumentEditor
  - Scenarios: document-ocr.review.confirm, document-ocr.review.other-candidate, document-library.edit.invoice, document-library.edit.merge, document-library.delete.free
  - Files: src/ui/DocumentEditor.tsx, tests/unit/document-editor.test.tsx
  - Test: npx vitest run tests/unit/document-editor.test.tsx
  - Done when: ảnh cạnh ô số tiền; gợi ý chưa xác nhận có nhãn; xóa có xác nhận

## 4. E2E và kiểm tra

- [x] 4.1 E2E
  - Scenarios: document-library.layout.narrow, document-library.layout.wide, document-ocr.review.layout.narrow, document-ocr.review.layout.wide, document-ocr.model.offline-ready
  - Files: tests/e2e/documents.spec.ts, tests/fixtures/receipt.jpg (hóa đơn giả)
  - Test: npm run test:e2e
  - Done when: bố cục đúng; trên bản preview tải mô hình, đặt offline, đọc ảnh fixture ra đúng tổng tiền

- [x] 4.2 Kiểm tra toàn bộ
  - Files: knowledge/ui/icons.md, knowledge/log.md
  - Test: npm test && npm run build && npm run test:e2e && npm run check:okf && npx openspec validate add-document-library --strict
  - Done when: tất cả pass
