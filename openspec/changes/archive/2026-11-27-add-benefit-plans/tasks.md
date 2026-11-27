## 1. Dữ liệu

- [x] 1.1 Định dạng tiền VNĐ
  - Scenarios: benefits.person.format
  - Files: src/lib/money.ts, tests/unit/money.test.ts
  - Test: npx vitest run tests/unit/money.test.ts
  - Done when: `formatVnd(10000000)` = "10.000.000 đ"; `formatVnd(0)` = "0 đ"; số âm hoặc không nguyên ném lỗi

- [x] 1.2 Schema và parser dataset quyền lợi
  - Scenarios: benefits.dataset.load, benefits.dataset.invalid
  - Files: src/domain/benefits-schema.ts, tests/unit/benefits-schema.test.ts, tests/fixtures/benefits-2026.json
  - Test: npx vitest run tests/unit/benefits-schema.test.ts
  - Done when: fixture hợp lệ parse được; từ chối copay 150, thiếu tier, tier trùng, tiền thập phân, mảng giá trị khác 4, extensionId lạ, ngày sai, effectiveFrom > effectiveTo

- [x] 1.3 Kiểm tra file dữ liệu thật
  - Scenarios: benefits.dataset.load
  - Files: tests/unit/datasets-real.test.ts (dữ liệu đã có ở public/data/)
  - Test: npx vitest run tests/unit/datasets-real.test.ts
  - Done when: mọi file trong manifest qua parser; vài giá trị mốc đúng (ngoại trú nhân viên hạng 2 = 16.000.000, tự nguyện hạng 3 = 16.500.000, thai sản tự nguyện hạng 4 = 50.000.000); không chứa tên công ty hay số hợp đồng

- [x] 1.4 Bộ nạp dataset
  - Scenarios: benefits.dataset.load, benefits.dataset.invalid
  - Files: src/data/datasets.ts, tests/unit/datasets.test.ts
  - Test: npx vitest run tests/unit/datasets.test.ts
  - Done when: với `fetch` giả, `loadDataset` trả dữ liệu đã parse hoặc `{ error }`; gọi lần hai không fetch lại

## 2. Logic

- [x] 2.1 Chọn năm hợp đồng và quyền lợi theo hạng
  - Scenarios: benefits.year.by-date, benefits.year.none, benefits.person.special-values, benefits.person.copay, benefits.person.not-covered
  - Files: src/domain/benefits.ts, tests/unit/benefits.test.ts
  - Test: npx vitest run tests/unit/benefits.test.ts
  - Done when: `pickPolicyYear` đúng biên (ngày đầu/cuối tính là trong); `benefitsFor` sắp đúng thứ tự 8 hạng mục theo memberType và đánh dấu hạng mục không có

## 3. UI

- [x] 3.1 Thêm khóa i18n cho trang Quyền lợi
  - Scenarios: benefits.person.format, benefits.verified.unverified
  - Files: src/i18n/vi.ts
  - Test: npx vitest run tests/unit/i18n.test.tsx
  - Done when: có khóa cho tên 8 hạng mục, đơn vị (/năm, /lần khám, /ngày), đồng chi trả, thời gian chờ, nhãn chưa xác minh, thông báo lỗi/không có dữ liệu

- [x] 3.2 BenefitsPage
  - Scenarios: benefits.person.default-holder, benefits.person.switch, benefits.verified.unverified, benefits.verified.verified, benefits.year.none, benefits.conditions.waiting, benefits.conditions.override, benefits.conditions.deadline
  - Files: src/pages/BenefitsPage.tsx, src/ui/BenefitGroup.tsx, src/ui/PersonPicker.tsx, src/ui/PolicyConditions.tsx, src/router.ts, tests/unit/benefits-page.test.tsx
  - Test: npx vitest run tests/unit/benefits-page.test.tsx
  - Done when: mặc định chọn holder; đổi người đổi hạng; banner theo `verified`; hiện năm hợp đồng và hạn nộp

- [x] 3.3 TierCompare
  - Scenarios: benefits.compare.layout.wide, benefits.compare.layout.narrow
  - Files: src/ui/TierCompare.tsx, tests/unit/tier-compare.test.tsx
  - Test: npx vitest run tests/unit/tier-compare.test.tsx
  - Done when: render bảng 4 cột với cột hạng của người đã chọn có `aria-current`; chế độ hẹp có tablist 4 tab

- [x] 3.4 Lối vào
  - Scenarios: benefits.entry.home, benefits.entry.person
  - Files: src/pages/HomePage.tsx, src/pages/PersonEdit.tsx, tests/unit/benefits-page.test.tsx
  - Test: npx vitest run tests/unit/benefits-page.test.tsx
  - Done when: nút "Quyền lợi" trên Trang chủ mở `#/benefits`, trên PersonEdit mở `#/benefits/<id>`

## 4. E2E và kiểm tra

- [x] 4.1 E2E
  - Scenarios: benefits.compare.layout.wide, benefits.compare.layout.narrow, benefits.dataset.offline
  - Files: tests/e2e/benefits.spec.ts, tests/e2e/offline.spec.ts
  - Test: npm run test:e2e
  - Done when: 1280 px có bảng 4 cột; 360 px có tab và không cuộn ngang; offline trên bản preview vẫn hiện quyền lợi

- [x] 4.2 Kiểm tra toàn bộ
  - Test: npm test && npm run build && npm run test:e2e && npm run check:okf && npx openspec validate add-benefit-plans --strict
  - Done when: tất cả pass
