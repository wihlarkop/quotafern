# F2 validation — 2026-10-24

Implementation branch: `codex/f2-native-tray-ux`, based on `origin/main` at `8313b6a7da65cee5fe89878a19ee19e9841657f2`.

This is the F2 evidence record. Static checks, compilation, and operating-system interaction are separate evidence types. A successful compile does not establish tray or display behavior. The Draft PR and final handoff pin the delivery SHA and hosted CI run; earlier runs never substitute for that HEAD.

The owner-reported Windows tray pass in [F1 validation](f1-validation.md) is pinned to F1 HEAD `3b3c05c12adc53b4d9543b0bee6f5b2cc2a0f516`; it does not establish behavior for the F2 build.

After the final focus-history and shared-monitor-boundary adjustments, all nine Rust regressions, Rust check/Clippy, formatting, and the unbundled desktop build were repeated successfully. The final rebuilt executable was launched again, its production Overview captured, and Escape verified to hide it while its host stayed alive. The broader Settings/X/relaunch/minimize interactions below used the preceding F2 build with identical handlers for those paths; actual tray behavior remains blocked on both candidates.

## Scope and regression contract

F2 keeps quota presentation synthetic and frontend-owned. Every demo snapshot identifies its source as `synthetic`; it adds no native quota model or snapshot IPC. The regression runner checks the exact eight demo fixtures and their safe presentation shape, then checks the checked-in Tauri window, main-only capability, permission allowlist, and release CSP. Those configuration assertions are static guards, not a runtime security audit.

The only persisted values remain the separate appearance mode (`system`, `light`, `dark`) and palette (`graphite-jade`, `zinc-signal`). Browser evidence should report their independent persistence, Escape dismissal, focus visibility, and honest loading/unknown states separately from native evidence.

## Automated checks

`bun run regression` passed on the integrated working tree: **7 groups passed, 0 failed, 585 assertions**. This includes the eight synthetic fixture root-identity checks and the static single-window, main-only permission, and release CSP guards. The static guards do not establish runtime tray, display, or complete security behavior.

Passed locally with Bun 1.4.4 and Rust 1.99.1 on Windows:

```text
bun install --frozen-lockfile
bun run regression
bun run lint
bun run fmt:check
bun run check
bun run build
bun run fmt:rust
bun run regression:rust
bun run check:rust
bun run lint:rust
bun run build:desktop --no-bundle --debug
git diff --check
```

The Rust regression command uses the built-in runner, with nine focused placement/focus cases rather than a new testing framework or coverage target. Cases include taskbar edges and a corner, negative monitor origins and a shared boundary, physical DPI dimensions, native window-frame subtraction, undersized work areas, unavailable geometry, and the tray-focus ordering allowance. These calculations do not prove native anchoring. CI runs this command on each existing desktop matrix OS. Both lockfiles and all dependency versions are unchanged. Sandbox-only incremental-cache hard-link fallback warnings occurred; Cargo copied files and completed. Bun's sandbox alias warning did not prevent Bun-only execution.

## Browser acceptance

PASS through actual Chrome interaction at the separate local Vite preview on port 1422 (the existing default-port server was left alone):

- All eight scenarios; healthy/low/critical/stale have six remaining-quota meters, unknown/auth/error have none, and empty has no invented accounts. Stale values remain visibly labeled stale.
- Actual popup widths 320, 380, and 420px at 480px height: no document horizontal overflow; unknown reset text fits; one content scroll region. Settings also exercised at 320 × 360; keyboard focus scrolls the fixture selector into view while the footer remains accessible.
- Both palettes in light/dark, System selected and resolved to the current light preference, and independent preference persistence across reload. Live OS theme switching and reduced-motion OS switching remain NOT RUN.
- Arrow-key tab navigation and a visible focus outline. Browser Escape reports honestly that it cannot hide a native window; Escape on the focused select leaves the select in control.
- Refresh visibly disabled with `aria-busy` and local loading text, then re-enabled with explicit no-provider-contact completion. Account rows remain Not connected.

The first attempt at a separate sandbox-local preview was unreachable from the browser; the normal-access preview succeeded. A later extra 280px browser check timed out and is NOT RUN; no pass is inferred below the required 320px viewport. Screenshot captures that lagged the current DOM were not used as evidence; settled replacements were captured and visually inspected. Local evidence is in ignored `.impeccable/review/f2/`, including `overview-380x660.png`, `unknown-420x480.png`, `settings-signal-dark-320x480.png`, and `native-windows-overview.png`. These are local artifacts, not hosted CI artifacts.

## Native and display acceptance

