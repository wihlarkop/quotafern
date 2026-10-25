# Quotafern UI and UX Roadmap: Soft Native

Status: Planned. This document describes future design work, not implemented features.

F3 was squash-merged at `4bdf1fe4344bfb6ac93f47a1ac89710b866bb49c` after 30/30 Windows owner acceptance and 4/4 exact-HEAD CI. Its Codex live gate remains disabled. Do not treat this roadmap as permission to activate monitoring, change credentials, or release.

## Design direction

Quotafern is a small local-first, tray-first desktop utility. A user should immediately understand remaining quotas, reset times, freshness, and which account the numbers belong to.

Aim for a calm, quick and readable interface rather than a literal macOS clone.

- Things 3 inspires whitespace, visual hierarchy, and comfortable typography.
- Raycast inspires efficient keyboard and interaction feedback.
- Ice inspires restrained native menu-bar utility behavior.

Keep one consistent visual identity across Windows, macOS, and Linux, while following each platform's tray, focus, sizing, and window conventions.

## Design invariants

- Appearance choices remain System, Light, and Dark.
- Graphite & Jade remains the primary palette.
- Zinc & Signal remains an alternative palette.
- Palette and appearance stay independent preferences.
- Do not confuse missing quota data with zero remaining.
- Keep quota status text independent of accent colors.
- Show live, synthetic demo, stale, missing, disconnected, and Coming Soon honestly.
- Review popup widths of 320, 380, and 420 logical pixels and short-height layouts.
- Preserve keyboard focus, reduced-motion support, accessible labels, and readable text.
- Preserve Tauri 2, Svelte 5, Bun, Oxc and current semantic components.
- No additional runtime, network permission, or credential access for cosmetic effects.

## Soft Native visual ingredients

Soft surfaces use restrained corner radii, subtle borders, light shadows, and little visual noise.

Calm typography emphasizes the provider, selected account, remaining percent, reset time, and data freshness. Align numeric values to prevent visible jitter.

Subtle motion uses short intentional feedback, not long decorative animation. Respect system reduced motion and prevent sudden layout shifts.

Native feel means reliable first launch, tray click, Show and Hide, Quit, Escape, close-to-hide, single instance, and sensible window placement.

The Overview stays compact. Codex Details may expose credits, spending, earned resets, and the 84-day Activity heatmap without crowding the primary view.

## ACC-04: Multi-account and named connection UX

The same account-management design applies to every supported provider. Specific providers only become connectable after their own documented authorization and quota access have been accepted.

- Group provider, account or workspace, and individual session or API key connections.
- Let users rename each connected account and each connection or API key alias.
- Show independent connection status and freshness for all accounts.
- Provide Add account, Add connection, Rename, Disconnect, and Remove actions.
- Offer All Accounts, Provider, Account, and Connection filters.
- Never display two accounts as if they share one subscription quota.
- Never count a shared billing wallet twice.
- Clearly distinguish user-defined aliases from verified provider identity.
- Support long and duplicate aliases without hiding keyboard-accessible actions.
- Keep authenticated details and raw API key fragments out of display by default.

The underlying provider, account, connection, and quota-source identity design belongs to [ACC-01 architecture](acc-01-architecture.md). Its [multi-account UX contract](acc-01-ux-contract.md) specifies fields, selection, rename/removal, independent states, responsive behavior and accessibility for ACC-04/UX-02. ACC-01 adds no production screen redesign or live integration. No production multi-account UI should be connected to live accounts before that model passes security review.

## UX-01: Design exploration

Status: Planned. No production visual changes.

Compare these alternatives in light and dark:

- Soft Native with Graphite & Jade: warm subtle surfaces and quiet jade accent.
- Refined Graphite & Jade: improve spacing and rhythm without changing basic structure.
- Refined Zinc & Signal: preserve state semantics with an alternate palette.

Explore Overview, Accounts, Settings, Codex Details, Coming Soon, errors, disconnected, stale and synthetic demo states. Include multiple named accounts and multiple named keys at 320, 380, and 420 pixels.

