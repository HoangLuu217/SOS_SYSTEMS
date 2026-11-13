# SosSystem Web — Design System & Quy Chuẩn Giao Diện Toàn Hệ Thống

> **Phạm vi áp dụng:** Toàn bộ cổng Web Quản trị & Điều hành Tác chiến `SosSystem/web` trên mọi phân hệ và vai trò (`ADMIN`, `LOCAL_AUTHORITY`), bao gồm:
> 1. **Xác thực (`Auth`)**: Đăng nhập, Khôi phục mật khẩu (`Login.tsx`).
> 2. **Bản đồ điều hành tác chiến (`Tactical Map`)**: `map` (Điều phối 3 cột, Bản đồ Leaflet, Floating HUD).
> 3. **Tiếp nhận & Điều phối SOS (`Operations`)**: `sos_requests`, `coordination`, `chat`.
> 4. **Lực lượng & Hậu cần (`Force & Logistics`)**: `rescuers`, `rescuers_approval`, `rescuers_admin`, `resources`.
> 5. **Cảnh báo & Cộng đồng (`Alerts & Community`)**: `notifications`, `alerts`, `safety_checks`, `blood_donations`, `weather`, `shelters`, `hazard_reports`.
> 6. **Quản trị Hệ thống & Báo cáo (`Governance & Admin`)**: `admin_overview`, `authorities`, `areas`, `citizens`, `rbac`, `reports`, `audit_logs`, `operation_logs`, `settings`.

> **Tài liệu liên quan:**
> - File preview trực quan toàn bộ hệ thống nút bấm (Light/Dark + Copy HTML/CSS): [`buttons.html`](buttons.html)
> - Mã nguồn ứng dụng Web: [`web/src/index.css`](../../web/src/index.css)

---

## 1. Kiến Trúc Kỹ Thuật & Nguyên Tắc Thiết Kế

- **Stack thực tế (`web/package.json`):** React 19 + TypeScript + Vite 8 + `lucide-react` (ưu tiên cho icon UI) + `bootstrap-icons` (hỗ trợ legacy) + `leaflet` / `react-leaflet`.
- **Công nghệ Style:** **CSS thuần với CSS Custom Properties (CSS Variables)** đặt tại [`web/src/index.css`](../../web/src/index.css), [`DashboardViews.css`](../../web/src/components/layout/DashboardViews.css), [`Sidebar.css`](../../web/src/components/layout/Sidebar.css) và file CSS theo từng feature (`web/src/features/<domain>/*.css`). **KHÔNG dùng Tailwind utility classes** (Tailwind chưa được cài trong `web/package.json`).
- **3 Nguyên tắc cốt lõi toàn Web:**
  1. **Mật độ rõ ràng (High Clarity Operations):** Trang quản trị tác chiến cần đọc nhanh — hạn chế đổ bóng nặng hoặc nền màu rực cho cả hàng/card; dùng viền mảnh `1px`, chữ đậm phân cấp và badge ngữ nghĩa.
  2. **Một nguồn chân lý (`--sos-*` tokens):** Mọi màu sắc, bo góc, chiều cao nút, trạng thái hover/focus đều lấy từ CSS tokens thay vì hardcode rải rác.
  3. **Tái sử dụng component & pattern trước khi viết mới:** Map picker dùng [`LocationSearchMapPicker`](../../web/src/components/common/LocationSearchMapPicker.tsx), thông báo dùng [`toast`](../../web/src/components/common/toast.ts), modal dùng `.executive-modal-*`, phân trang dùng `.sos-clean-pagination`, nút bấm dùng hệ `.sos-btn`.

---

## 2. Design Tokens & Hệ Thống Màu (Dual Theme)

Hệ thống hỗ trợ 2 chế độ qua `document.documentElement.setAttribute('data-theme', theme)` tại [`AppContext.tsx`](../../web/src/context/AppContext.tsx):
- **Light Executive Mode (`[data-theme="light"]`, mặc định):** Dùng cho toàn bộ bảng dữ liệu, quản trị địa bàn, báo cáo, cài đặt, modal thao tác.
- **Dark Tactical Mode (`[data-theme="dark"]`):** Dùng khi bật giao diện tối / trực đêm trên bản đồ hoặc dashboard điều hành.

> [!NOTE]
> **Quy chuẩn thống nhất màu Primary:** Toàn hệ thống Web lấy **Oceanic Sky Blue `#0284c7`** làm màu hành động chính (`--sos-primary`, đang dùng trong `index.css` & `SosRequestsView.css`), đồng bộ với hệ sinh thái màu App. Các file cũ đang dùng `#2563eb` (như nút cũ ở `DashboardViews.css` / `Sidebar.css`) cần chuyển dần sang `var(--sos-primary)` khi chạm tới.

