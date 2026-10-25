# UX-02B validation

Date: 25 October 2026. Baseline `b577eb66ff6159974d2335785538e990fe387105`. Final HEAD and exact-HEAD hosted results are recorded in the Draft PR so this document does not require a self-referential commit hash.

## Baseline and local quality

The specified combined post-merge [CI run 40183523313](https://github.com/wihlarkop/quotafern/actions/runs/40183523313) completed successfully: Frontend quality plus Windows, macOS and Linux desktop checks. The primary F3 checkout and all unrelated worktrees/branches were preserved; this change uses the managed `ux-02b-account-aware` worktree and `codex/ux-02b-account-aware` branch.

| Check                          | Observed result                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Bun 1.4.4 frozen install       | Passed; committed lockfiles unchanged                                                          |
| Baseline regression/build      | 13 groups / 1,001 assertions; production build passed                                          |
| `bun run lint`                 | Passed, no warnings                                                                            |
| `bun run fmt:check`            | Passed                                                                                         |
| `bun run check`                | Zero Svelte errors and warnings                                                                |
| `bun run regression`           | 15 groups / 1,202 assertions, zero failures; includes 183 UX-02B and 18 tab-capture assertions |
| `bun run build`                | Passed; compiled bundle smoke-tested below                                                     |
| `bun run fmt:rust`             | Passed                                                                                         |
| `bun run lint:rust`            | Passed, locked all-target Clippy with warnings denied                                          |
| `bun run check:rust`           | Passed, locked Windows package check                                                           |
| Impeccable mechanical detector | Empty finding list for changed UI targets                                                      |

No Rust implementation, native configuration, permissions, capability, IPC, CSP, ICON-01 asset, dependency, workflow or lockfile changed. Hosted CI supplies its normal synthetic Rust regression and desktop compilation; this slice does not claim new local native GUI coverage.

## Browser acceptance

Actual Chromium browser against the Svelte source UI at local Vite port 4175: **462 checks, zero failures**. [Machine-readable results](../evidence/ux-02b/browser-results.json) and the reproducible CLI function (archived visual removed) include measured panel dimensions, scroll heights and overflow checks.

- All four screens at 320/380/420px, 480/660px heights, light/dark and Graphite & Jade/Zinc & Signal: 96 screen/layout combinations. No horizontal document, panel or descendant content overflow; a single visible screen heading and usable scroll area.
- Details heading focus, exact source opener focus restoration and 84 daily grid cells at every main matrix configuration.
- Nine additional fixtures at 320 × 480 on Accounts and Overview: one account, two accounts, two keys, shared billing, errors/auth expiry, Unicode names, duplicates, removal pending and empty. Source filtering, duplicate accessible action names, provider scope and workspace scope checked separately.
- Personal → Work switching removes old Details/grid synchronously; Work values and identity stay independent. Focused activity text resets with the new account. ArrowRight moves to another date with exact date/token feedback.
- Runtime reduced-motion emulation disables content animation/transitions. System appearance follows light/dark media changes without reconnecting. Demo OFF has no synthetic account/source rows. Storage contains only existing appearance preferences. Browser interactions generated no external requests.

The final compiled `dist` bundle was served through a scratch Bun allowlist server on localhost port 4176: **80 additional checks, zero failures**. [Production results](../evidence/ux-02b/production-results.json) and check function (archived visual removed) verify disconnected startup, no development fixture selector, explicit Demo, independent account/source counts, 84-day grid, and no restored accounts/consent after reload. Forty-four semantic text/background token pairs across both palettes and modes meet **4.5:1** contrast. The final canonical after screenshots are from this compiled bundle.

Reproduce the source matrix with the existing `bun run dev --port 4175 --strictPort`, open a Bun-run Playwright CLI browser session and invoke `bun run scripts/run-ui-check.ts browser <session>`. After serving the compiled bundle at local port 4176, run `bun run scripts/run-ui-check.ts production <session>`. The default session name is `quotafern-ux02b-fix`. The Bun runner injects the shared typed helper into the CLI function context, navigates to the matching local server and saves the JSON results. Both functions use synthetic data only. The temporary static server and browser caches are excluded from the PR.

These checks verify semantic headings, labels, nested lists, meters, live context announcements, standard select/radio keyboard interaction, heatmap arrows and focus. An actual assistive-technology speech pass, OS text scaling and native screen-reader behavior remain pending; automated DOM semantics are not a speech-reader acceptance claim.

## Screenshot index

| Evidence                       | Files                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical production 380 × 660 | Overview (archived visual removed), Accounts (archived visual removed), Details (archived visual removed), Activity scrolled (archived visual removed), Settings (archived visual removed)                                                   |
| Production Demo OFF            | Overview (archived visual removed), Accounts (archived visual removed)                                                                                                                                                                       |
| Production expanded content    | Overview (archived visual removed), Accounts (archived visual removed), Details (archived visual removed). Only screenshot height/scroll containment temporarily expanded.                                                                   |
| Source UI, Jade light/dark     | `after-{overview,accounts,details}-jade-{light,dark}-380.png`                                                                                                                                                                                |
| Source UI, Signal light/dark   | `after-{overview,accounts,details}-signal-{light,dark}-380.png`                                                                                                                                                                              |
| Source UI, 320 × 480           | Unicode (archived visual removed), duplicates (archived visual removed), errors (archived visual removed), pending removal (archived visual removed), shared source (archived visual removed), Work reduced motion (archived visual removed) |

## Security and native limits

Both `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain unchanged. ACC-01 model/state/metadata/view ownership and lifecycle implementations are unchanged. There was no credential-file access, real authentication, provider read, app-server activation, polling addition, OAuth, secret storage, remembered activation, renderer-controlled native argument, or native process-containment change. No real Add/Remove/Rename/Disconnect implementation is introduced.

Owner Windows combined native acceptance is deferred until ICON-01, UX-02B/C and ACC-04. macOS/Linux native interaction **NOT RUN**. Tray, Show/Hide/Quit, Escape-to-hide, DPI/monitor positioning and OS focus were not exercised by browser checks. F4 startup and Unix forced-parent-death blockers, SEC-01 monitoring grants and SEC-02 credential lifecycle remain explicitly deferred. No merge or release is authorized.

## Final screenshot consistency follow-up

The [latest independent PR review](https://github.com/wihlarkop/quotafern/pull/10#pullrequestreview-5643755124) identified Overview images captured while Accounts still appeared highlighted. A frame-level browser probe on both source UI and compiled production confirmed **capture timing, not an active-tab state defect**. Immediately after the click, Overview had `aria-selected=true`, active data-state and correct `aria-controls`/`aria-labelledby` linkage to the single visible Usage overview panel. At that frame, the outgoing inactive Accounts background was still white and the incoming Overview background transparent, with running CSS transitions at time zero. After their real completion, Overview was white and Accounts transparent. [Recorded frame evidence](../evidence/ux-02b/tab-capture-diagnosis.json).

The shared `scripts/tab-capture.ts` helper waits for finite navigation/content animations through the Web Animations finished promises and a rendered frame. Before each capture it requires exactly one selected/active expected tab, one correctly linked visible active panel, the expected single heading, no unfinished transitions, the settled selected highlight, and no inactive tab retaining that highlight. Failure blocks screenshot creation. The two capture flows use this helper; no fixed sleep, animation disabling or screenshot recoloring is used. All post-change screenshots were regenerated through actual Chromium rendering; baseline before images remain historical.

The 18 deterministic tab-state regressions reject swapped/multiple/missing selections, mismatched active state, bad panel linkage/heading, unfinished transitions and stale highlights; valid Overview/Details and settled states pass. Total regression is now 1,202 assertions. Source/browser acceptance is now 462 checks and compiled-production acceptance 80 checks, including normal/reduced-motion transition settings. Source UI, CSS, native code/config, ownership contracts, both live gates, permissions, CSP and ICON-01 assets are byte-for-byte unchanged from the reviewed HEAD. Windows combined native acceptance remains deferred until UX-02C and ACC-04 finish; macOS/Linux native GUI acceptance remains NOT RUN.
