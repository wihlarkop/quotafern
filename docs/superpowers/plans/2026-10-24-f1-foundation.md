# F1 Foundation implementation plan

Goal: deliver a runnable, explicitly synthetic tray application and a reviewable Draft PR.

Architecture: Svelte presents typed quota snapshots and local appearance settings. Rust owns one popup and tray lifecycle. No provider or authentication implementation.

The user's execution brief governs: Bun only, Oxc first, feature first, no TDD, no real credential access, no merge/release/deploy.

- [x] Lead: package/configuration scaffold, reproducible lockfiles, integration and final security review.
- [x] Frontend worker: `src/` presentation, snapshot fixtures, palette/appearance and accessible controls.
- [x] Native worker: `src-tauri/` lifecycle, restricted IPC/CSP and icons.
- [x] DX worker: README, AGENTS, architecture/design/security docs, CI and ignore rules.
- [x] Validate after implementation: Bun frozen install, lint, Svelte diagnostics, actual Svelte formatting, production build; Cargo fmt/check/Clippy and native build.
- [x] Exercise browser views, palettes, current system preference, persistence, loading/error/unknown/empty and keyboard behavior; Windows native startup/hide/close/single-instance checked. Tray menu and other OS runtime checks remain explicitly not run in `docs/f1-validation.md`.
- [x] Reviewed scoped diff, committed, pushed, and opened Draft PR #1. The final handoff reports the exact head and current hosted CI outcome.

File ownership is disjoint in this shared checkout. Only the lead mutates Git or shared configuration. Worker models are GPT-6 Luna at xhigh; no higher worker tier is permitted.
