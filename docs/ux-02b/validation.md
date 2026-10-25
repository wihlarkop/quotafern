# UX-02B validation

Date: 25 October 2026. Baseline `b577eb66ff6159974d2335785538e990fe387105`. Final HEAD and exact-HEAD hosted results are recorded in the Draft PR so this document does not require a self-referential commit hash.

## Baseline and local quality

The specified combined post-merge [CI run 40183523313](https://github.com/wihlarkop/quotafern/actions/runs/40183523313) completed successfully: Frontend quality plus Windows, macOS and Linux desktop checks. The primary F3 checkout and all unrelated worktrees/branches were preserved; this change uses the managed `ux-02b-account-aware` worktree and `codex/ux-02b-account-aware` branch.

| Check                          | Observed result                                                             |
| ------------------------------ | --------------------------------------------------------------------------- |
| Bun 1.4.4 frozen install       | Passed; committed lockfiles unchanged                                       |
| Baseline regression/build      | 13 groups / 1,001 assertions; production build passed                       |
| `bun run lint`                 | Passed, no warnings                                                         |
| `bun run fmt:check`            | Passed                                                                      |
| `bun run check`                | Zero Svelte errors and warnings                                             |
| `bun run regression`           | 14 groups / 1,184 assertions, zero failures; includes 183 UX-02B assertions |
| `bun run build`                | Passed; compiled bundle smoke-tested below                                  |
| `bun run fmt:rust`             | Passed                                                                      |
| `bun run lint:rust`            | Passed, locked all-target Clippy with warnings denied                       |
| `bun run check:rust`           | Passed, locked Windows package check                                        |
| Impeccable mechanical detector | Empty finding list for changed UI targets                                   |

No Rust implementation, native configuration, permissions, capability, IPC, CSP, ICON-01 asset, dependency, workflow or lockfile changed. Hosted CI supplies its normal synthetic Rust regression and desktop compilation; this slice does not claim new local native GUI coverage.

## Browser acceptance

Actual Chromium browser against the Svelte source UI at local Vite port 4175: **324 checks, zero failures**. [Machine-readable results](browser-results.json) and the [reproducible CLI function](browser-check.js) include measured panel dimensions, scroll heights and overflow checks.

- All four screens at 320/380/420px, 480/660px heights, light/dark and Graphite & Jade/Zinc & Signal: 96 screen/layout combinations. No horizontal document, panel or descendant content overflow; a single visible screen heading and usable scroll area.
- Details heading focus, exact source opener focus restoration and 84 daily grid cells at every main matrix configuration.
- Nine additional fixtures at 320 × 480 on Accounts and Overview: one account, two accounts, two keys, shared billing, errors/auth expiry, Unicode names, duplicates, removal pending and empty. Source filtering, duplicate accessible action names, provider scope and workspace scope checked separately.
- Personal → Work switching removes old Details/grid synchronously; Work values and identity stay independent. Focused activity text resets with the new account. ArrowRight moves to another date with exact date/token feedback.
- Runtime reduced-motion emulation disables content animation/transitions. System appearance follows light/dark media changes without reconnecting. Demo OFF has no synthetic account/source rows. Storage contains only existing appearance preferences. Browser interactions generated no external requests.

The final compiled `dist` bundle was served through a scratch Bun allowlist server on localhost port 4176: **50 additional checks, zero failures**. [Production results](production-results.json) and [check function](production-check.js) verify disconnected startup, no development fixture selector, explicit Demo, independent account/source counts, 84-day grid, and no restored accounts/consent after reload. Forty-four semantic text/background token pairs across both palettes and modes meet **4.5:1** contrast. The final canonical after screenshots are from this compiled bundle.

Reproduce the source matrix with the existing `bun run dev --port 4175 --strictPort`, open it using Bun-run Playwright CLI and invoke `run-code --filename=docs/ux-02b/browser-check.js`. `production-check.js` expects an already-open compiled bundle at local port 4176 and starts disconnected. Both functions use synthetic data only. The temporary static server and browser caches are excluded from the PR.

These checks verify semantic headings, labels, nested lists, meters, live context announcements, standard select/radio keyboard interaction, heatmap arrows and focus. An actual assistive-technology speech pass, OS text scaling and native screen-reader behavior remain pending; automated DOM semantics are not a speech-reader acceptance claim.

## Screenshot index

| Evidence                       | Files                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical production 380 × 660 | [Overview](screenshots/after-overview-380.png), [Accounts](screenshots/after-accounts-380.png), [Details](screenshots/after-details-380.png), [Activity scrolled](screenshots/after-activity-380.png), [Settings](screenshots/after-settings-380.png)                                                                                                                    |
| Production Demo OFF            | [Overview](screenshots/after-disconnected-380.png), [Accounts](screenshots/after-disconnected-accounts-380.png)                                                                                                                                                                                                                                                          |
| Production expanded content    | [Overview](screenshots/after-overview-full-380.png), [Accounts](screenshots/after-accounts-full-380.png), [Details](screenshots/after-details-full-380.png). Only screenshot height/scroll containment temporarily expanded.                                                                                                                                             |
| Source UI, Jade light/dark     | `after-{overview,accounts,details}-jade-{light,dark}-380.png`                                                                                                                                                                                                                                                                                                            |
| Source UI, Signal light/dark   | `after-{overview,accounts,details}-signal-{light,dark}-380.png`                                                                                                                                                                                                                                                                                                          |
| Source UI, 320 × 480           | [Unicode](screenshots/unicode-accounts-320-short.png), [duplicates](screenshots/duplicates-accounts-320-short.png), [errors](screenshots/mixed-accounts-320-short.png), [pending removal](screenshots/removing-accounts-320-short.png), [shared source](screenshots/shared-source-320-short.png), [Work reduced motion](screenshots/work-details-320-reduced-motion.png) |

## Security and native limits

Both `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain unchanged. ACC-01 model/state/metadata/view ownership and lifecycle implementations are unchanged. There was no credential-file access, real authentication, provider read, app-server activation, polling addition, OAuth, secret storage, remembered activation, renderer-controlled native argument, or native process-containment change. No real Add/Remove/Rename/Disconnect implementation is introduced.

Owner Windows combined native acceptance is deferred until ICON-01, UX-02B/C and ACC-04. macOS/Linux native interaction **NOT RUN**. Tray, Show/Hide/Quit, Escape-to-hide, DPI/monitor positioning and OS focus were not exercised by browser checks. F4 startup and Unix forced-parent-death blockers, SEC-01 monitoring grants and SEC-02 credential lifecycle remain explicitly deferred. No merge or release is authorized.