```css
/* Đặt trong :root của web/src/index.css */
:root {
  /* Typography */
  --sos-font-sans: 'Be Vietnam Pro', 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --sos-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

  /* Brand & Primary CTA */
  --sos-primary: #0284c7;
  --sos-primary-hover: #0369a1;
  --sos-primary-soft: #e0f2fe;
  --sos-primary-soft-hover: #bae6fd;
  --sos-primary-border: #7dd3fc;
  --sos-ring: rgba(2, 132, 199, 0.24);

  /* Emergency / SOS / Destructive */
  --sos-emergency: #dc2626;
  --sos-emergency-hover: #b91c1c;
  --sos-danger-soft: #fee2e2;
  --sos-danger-soft-hover: #fecaca;
  --sos-danger-border: #fca5a5;
  --sos-danger-text: #b91c1c;

  /* Semantic: Success / Warning / Info / Special */
  --sos-success: #10b981;
  --sos-success-hover: #059669;
  --sos-success-soft: #dcfce7;
  --sos-success-soft-hover: #bbf7d0;
  --sos-success-border: #86efac;
  --sos-success-text: #15803d;

  --sos-warning: #d97706;
  --sos-warning-hover: #b45309;
  --sos-warning-soft: #fef3c7;
  --sos-warning-soft-hover: #fde68a;
  --sos-warning-border: #fcd34d;
  --sos-warning-text: #b45309;

  --sos-accent-purple: #8b5cf6;
  --sos-accent-gold: #f59e0b;

  /* Neutral Surfaces (Light Executive - Default) */
  --sos-bg: #f8fafc;
  --sos-surface: #ffffff;
  --sos-surface-muted: #f1f5f9;
  --sos-border: #e2e8f0;
  --sos-control-border: #cbd5e1;
  --sos-text-primary: #0f172a;
  --sos-text-secondary: #475569;
  --sos-text-muted: #64748b;
  --sos-table-header: #f1f5f9;
  --sos-table-hover: #f0f9ff;
  --sos-ghost-hover: #f1f5f9;

  /* Radius & Layout */
  --sos-radius-xs: 6px;
  --sos-radius-sm: 8px;
  --sos-radius-md: 12px;
  --sos-radius-lg: 16px;
  --sos-radius-pill: 9999px;
  --sos-sidebar-width: 284px;
  --sos-sidebar-collapsed: 76px;
}

/* Dark Tactical Overrides */
[data-theme="dark"] {
  --sos-bg: #0a0f1d;
  --sos-surface: #0f172a;
  --sos-surface-muted: #1e293b;
  --sos-border: rgba(255, 255, 255, 0.1);
  --sos-control-border: #334155;
  --sos-text-primary: #f8fafc;
  --sos-text-secondary: #cbd5e1;
  --sos-text-muted: #94a3b8;
  --sos-table-header: rgba(30, 41, 59, 0.78);
  --sos-table-hover: rgba(255, 255, 255, 0.03);
  --sos-ghost-hover: rgba(255, 255, 255, 0.08);

  --sos-primary-soft: rgba(2, 132, 199, 0.18);
  --sos-primary-soft-hover: rgba(2, 132, 199, 0.3);
  --sos-primary-border: rgba(56, 189, 248, 0.38);

  --sos-danger-soft: rgba(239, 68, 68, 0.18);
  --sos-danger-soft-hover: rgba(239, 68, 68, 0.3);
  --sos-danger-border: rgba(248, 113, 113, 0.4);
  --sos-danger-text: #f87171;

  --sos-success-soft: rgba(16, 185, 129, 0.18);
  --sos-success-soft-hover: rgba(16, 185, 129, 0.3);
  --sos-success-border: rgba(52, 211, 153, 0.38);
  --sos-success-text: #4ade80;

  --sos-warning-soft: rgba(245, 158, 11, 0.18);
  --sos-warning-soft-hover: rgba(245, 158, 11, 0.3);
  --sos-warning-border: rgba(251, 191, 36, 0.38);
  --sos-warning-text: #fbbf24;
}
```

### Quy ước phân tầng `z-index` toàn Web
Không tăng tùy tiện `999999 !important` cho component thường; mọi lớp phủ tuân theo thang dưới đây:

| Tầng lớp | Giá trị `z-index` | Thành phần áp dụng |
|---|---|---|
| Nội dung & sticky table header | `1` – `10` | `.executive-table thead th`, badge trên card |
| Panel nổi trên bản đồ | `20` – `30` | `.dispatch-left-col`, thanh công cụ bản đồ |
| Header trang dính | `40` | `.sos-main-header` |
| Thanh điều hướng trái | `50` | `.sos-sidebar` |
| Popover / Dropdown / Map overlay | `100` – `1100` | Autocomplete địa chỉ, Leaflet controls, `.dispatch-layout` popups |
| Slide-over Drawer | `9000` | `.ra-drawer-backdrop`, `.sc-drawer-overlay` |
| Center Modal | `10000` | `.executive-modal-backdrop`, `.sc-modal-overlay` |
| Lightbox / Confirm trên Drawer | `10500` | `.executive-photo-lightbox-backdrop`, confirm xóa trong drawer |
| Thông báo hệ thống | `99999` | `.sos-toast-container` (luôn nằm trên cùng) |

