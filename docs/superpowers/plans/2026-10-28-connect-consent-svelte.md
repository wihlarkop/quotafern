# Svelte consent implementation plan

**Approved design:** `docs/superpowers/specs/2026-10-28-connect-consent-svelte-design.md`; owner approved 2026-10-28.

**Goal:** Connect always remembers verified monitoring permission; Windows consent is an isolated Svelte/Tauri dialog. Preserve existing security/lifecycle and UI.

**Execution:** inline, feature-first/no TDD/new standalone suite; no commit/push/release. Existing acceptance gates stay local and production patch disabled.

- [x] Native boundary: new `codex_direct/consent.rs`, one expiring challenge bound to generation/account/connection/kind, dedicated child-only get/confirm/cancel commands and caller checks; bounded wait/cleanup on all paths. Existing `codex_direct.rs` uses the native presenter, always remembers after approval; consent policy invalidates earlier versions. All platforms use the isolated presenter or fail closed, per the later all-dialog instruction.
- [x] Svelte view: `consent.html`, `src/consent.ts`, `src/lib/accounts/ConsentDialog.svelte`; independent entry, shared tokens/buttons, Cancel/Connect, source disclosure and remember semantics; no main App/store/polling. Update Vite multi-entry build and narrow Tauri capability/registration only.
- [x] Extend existing native/frontend regression after implementation: caller spoofing, replay/expiry/cancel/late approval, child cannot access provider and main cannot confirm, static bundled entry and unchanged CSP. Run existing package quality commands with production-disabled regression gates.
- [x] Synthetic browser dialog verification, independent Luna final review, production-disabled patch, Windows build/open; owner reported native popup/design-system acceptance PASS.
- [ ] Record any further owner observations for cancellation, quota and reconnect with this presenter; no such results are inferred from visual acceptance. macOS/Linux native acceptance remains NOT RUN.

Review focus: child context must not inherit main authority, cancel/Disconnect must beat late confirm, no live work before approval, only verified successful reads remember, OS focus/modal lifecycle must release main on every exit.
