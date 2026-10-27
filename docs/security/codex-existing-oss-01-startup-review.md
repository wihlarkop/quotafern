# CODEX-EXISTING-OSS-01: Existing Codex server startup review

> Historical investigation. The later owner-authorized supervised stdio policy supersedes the earlier fresh-process blocker; see [final scope](../validation/codex-merge-prep-01.md).

Review date: 2026-10-26

## Scope and pinned source

- Official Codex source checkout `.tmp/oss/codex` was at `main` `970111f6cb62cc02fe36a82ea7d71b37a2889c97`.
- Installed native CLI reported `0.164.0-alpha.11.1`; supplied binary SHA-256: `1103E9E09C71FA2CD0AFD6D8F3B9A2D63174FE8EFD7CB5BD09F1CB14EF58A098`.
- Installed source tag `rust-v0.164.0-alpha.11.1` peels to `6905ecede7816e91373e9eabda3f6b0368fc747b`.
- No installed launcher, app-server, auth file, Codex config, or runtime state was opened. No server was started and no provider RPC was made. I did not run `--help` or `--version` against the launcher. The tag checkout is partial/promisor; the relevant installed-tag source files were cross-checked against official raw source at the exact peeled commit.

## Decision

There is no supported fresh app-server launch policy in these sources that constrains startup and background work to account and rate-limit reads. `--stdio` selects a transport; it does not disable standard app-server initialization. The only source-level disable switch found for Remote Control is explicitly internal and only changes that subsystem's startup mode. Even when disabled, ordinary app-server startup creates `AuthManager`, installs the cloud-config bundle loader (which starts a background fetch/refresh task), and starts an online model-catalog refresh worker. These are outside a narrow quota-read boundary. A fresh app-server process therefore cannot be approved as a no-unrelated-startup solution using supported flags alone.

A distinct, attach-only option is technically feasible: connect to a daemon already running on the current user's Windows Codex home through the local UDS-style transport. `codex app-server proxy [--sock PATH]` is a public subcommand and does not itself enter the server-launch branch. The owner has separately confirmed by sanitized directory/socket existence metadata that the fixed endpoint exists; no connection or runtime inspection was performed for this review. The Windows app-server transport uses the `codex_uds` Unix-socket abstraction rather than the desktop `codex-ipc` pipe.

The public proxy is an opaque stdio byte relay, not a quota-only RPC client, and its handler does not visibly perform the Windows peer check referenced by the TUI socket helper. A direct connector can proceed as a candidate only if it implements and tests the TUI-equivalent peer verification plus a pinned official peer image, derives only the fixed selected Codex-home endpoint, sends a strict allowlist of `account/read` and `account/rateLimits/read`, validates and presents the returned account after consent, sanitizes output, and fails closed on absence or mismatch. It must never invoke `daemon start` or fall back to `native.exe app-server`. Attaching avoids starting another server, but cannot certify that a daemon already running has no unrelated work currently in progress; that residual is distinct from creating new startup activity.

## Evidence

### Fresh app-server startup

- Public CLI arguments are `--listen` (default `stdio://`) and `--stdio`; documented listening values include `stdio://`, Unix socket, websocket, and `off`. No public quota-only, no-auth, no-model-refresh, or no-cloud-config startup flag is present: current `codex-rs/cli/src/main.rs:577-618` and installed-tag `codex-rs/cli/src/main.rs` (commit `6905ecede7816e91373e9eabda3f6b0368fc747b`).
- Ordinary CLI invocation routes to `run_main_with_transport_options`; default runtime options set `RemoteControlStartupMode::ResolvePersisted`: current `codex-rs/cli/src/main.rs:1280-1320`, current `codex-rs/app-server/src/lib.rs:483-502`, installed tag `codex-rs/app-server/src/lib.rs:450-470`. In both current and installed-tag transport sources, `ResolvePersisted` begins as `Unknown`; the background Remote Control websocket resolves the persisted preference using auth and client-name/account scope before waiting for enabled state and connecting: current/tag `codex-rs/app-server-transport/src/transport/remote_control/controller.rs:272-307` and `websocket.rs:497-522,610-682`. The extra explicit resolve in `app-server/src/lib.rs:902-911` applies only when there is no local transport; stdio does have one, but its Remote Control task still resolves persisted state.
- `CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED` is explicitly described as an internal daemon marker, removed at process start, and mapped only to `DisabledEphemeral` for Remote Control. Without it the mode remains `ResolvePersisted`: current `codex-rs/app-server-transport/src/transport/remote_control/mod.rs:80-96`, installed tag `codex-rs/app-server-transport/src/transport/remote_control/mod.rs:73-90`, and current CLI/app-server entrypoints.
- The installed tag's ordinary startup loads cloud startup config, constructs `AuthManager`, and replaces the cloud bundle loader: `codex-rs/app-server/src/lib.rs:535-570` at commit `6905ecede7816e91373e9eabda3f6b0368fc747b`. The loader immediately spawns `get_latest()` and `refresh_cache_in_background()`: installed tag `codex-rs/cloud-config/src/bundle_loader.rs:40-67`.
- Installed-tag MessageProcessor starts `models_refresh_worker` at `codex-rs/app-server/src/message_processor.rs:377-386`; its worker performs `RefreshStrategy::Online` immediately and then every 4 minutes 30 seconds at `codex-rs/app-server/src/models_refresh_worker.rs:10-59`. Current `main` has the same worker behavior.

### Existing Windows daemon attach

- App-server transport distinguishes `Stdio`, `UnixSocket`, `WebSocket`, and `Off`; `unix://` resolves to the per-Codex-home app-server control socket: current `codex-rs/app-server-transport/src/transport/mod.rs:67-105,123-152`.
- The Windows control-socket path validates/pins the private socket directory before bind and uses `codex_uds::UnixListener`; local-socket validation is delegated to `codex_uds`: current `codex-rs/app-server-transport/src/transport/unix_socket.rs:114-141,270-283,325-350`.
- CLI exposes `app-server proxy`, described as proxying stdio bytes to the running app-server control socket. `--sock` is optional and defaults to the resolved Codex-home socket; handler invokes `codex_stdio_to_uds::run` without calling `run_main_with_transport_options`: current `codex-rs/cli/src/main.rs:640-645,710-715,1478-1486`. The installed-tag proxy implementation is a raw byte relay (no JSONL conversion), so it should not be adapted as a JSON-RPC protocol client.
- `verified_local_daemon_socket` documents that the Windows TUI revalidates the directory and verifies the peer at connection time. The public proxy handler does not call that helper. The TUI client implementation is absent from this sparse source subset, so reuse of the peer-checking path remains an implementation prerequisite.
- App-server has separate account and rate-limit request arms: current `codex-rs/app-server/src/message_processor.rs:1839-1847`; rate-limit response logic is in `codex-rs/app-server/src/request_processors/account_processor.rs:1150-1242`. A local socket is not a restricted RPC surface; the client must whitelist calls itself.

## Safe next step

Keep the fresh-process path closed. The attach-only architecture can proceed to implementation review as a separate ExistingAccount route, contingent on source-backed Windows peer verification and a fixed RPC allowlist. If peer verification or pinned official executable identity cannot be established, return “no safe attach route verified”; do not spawn a server as a fallback. Owner acceptance must separately confirm that the selected server account matches the intended account. `rateLimits/read` may use Codex-managed authentication and refresh behavior, which remains subject to in-app consent disclosure.
