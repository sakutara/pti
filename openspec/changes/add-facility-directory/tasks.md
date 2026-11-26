## 1. Script làm mới dữ liệu

- [ ] 1.1 Client API PTI
  - Scenarios: data-refresh.fetch.all-pages, data-refresh.fetch.throttle, data-refresh.safety.shape
  - Files: scripts/lib/pti-api.mjs, tests/unit/refresh-api.test.ts
  - Test: npx vitest run tests/unit/refresh-api.test.ts
  - Done when: với fetch giả 4 trang, trả đủ bản ghi; `sleep` giả được gọi ≥ 500 ms giữa các request và không có request song song; thiếu mảng `data`/`content` ném lỗi nêu tên field

- [ ] 1.2 Chuẩn hóa, id ổn định, sắp xếp
  - Scenarios: data-refresh.fetch.province, data-refresh.normalize.codes, data-refresh.normalize.stable-id, data-refresh.normalize.deterministic
  - Files: scripts/lib/facilities.mjs, tests/unit/refresh-facilities.test.ts
  - Test: npx vitest run tests/unit/refresh-facilities.test.ts
  - Done when: mã → boolean đúng; cùng cơ sở khác hoa/thường/khoảng trắng gộp một; hai thứ tự đầu vào cho cùng đầu ra

- [ ] 1.3 Kiểm tra an toàn, diff, manifest, CLI
  - Scenarios: data-refresh.safety.drop, data-refresh.summary.changes, data-refresh.summary.no-change
  - Files: scripts/lib/facilities.mjs, scripts/refresh-facilities.mjs, tests/unit/refresh-facilities.test.ts
  - Test: npx vitest run tests/unit/refresh-facilities.test.ts
  - Done when: giảm > 30% → exit 1, file không đổi; thêm 3 bỏ 1 → manifest đúng và summary liệt kê 4 tên; không đổi → không ghi file

- [ ] 1.4 Workflow
  - Scenarios: data-refresh.workflow.triggers, data-refresh.workflow.no-deploy
  - Files: .github/workflows/refresh-pti-data.yml, tests/unit/workflow.test.ts
  - Test: npx vitest run tests/unit/workflow.test.ts
  - Done when: có `schedule` cron ngày 1 và `workflow_dispatch`; không có `npm run build`, `npm run deploy`, `gh-pages` hay push lên `main`

- [ ] 1.5 Dữ liệu ban đầu
  - Scenarios: data-refresh.normalize.deterministic
  - Files: public/data/facilities/pti.json, public/data/manifest.json
  - Test: node scripts/refresh-facilities.mjs --out public/data/facilities/pti.json --manifest public/data/manifest.json && npx vitest run tests/unit/datasets-real.test.ts
  - Done when: file có khoảng 319 cơ sở bảo lãnh + danh sách loại trừ, qua `parseFacilities`; chạy lại lần hai không đổi file

## 2. Logic trong app

- [ ] 2.1 foldVi, parser, tìm kiếm
  - Scenarios: facilities.search.diacritics, facilities.search.combined, facilities.blacklist.view, facilities.blacklist.separate
  - Files: src/lib/text.ts, src/domain/facilities-schema.ts, src/domain/facility-search.ts, tests/unit/facility-search.test.ts
  - Test: npx vitest run tests/unit/facility-search.test.ts
  - Done when: "bach mai" khớp "Bạch Mai", "duong" khớp "Đường"; lọc kết hợp đúng; chế độ loại trừ chỉ trả `blacklisted`

- [ ] 2.2 Số điện thoại và link bản đồ
  - Scenarios: facilities.detail.phones, facilities.detail.map
  - Files: src/domain/facility-search.ts, tests/unit/facility-search.test.ts
  - Test: npx vitest run tests/unit/facility-search.test.ts
  - Done when: tách được "0969 851 616 / 1900 888 866" thành 2 số; `mapUrl` mã hóa đúng

- [ ] 2.3 Thông báo dữ liệu mới
  - Scenarios: facilities.freshness.notice
  - Files: src/data/facilities-notice.ts, tests/unit/facilities-notice.test.ts
  - Test: npx vitest run tests/unit/facilities-notice.test.ts
  - Done when: khác version → trả thông báo với số liệu; sau `dismissNotice` → không trả nữa; lần đầu cài app (chưa có version đã xem) → không thông báo, chỉ lưu version

## 3. UI

- [ ] 3.1 Khóa i18n
  - Scenarios: facilities.freshness.date, facilities.freshness.notice
  - Files: src/i18n/vi.ts
  - Test: npx vitest run tests/unit/i18n.test.tsx
  - Done when: có khóa cho bộ lọc, dịch vụ, số kết quả, rỗng, cảnh báo loại trừ, giấy tờ cần mang, ngày cập nhật, thông báo

- [ ] 3.2 FacilitiesPage và FacilityFilters
  - Scenarios: facilities.search.combined, facilities.search.empty, facilities.blacklist.view, facilities.freshness.date
  - Files: src/pages/FacilitiesPage.tsx, src/ui/FacilityFilters.tsx, src/router.ts, tests/unit/facilities-page.test.tsx
  - Test: npx vitest run tests/unit/facilities-page.test.tsx
  - Done when: lọc theo hash query; hiện "N cơ sở"; nút đặt lại; chế độ loại trừ có cảnh báo; hiện ngày cập nhật

- [ ] 3.3 FacilityDetail
  - Scenarios: facilities.detail.phones, facilities.detail.map, facilities.detail.a11y
  - Files: src/ui/FacilityDetail.tsx, tests/unit/facility-detail.test.tsx
  - Test: npx vitest run tests/unit/facility-detail.test.tsx
  - Done when: link `tel:` từng số và link bản đồ có accessible name; hiện giờ nhận bảo lãnh, chuyên khoa, dịch vụ, nhắc mang thẻ + CCCD/giấy khai sinh

- [ ] 3.4 DataNotice trong Shell
  - Scenarios: facilities.freshness.notice
  - Files: src/ui/DataNotice.tsx, src/ui/Shell.tsx, tests/unit/facilities-page.test.tsx
  - Test: npx vitest run tests/unit/facilities-page.test.tsx
  - Done when: thông báo hiện khi khởi động nếu có version mới, đóng được, không hiện lại

## 4. E2E và kiểm tra

- [ ] 4.1 E2E
  - Scenarios: facilities.layout.narrow, facilities.layout.wide, facilities.search.offline
  - Files: tests/e2e/facilities.spec.ts, tests/e2e/offline.spec.ts
  - Test: npm run test:e2e
  - Done when: 360 px có sheet bộ lọc và danh sách một cột; 1280 px có 3 cột; offline trên bản preview tìm được "bach mai"

- [ ] 4.2 Kiểm tra toàn bộ
  - Test: npm test && npm run build && npm run test:e2e && npm run check:okf && npx openspec validate add-facility-directory --strict
  - Done when: tất cả pass
