# Quotafern

Quotafern is a compact local-first system-tray app for remaining AI subscription quotas. F3 adds a Codex bridge foundation, but **live connection is disabled in this build** until Codex exposes a documented safe startup policy. No account or credential is accessed by opening the app.

## Codex connection status

Overview starts disconnected. Accounts explains the intended **Connect existing Codex session** permission and the current blocker. Codex app-server can restore a saved Remote Control setting even in stdio mode; Quotafern will not start it while that startup policy is unresolved. Installing or signing in to Codex does not bypass this gate. See [the integration decision](docs/codex-integration.md).

Once a separately reviewed change enables it, the intended flow is Accounts → read the consent disclosure → Connect. Codex manages its own login and may refresh/save its credentials or enforce login/workspace restrictions. Quotafern never asks for a secret, starts an agent turn, or logs out the CLI. Disconnect stops Quotafern's monitor. F3 does not remember connection consent, store quota history, or auto-refresh provider data.

For credential-free examples, enable **Demo preview** in Settings. Every synthetic view is labeled Demo and stays separate from live state; release builds use the healthy demo fixture, and development offers all eight scenarios. Failed live requests never use demo values. [F3 validation](docs/f3-validation.md) separates mock evidence, UI acceptance, and authenticated behavior.

The local fern icon is provisional artwork. Desktop icon sizes are checked in under `src-tauri/icons/`; no remote assets are loaded.

## F2 behavior

- The `main` window opens visibly at 380 × 660 on first launch, near the tray when native geometry is available and safely clamped otherwise. It can be resized to 320–420 logical pixels wide and a configured minimum of 480 pixels high; smaller work areas temporarily relax those limits. Close and Escape hide it. The tray menu provides **Show Quotafern**, **Hide Quotafern**, and **Quit**.
- On Windows/macOS, primary tray click opens, focuses, or toggles the popup; secondary click opens its menu. Native tray geometry positions the popup near the icon when available, with work-area clamping and a safe fallback. Losing focus leaves Settings and account inspection open.
- A second launch routes to the already-running app. On Linux, use the tray context menu; left-click tray events are not supported by the current Linux tray integration.
- F1/F2 quota data were synthetic only. F3 preserves those fixtures behind the explicit Demo preview flow, with no implicit fallback.
- Appearance mode (`system`, `light`, or `dark`) and palette (Graphite & Jade or Zinc & Signal) are separate, non-sensitive preferences stored in `localStorage`.
- Quotafern sends no telemetry and has no cloud server or synchronization. F3's production gate prevents Codex startup and credential/provider access.

## Development

Install dependencies from the committed Bun lockfile, then use the package scripts:

Clone `git@github.com:wihlarkop/quotafern.git`, enter the repository, and install Bun 1.4.4 or later. Desktop work also needs stable Rust and the OS prerequisites linked below; no separate Node.js installation is required.

```sh
bun install --frozen-lockfile
bun run dev
bun run dev:desktop
bun run build
bun run build:desktop
bun run lint
bun run lint:fix
bun run fmt
bun run fmt:check
bun run check
bun run regression
bun run regression:rust
bun run check:rust
bun run lint:rust
bun run fmt:rust
```

Tauri desktop development needs the platform prerequisites documented in the [Tauri 2 guide](https://v2.tauri.app/start/prerequisites/). CI uses Ubuntu 22.04 for Linux compilation and installs WebKitGTK 4.1, appindicator, librsvg, and the required build tools.

Commit both `bun.lock` and `Cargo.lock`. CI uses Bun 1.4.4 and stable Rust. Its desktop matrix runs Rust formatting, lint, and check commands, then `bun run build:desktop --no-bundle`; it does not package or upload releases. These compilation checks do not establish that native tray behavior works on a user's desktop. Verify first-launch visibility, close-to-hide, tray Show/Hide/Quit, and single-instance relaunch manually on Windows, macOS, and Linux. On Linux, verify the context-menu path.

F1 has no unit-test suite. As product features are added, include the regression, integration, and security checks needed for those features; a successful compile is not behavioral acceptance. Keep controls keyboard accessible, pair color-coded states with readable text, and respect reduced-motion preferences.

`bun run regression` runs the committed, deterministic smoke assertions against synthetic snapshots and native security configuration. It needs no credentials, network, or test framework and runs in the Frontend quality CI job. `bun run regression:rust` adds focused popup-placement checks using Rust's built-in runner in each desktop CI job; these calculations do not establish native tray interaction acceptance.

## Project notes

- [Architecture](docs/architecture.md)
- [Design system](docs/design-system.md)
- [Security boundaries](docs/security.md)
- [F1 validation and owner acceptance](docs/f1-validation.md)
- [F2 validation and native acceptance checklist](docs/f2-validation.md)
- [F3 validation and launch-policy blocker](docs/f3-validation.md)
- [Codex integration research](docs/codex-integration.md)
