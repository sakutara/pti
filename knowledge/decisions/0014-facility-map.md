---
type: Decision
title: Bản đồ CSYT bằng Google Maps, toạ độ từ OpenStreetMap
description: Google Maps JS API (khóa trình duyệt lúc build) hiển thị ghim; toạ độ tra sẵn bằng Nominatim khi làm mới dữ liệu; vị trí người dùng chỉ giữ trong bộ nhớ.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-27T05:00:00Z }
---

# Decision

- Chủ dự án yêu cầu (2026-11-27): tích hợp Google Maps vào trang Cơ sở y tế, ghim từng cơ sở, lấy vị trí người dùng và xếp từ gần đến xa.
- API PTI không trả toạ độ. Toạ độ được tra **trước** bằng OpenStreetMap Nominatim (`scripts/geocode-facilities.mjs`) và lưu ở
  `public/data/facilities/geo.json`, chạy trong workflow làm mới dữ liệu hằng tháng. Thứ tự tra: tên + tỉnh, tên, số nhà + đường + phường + tỉnh, số nhà + đường + tỉnh,
  tên bỏ hậu tố chi nhánh, cuối cùng là tâm tỉnh (`by: "province"`, chỉ để ước lượng, được tra lại mỗi lần chạy).
  Không tra trên máy người dùng (tốn quota, chậm, lộ truy vấn).
- Bản đồ dùng Google Maps JavaScript API với khóa trình duyệt `VITE_GOOGLE_MAPS_API_KEY` (đặt lúc build, giới hạn HTTP referrer
  `https://pti.fiddle.vn/*`), `VITE_GOOGLE_MAPS_MAP_ID` tùy chọn (mặc định `DEMO_MAP_ID`). Không có khóa thì không hiện bản đồ,
  danh sách vẫn xếp theo khoảng cách.
- Vị trí người dùng: hỏi trình duyệt khi mở trang, chỉ giữ trong bộ nhớ của phiên, không lưu, không gửi đi (Google chỉ nhận
  vị trí qua việc vẽ chấm trên bản đồ phía trình duyệt).

# Consequences

- Script Google Maps tải từ mạng: bản đồ không dùng được khi ngoại tuyến; danh sách và khoảng cách vẫn dùng được.
- Độ chính xác phụ thuộc dữ liệu OSM; điểm mức tỉnh được đánh dấu "≈" và xếp sau các điểm chính xác.
- Cần tạo khóa Google Maps (Maps JavaScript API) và khai báo trong `.env.local` trước khi build.
