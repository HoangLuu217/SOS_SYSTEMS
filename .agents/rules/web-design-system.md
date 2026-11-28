# Chronicle Web Design System Rule (Antigravity Workspace Rule)

This workspace enforces a single unified Web Design System based on **Chronicle** (`https://github.com/shadcnstore/shadcn-dashboard-landing-template`) for every file under `web/`.

## Mandatory Execution Protocol

1. **Read the full canonical specification** at [web/AGENTS.md](../../web/AGENTS.md) before creating or modifying any `web/` UI component, page, or stylesheet.
2. **Auto-clone the Chronicle reference template into your own private scratch/temp folder** (outside the repository — e.g. your agent scratch directory, `%TEMP%\chronicle-template`, or `/tmp/chronicle-template`) when building or redesigning pages, tables, charts, drawers, or layout primitives if not already cached:
   ```bash
   git clone --depth 1 https://github.com/shadcnstore/shadcn-dashboard-landing-template.git <agent-private-dir>/shadcn-dashboard-landing-template
   ```
   Consult the matching template reference (`features/`, `kit/`, `components/ui/`, `components/chronicle/`), then implement using `web/src/` primitives and tokens. Never clone into the repository workspace.
3. **Enforce 100% UI uniformity** across every coding agent:
   - **Colors & Themes**: Semantic OKLCH CSS variables only (`--primary`, `--card`, `--foreground`, `--muted-foreground`, `--border`, `--dm-*`). No hardcoded `#0284c7`, `#2563eb`, `#ffffff`, or `#0f172a`.
   - **Buttons**: All Create/Primary CTAs use `var(--primary)` (`.sos-btn--primary`, `.sos-btn-flat.primary`, `<Button />`). All Excel export buttons use `<ExcelExportButton />`.
   - **Tables**: Sentence-case Vietnamese `thead th` (`12px/500`), calm neutral cells using `.ch-tbl-primary` (`13.5px/600`), `.ch-tbl-body` (`13px/400`), `.ch-tbl-meta` (`12px/400`), `.ch-tbl-mono` (`12.5px/600`), `.ch-tbl-phone`/`.ch-tbl-link` (`12.5px/500`, primary on hover only), semantic status badges (`11.5px/600`).
   - **Page Spacing**: Root view uses `.sos-views-container` (`padding: 0`) so `.ch-page-body` keeps identical horizontal margins across all pages.
   - **Loading**: Render top frame/toolbar first; use `<SyncLogoLoader />` for loading states.
   - **Detail & Editing**: Edit inline inside `<DetailSheet saveBar={...} />` (floating `<SaveBar />` appears on dirty state); do not create separate Edit popup modals.
   - **Modals & Z-Index**: Confirm modals use `useGlobalModals()` (portaled at `z-index: 99999`), lightboxes use `<PhotoLightboxModal />` (`20000`), and all feature modals use `z-index >= 10000` + `data-modal-layer="confirm"` so they ALWAYS appear in front of `DetailSheet` (`1400`).
   - **Verify**: Run `npx tsc -b` and `npx vite build` inside `web/`.
