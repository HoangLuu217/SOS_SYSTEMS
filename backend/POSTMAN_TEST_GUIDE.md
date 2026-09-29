# HƯỚNG DẪN KIỂM THỬ BACKEND BẰNG POSTMAN (NHÓM A)

Tài liệu này hướng dẫn chi tiết từng bước kiểm thử toàn bộ API của **Nhóm A (Auth + User + Citizen + Notification)** và **8 tiêu chuẩn bảo mật** trên Postman.

---

## MỤC LỤC
1. [Cấu hình môi trường chung trên Postman](#1-cấu-hình-môi-trường-chung-trên-postman)
2. [Thiết lập tự động lưu Token (Tùy chọn - Rất tiện)](#2-thiết-lập-tự-động-lưu-token-tùy-chọn)
3. [Chi tiết kịch bản kiểm thử từng API](#3-chi-tiết-kịch-bản-kiểm-thử-từng-api)
   - [Phần 1: Authentication](#phần-1-authentication)
   - [Phần 2: User Profile](#phần-2-user-profile)
   - [Phần 3: Citizen Profile](#phần-3-citizen-profile)
   - [Phần 4: Notification](#phần-4-notification)
4. [Kiểm thử 8 tiêu chuẩn bảo mật (Security Checklist)](#4-kiểm-thử-8-tiêu-chuẩn-bảo-mật)

---

## 1. Cấu hình môi trường chung trên Postman

* **Base URL:** `http://localhost:5000/api` *(hoặc `http://localhost:5000`)*
* **Header mặc định cho mọi request có body:**
  * `Content-Type: application/json`
* **Header xác thực cho các API yêu cầu đăng nhập:**
  * `Authorization: Bearer {{accessToken}}`
  *(Hoặc dùng tab **Authorization** -> chọn Type **Bearer Token** -> điền `{{accessToken}}`)*

---

## 2. Thiết lập tự động lưu Token (Tùy chọn)

Để không phải copy-paste `accessToken` và `refreshToken` thủ công sau khi đăng nhập:
1. Mở request **Login** hoặc **Register** trên Postman.
2. Chuyển sang tab **Tests** (bên cạnh tab Body/Headers).
3. Dán đoạn mã script sau:
```javascript
if (pm.response.code === 200 || pm.response.code === 201) {
    const res = pm.response.json();
    if (res.data && res.data.accessToken) {
        pm.environment.set("accessToken", res.data.accessToken);
        pm.environment.set("refreshToken", res.data.refreshToken);
        console.log("✓ Đã tự động cập nhật accessToken và refreshToken vào Environment!");
    }
}
```

---

## 3. Chi tiết kịch bản kiểm thử từng API

---

### PHẦN 1: AUTHENTICATION

#### 1.1 Đăng ký tài khoản (POST /auth/register)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/register`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "fullName": "Nguyễn Văn Test",
  "email": "nguyenvantest@sos.vn",
  "phone": "0981122334",
  "password": "Password@123",
  "gender": "MALE",
  "dateOfBirth": "1995-10-20",
  "address": "123 Đường Cứu Nạn, Hà Nội"
}
```
* **Kỳ vọng kết quả (201 Created):**
  * `success: true`
  * `data.accessToken` và `data.refreshToken` được trả về.
  * `data.user` hiển thị thông tin, role mặc định `["CITIZEN"]`.
  * **Bảo mật:** Không chứa trường `passwordHash`.
  * Tab **Cookies** trên Postman có 2 cookie: `accessToken` và `refreshToken` (HttpOnly).

---

#### 1.2 Đăng nhập bằng Email (POST /auth/login)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/login`
* **Body (raw JSON):**
```json
{
  "email": "nguyenvantest@sos.vn",
  "password": "Password@123"
}
```
* **Kỳ vọng (200 OK):** Đăng nhập thành công, trả về bộ token và cập nhật phiên làm việc `sessions`.

---

#### 1.3 Đăng nhập bằng Số điện thoại (POST /auth/login)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/login`
* **Body (raw JSON):**
```json
{
  "phone": "0981122334",
  "password": "Password@123"
}
```
* **Kỳ vọng (200 OK):** Đăng nhập thành công với số điện thoại.

---

#### 1.4 Làm mới Access Token (POST /auth/refresh)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/refresh`
* **Body (raw JSON):** *(Nếu Postman tự gửi Cookie thì không cần body, hoặc gửi body trực tiếp)*:
```json
{
  "refreshToken": "<chuỗi_refreshToken_lấy_từ_login>"
}
```
* **Kỳ vọng (200 OK):** Cấp `accessToken` mới và `refreshToken` mới (Token Rotation). Refresh token cũ sẽ bị thu hồi.

---

#### 1.5 Yêu cầu quên mật khẩu (POST /auth/forgot-password)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/forgot-password`
* **Body (raw JSON):**
```json
{
  "email": "nguyenvantest@sos.vn"
}
```
* **Kỳ vọng (200 OK):**
  * `message: "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi."`
  * Trong môi trường `development`, response trả về thêm `data.resetToken` để bạn kiểm thử ngay. Copy chuỗi `resetToken` này.

---

#### 1.6 Đặt lại mật khẩu bằng Token (POST /auth/reset-password)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/reset-password`
* **Body (raw JSON):**
```json
{
  "token": "<chuỗi_resetToken_từ_bước_1.5>",
  "newPassword": "NewPassword@456"
}
```
* **Kỳ vọng (200 OK):** Đặt lại mật khẩu thành công. Thử gọi lại request này lần nữa với cùng token -> Sẽ nhận lỗi `400` vì token chỉ được dùng 1 lần.

---

#### 1.7 Đăng xuất (POST /auth/logout)
* **Method:** `POST`
* **URL:** `http://localhost:5000/api/auth/logout`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Body (raw JSON):**
```json
{
  "refreshToken": "<chuỗi_refreshToken>"
}
```
* **Kỳ vọng (200 OK):** Đăng xuất thành công, cookie bị xóa và phiên trong DB bị thu hồi.

---

### PHẦN 2: USER PROFILE

> **Lưu ý:** Tất cả các API bên dưới đều yêu cầu Header:  
> `Authorization: Bearer <accessToken_của_bạn>`

#### 2.1 Xem thông tin tài khoản của mình (GET /users/me)
* **Method:** `GET`
* **URL:** `http://localhost:5000/api/users/me`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Kỳ vọng (200 OK):** Trả về đầy đủ thông tin: `fullName`, `email`, `phone`, `dateOfBirth`, `gender`, `address`, `avatarUrl`, `roles`, `status`, `isVerified`, `citizen`,...

---

#### 2.2 Cập nhật thông tin cá nhân (PATCH /users/me)
* **Method:** `PATCH`
* **URL:** `http://localhost:5000/api/users/me`
* **Headers:**
  * `Authorization: Bearer <accessToken>`
  * `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "fullName": "Nguyễn Văn Test (Mới)",
  "gender": "FEMALE",
  "address": "Số 999 Đường Cứu Hộ, Quận Cầu Giấy, Hà Nội",
  "dateOfBirth": "1996-01-01"
}
```
* **Kỳ vọng (200 OK):** Thông tin được cập nhật chính xác.

---

#### 2.3 Cập nhật ảnh đại diện (PATCH /users/me/avatar)
* **Method:** `PATCH`
* **URL:** `http://localhost:5000/api/users/me/avatar`
* **Headers:**
  * `Authorization: Bearer <accessToken>`
  * `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "avatarUrl": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde"
}
```
* **Kỳ vọng (200 OK):** Avatar được cập nhật.

---

#### 2.4 Đổi mật khẩu (PATCH /users/me/password)
* **Method:** `PATCH`
* **URL:** `http://localhost:5000/api/users/me/password`
* **Headers:**
  * `Authorization: Bearer <accessToken>`
  * `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "oldPassword": "NewPassword@456",
  "newPassword": "Password@Final999"
}
```
* **Kỳ vọng (200 OK):** Đổi mật khẩu thành công. Thử đăng nhập lại bằng mật khẩu mới để kiểm tra.

---

### PHẦN 3: CITIZEN PROFILE

#### 3.1 Xem hồ sơ Citizen (GET /users/me/citizen)
* **Method:** `GET`
* **URL:** `http://localhost:5000/api/users/me/citizen`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Kỳ vọng (200 OK):** Trả về `userId` và object `citizen` chứa thông tin `emergencyContact`.

---

#### 3.2 Cập nhật liên hệ khẩn cấp (PATCH /users/me/citizen/emergency-contact)
* **Method:** `PATCH`
* **URL:** `http://localhost:5000/api/users/me/citizen/emergency-contact`
* **Headers:**
  * `Authorization: Bearer <accessToken>`
  * `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "name": "Trần Thị Người Thân",
  "phone": "0912345678",
  "relation": "Vợ / Chồng"
}
```
* **Kỳ vọng (200 OK):** Hồ sơ liên hệ khẩn cấp được cập nhật với số điện thoại hợp lệ.

---

### PHẦN 4: NOTIFICATION

#### 4.1 Lấy danh sách thông báo (GET /notifications)
* **Method:** `GET`
* **URL:** `http://localhost:5000/api/notifications?page=1&limit=10`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Tham số query tùy chọn:**
  * `?isRead=false` (chỉ lấy thông báo chưa đọc)
  * `?type=SOS_ALERT` (lọc theo loại thông báo)
* **Kỳ vọng (200 OK):** Trả về mảng `notifications` và object `pagination` gồm `total`, `page`, `limit`, `totalPages`, `unreadCount`.

---

#### 4.2 Đánh dấu tất cả thông báo là đã đọc (PATCH /notifications/read-all)
* **Method:** `PATCH`
* **URL:** `http://localhost:5000/api/notifications/read-all`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Kỳ vọng (200 OK):** Trả về số lượng bản ghi đã sửa (`modifiedCount`).

---

#### 4.3 Xem chi tiết 1 thông báo (GET /notifications/:id)
* **Method:** `GET`
* **URL:** `http://localhost:5000/api/notifications/<id_thông_báo>`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Kỳ vọng (200 OK):** Trả về chi tiết thông báo nếu thông báo thuộc về chính tài khoản đang đăng nhập.

---

#### 4.4 Đánh dấu 1 thông báo là đã đọc (PATCH /notifications/:id/read)
* **Method:** `PATCH`
* **URL:** `http://localhost:5000/api/notifications/<id_thông_báo>/read`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Kỳ vọng (200 OK):** Trả về thông báo với `isRead: true`.

---

#### 4.5 Xóa 1 thông báo (DELETE /notifications/:id)
* **Method:** `DELETE`
* **URL:** `http://localhost:5000/api/notifications/<id_thông_báo>`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Kỳ vọng (200 OK):** `message: "Xóa thông báo thành công."`

---

## 4. Kiểm thử 8 tiêu chuẩn bảo mật (Security Checklist)

| STT | Tiêu chuẩn bảo mật | Cách thực hiện test trên Postman | Kết quả kỳ vọng |
| :---: | :--- | :--- | :--- |
| **1** | **Hash mật khẩu** | Mở MongoDB Compass / Shell kiểm tra field `passwordHash` của user | Chuỗi băm dạng `$2a$10$...`, tuyệt đối không có mật khẩu gốc trong DB và không bao giờ xuất hiện trong API response |
| **2** | **Google ID token** | Gọi `POST /api/auth/google` với `{"idToken": "fake_token"}` | Báo lỗi `401 Xác thực Google ID Token thất bại` do backend chủ động verify chữ ký |
| **3** | **Quản lý phiên (sessions)** | Kiểm tra MongoDB document của user sau khi login/refresh/logout | Field `sessions` chứa mảng các phiên (`refreshTokenHash` băm SHA-256, `expiresAt`). Khi logout phiên tương ứng biến mất |
| **4** | **Cookie HttpOnly & Secure** | Xem tab **Cookies** sau khi login trên Postman | Có 2 cookie `accessToken` và `refreshToken` mang thuộc tính `HttpOnly`, `Path=/`, `SameSite=Lax` |
| **5** | **Middleware Auth & Status** | Gọi `GET /api/users/me` khi **không** gửi Header `Authorization` | Báo lỗi `401 Bạn chưa đăng nhập. Vui lòng cung cấp token xác thực!` |
| **6** | **Notification Scoping** | Đăng ký 2 user (A và B). Dùng token User A để xem/xóa thông báo của User B: `GET /api/notifications/<id_của_B>` | Báo lỗi `404 Không tìm thấy thông báo hoặc bạn không có quyền truy cập` (hoàn toàn chặn lộ dữ liệu chéo) |
| **7** | **Reset password an toàn** | Gọi `POST /auth/reset-password` lần 1 $\rightarrow$ thành công. Dùng lại đúng token đó gọi lần 2 | Lần 2 bị từ chối với lỗi `400 Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` (chỉ dùng đúng 1 lần) |
| **8** | **Rate Limiting & Validation** | Gửi mật khẩu ngắn (< 6 ký tự) hoặc số điện thoại sai định dạng, hoặc spam liên tục 30 lần login | Báo lỗi `400` tương ứng hoặc kích hoạt `429 Too Many Requests` (Quá nhiều yêu cầu) |
