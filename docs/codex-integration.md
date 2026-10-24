# Codex integration decision — F3

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

The request surface is limited to `initialize`, `initialized`, `account/read` with `refreshToken: false`, and `account/rateLimits/read`. Incoming `account/rateLimits/updated` and `account/updated` notifications may change freshness/auth state. No thread, agent, login, logout, reset-credit, token-usage or purchasing method is implemented.

`refreshToken: false` avoids requesting a forced refresh; it does not prevent Codex from automatically refreshing managed tokens during authenticated use. Codex owns the cached session and may save refreshed credentials, write its runtime state, or invalidate credentials under enforced login/workspace policies. The consent screen discloses those effects. Quotafern neither reads the credential file itself nor promises that the subprocess is filesystem read-only. Disconnect terminates Quotafern's subprocess and clears its memory; it does not send logout.

## Quota semantics

Prefer the complete `rateLimitsByLimitId` map when present, otherwise use the legacy `rateLimits` bucket. Normalize primary/secondary windows independently; unknown bucket IDs remain independent buckets without invented plan meanings. Display labels are generated safe presentation text rather than raw account identity or arbitrary provider text. Do not assume fixed five-hour/weekly windows.

Only finite numeric `usedPercent` in 0–100 becomes `100 - usedPercent`. Invalid or missing percentages remain unknown with sanitized diagnostics. Reset seconds become milliseconds, with null preserved. Window duration, fetch time, and five-minute freshness are separate from connection state. API-key and other unsupported auth modes never appear as subscription allowances. Credits, billing and earned resets are intentionally omitted.

F3 uses manual refresh with native cooldown/backoff. Local status/freshness checks do not query the provider. No connection preference or usage history is persisted. A failed live refresh never calls the demo factory. Stale last-known values retain their original fetch time; account changes invalidate old-account values.

## Launch-policy blocker

Pinned [CLI source](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs) selects `ResolvePersisted` Remote Control startup unless an internal environment marker selects `DisabledEphemeral`. Stdio selects the RPC transport, not the Remote Control policy. No public documented disable control was found. Quotafern does not rely on the internal marker or change Codex's saved preference.

Pinned [message processor](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/message_processor.rs) also constructs a [model refresh worker](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/models_refresh_worker.rs), which refreshes independently of quota reads. A valid static `model_catalog_json` can bypass online catalog refresh in this source version, but that alone does not solve Remote Control. Optional analytics, OTel exporters, feedback, hooks, apps, plugins, and update checks have fixed disabling arguments in the dormant launch foundation; those do not prove all startup side effects are suppressed.

Startup also constructs an authenticated [cloud-config loader](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cloud-config/src/bundle_loader.rs) with background refresh, so a static model catalog alone would not establish quota-only network access.

The native gate has no runtime bypass. Enabling live connection requires a separate reviewed source change establishing supported documented startup controls, verifying child containment on target platforms, and rerunning mock/security checks. Only then should the owner run the authenticated acceptance checklist. This is a secure non-credential foundation delivery, not a working live-provider acceptance claim.
