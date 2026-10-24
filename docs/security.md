# Security boundaries

## Current F3 delivery

**Live Codex connection is disabled.** The native gate runs before executable discovery, version checks, process launch, or account reads. The UI presents the blocker and disables Connect. There is no environment variable, persisted setting, renderer parameter, or debug-only UI that bypasses the production gate. Development and CI use synthetic protocol inputs/fake processes only. No real credential access was authorized or used during F3 implementation.

The blocker is app-server startup policy, not a missing token: [pinned public source](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs) can restore Remote Control even when stdio is selected, and the public documentation does not provide a guaranteed disable control. It also starts model-catalog refresh independently of quota requests. Quotafern does not use an undocumented internal environment override to bypass this uncertainty. See [the research decision](codex-integration.md).

The foundation's native commands are `codex_connect`, `codex_refresh`, `codex_status`, `codex_disconnect`, and existing `hide_popup`. Each is main-only and takes no renderer-controlled process/path/network input. The exact four new permissions are `allow-codex-connect`, `allow-codex-refresh`, `allow-codex-status`, and `allow-codex-disconnect`. No shell, filesystem, generic fetch, raw RPC proxy, or event-listen permission is granted. Release and development CSP are unchanged.

The dormant protocol allowlist is initialization plus account and quota reads. No login/logout, token injection, thread/agent execution, credits redemption, purchase, or account switching method exists. All diagnostics are static categories; child stderr is discarded and raw protocol frames are never persisted. Native state includes only reduced presentation fields, not full responses. Unknown provider text and auth fields do not become labels. Emails, cookies, headers, tokens, account IDs, credential paths and credits do not cross the renderer boundary.

Explicit connection consent is designed to explain that Codex owns authentication and may automatically refresh/save its session, write native runtime state, or enforce login/workspace policies. `refreshToken: false` is not a guarantee of filesystem read-only behavior. Disconnect stops Quotafern monitoring and clears snapshots without logging out the CLI. No consent is remembered across startup. This intended behavior remains behind the launch gate.

Dependencies added for the bridge are Serde/serde_json for typed output and bounded JSON parsing, plus target-native process containment bindings (`libc`, `windows-sys`). No frontend dependency or credential/network library is added. Focused source/config regression is evidence at these seams, not a complete security audit or native-process acceptance.

Threats considered: compromised renderer attempting arbitrary subprocess execution; malformed, oversized, interrupted, or identity-bearing RPC payloads; inherited telemetry/background services; stale values looking healthy; account changes retaining another account's quotas; child process leaks. Main-only argument-free commands, bounded framing/deadlines, static diagnostics, generated labels, source discrimination, stale/auth invalidation, child containment, and the closed live gate reduce those risks. A malicious installed executable or compromised OS remains outside this process trust boundary. Do not lift the gate merely because mock checks pass.

## Historical F1/F2 runtime

F1 has no provider integration. The app does not read credentials from environment variables, local CLI configuration, credential files, OS keychains, or other apps' credential stores. It does not otherwise access credentials, make provider HTTP requests, perform OAuth or token refresh, synchronize account data, or send telemetry.

F1 snapshots are synthetic and visibly labeled as demo in development and release builds alike. Development can switch demo scenarios; release uses the healthy sample. No provider integration exists, so mock values are not a fallback from missing or unavailable live data. Appearance mode and palette are the only F1 values persisted in `localStorage`.

## Tauri boundary

F2 changes native click/placement handling and frontend presentation only. It adds no renderer command, permission, capability, CSP source, native dependency, or provider client. The snapshot root is explicitly tagged `source: "synthetic"`; this tag does not authorize future live data. Native geometry remains inside the host and is not exposed as renderer IPC.

- Grant the `hide_popup` command permission only to the `main` window (`allow-hide-popup`). Keep capabilities scoped to that window.
- Keep the release Content Security Policy limited to bundled content and Tauri IPC. Development may additionally allow the Vite server at `127.0.0.1:1420` and its HMR WebSocket; do not carry those development allowances into release policy.
- Keep the native host responsible for window and tray lifecycle. Do not expose a generic shell, filesystem, or network command to the renderer.
- Keep secrets out of frontend state, local storage, logs, and error messages.

## Future provider boundary (design only)

Any future credential or provider work requires a separate design and implementation scope. The intended boundaries are:

- Discovery of external CLI auth state requires separate authorization and design. Keep it read-only to the external CLI state and distinct from Quotafern-owned keychain storage and provider token refresh.
- OS keychain support may handle only Quotafern-owned entries created through an explicit app flow; it must not enumerate arbitrary keychain entries or treat another app's records as Quotafern credentials.
- Token refresh applies only to an explicitly authorized, app-owned provider session.
- Provider responses must be reduced to sanitized quota snapshots before entering the renderer; never forward raw tokens, headers, or secret-bearing provider payloads.

These are design constraints only. F1 implements none of these flows and does not access credentials.
