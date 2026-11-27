## 1. Data

- [x] 1.1 Kiểu claim và Dexie v4
  - Scenarios: claims.wizard.create-draft
  - Files: src/domain/claim-types.ts, src/db/db.ts, tests/unit/db.v4.test.ts
  - Test: npx vitest run tests/unit/db.v4.test.ts
  - Done when: `db.verno` = 4 với `claims`, `claimEvents`; DB v3 có documents mở lên v4 giữ nguyên dữ liệu

- [x] 1.2 Datasets claim-requirements và marsh
  - Scenarios: claims.docs.outpatient, claim-submission.email.recipient-default
  - Files: public/data/claim-requirements.json, public/data/administrators/marsh.json, public/data/manifest.json, src/domain/requirements-schema.ts, tests/unit/datasets-real.test.ts
  - Test: npx vitest run tests/unit/datasets-real.test.ts
  - Done when: đủ 16 requirement như bảng trong design, mỗi cái có `categories`, qua parser; `marsh.json` đúng như design

- [x] 1.3 claims-repo
  - Scenarios: claims.wizard.create-draft, claims.wizard.offline, claims.wizard.resync, claims.invoices.total, claims.invoices.unconfirmed, claims.invoices.remove, claims.invoices.pick, claims.docs.attach, claims.docs.reuse, claims.docs.detach, claims.list.delete-draft
  - Files: src/data/claims-repo.ts, tests/unit/claims-repo.test.ts
  - Test: npx vitest run tests/unit/claims-repo.test.ts
  - Done when: mọi ghi có outbox op cùng transaction; `totalClaimed` đúng bằng tổng hóa đơn đã xác nhận (cả khi sửa document); không gắn được document đang thuộc claim khác; xóa nháp trả chứng từ về kho

## 2. Domain logic

- [x] 2.1 Điều kiện và danh sách chứng từ
  - Scenarios: claims.docs.outpatient, claims.docs.public-breakdown, claims.docs.optical, claims.docs.progress, claim-submission.ready.missing
  - Files: src/domain/conditions.ts, src/domain/requirements.ts, tests/unit/conditions.test.ts, tests/unit/requirements.test.ts
  - Test: npx vitest run tests/unit/conditions.test.ts tests/unit/requirements.test.ts
  - Done when: ngưỡng bảng kê bệnh viện công 1.000.000 đ và 5.000.000 đ đúng biên; `missingRequired` liệt kê đúng mục thiếu

- [x] 2.2 Kiểm tra trước khi nộp
  - Scenarios: claims.check.deadline, claims.check.deadline-passed, claims.check.invoice-date, claims.check.discharge-date, claims.check.child-age, claims.check.card-invalid, claims.check.not-covered, claims.check.blacklisted, claims.check.direct-billing-hint
  - Files: src/domain/claim-checks.ts, tests/unit/claim-checks.test.ts
  - Test: npx vitest run tests/unit/claim-checks.test.ts
  - Done when: 9 scenario pass với `today` cố định; check không bao giờ ném lỗi khi thiếu dữ liệu (bỏ qua check đó)

- [x] 2.3 Trạng thái và ngày làm việc
  - Scenarios: claim-tracking.status.partial, claim-tracking.status.amount-too-high, claim-tracking.status.invalid-transition, claim-tracking.overdue.mark, claim-tracking.overdue.not-yet, claim-tracking.overdue.large, claim-tracking.overdue.originals-pending
  - Files: src/domain/claim-status.ts, src/domain/working-days.ts, tests/unit/claim-status.test.ts, tests/unit/working-days.test.ts
  - Test: npx vitest run tests/unit/claim-status.test.ts tests/unit/working-days.test.ts
  - Done when: chỉ các chuyển trạng thái trong spec được phép; 02/11 → 12/11/2026 = 8 ngày làm việc, mức theo số tiền đúng biên 20 và 100 triệu

- [x] 2.4 Soạn email và tên tệp
  - Scenarios: claim-submission.email.recipient-default, claim-submission.email.recipient-account, claim-submission.email.no-recipient, claim-submission.email.subject, claim-submission.email.length, claim-submission.supplement.subject
  - Files: src/domain/email.ts, src/domain/file-names.ts, tests/unit/email.test.ts
  - Test: npx vitest run tests/unit/email.test.ts
  - Done when: người nhận, CC, tiêu đề đúng spec; tên tệp bỏ ký tự cấm; 30 hóa đơn vẫn ≤ 1800 ký tự; `need_info` có tiền tố "[Bổ sung] "

