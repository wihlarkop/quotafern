# Design system

The interface is a compact desktop popup built with Svelte 5, Tailwind CSS 4, local shadcn-svelte components, Bits UI primitives, and Lucide icons. F2 preserves its established visual direction while improving readability and keyboard behavior.

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

F2 uses one scrolling content region with persistent navigation and footer. Supporting labels have a readable 11px floor, while provider names and remaining values retain stronger hierarchy. Long identifiers expose their full text accessibly; narrow widths wrap quota metadata. Review at 320, 380, and 420 logical pixels and short heights; browser viewport checks do not establish Windows DPI acceptance.

Escape uses the same restricted native hide action as Close. Inner controls retain first refusal of Escape; blur does not dismiss the popup. Reduced-motion preferences suppress nonessential transitions.

The interface is the visible content of the single `main` Tauri window. Native window close and tray lifecycle are owned by Rust. The renderer's only F1 native command is `hide_popup`; UI components should not gain broader host capabilities for convenience.

## UX-02A Soft Native foundation

The Hybrid A + B production refinement adds shared CSS geometry and motion without changing the theme preference model or provider contracts. See [UX-02A](ux-02a/README.md) and its [validation limits](ux-02a/validation.md).

- Spacing: `--space-1` through `--space-5` = 4/8/12/16/20px.
- Radius: control 8px, panel 12px, shell 14px. Small segmented selections use 7px within the 10px inset group.
- Elevation: `--elevation-shell`, `--elevation-panel`, `--elevation-control` define palette-aware soft shadows. Raised provider sections have no additional outer collection card.
- Motion: press 120ms, selection 140ms, content entry 160ms, using shared feedback/entry easing tokens. No outgoing-context transition, height animation or quota-meter tweening. Reduced motion disables transitions, animations and active translation.
- Focus: shared 2px outline and 3px offset, with inset panel outlines. Details focuses its heading and Back restores its opener.
- Layout: 56px header, 40px tab strip, 32px tab targets, one vertical scrolling panel. Activity columns flex to the available width; exact date/count and unknown/zero semantics remain independent of appearance.

Account-first multi-account screens, ID-backed filters and management transitions remain deferred to UX-02B/C and ACC-04. The existing production application still has its single F3 context; styling must not imply otherwise.

## UX-02B account hierarchy

The [account-aware presentation](ux-02b/README.md) extends the existing Soft Native tokens: raised surfaces belong to independent sources, while Accounts uses semantic nested provider/account/connection lists and dividing rules. Local aliases lead; provider and connection names remain explicit. Freshness, lifecycle, identity and error text are independent. A single labeled native select carries transient ID-backed contexts, including provider/workspace scopes, without another control framework. Unknown values never render as zero. Per-source details reuse the established Activity grid with account/source keys and no cross-account content animation. The preceding UX-02B/C deferral described the earlier foundation; UX-02B now implements synthetic presentation only. Account lifecycle and persistence remain deferred.
