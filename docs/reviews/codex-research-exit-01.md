# CODEX-RESEARCH-EXIT-01: Final provider feasibility decision

**Research closed:** 2026-10-26. **Scope:** **one individual user's personal ChatGPT Free, Go, Plus and Pro Codex accounts only**. Multiple individually owned accounts are permitted; teams, organizations, company-paid seats and Enterprise administration are excluded. **Verdict:** **NO-GO for production live integration** with Codex CLI v0.164.0. **GO for a separately approved synthetic-only implementation slice** that never launches Codex or reads credentials. This document is a research decision, not implementation approval, independent platform acceptance, or a claim that OpenAI has explicitly forbidden every local integration.

## What has been established

- OpenAI documents Codex on ChatGPT Free and Go as well as paid plans; **Free supports Codex**, with usage restrictions. Cloud Codex eligibility is separately limited. Neither a public plan table nor the mere presence of an installed CLI proves that a particular account has a given plan or a current numeric balance.
- Codex app-server v2 publishes `account/read` with an account object, ChatGPT `planType` and optional email; `account/rateLimits/read` with source-specific quota windows, `usedPercent`, `windowDurationMins`, `resetsAt`, credits and earned reset details; and optional `account/usage/read` for token activity.
- The **exact pinned** account schema is `codex-rs/app-server-protocol/src/protocol/v2/account.rs`, where `Account::Chatgpt { email, plan_type }` serializes as `{ "type": "chatgpt", "planType": ... }`. The `planType` is an account-plan classification, **not** a billing/renewal date, paid invoice, or separate proof of subscription ownership.
- The **exact pinned** `PlanType` enum in `codex-rs/protocol/src/account.rs` uses `#[serde(rename_all = "lowercase")]` for normal variants. **Quotafern's supported product allowlist is personal `free`, `go`, `plus` and `pro` only.** The upstream enum also contains many other values (including organization and internal tiers), but those are recognized exclusively for **fail-closed rejection/omission**, not as a commitment to implement them. Unknown values, `prolite` and `promax` must not be relabelled as `pro`.
- For a valid current `usedPercent` in 0–100, the Quotafern F3 presentation computes `remainingPercent = 100 - usedPercent` within the **same provider-reported source window**. A known zero remaining is legitimate; a missing or malformed value is not zero. More than one `limitId` means separate buckets rather than a summed quota.
- The documented reset timestamp is a quota-window reset. Earned `rateLimitResetCredits.credits[].expiresAt` is the expiry of a reset credit. Neither is the next subscription payment, subscription renewal, or access expiry. No approved field/source for those subscription billing dates was established: **omit those fields and empty sections**.
- The official plan-usage guidance directs users to ChatGPT/Codex usage settings and to `/status` in an existing interactive Codex session. That is a user-visible fallback, **not** an approved headless third-party API.

## Paths evaluated and decisions

### Path A — Spawn Codex app-server with stdio

**Data:** strong; official typed RPCs can return plan and rate-limit snapshots. **Security:** blocked.

The v0.164.0 CLI selects `RemoteControlStartupMode::ResolvePersisted` for ordinary startup. This mode can restore a previously enabled outbound Remote Control enrollment, independently of the JSONL `stdio://` RPC listener. The internal `CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED` marker is explicitly designated internal in the pinned source; using it as a third-party security guarantee would violate our supported-control policy. A daemon `disable-remote-control` command persists a setting and can restart a user's managed app-server. Quotafern must not mutate that setting or interrupt other Codex work.

Separately, app-server initialization can create a cloud-config loader and model-catalog refresh worker. Optional telemetry-off options, sandbox/read-only settings and a static catalog do not prove all unrelated activity or credential updates have stopped. `account/read` with `refreshToken: false` is not a promise of no Codex-managed automatic auth refresh or local state writes.

**Decision:** NO-GO until an **officially supported per-launch quota-only startup/isolation mode**, or another explicitly reviewed, equivalent arrangement, is available and evidenced for the exact release.

### Path B — Attach to an existing Codex process or managed daemon

**Data:** possible via app-server methods if a compatible transport is reachable. **Security:** not established.

The official app-server can expose stdio, WebSocket or Unix-socket transports, but this does not prove that an existing user process provides a documented **monitoring-only credential, endpoint or access-control level**. A full app-server connection can expose non-monitoring RPCs, and a managed daemon may be carrying active work. Automatically discovering or reconfiguring another program's socket or daemon would exceed consent boundaries. Attaching also would not fix token authorization or trustworthy multi-account attribution.

**Decision:** NO-GO for automatic attach. Reconsider only with a documented discovery/monitoring grant, local consent, scoped methods and guarantees not to alter existing sessions or settings.

### Path C — Sign in with ChatGPT (SIWC) and call quota methods

**Identity:** documented; **eligible inference** is a separate consented capability. **Quota monitoring:** grant not established.

OpenAI distinguishes `openid profile email` identity from `resource.invoke chatgpt.tokens.use.direct` inference. Neither is a documented read-only Codex quota scope. The app-server's external `chatgptAuthTokens` mode is experimental; the pinned protocol marks `account/login/start.chatgptAuthTokens` **FOR OPENAI INTERNAL USE ONLY**, even though newer app-server documents external-token hosts. This documentation/source divergence must not be resolved by emulating first-party credentials or assuming quota authorization.

**Decision:** NO-GO until an explicit official monitoring permission and supported, version-compatible token lifecycle are available. Do not request inference rights for a passive quota dashboard.

### Path D — Personal ChatGPT usage page or Codex `/status`

