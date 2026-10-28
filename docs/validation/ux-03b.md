# UX-03B — final usability polish

Continuation of Draft PR #20 on `codex/ux-03-accounts-polish`, from `1f3ce659a6aff771ba88868c6cf5694f94a3bb12`. Verified 2026-10-29 (Asia/Jakarta). Owner Windows acceptance is still pending below.

## Four improvements

1. **Add account:** fixed Codex label when it is the sole available provider, native radio choices for existing/another login, optional name and Continue. Routine character-limit/help paragraphs are removed; validation remains. The catalogue-driven selector accommodates separately implemented providers; none is enabled by this change. Cancel creates no account or authorization. Continue still saves one local account, closes the management modal, then requests the existing native Svelte consent.
2. **Settings:** Appearance first; More settings holds Demo, development controls, compact motion information and privacy/storage explanations. Successful changes have nonvisual accessible feedback; storage failures stay visible. Manage accounts replaces the redundant account-preferences explanation. Demo's warning explicitly states that enabling it disconnects all Codex accounts and removes remembered monitoring permission. Existing disconnect/revocation behavior is preserved; failed cleanup refuses Demo and resets its checkbox. Leaving Demo never reconnects.
3. **Account selector:** main native grouped selector contains All accounts and aliases by provider. Advanced filters retain provider/workspace/connection contexts with short labels. Duplicate, literal-colliding and reserved aliases remain distinguishable; routing stays ID-based. An advanced selection has a distinct caption so its parent account can clear the filter in one choice. Collapsing the disclosure never clears selection. Missing owners remain unavailable or safely fall back to All, never another account by position/name.
4. **View quota:** account names are plain headings. One View quota action per account opens its Overview, including disconnected accounts. Accounts does not acquire a quota renderer; source Details remains reachable from Overview. Back restores Accounts scroll and exact opener focus. Empty quota contexts offer Manage accounts, without synthetic fallback or unrelated readings.

## Before/after evidence

All captures use isolated fake Tauri IPC and synthetic values. “Codex live” chrome is fixture-driven, not real authentication. Images capture the actual window-sized viewport, not the full page. Before captures use the exact baseline above.

| Area                   | Before                                                            | After, source                                                  | After, bundled production                                          |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Add, 380×660           | [Before](../evidence/ux-03b/before-add.png)                       | [Existing login](../evidence/ux-03b/source-add-380-light.png)  | [Existing login](../evidence/ux-03b/production-add-380-light.png)  |
| Add, 320×660 dark      | —                                                                 | [Another account](../evidence/ux-03b/source-add-320-dark.png)  | [Another account](../evidence/ux-03b/production-add-320-dark.png)  |
| Settings, 380×660      | [Before](../evidence/ux-03b/before-settings.png)                  | [Light](../evidence/ux-03b/source-settings-light.png)          | [Light](../evidence/ux-03b/production-settings-light.png)          |
| Settings, 320×660 dark | —                                                                 | [Dark](../evidence/ux-03b/source-settings-dark.png)            | [Dark](../evidence/ux-03b/production-settings-dark.png)            |
| Selector               | [Before, 380px](../evidence/ux-03b/before-selector.png)           | [Grouped, 320px](../evidence/ux-03b/source-selector-three.png) | [Grouped, 320px](../evidence/ux-03b/production-selector-three.png) |
| View quota, 380×660    | [Source Details before](../evidence/ux-03b/before-view-quota.png) | [Account Overview](../evidence/ux-03b/source-view-quota.png)   | [Account Overview](../evidence/ux-03b/production-view-quota.png)   |

Add is visibly shorter, and Continue fits both widths. Default Settings fits without scrolling to Appearance. The primary selector avoids repeated provider/account/workspace/connection paths. Themes, typography, icons, navigation and the existing component library remain intact.

