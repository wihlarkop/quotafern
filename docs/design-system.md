# Design system

The F1 interface is a compact desktop popup built with Svelte 5, Tailwind CSS 4, local shadcn-svelte components, Bits UI primitives, and Lucide icons.

## Theme model

Appearance mode and color palette are distinct settings:

- **Mode:** `system`, `light`, or `dark` controls how the interface adapts to the user's display preference.
- **Palette:** Graphite & Jade (`graphite-jade`) or Zinc & Signal (`zinc-signal`) selects the color family independently of mode.

Persist both preferences separately in `localStorage`. They are non-sensitive UI settings; do not put credentials or quota-provider data there. Define colors through semantic CSS tokens in `src/app.css` and Tailwind 4 theme variables so each palette works with all three modes.

`--surface`, `--surface-raised`, `--surface-inset`, `--text`, `--muted`, `--border`, `--accent`, and `--focus` define the shell. Separate `--normal-ink`, `--low-ink`, `--critical-ink`, and `--unknown-ink` tokens and their wash colors define quota states. Normal means above 25% remaining, low means 10–25%, critical means below 10%; missing, non-finite, or out-of-range values are unknown. The brand accent never substitutes for these state colors. Meters represent remaining quota.

Oxfmt enables Svelte formatting with `"svelte": true` and uses the installed Svelte compiler; it needs no separate Prettier CLI. Import sorting is enabled and smoke-checked through Bun. Tailwind sorting is deliberately left disabled. Typography uses the local system stack, with no font downloads.

## Components and interaction

- Keep shared UI in local components and use Bits UI for accessible interaction primitives.
- Use Lucide icons for interface symbols; pair icon-only controls with accessible names.
- Preserve keyboard operation and visible focus on interactive controls.
- Keep the frontend quota snapshot seam in TypeScript. F1 always renders synthetic data and labels it as demo; never imply a live provider connection.
- Keep controls keyboard accessible, pair color-coded states with readable text, and respect reduced-motion preferences.

## Native shell relationship

The interface is the visible content of the single `main` Tauri window. Native window close and tray lifecycle are owned by Rust. The renderer's only F1 native command is `hide_popup`; UI components should not gain broader host capabilities for convenience.