- [x] 2.5 Dữ liệu giấy yêu cầu và số tiền bằng chữ
  - Scenarios: claim-submission.ready.missing, claim-submission.ready.form-fields, claim-submission.ready.unconfirmed-amount, claim-submission.form.fields, claim-submission.form.words
  - Files: src/domain/claim-form.ts, src/domain/vn-number-words.ts, tests/unit/claim-form.test.ts, tests/unit/vn-number-words.test.ts
  - Test: npx vitest run tests/unit/claim-form.test.ts tests/unit/vn-number-words.test.ts
  - Done when: ánh xạ đúng bảng trong claim-form.md; `missingFields` liệt kê đúng; đọc số đúng cho 1000, 1005000, 2718900, 15000000, 1000000000 ("lăm", "mốt", "linh", "không trăm")

- [x] 2.5a Điền mẫu giấy yêu cầu
  - Scenarios: claim-submission.form.fields, claim-submission.form.expenses, claim-submission.form.many-rows, claim-submission.form.long-values, claim-submission.form.blank-template, claim-submission.form.preview
  - Files: package.json (pdf-lib, @pdf-lib/fontkit), public/fonts/{NotoSans-Regular,NotoSans-Bold}.ttf, public/fonts/OFL.txt, src/lib/claim-form-pdf.ts, tests/unit/claim-form-pdf.test.ts (mẫu có sẵn: public/forms/gyc-template.pdf, gyc-fields.json)
  - Test: npx vitest run tests/unit/claim-form-pdf.test.ts
  - Done when: đọc lại PDF thấy đủ giá trị và chữ có dấu; 20 hóa đơn thành 4 trang; bản điền thử với dữ liệu giả được xem bằng mắt: chữ nằm đúng ô, đúng dòng bảng (chỉnh `gyc-fields.json` nếu lệch)

- [x] 2.5b Tệp chứng từ
  - Scenarios: claim-submission.attachments.two-files, claim-submission.attachments.order, claim-submission.attachments.size, claim-submission.attachments.keep-quality, claim-submission.attachments.einvoice, claim-submission.attachments.too-large, claim-submission.supplement.bundle
  - Files: src/lib/attachments-pdf.ts, tests/unit/attachments-pdf.test.ts
  - Test: npx vitest run tests/unit/attachments-pdf.test.ts
  - Done when: một tệp đúng số trang và thứ tự; trang PDF được copy; thang nén đúng design (encoder giả); vượt mức sàn trả `tooLarge`

- [x] 2.6 MIME và client Gmail
  - Scenarios: claim-submission.gmail.message, claim-submission.gmail.failure, gmail-connection.token.expired
  - Files: src/lib/mime.ts, src/lib/gmail.ts, tests/unit/mime.test.ts, tests/unit/gmail.test.ts
  - Test: npx vitest run tests/unit/mime.test.ts tests/unit/gmail.test.ts
  - Done when: MIME giải mã lại được đúng người gửi/nhận/CC, tiêu đề, tên tệp tiếng Việt, nội dung và bytes của cả hai PDF; `sendMessage` với fetch giả gửi đúng URL, header `Authorization: Bearer`, trả `{ id, threadId }`; 401 ném `TokenExpiredError`, lỗi khác ném `GmailError`; ghi trong design kết quả đối chiếu tài liệu Gmail API về cách truyền `threadId` và giới hạn kích thước thân thư

- [x] 2.7 Phiên Gmail
  - Scenarios: gmail-connection.connect.success, gmail-connection.connect.denied, gmail-connection.connect.offline, gmail-connection.connect.not-configured, gmail-connection.scopes.exact, gmail-connection.token.memory-only, gmail-connection.token.not-persisted, gmail-connection.disconnect.revoke
  - Files: src/config.ts, src/lib/gis.ts, src/data/gmail-session.ts, tests/unit/gis.test.ts, tests/unit/gmail-session.test.ts
  - Test: npx vitest run tests/unit/gis.test.ts tests/unit/gmail-session.test.ts
  - Done when: với `google.accounts.oauth2` giả, scope truyền vào đúng bằng `openid email https://www.googleapis.com/auth/gmail.send`; offline không chèn script; từ chối → trạng thái disconnected; `GOOGLE_CLIENT_ID` rỗng → `gmailEnabled()` false; sau khi kết nối, quét IndexedDB, localStorage, sessionStorage và file sao lưu không thấy chuỗi token; ngắt kết nối gọi revoke

