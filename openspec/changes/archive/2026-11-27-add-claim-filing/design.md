# Design — add-claim-filing

## Data model (Dexie v3 → v4)

```ts
this.version(4).stores({
  // các bảng v3 giữ nguyên
  claims: 'id, personId, status, treatmentDate, updatedAt',
  claimEvents: 'id, claimId, at, updatedAt',
})
```
Không cần `.upgrade()`. Field: [claims](/knowledge/data/claims.md). Chứng từ của claim là các bản ghi `documents` có `claimId`;
không có bảng dòng chi phí. `totalClaimed` = tổng `amount` của document loại `invoice`, `amountConfirmed`, chưa xóa.

## Datasets

### `public/data/administrators/marsh.json`
```json
{ "id": "marsh", "name": "Marsh Việt Nam", "verified": true, "claimEmail": "nhanhsbt.mn@pti.com.vn",
  "cc": ["vietnamMMBclaims@marsh.com"], "subjectTemplate": "HS YCBT – {patientName} – {contractCode} – {policyholderName}",
  "emailClaimTypes": ["outpatient", "dental", "optical"], "maxAttachmentBytes": 15000000, "hotline": "1900 5454 75",
  "originalsAddresses": [{ "region": "Miền Nam", "address": "…" }, { "region": "Miền Bắc", "address": "…" }],
  "replyWorkingDays": [{ "below": 20000000, "days": 7 }, { "below": 100000001, "days": 15 }, { "days": 20 }],
  "network": "pti", "notes": "Theo bảng tóm tắt hợp đồng 2026–2027; địa chỉ nộp bản gốc chép từ knowledge/domain/policy-2026.md." }
```

### `public/data/claim-requirements.json`
`{ "source": "Tóm tắt hợp đồng 2026–2027; hướng dẫn PTI 08/2025", "updatedAt": "2026-11", "invoiceGuidance": {...}, "requirements": Requirement[] }`

```ts
interface Requirement { id: string; claimTypes: ClaimType[]; categories: DocCategory[]; title: string; required: boolean
  when: Condition | null; note?: string; checklist: string[] }
type Condition = { flag: keyof ClaimFlags } | { totalGte: number }
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
```

Nội dung (title/checklist lấy từ [Chứng từ bồi thường](/knowledge/domain/claim-documents.md)):

| id | claimTypes | required | when |
|---|---|---|---|
| common.invoice | tất cả | true | — |
| common.invoice-breakdown | outpatient, dental | true | `{ not: { all: [{ flag: 'publicFacility' }, { not: { totalGte: 1000000 } }] } }` |
| outpatient.prescription | outpatient | true | — |
| outpatient.lab-result | outpatient | false | — |
| outpatient.multi-day | outpatient | true | `{ flag: 'multiDayTreatment' }` (chỉ định và phác đồ) |
| optical.exam | optical | true | — (khám tại cơ sở y tế, có chẩn đoán) |
| optical.prescription | optical | true | — (đơn kính, còn hiệu lực 30 ngày) |
| dental.treatment-form | dental | true | — |
| dental.xray | dental | true | `{ flag: 'rootCanalOrExtraction' }` |
| dental.prescription | dental | false | — |
| inpatient.invoice-breakdown | inpatient, maternity | true | `{ not: { all: [{ flag: 'publicFacility' }, { not: { totalGte: 5000000 } }] } }` |
| inpatient.discharge | inpatient, maternity | true | — |
| inpatient.pre-admission | inpatient, maternity | false | — |
| inpatient.surgery-cert | inpatient, maternity | true | `{ flag: 'surgery' }` |
| inpatient.transfer | inpatient, maternity | true | `{ flag: 'transfer' }` |
| inpatient.post-discharge | inpatient, maternity | false | — |

`optical.*` dùng category `medical-record` và `prescription`.

`invoiceGuidance`: `{ buyer: "patient", fields: ["fullName", "address", "idNumber"], warnings: [...], requiredFields: [...] }`.
`manifest.json` thêm khóa `claimRequirements` và `administrators`.

## Modules

