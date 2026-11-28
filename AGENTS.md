# SosSystem Workspace Agent Rules

## Web Frontend (`web/`) — Mandatory Chronicle Design System

For **any** UI, layout, CSS, component, page, table, modal, or drawer task under `web/`:

1. **Read [`web/AGENTS.md`](./web/AGENTS.md) in full BEFORE writing any UI code.** It is the canonical Web Design System contract for this repository.
2. **Auto-clone the reference template into your own private/scratch folder** (outside the repository, e.g. agent scratch directory or `%TEMP%\chronicle-template` / `/tmp/chronicle-template`) if not already cached:
   ```bash
   git clone --depth 1 https://github.com/shadcnstore/shadcn-dashboard-landing-template.git <agent-private-dir>/shadcn-dashboard-landing-template
   ```
   Inspect the matching Chronicle template pattern before building new screens or components, and adapt it to `web/src/` tokens and shared primitives (never clone into the project repo).
3. **Non-negotiable consistency guarantees across all coding agents**:
   - **Theme tokens only**: OKLCH variables in `web/src/index.css` & `web/src/styles/chronicle-system.css` (Light/Dark + 9 presets); never hardcode `#0284c7`, `#2563eb`, `#ffffff`, or `#0f172a` on buttons/surfaces.
   - **Unified buttons**: All Create/Primary CTAs use `var(--primary)` / `var(--primary-foreground)` (`.sos-btn--primary`, `.sos-btn-flat.primary`, `.coordination-action-btn.primary`, `<Button />`); all Excel buttons use `<ExcelExportButton />`.
   - **Unified tables**: Sentence-case Vietnamese `thead th` (`12px`, weight `500`, `--muted-foreground`, never ALL-CAPS) + `.ch-tbl-primary` (`13.5px/600`), `.ch-tbl-body` (`13px/400`), `.ch-tbl-meta` (`12px/400`), `.ch-tbl-mono` (`12.5px/600`), `.ch-tbl-phone`/`.ch-tbl-link` (`12.5px/500`, neutral default, `--primary` on hover), badges (`11.5px/600`).
   - **Unified spacing**: Views wrap in `.sos-views-container` with zero extra outer horizontal padding (`.ch-page-body` owns outer margins).
   - **Unified loading**: Top frame renders first; loading regions use `<SyncLogoLoader />`.
   - **Unified detail & edit**: Inspect and edit inline inside `<DetailSheet saveBar={...} />` with dirty-triggered `<SaveBar />` (never a separate Edit popup modal).
   - **Unified modal z-index**: All confirm/action modals sit strictly **in front of** `DetailSheet` (`1400`) via `useGlobalModals()` (`99999`, portaled), `<PhotoLightboxModal />` (`20000`, portaled), or `z-index >= 10000` with `data-modal-layer="confirm"`.
   - **Verification**: Always pass `npx tsc -b` and `npx vite build` in `web/` before finishing.