- [x] 2.8 Gửi hồ sơ bằng Gmail
  - Scenarios: claim-submission.gmail.success, claim-submission.gmail.offline
  - Files: src/data/send-claim.ts, tests/unit/send-claim.test.ts
  - Test: npx vitest run tests/unit/send-claim.test.ts
  - Done when: thành công → `submitted`, `sentVia` "gmail", `gmailThreadId`, event; lỗi → claim vẫn `ready`; offline → không gọi `sendMessage`; không có đường mã nào gửi mà không do hàm được gọi từ thao tác của người dùng

## 3. UI

- [x] 3.1 Khóa i18n cho claim
  - Scenarios: claims.check.deadline, claim-tracking.timeline.amounts
  - Files: src/i18n/vi.ts
  - Test: npx vitest run tests/unit/i18n.test.tsx
  - Done when: có nhãn loại claim, trạng thái, nhóm trạng thái, các check, các bước, hướng dẫn gửi, lỗi

- [x] 3.2 ClaimWizard: người, loại, đợt điều trị
  - Scenarios: claims.wizard.create-draft, claims.wizard.fields, claims.wizard.accident-excluded, claims.wizard.resume, claims.wizard.facility-manual, claims.check.optical-dependent
  - Files: src/pages/ClaimWizard.tsx, src/ui/wizard/StepPerson.tsx, src/ui/wizard/StepType.tsx, src/ui/wizard/StepTreatment.tsx, src/ui/ChecksPanel.tsx, src/router.ts, tests/unit/claim-wizard.test.tsx
  - Test: npx vitest run tests/unit/claim-wizard.test.tsx
  - Done when: mỗi bước lưu nháp; mở lại đúng `wizardStep`; gợi ý cơ sở từ dataset; ChecksPanel hiện kết quả `runChecks`

- [x] 3.3 ClaimWizard: hóa đơn
  - Scenarios: claims.invoices.total, claims.invoices.unconfirmed, claims.invoices.remove, claims.invoices.pick
  - Files: src/ui/wizard/StepInvoices.tsx, src/ui/DocumentPicker.tsx, tests/unit/claim-wizard.test.tsx
  - Test: npx vitest run tests/unit/claim-wizard.test.tsx
  - Done when: thêm từ kho hoặc chụp/tải mới; sửa và xác nhận số tiền; tổng định dạng VNĐ

- [x] 3.4 ClaimWizard: chứng từ và hướng dẫn hóa đơn
  - Scenarios: claims.docs.attach, claims.docs.reuse, claims.docs.detach, claims.docs.progress, claims.docs.a11y, claims.invoice.person-name, claims.invoice.copy, claims.invoice.missing-address, claims.invoice.offline
  - Files: src/ui/wizard/StepDocuments.tsx, src/ui/RequirementRow.tsx, src/ui/InvoiceGuide.tsx, tests/unit/requirement-row.test.tsx, tests/unit/invoice-guide.test.tsx
  - Test: npx vitest run tests/unit/requirement-row.test.tsx tests/unit/invoice-guide.test.tsx
  - Done when: thêm mới hoặc chọn từ kho cho từng mục; gỡ về kho; "N/M chứng từ bắt buộc"; nút có accessible name gồm tên mục; copy địa chỉ ghi clipboard (mock)

- [x] 3.5 Xem lại và gửi (Gmail và mailto)
  - Scenarios: claim-submission.ready.missing, claim-submission.ready.unconfirmed-amount, claim-submission.ready.complete, claim-submission.form.preview, claim-submission.gmail.confirm, claim-submission.gmail.open-thread, claim-submission.send.flow, claim-submission.send.not-confirmed, claim-submission.send.choose-mailto, claim-submission.send.share, claim-submission.send.no-share, claim-submission.send.offline, claim-submission.send.resync, claim-submission.email.no-recipient
  - Files: src/ui/wizard/StepReview.tsx, src/ui/SendSteps.tsx, src/ui/GmailConfirm.tsx, tests/unit/send-steps.test.tsx, tests/unit/gmail-confirm.test.tsx
  - Test: npx vitest run tests/unit/send-steps.test.tsx tests/unit/gmail-confirm.test.tsx
  - Done when: thiếu mục → nút dựng tệp bị tắt và liệt kê mục thiếu; đã kết nối Gmail → màn hình xác nhận hiện người gửi, người nhận, CC, tiêu đề sửa được, tên và dung lượng hai tệp, chỉ nút "Gửi" mới gửi; chưa kết nối hoặc `gmailEnabled()` false → luồng mailto 3 bước; chọn "Dùng ứng dụng email khác" chuyển sang mailto; chỉ "Tôi đã gửi email" mới đổi mailto sang `submitted`; nút chia sẻ chỉ hiện khi `canShare` files; chi tiết claim có liên kết mở thread

