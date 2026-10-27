# Codex integration decision — F3

> **2026-10-26 scope update:** CODEX-LIVE-01 authorizes a separate consented, native direct-HTTP adapter using selected Codex file credentials and isolated Codex-managed login. The historical app-server/SIWC conclusions below remain evidence for those routes, not a prohibition on the new route. Both old app-server gates remain closed. See [current direct integration](../security/codex-live-01.md); live direct activation still requires security and owner acceptance.

Research date: 2026-10-24. Official references:

- [Codex app-server](https://learn.chatgpt.com/docs/app-server): transport, handshake, account methods, authentication ownership and restrictions.
- [Authentication](https://learn.chatgpt.com/docs/auth): local caching, automatic refresh, and policy-driven login invalidation.
- [Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): plan-dependent shared allowances; usage, credits and token activity are different concepts.
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) and [telemetry controls](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry): disable optional child analytics/exporters rather than inheriting telemetry defaults.
- Public [Codex 0.164.0 release](https://github.com/openai/codex/releases/tag/rust-v0.164.0), published 2026-10-23, and its [CLI](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs) and [app-server startup](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/lib.rs) source were inspected without executing Codex or inspecting local auth state.

## Choice and compatibility

The bridge foundation uses the documented newline-delimited JSON stdio subprocess protocol. No Quotafern listener, service, undocumented ChatGPT endpoint, copied OAuth client identity, or browser-cookie integration is added. **Production connection is disabled in this build**, before executable discovery/version probing/process startup. App-server is experimental; a successful protocol fixture is not a guarantee for every installed CLI version. The foundation targets exactly 0.164.0 and validates handshake/method/response structure; this is a review target, not a claim of live acceptance. There is no claimed universal minimum protocol version from the documentation.

The application is a local/open-source integration. Official guidance permits that category and forbids app-server authentication for commercial or hosted services. A hosted/commercial fork needs a separate authorization/integration decision; F3 does not add Sign in with ChatGPT or an app-owned OAuth flow.

## Read-oriented does not mean filesystem read-only

The request surface is limited to `initialize`, `initialized`, `account/read` with `refreshToken: false`, `account/rateLimits/read`, and optional `account/usage/read`. Incoming `account/rateLimits/updated` and `account/updated` notifications may change freshness/auth state. No thread, agent, login, logout, reset consumption or purchasing method is implemented. An unsupported activity read leaves quota monitoring functional; it is not an entitlement test or inference request.

`refreshToken: false` avoids requesting a forced refresh; it does not prevent Codex from automatically refreshing managed tokens during authenticated use. Codex owns the cached session and may save refreshed credentials, write its runtime state, or invalidate credentials under enforced login/workspace policies. The consent screen discloses those effects. Quotafern neither reads the credential file itself nor promises that the subprocess is filesystem read-only. Disconnect terminates Quotafern's subprocess and clears its memory; it does not send logout.

## Quota semantics

Prefer the complete `rateLimitsByLimitId` map when reported; an absent or null map uses the legacy `rateLimits` bucket. A malformed non-null map does not silently fall back. Normalize primary/secondary windows independently; unknown bucket IDs remain independent buckets without invented plan meanings. Display labels are generated safe presentation text rather than raw account identity or arbitrary provider text. Do not assume fixed five-hour/weekly windows.

Only finite numeric `usedPercent` in 0–100 becomes `100 - usedPercent`. Invalid or missing percentages remain unknown with sanitized diagnostics. Reset seconds become milliseconds, with null preserved. Window duration, fetch time, and five-minute freshness are separate from connection state. API-key and other unsupported auth modes never appear as subscription allowances.

The addendum extends optional read-only monitoring using the public [0.164.0 account schema](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-protocol/src/protocol/v2/account.rs). Credit balance remains validated decimal text in provider credits, with unlimited/available flags distinct from quota. `individualLimit` spending controls retain limit/used decimal text, the already-remaining percentage, and reset time. The protocol does not declare a currency/unit for those spending amounts, so the UI explicitly reports that limitation and never supplies a currency symbol. Earned resets retain the authoritative available count and optional expiry/status detail, without opaque redemption IDs or consumption actions.

Activity summary counters and daily token buckets are independent from quota and money. Exact calendar dates are validated without local timezone conversion; missing days remain unknown, confirmed zero is separate, and conflicting duplicate dates become unknown instead of being summed. Relative heatmap intensity uses only known provider values. No streak, spending amount or entitlement is inferred from sparse buckets. See [the separate Sign in with ChatGPT authorization decision](chatgpt-auth-decision.md); identity/inference scope support does not establish monitoring authorization.

F3 uses manual refresh with native cooldown/backoff. Local status/freshness checks do not query the provider. No connection preference or usage history is persisted. A failed live refresh never calls the demo factory. Stale last-known values retain their original fetch time; account changes invalidate old-account values.

## Launch-policy blocker

Pinned [CLI source](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs) selects `ResolvePersisted` Remote Control startup unless an internal environment marker selects `DisabledEphemeral`. Stdio selects the RPC transport, not the Remote Control policy. No public documented disable control was found. Quotafern does not rely on the internal marker or change Codex's saved preference.

Pinned [message processor](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/message_processor.rs) also constructs a [model refresh worker](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/models_refresh_worker.rs), which refreshes independently of quota reads. A valid static `model_catalog_json` can bypass online catalog refresh in this source version, but that alone does not solve Remote Control. Optional analytics, OTel exporters, feedback, hooks, apps, plugins, and update checks have fixed disabling arguments in the dormant launch foundation; those do not prove all startup side effects are suppressed.

Startup also constructs an authenticated [cloud-config loader](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cloud-config/src/bundle_loader.rs) with background refresh, so a static model catalog alone would not establish quota-only network access.

The native gate has no runtime bypass. Enabling live connection requires a separate reviewed source change establishing supported documented startup controls, verifying child containment on target platforms, and rerunning mock/security checks. Only then should the owner run the authenticated acceptance checklist. This is a secure non-credential foundation delivery, not a working live-provider acceptance claim.

## Security gate resolution

The [versioned startup investigation](f3-startup-security-investigation.md) distinguishes the stdio RPC transport from the possible outbound Remote Control websocket restored from saved enrollment. Stdio does not itself create an inbound RPC network listener; selecting WebSocket transport would. Cloud configuration, model refresh and Codex-managed authentication still have separate startup paths. No supported quota-only startup control was established. Incidental catalog/configuration traffic could be evaluated with explicit disclosure in a future design, but cannot justify silent Remote Control restoration. Neither live-enable constant changes in this delivery.

The best officially supported manual alternative is the [Codex usage dashboard](https://chatgpt.com/codex/settings/usage), or `/status` in an existing Codex CLI session. Quotafern does not automate those surfaces or open a browser itself. There is no verified supported machine-readable alternative that satisfies this startup boundary in the reviewed sources.

### Native consent

Behind the closed gate, the existing argument-free main-window `codex_connect` command now requests a fixed, parented OS confirmation using the supported Tauri dialog library. Rust owns both the disclosure and its result. No approval Boolean, session ID or consent token is accepted from IPC; the Svelte checkbox is preparatory UX only. The native disclosure includes automatic token refresh/auth-state writes and the exact permitted monitoring purpose. No CLI sign-in/sign-out is requested.

`ConsentGate` allows one outstanding interaction/startup. It retains no consent after restart and does not serialize authorization. Disconnect invalidates a pending result before waiting for the session lock; a late positive answer cannot authorize startup. Cancellation, concurrent Connect attempts and application shutdown fail closed. A cancelled modal can remain visible until dismissed, but its result is invalidated. Direct-IPC regressions use a compile-time-only trusted-dialog mock; production has no injected result or alternate launch policy.

### Child lifetime

Windows 10+ creation uses `CreateProcessW` with `CREATE_SUSPENDED`, an explicit stdio handle allowlist and `PROC_THREAD_ATTRIBUTE_JOB_LIST`. The private kill-on-close job is associated during process creation, before user code runs; only then is the primary thread resumed. Failure never falls back to ordinary uncontained spawn. Arguments use Windows CRT quoting and an explicit executable path, without a shell. Job handles are not inherited. Cleanup terminates the job and checks `ActiveProcesses == 0` plus primary-process termination with a bounded wait; it does not wait indefinitely on a job signal.

Linux/macOS keep process-group termination. An out-of-band watchdog terminates the owned job/group when cancellation or a protocol deadline fires, so a child that stops reading cannot block Disconnect indefinitely in a synchronous stdin write. The watchdog is stopped before normal reaping. Fake-process evidence is recorded separately from native dialog/tray and real installed-Codex acceptance in [F3 validation](../validation/f3-validation.md).

Unix forced-parent termination remains an unresolved live-acceptance blocker: `SIGKILL` skips Rust Drop and application exit hooks, and process groups do not automatically terminate when their parent dies. Graceful fake-process cleanup cannot establish that guarantee. Linux/macOS require a supported parent-death/supervisor design and separate runtime validation before claiming forced-exit cleanup. Windows kill-on-last-job-handle-close provides a different OS lifetime guarantee. Keep the live gate closed while this and the startup-policy blocker remain.

Windows implementation references: [process attributes](https://learn.microsoft.com/en-us/windows/desktop/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute), [suspended execution](https://learn.microsoft.com/en-us/windows/win32/procthread/suspending-thread-execution), [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [job accounting](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information). Native confirmation uses the [Tauri dialog Rust API](https://v2.tauri.app/plugin/dialog/); no dialog permission is granted to the renderer.
