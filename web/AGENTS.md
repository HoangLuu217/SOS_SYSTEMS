# Web UI Design System & Chronicle Template Contract (`web/`)

This file is the **single source of truth** for ALL coding agents (Antigravity, Claude Code, Codex, Cursor, Copilot, Windsurf, etc.) building or modifying UI in `web/`.

Every page, table, button, drawer, modal, filter bar, loading state, and chart MUST follow the **Chronicle** design system (`shadcnstore/shadcn-dashboard-landing-template`) adapted to our OKLCH tokens and shared primitives in `web/src/`.

---

## 0. Mandatory Step 0 — Auto-Clone Chronicle Reference Template (Into Agent's Own Private Folder)

Whenever you create a **new page, dashboard widget, data table, detail drawer, settings screen, chart, auth screen, or layout pattern** (or refactor an existing UI section):

1. Choose a **private folder owned by you (the agent) outside the project repository** — e.g. your agent scratch/cache directory or the OS temp directory (`$env:TEMP\chronicle-template` on Windows, `/tmp/chronicle-template` on macOS/Linux). **NEVER clone the template inside this repository workspace.**
2. Check whether `shadcn-dashboard-landing-template` is already cloned in your private folder. If not, **automatically clone it** (`--depth 1`) before writing UI code:
   - **Windows (PowerShell)**:
     ```powershell
     $tpl = Join-Path $env:TEMP "chronicle-template\shadcn-dashboard-landing-template"
     if (!(Test-Path $tpl)) { git clone --depth 1 https://github.com/shadcnstore/shadcn-dashboard-landing-template.git $tpl }
     ```
   - **macOS / Linux (bash/zsh)**:
     ```bash
     TPL="${TMPDIR:-/tmp}/chronicle-template/shadcn-dashboard-landing-template"
     [ -d "$TPL" ] || git clone --depth 1 https://github.com/shadcnstore/shadcn-dashboard-landing-template.git "$TPL"
     ```
   *(If you already have a dedicated agent scratch folder such as `<agent-scratch>/chronicle-template`, clone there instead.)*
3. Inspect the matching reference screen/pattern inside your private clone BEFORE writing code:
   - Dashboard KPIs / Charts / Overview: `features/overview/`, `features/analytics/`, `kit/charts/`, `kit/widgets/`
   - List + Data Table + Right Detail Drawer: `features/users/`, `kit/data-table/`
   - Settings / Profile / Floating SaveBar: `features/settings/`, `kit/settings/`, `kit/ui-patterns/`
   - Chat / Notifications / Tasks: `features/chat/`, `features/notifications/`, `features/tasks/`
   - App Shell / Auth / Landing: `features/shell/`, `kit/shell/`, `features/auth/`, `features/landing/`
   - Base Primitives & Theme Kit: `components/ui/`, `components/chronicle/`, `kit/theme/`, `kit/customizer/`, `kit/states/`
4. **Adaptation rules**:
   - Port visual structure, spacing rhythm, typography hierarchy, and interaction patterns into `web/src/` using our existing tokens and shared components below.
   - **NEVER** clone into or copy unused template files into the repository.
   - All visible UI copy MUST be natural, idiomatic **Vietnamese** (no raw English labels except standard acronyms like `SOS`, `STT`, `CCCD`, `GPS`, `RBAC`, `OTP`, `Excel`, `PDF`).

---

## 1. Design Tokens & Theming (Light / Dark + 9 OKLCH Presets)

Source files:
- Core OKLCH tokens & Dark Mode bridge: `web/src/index.css`
- Unified Chronicle component & table rules: `web/src/styles/chronicle-system.css`
- Theme customizer & presets: `web/src/kit/theme/presets.ts`, `web/src/kit/customizer/`

**Mandatory token rules:**
- **Typography**:
  - Sans: `var(--font-sans)` (`Hanken Grotesk`, `Be Vietnam Pro`)
  - Mono / tabular codes & numbers: `var(--font-mono)` (`JetBrains Mono`) + `font-variant-numeric: tabular-nums`
- **Surfaces & Borders**:
  - Page canvas: `var(--background)`
  - Card / Table / Sheet / Modal surface: `var(--card)` or `var(--dm-surface)`
  - Popover / Sheet surface: `var(--popover)`
  - Subtle inset / muted fill: `var(--muted)` or `var(--dm-surface-subtle)`
  - Borders: `var(--border)` and `var(--input)` (or `var(--dm-border)`)
