# ACC-04 validation

Baseline: `9f6497b65188496fe9786787a75da6e7ce0fd5bf`. Its [post-merge run 40213837019](https://github.com/wihlarkop/quotafern/actions/runs/40213837019) completed successfully in all four jobs before implementation. The primary older F3 checkout and all unrelated worktrees were preserved. Dedicated managed worktree: `acc-04-local-accounts`, branch `codex/acc-04-local-accounts`.

## Automated verification

| Check                                    | Evidence                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Frozen Bun 1.4.4 install                 | Passed; lockfiles unchanged                                                  |
| Svelte diagnostics                       | Zero errors and warnings                                                     |
| Oxlint / Oxfmt                           | Passed after final corrections                                               |
| Frontend regression                      | 17 groups / 1,958 assertions; zero failures, including 199 ACC-04 assertions |
| Production frontend build                | Passed                                                                       |
| Source browser                           | 189 checks passed, zero failures; [actual JSON](../evidence/acc-04/browser-results.json)        |
| Compiled production browser              | 159 checks passed, zero failures; [actual JSON](../evidence/acc-04/production-results.json)     |
| Rust formatting / Clippy / package check | Passed locally on Windows, locked dependencies, warnings denied              |
| Synthetic Rust regression                | 57 passed, zero failed, 4 ignored fixture entry points                       |
| Impeccable UI detector                   | Empty finding list for changed Svelte targets                                |
| Independent Luna High review             | One P2 fixed and follow-up verified; [dispositions](../reviews/acc-04.md)               |

Exact final HEAD and its hosted Windows/macOS/Linux CI run/status belong in the Draft PR description, avoiding a self-referential commit hash in these files. Hosted compilation is not native GUI acceptance.

## Coverage and recovery evidence

The Bun regression exercises independent account/connection/workspace IDs, duplicate aliases, Unicode/NFC/emoji, 80-code-point bounds, controls/bidi/selected invisible rejection, account/key rename independence, 200-record and 64 KiB UTF-8 limits, orphan workspace refusal, copy isolation, save failure, corrupt/extra-field/unknown/oversized envelopes, unavailable initial read, explicit reset and reset failure, defined v0 migration save-before-activation and failed migration preservation, intervening external storage edits, disconnected restore and removal of one target without affecting another. Synthetic active sessions, previously active but disconnected generations, missing runtime, pending cleanup, granted consent/authorization, diagnostics, last-success and identity evidence block local removal. No fabricated native acknowledgments are used.

Browser checks operate actual Svelte in dedicated localhost-only source and compiled sessions. They create two Codex accounts and multiple OpenRouter key labels; create an owned workspace; exercise rename, duplicate aliases, full long Unicode aliases, independent labels and IDs, precise rejection, IME Enter, keyboard Save/Cancel/Escape, Tab wrapping, write failure retaining input and old visible/saved state, restart/reload durability and disconnected labels, stable-ID Overview context, rename continuity and selection invalidation after removal. The reviewed deletion-focus cases include a next surviving long-alias account, parent account action and empty-list heading.

Corrupt, oversized and unknown-version browser payloads are preserved with Add disabled; Cancel leaves the original bytes intact; explicit reset produces only empty v1 metadata and retains appearance/palette. A synthetic initial-read denial blocks management and hides reset; reload after removing the denial recovers prior bytes. These payloads and monkeypatched failures exist only in the isolated test browser origin. No rejected payload is logged by application code.

The existing UX-02C browser navigation suite runs again under Demo: independent provider disclosure, Accounts → Overview → Details, direct connection Details, exact context labels, nested Back/focus/scroll, cross-tab context, hidden/removed opener fallback, same-account source switching, removed/disconnected Details clearing activity, duplicate ordinals, demo/reload reset and popup Escape fallthrough. Development-only fixture cases run only on source; compiled production uses shipped synthetic multi-account data. Metadata bytes stay identical through all demo operations.

Responsive checks cover 320/380/420 × 480/660 with 80-code-point emoji aliases and modal/document horizontal overflow. Both palettes and light/dark, runtime reduced motion, localhost request recording and exactly three allowlisted storage namespaces are checked. Captures use the existing settled tab/panel/highlight helper; source/production filenames identify their runtime.

## Reproduction

```text
bun install --frozen-lockfile
bun run lint
bun run fmt:check
bun run regression
bun run build
bun run dev --port 4175 --strictPort
bun x --bun @playwright/cli -s=quotafern-acc04 open http://127.0.0.1:4175/ --browser chrome
bun run scripts/run-ui-check.ts browser quotafern-acc04 acc-04
# Serve dist on localhost 4176 (no fallback to source), then:
bun x --bun @playwright/cli -s=quotafern-acc04-production open http://127.0.0.1:4176/ --browser chrome
bun run scripts/run-ui-check.ts production quotafern-acc04-production acc-04
bun run fmt:rust
bun run lint:rust
bun run check:rust
bun run regression:rust
```

## Security invariants and pending acceptance

No Rust implementation, permission/capability, CSP, native process containment, provider-specific authorization, dependency, lockfile, workflow or ICON-01 asset changes. `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain unchanged. No app-server, external CLI credential, keychain, OAuth, key input, provider HTTP, inference, billing action, reconnect, new polling or Remember Connection is activated. Only metadata and existing appearance preferences persist; no quota/activity/identity/consent/runtime field enters the codec.

Combined owner Windows native acceptance is deferred as requested; macOS/Linux native GUI remains NOT RUN. Native WebView disk durability across an app restart, real assistive-technology speech, OS scaling/tray/focus/DPI/multi-monitor behavior remain pending. Browser tests prove browser behavior; CI proves checks/compilation. SEC-01/SEC-02 and F4 remain blocked. No merge, release, deployment or publishing was performed.
