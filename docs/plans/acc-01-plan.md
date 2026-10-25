# ACC-01 implementation plan

Date: 2026-10-25. Baseline: `3b5b9d910a4cb9c3d7568bf6ca756aaef383c968`.

## Design and constraints

Implement the supplied ACC-01 specification as a feature-local TypeScript domain and presentation foundation. Keep the existing F3 runtime and UI untouched. Pure functions permit synthetic verification without native authority or provider access. Do not implement provider adapters or activate persistence in the application.

An in-place rewrite of CodexBridge would couple this foundation to F4 security work. A documentation-only model would not meet the independently testable requirement. The selected approach is an additive model with a validated metadata codec and migration, isolated state transitions, and typed Accounts/Overview/Details projections. This implementation choice follows the supplied scope; no further product decision is required.

Use Bun 1.4.4, Oxc, existing Svelte/TypeScript, and locked Rust commands. No new dependencies, TDD, credentials, polling, IPC or policy changes. Keep both live-enable constants false. Draft PR only; no merge, deployment or release.

## Files and tasks

- [x] `src/lib/accounts/model.ts`: provider/account/workspace/connection/source types, opaque IDs, aliases, provider catalog; no credentials.
- [x] `src/lib/accounts/metadata.ts`: strict, bounded versioned metadata codec; empty/legacy migration; aliases only plus structural IDs; restore disconnected with no consent or data. No localStorage calls.
- [x] `src/lib/accounts/state.ts`: isolated lifecycle transitions, generation checks, explicit source associations and removal cleanup barrier.
- [x] `src/lib/accounts/views.ts`: stable filters, grouped Accounts, ownership-scoped Details and deduplicated Overview sources. Never aggregate unknown billing relationships or incompatible measures.
- [x] `scripts/accounts-regression.ts`, `scripts/regression.ts`: synthetic integration and security regressions for all requested cases. Add after implementation, following repository no-TDD guidance.
- [x] `CONTEXT.md`, `docs/acc-01-architecture.md`, `docs/acc-01-ux-contract.md`: vocabulary, boundaries, migration, future UX acceptance at all required widths/themes and keyboard behavior. Link from existing roadmaps/architecture/security docs.
- [ ] Run frozen install, frontend checks/build/regressions, Rust fmt/check/Clippy/mock tests and unbundled build; one focused independent architecture/security review on GPT-6 Luna High; fix supported findings and rerun affected checks.
- [ ] Commit, push isolated branch, create and attach Draft PR; verify baseline and exact-HEAD hosted CI, record implemented/deferred behavior and evidence.

## Review focus

Reject provider/parent ID collisions, inconsistent workspace ownership, late asynchronous results after disconnect/removal, accidental retention of auth in metadata, aliases containing controls or invisible-only content, unknown billing incorrectly deduplicated or summed, and filters showing another account's data. Runtime TypeScript objects are adapter-sanitized contracts, not proof of native authorization. Native cleanup must be acknowledged before removal; this foundation cannot stop a process.

## Execution record

- Main verified at requested baseline; original clean F3 checkout preserved. Native managed worktree created. Baseline push CI initially in progress.
- Ruling: pure metadata serialization is implemented and tested, but storage is not wired into App.svelte. Existing persistence remains appearance/palette only; future activation requires review.
- Review: one GPT-6 Luna High independent architecture/security pass; connection identity isolation and per-link generation findings fixed. Latest frontend regression: 827 assertions (152 ACC-01), zero failures. No TDD or credential operations were used.
