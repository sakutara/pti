## 1. Nội dung và cấu hình

- [x] 1.1 Trang giới thiệu
  - Scenarios: public-pages.about.content, public-pages.about.gmail-usage, public-pages.about.links, public-pages.about.english-summary
  - Files: public/about/index.html, tests/unit/public-pages.test.ts
  - Test: npx vitest run tests/unit/public-pages.test.ts
  - Done when: HTML hợp lệ không có `<script>`; có đủ chuỗi bắt buộc (tên app, không liên kết với PTI/Marsh, dữ liệu nằm trên thiết bị, chỉ xin quyền gửi thư, không đọc hộp thư); có `lang="en"`; có liên kết `/privacy/` và `/`

- [x] 1.2 Chính sách quyền riêng tư
  - Scenarios: public-pages.privacy.no-server, public-pages.privacy.google-data, public-pages.privacy.limited-use, public-pages.privacy.revoke-delete, public-pages.privacy.contact
  - Files: public/privacy/index.html, tests/unit/public-pages.test.ts
  - Test: npx vitest run tests/unit/public-pages.test.ts
  - Done when: có đủ các tuyên bố trong scenario cả tiếng Việt và tiếng Anh, có ngày hiệu lực, liên kết `https://myaccount.google.com/permissions`; với `RELEASE=1` test thất bại nếu còn `__CONTACT_EMAIL__`

- [x] 1.3 Service worker và build
  - Scenarios: public-pages.routing.not-spa-fallback, public-pages.routing.in-dist
  - Files: vite.config.ts, scripts/postbuild.mjs, tests/unit/public-pages.test.ts, tests/unit/dist-pages.test.ts
  - Test: npm run build && npx vitest run tests/unit/public-pages.test.ts tests/unit/dist-pages.test.ts
  - Done when: denylist có `/about/`, `/privacy/`, `/data/`; `dist/about/index.html`, `dist/privacy/index.html` tồn tại và nằm trong precache manifest của `dist/sw.js`

## 2. App

- [x] 2.1 LegalLinks
  - Scenarios: public-pages.links.onboarding, public-pages.links.account
  - Files: src/ui/LegalLinks.tsx, src/i18n/vi.ts, tests/unit/legal-links.test.tsx
  - Test: npx vitest run tests/unit/legal-links.test.tsx
  - Done when: hai liên kết "Giới thiệu" và "Chính sách quyền riêng tư" có `href` `/about/` và `/privacy/`; được dùng trong Onboarding, AccountPage, Shell

## 3. E2E và kiểm tra

- [x] 3.1 E2E
  - Scenarios: public-pages.offline, public-pages.layout.narrow, public-pages.layout.wide
  - Files: tests/e2e/public-pages.spec.ts
  - Test: npm run test:e2e
  - Done when: ở 360 px không cuộn ngang; ở 1280 px cột chữ ≤ 42rem căn giữa; trên bản preview offline `/privacy/` vẫn hiện, không bị thay bằng app

- [x] 3.2 Kiểm tra toàn bộ
  - Test: npm test && npm run build && npm run test:e2e && npm run check:okf && npx openspec validate add-public-pages --strict
  - Done when: tất cả pass
