# Design — add-account-and-people

## Data model (Dexie v1 → v2)

```ts
this.version(2).stores({
  settings: 'key',
  outbox: 'id, createdAt',
  account: 'id, updatedAt',
  persons: 'id, accountId, updatedAt',
  files: 'id, [ownerType+ownerId], sha256, updatedAt',
})
```
Không cần `.upgrade()`: v1 chỉ có `settings`, `outbox`. Field chi tiết: [account](/knowledge/data/account.md),
[persons](/knowledge/data/persons.md), [files](/knowledge/data/files.md). Kiểu TypeScript đặt ở `src/domain/types.ts`.

`settings` dùng thêm các khóa: `lastBackupAt` (number), `installHintShown` (boolean), `persisted` (boolean).

## Repositories (`src/data/`) — chỉ lớp này chạm Dexie

| file | hàm | outbox op |
|---|---|---|
| `account-repo.ts` | `getAccount()`, `createAccount(holderInput)`, `updateAccount(patch)` | `account.upsert` |
| `persons-repo.ts` | `listPersons()`, `getPerson(id)`, `savePerson(input)`, `deletePerson(id)`, `resolvePayoutBank(person, account)` | `person.upsert`, `person.delete` |
| `files-repo.ts` | `saveImage(owner, kind, file)`, `getBlob(id)`, `softDeleteFile(id)` | `file.upsert`, `file.delete` (payload chỉ metadata, không blob) |

Mọi ghi: `db.transaction('rw', <table>, db.outbox, …)` + `enqueue()`. Ghi luôn đặt `updatedAt = now()`, `deleted = 0`.
`createAccount` tạo account + holder trong một transaction, `administrator: 'marsh'`, `claimEmail: null`, `claimCc: []`.

Validation thuần ở `src/domain/person-validation.ts`: `validatePerson(input, today)` trả `{ field: messageKey }`.
Quy tắc: fullName không rỗng sau trim; dateOfBirth hợp lệ và ≤ today; tier ∈ {1,2,3,4}; memberType = 'employee' cho holder, 'sponsored' hoặc 'voluntary' cho dependent; email (nếu có) khớp
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; cardValidFrom ≤ cardValidTo khi có cả hai.

## Ảnh (`src/lib/image.ts`)

`downscaleImage(file: Blob, maxEdge = 2000, quality = 0.8): Promise<{ blob, width, height }>` dùng
`createImageBitmap` + `OffscreenCanvas` (fallback `<canvas>`), xuất `image/jpeg`. Ảnh nhỏ hơn maxEdge vẫn được
nén lại JPEG. `sha256(blob)` bằng `crypto.subtle.digest`. Trong unit test, `files-repo` nhận hàm downscale qua tham số
(mặc định là hàm thật) để test không cần canvas.

Input file: `<input type="file" accept="image/*" capture="environment">` cho nút chụp, và input không `capture` cho nút chọn ảnh.

## Sao lưu (`src/data/backup.ts`, thay bản scaffold)

- `exportBackup(db): Promise<Blob>` — fflate `zipSync`: `manifest.json` `{ app: 'pti', schemaVersion: db.verno, exportedAt, counts }`,
  `tables/<name>.json` (bảng `files` bỏ field `blob`), `files/<id>` = bytes. Sau khi tải xong, ghi `settings.lastBackupAt`.
- `importBackup(db, file: Blob): Promise<{ imported: number }>` — `unzipSync`; kiểm tra manifest; gộp theo `updatedAt`
  (giữ hàm gộp của scaffold); với `files`, gắn lại `blob` từ `files/<id>`; mỗi bản ghi được ghi đè thì `enqueue` op
  `<entity>.upsert` (hoặc `.delete` nếu `deleted` = 1). Tất cả trong một transaction.
- Tên file: `pti-backup-${format(now,'yyyyMMdd-HHmm')}.ptibackup`, tải bằng `<a download>` với object URL.
- `requestPersistence()` giữ nguyên, gọi một lần sau `createAccount`.

## Router và i18n