- [x] 3.5b Kết nối Gmail trong cài đặt claim
  - Scenarios: gmail-connection.connect.explanation, gmail-connection.connect.success, gmail-connection.connect.denied, gmail-connection.connect.offline, gmail-connection.connect.not-configured, gmail-connection.disconnect.revoke
  - Files: src/ui/GmailConnect.tsx, src/ui/ClaimSettingsForm.tsx, tests/unit/gmail-connect.test.tsx
  - Test: npx vitest run tests/unit/gmail-connect.test.tsx
  - Done when: lần đầu bấm kết nối hiện lời giải thích quyền chỉ-gửi và liên kết `/privacy/` trước khi mở cửa sổ Google; hiện email đang kết nối; nút ngắt kết nối; ẩn toàn bộ khi chưa cấu hình client ID; offline hiện thông báo cần mạng

- [x] 3.6 Danh sách và chi tiết claim
  - Scenarios: claims.list.filter, claims.list.delete-draft, claims.list.no-delete-submitted, claim-tracking.status.partial, claim-tracking.status.offline, claim-tracking.status.resync, claim-tracking.timeline.order, claim-tracking.timeline.amounts, claim-tracking.overdue.mark
  - Files: src/pages/ClaimsPage.tsx, src/ui/OutcomeForm.tsx, src/ui/Timeline.tsx, tests/unit/claims-page.test.tsx, tests/unit/timeline.test.tsx
  - Test: npx vitest run tests/unit/claims-page.test.tsx tests/unit/timeline.test.tsx
  - Done when: lọc theo nhóm trạng thái và người; xóa chỉ với nháp; form kết quả chỉ đưa ra chuyển trạng thái hợp lệ; timeline đúng thứ tự; nhãn quá hạn

- [x] 3.7 Trang chủ
  - Scenarios: app-shell.home.summary, app-shell.home.overdue, app-shell.home.no-account
  - Files: src/data/claims-summary.ts, src/pages/HomePage.tsx, tests/unit/home.test.tsx
  - Test: npx vitest run tests/unit/home.test.tsx
  - Done when: đếm `submitted` + `need_info`; hiện số quá hạn khi > 0; có nút "Xuất hóa đơn"

- [x] 3.8 Nộp bản gốc
  - Scenarios: claim-submission.originals.reminder, claim-submission.originals.not-needed, claim-submission.originals.confirm
  - Files: src/ui/OriginalsStep.tsx, src/ui/SendSteps.tsx, tests/unit/send-steps.test.tsx
  - Test: npx vitest run tests/unit/send-steps.test.tsx
  - Done when: chỉ hiện với loại ngoài `emailClaimTypes`; hai địa chỉ; ghi `originalsSubmittedAt`, outbox, timeline

## 4. E2E và kiểm tra

- [x] 4.1 E2E
  - Scenarios: claims.wizard.layout.narrow, claims.wizard.layout.wide, claim-submission.layout.narrow, claim-submission.layout.wide, claim-tracking.layout.narrow, claim-tracking.layout.wide, claim-submission.attachments.offline, claim-submission.gmail.offline
  - Files: tests/e2e/claims.spec.ts, tests/e2e/offline.spec.ts, tests/fixtures/receipt.jpg
  - Test: npm run test:e2e
  - Done when: bố cục đúng ở 360 px và 1280 px; trên bản preview offline: tạo claim ngoại trú, thêm ảnh fixture cho các mục bắt buộc, nhập số tiền, dựng hai tệp PDF, xác nhận gửi bằng mailto → trạng thái `submitted`; với Gmail giả (chặn mạng tới googleapis và `accounts.google.com`) màn hình xác nhận hiện đủ thông tin và nút Gửi bị tắt khi offline

- [x] 4.2 Cập nhật OKF
  - Files: knowledge/data/claims.md, knowledge/ui/icons.md, knowledge/log.md
  - Done when: field trong data doc khớp mã; icon mới có trong catalog; log có mục ngày

- [x] 4.3 Kiểm tra toàn bộ
  - Test: npm test && npm run build && npm run test:e2e && npm run check:okf && npx openspec validate add-claim-filing --strict
  - Done when: tất cả pass