| file | nội dung |
|---|---|
| `src/domain/claim-types.ts` | kiểu Claim, ClaimEvent, ClaimType, ClaimStatus, nhãn qua i18n |
| `src/domain/conditions.ts` | `evaluate(cond, claim, documents): boolean` |
| `src/domain/requirements.ts` | `applicableRequirements(dataset, claim, documents)`, `missingRequired(reqs, documents)` (thỏa khi có document trong claim thuộc một trong `categories`) |
| `src/domain/claim-checks.ts` | `runChecks({ claim, person, benefits, facility, today })` → `Check[]`. Mốc = `dischargeDate ?? treatmentDate`; hạn = mốc + `claimDeadlineDays`. Hóa đơn phải cùng ngày mốc. Thẻ so với treatmentDate. Quyền lợi: `benefitsFor(dataset, tier, memberType)` theo hạng mục của loại claim (optical chỉ nhân viên). Bảo lãnh: outpatient, dental, inpatient, maternity (optical bỏ qua). `relation: child` và tuổi tại treatmentDate ≥ 26 → cảnh báo quá tuổi người thân |
| `src/domain/claim-status.ts` | bảng chuyển trạng thái, `canTransition`, `validateOutcome(status, amount, total, reason)`; `ready` → `draft` khi sửa hồ sơ sẵn sàng trong wizard |
| `src/domain/working-days.ts` | `workingDaysBetween(from, to)` (T2–T6, không tính lễ), `isOverdue(claim, today, replyWorkingDays)`: mốc là `originalsSubmittedAt` với loại phải nộp bản gốc (chưa nộp thì không tính), ngược lại `submittedAt`; quá khi số ngày > mức theo `totalClaimed` |
| `src/domain/email.ts` | `composeEmail({ account, administrator, claim, person, fileNames })` → `{ to, cc, subject, body, mailto }`; CC = CC của đơn vị + CC của tài khoản, bỏ trùng; rút gọn thân thư cho tới khi `mailto.length ≤ 1800` |
| `src/domain/file-names.ts` | `formFileName(reason)` → `GYC bồi thường <lý do>.pdf`, `docsFileName(reason)` → `Chứng từ <lý do>.pdf`; bỏ `\ / : * ? " < > |`, cắt còn 80 ký tự |
| `src/domain/vn-number-words.ts` | `amountInWords(n)` → "… đồng chẵn", 0 < n < 10^12 |
| `src/domain/claim-form.ts` | `buildClaimFormData({ claim, patient, holder, bank, documents, today })` theo bảng nguồn dữ liệu trong [claim-form](/knowledge/domain/claim-form.md); `missingFields(data)` |
| `src/lib/claim-form-pdf.ts` | `renderClaimForm(data, { template, fields }): Promise<Uint8Array>` — pdf-lib nạp `public/forms/gyc-template.pdf`, viết giá trị bằng Noto Sans (thường/đậm) theo `gyc-fields.json` (x, y, cỡ, màu); quá `maxWidth` thì xuống dòng theo `lineYs`, còn quá thì giảm cỡ tới 6 pt. Bảng kê: mỗi trang `rowsPerPage` dòng cách nhau `rowPitch`; quá thì thêm bản sao trang 2, tổng chỉ ghi ở trang cuối. Số tiền dạng `2.718.900` |
| `src/lib/attachments-pdf.ts` | `buildAttachments({ form, items }, { maxBytes: administrator.maxAttachmentBytes (15e6), encode })` → `{ files } \| { tooLarge: { total, largest[] } }`; một tệp chứng từ theo thứ tự checklist. Ảnh: một trang A4 (dọc/ngang theo ảnh), vừa khung giữ tỉ lệ, nhãn loại. PDF: `copyPages` giữ nguyên trang. Thang nén ảnh, chỉ hạ khi tổng (cả GYC) vượt `maxBytes`: ảnh đã lưu → 2000 px q 0.8 → 1600 px q 0.75 → 1600 px q 0.65 (mức sàn, ~190 dpi trên A4 ở 2400 px, ~135 dpi ở sàn); không chuyển xám, không phóng to |
| `src/data/claims-summary.ts` | `countOpenClaims()`, `countOverdue(today)` thay bản stub của change 1 |
| `src/pages/ClaimsPage.tsx` | `#/claims` danh sách + lọc; `#/claims/:id` chi tiết |
| `src/pages/ClaimWizard.tsx` | `#/claims/new`, `#/claims/:id/edit` — các bước `StepPerson`, `StepType`, `StepTreatment`, `StepInvoices`, `StepDocuments`, `StepReview` |
| `src/ui/DocumentPicker.tsx` | chọn chứng từ từ kho (chỉ cái chưa thuộc claim khác) hoặc thêm mới qua `AddDocumentBar` |
| `src/ui/OriginalsStep.tsx` | với loại ngoài `emailClaimTypes`: địa chỉ nộp bản gốc, nút lưu/in giấy yêu cầu, ghi ngày đã nộp |
| `src/ui/ChecksPanel.tsx`, `src/ui/RequirementRow.tsx`, `src/ui/InvoiceGuide.tsx`, `src/ui/SendSteps.tsx`, `src/ui/OutcomeForm.tsx`, `src/ui/Timeline.tsx` | |