---

## 3. Typography, Khoảng Cách & Bố Cục Trang

### 3.1. Thang chữ chuẩn (Type Scale)
- Google Fonts nạp tại [`web/index.html`](../../web/index.html): `Be Vietnam Pro` (300–900), `Outfit`, `Plus Jakarta Sans`.
- Dùng `font-variant-numeric: tabular-nums;` cho **mọi cột số, KPI, đếm ngược, số lượng, bảng thống kê**.
- Dùng `font-family: var(--sos-font-mono);` cho **Mã SOS, Tọa độ Lat/Lng, Địa chỉ IP, Log ID**.

| Vai trò chữ | Cỡ chữ | Độ đậm | Line-height | Ví dụ sử dụng |
|---|---|---|---|---|
| Display / Login Title | `23px–26px` | `800` | `1.2` | Tiêu đề trang Auth / Login |
| KPI Big Number | `22px` | `800` | `1.1` | `.sos-stat-value`, `.rpt-kpi` |
| Page Title | `17px–18px` | `800` | `1.3` | `.sos-page-title`, `.executive-title-text` |
| Modal / Drawer Title | `16px–17px` | `800` | `1.3` | `.executive-modal-title`, `.ra-drawer-title` |
| Card / Section Title | `15px` | `700` | `1.4` | `.sos-view-card-title` |
| Body / Control / Input | `13px–13.5px` | `400–600` | `1.5` | Nội dung bảng, nút `md`, ô nhập liệu |
| Table Header (`th`) | `12px–13px` | `700–800` | `1.2` | Viết HOA (`uppercase`), `letter-spacing: 0.4px` |
| Caption / Table Subtext / Desc | `12px` | `400–500` | `1.4` | `.sos-page-desc`, phụ đề dưới tên |
| Micro Badge / Pill | `11px–11.5px` | `700` | `1` | `.sos-badge`, `.sos-live-pill` |

### 3.2. Bố Cục App Shell Toàn Web
Theo [`DashboardLayout.tsx`](../../web/src/components/layout/DashboardLayout.tsx) và [`Sidebar.css`](../../web/src/components/layout/Sidebar.css):
- **Khung chính `.sos-dashboard-container`:** Flex ngang `100vh`.
  - Trái: `.sos-sidebar` rộng `284px` (`76px` khi thu gọn).
  - Phải: `.sos-main-content` (`flex: 1; min-width: 0; background: var(--sos-bg)`).
- **2 Kiểu hiển thị bên phải:**
  1. **Tactical Fullscreen (`map`):** Dành cho Bản đồ điều hành tác chiến & Điều phối trực quan (`dispatch-screen`), ẩn `.sos-main-header` để nhường 100% không gian cho bản đồ + panel 2 bên.
  2. **Standard Management View (23 màn hình còn lại):**
     - **`.sos-main-header`:** Sticky top `padding: 16px 24px`, gồm tiêu đề + mô tả bên trái và `.sos-live-pill` / badge địa bàn quản lý bên phải.
     - **`.sos-page-body`:** `padding: 12px 18px` (hoặc `14px 20px` cho màn hình table lock-height như `shelters`, `hazard_reports`, `alerts`).

### 3.3. Cấu trúc chuẩn 1 màn hình Quản lý (Standard Page Anatomy)
Mọi màn hình CRUD / Theo dõi đều xếp dọc theo 3 khối (`gap: 14px`–`20px`):
1. **KPI Strip / Stats Grid (`.sos-stats-grid` hoặc `.rpt-strip`):** Tối đa 4–6 thẻ trên 1 hàng (`grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`), mỗi thẻ có icon squircle (`44x44` hoặc `38x38`), số lớn `tabular-nums`, nhãn ngắn. Có thể click để lọc nhanh bảng bên dưới.
2. **Filter & Action Toolbar (`.executive-table-toolbar` / `.rpt-bar`):**
   - *Bên trái:* Filter Pills (`.sos-pill`) / Segmented View Switcher (`.sos-segmented`) + Ô tìm kiếm (`min-width: 240px–300px`) + Dropdown lọc khu vực/trạng thái.
   - *Bên phải:* Các nút phụ (Làm mới, Xuất CSV — dùng `--outline`) và **tối đa 1 nút CTA chính** (`+ Tạo mới` / `Phát thông báo` — dùng `.sos-btn--primary`).
3. **Data Table Card (`.sos-view-card` / `.executive-table-card`):** Bảng có thanh cuộn độc lập bên trong (khi lock height) + Footer **Pagination Bar** (`.sos-clean-pagination`).

