# UX-02A validation record

Date: 25 October 2026. Base: `87ce072f95300d362a08c15b8852e7c8d51272cf`. Exact delivered HEAD and hosted run are recorded in the Draft PR to avoid a self-referential documentation commit.

## Baseline

[Post-merge CI 40125757415](https://github.com/wihlarkop/quotafern/actions/runs/40125757415) was verified against the exact requested base SHA. All four jobs succeeded: Frontend quality, Windows, macOS and Ubuntu desktop checks. Implementation began only after that confirmation.

The primary checkout on `codex/f3-codex-quota`, ACC-01 worktree and UX-01 worktree were preserved. Work occurs on isolated `codex/ux-02a-soft-native`.

## Local automated checks

| Check                          | Actual result                                                             |
| ------------------------------ | ------------------------------------------------------------------------- |
| Bun 1.4.4 frozen install       | PASS, committed lockfile unchanged                                        |
| `bun run check`                | PASS, 0 Svelte errors/warnings                                            |
| `bun run lint`                 | PASS, Oxlint with denied warnings                                         |
| `bun run fmt:check`            | PASS, Oxfmt                                                               |
| `bun run regression`           | PASS, 12 groups / 827 assertions, including security, Activity and ACC-01 |
| `bun run build`                | PASS, production frontend compiled                                        |
| `bun run fmt:rust`             | PASS                                                                      |
| `bun run check:rust`           | PASS, locked Windows check                                                |
| `bun run lint:rust`            | PASS, all targets / denied warnings                                       |
| `bun run regression:rust`      | PASS, 55 passed / 4 ignored fixture-only entries / 0 failed               |
| Impeccable mechanical detector | No findings for changed CSS/Svelte targets                                |
| `git diff --check`             | PASS                                                                      |

Rust regressions use only existing isolated fake processes/protocol fixtures. No real Codex app-server, provider read or credentials were accessed. Unbundled desktop compilation on all three OSes is covered by the hosted workflow; local browser captures are not native acceptance.

## Browser evidence

Actual browser captures were taken from the production Svelte application served locally at `127.0.0.1:1426` by Vite. Baseline captures preceded edits. “Production UI” here means the actual application components, not the isolated UX-01 prototype; captures are not release-WebView renders.

[48-case matrix](browser-matrix.json): four screens (explicit Demo Overview, Accounts, Settings, Details) × three widths (320/380/420) × two palettes × two appearances, all at 480px height. **No measured document or panel horizontal overflow; no descendants outside horizontal viewport bounds.** Each content panel retained 347px of vertical space and vertical scrolling.

[9 disconnected cases](disconnected-matrix.json): Overview, Accounts and Details at all three widths, 480px height, Zinc & Signal / system-resolved light. No measured horizontal overflow.

| Check                           | Evidence / limit                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 380×660 before/after            | Comparable Demo and disconnected captures below                                                                                                                        |
| 320/380/420 short height        | Demo captures and measurements below, all 480px high                                                                                                                   |
| Graphite & Jade / Zinc & Signal | Light/dark actual captures; selection applied through Settings                                                                                                         |
| System appearance               | System radio selected; resolved light matched current browser media query. Live light↔dark media switching NOT RUN                                                     |
| Details focus                   | Opening focused `codex-details-title`; Back restored `data-testid=open-codex-details`                                                                                  |
| Activity                        | 84 date cells visible in accessibility tree; unknown and confirmed-zero remain distinct; first-cell ArrowRight moved focus and exact-date text; 320px screenshot below |
| Reduced motion                  | Source rules disable animation/transition/press translation. Runtime media emulation NOT RUN                                                                           |
| Full keyboard / Escape          | Existing logic preserved; full traversal, native select Escape and native popup hide NOT RUN                                                                           |
| Unsupported providers           | Actual disconnected Accounts capture retains Coming Soon labels and closed Codex disclosure                                                                            |
| Other demo fixtures             | Existing eight-fixture regression passes; browser error/stale/auth/empty/scenario-switching NOT RUN                                                                    |
| Screen reader / 200% zoom       | NOT RUN                                                                                                                                                                |
| Native GUI                      | Windows/macOS/Linux UX-02A tray/focus/hide/show/close/resize/DPI/monitor acceptance NOT RUN                                                                            |

Computer Use stopped when it could not determine the active Windows browser URL with enough confidence to enforce its policy. No attempt was made to bypass the block or change OS preferences. It prevented reduced-motion emulation, live system-theme switching, remaining keyboard scenarios and browser cleanup. The last in-app viewport override (420×480) could not be reset. Saved captures/measurements remain valid for the states exercised.

## Screenshot index

| Capture                           | Before                                                    | After                                                            |
| --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Demo, 380×660, jade/light         | [Before](screenshots/before-demo-380.jpg)                 | [After](screenshots/after-demo-380.jpg)                          |
| Disconnected, 380×660, jade/light | [Before](screenshots/before-disconnected-380.jpg)         | [After](screenshots/after-disconnected-380.jpg)                  |
| Settings, 380×660                 | [Before, jade/light](screenshots/before-settings-380.jpg) | [After, zinc/dark](screenshots/after-settings-zinc-dark-380.jpg) |

| Responsive / palette evidence  | Capture                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Demo, 320×480                  | [Narrow](screenshots/after-demo-320-short.jpg)                                                                          |
| Demo, 380×480                  | [Default short](screenshots/after-demo-380-short.jpg)                                                                   |
| Demo, 420×480                  | [Wide short](screenshots/after-demo-420-short.jpg)                                                                      |
| Details, 320×480               | [Details entry](screenshots/after-details-320-short.jpg)                                                                |
| Activity, 320×480              | [Calendar and keyboard focus](screenshots/after-activity-320-short.jpg)                                                 |
| Disconnected Accounts, 320×480 | [Gates and catalog](screenshots/after-accounts-disconnected-320.jpg)                                                    |
| Demo jade, 380×480             | [Light](screenshots/after-demo-graphite-jade-light-380.jpg) / [Dark](screenshots/after-demo-graphite-jade-dark-380.jpg) |
| Demo zinc, 380×480             | [Light](screenshots/after-demo-zinc-signal-light-380.jpg) / [Dark](screenshots/after-demo-zinc-signal-dark-380.jpg)     |

Additional Settings captures at 420×480 are scrolled to appearance controls and live in screenshots/. They are not full-content renders.

## Accessibility observations

Semantic text token pairs against base/raised/inset/selected surfaces and status ink/wash pairs were calculated directly from the authored colors. Minimum tested static text contrast was **4.55:1**; minimum focus-token contrast against tested surfaces was **4.18:1**. These are token measurements, not browser compositing or whole-application WCAG certification.

The focus outline is 2px with 3px offset; tab panels use an inset offset to avoid clipping. Appearance radios retain their visible proxy focus. Selection remains visible without animation or color alone through active surfaces, labels and checked/pressed states. The [independent Luna High review](review.md) found no Critical/Important issues and noted small Activity pointer targets at 320px; touch-specific acceptance remains pending.

## Security and hosted evidence

Source scope leaves Rust, CSP, Tauri IPC/capabilities, provider contracts, locks/dependencies and production icons unchanged. Both live gates stay false. No new polling, persistence, automatic connection, credential flow, provider access or process lifecycle was introduced. SEC-01/SEC-02 and F4 startup/Unix parent-death blockers stay deferred.

Hosted four-job status is recorded with the exact HEAD in the Draft PR. A passing compilation does not close any native GUI acceptance item above. No merge, release or deployment occurred.