**Use:** approved human-facing alternative to view current limit/reset for the signed-in user. **Machine-readable app ingestion:** not established.

**Decision:** A future non-credential **Open usage page** link may be separately approved as UX, labelled that it opens the provider's own page. Never scrape private page APIs, WebView cookies, interactive CLI output, or a resident user's auth.

### Path E — OpenAI API Platform Usage / Costs endpoints

These measure organization/project **API billing and token spend**, not individual ChatGPT subscription Codex allowance. API key authority and payer identity differ.

**Decision:** OUT OF SCOPE for Codex subscription remaining, and must not be silently substituted.

### Path F — Organization and Enterprise APIs

**Excluded by product scope.** Quotafern is strictly single-user/personal across all providers. Do not pursue enterprise analytics, compliance APIs, admin keys, organization seats, workspace billing or organization entitlement reads, even as a fallback for individual quotas.

## Separate native process-safety blocker

The current Quotafern Unix implementation, `src-tauri/src/codex/process_unix.rs`, launches Codex in a process group and kills the group during explicit teardown/Drop. **SIGKILL of Quotafern can bypass Drop**; thus a surviving process/descendant is possible. Linux parent-death signal mechanisms and macOS strategies differ, and Windows Job Object tests cannot certify either Unix platform.

**No universal safe design has been validated.** Any future Codex live launch needs a reviewed parent-death/supervisor model on macOS and Linux, adversarial process-tree tests, forced termination checks, crash handling, and real native acceptance. Changing only CLI settings cannot solve this independent blocker.

## Research-complete security gates

- **G1: Supported authorization / permitted identity binding — BLOCKED.** App-server method documentation does not settle third-party quota consent; SIWC identity/inference grants do not grant quota monitoring.
- **G2: Quota-only safe startup — BLOCKED.** v0.164.0 can restore persisted Remote Control and initialize unrelated cloud/model work.
- **G3: Cross-platform child containment — BLOCKED.** Forced Unix parent death and all-OS native acceptance are unverified.
- **G4: Accurate per-account, per-source quota/plan contract — RESEARCH READY, IMPLEMENTATION NOT DONE.** Pinned schema and normalization behavior are documented; tests may be implemented synthetically.
- **G5: Non-secret local multi-account lifecycle — FOUNDATION ONLY.** ACC-04 aliases are not authenticated identities; ACC-02 native connection generations, cancellation and cleanup need their own implementation/review.

**Overall: RESEARCH COMPLETE / NO-GO LIVE.** The absence of an authorized path is a legitimate terminal research outcome for the currently published release. Further attempts to bypass the blocked gates are not appropriate.

## What could be implemented later, only after owner authorizes Codex

- **CODEX-SYN-01:** Rust-to-Svelte optional sanitized plan label for personal Free/Go/Plus/Pro on synthetic `account/read` results, with unsupported-variant omission, account-change invalidation, zero-vs-null semantics, no billing placeholders, tests and no credential reads; keep both live flags false.
- **CODEX-SYN-02:** independent native process-lifecycle design and synthetic forced-exit tests for Linux/macOS/Windows where realistically testable, without spawning the real Codex binary or touching user auth; no claim that tests prove live readiness.
- **CODEX-LIVE:** **DO NOT START** until G1, G2 and G3 have documented independent resolutions, review, native proofs, and a separate owner approval.

## Research resumption triggers

Resume **this same Codex-only PR** only if (1) OpenAI publishes a new documented quota-monitoring-only grant or safer local quota endpoint, (2) an officially supported app-server per-launch isolation mode becomes available, (3) a new stable Codex release/source version materially changes the startup behavior or native containment contract, or (4) independently approved Codex synthetic implementation needs a small provider-specific contract clarification.

At each trigger, compare actual release-tag source to documented API and check authorization, background traffic, process-tree cleanup and Free/Paid field semantics again. Do not auto-upgrade the pinned CLI or open a live gate based solely on a release announcement. Non-Codex research remains paused or belongs to separate provider PRs.

## Evidence (official sources and reviewed pinned implementation)

- Official app-server account and rate limits: https://learn.chatgpt.com/docs/app-server
- Official app-server `--listen` options and managed remote control: https://learn.chatgpt.com/docs/developer-commands
- Official authentication ownership: https://learn.chatgpt.com/docs/auth
- Codex across ChatGPT plans and official usage-page fallback: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Sign in with ChatGPT distinctions: https://learn.chatgpt.com/docs/sign-in-with-chatgpt
- SIWC open-source cookbook: https://learn.chatgpt.com/cookbook/articles/sign-in-with-chatgpt
- GitHub Codex stable release: https://github.com/openai/codex/releases/tag/rust-v0.164.0
- v0.164.0 CLI source, startup selection near line 1315: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs
- Internal remote-control marker near line 87: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-transport/src/transport/remote_control/mod.rs
- Version-pinned `account/read` wire schema: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-protocol/src/protocol/v2/account.rs
- Exact `PlanType` casing/variants: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/protocol/src/account.rs
- Model refresh schedule: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/models_refresh_worker.rs
- Managed daemon controls and state effects: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-daemon/README.md
- Quotafern F3 baseline startup review: [F3 startup blocker](../security/f3-startup-security-investigation.md)
- [First Codex-specific scope](codex-research-01.md) and [version-pinned security review](codex-security-review-02.md)

All evidence here is public/unauthenticated and source-based. No runtime/network captures, credential access, real account reads, native GUI checks, or independent implementation review were performed for this milestone. No code, permission or gate changes are authorized by the research closure.
