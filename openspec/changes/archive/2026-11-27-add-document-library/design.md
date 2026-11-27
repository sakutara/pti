# Design — add-document-library

## Data model (Dexie v2 → v3)

```ts
this.version(3).stores({
  // các bảng v2 giữ nguyên
  documents: 'id, personId, claimId, category, updatedAt',
})
```
Không cần `.upgrade()`. Field: [documents](/knowledge/data/documents.md). `claimId` là null cho tới khi change claim gắn vào.
Khóa mới trong `settings`: `ocrModelVersion` (string; có giá trị = mô hình đã tải đủ). Khóa này không đưa vào file sao lưu.
Outbox: `document.upsert`, `document.delete`, cùng `file.*` (chỉ metadata).

## Modules

| file | nội dung |
|---|---|
| `src/domain/document-types.ts` | kiểu `DocumentRecord`, `DocCategory` |
| `src/data/documents-repo.ts` | `addFiles(files, { personId, category })` (mỗi ảnh hoặc PDF một chứng từ; trả cả danh sách trùng, lỗi và ảnh độ phân giải thấp), `addPages(docId, files)`, `mergeDocuments(ids)`, `updateDocument(id, patch)` (sửa `amount` → `amountSource: 'manual'`, `amountConfirmed: true`), `confirmAmount(id)`, `applyOcrResult(id, result)` (không ghi đè số `manual` hay đã xác nhận), `softDelete(id)` (từ chối khi `claimId` khác null), `listDocuments(filter)` |
| `src/domain/receipt-amount.ts` | `extractTotal(lines: string[]) → { candidates, best }` (thuần) |
| `src/lib/pdf-read.ts` | pdfjs-dist: `readPdf(blob) → { pages, lines[] }` (gom chữ theo dòng), `renderPage(blob, n, longEdge) → Blob`; PDF mã hóa hoặc hỏng → lỗi có mã |
| `src/domain/receipt-date.ts` | `extractDate(lines, today) → string \| null` |
| `src/data/ocr-model.ts` | signal `{ state: 'absent'\|'downloading'\|'ready'\|'error', loaded, total }`; `download()` tải từng tệp vào Cache Storage `ocr-model`, ghi `ocrModelVersion` khi đủ; `remove()` |
| `src/data/ocr-queue.ts` | chạy lần lượt các hóa đơn `ocrStatus: 'pending'` khi mô hình `ready`; engine truyền vào qua tham số để test; terminate worker khi rảnh |
| `src/workers/vietOcrWorker.ts`, `src/domain/vietOcr.ts`, `src/domain/ocrLayout.ts`, `src/lib/{imageScan,imagePreprocess,documentScan,imageCompress}.ts` | chép từ `~/Work/fee-calculator/app/src/` kèm test; chỉ sửa import, i18n và bỏ phần không dùng |
| `public/ocr/vietocr/` | chép nguyên thư mục, giữ LICENSE |

## Ảnh và PDF

- Ảnh chứng từ lưu bằng `downscaleImage(file, 2400, 0.85)`: giữ màu (con dấu), không phóng to ảnh nhỏ. Cạnh dài ảnh gốc
  < 1200 px → cảnh báo "ảnh có thể không đủ rõ" (vẫn lưu, ghi `lowResolution` vào bản ghi).
- PDF lưu nguyên bytes (`files.mime` = application/pdf); ảnh nhỏ xem trước dựng từ trang 1.
- Đọc số tiền PDF: có lớp chữ (≥ 20 ký tự) → `extractTotal` trên các dòng chữ, chạy ngay cả khi chưa có mô hình; không có →
  dựng từng trang ở cạnh dài 2400 px rồi đưa vào hàng đợi OCR.

## Quy tắc đọc tổng tiền

1. Chuẩn hóa: bỏ dấu, chữ thường (`foldVi`).
2. Số tiền: nhóm nghìn bằng `.` hoặc `,` hoặc khoảng trắng, bỏ phần thập phân `,00`/`.00`; hợp lệ từ 1.000 đến 1.000.000.000.
3. Nhãn theo thứ tự ưu tiên (số ở cùng dòng hoặc dòng ngay sau):
   (a) "nguoi benh phai tra", "benh nhan phai tra", "nguoi benh tra";
   (b) "tong tien thanh toan", "tong cong tien thanh toan", "tong thanh toan", "khach phai tra";
   (c) "tong cong", "tong tien";
   (d) "thanh tien".
