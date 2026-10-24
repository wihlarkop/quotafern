# Quotafern UI/UX roadmap — Soft Native

**Status:** Planned / documentation only. **Implementation must wait until the Codex F3 integration and its security gates have been reviewed and accepted.**

This note records the owner's approved design direction. It does **not** declare F3 complete, authorize live provider access, request a new dependency, or replace the current design system.

## Product design goal

Quotafern is a compact, tray-first, local-first AI **subscription quota** monitor. The user should understand remaining quota, its next reset, and whether credit/activity data is available within a few seconds of opening the popup.

Target: **calm, smooth, premium, and comfortable to read**, rather than decorative, animation-heavy, or a literal copy of macOS. Keep a consistent visual identity across **Windows, macOS, and Linux**, while respecting each OS's native tray, focus, window, and accessibility conventions.

**Reference mix (principles, not assets or pixel-for-pixel copies):**
- **Things 3:** calm hierarchy, whitespace, uncluttered content.
- **Raycast:** precise navigation, focus/keyboard feedback, compact controls.
- **Ice / macOS menu-bar utilities:** restrained native utility feel and understandable menu/tray behavior.

Preserve Quotafern's identity and established stack. The objective is refinement, not rebranding or a framework migration.

## Non-negotiable design and engineering invariants

- **Appearance:** Follow System / Light / Dark.
- **Palette:** Graphite & Jade (primary) and Zinc & Signal (alternative). Palette and appearance remain independent user preferences.
- **Quota state semantics:** normal (>25% remaining), low (10–25%), critical (<10%), unknown. Brand accent is not a substitute for status color. Never display unknown as 0%.
- **Data honesty:** distinguish live, synthetic demo, stale, missing, not connected, and Coming Soon; never fall back to convincing mock usage when a provider fails.
- **Layout:** tray-first 380px target; review 320px, 380px, 420px widths and short-height window states. One intentional content scroll region and usable Settings/details.
- **Accessibility:** keyboard navigation, focus visibility, accessible names, status text beyond color alone, reasonable contrast, readable supporting text (currently 11px minimum), tooltip/keyboard detail for activity heatmap, reduced-motion support.
- **Stack:** Tauri 2/Rust, Svelte 5/TypeScript/Vite, Bun-only, Oxc-first, existing Tailwind/Bits UI/shadcn-svelte/Lucide components. No TDD or artificial coverage targets; regression and security checks remain mandatory.
- **Security:** do not widen IPC permissions, CSP, credential visibility, external network access, or authentication behavior to achieve a visual effect. Reference the separate SEC-01–05 security roadmap on the F3 branch.

## Visual direction: Soft Native

**Soft surfaces:** subtle outlines and elevation, light shadows, restrained color washes, coherent corner radii. Avoid excessive nested cards, heavy borders, forced glassmorphism, and bright gradients.

**Calm typography:** system font stack and clear information hierarchy. Provider identity and remaining percentage should dominate; quota window, reset, last refresh, unit, and availability should remain legible. Align tabular numbers to reduce jitter.

**Subtle motion:** quick, purposeful feedback for selection, tab transitions, hover/press, loading, and panel expansion. No long animations or layout jumps; disable nonessential motion for OS reduced-motion preferences.

**Native feel:** popup should appear and respond predictably, without compromising validated close-to-hide, Escape, Show/Hide/Quit, single-instance, tray focus, monitor clamping, or taskbar behavior. Implement OS-specific window behavior only where reliably supported.

**Information hierarchy:** Overview answers "how much is left?", "when does it reset?", and "is it current?" Details expose separate Quota, Credits/Spending, and Activity sections. Credits must not be conflated with usage tokens or reset-credit entitlements. Keep the GitHub-style activity heatmap out of the crowded primary Overview.

## Multi-account UX requirement (cross-reference ACC-01–04)

All future supported providers must expose a **multi-account and multi-connection collection**, with **user-editable names for each connected account and each connection / API key**. An app using two Codex accounts, two API keys or multiple other provider accounts should be understandable at a glance. This is a **post-F3 design requirement**, not permission to activate additional sessions or bypass provider terms.

- **Accounts:** visually group by provider, then by account/workspace, then by connection/key. Support Add account, Add connection, **Rename account**, **Rename connection**, Disconnect and Remove as distinct actions; design editable alias states, empty/duplicate labels and safe confirmation for destructive operations.
- **Overview:** provider/account filter including **All Accounts**; show each named account's quota limits/reset times independently with source and freshness. Do not collapse multiple sessions into one visually misleading quota meter or double-count shared billing.
- **Labels:** user-defined names ("Codex · Personal", "Codex · Work", "OpenRouter · Key A") are local display labels and do not prove an external identity; show truthful connecting, disconnected, stale, unknown, auth-needed and unsupported states. Keep actual secret values, key fragments and sensitive provider identity hidden by default.
- **Compact layout:** validate grouped account lists and renamed long aliases at 320/380/420px; preserve keyboard focus order, selection, screen-reader names, reduced motion and scroll behavior. Avoid making optional auto-reconnect look pre-approved.
- **Timing:** design/acceptance are staged in `docs/provider-connections-roadmap.md` ACC-01–04, coordinated with UX-01 exploration and only implemented after owner sign-off.

