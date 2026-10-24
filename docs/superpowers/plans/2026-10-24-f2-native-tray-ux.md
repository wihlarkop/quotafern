# F2 native tray UX implementation plan

**Goal:** Make the existing single-window synthetic quota popup easier to open, read, and dismiss without expanding provider or credential access.

**Architecture:** Keep native lifecycle and physical-pixel positioning in Rust, presentation and preferences in Svelte/TypeScript, and the existing Bun regression runner. Use explicit file ownership on the clean `codex/f2-native-tray-ux` branch, created from verified `origin/main` at `8313b6a7da65cee5fe89878a19ee19e9841657f2`.

**Spec:** Owner's F2 Native Tray Experience & UX Hardening brief supplied 2026-10-24. Autonomous implementation is explicitly authorized; no design approval gate or TDD.

## Constraints

- Bun-only, Oxc-first, feature-first; no new testing framework.
- Synthetic data visibly labeled in all builds; no credentials, HTTP providers, telemetry, OAuth, or native quota authority.
- One visible-on-launch main window; close hides; menu Show/Hide/Quit preserved; repeated launch restores the existing window.
- Existing renderer command, capability, release CSP, and separate appearance/palette persistence stay minimal.
- Draft PR only; no force push, merge, release, or repository settings changes.

## Decisions and review focus

Use native tray click events on Windows/macOS and preserve the Linux menu fallback. Toggle a focused popup; restore an unfocused/hidden popup. Avoid unconditional blur dismissal: account/settings controls and native menus must remain predictable. Escape dismisses through the existing restricted hide command. Place near native tray geometry when available, clamp in physical coordinates to monitor work areas, and recover safely on show/scale/display changes. Native interaction evidence must remain separate from static/compile checks.

Focus review on tray-focus event ordering, negative monitor coordinates and DPI, small work areas, unavailable quota fields, keyboard dismissal and focus visibility, production demo labels, and security allowlists.

## Tasks and ownership

- [ ] Native worker: own `src-tauri/src/lib.rs` and a cohesive `src-tauri/src/popup.rs` if useful. Implement click/menu lifecycle and geometry with existing dependencies; document behavior for lead integration. Run Rust format/check/lint through package scripts.
- [ ] UI worker: own `src/App.svelte`, `src/app.css`, and small presentation components if justified. Preserve the design; improve minimum typography, wrapping, one scroll region, keyboard/Escape, and honest states. Run frontend lint/check and report browser evidence separately.
- [ ] Regression/docs worker: own `scripts/regression.ts`, `docs/f1-validation.md`, and initial `docs/f2-validation.md`. Preserve historical F1 evidence, append dated owner acceptance, extend meaningful configuration/security/fixture guards after implementation.
- [ ] Lead: review the TypeScript snapshot boundary, add minimal explicit synthetic identity if needed, coordinate interface changes, update architecture/design/security docs, and verify integration.
- [ ] Run frozen install, regression, lint, format, Svelte check/build, Rust format/check/Clippy, and unbundled debug desktop build. Exercise browser/native interactions where accessible and record exact limits.
- [ ] Independent focused review, fix material findings, commit and push, create one Draft PR, attach it, verify exact HEAD and hosted CI, and deliver evidence-backed handoff.
