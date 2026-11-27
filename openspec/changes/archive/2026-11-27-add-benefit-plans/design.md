# Design — add-benefit-plans

## Data model

Dexie: không đổi.

### `public/data/manifest.json`
```json
{ "schema": 1, "datasets": {
  "benefits": { "files": ["benefits/2026.json"], "updatedAt": "2026-11-26", "version": "2026.1" }
} }
```
Change `add-facility-directory` và `add-claim-filing` thêm khóa vào cùng file.

### `public/data/benefits/<policyYear>.json` (file 2026 đã có)
```ts
type MemberType = 'employee'|'sponsored'|'voluntary'
type Category = 'outpatient'|'dental'|'optical'|'inpatient'|'maternity'|'accident'|'life'|'income'
type Value = number | 'actual' | string | null      // string: mô tả như "30 tháng lương"; null: không có giới hạn riêng
interface BenefitsDataset {
  policyYear: number; effectiveFrom: string; effectiveTo: string
  product: string; insurer: string; verified: boolean; source: string; claimDeadlineDays: number; hotline: string
  memberTypes: Record<MemberType, string>; tiers: { tier: 1|2|3|4; name: string }[]
  copayPercent: Partial<Record<Category, Partial<Record<MemberType, number>>>>
  benefits: { id: string; category: Category; title: string; unit: 'year'|'visit'|'day'|'case'|'actual'|'sumInsured'
    values: Record<MemberType, Value[] | null>; maxDaysPerYear?: number; notes?: string }[]   // Value[] theo hạng 1..4; null = không có quyền lợi
  extensions: { id: string; title: string; limitPerYear?: number; notes?: string }[]
  waitingPeriods: Record<MemberType, string[]>
  exclusions: { id: string; text: string; keywords: string[]; extensionIds: string[] }[]   // id trong extensions hoặc benefits
}
```

## Modules

| file | nội dung |
|---|---|
| `src/domain/benefits-schema.ts` | `parseBenefits(json): Result<BenefitsDataset>` — kiểm tra kiểu, tier đủ 1..4 và không trùng, mảng giá trị đủ 4, tiền là số nguyên ≥ 0, `copayPercent` 0..100, `extensionIds` tồn tại, ngày hợp lệ, `effectiveFrom ≤ effectiveTo`. Không thêm thư viện schema. |
| `src/domain/benefits.ts` | `pickPolicyYear(datasets, date)`, `benefitsFor(dataset, tier, memberType)` (sắp theo thứ tự hạng mục), `formatBenefit(b)` → chuỗi qua `t()` |
| `src/lib/money.ts` | `formatVnd(n)` → `"10.000.000 đ"` (dấu chấm phân tách nghìn) |
| `src/data/datasets.ts` | `loadManifest()`, `loadDataset<T>(path, parse)`; `fetch(import.meta.env.BASE_URL + 'data/' + path)`; cache trong bộ nhớ theo phiên; lỗi parse → `{ error }` |
| `src/pages/BenefitsPage.tsx` | route `#/benefits/:personId?` |

## Caching

`globPatterns` của Workbox đã gồm `json`, nên `dist/data/**` được precache. Không có runtime fetch ra ngoài.
Dataset mới đến cùng bản build mới (toast cập nhật app có sẵn).

## Component tree

```
BenefitsPage
├─ PersonPicker (chip: holder + dependents)
├─ VerificationBanner (khi verified=false)
├─ PolicyYearInfo (năm hợp đồng, hiệu lực, hạn nộp N ngày)
├─ BenefitGroup × 8 (hạng mục → BenefitRow)
├─ ExtensionList, WaitingPeriods, ExclusionList
└─ TierCompare (nút mở; lg: bảng; < lg: tab hạng)
```

## Responsive

- < 1024 px: một cột; TierCompare là sheet toàn màn hình với tab 1–4.
- ≥ 1024 px: hai cột — trái là quyền lợi của người đã chọn, phải là ExclusionList + PolicyYearInfo; TierCompare là bảng 4 cột trong main.

## Icon brief

| id | action | context | metaphor | icon-only? | states |
|---|---|---|---|---|---|
| shield | mở trang Quyền lợi | Trang chủ, PersonEdit | khiên có dấu cộng | không (nhãn "Quyền lợi") | — |
| compare | mở so sánh 4 hạng | BenefitsPage | 4 cột thấp cao khác nhau | không (nhãn "So sánh hạng") | — |
| info | giải thích nhãn chưa xác minh | VerificationBanner | chữ i trong vòng tròn (vẽ bằng nét, không dùng chữ) | có | — |

## Test plan

| scenario | test file |
|---|---|
| benefits.dataset.load, benefits.dataset.invalid | tests/unit/benefits-schema.test.ts, tests/unit/datasets.test.ts |
| benefits.dataset.offline | tests/e2e/offline.spec.ts |
| benefits.year.* | tests/unit/benefits.test.ts |
| benefits.person.* | tests/unit/benefits.test.ts, tests/unit/benefits-page.test.tsx |
| benefits.compare.layout.* | tests/e2e/benefits.spec.ts |
| benefits.verified.* | tests/unit/benefits-page.test.tsx |
| benefits.entry.* | tests/unit/benefits-page.test.tsx |
| dataset thật trong repo hợp lệ | tests/unit/datasets-real.test.ts (đọc `public/data/**` bằng fs và chạy parser) |
