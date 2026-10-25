# UX-02A · Soft Native production foundation

Date: 25 October 2026. Base: `87ce072f95300d362a08c15b8852e7c8d51272cf`. Delivery: Draft PR only; owner review required before UX-02B/C or ACC-04.

The existing production popup now uses the approved Hybrid A + B direction: softer raised surfaces and botanical Graphite & Jade, with a compact header, segmented navigation and practical popup spacing. This is an incremental refinement of the Svelte application, not a copy of the UX-01 prototype.

## Before and after

Actual browser captures of the production Svelte UI at 380 × 660, with the same synthetic fixture. These are local Vite development renders of production components, not an installed native build or generated mockups. Details may sit below the fold and remain reachable through the single scrolling content region.

| Before                                       | After                                        |
| -------------------------------------------- | -------------------------------------------- |
| _Screenshot removed from current repository_ | _Screenshot removed from current repository_ |
| _Screenshot removed from current repository_ | _Screenshot removed from current repository_ |

[Validation and complete screenshot index](../validation/ux-02a.md) · [ICON-01 concepts and specification](icon-01-concepts.md) · [Independent review](../reviews/ux-02a.md) · [Implementation plan](../plans/ux-02a.md).

## Implementation

- Semantic surface, geometry, spacing, elevation, focus and motion tokens in `src/app.css`. Existing system fonts and status colors remain; no remote assets or runtime dependency.
- A 56px header and 40px tab strip, with 32px triggers. Tabs remain Bits UI controls with their existing semantics.
- Independent raised provider panels; no outer collection card. Quota windows and reset times retain their own labels and values. The current single-context Accounts and separate Credits, Spending, Earned resets and Activity remain intact.
- Existing appearance, palette and development scenario selection use the shared compact control treatment. Production account filters are not implemented yet; no speculative filter or account picker was added.
- Activity columns fit the available width; the 84-day calendar, unknown/zero distinctions, exact date/count labels and arrow navigation are unchanged.
- Details entry focuses its heading; Back restores focus to its opener. No native focus/hide/show code changed.

## Motion

| Token                | Duration                        | Use                                                |
| -------------------- | ------------------------------- | -------------------------------------------------- |
| `--motion-press`     | 120ms                           | Button colors/borders and 1px pressed feedback     |
| `--motion-selection` | 140ms                           | Tabs, appearance and palette selection             |
| `--motion-content`   | 160ms                           | Brief opacity feedback for an entering tab/Details |
| `--ease-feedback`    | `cubic-bezier(0.2, 0, 0, 1)`    | Interaction feedback                               |
| `--ease-enter`       | `cubic-bezier(0.16, 1, 0.3, 1)` | Content entry                                      |

Content is already readable at the first frame; there is no delayed mount, exit animation, crossfade of outgoing data, height animation or provider request. Meter values do not tween: synthetic, missing or newly selected values must not suggest measured progress. Complex account transitions and expand/collapse are deferred with their future screens. The existing refresh spinner is task feedback, not decorative motion.

`prefers-reduced-motion: reduce` disables animations/transitions and pressed translation. Static labels, selected surfaces and focus outlines remain. Source inspection confirms these rules; runtime reduced-motion emulation was blocked by Computer Use and remains pending.

## Security and deferred work

Both `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain unchanged. No Rust source, CSP, capability, command, permission, lockfile, dependency, native containment, auth, storage or provider path changed. Only the two existing appearance preferences persist. Navigation adds no polling or automatic provider access. Live and explicit Demo paths stay separate.

ACC-01 remains an isolated model and projection contract. UX-02B/C and ACC-04 own full account management, context filters, aliases, connection management and their transitions. SEC-01/SEC-02, F4 startup safety and Unix forced-parent-termination blockers stay open. ICON-01 requires a separate owner visual selection before production asset changes.

Browser evidence and CI compilation do not establish native Windows/macOS/Linux GUI acceptance. Tray, hide/show, Escape, DPI/monitor/focus, live OS appearance/motion changes and screen-reader acceptance remain pending for this slice. No merge, release or deployment is authorized.
