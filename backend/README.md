"# SOS_SYSTEMS_BACKEND" 

## Chạy workflow thời tiết n8n từ trang quản trị

Backend cung cấp `POST /api/weather-articles/execute-workflow` cho tài khoản `ADMIN`. Endpoint chỉ gọi URL được cấu hình phía server; frontend không nhận URL webhook hay khóa xác thực.

Thêm hai biến sau vào môi trường chạy backend:

```env
N8N_WEATHER_WEBHOOK_URL=https://n8n.hoangluu.id.vn/webhook/weather-articles-run
N8N_WEATHER_WEBHOOK_SECRET=<same-value-as-the-n8n-header-auth-credential>
```

Trong n8n, thêm một Webhook trigger `POST` vào workflow thời tiết, đặt Header Auth với tên header `x-webhook-secret`, và nối trigger vào cùng nhánh xử lý bài viết như trigger lịch hiện tại. Chọn phản hồi `When Last Node Finishes` để backend chờ toàn bộ execution kết thúc trước khi báo thành công. Giữ workflow Published/Active để URL production hoạt động. Dùng Production URL của Webhook node trong `N8N_WEATHER_WEBHOOK_URL`.

Nút **Chạy thu thập ngay** chỉ hiện với `ADMIN`; lịch chạy hiện có vẫn giữ nguyên. Khi workflow chạy, nút hiển thị trạng thái đang chạy. Trang đang mở tự đồng bộ danh sách mỗi 10 giây để nhận dữ liệu từ cả execution theo lịch lẫn execution thủ công. Backend chờ tối đa 5 phút cho execution thủ công.