- **Text Hierarchy**:
  - Strong / primary: `var(--foreground)`
  - Body: `var(--ch-tbl-body-color)` (`86% --foreground`)
  - Secondary / muted: `var(--muted-foreground)`
- **Brand & Semantic Colors**:
  - Primary brand (dynamically follows all 9 OKLCH presets): `var(--primary)`, hover `var(--primary-hover)`, text `var(--primary-foreground)`
  - Semantic soft badges ONLY: `var(--dm-green-*)`, `var(--dm-amber-*)`, `var(--dm-orange-*)`, `var(--dm-red-*)`, `var(--dm-blue-*)`, `var(--destructive)`, `var(--success)`, `var(--warning)`, `var(--info)`
- **STRICT BAN**:
  - NEVER hardcode `#ffffff`, `#0f172a`, `#f8fafc`, `#e2e8f0` on surfaces/text (breaks Dark Mode).
  - NEVER hardcode `#0284c7`, `#2563eb`, `#0ea5e9`, `#1d4ed8` on primary/create buttons or active tabs (breaks OKLCH preset sync and causes inconsistent blues across pages).

---

## 2. App Shell, Page Layout & Spacing Rules

Source files: `web/src/components/layout/DashboardLayout.tsx`, `web/src/components/layout/Sidebar.tsx`, `web/src/components/layout/Sidebar.css`.

- **Outer page padding**: `.ch-page-body` ALREADY provides the single canonical page margin (`padding: 16px 24px 24px` desktop, `12px 16px 18px` compact).
  - Every feature view root MUST wrap in `<div className="sos-views-container">` with **`padding: 0`** (NEVER add extra outer horizontal padding like `padding: '20px 24px'` — that causes double side margins).
- **Shell viewport lock without stacking-context trap**:
  - `.ch-app-shell` uses `width: 100%; height: 100dvh; max-height: 100dvh; overflow: hidden;` (and NEVER `position: fixed`). This keeps the sidebar fixed when scrolling long pages AND prevents trapping modals behind portaled `DetailSheet` overlays.
- **Sidebar active state**:
  - Managed via the shared sliding pill indicator in `Sidebar.tsx` / `Sidebar.css` — do NOT add ad-hoc per-tab active backgrounds.

---

## 3. Top-Frame-First Rendering & Branded Loading (`SyncLogoLoader`)

Source file: `web/src/components/common/SyncLogoLoader.tsx`.

- **Always render the top frame first**: Page header, scope/filter bar, tabs, search input, Excel export button, and Create button MUST render immediately — NEVER replace the whole view with an empty loading screen.
- **Unified loader**: Every loading state (app boot, page data fetch, table body loading, detail panel loading) MUST use:
  ```tsx
  import { SyncLogoLoader } from '@/components/common/SyncLogoLoader';
  <SyncLogoLoader size="md" message="Đang tải dữ liệu..." />
  ```
  - Sizes: `sm` (nested tables/drawers), `md` (main tables/sections), `lg` / `fullScreen` (app splash).
  - Logo-only 3-layer pulsing animation (`/logoSOS.png`) — do NOT add custom spinners or SVG text loaders.

---

## 4. Unified Button System

All buttons across EVERY view MUST belong to one of these exact canonical variants (styled centrally in `web/src/styles/chronicle-system.css` and `web/src/components/ui/button.tsx`):

| Purpose | Component / Class | Visual Standard |
| :--- | :--- | :--- |
| **Create / Primary CTA** (`+ Tạo ...`, `+ Thêm ...`, `+ Nhập kho mới`, modal primary submit) | `<Button />` (`@/components/ui/button`) or `.sos-btn.sos-btn--primary.sos-btn--sm` / `.sos-btn-flat.primary` / `.coordination-action-btn.primary` / `.executive-btn-primary` / `.btn-primary-weather` | `background: var(--primary)`, `color: var(--primary-foreground)`, hover `var(--primary-hover)`, `border-radius: calc(var(--radius) * 0.8)`, `font-weight: 600`. **NEVER override background/border with hex colors.** |
| **Secondary / Refresh / Filter Outline** (`Làm mới`, `Hủy`, `Đóng`) | `<Button variant="outline" />` or `.sos-btn.sos-btn--outline` / `.ra-refresh-btn` / `.executive-btn-outline` | `background: var(--card)`, `border: 1px solid var(--border)`, `color: var(--foreground)`, hover `var(--muted)`. |
| **Excel Export** (`Xuất Excel`) | `<ExcelExportButton />` from `@/components/common/TableBulkKit` (`.sos-excel-btn`) | Neutral Chronicle outline (`height: 36px`, `var(--card)`, `1px solid var(--border)`, `var(--foreground)`). **NEVER** create custom green Excel buttons. |
| **Danger / Destructive** (`Xóa`, `Thu hồi`, `Từ chối`) | `<Button variant="destructive" />` or `.sos-btn.sos-btn--danger` / `.ra-btn-danger` | Semantic destructive red ONLY for destructive/rejection actions. |