Clipboard: `navigator.clipboard.writeText`; lỗi → chọn sẵn chữ để người dùng tự copy.
Lưu PDF: `<a download>` với object URL; iOS mở trình xem PDF, người dùng chọn Lưu vào Tệp (hướng dẫn hiện cạnh nút).
`mailto`: `location.href = mailto`. Chia sẻ: `navigator.canShare?.({ files: [file] })`.

Workbox `globPatterns` phải gồm `pdf` và `ttf` để mẫu giấy yêu cầu và font dùng được khi offline.

## Gửi qua Gmail

| file | nội dung |
|---|---|
| `src/config.ts` | `export const GOOGLE_CLIENT_ID = ''` (điền sau khi tạo OAuth Client); `export const gmailEnabled = () => GOOGLE_CLIENT_ID !== ''` |
| `src/lib/gis.ts` | `loadGis(): Promise<void>` chèn `<script src="https://accounts.google.com/gsi/client">` một lần; `requestToken(clientId, scope): Promise<{ accessToken, expiresAt }>` bọc `google.accounts.oauth2.initTokenClient` (callback → Promise; lỗi/đóng cửa sổ → reject `consent_denied`); `revokeToken(token)` |
| `src/lib/mime.ts` | `buildMime({ from, to, cc, subject, text, attachments: { name, bytes, mime }[] }): Uint8Array` — `multipart/mixed`; subject mã hóa RFC 2047 (`=?UTF-8?B?…?=`) khi có ký tự ngoài ASCII; phần text `text/plain; charset=UTF-8` base64; tệp đính kèm base64 chia dòng 76 ký tự; `Content-Disposition: attachment; filename*=UTF-8''…` |
| `src/lib/gmail.ts` | `sendMessage(token, mime): Promise<{ id, threadId }>` — `POST https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media` với `Content-Type: message/rfc822`; lỗi 401 → `TokenExpiredError`; lỗi khác → `GmailError` có `status`; task 2.6 đối chiếu tài liệu Gmail API về giới hạn kích thước |
| `src/data/gmail-session.ts` | signal `{ status: 'disconnected'|'connected', email?, token?, expiresAt? }` chỉ trong bộ nhớ; `connect()`: kiểm tra online → `requestToken` → gọi `https://www.googleapis.com/oauth2/v3/userinfo` lấy email; `disconnect()` → `revokeToken`; token không bao giờ đi qua repo hay `console` |
| `src/data/send-claim.ts` | `sendClaimByGmail(claim, files, subject)`: build MIME → `sendMessage` → `setStatus('submitted')` với `sentVia: 'gmail'`, `gmailThreadId`; lỗi → giữ `ready` |
| `src/ui/GmailConnect.tsx`, `src/ui/GmailConfirm.tsx` | nút kết nối + lời giải thích quyền; màn hình xác nhận trước khi gửi |

Quy ước an toàn: không `await` gửi thư ngoài xử lý bấm nút của người dùng; không có `setTimeout`/`online` listener nào gọi `sendMessage`.
Danh sách scope là hằng `GMAIL_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.send'` đặt trong `gis.ts` và được test.

## Facility picker trong StepTreatment

Ô tìm dùng `searchFacilities` (gồm cả cơ sở loại trừ để còn cảnh báo), hiện tối đa 8 gợi ý; chọn → `facilityId` +
`facilityName`; gõ tự do không chọn → `facilityId: null`.

## Responsive

- < 1024 px: wizard một bước/màn hình, thanh tiến trình trên cùng, nút Tiếp/Quay lại dính đáy; ChecksPanel là khối thu gọn đầu bước.
- ≥ 1024 px: wizard `grid-cols-[14rem_1fr_20rem]` (danh sách bước | form | ChecksPanel). ClaimsPage hai pane danh sách | chi tiết.

## Icon brief

