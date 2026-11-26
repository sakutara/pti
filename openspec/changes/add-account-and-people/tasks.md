## 0. Hạ tầng

- [x] 0.1 Tên miền riêng
  - Scenarios: app-shell.nav.active
  - Files: vite.config.ts, public/CNAME, playwright.config.ts, tests/unit/deploy-config.test.ts
  - Test: npx vitest run tests/unit/deploy-config.test.ts && npm run build
  - Done when: base mặc định là `/`; `public/CNAME` chứa đúng `pti.fiddle.vn`; `dist/CNAME` tồn tại sau build; manifest PWA dùng `start_url` và `scope` `./`

## 1. Data

- [x] 1.1 Domain types và validation
  - Scenarios: account.onboarding.validation
  - Files: src/domain/types.ts, src/domain/person-validation.ts, tests/unit/person-validation.test.ts
  - Test: npx vitest run tests/unit/person-validation.test.ts
  - Done when: `validatePerson` trả lỗi cho tên rỗng, ngày sinh tương lai, tier ngoài 1–4, memberType không hợp vai trò, email sai, hiệu lực thẻ ngược; trả `{}` cho input hợp lệ

- [x] 1.2 Dexie v2 với bảng account, persons, files
  - Scenarios: account.onboarding.create
  - Files: src/db/db.ts, tests/unit/db.v2.test.ts
  - Test: npx vitest run tests/unit/db.v2.test.ts
  - Done when: `db.verno` = 2; các index đúng như design; db v1 có dữ liệu settings mở lên v2 vẫn giữ dữ liệu

- [x] 1.3 account-repo
  - Scenarios: account.onboarding.create, account.onboarding.no-network, account.settings.claim-email, account.settings.offline, account.settings.resync
  - Files: src/data/account-repo.ts, tests/unit/account-repo.test.ts
  - Test: npx vitest run tests/unit/account-repo.test.ts
  - Done when: `createAccount` tạo 1 account + 1 holder và 2 outbox op trong một transaction; `updateAccount` ghi `updatedAt` mới và op `account.upsert`; flush bằng `localOnlyAdapter` làm outbox rỗng

- [x] 1.4 persons-repo
  - Scenarios: account.dependents.add, account.dependents.bank-fallback, account.dependents.delete, account.dependents.holder-not-deletable
  - Files: src/data/persons-repo.ts, tests/unit/persons-repo.test.ts
  - Test: npx vitest run tests/unit/persons-repo.test.ts
  - Done when: `deletePerson` xóa mềm dependent và từ chối holder; `listPersons` bỏ bản ghi đã xóa; `resolvePayoutBank` fallback đúng

- [x] 1.5 Ảnh: downscale, sha256, files-repo
  - Scenarios: account.card.capture, account.card.replace
  - Files: src/lib/image.ts, src/data/files-repo.ts, tests/unit/files-repo.test.ts
  - Test: npx vitest run tests/unit/files-repo.test.ts
  - Done when: `saveImage` (với downscale giả trả 2000×1500) lưu file kind đúng, gắn `cardFrontFileId`, xóa mềm file cũ khi thay; outbox payload không chứa blob

- [x] 1.6 Sao lưu zip
  - Scenarios: backup.export.content, backup.import.merge, backup.import.keep-newer, backup.import.reject-newer-schema, backup.import.reject-foreign, backup.import.resync
  - Files: package.json (fflate), src/data/backup.ts, tests/unit/backup.test.ts
  - Test: npx vitest run tests/unit/backup.test.ts
  - Done when: export → import trên DB rỗng tái tạo đúng bản ghi và bytes ảnh; các trường hợp từ chối không đổi DB; số op outbox = số bản ghi đổi

## 2. App shell

- [x] 2.1 i18n
  - Scenarios: app-shell.i18n.no-missing-keys
  - Files: src/i18n/vi.ts, src/i18n/index.ts, tests/unit/i18n.test.tsx
  - Test: npx vitest run tests/unit/i18n.test.tsx
  - Done when: `t('nav.home')` = "Trang chủ"; khóa thiếu trả `⟦key⟧`; thay tham số `{name}`