### 3.4. Responsive Breakpoints Chuẩn
| Mốc kích thước | Hành vi thích ứng |
|---|---|
| `<= 1280px` | Lưới KPI 6 cột gập thành 3 cột (`ReportsView.css`); toolbar cho phép wrap gọn. |
| `<= 1024px` | Tablet: Sidebar tự thu gọn (`76px`); các grid 3–4 cột (vd Audit actor grid) chuyển thành 2 cột. |
| `<= 768px` | Drawer & Split-view (như Tactical Chat / Dispatch) chuyển sang dạng xếp chồng / 1 khung chính. |
| `<= 640px` | Mobile/Small Tablet: Grid chuyển 1 cột; Modal (`.sos-profile-modal-card`, `.executive-modal-card`) thành `calc(100vw - 20px)`, form 2 cột gộp thành 1 cột; Toolbar nút chuyển `flex-direction: column`. |
| `<= 480px` | Login glass card giảm padding còn `30px 22px 24px`, `border-radius: 22px`. |

---

## 4. Hệ Thống Button Dùng Lại (`.sos-btn` Standard)

Hệ thống nút bấm chuẩn hóa (xem bản xem trước tương tác tất cả các nút tại [`buttons.html`](buttons.html)), dùng thống nhất cho **tất cả** form, toolbar, bảng dữ liệu, modal, drawer, bản đồ và màn hình đăng nhập.

### 4.1. Code CSS Chuẩn Copy Vào Global (`web/src/index.css`)

```css
/* ==================== BASE BUTTON (.sos-btn) ==================== */
.sos-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-family: var(--sos-font-sans);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  transition: background-color 0.15s ease, border-color 0.15s ease,
              color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}

.sos-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--sos-ring);
}

.sos-btn:active:not(:disabled):not(.is-disabled) {
  transform: translateY(1px);
}

.sos-btn:disabled,
.sos-btn.is-disabled,
.sos-btn.is-loading {
  opacity: 0.55;
  cursor: not-allowed;
  pointer-events: none;
  box-shadow: none;
}

/* Sizes */
.sos-btn--xs { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 6px; gap: 4px; }
.sos-btn--sm { height: 32px; padding: 0 12px; font-size: 12.5px; border-radius: 7px; gap: 5px; }
.sos-btn--md { height: 36px; padding: 0 14px; font-size: 13px; border-radius: 8px; gap: 6px; }
.sos-btn--lg { height: 42px; padding: 0 18px; font-size: 14px; border-radius: 10px; gap: 8px; font-weight: 700; }
.sos-btn--block { width: 100%; }

/* Icon-only square buttons (Bắt buộc có title + aria-label) */
.sos-btn--icon-xs { width: 28px; padding: 0; }
.sos-btn--icon-sm { width: 32px; padding: 0; }
.sos-btn--icon-md { width: 36px; padding: 0; }
.sos-btn--icon-lg { width: 42px; padding: 0; }

/* 1. Solid Variants */
.sos-btn--primary {
  background: var(--sos-primary);
  border-color: var(--sos-primary);
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(2, 132, 199, 0.25);
}
.sos-btn--primary:hover:not(:disabled) {
  background: var(--sos-primary-hover);
  border-color: var(--sos-primary-hover);
  box-shadow: 0 3px 8px rgba(2, 132, 199, 0.32);
}

.sos-btn--emergency,
.sos-btn--danger {
  background: var(--sos-emergency);
  border-color: var(--sos-emergency);
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(220, 38, 38, 0.25);
}
.sos-btn--emergency:hover:not(:disabled),
.sos-btn--danger:hover:not(:disabled) {
  background: var(--sos-emergency-hover);
  border-color: var(--sos-emergency-hover);
  box-shadow: 0 3px 8px rgba(220, 38, 38, 0.34);
}

.sos-btn--success {
  background: var(--sos-success);
  border-color: var(--sos-success);
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.24);
}
.sos-btn--success:hover:not(:disabled) {
  background: var(--sos-success-hover);
  border-color: var(--sos-success-hover);
}

.sos-btn--warning {
  background: var(--sos-warning);
  border-color: var(--sos-warning);
  color: #ffffff;
}
.sos-btn--warning:hover:not(:disabled) {
  background: var(--sos-warning-hover);
  border-color: var(--sos-warning-hover);
}

/* 2. Soft / Tinted Variants (Ưu tiên cho Table Actions & Bulk Bar) */
.sos-btn--soft-primary {
  background: var(--sos-primary-soft);
  border-color: var(--sos-primary-border);
  color: var(--sos-primary);
}
[data-theme="dark"] .sos-btn--soft-primary { color: #38bdf8; }
.sos-btn--soft-primary:hover:not(:disabled) { background: var(--sos-primary-soft-hover); }

.sos-btn--soft-success {
  background: var(--sos-success-soft);
  border-color: var(--sos-success-border);
  color: var(--sos-success-text);
}
.sos-btn--soft-success:hover:not(:disabled) { background: var(--sos-success-soft-hover); }

.sos-btn--soft-warning {
  background: var(--sos-warning-soft);
  border-color: var(--sos-warning-border);
  color: var(--sos-warning-text);
}
.sos-btn--soft-warning:hover:not(:disabled) { background: var(--sos-warning-soft-hover); }

.sos-btn--soft-danger {
  background: var(--sos-danger-soft);
  border-color: var(--sos-danger-border);
  color: var(--sos-danger-text);
}
.sos-btn--soft-danger:hover:not(:disabled) { background: var(--sos-danger-soft-hover); }

/* 3. Outline Variants */
.sos-btn--outline {
  background: var(--sos-surface);
  border-color: var(--sos-control-border);
  color: var(--sos-text-secondary);
}
.sos-btn--outline:hover:not(:disabled) {
  background: var(--sos-surface-muted);
  border-color: var(--sos-text-muted);
  color: var(--sos-text-primary);
}

.sos-btn--outline-primary {
  background: var(--sos-surface);
  border-color: var(--sos-primary);
  color: var(--sos-primary);
}
[data-theme="dark"] .sos-btn--outline-primary { color: #38bdf8; border-color: #38bdf8; }
.sos-btn--outline-primary:hover:not(:disabled) { background: var(--sos-primary-soft); }

.sos-btn--outline-danger {
  background: var(--sos-surface);
  border-color: var(--sos-danger-border);
  color: var(--sos-danger-text);
}
.sos-btn--outline-danger:hover:not(:disabled) { background: var(--sos-danger-soft); }

/* 4. Ghost Variants */
.sos-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--sos-text-secondary);
}
.sos-btn--ghost:hover:not(:disabled) {
  background: var(--sos-ghost-hover);
  color: var(--sos-text-primary);
}

.sos-btn--ghost-danger {
  background: transparent;
  border-color: transparent;
  color: var(--sos-danger-text);
}
.sos-btn--ghost-danger:hover:not(:disabled) { background: var(--sos-danger-soft); }

/* Loading Spinner inside .sos-btn */
.sos-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: sosSpin 0.65s linear infinite;
}
@keyframes sosSpin { to { transform: rotate(360deg); } }

/* Filter Pills (.sos-pill) & Segmented View Switcher (.sos-segmented) */
.sos-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 9999px;
  border: 1px solid var(--sos-control-border);
  background: var(--sos-surface);
  color: var(--sos-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.sos-pill:hover { background: var(--sos-surface-muted); color: var(--sos-text-primary); }
.sos-pill.is-active {
  background: var(--sos-primary-soft);
  border-color: var(--sos-primary-border);
  color: var(--sos-primary);
}
[data-theme="dark"] .sos-pill.is-active { color: #38bdf8; }

.sos-segmented {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  gap: 2px;
  border-radius: 9px;
  background: var(--sos-surface-muted);
  border: 1px solid var(--sos-border);
}
.sos-segmented-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--sos-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.sos-segmented-item.is-active {
  background: var(--sos-surface);
  color: var(--sos-text-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}
```