- `src/router.ts`: signal `route` đọc `location.hash`; bảng route `{'/': Home, '/claims': ClaimsPlaceholder, '/facilities': FacilitiesPlaceholder, '/account': AccountPage, '/account/person/:id': PersonEdit, '/wallet/:personId?': CardWallet}`. Route lạ → `location.replace('#/')`.
- Nếu chưa có account → luôn render `Onboarding`.
- `src/i18n/vi.ts`: object khóa phẳng (`'nav.home': 'Trang chủ'`…); `src/i18n/index.ts`: `t(key, params?)` thay `{name}`; khóa thiếu trả `⟦key⟧`. Test quét DOM tìm `⟦`.
- Trang Claims và Facilities trong change này chỉ là placeholder có tiêu đề (change sau thay).

## Component tree

```
App
├─ Onboarding (form NĐBH chính → createAccount)
└─ Shell (side nav lg / bottom tabs) → route
   ├─ HomePage (tên, hạng, nút ví thẻ, nút tạo claim → #/claims/new, số claim đang mở = 0 cho tới change claims)
   ├─ AccountPage
   │  ├─ PersonList (holder + dependents, nút thêm người thân)
   │  ├─ ClaimSettingsForm (administrator, claimEmail, claimCc, defaultBank)
   │  └─ BackupSection (xuất, nhập, persisted, estimate, lastBackupAt)
   ├─ PersonEdit (PersonForm + CardImagePicker front/back + xóa với xác nhận nếu dependent)
   └─ CardWallet (ảnh toàn màn hình, vuốt/nút trước-sau giữa các người, nút đóng)
```

Số claim đang mở trên Trang chủ đọc qua hàm `countOpenClaims()` trả 0 ở change này; `add-claim-filing` thay phần thân.

## Responsive

- < 1024 px: một cột; PersonEdit là trang riêng; CardWallet phủ toàn màn hình, nền đen.
- ≥ 1024 px: AccountPage hai pane `grid-cols-[20rem_1fr]` (PersonList trái, PersonEdit/ClaimSettings phải).

## Icon brief

| id | action | context | metaphor | icon-only? | states |
|---|---|---|---|---|---|
| home | về Trang chủ | tab, side nav | (có sẵn) | tab: icon + nhãn | active |
| claims | mở danh sách hồ sơ claim | tab, side nav | tờ giấy có dấu tích | icon + nhãn | active |
| facility | mở danh sách cơ sở y tế | tab, side nav | tòa nhà có dấu chữ thập | icon + nhãn | active |
| account | mở trang Tài khoản | tab, side nav | hình người bán thân | icon + nhãn | active |
| card | mở ví thẻ | Trang chủ, PersonEdit | thẻ chữ nhật có dải từ | không (nhãn "Thẻ bảo hiểm") | — |
| person-add | thêm người thân | PersonList | người + dấu cộng | có | — |
| camera | chụp ảnh | CardImagePicker | máy ảnh | có | — |
| image-pick | chọn ảnh có sẵn | CardImagePicker | khung ảnh có núi | có | — |
| chevron-left / chevron-right | thẻ trước / thẻ sau | CardWallet | mũi tên góc | có | disabled ở đầu/cuối |
| close | đóng ví thẻ | CardWallet | dấu X | có | — |
| trash | xóa người thân | PersonEdit | thùng rác | không (nhãn "Xóa", có xác nhận) | — |
| download | xuất sao lưu | BackupSection | mũi tên xuống khay | không (nhãn "Sao lưu") | — |
| upload | khôi phục từ file | BackupSection | mũi tên lên khay | không (nhãn "Khôi phục") | — |

Icon được vẽ ở Stage 3 sau khi spec được duyệt, cập nhật `/knowledge/ui/icons.md`.

## Test plan

| scenario | test file |
|---|---|
| app-shell.nav.*, app-shell.layout.* | tests/unit/shell.test.tsx, tests/e2e/shell.spec.ts |
| app-shell.i18n.no-missing-keys | tests/unit/i18n.test.tsx |
| app-shell.home.* | tests/unit/home.test.tsx |
| account.onboarding.* | tests/unit/account-repo.test.ts, tests/unit/onboarding.test.tsx |
| account.settings.* | tests/unit/account-repo.test.ts, tests/unit/account-page.test.tsx |
| account.dependents.* | tests/unit/persons-repo.test.ts |
| account.card.* | tests/unit/files-repo.test.ts, tests/unit/card-wallet.test.tsx |
| account.layout.* | tests/e2e/account.spec.ts |
| backup.* | tests/unit/backup.test.ts, tests/unit/backup-section.test.tsx |
| *.offline | tests/e2e/offline.spec.ts (thêm onboarding + xem ví thẻ khi offline) |