Additional captures for the Demo warning, 1/24 accounts, long aliases, advanced contexts, disconnected/auth-required/reconnect-required/stale states and source details are in ignored `.tmp/qa/screenshots/ux-03b/`; exact paths appear in the result JSON. Historical UX-03 evidence is unchanged. Native dropdowns use browser/OS scrolling and sizing. Browser keyboard access and 1/3/24-account captures passed; actual Tauri/Windows popup bounds and screen-reader behavior require owner acceptance.

## Verification

| Command/check                | Result                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `bun run check`              | 0 errors, 0 warnings                                                               |
| `bun run lint`               | Pass                                                                               |
| `bun run fmt:check`          | Pass after moving task-generated CLI snapshots to ignored scratch                  |
| `bun run regression`         | **20 groups / 2308 assertions**, 0 failures                                        |
| `bun run build`              | Pass, including isolated consent entry                                             |
| `bun run qa:ux03 source`     | **119 checks**, 0 failures — [results](../evidence/ux-03b/source-results.json)     |
| `bun run qa:ux03 production` | **117 checks**, 0 failures — [results](../evidence/ux-03b/production-results.json) |
| Mechanical UI scan           | No findings (`[]`)                                                                 |
| Independent review           | GPT-6 Luna High: one P2, fixed — [disposition](../reviews/ux-03b.md)               |

Coverage includes exact ID/scope projections, distinguishable labels, current/stale/auth/error states, cleanup-before-remove, Add radios/default names/cancellation, modal closure before native consent, 1/3/24-account keyboard selection, advanced context/parent recovery, focus/scroll return, appearance persistence/storage failure, Demo cleanup failure/no silent reconnect, synthetic/live isolation and isolated consent challenge calls. Source adds two development-only shared-source assertions. Every browser context blocks HTTP outside loopback; no external requests were observed. No TDD or standalone unit suite was introduced. Reproduction: [QA README](../../qa/README.md#ux-03b-current).

No Rust files, permissions, CSP, native consent/challenges/grants, adapters, polling/cooldown, pinning, Remote Control rules, credential handling or live gates changed. Rust checks were not rerun locally. No storage codec, dependency, lockfile, build/performance configuration, PERF-01 branch/profiling work or Claude Code work changed. The optional provider catalogue setup flag is not part of persisted metadata and grants no native authority.

## Owner Windows acceptance checklist — not run by developer

- [ ] At 380×660 and 320px width, test both login choices and light/dark themes. Continue stays reachable and name placeholders make sense. Add Cancel/Escape creates no record or authorization; rapid Continue creates only one record.
- [ ] Continue closes the management modal before isolated native consent appears. Cancel there keeps the new local account disconnected with no grant. Approve real existing/managed accounts yourself if desired; the System login stays unchanged and aliases never establish identity.
- [ ] Appearance is first and fits Settings. Exercise System/Light/Dark, both palettes, keyboard focus and persistence. Inspect More settings and the Demo warning before enabling it.
- [ ] If intentionally enabling Demo, verify monitoring stops and remembered permission is revoked. Turning Demo off/relaunching must not silently restore revoked access. Reconnect manually through native consent when ready.
- [ ] With 1, 3 and many accounts, inspect native dropdown bounds/scrolling, Arrow/Home/End/Enter/Escape, screen-reader names, duplicate and long aliases. Default choices remain account-first. Advanced provider/workspace/connection filters work; choosing the parent account clears an advanced filter in one choice. Removing its owner never selects an unrelated account.
- [ ] View quota opens Overview for exactly that account. Exercise connected/disconnected/stale/auth-required/error, confirmed zero versus missing fields, and shared-source deduplication. Overview → Details → Back stays in context; Overview → Back restores Accounts scroll/focus.
- [ ] Confirm existing auto-reconnect, Refresh/cooldown, Disconnect/Reconnect and owner-managed sign-in behavior. Browser simulation does not prove native modal focus, credentials, subprocess cleanup, tray behavior or OS accessibility.

Hosted exact-head CI is reported in Draft PR #20 and delivery. This task stops at owner review; no merge, tag or release.
