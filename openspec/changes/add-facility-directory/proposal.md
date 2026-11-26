# Danh sách cơ sở y tế bảo lãnh viện phí

## Why
Khám ở cơ sở có bảo lãnh viện phí thì NĐBH không phải ứng tiền, còn khám ở cơ sở bị loại trừ thì PTI không
trả gì ([Cơ sở y tế](/knowledge/domain/medical-facility.md)). Danh sách thay đổi thường xuyên. PTI có một API
JSON công khai nhưng trình duyệt không gọi trực tiếp được (không có CORS), nên dữ liệu được lấy định kỳ bằng
GitHub Action và đóng gói vào app ([0003](/knowledge/decisions/0003-pti-datasets-in-repo.md)).

## What changes
- Script `scripts/refresh-facilities.mjs`: lấy toàn bộ cơ sở PTI bảo lãnh và cơ sở loại trừ từ API PTI, gắn tỉnh/thành,
  chuẩn hóa, tạo id ổn định, kiểm tra an toàn, ghi `public/data/facilities/pti.json` và tóm tắt thay đổi.
- Workflow `.github/workflows/refresh-pti-data.yml`: chạy ngày 1 hàng tháng và chạy tay; mở PR khi dữ liệu đổi; không build, không deploy.
- Tab Cơ sở y tế: tìm theo tên/địa chỉ không dấu, lọc tỉnh/thành và loại bảo lãnh (nội trú, ngoại trú, nha khoa),
  xem cơ sở bị loại trừ, xem chi tiết (giờ nhận bảo lãnh, chuyên khoa, gọi điện, mở bản đồ, giấy tờ cần mang).
- Ngày cập nhật dữ liệu luôn hiển thị; thông báo một lần khi app có danh sách mới (số cơ sở thêm, bỏ, đổi).

## Impact
- Capabilities: facilities (ADDED), data-refresh (ADDED).
- Data: không đổi Dexie (dùng bảng `settings` có sẵn cho khóa `seenFacilitiesVersion`). Thêm `public/data/facilities/pti.json`, mục `facilities` trong `manifest.json`.
- Phụ thuộc: bộ nạp dataset của `add-benefit-plans`.
- Offline: tra cứu hoàn toàn offline. Gọi điện và mở bản đồ cần mạng/ứng dụng ngoài; nút vẫn hiện, ứng dụng ngoài tự xử lý.
- Out of scope: danh sách qua FHVI/INSMART (`add-tpa-networks`); tìm "gần tôi" (API không có tọa độ);
  gợi ý theo chuyên khoa trước khi đi khám (`add-visit-planner`); yêu thích/ghim cơ sở; gọi API PTI từ trình duyệt.