### 4.2. Ma Trận Chọn Đúng Loại Nút Theo Ngữ Cảnh

| Ngữ cảnh đặt nút | Kích thước | Biến thể khuyến nghị | Quy tắc bắt buộc |
|---|---|---|---|
| CTA chính trên Toolbar / Modal Submit | `--md` (`36px`) | `sos-btn--primary` | **Tối đa 1 nút Primary** trong 1 khối để tránh tranh chấp thị giác |
| Hành động khẩn cấp (Phát báo động toàn tỉnh, Kích hoạt SOS) | `--md` hoặc `--lg` | `sos-btn--emergency` | Có hộp thoại xác nhận trước khi bắn cảnh báo thực |
| Xác nhận duyệt / Giao nhiệm vụ / Chốt hoàn thành | `--md` hoặc `--sm` | `sos-btn--success` | Dùng khi chuyển trạng thái tích cực rõ rệt |
| Nút phụ Toolbar (Làm mới, Xuất CSV, Hủy, Quay lại) | `--md` hoặc `--sm` | `sos-btn--outline` | Trong Modal/Drawer: luôn đặt bên trái nút chính |
| Ô Thao tác trong Bảng dữ liệu (Xem, Duyệt, Sửa, Xóa) | `--xs` (`28px`) | `sos-btn--soft-*` hoặc `--outline` | **Cấm dùng nút Solid cỡ lớn** trong cột bảng; giữ tối đa 2–3 nút/hàng |
| Nút đóng Modal (`×`), Bỏ chọn hàng loạt, Thao tác phụ | `--xs` / `--sm` | `sos-btn--ghost` (+ `--icon-sm`) | Nút icon-only bắt buộc có `title` & `aria-label` |
| Đăng nhập / Reset mật khẩu / Full-width Submit | `--lg` (`42px`) | `sos-btn--primary` | Kích hoạt `.is-loading` ngay khi gửi request |

### 4.3. Ánh Xạ Class Nút Hiện Có Trong Codebase -> Chuẩn `.sos-btn`