- [x] 2.2 Router và Shell
  - Scenarios: app-shell.nav.active, app-shell.nav.unknown-route, app-shell.home.no-account
  - Files: src/router.ts, src/app.tsx, src/ui/Shell.tsx, tests/unit/shell.test.tsx
  - Test: npx vitest run tests/unit/shell.test.tsx
  - Done when: tab active có `aria-current="page"`; route lạ về `#/`; không có account → Onboarding

- [x] 2.3 Trang chủ
  - Scenarios: app-shell.home.summary
  - Files: src/pages/HomePage.tsx, src/data/claims-summary.ts, tests/unit/home.test.tsx
  - Test: npx vitest run tests/unit/home.test.tsx
  - Done when: hiện tên, "Hạng N", nút ví thẻ, nút tạo claim; `countOpenClaims` được mock trong test để kiểm "2 hồ sơ đang xử lý"

## 3. Account UI

- [x] 3.1 Onboarding
  - Scenarios: account.onboarding.create, account.onboarding.validation, account.onboarding.install-hint, backup.storage.persist
  - Files: src/pages/Onboarding.tsx, src/ui/PersonForm.tsx, tests/unit/onboarding.test.tsx
  - Test: npx vitest run tests/unit/onboarding.test.tsx
  - Done when: điền form hợp lệ tạo account và chuyển về `#/`; lỗi hiện dưới field; `navigator.storage.persist` (mock) được gọi đúng 1 lần; gợi ý cài app hiện một lần khi không standalone

- [x] 3.2 AccountPage, PersonEdit, ClaimSettingsForm
  - Scenarios: account.settings.claim-email, account.settings.invalid-email, account.dependents.add, account.dependents.delete, account.dependents.holder-not-deletable
  - Files: src/pages/AccountPage.tsx, src/pages/PersonEdit.tsx, src/ui/ClaimSettingsForm.tsx, tests/unit/account-page.test.tsx
  - Test: npx vitest run tests/unit/account-page.test.tsx
  - Done when: thêm/sửa/xóa người thân qua UI; email sai không lưu; holder không có nút xóa; nút xóa có hộp xác nhận

- [x] 3.3 CardImagePicker và CardWallet
  - Scenarios: account.card.capture, account.card.view-offline, account.card.expired-warning, account.card.a11y
  - Files: src/ui/CardImagePicker.tsx, src/pages/CardWallet.tsx, tests/unit/card-wallet.test.tsx
  - Test: npx vitest run tests/unit/card-wallet.test.tsx
  - Done when: hiện ảnh (object URL), họ tên, số thẻ, hiệu lực; cảnh báo thẻ hết hạn; nút trước/sau/đóng có accessible name; nút trước disabled ở người đầu

- [x] 3.4 BackupSection
  - Scenarios: backup.export.warning, backup.storage.persist, backup.storage.last-export
  - Files: src/ui/BackupSection.tsx, tests/unit/backup-section.test.tsx
  - Test: npx vitest run tests/unit/backup-section.test.tsx
  - Done when: nút Sao lưu tải file đúng tên; hiện cảnh báo dữ liệu nhạy cảm; hiện "Sao lưu gần nhất: dd/MM/yyyy", trạng thái persisted và dung lượng

## 4. E2E và kiểm tra

- [x] 4.1 E2E layout và offline
  - Scenarios: app-shell.layout.narrow, app-shell.layout.wide, account.layout.narrow, account.layout.wide, backup.export.offline, account.onboarding.no-network
  - Files: tests/e2e/shell.spec.ts, tests/e2e/account.spec.ts, tests/e2e/offline.spec.ts
  - Test: npm run test:e2e
  - Done when: ở 360 px có bottom tabs, ở 1280 px có side nav và AccountPage hai pane; trên bản preview đặt offline vẫn onboarding, xem ví thẻ và xuất sao lưu được

- [x] 4.2 Kiểm tra toàn bộ
  - Test: npm test && npm run build && npm run test:e2e && npm run check:okf && npx openspec validate add-account-and-people --strict
  - Done when: tất cả pass