---

## 5. Unified Data Tables Standard (Chronicle Typography & Calm Neutral Palette)

Source file: `web/src/styles/chronicle-system.css` (`:root` `--ch-tbl-*` tokens, scoped to `.ch-app-shell`, `[data-slot="sheet-content"]`, and `[role="dialog"]`).

Every `<table>` (main pages, detail drawers, and modals) MUST use a unified table class (`sos-clean-table`, `executive-table`, `ra-table`, `sos-table`, or `weather-table`) and strictly follow this scale:

| Table Role | Class / Selector | Size | Weight | Color / Rules |
| :--- | :--- | :---: | :---: | :--- |
| **Column Header** | `thead th` | `12px` | `500` | `var(--muted-foreground)`, **Sentence-case Vietnamese** (`Họ và tên`, `Trạng thái`, `Thao tác`). **NEVER ALL-CAPS** (except acronyms `STT`, `CCCD`, `GPS`, `SOS`). |
| **Primary Cell** | `.ch-tbl-primary` | `13.5px` | `600` | `var(--foreground)` — names, titles, team/shelter/facility/item names. **NEVER static bright blue.** |
| **Body Cell** | `.ch-tbl-body` (or default `tbody td`) | `13px` | `400` | `var(--ch-tbl-body-color)` (`86% --foreground`) — addresses, areas, departments, categories. |
| **Meta / Subtext / Time** | `.ch-tbl-meta` | `12px` | `400` | `var(--muted-foreground)` — descriptions, timestamps (`tabular-nums`), author/subline info. |
| **Code / Plate / CCCD / ID** | `.ch-tbl-mono` | `12.5px` | `600` | `var(--font-mono)`, `tabular-nums`, `var(--foreground)`. |
| **Phone & Links** | `.ch-tbl-phone`, `.ch-tbl-link` | `12.5px` | `500` | `tabular-nums`, neutral `var(--ch-tbl-body-color)` by default; switches to `var(--primary)` **ONLY on `:hover`**. |
| **Status / Severity Badge** | `.sos-badge`, `.ra-status-badge`, `.officer-status-badge`, `.rescuer-status-badge`, etc. | `11.5px` | `600` | Soft semantic pill (`--dm-green-*`, `--dm-amber-*`, `--dm-red-*`, `--dm-blue-*`). |

**Additional table rules:**
- **Classification / Category columns** (e.g., Weather type, Alert type): display as clean neutral text + subtle icon — **NO colored background pill** unless indicating operational status or severity.
- **Bulk selection**: Always use `useTableSelection`, `TableSelectAllCheckbox`, `TableRowCheckbox`, and `TableBulkActionBar` from `@/components/common/TableBulkKit`.
- **No inline typography overrides**: Do NOT put inline `fontSize: 10.5`, `fontWeight: 800`, or `color: 'var(--dm-blue-text)'` on standard table cells — use `.ch-tbl-*` classes.

---

## 6. Detail Drawer & Inline Edit Flow (`DetailSheet` + `SaveBar`)

Source files: `web/src/components/common/DetailSheet.tsx`, `web/src/kit/settings/SettingsPrimitives.tsx`.

- **All record inspection AND editing** MUST live inside `<DetailSheet>` (slide-over right sheet):
  - **NEVER** create a separate Edit Popup Modal for editing an existing record.
  - Clicking a table row or "Chi tiết" / "Sửa" opens `<DetailSheet>` with the record's fields editable inline (or via an inline edit toggle inside the sheet).
- **Dirty-state floating SaveBar**:
  - Track `isDirty` by comparing draft form state against the original record snapshot.
  - Pass `saveBar={{ dirty: isDirty, saving, onSave, onDiscard, saveLabel, message }}` directly to `<DetailSheet>`.
  - While `dirty === false`, the bar stays hidden; the moment any field changes, the floating Chronicle `<SaveBar />` appears at the bottom of `<DetailSheet>` (`Bạn có thay đổi chưa lưu` • `Hủy thay đổi` • `Lưu thay đổi`).
  - Clicking Save should prompt confirmation via `useGlobalModals` for sensitive/production mutations, then persist and close/refresh cleanly.
