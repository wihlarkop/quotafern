# ACC-01 validation

Date: 2026-10-25. Baseline: `3b5b9d910a4cb9c3d7568bf6ca756aaef383c968`.

## Evidence and scope

Main baseline post-merge [CI run 40119650321](https://github.com/wihlarkop/quotafern/actions/runs/40119650321): all four jobs passed (Frontend quality; desktop Linux, Windows and macOS), checked during ACC-01. Original checkout was clean on `codex/f3-codex-quota` at `0991d1c0d531e5168eed7778cd75e45fec8f1fcc`; it was preserved. Work is isolated on `codex/acc-01-multi-account`.

Frozen Bun 1.4.4 install succeeded. Baseline `bun run regression`: 11 groups, 675 assertions passed.

## Frontend and independent review

- `bun run fmt`, `bun run check`, `bun run lint`: passed; Svelte reports zero errors/warnings.
- `bun run regression`: 12 groups, 827 assertions passed, including 152 ACC-01 assertions after review fixes. Existing 675 assertions remain passing.
- `bun run build`: passed; production assets compiled. The new domain module is unwired and does not change the production bundle behavior.
- One independent architecture/security review used GPT-6 Luna with High effort. It found connection identity being collapsed at account scope and missing generation bindings on non-publishing shared-source connections. Both were fixed with deterministic synthetic coverage: independent identities, scoped details/header behavior, disconnect retention, late identity/error rejection after reconnect, and old/fresh shared-source evidence. No second expensive review was run.
- Author inspection also tightened malformed metadata rejection for null aliases and array-valued mechanism descriptors; regression coverage confirms both fail closed.

Rust and exact-HEAD hosted CI results will be recorded in the Draft PR before delivery. This document avoids a self-referential final commit hash; the PR identifies the exact final HEAD and run.

## Implemented versus deferred

Implemented: opaque IDs, provider catalog/capability descriptors, separate account/workspace/connection/source contracts, alias validation and rename, strict metadata codec and explicit synthetic legacy migration, disconnected restore, generation-aware synthetic lifecycle/removal contracts, scoped Accounts/Overview/Details projections, source deduplication without totals, and the written UX acceptance specification.

Deferred: production multi-account UI, native multi-session coordinator, real provider adapters/authorization, storage activation, app-owned OS-protected credential storage, reconnect/polling, provider-specific shared cross-account billing and arithmetic totals. Existing F3 Rust bridge and UI behavior are untouched. No authenticated provider operations, credentials, CLI auth inspection, keychain access or live enablement occurred.

## Remaining blockers and acceptance limits

Both live gates remain false. Codex startup-policy and Unix forced-parent termination are deferred F4 blockers; SEC-01/SEC-02 monitoring/credential gates remain explicit. No merge, release, deployment or publication is authorized. This task's authorized delivery is a Draft PR.

macOS/Linux native GUI interaction: NOT RUN. No new native GUI acceptance is claimed on Windows either. Hosted compilation and synthetic process fixtures are not tray/dialog/focus or authenticated provider acceptance. Responsive/theme/keyboard UX requirements are specified for future ACC-04/UX-02, not marked exercised by this architecture task.

## Model configuration

The running parent cannot select or verify its own model/effort setting through this interface; the requested parent GPT-6.1 Sol / High maximum configuration is therefore not claimed. Child review is explicitly dispatched with GPT-6 Luna / High. No Extra High escalation is used.