| Class đang tồn tại trong repo | Nơi đang dùng | Chuẩn hóa tương đương khi refactor |
|---|---|---|
| `.executive-btn-primary` | `index.css` (Modal / Header) | `.sos-btn .sos-btn--primary .sos-btn--md` |
| `.executive-btn-outline` | `index.css` (Modal Hủy / Phụ) | `.sos-btn .sos-btn--outline .sos-btn--md` |
| `.coordination-action-btn` (`.primary`, `.success`, `.outline`) | `index.css` (Điều phối) | `.sos-btn .sos-btn--sm` + biến thể tương ứng |
| `.sos-btn-action` (`.primary`, `.success`, `.danger`) | `DashboardViews.css` | `.sos-btn .sos-btn--xs` + `--soft-primary` / `--soft-success` / `--soft-danger` |
| `.sos-btn-filter-pill` | `DashboardViews.css` | `.sos-pill` (`.is-active`) |
| `.rpt-seg` / `.rpt-seg-btn` | `ReportsView.css` | `.sos-segmented` / `.sos-segmented-item` |

---

## 5. Quy Chuẩn Bảng Dữ Liệu (Data Table) & Phân Trang

Bảng là thành phần cốt lõi của hơn 18 màn hình trong hệ thống (`sos_requests`, `rescuers`, `resources`, `authorities`, `citizens`, `audit_logs`, `shelters`, `hazard_reports`, v.v.).

### 5.1. Nguyên tắc cấu trúc cột & hàng
- **Số cột tối đa:** **5 đến 7 cột** trên màn hình Desktop. Nếu dữ liệu nhiều thuộc tính (ví dụ chi tiết hồ sơ SOS, lịch sử kiểm toán, tọa độ phụ, ghi chú dài), chỉ giữ cột nhận diện chính ở bảng và đẩy phần chi tiết sang **Slide-over Drawer** khi nhấn vào hàng hoặc nút `Chi tiết`.
- **Tránh tràn chữ & vỡ khung:**
  - Dùng `table-layout: fixed;` với `width` / `min-width` rõ cho cột ID, Badge, Ngày giờ, Thao tác; hoặc bọc trong `.executive-table-scroll` (`overflow: auto`) trên màn hình hẹp.
  - Cột **Thao tác** luôn đặt ở **cột cuối cùng bên phải**, `text-align: right` hoặc `white-space: nowrap`.
  - **Không tô nền đỏ toàn bộ `<tr>`** cho dòng khẩn cấp (đã được thống nhất bỏ nền hồng trong `SosRequestsView.css`); thay vào đó nhấn mạnh bằng Badge mức độ `Critical` hoặc thanh border trái `3px solid var(--sos-emergency)` ở ô đầu tiên.
- **Sticky Header:** `thead tr th` luôn `position: sticky; top: 0; z-index: 10;` với nền `--sos-table-header`.

### 5.2. Code CSS & JSX Chuẩn Cho Bảng + Phân Trang

```css
/* Chuẩn bảng kế thừa .executive-table / .sos-table */
.sos-table-wrap {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--sos-border);
  border-radius: var(--sos-radius-sm);
  background: var(--sos-surface);
}

.sos-data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.sos-data-table thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--sos-table-header);
  color: var(--sos-text-secondary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 12px 14px;
  border-bottom: 1.5px solid var(--sos-control-border);
  text-align: left;
  white-space: nowrap;
}

.sos-data-table tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--sos-border);
  color: var(--sos-text-primary);
  vertical-align: middle;
}

.sos-data-table tbody tr:hover td {
  background: var(--sos-table-hover);
}

.sos-data-table tbody tr:last-child td {
  border-bottom: none;
}

.sos-table-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
```

```tsx
{/* Mẫu cấu trúc JSX chuẩn cho Table + Pagination Bar */}
<div className="sos-view-card">
  <div className="executive-table-toolbar">
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className="sos-pill is-active">Tất cả (24)</button>
      <button type="button" className="sos-pill">Chờ xử lý (6)</button>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" className="sos-btn sos-btn--outline sos-btn--sm">
        <RefreshCw size={14} /> Làm mới
      </button>
      <button type="button" className="sos-btn sos-btn--primary sos-btn--sm">
        <Plus size={14} /> Tạo mới
      </button>
    </div>
  </div>

  <div className="sos-table-wrap">
    <table className="sos-data-table">
      <thead>
        <tr>
          <th style={{ width: 110 }}>Mã</th>
          <th>Đối tượng / Nội dung</th>
          <th style={{ width: 140 }}>Trạng thái</th>
          <th style={{ width: 150 }}>Thời gian</th>
          <th style={{ width: 180, textAlign: 'right' }}>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ fontFamily: 'var(--sos-font-mono)', fontWeight: 700 }}>#SOS-1042</td>
          <td>
            <div style={{ fontWeight: 600 }}>Nguyễn Văn A</div>
            <div style={{ fontSize: 12, color: 'var(--sos-text-muted)' }}>Hòa Xuân, Cẩm Lệ</div>
          </td>
          <td><span className="sos-badge critical">Khẩn cấp</span></td>
          <td>14/11 08:30</td>
          <td style={{ textAlign: 'right' }}>
            <div className="sos-table-actions">
              <button type="button" className="sos-btn sos-btn--soft-primary sos-btn--xs">Điều phối</button>
              <button type="button" className="sos-btn sos-btn--outline sos-btn--xs">Chi tiết</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  {/* Thanh phân trang chuẩn (.sos-clean-pagination) */}
  <div className="sos-clean-pagination">
    <span className="sos-pagination-info">Hiển thị 1–10 trong tổng số 48 bản ghi</span>
    <div className="sos-pagination-controls">
      <button type="button" className="sos-pagination-btn" disabled>Trước</button>
      <button type="button" className="sos-pagination-btn active">1</button>
      <button type="button" className="sos-pagination-btn">2</button>
      <button type="button" className="sos-pagination-btn">Sau</button>
    </div>
  </div>
</div>
```

