# Quotafern

Quotafern is a compact local-first system-tray app for remaining AI subscription quotas. Its multi-account UI supports local account and connection labels, with **live Codex monitoring enabled on Windows** after explicit remembered consent. Unconsented accounts do not access the provider. macOS/Linux live access remains disabled pending native acceptance.

## Local accounts (ACC-04)

With **Demo preview off**, Accounts lets users add, rename and remove provider-specific local accounts, optional workspaces and connection descriptors, including API-key _labels_. These records alone do not sign in or authorize monitoring; the supported Windows Codex routes require native consent. There are no API-key, token or OAuth credential inputs; Overview never invents quotas for disconnected records.

Only validated non-sensitive IDs, aliases, ownership and mechanism descriptors are saved under the app-owned `quotafern.account-presentation.v1` localStorage key. Saved labels contain no authorization, provider identities, quota or Activity snapshots. On Windows, only matching native remembered permissions may reconnect automatically; all other records remain disconnected. Do not put secrets in labels. The explicit Demo preview remains entirely separate and is never persisted as an account. See [ACC-04 implementation and boundaries](docs/specs/acc-04.md) and [ACC-01 ownership contracts](docs/specs/acc-01-architecture.md).

The owner reported **combined Windows native UI acceptance** after UX-02A/B/C, ICON-01 and ACC-04, with exact-merge CI success. The owner later confirmed Windows Codex live acceptance for existing System and managed Plus/Free accounts, isolation/Refresh all, Disconnect/Reconnect, persistent consent/auto-reconnect and the Svelte confirmation. macOS/Linux native GUI/authenticated acceptance and signed installers remain unverified. This is not a public release.

## Codex connection status

Windows supports two reviewed native routes: Existing Codex uses a short-lived supervised App Server over private stdin/stdout; separate managed accounts use isolated Codex homes and direct HTTPS quota reads. ACC-04 remains a label registry, never authentication. Only provider-returned quota/reset/plan/credit fields are displayed.

Accounts → Connect opens the isolated Svelte/Tauri confirmation. Connect also remembers permission; no old session consent is silently upgraded. Native permission permits automatic reconnect on launch and three-minute refresh. Disconnect removes permission without signing out; Quit stops owned resources and preserves explicit permission. Failed live reads never become demo data.

System monitoring and managed Sign in use the reviewed private Codex 0.164.0-alpha.11.1 helper. A valid cached helper can survive system CLI updates; a clean install needs that exact helper or matching installed bytes. Unsupported/tampered images fail closed, with no download or fallback to an unreviewed binary. An already authenticated managed home can be read directly. Remote Control stays disabled; private job containment, identity binding, strict native storage checks and cancellation remain enforced. Both retired legacy gates stay false. See [final scope and owner evidence](docs/validation/codex-merge-prep-01.md).

For credential-free examples, enable **Demo preview** in Settings. Synthetic sources remain explicit, separate and unpersisted. Failed live reads never use demo values. Existing Codex Details activity/spending/reset examples belong to the historical mock foundation; the direct quota endpoint does not invent those fields. Other providers remain **Coming Soon**.

The [historical app-server decision](docs/security/codex-integration.md), [Sign in with ChatGPT decision](docs/security/chatgpt-auth-decision.md) and [security roadmap](docs/plans/security-roadmap.md) retain their route-specific blockers. The owner has authorized selected native credential reuse for CODEX-LIVE-01; this does not create a public monitoring OAuth grant or authorize other providers.

The owner-approved Soft Ivory & Forest Jade icon family is installed for the desktop app and favicon, with a separate neutral high-contrast Windows/Linux tray glyph and a monochrome macOS template. See [ICON-01 evidence](docs/specs/icon-01.md); no remote icon assets are loaded.

## Native tray behavior (F2 foundation)

- The `main` window opens visibly at 380 × 660 on first launch, near the tray when native geometry is available and safely clamped otherwise. It can be resized to 320–420 logical pixels wide and a configured minimum of 480 pixels high; smaller work areas temporarily relax those limits. Close and Escape hide it. The tray menu provides **Show Quotafern**, **Hide Quotafern**, and **Quit**.
- On Windows/macOS, primary tray click opens, focuses, or toggles the popup; secondary click opens its menu. Native tray geometry positions the popup near the icon when available, with work-area clamping and a safe fallback. Losing focus leaves Settings and account inspection open.
- A second launch routes to the already-running app. On Linux, use the tray context menu; left-click tray events are not supported by the current Linux tray integration.
- F1/F2 quota data were synthetic only. Later milestones preserved explicitly labeled Demo fixtures, without implicit fallback to synthetic readings when live data is unavailable.
- Appearance mode (`system`, `light`, or `dark`) and palette (Graphite & Jade or Zinc & Signal) are separate, non-sensitive preferences stored in `localStorage`.
- Quotafern sends no telemetry and has no cloud server or synchronization. Rust blocks unaccepted platforms and all provider access without consent. Native remembered permission is the only startup authority; retired legacy gates stay closed.

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

- [Architecture](docs/specs/architecture.md)
- [Design system](docs/specs/design-system.md)
- [Security boundaries](docs/security/security.md)
- [F1 validation and owner acceptance](docs/validation/f1-validation.md)
- [F2 validation and native acceptance checklist](docs/validation/f2-validation.md)
- [F3 validation and launch-policy blocker](docs/validation/f3-validation.md)
- [Codex integration research](docs/security/codex-integration.md)
- [Sign in with ChatGPT authorization decision](docs/security/chatgpt-auth-decision.md)
- [Security roadmap](docs/plans/security-roadmap.md)