4. Bỏ dòng chứa "khach dua", "tien thua", "tra lai", "thue suat", "ma so thue", "dien thoai", "so tai khoan".
5. Cùng mức ưu tiên lấy số xuất hiện sau cùng. Nhãn (a)–(c) → `high`. Không có nhãn: số lớn nhất có phân nhóm nghìn → `low`.
6. Ngày: "ngay dd thang mm nam yyyy" ưu tiên, sau đó dd/mm/yyyy hoặc dd-mm-yyyy; bỏ ngày ở tương lai và dòng "ngay sinh".

## Mô hình OCR

Không nằm trong precache (`globIgnores: ['ocr/**']`), `navigateFallbackDenylist` thêm `/ocr/`; runtime route `/ocr/` CacheFirst
dùng cache `ocr-model`. Danh sách tệp và kích thước ở `src/data/ocr-model.ts`.
Ảnh đưa vào OCR: ảnh đã lưu → `scanReceiptImage` (cắt, nắn) → `prepareForOcr`. Chứng từ nhiều trang: ghép dòng theo thứ tự trang.

## Component tree

```
DocumentsPage (#/documents, #/documents/:id)
├─ AddDocumentBar (chụp, tải ảnh hoặc PDF)
├─ OcrModelBanner (mời tải, tiến trình, lỗi)
├─ DocumentFilters (loại, người, chưa vào hồ sơ)
├─ DocumentGrid → DocumentCard (ảnh nhỏ, loại, ngày, số tiền, nhãn trạng thái OCR)
└─ DocumentEditor (xem trang, loại, người, ngày, số tiền + gợi ý, xác nhận, thêm trang, ghép, xóa)
```

Điểm vào: nút "Chứng từ" trên Trang chủ.

## Responsive

- < 1024 px: lưới 2 cột, DocumentEditor là trang riêng.
- ≥ 1024 px: lưới bên trái, DocumentEditor là pane phải.

## Icon brief

| id | action | context | metaphor | icon-only? | states |
|---|---|---|---|---|---|
| documents | mở kho chứng từ | Trang chủ | chồng hóa đơn | không (nhãn "Chứng từ") | — |
| camera, image-pick | chụp / tải ảnh | AddDocumentBar | (có từ change 1) | không (nhãn "Chụp", "Tải ảnh") | — |
| page-add | thêm trang | DocumentEditor | tờ giấy + dấu cộng | có | — |
| merge | ghép chứng từ | DocumentGrid (đang chọn) | hai tờ nhập một | không (nhãn "Ghép") | disabled khi chọn < 2 |
| check | xác nhận số tiền | DocumentEditor | dấu tích | không (nhãn "Đúng") | pressed |
| ocr-run | đọc lại | DocumentEditor | khung quét | không (nhãn "Đọc lại") | busy |
| model-download | tải bộ đọc chữ | OcrModelBanner | mũi tên xuống vào chip | không (nhãn "Tải bộ đọc chữ") | busy, lỗi |
| trash | xóa | DocumentEditor | (có sẵn) | không (nhãn "Xóa") | — |

## Test plan

| scenario | test file |
|---|---|
| document-library.* | tests/unit/documents-repo.test.ts, tests/unit/documents-page.test.tsx |
| document-ocr.extract.* | tests/unit/receipt-amount.test.ts |
| document-ocr.pdf.* | tests/unit/pdf-read.test.ts, tests/unit/ocr-queue.test.ts |
| document-ocr.model.*, document-ocr.queue.* | tests/unit/ocr-model.test.ts, tests/unit/ocr-queue.test.ts |
| document-ocr.review.* | tests/unit/document-editor.test.tsx |
| *.layout.*, document-ocr.model.offline-ready | tests/e2e/documents.spec.ts |
