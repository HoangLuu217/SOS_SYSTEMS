# GitHub Copilot Instructions — SosSystem Web UI

When generating or modifying any code in `web/`, you MUST follow the full design contract in [`web/AGENTS.md`](../web/AGENTS.md):

1. **Auto-clone Chronicle Reference Template**: Automatically shallow-clone `https://github.com/shadcnstore/shadcn-dashboard-landing-template.git` (`--depth 1`) into your own private scratch or OS temp directory (outside the repo, e.g. `%TEMP%\chronicle-template` or `/tmp/chronicle-template`) if not cached. Reference its layouts/primitives (`features/`, `kit/`, `components/ui/`) before implementing new UI; never clone into the project workspace.
2. **OKLCH Tokens**: Use semantic tokens from `web/src/index.css` & `web/src/styles/chronicle-system.css`. Never hardcode `#0284c7`, `#2563eb`, `#ffffff`, or `#0f172a`.
3. **Uniform Buttons**: All Create/Primary CTAs use `var(--primary)` (`.sos-btn--primary`, `.sos-btn-flat.primary`, `<Button />`); all Excel buttons use `<ExcelExportButton />`.
4. **Uniform Tables**: Sentence-case Vietnamese `thead th` (`12px/500`, no ALL-CAPS) + `.ch-tbl-primary` (`13.5px/600`), `.ch-tbl-body` (`13px/400`), `.ch-tbl-meta` (`12px/400`), `.ch-tbl-mono` (`12.5px/600`), `.ch-tbl-phone`/`.ch-tbl-link` (`12.5px/500`, primary on hover only), status badges (`11.5px/600`).
5. **Uniform Page Margins & Loading**: Wrap feature views in `.sos-views-container` (`padding: 0`); render top frame first and show `<SyncLogoLoader />` for loading states.
6. **Detail Sheet & Inline Editing**: Edit inline inside `<DetailSheet saveBar={...} />` with dirty-triggered `<SaveBar />`.
7. **Modal Z-Index**: Confirm dialogs MUST render **in front of** `DetailSheet` (`1400`) via `useGlobalModals()` (`99999`, portaled) or `z-index >= 10000` with `data-modal-layer="confirm"`.
8. **Verify**: Run `npx tsc -b` and `npx vite build` inside `web/`.
