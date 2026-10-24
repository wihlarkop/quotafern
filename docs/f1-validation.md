# F1 validation — 2026-10-24

Implementation branch: `codex/f1-foundation`, based on initial main `bcdb5a5ed77cab644bfae898c2f793c8c6d62994`.
This is an evidence record, not owner approval or cross-platform manual acceptance.

Hardening implementation HEAD: `e97b2c19d2b06a93df14a2d1ecf13d93d4efebfa`. This pins the regression code and the Windows runtime candidate; the documentation-only follow-up has its own delivery SHA. The exact final PR head, workflow run, and post-push results are recorded in the [Draft PR description](https://github.com/wihlarkop/quotafern/pull/1). F1 is **not fully accepted** while the Windows tray gate below remains blocked.

## Local automated checks

Passed on Windows with Bun 1.4.4 and stable Rust 1.99.1:

```text
bun install --frozen-lockfile
bun run dev:desktop
bun run lint
bun run check
bun run fmt:check
bun run build
bun run fmt:rust
bun run check:rust
bun run lint:rust
bun run build:desktop --no-bundle --debug
bun run regression
git diff --check
```

The original ignored `.tmp/f1-regression.ts` is superseded by committed `scripts/regression.ts`, invoked with `bun run regression` and run after the frontend build in CI. The hardening pass reran every command above except the already-exercised development launcher; the frozen install, regression, lint, format check, Svelte/TypeScript check, production frontend build, Rust format/check/Clippy, and unbundled Windows debug build all passed. Both lockfiles and dependency versions are unchanged.

The runner reports **7 groups passed, 0 failed, 577 assertions**. It covers null, NaN, both infinities, out-of-range values, valid zero/100, exact 10/25 boundaries, fractional formatting, and an explicit 82%-remaining example; the exact eight scenarios, provider/window counts and names, distinct bands/statuses, safe synthetic IDs, nested presentation-property allowlists, ISO timestamps, and null unknown resets. A minimal optional `nowMs` argument controls fetched/reset timestamps; repeated snapshots at a fixed time must match. The default clock is bounded by timestamps immediately around the call. Structured JSON guards restrict the single main window/capability and every release CSP directive; token order and whitespace are ignored. These are configuration guards, not native-runtime or complete security audits.

All groups await their assertions before reporting success, including asynchronous configuration reads. A temporary healthy fixture mutation from `82` to `-1` made the complete CLI exit **1** with two failing groups. The source bytes were restored in a `finally` block; the immediate normal run exited **0**, and two final runs matched at 577 assertions. A permanent in-memory negative control also adds a shell permission, confirms rejection, then restores the parsed fixture. No deliberately failing file or additional framework is committed.

A Svelte source snippet piped into `bun --bun oxfmt --stdin-filepath=src/FormattingSmoke.svelte` previously confirmed actual Svelte formatting. Import sorting also ran on real sources; Tailwind sorting is disabled.

TypeScript 7.0.2 was rejected by svelte-check's default workflow. TypeScript 6.0.3 is pinned because it is supported without an experimental dual-version setup. The deprecated `lucide-svelte` package was replaced by official `@lucide/svelte`. Direct icon imports reduced the build from 4,757 to 706 transformed modules. The final Svelte check reported zero errors and warnings. Rust checks in the sandbox reported incremental-cache hard-link fallback warnings but completed successfully, including Clippy with warnings denied.

## Browser acceptance

Exercised the running `bun run dev` preview through real browser controls:

- Overview, Accounts, Settings; all three providers visibly synthetic and not connected.
- Both palettes in light and dark; appearance and palette persist across reload independently.
- System mode resolved to the browser's current light preference; registered change-listener behavior was reviewed in source.
- Arrow-key tab navigation; local Refresh disabled/loading state followed by honest local-only completion.
- Healthy, low, critical, unknown, offline/stale, authentication-required, error, and empty fixtures. Unknown/auth/error have no invented quota meters; healthy/stale have six named-window meters.
- 380 × 660 and minimum 320 × 480 layouts. The reviewer found clipped unknown-reset labels at 320px; the responsive fix was recaptured and scored resolved. All six reset labels now fit without horizontal overflow.

Local screenshots live in ignored `.impeccable/review/`; they are not CI artifacts. The first full-page screenshot export was blank and was discarded as evidence. The replacement captures use the actual rendered viewport and were reopened for validation.

## Windows runtime

`bun run dev:desktop` also started Vite, compiled the native host, and rendered the development WebView at `http://127.0.0.1:1420/` under the separate development CSP. Vite ignores `src-tauri/**` so generated Rust assets do not trigger frontend reloads. The restricted sandbox initially prevented the CLI's loopback readiness probe; the normal-access launch succeeded.

The unbundled executable started with the production frontend at `http://tauri.localhost/`. Its actual native WebView rendered the demo overview and Settings; the development-only fixture selector was absent. The restricted frontend hide command hid the popup while its host session remained alive. The native title-bar Close also hid the popup while the host remained alive.

A same-session two-process launch verified that the second process exited with code 0, the first stayed running, and only one popup was visible. Separate sandbox sessions are isolated and were not used as evidence of ordinary single-instance behavior. Test processes were stopped through their terminal sessions after checks.

### Hardening acceptance on the rebuilt Windows executable

| Check                      | Result                          | Evidence and limits                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and usable popup   | PASS                            | Actual bundled WebView at `http://tauri.localhost/`; Overview and Accounts interacted with; Demo and Not connected labels remained visible. This does not count tray icons.                                                               |
| Tray Show                  | BLOCKED                         | No targetable Windows notification-area or taskbar surface. Handler reviewed in source only.                                                                                                                                              |
| Tray Hide                  | BLOCKED                         | No actual tray-menu click was performed.                                                                                                                                                                                                  |
| Tray Quit                  | BLOCKED                         | No actual tray-menu click was performed.                                                                                                                                                                                                  |
| Title-bar close-to-hide    | PASS                            | Clicked the real title-bar X; the window disappeared while the original host remained alive.                                                                                                                                              |
| Single-instance / relaunch | PASS                            | Same parent session: second launch exited 0, first host stayed alive; after close, another launch exited 0 and restored the same window ID `3145804`. The restored popup accepted another tab interaction. Icon uniqueness is unverified. |
| Process exit through Quit  | NOT RUN                         | Tray Quit is blocked. Terminal cleanup intentionally stopped the test host and is not Quit evidence.                                                                                                                                      |
| Tray icon removal          | BLOCKED                         | The notification area could not be observed or targeted.                                                                                                                                                                                  |
| Runtime safety             | PASS for exercised interactions | No crash/error dialog observed; synthetic labeling remained clear. No packet capture was run; provider-call absence is supported by source review and restrictive release CSP.                                                            |

The automation inventory exposed the Quotafern window, Chrome, and Codex, but no notification-area/taskbar target; File Explorer had no targetable window. The permitted window-scoped API therefore could not locate or operate the actual tray icon. No renderer capability, Windows setting, or application security boundary was broadened to work around this. Local startup evidence is saved at ignored `.impeccable/review/hardening-windows-startup.jpg` and was visually inspected. It is window evidence only, not tray acceptance.

Owner steps to close the tray gate:

1. Run `bun run build:desktop --no-bundle --debug`, then launch `src-tauri/target/debug/quotafern.exe`. Locate the Quotafern fern icon in the notification area or its overflow and confirm one icon.
2. Open that icon's context menu. Select Hide, then reopen the same menu and select Show. Close the popup with the title-bar X, confirm the host stays alive, then restore with tray Show.
3. Select Quit from the real tray menu. Confirm the host exits, the window is unavailable, and the tray icon disappears.
4. Relaunch twice normally; confirm one persistent host and one tray icon, use the popup, then Quit through the tray again.

## Security review and remaining gates

- Sole renderer command: `hide_popup`; generated command ACL plus capability restricted to local `main`, with a native label guard.
- No filesystem, shell, process, HTTP, credential-manager, or opener plugin is exposed. Single-instance is native only.
- Release CSP connects only to Tauri IPC; development separately adds loopback Vite/HMR. Inline styles support progress widths; scripts have no unsafe-inline/eval allowance.
- No real AI credential files, provider environment variables, sessions, or keychains were accessed during F1. No mock feature has a network call. No telemetry, external fonts, or remote assets.
- Source/config/fixture review found no embedded secrets. Lockfile networking crates are Tauri dependencies, not a provider client.

The focused hardening review rechecked the complete PR source and regression diff: main-only capability/ACL and native label guard, native Show/Hide/Quit handlers, single-instance callback, release versus development CSP, the one frontend `hide_popup` invocation, two appearance-only localStorage keys, synthetic snapshot property allowlists, tracked files, and direct dependency footprint. No production security defect was identified and no native permission or dependency changed. A regression-runner review defect (unawaited asynchronous checks) was corrected before delivery, along with missing scenario-band assertions. No credentials were accessed and no provider request or telemetry feature was introduced. Transitive all-target dependency-tree inspection was not completed because an offline Android dependency was uncached; Windows compilation and the hosted desktop matrix are separate evidence.

NOT RUN: tray-icon visual acceptance and tray-menu Show/Hide/Quit interaction (the automation could target the app window but could not reliably target the Windows notification area), macOS/Linux native interaction, live OS theme toggles, reduced-motion OS toggle, real multi-monitor/DPI variation, signed installers, and release packaging. The window retains OS positioning rather than using unverified tray coordinates. Native title-bar decoration is retained for an accessible fallback.

## Hosted CI provenance

The previously pending foundation [run 40041741023](https://github.com/wihlarkop/quotafern/actions/runs/40041741023), at exact HEAD `5b9ce3b5a984c2e2463d87a794967ef4b8cc86cd`, was refreshed during hardening: Frontend quality, Windows desktop, macOS desktop, and Ubuntu desktop all finished **successfully**. This is historical evidence only.

The new implementation triggered [run 40043046025](https://github.com/wihlarkop/quotafern/actions/runs/40043046025) at `e97b2c19d2b06a93df14a2d1ecf13d93d4efebfa`. Frontend quality, including the committed regression command, passed; desktop jobs were still running when this record was prepared. The documentation follow-up triggers another final-head run.

Final-head CI results are published at the [current PR check results](https://github.com/wihlarkop/quotafern/pull/1/checks): **Frontend quality**, **Desktop checks (windows-latest)**, **Desktop checks (macos-latest)**, and **Desktop checks (ubuntu-22.04)**. The post-push PR description and handoff pin the final delivery SHA/run and report each actual result. Pending jobs are not counted as passes, and no earlier run substitutes for the final head. CI compilation does not close the blocked manual tray gate or establish macOS/Linux native interaction.

F2 should close platform tray/display/accessibility acceptance and refine the read-only snapshot boundary. Real provider adapters, credentials/OAuth, refresh, widget, updater, account switching, and comprehensive unit suites remain separately scoped.