## Candidate visual explorations (not yet selected)

Create lightweight, comparable variants **after F3**:
1. **Soft Native / Graphite & Jade:** softer background/elevation, calm whitespace, jade accent, high legibility.
2. **Refined Graphite & Jade:** retain current structure and density with improved rhythm, tokens, and small details.
3. **Refined Zinc & Signal:** test the alternative palette with the exact same component semantics and interaction model.

Explore both **light and dark** for each viable variant, including empty/disconnected/error, low/critical, optional credits, Coming Soon provider cards, and 84-day activity heatmap. Prefer side-by-side screenshots before selecting a direction. The owner's approval of a visual direction is required before replacing current styling.

Native materials (macOS vibrancy or other platform effects, Windows Mica, potential Liquid Glass) are **optional separate experiments**, not prerequisites. First achieve the desired smoothness with existing CSS/components. Consider platform support, CPU/GPU costs, blur fallbacks, readability, signing, and security before enabling any native material, transparent window, or frameless title bar.

## Delivery sequence and acceptance gates

### Dependency: finish F3 Codex integration and security review

**Status: F3 foundation MERGED / live Codex BLOCKED as of 2026-10-25.** PR #3 was squash-merged as a mock-validated foundation after Windows 30/30 acceptance and exact-HEAD CI 4/4; its live connection remains disabled. Do not start UX implementation or infer that a working Plus connection has been accepted. Track genuine auth/startup/consent/process-containment blockers independently.

### UX-01 — Design exploration and selection

**Status: PLANNED.** No production visual changes.

- Audit current Overview, Accounts, Settings and Codex Details, both palettes, light/dark/system, and empty/error/stale/live/demo states; add exploratory cases for multiple accounts/connections and user-editable account/key aliases.
- Compare three visual directions at 320/380/420px, plus short-height Settings and Codex Details.
- Produce annotated before/after layouts and light/dark screenshots; explain spacing, type hierarchy, color token, interaction, and platform differences.
- Assess readability, keyboard focus, heatmap cell sizing, tooltip access, and credits semantics.
- Record tradeoffs, recommended variant, and **owner design approval**.

**Exit gate:** an agreed direction with reference screenshots, semantic token proposals, and no unreviewed platform or security changes.

### UX-02 — UI polish implementation

**Status: PLANNED; depends on UX-01 approval.**

- Refine existing tokens, typography, spacing, surface/border/elevation system, component layout, and deliberate scrolling.
- Preserve Graphite & Jade and Zinc & Signal across independent light/dark/system modes.
- Implement subtle feedback and predictable, low-jitter state changes; respect reduced motion.
- Polish Codex quota/credits/activity and Coming Soon presentation, with authentic unknown/stale and accessibility semantics. Implement account grouping/rename views only when ACC-01 identity model is approved; do not invent active accounts.
- Keep Rust provider/auth logic and native permissions unchanged unless a separately reviewed issue demands it.
- Avoid new frameworks and cosmetic dependency growth.

**Exit gate:** focused frontend/regression checks, accessibility and responsive checks, screenshots against UX-01 targets; no layout/data/security regressions.

### UX-03 — Cross-platform native feel and performance acceptance

**Status: PLANNED; after UX-02, preferably before broad release.**

- Exercise tray opening/focus/toggle, Escape/X, menus and Quit separately on available Windows, macOS, and Linux desktops.
- Review taskbar/monitor-edge placement, DPI/scaling, monitor changes, keyboard, assistive focus, system theme updates, and reduced-motion settings.
- Inspect cold/warm popup latency, idle CPU/RAM, transition smoothness, and unexpected layout shifts; record measured baselines rather than inventing targets.
- Evaluate optional native effects only as opt-in experiments with clean fallbacks.
- Separate **PASS through actual OS interaction**, static check PASS, BLOCKED, and NOT RUN; hosted CI compilation is not proof of interactive native acceptance.

**Exit gate:** evidence-backed platform acceptance and documented remaining release limitations; no merge/release without owner approval.

## Definition of done for the visual refresh

A user can open Quotafern, read Codex subscription quota and next reset immediately, distinguish credits from activity, inspect the accessible heatmap, and close/restore the popup reliably. The design feels calm in light/dark and both palettes; retains readable typography at compact widths; avoids false data, layout jumps, and excessive motion; and does not weaken provider security or cross-platform tray behavior.

## Coordination notes

- Keep this roadmap separate from the merged F3 foundation and deferred live-connection F4 security work; do not change authorization or credentials for cosmetic work.
- When Codex F3 is accepted, return to this roadmap for UX-01 exploration.
- Retain the validated stack and design tokens; the roadmap is a **future design backlog**, not a request for immediate implementation.