| Surface                                                                       | Status                                        | Evidence and limits                                                                                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows production WebView                                                    | PASS through interaction                      | Rebuilt unbundled executable rendered Overview and Settings at `http://tauri.localhost/`; Demo/Not connected remained visible; development fixture selector absent.        |
| Windows Escape / title-bar X                                                  | PASS through interaction                      | Both hid the popup (original window no longer usable by the UI harness), while the same host remained alive.                                                               |
| Windows single-instance restore                                               | PASS through interaction                      | Same-session repeated launches exited 0, retained one host, and restored the same native window ID after Escape and X. This does not count tray icons.                     |
| Windows minimize and restore                                                  | PASS through interaction                      | Actual title-bar Minimize followed by relaunch restored usable Settings at the previous full popup size; no 1px restore geometry.                                          |
| Windows primary tray click / secondary menu / Show / Hide / Quit / icon count | BLOCKED                                       | No targetable notification-area surface was returned by the harness. No tray click or menu action was invented. Test host cleanup used its exact PID, not Quit.            |
| macOS native interaction                                                      | NOT RUN                                       | No macOS desktop available; CI is compilation/regression evidence only.                                                                                                    |
| Linux tray-menu fallback                                                      | NOT RUN                                       | No Linux desktop interaction; menu path reviewed in source only.                                                                                                           |
| Tray anchoring / work-area clamping                                           | PASS static regression; OS acceptance NOT RUN | Native physical metadata is used where available. Math covers taskbar edges and negative origins; exact tray anchoring and alternate taskbar positions were not exercised. |
| DPI and monitor/display changes                                               | NOT RUN                                       | Windows 125/150/200%, monitor removal, negative-origin multi-monitor placement, and automatic work-area resizing still need owner interaction.                             |
| Packaging and signing                                                         | OUT OF SCOPE                                  | Do not infer packaged or signed behavior from unbundled development/debug runs.                                                                                            |

## Security boundaries

Focused source/config review confirmed one `main` window, one `hide_popup` renderer command and the existing main-only `allow-hide-popup` permission. There is no capability, permission, CSP, native command, dependency, or lockfile diff. Release CSP remains bundled content plus Tauri IPC; Vite/HMR allowances remain development-only. Only two appearance preference keys are persisted. No credential files, provider authentication state, provider APIs, OAuth, refresh, telemetry, or account synchronization were accessed or added. The native geometry model holds window coordinates only, not quota/provider state.

Independent review identified three P2 issues that were fixed before delivery: the document's 320px width floor conflicted with temporary smaller native constraints; a global recent-blur allowance could hide an unfocused popup; and minimized/zero-sized geometry needed exclusion from placement. The final focus regression narrows the allowance to a focused popup while the pointer is over its tray icon and consumes it once. A rapid keyboard app switch while hovering the tray remains a platform-acceptance risk. The lead also corrected half-open monitor containment at a shared monitor boundary and added the boundary case to regression.

## Historical owner acceptance request

On the final PR executable, inspect one persistent icon; primary-click hidden/focused/unfocused states; secondary-click Show Quotafern, Hide Quotafern, and Quit; X then Show; relaunch; process termination and icon removal after Quit. Repeat the context-menu path on Linux and primary/menu paths on macOS. Keep Settings open while clicking away and interacting with native controls. Test rapid app switching while hovering the icon, each supported taskbar edge, 125/150/200% Windows scaling, small work areas, monitor removal, and restoration after display changes. Switch the actual OS light/dark and reduced-motion settings. Record PASS/FAIL per interaction and OS; packaging and signing stay excluded.

## Smallest F3 recommendation (design only)

Scope one read-only provider adapter with explicit owner-authorized app-owned authentication, a separately discriminated sanitized live snapshot, honest unavailable/stale/error states, and no demo fallback. Review authentication and endpoint choices before implementing; external CLI credential discovery remains outside this recommendation.

## Subsequent owner-reported Windows acceptance

The owner reported **10/10 PASS** for final F2 source HEAD `51c97c67527391e5e8d141d571b7727d979facef`, subsequently squash-merged as `61333d4069ddd15cb296a53c1b97cc90d7819042` in PR #2. This is owner-reported manual evidence, separate from the Codex automation above.

Reported passes cover primary-click open/toggle, focus restoration, right-click Show/Hide/Quit, Escape and X-to-hide, Quit cleanup, single-instance behavior, correct monitor/tray-area placement, rapid Alt+Tab while hovering the tray, and available screen-scaling behavior. The original automation BLOCKED and NOT RUN entries remain historical evidence and have not been rewritten as automated passes.

This report does not establish additional monitors, other Windows configurations, macOS, or Linux behavior. F3 changes require their own acceptance; the F2 report is not an F3 runtime pass.
