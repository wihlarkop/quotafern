# UX-03C — direct account quota details

Continues Draft PR #20 on `codex/ux-03-accounts-polish`, from `e2307da2dee61a79031aaea49da9d8a788048724`. Verified 2026-10-29 (Asia/Jakarta).

## Behavior

Accounts → View quota now opens focused account details immediately when exactly one eligible source exists. The account alias is the page title. Account/Advanced selectors and the extra View details action are absent. The view reuses SourceReadings for reported quota, reset, plan, credits and other available measures; absent live fields stay absent. Connection lifecycle and data freshness remain separate. Technical diagnostics/identity text is optional under Connection details, including in failure states. Meaningful association warnings stay visible; shared sources appear once.

Several eligible sources produce an account-only source chooser. Explicit selection is validated against current candidates and pinned by source ID. A vanished selected source stays unavailable even if another source exists for the same account; it never falls through to All or another account. Zero sources/disconnected accounts show accurate recovery text. Eligibility requires matching account ownership, current association generations and at least one connected observer.

Focused navigation is transient and independent from normal Overview selection. Back goes directly to Accounts and restores the saved scroll/opener focus. Normal Overview activation by mouse or keyboard clears focused mode, retaining its All/account/advanced controls and prior filter. Workspace navigation from Accounts keeps the normal advanced-context route. Neither navigation nor source choice initiates provider access.

## Window-sized evidence

All screenshots use fake IPC/synthetic data, including screens with “Codex live” chrome. No real account or credential was accessed. Before is the [UX-03B 380×660 account Overview](../evidence/ux-03b/production-view-quota.png) at the baseline above.

| View                         | Source                                                           | Bundled production                                                   |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Focused quota, 380×660 light | [Capture](../evidence/ux-03c/source-focused-light.png)           | [Capture](../evidence/ux-03c/production-focused-light.png)           |
| Focused quota, 320×660 dark  | [Capture](../evidence/ux-03c/source-focused-320-dark.png)        | [Capture](../evidence/ux-03c/production-focused-320-dark.png)        |
| Multiple sources, 320px      | [Chooser](../evidence/ux-03c/source-focused-chooser.png)         | [Chooser](../evidence/ux-03c/production-focused-chooser.png)         |
| Selected source disappears   | [Unavailable](../evidence/ux-03c/source-focused-unavailable.png) | [Unavailable](../evidence/ux-03c/production-focused-unavailable.png) |

The title, quota and Back fit at 320px without horizontal overflow. Additional existing-flow captures are temporary under `.tmp/qa/screenshots/ux-03c/`; the result JSON records exact paths. Earlier UX-03/B evidence is preserved.

## Verification

| Check                        | Result                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `bun run check`              | 0 errors, 0 warnings                                                               |
| `bun run lint`               | Pass                                                                               |
| `bun run fmt:check`          | Pass after moving task-owned CLI snapshots to ignored scratch                      |
| `bun run regression`         | **20 groups / 2327 assertions**, 0 failures                                        |
| `bun run build`              | Pass, both app and isolated consent entries                                        |
| `bun run qa:ux03 source`     | **139 checks**, 0 failures — [results](../evidence/ux-03c/source-results.json)     |
| `bun run qa:ux03 production` | **135 checks**, 0 failures — [results](../evidence/ux-03c/production-results.json) |
| Mechanical UI scan           | No findings (`[]`)                                                                 |
| Independent Luna High review | No actionable findings — [review](../reviews/ux-03c.md)                            |

Nineteen focused-navigation assertions were added to the existing regression: single/multiple/zero sources, explicit/stale chooser actions, source/owner removal, generation mismatch, disconnected runtime, stale-versus-connected state, live/synthetic separation, shared-source deduplication, retained normal selection and no account/lifecycle mutation. No TDD or standalone unit suite was introduced.

Browser checks cover alias heading/focus, direct reported zero/plan/quota, no selectors/redundant details step, optional diagnostics, one source only, direct Back and exact Accounts scroll/focus, normal Overview with prior account selection by mouse/keyboard, disconnected recovery, 320px light/dark, source disappearance via synthetic auth failure while other accounts remain, multiple-source chooser and explicit choice, association warnings and shared-source direct entry. Existing Add/Settings/advanced-context/consent checks remain included. Source has four additional development-only shared-source assertions. HTTP outside loopback is blocked; no external requests were observed.

No native security/consent/credentials/authorization/polling or gate changes; no Rust, permissions, CSP, storage schema, dependency, lockfile, build/performance configuration or PERF-01 changes. Rust checks were not rerun locally. Hosted exact-head CI is reported in Draft PR #20 and delivery.

## Owner Windows checks — pending

- [ ] With one eligible live source, View quota opens the named account's details directly, with no selector or View details step. Verify reported reset/plan/remaining fields, including zero and absent values, at 380px and 320px in both themes.
- [ ] Back returns straight to Accounts at the previous scroll/focus. Activate normal Overview by mouse and keyboard; confirm All accounts, saved transient account/advanced selection and Advanced filters remain available.
- [ ] Exercise disconnected, stale, sign-in-required and error cases without another account's values. Inspect optional technical diagnostics. If a selected source/account disappears, the view stays unavailable.
- [ ] For an account with several eligible sources, choose explicitly; Back still returns directly to Accounts. A shared source should open once, not once per observing connection.

These browser simulations do not establish real authenticated access, native focus/modality, OS screen-reader or tray behavior. Existing native implementation and consent boundaries remain unchanged. No merge, tag or release.