### 5.3. Empty State & Loading State
- **Empty State:** Hiển thị trong khung cao tối thiểu `220px`, căn giữa dọc & ngang, gồm Icon `36px` màu `--sos-text-muted`, dòng tiêu đề `14px bold`, dòng hướng dẫn `12.5px` và 1 nút hành động (ví dụ `"Xóa bộ lọc"` bằng `.sos-btn--outline .sos-btn--sm`).
- **Loading State:** Tránh giật layout khi tải lại trang; giữ nguyên chiều cao bảng hoặc dùng spinner / skeleton bar màu `--sos-surface-muted`.

---

## 6. Status Badges & Pills (`.sos-badge`)

Không tạo màu tự phát cho từng màn hình. Mọi nhãn trạng thái trên bảng, drawer, thẻ quy về **5 nhóm ngữ nghĩa thống nhất** dưới đây (kế thừa `.critical`, `.high`, `.medium`, `.pending`, `.active`, `.verified` trong [`DashboardViews.css`](../../web/src/components/layout/DashboardViews.css) và bổ sung `.neutral` khi refactor):

| Nhóm ngữ nghĩa | Class mục tiêu | Ánh xạ nghiệp vụ tiêu biểu | Màu Light chuẩn (Nền / Chữ / Viền) |
|---|---|---|---|
| **Critical / Error** | `.sos-badge.critical` | Nguy cấp, Thất bại, Bị khóa, Từ chối | `#fef2f2` / `#dc2626` / `#fecaca` |
| **High / Warning** | `.sos-badge.high` / `.pending` | Mức cao, Chờ duyệt, Đang cảnh báo | `#fffbeb` / `#d97706` / `#fde68a` |
| **Info / Active Process** | `.sos-badge.active` / `.medium` | Đang điều phối, Đang xử lý, Mức trung bình | `#e0f2fe` / `#0284c7` / `#bae6fd` |
| **Verified / Safe** | `.sos-badge.verified` | An toàn, Đã xác minh, Đang hoạt động, Hoàn tất | `#ecfdf5` / `#16a34a` / `#bbf7d0` |
| **Neutral / Draft** | `.sos-badge.neutral` *(bổ sung)* | Bản nháp, Đã lưu trữ, Ngưng sử dụng | `#f1f5f9` / `#475569` / `#e2e8f0` |

> **Quy tắc viết nhãn:** Dùng **tiếng Việt có dấu ngắn gọn, thống nhất** (`Chờ duyệt`, `Đang xử lý`, `Hoàn thành`, `Đã từ chối`) thay vì viết tắt hoặc trộn lẫn hằng số backend thô (`PENDING_VERIFICATION`, `IN_PROGRESS`) trên UI.

---

## 7. Form Controls, Bộ Lọc & Bản Đồ Nhúng

### 7.1. Inputs, Selects & Validation
- **Chiều cao đồng bộ:** Input một dòng, Select và nút tìm kiếm dùng `height: 36px–38px`, `border-radius: 8px`, `border: 1px solid var(--sos-control-border)`, `background: var(--sos-surface)`.
- **Trạng thái Focus:** `border-color: var(--sos-primary); box-shadow: 0 0 0 3px var(--sos-ring);`
- **Trường bắt buộc:** Đánh dấu `*` màu `#dc2626` ngay sau nhãn `.sos-form-label` / `.executive-modal-label`.
- **Hiển thị lỗi:** Khi validate sai, viền input đổi sang `#dc2626` + hiện 1 dòng text lỗi `11.5px` màu `#dc2626` ngay bên dưới field (không dùng `window.alert`).

