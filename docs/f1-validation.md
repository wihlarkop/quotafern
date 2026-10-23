# F1 validation — 2026-10-24

Implementation branch: `codex/f1-foundation`, based on initial main `bcdb5a5ed77cab644bfae898c2f793c8c6d62994`.
This is an evidence record, not owner approval or cross-platform manual acceptance.

## Local automated checks

Passed on Windows with Bun 1.4.4 and stable Rust 1.99.1:

```text
bun install --frozen-lockfile
bun run lint
bun run check
bun run fmt:check
bun run build
bun run fmt:rust
bun run check:rust
bun run lint:rust
bun run build:desktop --no-bundle --debug
bun .tmp/f1-regression.ts
git diff --check
```

The temporary, ignored post-implementation regression script checked exact 10/25 percent boundaries, zero/100 versus missing/non-finite/out-of-range values, all eight fixtures, presentation-safe account IDs, two named windows, timestamps, null resets, main-only command capability, and release CSP. It adds no committed unit suite or test framework. A Svelte source snippet piped into `bun --bun oxfmt --stdin-filepath=src/FormattingSmoke.svelte` confirmed actual Svelte formatting. Import sorting also ran on real sources; Tailwind sorting is disabled.

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

The unbundled executable started with the production frontend at `http://tauri.localhost/`. Its actual native WebView rendered the demo overview and Settings; the development-only fixture selector was absent. The restricted frontend hide command hid the popup while its host session remained alive. The native title-bar Close also hid the popup while the host remained alive.

A same-session two-process launch verified that the second process exited with code 0, the first stayed running, and only one popup was visible. Separate sandbox sessions are isolated and were not used as evidence of ordinary single-instance behavior. Test processes were stopped through their terminal sessions after checks.

## Security review and remaining gates

- Sole renderer command: `hide_popup`; generated command ACL plus capability restricted to local `main`, with a native label guard.
- No filesystem, shell, process, HTTP, credential-manager, or opener plugin is exposed. Single-instance is native only.
- Release CSP connects only to Tauri IPC; development separately adds loopback Vite/HMR. Inline styles support progress widths; scripts have no unsafe-inline/eval allowance.
- No real AI credential files, provider environment variables, sessions, or keychains were accessed during F1. No mock feature has a network call. No telemetry, external fonts, or remote assets.
- Source/config/fixture review found no embedded secrets. Lockfile networking crates are Tauri dependencies, not a provider client.

NOT RUN: tray-icon visual acceptance and tray-menu Show/Hide/Quit interaction (the automation could target the app window but could not reliably target the Windows notification area), macOS/Linux native interaction, live OS theme toggles, reduced-motion OS toggle, real multi-monitor/DPI variation, signed installers, and release packaging. The window retains OS positioning rather than using unverified tray coordinates. Native title-bar decoration is retained for an accessible fallback.

Hosted CI is configured for frontend quality plus Windows/macOS/Linux unbundled release compilation. Its current outcome must be read from the Draft PR checks, not inferred from this local record. CI compilation does not close manual tray acceptance gates.

F2 should close platform tray/display/accessibility acceptance and refine the read-only snapshot boundary. Real provider adapters, credentials/OAuth, refresh, widget, updater, account switching, and comprehensive unit suites remain separately scoped.
