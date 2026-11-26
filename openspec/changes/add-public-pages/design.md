# Design — add-public-pages

## Data model
Dexie: không đổi. Không có dataset mới.

## Files

| file | nội dung |
|---|---|
| `public/about/index.html` | HTML đầy đủ (`<!doctype html>`, `lang="vi"`, viewport, `<title>`, meta description), CSS inline ngắn, không script. Mục tiếng Anh có `lang="en"`. |
| `public/privacy/index.html` | như trên |
| `public/pages.css` | không dùng; CSS inline để mỗi trang tự đủ và precache đơn giản |

Cấu trúc `/about/`: tiêu đề + một đoạn mô tả → "Dữ liệu của bạn nằm ở đâu" → "Quyền Gmail dùng để làm gì" → "Dự án độc lập, không liên kết
với PTI hay Marsh" → liên kết Chính sách / Mở ứng dụng → mục `lang="en"` "About" (3–5 câu).

Cấu trúc `/privacy/`: ngày hiệu lực → dữ liệu app xử lý (hồ sơ NĐBH, ảnh thẻ, chứng từ, hồ sơ claim — chỉ trên thiết bị) →
không có server nhận dữ liệu cá nhân; dữ liệu công khai của PTI tải cùng app → dùng dữ liệu người dùng của Google (Gmail gửi
thư; Drive appDataFolder khi có tính năng đồng bộ — ghi rõ "chưa phát hành" cho tới khi làm giai đoạn 2) → OCR chạy ngay trên thiết bị, ảnh không rời máy; mô hình OCR tải từ chính trang này → hồ sơ chỉ được gửi khi
người dùng bấm gửi, tới địa chỉ đơn vị nhận hồ sơ bảo hiểm → token trong bộ nhớ →
Limited Use → thu hồi và xóa → thay đổi chính sách → liên hệ. Có bản tiếng Anh tương ứng bên dưới.

`__CONTACT_EMAIL__` là chỗ chủ dự án điền; task kiểm tra không còn placeholder trước khi build bản phát hành.

## Service worker (`vite.config.ts`)

`workbox.navigateFallbackDenylist: [/^\/about\//, /^\/privacy\//, /^\/data\//]`; `globPatterns` thêm `html` đã có — kiểm tra
`about/index.html` và `privacy/index.html` nằm trong precache manifest. `scripts/postbuild.mjs` không ghi đè `404.html` của hai
đường dẫn này.

## App (`src/ui/`)

`LegalLinks.tsx`: hai thẻ `<a href="/about/">` và `<a href="/privacy/">` (điều hướng đầy đủ, không qua hash router, `rel="noopener"` không cần
vì cùng origin). Dùng trong Onboarding, AccountPage và chân trang của Shell (chỉ hiện ở `lg` ở thanh bên và cuối trang Tài khoản trên di động).

## Responsive

Cột chữ `max-width: 42rem`, `padding-inline: clamp(1rem, 4vw, 2rem)`, cỡ chữ `clamp(1rem, .95rem + .25vw, 1.125rem)`, dark mode theo `prefers-color-scheme`.

## Icon brief
Không có control mới chỉ bằng icon (chỉ là liên kết chữ).

## Test plan

| scenario | test file |
|---|---|
| public-pages.about.*, public-pages.privacy.* | tests/unit/public-pages.test.ts (đọc file HTML bằng fs, kiểm tra chuỗi bắt buộc, `lang="en"`, không script, không placeholder khi biến môi trường `RELEASE=1`) |
| public-pages.routing.* | tests/unit/public-pages.test.ts (đọc `vite.config.ts` dạng text), kiểm tra sau build trong `npm run build` bằng tests/unit/dist-pages.test.ts khi có `dist/` |
| public-pages.offline, public-pages.layout.* | tests/e2e/public-pages.spec.ts |
| public-pages.links.* | tests/unit/legal-links.test.tsx |
