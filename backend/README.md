"# SOS_SYSTEMS_BACKEND" 

## Chạy workflow thời tiết n8n từ trang quản trị

Backend cung cấp `POST /api/weather-articles/execute-workflow` cho tài khoản `ADMIN`. Endpoint chỉ gọi URL được cấu hình phía server; frontend không nhận URL webhook hay khóa xác thực.

Thêm hai biến sau vào môi trường chạy backend:

```env
N8N_WEATHER_WEBHOOK_URL=https://n8n.hoangluu.id.vn/webhook/weather-articles-run
N8N_WEATHER_WEBHOOK_SECRET=<same-value-as-the-n8n-header-auth-credential>
```

Trong n8n, thêm một Webhook trigger `POST` vào workflow thời tiết, đặt Header Auth với tên header `x-webhook-secret`, và nối trigger vào cùng nhánh xử lý bài viết như trigger lịch hiện tại. Chọn phản hồi `When Last Node Finishes` để backend chờ toàn bộ execution kết thúc trước khi báo thành công. Giữ workflow Published/Active để URL production hoạt động. Dùng Production URL của Webhook node trong `N8N_WEATHER_WEBHOOK_URL`.

Nút **Chạy thu thập ngay** chỉ hiện với `ADMIN`; lịch chạy hiện có vẫn giữ nguyên. Backend chờ webhook n8n tối đa 5 phút cho execution thủ công. Để đồng bộ cả lượt chạy theo lịch và thủ công mà không polling, nối HTTP Request `POST` ngay sau node `Insert Into MongoDB1`. Gọi endpoint `/api/weather-articles/workflow-callback` và gửi header `x-webhook-secret` bằng cùng Header Auth credential của webhook; body không bắt buộc. Backend phát SSE `GET /api/weather-articles/events/stream`; các trang đang mở nhận sự kiện rồi tải danh sách mới từ API. URL callback phải là địa chỉ backend công khai mà máy n8n truy cập được (không dùng `localhost`).