| id | action | context | metaphor | icon-only? | states |
|---|---|---|---|---|---|
| claim-add | tạo hồ sơ mới | ClaimsPage, Trang chủ | tờ giấy + dấu cộng | không (nhãn "Tạo hồ sơ") | — |
| receipt | mở hướng dẫn xuất hóa đơn | Trang chủ, StepDocuments | hóa đơn có mép răng cưa | không (nhãn "Xuất hóa đơn") | — |
| copy | copy một giá trị | InvoiceGuide, SendSteps | hai tờ giấy chồng | có | sau khi copy: dấu tích 2 s |
| camera, image-pick | chụp/chọn ảnh chứng từ | RequirementRow | (có từ change 1) | có | — |
| gmail-connect | kết nối Gmail | claim settings, SendSteps | phong bì + móc xích | không (nhãn "Kết nối Gmail") | connected: dấu tích |
| plug-off | ngắt kết nối Gmail | claim settings | phích cắm rút ra | không (nhãn "Ngắt kết nối") | — |
| send | gửi email | GmailConfirm | máy bay giấy | không (nhãn "Gửi") | disabled khi offline; busy khi đang gửi |
| external-link | mở thread trong Gmail | chi tiết claim | mũi tên ra khỏi khung | có | — |
| photo-remove | gỡ chứng từ khỏi hồ sơ | thumbnail | ảnh có dấu trừ | có | — |
| pdf-preview | xem trước giấy yêu cầu | StepReview | tờ giấy + con mắt | không (nhãn "Xem GYC") | — |
| not-applicable | đánh dấu không áp dụng | RequirementRow (mục tùy chọn) | vòng tròn gạch chéo nhỏ | không (nhãn "Không có") | pressed |
| pdf-save | lưu hai tệp PDF | SendSteps bước 1 | tờ giấy có mũi tên xuống | không (nhãn) | done: dấu tích |
| mail-open | mở email đã điền | SendSteps bước 2 | phong bì mở | không (nhãn) | done |
| mail-sent | xác nhận đã gửi | SendSteps bước 3 | phong bì có dấu tích | không (nhãn "Tôi đã gửi email") | — |
| share | chia sẻ PDF | SendSteps (phụ) | ba chấm nối nhau | có | — |
| status-edit | ghi kết quả từ email | chi tiết claim | bút trên dòng kẻ | không (nhãn "Cập nhật kết quả") | — |
| clock-alert | quá hạn phản hồi | danh sách, chi tiết | đồng hồ có dấu than (vẽ bằng nét) | trang trí, có text | — |

## Test plan

| scenario | test file |
|---|---|
| claims.wizard.*, claims.invoices.*, claims.docs.attach/.reuse/.detach | tests/unit/claims-repo.test.ts, tests/unit/claim-wizard.test.tsx |
| claims.check.* | tests/unit/claim-checks.test.ts |
| claims.docs.* | tests/unit/requirements.test.ts, tests/unit/conditions.test.ts, tests/unit/requirement-row.test.tsx |
| claims.invoice.* | tests/unit/invoice-guide.test.tsx |
| claims.list.* | tests/unit/claims-page.test.tsx, tests/unit/claims-repo.test.ts |
| claim-submission.ready.* | tests/unit/claim-form.test.ts, tests/unit/claim-wizard.test.tsx |
| claim-submission.form.* | tests/unit/claim-form.test.ts, tests/unit/vn-number-words.test.ts, tests/unit/claim-form-pdf.test.ts |
| claim-submission.attachments.* | tests/unit/attachments-pdf.test.ts |
| claim-submission.email.* | tests/unit/email.test.ts |
| claim-submission.gmail.confirm, .success, .failure, .offline, .open-thread | tests/unit/send-claim.test.ts, tests/unit/gmail-confirm.test.tsx |
| claim-submission.gmail.message | tests/unit/mime.test.ts, tests/unit/gmail.test.ts |
| claim-submission.send.*, claim-submission.supplement.* | tests/unit/send-steps.test.tsx |
| gmail-connection.* | tests/unit/gis.test.ts, tests/unit/gmail-session.test.ts, tests/unit/gmail-connect.test.tsx |
| claim-tracking.status.* | tests/unit/claim-status.test.ts, tests/unit/claims-repo.test.ts |
| claim-tracking.timeline.* | tests/unit/timeline.test.tsx |
| claim-tracking.overdue.* | tests/unit/working-days.test.ts |
| claim-submission.originals.* | tests/unit/send-steps.test.tsx |
| app-shell.home.* | tests/unit/home.test.tsx |
| *.layout.* | tests/e2e/claims.spec.ts |
| luồng đầy đủ offline | tests/e2e/offline.spec.ts (tạo claim, đính ảnh fixture, dựng hai tệp PDF, xác nhận gửi khi offline) |

## Đối chiếu Gmail API (2026-11-27)

- Gửi bằng `uploadType=media` với `Content-Type: message/rfc822`. Giới hạn upload của `users.messages.send` được các
  nguồn thứ cấp dẫn là 35 MB; chưa đối chiếu được nguyên văn trên trang chính thức. Hai tệp tối đa 15 MB, sau base64
  khoảng 20,5 MB, vẫn dưới mức đó.
- `gmail.ts` chặn thêm ở 25 MiB cho cả thư, chỉ là lưới an toàn.
- `threadId`: app chỉ đọc `threadId` trong phản hồi để mở thư; không trả lời vào thread nên không cần gửi kèm
  metadata (`uploadType=multipart`).
- Cần gửi thử thật một lần sau khi có OAuth Client.
