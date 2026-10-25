# UX-02A implementation plan

Date: 2026-10-25. Base: `87ce072f95300d362a08c15b8852e7c8d51272cf`.
Spec: owner-supplied “UX-02A Soft Native Production Foundation”; selected Hybrid A + B in docs/ux-01/README.md.
Execution: parent implements; one GPT-6 Luna / High independent visual/accessibility review. No TDD, per AGENTS.md.

## Design and constraints

Preserve the production Svelte composition, Bits UI tabs and existing button primitive. Apply A's soft raised surfaces and botanical palette with B's compact header/navigation rhythm. Keep independent quota windows, credits, spending and Activity. ACC-01 remains an isolated domain contract; no multi-account UI cutover, fabricated identities or speculative filters. Existing appearance/demo selectors receive the shared compact treatment.

Only CSS presentation and small accessibility/navigation refinements may change. Keep both live gates false, all native/process/IPC/CSP/auth logic and icon assets unchanged. No dependency, storage, polling, provider or network additions. ICON-01 is a specification with owner-selectable concepts, not an asset replacement.

## Tasks

- [x] 1. Preflight and baseline: read required contracts, inspect production/prototype and native popup policy; verify 4/4 baseline CI; frozen Bun install; capture actual baseline production UI.
- [x] 2. Foundation: src/app.css semantic surfaces, spacing/radius/elevation/focus and motion tokens; compact shell/tabs/selection; independent provider panels and consistent Accounts/Settings/Details surfaces; fluid Activity grid. Minimal App.svelte keyboard focus improvements only if inspection requires them.
- [x] 3. Validate: existing regression/security/ACC-01 suite, Svelte diagnostics, Oxc format/lint, production build; Rust fmt/check/clippy/native regressions. Browser 320/380/420 and short height, both palettes/light/dark/system, disconnected/demo/details/activity, keyboard/Escape/reduced motion/overflow. Record limitations precisely.
- [x] 4. Independent review: Luna High reads diff and actual screenshots, focused visual/accessibility pass; address material findings in one bounded pass and confirm affected checks.
- [ ] 5. Delivery: document ICON-01 concepts and deferred stages, evidence/screenshots and native limits; commit and push isolated branch; Draft PR; wait for all four hosted CI jobs; record exact HEAD in PR. Stop for owner review.

## Review focus

- 320px status badges, long account identifiers and independent quota/reset labels remain readable.
- 380×480 and smaller browser height keep navigation/footer and vertical content usable.
- Activity retains 84-day unknown/zero semantics and keyboard focus without horizontal scroll.
- Tabs, Details/Back and controls retain focus and Escape ownership; motion never changes ownership, information availability or native lifecycle.
- Reduced motion removes entry/press transitions; both palette/theme combinations preserve text and focus contrast.

## Progress

Baseline CI run 40125757415: exact requested SHA, all four jobs succeeded. Original checkout and other worktrees preserved. Locked install completed with Bun 1.4.4.

Validation completed within available tools: frontend and native synthetic checks passed; 48 Demo and 9 disconnected browser cases measured without horizontal overflow. Runtime reduced-motion/system-switch/full-keyboard/native GUI checks remain explicitly pending after Computer Use stopped. Independent Luna High review: no Critical/Important findings; small Activity pointer targets noted. Delivery/hosted CI is the remaining task.
