# Quotafern

Quotafern is a compact local-first system-tray app for remaining AI subscription quotas. Its multi-account UI supports local account and connection labels, but **live provider connections are disabled in this build**. Opening the app does not access provider accounts or credentials.

## Local accounts (ACC-04)

With **Demo preview off**, Accounts lets users add, rename and remove provider-specific local accounts, optional workspaces and connection descriptors, including API-key *labels*. These records are not signed in and do not represent working integrations. There are no API-key, token or OAuth credential inputs; Overview never invents quotas for disconnected records.

Only validated non-sensitive IDs, aliases, ownership and mechanism descriptors are saved under the app-owned `quotafern.account-presentation.v1` localStorage key. All records restore disconnected, with no authorization, identities, quota or Activity snapshots. Do not put secrets in labels. The explicit Demo preview remains entirely separate and is never persisted as an account. See [ACC-04 implementation and boundaries](docs/acc-04/README.md) and [ACC-01 ownership contracts](docs/acc-01-architecture.md).

The owner reported **combined Windows native UI acceptance** after UX-02A/B/C, ICON-01 and ACC-04, with exact-merge CI success. macOS/Linux native GUI acceptance, signed installers and real provider access have not been verified. This is not a public release.

## Codex connection status

Overview starts disconnected. Accounts explains the intended **Connect existing Codex session** permission and the current blocker. Codex app-server can restore a saved Remote Control setting even in stdio mode; Quotafern will not start it while that startup policy is unresolved. Installing or signing in to Codex does not bypass this gate. See [the integration decision](docs/codex-integration.md).

Once a separately reviewed change enables it, the intended flow is Accounts → read the consent disclosure → Connect. Codex manages its own login and may refresh/save its credentials or enforce login/workspace restrictions. Quotafern never asks for a secret, starts an agent turn, or logs out the CLI. Disconnect stops Quotafern's monitor. F3 does not remember connection consent, store quota history, or auto-refresh provider data.

For credential-free examples, enable **Demo preview** in Settings. Every synthetic view is labeled Demo and stays separate from local accounts and live state; production builds use the multi-account sample, while development exposes additional controlled scenarios. Failed live requests never use demo values. [F3 validation](docs/f3-validation.md) separates mock evidence, UI acceptance, and authenticated behavior.

Codex Details groups optional credits, spending controls, earned resets and Activity. The activity calendar distinguishes known zero from unavailable dates and never estimates money from tokens. These features are mock-validated while live connection is gated; a single Plus account is sufficient for later owner acceptance, but compatibility with that actual account remains unverified. Claude Code and Gemini CLI are **Coming Soon**, without login controls.

Sign in with ChatGPT is a future preference, not a functional login option in this build. Its published identity/inference scopes do not explicitly establish existing Codex monitoring access. [Authentication decision](docs/chatgpt-auth-decision.md) and [security roadmap](docs/security-roadmap.md) record the evidence and remaining gates.

The owner-approved Soft Ivory & Forest Jade icon family is installed for the desktop app and favicon, with a separate neutral high-contrast Windows/Linux tray glyph and a monochrome macOS template. See [ICON-01 evidence](docs/icon-01/README.md); no remote icon assets are loaded.

## Native tray behavior (F2 foundation)

- The `main` window opens visibly at 380 × 660 on first launch, near the tray when native geometry is available and safely clamped otherwise. It can be resized to 320–420 logical pixels wide and a configured minimum of 480 pixels high; smaller work areas temporarily relax those limits. Close and Escape hide it. The tray menu provides **Show Quotafern**, **Hide Quotafern**, and **Quit**.
- On Windows/macOS, primary tray click opens, focuses, or toggles the popup; secondary click opens its menu. Native tray geometry positions the popup near the icon when available, with work-area clamping and a safe fallback. Losing focus leaves Settings and account inspection open.
- A second launch routes to the already-running app. On Linux, use the tray context menu; left-click tray events are not supported by the current Linux tray integration.
- F1/F2 quota data were synthetic only. Later milestones preserved explicitly labeled Demo fixtures, without implicit fallback to synthetic readings when live data is unavailable.
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
- [Sign in with ChatGPT authorization decision](docs/chatgpt-auth-decision.md)
- [Security roadmap](docs/security-roadmap.md)
