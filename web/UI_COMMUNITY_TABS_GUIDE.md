# Quy Chuẩn Đồng Bộ Giao Diện Nhóm "Thông Báo & Cộng Đồng" (`UI_COMMUNITY_TABS_GUIDE.md`)

Tài liệu này quy định chuẩn thiết kế giao diện (UI/UX) thống nhất cho toàn bộ các tab thuộc nhóm **THÔNG BÁO & CỘNG ĐỒNG** trên Web Portal (Admin & Địa phương):
1. **Gửi thông báo** (`AlertsView`)
2. **Kiểm tra an toàn** (`SafetyCheckView`)
3. **Hiến máu** (`BloodDonationsView`)
4. **Tin thời tiết** (`WeatherView`)
5. **Điểm trú ẩn** (`SheltersView`)
6. **Điểm nguy hiểm** (`HazardReportsView`)

---

## 1. Hệ Màu Sắc Đồng Bộ (Color Palette)

| Thành phần | Mã màu chuẩn | Mục đích sử dụng |
| :--- | :--- | :--- |
| **Primary Button** | `#2563eb` (Hover: `#1d4ed8`) | Nút hành động chính (Tạo thông báo, Tạo đợt kiểm tra, Tạo đợt hiến máu, Thêm điểm...) |
| **Secondary Button** | Nền `#ffffff`, Viền `#cbd5e1`, Chữ `#334155` | Nút phụ (Làm mới, Hủy, Xem chi tiết) |
| **Active Tab / Filter** | Nền `#2563eb` (hoặc `#0f172a`), Chữ `#ffffff` | Tab đang chọn trên thanh công cụ |
| **Inactive Tab** | Nền `#f1f5f9`, Chữ `#475569` | Tab chưa chọn |
| **Background Trang** | `#f8fafc` | Nền tổng thể vùng nội dung |
| **Card / Bảng** | Nền `#ffffff`, Viền `#e2e8f0`, Bo góc `10px - 12px` | Khung bảng dữ liệu, thẻ thống kê KPI |

---

## 2. Nguyên Tắc Hiển Thị Bảng & Rút Gọn Chữ (Compact Table Rules)

1. **Ít chữ, tập trung thông tin cốt lõi trên hàng**:
   - Mỗi hàng trong bảng chỉ hiển thị tối đa **4 - 5 cột chính**:
     - **Tên đối tượng / Người dân** (Có avatar nhỏ, chữ đậm `#0f172a`, có thể nhấn vào để mở Drawer chi tiết).
     - **Thuộc tính chính** (VD: Nhóm máu, Loại sự cố, SĐT).
     - **Khu vực hành chính** (`areaName` từ DB `AdministrativeArea`).
     - **Thời gian** (`HH:mm DD/MM/YYYY`).
     - **Trạng thái** (Badge ngắn gọn: `Chờ đợt hiến`, `Đã xác nhận`, `Đang mở`, `Đã kết thúc`).
2. **Không nhồi nhét nội dung dài vào bảng**:
   - Các thông tin như ghi chú sức khỏe, địa chỉ chi tiết, mô tả dài, email, lịch sử phản hồi... được đưa hoàn toàn vào **Slide-over Detail Drawer** bên phải màn hình.

---

## 3. Slide-over Detail Drawer (Modal Trượt Từ Bên Phải)

Khi nhấn vào **Tên người dùng** hoặc nút **Chi tiết** trên hàng:
- Mở khung **Drawer bên phải màn hình** (`position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 92vw`).
- Bố cục Drawer gồm 3 phần:
  1. **Header**: Tiêu đề ngắn gọn + Nút đóng (`X`).
  2. **Khối Thông Tin Người Dùng (User Card)**:
     - Ảnh đại diện (`avatarUrl` hoặc Avatar chữ cái đầu).
     - Họ và tên, Số điện thoại, Email, Địa chỉ & Khu vực hành chính.
  3. **Khối Thông Tin Nghiệp Vụ (Chi tiết Hiến máu / An toàn / Cảnh báo)**:
     - Các thuộc tính chuyên môn (Nhóm máu, Cân nặng, Loại đăng ký, Trạng thái xác nhận từ App, Sự kiện tham gia, Ghi chú).

---

## 4. Phân Quyền Luồng Xác Nhận (App-driven Confirmation)

- **Admin & Địa phương trên Web**:
  - Chỉ **xem** danh sách người dân đã đăng ký hiến máu và **tạo đợt hiến máu** (kèm gửi thông báo tự động xuống App).
  - **Không** bấm xác nhận thay cho người dân trên Web.
- **Người dân trên App**:
  - Thực hiện đăng ký trước (`PENDING`) và trực tiếp bấm **Xác nhận tham gia (`CONFIRMED`)** hoặc **Từ chối (`DECLINED`)** khi nhận được thông báo đợt hiến máu.