### 7.2. Quy chuẩn chọn vị trí trên Bản đồ (`LocationSearchMapPicker`)
- Mọi form có tọa độ địa lý (tạo Điểm nguy hiểm, Điểm trú ẩn, Đợt hiến máu, Quản lý địa bàn, Sự cố...) **bắt buộc tái sử dụng** [`LocationSearchMapPicker`](../../web/src/components/common/LocationSearchMapPicker.tsx):
  - Có thanh tìm kiếm địa danh + hỗ trợ dán link Google Maps (bao gồm link rút gọn `maps.app.goo.gl`) hoặc tọa độ nhanh.
  - Có nút `"Vị trí của tôi"`, click trực tiếp hoặc kéo-thả ghim marker trên bản đồ Leaflet.
  - Hiển thị tọa độ đã chọn gọn ở chân khung bản đồ kèm link `"Xem Google Maps"` (không đặt 2 ô nhập `[Vĩ độ, Kinh độ]` thô buộc người dùng tự gõ tay).

---

## 8. Modal Dialog, Slide-Over Drawer & Toast Notification

### 8.1. Phân biệt Modal vs Slide-Over Drawer

| Tiêu chí | Center Modal (`.executive-modal-card`) | Slide-Over Drawer (`.ra-drawer` / `.sc-drawer-card`) |
|---|---|---|
| **Mục đích** | Tạo mới bản ghi, Sửa biểu mẫu, Hộp thoại xác nhận (Approve/Reject/Delete) | Xem **chi tiết hồ sơ** (SOS, Cứu hộ viên, Phản hồi Safety Check, Chi tiết Audit Log) mà vẫn giữ ngữ cảnh bảng bên dưới |
| **Kích thước** | Form đơn/Confirm: `max-width: 560px`; Form 2 cột kèm bản đồ: `max-width: 860px–960px` | Chi tiết chuẩn: `width: 520px–740px`; Chi tiết kèm bảng con: `width: min(1200px, 94vw)` |
| **Cấu trúc bắt buộc** | Header (Icon + Title + `×`) -> Body cuộn độc lập -> Footer (`Hủy` trái/giữa, `Xác nhận` phải) | Header cố định -> Body nền `--sos-bg` chia section cards -> Footer gắn dưới cố định nếu có nút duyệt |

### 8.2. Toast & Realtime Indicator
- **Toast ([`toast.ts`](../../web/src/components/common/toast.ts) & [`Toast.css`](../../web/src/components/common/Toast.css)):** Đặt cố định dưới-phải (`bottom: 24px; right: 24px`), tối đa rộng `420px`, viền trái `4px` phân biệt 4 trạng thái (`success`, `error`, `warning`, `info`). Tuyệt đối **không dùng `alert()` / `confirm()` mặc định của trình duyệt**.
- **Realtime Status Pill (`.sos-live-pill`):** Màn hình nào nhận luồng Socket.IO (Tactical Map, SOS Requests, Chat, Audit Logs, Safety Check) hiển thị chấm xanh lá pulsing `7px` kèm nhãn ngắn (`Trực tuyến` / `Thời gian thực`).

---

## 9. Quy Tắc Viết CSS & Checklist Kiểm Duyệt Toàn Web

### Quy tắc file CSS
1. **Không cài hoặc sử dụng class Tailwind** (`flex`, `px-4`, `bg-slate-900`...) trong `web/src/**` vì bundler không build Tailwind.
2. **Scope CSS theo domain:** Selector riêng của màn hình phải có tiền tố rõ (ví dụ `.rpt-*` cho Reports, `.ra-*` cho Rescuer Approval, `.sc-*` cho Safety Check, `.dispatch-*` cho Map Operation) để không rò CSS chéo màn hình.
3. **Không dùng `!important`** trừ khi ghi đè inline style từ thư viện bên thứ 3 (như Leaflet popup/tile container).
4. **Dùng CSS Variable cho theme:** Tránh gán cứng `#ffffff` hoặc `#0f172a` ở component mới nếu component đó nằm trong layout hỗ trợ Light/Dark toggle.

### Checklist trước khi hoàn thành màn hình hoặc tính năng Web mới
- [ ] Có sử dụng đúng hệ màu `--sos-primary` (`#0284c7`) và `--sos-emergency` (`#dc2626`), không lẫn `#2563eb` mới?
- [ ] Nút bấm dùng đúng lớp `.sos-btn` + size (`--xs`/`--sm`/`--md`/`--lg`), tối đa **1 nút Primary** trong 1 toolbar/modal?
- [ ] Nút trong bảng dữ liệu dùng kích thước `--xs` và biến thể `--soft-*` hoặc `--outline`?
- [ ] Bảng có `sticky` header, tối đa 5–7 cột chính, số liệu căn phải/bằng `tabular-nums`, có Empty State & Pagination?
- [ ] Form chọn tọa độ đã tái sử dụng `<LocationSearchMapPicker />`?
- [ ] Thông báo phản hồi dùng `toast` thay vì `window.alert()`, có trạng thái loading khóa double-submit trên nút?
- [ ] Đã kiểm tra hiển thị tốt trên cả `1280px+` (Desktop) lẫn `<= 768px` / `<= 640px` (Tablet/Mobile) và không vỡ trong cả `[data-theme="light"]` & `[data-theme="dark"]`?
