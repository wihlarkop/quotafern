# Quotafern

Quotafern helps people check remaining AI subscription quotas from a compact system-tray app. The F1 foundation establishes the Tauri 2 shell and frontend presentation boundary with synthetic examples only; it does not connect to a quota provider.

The local fern icon is provisional artwork. Desktop icon sizes are checked in under `src-tauri/icons/`; no remote assets are loaded.

## F2 behavior

- The `main` window opens visibly at 380 × 660 on first launch, near the tray when native geometry is available and safely clamped otherwise. It can be resized to 320–420 logical pixels wide and a configured minimum of 480 pixels high; smaller work areas temporarily relax those limits. Close and Escape hide it. The tray menu provides **Show Quotafern**, **Hide Quotafern**, and **Quit**.
- On Windows/macOS, primary tray click opens, focuses, or toggles the popup; secondary click opens its menu. Native tray geometry positions the popup near the icon when available, with work-area clamping and a safe fallback. Losing focus leaves Settings and account inspection open.
- A second launch routes to the already-running app. On Linux, use the tray context menu; left-click tray events are not supported by the current Linux tray integration.
- All F1 quota data are synthetic and visibly labeled as demo, including in release builds. Development can switch demo scenarios; release uses the healthy sample. There is no provider integration and no implicit mock fallback.
- Appearance mode (`system`, `light`, or `dark`) and palette (Graphite & Jade or Zinc & Signal) are separate, non-sensitive preferences stored in `localStorage`.
- F1 does not access credentials, make provider HTTP requests, perform OAuth, synchronize account data, or send telemetry.

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