- Use `<DetailFacts />`, `<DetailSection />`, `<DetailSeparator />` from `@/components/common/DetailSheet` for consistent detail layout.

---

## 7. Modals, Confirm Dialogs, Lightboxes & Strict Z-Index Ladder

Source files: `web/src/hooks/useGlobalModals.tsx`, `web/src/components/common/PhotoLightboxModal.tsx`, `web/src/components/ui/sheet.tsx`.

- **Confirm / Reject / Delete Dialogs & Toasts**:
  - ALWAYS use `useGlobalModals()` (`setConfirmModal`, `showToast`, `renderGlobalModals`) — automatically renders via `createPortal(..., document.body)` so it NEVER gets trapped behind `DetailSheet`.
- **Image Lightbox**:
  - ALWAYS use `<PhotoLightboxModal />` (portaled to `document.body` at `z-index: 20000`).
- **Custom Create / Action Modals**:
  - Must add `data-modal-layer="confirm"` on custom fixed modal overlays so pressing `Esc` closes the modal without closing an underlying `DetailSheet`.
  - Any modal rendered inside an `isolation: isolate` container (such as `map-operation`) MUST use `createPortal(..., document.body)`.
- **Strict Z-Index Ladder (NEVER violate)**:
  1. Layout Shell / Sidebar / Topbar: `0 – 250`
  2. `DetailSheet` (portaled): `1400 – 1420`
  3. `CustomizerPanel` (portaled): `2000 – 2100`
  4. Feature Create / Action / Confirm Modals (`.ra-modal-backdrop`, `.sc-modal-overlay`, `.weather-modal-backdrop`, `.executive-modal-backdrop`): `10000` (nested sub-modals/map pickers: `10010 – 10050` — NEVER put `!important` on `10000`)
  5. `PhotoLightboxModal` (portaled): `20000`
  6. Global `ConfirmModal` (`useGlobalModals`, portaled): `99999`
  7. Sidebar Account / Logout Modal (`.sos-modal-overlay`, portaled): `999999`
  8. Global Toasts (`useGlobalModals`, portaled): `1000000`
  9. Portal Dropdowns (`SearchableSelect` / `DaNangAreaSelect`): `1000010 – 1000020`

---

## 8. Shared Primitives Inventory (Reuse — Never Reinvent)

- Layout & Chrome: `@/components/layout/DashboardLayout`, `@/components/layout/Sidebar`, `@/components/layout/PhoenixTopbar`
- Detail & Edit: `@/components/common/DetailSheet` (`DetailSheet`, `DetailFacts`, `DetailSection`, `DetailSeparator`), `@/components/common/UserDetailSheet`
- Tables & Export: `@/components/common/TableBulkKit` (`useTableSelection`, `TableSelectAllCheckbox`, `TableRowCheckbox`, `TableBulkActionBar`, `ExcelExportButton`)
- Loading & Modals: `@/components/common/SyncLogoLoader`, `@/hooks/useGlobalModals`, `@/components/common/PhotoLightboxModal`
- Pickers & Uploads: `@/components/common/SearchableSelect`, `@/components/common/DaNangAreaSelect`, `@/components/common/LocationSearchMapPicker`, `@/components/common/MultiImageUploader`
- Chronicle UI & Kit: `@/components/ui/*` (`button`, `card`, `badge`, `input`, `textarea`, `switch`, `sheet`, `separator`, `accordion`, `kbd`), `@/kit/settings/SettingsPrimitives`, `@/kit/charts/ChronicleCharts`, `@/kit/widgets/Widget`, `@/kit/ui-patterns`

---

## 9. Mandatory Pre-Delivery Verification Checklist

Before concluding any `web/` UI task, verify ALL of the following:
1. **TypeScript & Production Build**: Run `npx tsc -b` and `npx vite build` inside `web/` (0 errors).
2. **Template & Token Compliance**: No hardcoded `#0284c7`/`#2563eb` on create/primary buttons; no hardcoded `#ffffff`/`#0f172a` breaking Dark Mode.
3. **Table Compliance**: All `<thead> <th>` are Vietnamese sentence-case (no ALL-CAPS headers); cell classes follow `.ch-tbl-*` scale.
4. **Spacing Compliance**: Root view container uses `.sos-views-container` with no extra double horizontal padding.
5. **Modal & Layer Compliance**: All confirm/action modals open **in front of** `DetailSheet` (`z-index >= 10000`, portaled if inside isolated stacking contexts) and `Esc` respects top modal layer.
6. **Loading Compliance**: Top frame renders immediately; loading regions display `<SyncLogoLoader />`.