Produce before-and-after screenshots, explain component and token differences, evaluate accessibility, and request owner approval before selecting one direction.

## UX-02: Implementation

Status: Planned, dependent on UX-01 approval and any required ACC-01 model work.

Refine semantic tokens, spacing, typography, borders, elevation, component layout, scrolling, and small feedback transitions.

Preserve native security and provider logic. Do not invent connected accounts or widen permissions for visual effects. Keep theme and palette preferences independent.

Validate snapshots, responsive layouts, keyboard operation, and reduced-motion behavior. Keep any account-management UI consistent with ACC-01 through ACC-04.

## UX-03: Native acceptance and performance

Status: Planned after UX-02.

Verify tray, keyboard, focus, resize, monitor placement, display scaling, short-height scrolling, and startup behavior on available systems.

Measure popup latency, idle CPU and memory, and layout stability rather than inventing numeric targets.

macOS vibrancy, Windows Mica, other native materials, transparent windows, and custom title bars are optional experiments only. Review fallback behavior and platform security before adoption.

Windows F3 non-credential native acceptance passed 30/30. Native macOS and Linux interactions remain NOT RUN until test devices are available. CI compilation is not a substitute for native interaction tests.

## Completion criteria

Quotafern should open promptly, make every account and connection identifiable by its editable name, keep each subscription quota and reset independent, clearly label unknown or stale values, and show activity without layout jumps. It must remain usable with both palettes and system light/dark appearance without weakening native security.

## Coordination and release restrictions

Keep this roadmap separate from F4 live Codex startup and process-security blockers. Provider login and multi-account support follow `docs/provider-connections-roadmap.md`.

The next architectural step is ACC-01 before the second provider adapter. UX-01 can explore visual directions independently but implementation must not assume an unapproved identity model.

No merge of future UI implementation, provider enablement, or release without owner approval.

## UX-02A: Soft Native production foundation

Status: implemented for owner review in an isolated Draft PR; not merged or released.

The owner separately authorized this first production stage of Hybrid A + B: A's calm surfaces, restrained elevation and botanical identity, with B's compact header/navigation and 380px rhythm. Existing Svelte screens receive shared semantic surface/spacing/focus/motion tokens, fluid narrow layouts and Details focus restoration. Full account management, context filters and ACC-01 runtime cutover remain for UX-02B/C and ACC-04.

See [implementation and screenshots](ux-02a/README.md), [actual validation and pending native/media checks](ux-02a/validation.md), and [independent visual/accessibility review](ux-02a/review.md). Neither browser evidence nor hosted desktop compilation establishes native GUI acceptance. Both Codex live gates remain false; SEC-01/SEC-02 and F4 blockers remain separate.

## ICON-01: Original fern icon refresh

Status: separate proposed design milestone; owner visual selection required.

The current fern is provisional. Plan original browser favicon, Windows/macOS/Linux app icons, monochrome high-contrast tray glyphs, light/dark proofs and HiDPI variants. The [design specification and three concepts](ux-02a/icon-01.md) include actual-size 16/20/24/32px readability observations. No production icon asset is replaced in UX-02A. Select and refine a concept before a separately reviewed asset PR; no external unlicensed art, icon dependency or animated tray icon.

## UX-02B: Account-aware production presentation

Status: implemented for owner review in an isolated Draft PR. The [production Svelte screens](ux-02b/README.md) consume ACC-01 accounts/overview/details projections for explicit synthetic examples. The compact transient context selector supports All/provider/account/workspace/eligible connection scopes; advanced interactions stay with UX-02C. Lifecycle management and persistence remain ACC-04 work. Live Codex stays disabled, other adapters are Coming Soon, and native acceptance is deferred until ICON-01, UX-02B/C and ACC-04. See [actual validation](ux-02b/validation.md) and [review dispositions](ux-02b/review.md). Earlier milestone status paragraphs above are historical.
