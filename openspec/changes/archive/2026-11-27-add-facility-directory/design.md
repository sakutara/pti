# Design — add-facility-directory

## Data model

Dexie: không đổi. Khóa mới trong `settings` (chỉ trên thiết bị, **không** qua outbox vì đây là trạng thái giao
diện, không phải dữ liệu người dùng cần đồng bộ): `seenFacilitiesVersion: string`.

### `public/data/facilities/pti.json`
```ts
interface FacilitiesDataset {
  fetchedAt: string            // ISO 8601 Z
  source: string               // URL API
  count: { directBilling: number; blacklisted: number }
  provinces: { code: string; name: string }[]
  facilities: Facility[]
}
interface Facility {
  id: string                   // 'f-' + 12 hex đầu sha1(normalize(name) + '|' + normalize(address))
  name: string; nameEn: string | null; phone: string | null; address: string
  provinceCode: string | null; provinceName: string | null
  hours: string | null; specialty: string | null
  inpatient: boolean; outpatient: boolean; dental: boolean
  blacklisted: boolean; network: 'pti'
}
```
`manifest.json` thêm: `"facilities": { "files": ["facilities/pti.json"], "updatedAt": "YYYY-MM-DD", "version": "YYYY-MM[.n]", "changes": { "added": n, "removed": n, "changed": n } }`.
"changed" = cùng `id` nhưng khác ít nhất một field ngoài `fetchedAt`.

## Script làm mới (`scripts/`)

```
scripts/refresh-facilities.mjs     CLI: --out <path> --manifest <path> [--dry-run]; in summary Markdown ra stdout,
                                   ghi summary vào $GITHUB_STEP_SUMMARY nếu có; exit 0 khi không đổi hoặc đổi hợp lệ, 1 khi lỗi
scripts/lib/pti-api.mjs            fetchAllPages(fetchImpl, params, { pageSize: 100, delayMs: 500 }), fetchProvinces(fetchImpl)
scripts/lib/facilities.mjs         normalizeRecord(raw, province), facilityId(name, address), sortFacilities, diffFacilities(old, next), checkSafety(old, next)
```
- Base URL `https://www.pti.com.vn/dms-gw/pms-api/public/codebook`. Endpoint: `/pti/medical-facility/search`
  (`pageIndex`, `pageSize`, `province`, `isPtiGuarantee`, `blacklist`), `/query?subDomainCode=PLC065&status=ACTIVE&page=1&size=200` (tỉnh).
- Cách gắn tỉnh: với mỗi tỉnh, gọi search có `province=<code>` cho cả hai tập (bảo lãnh, loại trừ). Cơ sở chỉ xuất hiện trong
  truy vấn không lọc tỉnh thì `provinceCode: null`. Chạy một truy vấn không lọc tỉnh để kiểm tra tổng số khớp.
- Mảng kết quả đọc `data ?? content`; không có mảng → lỗi shape.
- Header `User-Agent: pti-claim-data-refresh (+https://pti.fiddle.vn)`; tuần tự, nghỉ `delayMs` giữa request; retry 2 lần với lỗi mạng/5xx.
- `fetchImpl` và `sleep` được inject để test.
- Mã: `NVCN028.1` nội trú, `NVCN032.1` ngoại trú, `NVCN030.1` nha khoa, `PLC040.1` loại trừ; mã khác = false.

## Workflow `.github/workflows/refresh-pti-data.yml`

```yaml
on:
  schedule: [{ cron: '0 2 1 * *' }]
  workflow_dispatch: {}
permissions: { contents: write }
concurrency: { group: refresh-pti-data }
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node scripts/refresh-facilities.mjs --out public/data/facilities/pti.json --manifest public/data/manifest.json > summary.md
      - name: Commit vào main
        run: |
          git add public/data
          git diff --cached --quiet && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          { echo "data: làm mới danh sách CSYT PTI"; echo; cat summary.md; } > message.txt
          git commit -F message.txt
          git push origin HEAD:main
```
Không có `npm ci`, không build. Script chỉ dùng thư viện chuẩn của Node 22 (`fetch`, `crypto`).

Lần đầu: chạy script trên máy để tạo `pti.json` ban đầu và commit trong change này.

## App modules

| file | nội dung |
|---|---|
| `src/lib/text.ts` | `foldVi(s)`: NFD, bỏ dấu (`\p{M}`), `đ→d`, lowercase, gộp khoảng trắng |
| `src/domain/facilities-schema.ts` | `parseFacilities(json)` |
| `src/domain/facility-search.ts` | `searchFacilities(list, { q, province, services[], blacklisted })` — mọi dịch vụ đã chọn phải có; `splitPhones(s)` → `['0969851616', …]`; `mapUrl(f)` |
| `src/data/facilities-notice.ts` | `pendingNotice(manifest, settings)`, `dismissNotice(version)` |
| `src/pages/FacilitiesPage.tsx` | route `#/facilities`, `#/facilities/:id`; tham số lọc nằm trong query của hash (`#/facilities?q=&p=&s=inpatient,dental&v=blacklist`) để Back hoạt động |
| `src/ui/FacilityDetail.tsx`, `src/ui/FacilityFilters.tsx`, `src/ui/DataNotice.tsx` | |

Danh sách ~270 phần tử: lọc trong bộ nhớ, không cần virtual list. Debounce ô tìm 150 ms.

## Responsive

- < 1024 px: thanh tìm dính trên cùng + nút bộ lọc mở sheet; danh sách một cột; chi tiết là trang riêng.
- ≥ 1024 px: lưới `grid-cols-[16rem_1fr_24rem]`: bộ lọc | danh sách | chi tiết.

## Icon brief

| id | action | context | metaphor | icon-only? | states |
|---|---|---|---|---|---|
| search | (trang trí ô tìm) | thanh tìm | kính lúp | — | — |
| filter | mở bộ lọc | thanh tìm, < lg | phễu | có | có bộ lọc đang bật: thêm chấm |
| phone | gọi số điện thoại | FacilityDetail | ống nghe điện thoại | có (nhãn đọc màn hình gồm số) | — |
| map-pin | mở bản đồ | FacilityDetail | ghim bản đồ | có | — |
| ban | xem cơ sở loại trừ | chuyển chế độ xem | vòng tròn có gạch chéo | không (nhãn "Cơ sở loại trừ") | pressed |
| close | đóng thông báo/sheet | DataNotice, sheet | (có sẵn từ change 1) | có | — |

## Test plan

| scenario | test file |
|---|---|
| data-refresh.fetch.* | tests/unit/refresh-api.test.ts |
| data-refresh.normalize.* , data-refresh.safety.*, data-refresh.summary.* | tests/unit/refresh-facilities.test.ts |
| data-refresh.workflow.* | tests/unit/workflow.test.ts (đọc file YAML dạng text) |
| facilities.search.* | tests/unit/facility-search.test.ts, tests/unit/facilities-page.test.tsx |
| facilities.blacklist.* | tests/unit/facility-search.test.ts |
| facilities.detail.* | tests/unit/facility-detail.test.tsx |
| facilities.freshness.* | tests/unit/facilities-notice.test.ts, tests/unit/facilities-page.test.tsx |
| facilities.layout.*, facilities.search.offline | tests/e2e/facilities.spec.ts, tests/e2e/offline.spec.ts |
