# CODEX-ATM-01 — Competitor methods, safe alternatives and Quotafern improvements

**Research date:** 2026-10-26  
**Product scope:** single local app owner; individually owned ChatGPT Free, Go, Plus or Pro accounts only. Multiple personal sources may exist; company/enterprise/admin integration is excluded. Claude comparisons below are used to learn UI/adapter boundaries, **not** to resume Claude development or other provider research.  
**Artifact type:** public-source competitive research and architecture decision. **No installation, live account testing, native file access, credentials, code changes or implementation authorization.**

**ATM means observe the publicly inspectable design, learn the behavior, then implement original Quotafern code under our product/security contract.** Do not copy source/UI/assets without separate license and attribution review. Product functionality is independently developed.

## Finding that changes Codex feasibility: local observed rate-limit events

**Confirmed in upstream source, not authenticated runtime:** The pinned Codex `rust-v0.164.0` protocol defines `TokenCountEvent { info: Option<TokenUsageInfo>, rate_limits: Option<RateLimitSnapshot> }`. Its rollout parser tests include an `event_msg` with `payload.type="token_count"` and `payload.rate_limits`. The session sends a new `token_count` event after updating rate-limit state. Rate-limit subfields include optional primary/secondary windows, plan type, credits, spend controls and limit metadata.

Specific evidence:
- Source: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/protocol/src/protocol.rs (see `TokenCountEvent` and `RateLimitSnapshot`, around lines 2472–2500).
- Version-pinned rollout parser fixture: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/rollout/src/tests.rs (around lines 54–58).
- Source producer: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/core/src/session/mod.rs (near `update_rate_limits` and `send_token_count_event`).
- Independent local-reader explanation: https://tokenuse.app/docs/development/tools/codex/ and https://tokenuse.app/docs/development/tools/codex-subscription/ (latter's network quota sync is distinct).
- First-party user-facing history-persistence notes: https://learn.chatgpt.com/docs/config-file/config-advanced

**New candidate: an explicitly consented, non-network, read-only `local-observed` Codex quota source.** A bounded native scanner of already-written session records **could** display the last provider-observed quota without spawning Codex, reading `auth.json`, refreshing OAuth, or requesting an undocumented endpoint. This is different from a **live current balance**: it updates only when another Codex session writes relevant events and can lack a window, plan or account binding. It may disappear if persistence is disabled. The rollout format is source-observed but **not a guaranteed public monitoring API**.

**Privacy blocker to resolve before implementation:** JSONL rollout files also contain prompts, code, filesystem paths and possibly other sensitive data. Reading them is not intrinsically credential-free/sensitivity-free. Design must be an opt-in, strictly allowlisted parser that discards all unrelated content before any IPC/diagnostics. No actual user files have been scanned in this research.

## Comparison of inspected applications

| Application / official repo | Observable acquisition method | Strong pattern to learn | Method **not** authorized for Quotafern |
| --- | --- | --- | --- |
| **CodexBar** — https://github.com/steipete/CodexBar | OAuth tokens from Codex's `auth.json` to `wham/usage`; optional CLI app-server; local token logs; optional browser dashboard | Provider-specific source/provenance labels; multi-account per-row stale/errors; window-specific history; preserve account identity; never conflate local token cost with remote quota | Cross-app OAuth token copying, bearer calls to an undocumented personal backend, cookie extraction, credential promotion or managed-daemon restart |
| **OpenUsage** — https://github.com/robinebers/openusage | Existing tool auth + local logs; presents session/weekly, credits and spend; source docs detail local CodeX session parsing | A compact single panel and independently scoped session activity/cost | Automatic credentials discovery, private endpoints or presenting local estimated token costs as subscription billing |
| **OpenTokenUsage** — https://github.com/PowerUserZ/OpenTokenUsage | Tauri/Windows fork of OpenUsage; existing CLI login; local cost estimates and provider quota plugins | Configurable tray/taskbar metrics, explicit reset countdowns, alerts, smart per-account polling/backoff, provider health | Implicit reads of another CLI's tokens; third-party binary/package downloads for optional counters; a local HTTP status API **enabled by default** |
| **Quota** — https://quota-ai.my/docs/desktop/ and https://quota-ai.my/docs/ | Browser sign-in or import Codex CLI credentials; desktop and per-provider account cards with reconnect | Multiple named accounts, compact/list layouts, separate refresh and reauthentication status | Importing shared `auth.json`, assuming its independent login flow constitutes a Quotafern-authorized public OAuth client |
| **QuotaView** — https://github.com/Duoasa/QuotaView | App-server JSON-RPC account reads and local task/hooks; bounded sanitized widgets | Local source provenance, minimal widget IPC, visible task activity vs quota; read-only reset presentation | Assuming `codex app-server` launch has no Remote Control/cloud-config effects; hooks/task approvals are not a passive quota monitor |
| **Quota Monitor** — https://github.com/timmyagentic/quota-monitor | Codex app-server for live, local Codex rollout/session logs for historical tokens and estimate; Claude private OAuth usage | Correct split between live quota and local usage; local SQLite history; cost estimates clearly not invoices | Starting unsafe Codex app-server; extracting Claude subscription login credentials |
| **Agentic Usage Meter** — https://github.com/prime-radiant-inc/agentic-usage-meter | Separate browser OAuth+PKCE modeled on Codex source, direct personal usage API and app-owned account-scoped Keychain | Distinct personal accounts, per-account Keychain entries, explicit invalid-identity rejection, true absent-window omission, two-account qualification notes | Copying the first-party Codex OAuth `client_id` or redirect registration, using an unregistered Quotafern OAuth flow, calling unpublished `wham/usage` |
| **Token Use** — https://tokenuse.app/docs/development/tools/codex/ | Local rollout parsing for token activity and **last-observed rate-limit snapshots**; separately opt-in cookie-based network quota sync | Potential **no-login local observation**; proven parser test target; divide last-observed state from live network sync | User cookie import, session-token exchange, treating an old local event as live remaining |
| **Token Monitor** — https://github.com/Javis603/token-monitor | Reads existing Codex/Claude local session directories for tokens and limits; optional separate multi-device sync | Customizable tray, desktop/floating compact surfaces; multi-account personal labels; history by day/model and estimated costs | One-click rewriting the active Codex login, always-on cross-device sync or automatic access to all local tool stores; these exceed our no-secret, personal local-first scope |
| **ModelMeter** — https://github.com/rupprath/modelmeter | Claude subscription OAuth from Claude Code's own credential file; OpenAI/Anthropic API spend through organization Admin API keys | Explicitly separate native units (quota %, token metrics, credits, cost), explain source/credential permissions and do not claim estimated cost is a bill | Subscription OAuth token reuse and any organization Admin API-key permission; the product primarily targets API admin billing, not personal Codex plan allowance |
| **AIQuota** — https://github.com/niederme/ai-quota | Guided per-provider onboarding, per-account gauges/widgets | Onboarding and last-updated captions; omit unavailable windows | Different licensing restrictions and Claude keychain reuse without a separate consent/security review |

**Evidence depth:** Official project READMEs and provider/qualification docs, plus original OpenAI pinned protocol/source. We have **not** executed competitor binaries or intercepted their network requests, so statements about their runtime are repository-author-documented mechanisms rather than independently verified behavior.

Selected method sources:
- https://github.com/steipete/CodexBar/blob/main/docs/codex.md
- https://github.com/steipete/CodexBar/blob/main/docs/providers.md
- https://github.com/robinebers/openusage/blob/main/docs/providers/codex.md
- https://github.com/PowerUserZ/OpenTokenUsage/blob/main/README.md
- https://github.com/prime-radiant-inc/agentic-usage-meter/blob/main/docs/provider-qualification.md
- https://github.com/Duoasa/QuotaView/blob/main/README.md
- https://github.com/timmyagentic/quota-monitor/blob/main/README.md
- https://tokenuse.app/docs/development/tools/codex/
- https://github.com/Javis603/token-monitor/blob/main/README.md
- https://github.com/rupprath/modelmeter/blob/main/README.md

## Candidate architecture: three honest data lanes, not interchangeable fallback

| Lane | Provider/credential access | Meaning | Current decision |
| --- | --- | --- | --- |
| **A. Provider live snapshot** | Requires approved session/monitoring scope and native process/access safety | Current account quota window, reset, credits, as actually returned | **NO-GO LIVE** for v0.164.0 (see research exit G1–G3) |
| **B. Local observed snapshot** | If explicitly authorized, **read existing rollout files only**, no network/process/credentials | **Last observed** Codex quotas from a specific local log source; not necessarily current or account-attributed | **RESEARCH-CANDIDATE**, not approved/implemented; privacy/identity/security tests pending |
| **C. Local activity/cost estimate** | If explicitly authorized, read existing session token metadata | Per-session/period tokens; API-equivalent estimated cost, not subscription spend or remaining quota | Design idea only; keep opt-in and distinguish from B |

No automatic fallback from A to B that presents B as live. Never use demo to mask A/B failures. Each value must retain a specific source lane, observedAt, data age, verified account binding if available, and independent connection/error state.

### Opt-in local observed scanner: precise proposed requirements

**Onboarding and storage**
- No automatic home enumeration at startup. Default **Off**; disclose that Codex JSONL may contain full conversation transcripts and source code. Explicitly grant read-only access to a selected Codex *sessions folder* / app-owned narrowly verified known path; nothing in this doc authorizes programmatic file access.
- Native Rust owns the path selector, base path canonicalization, symlink/UNC/junction/reparse-point checks, bounded directory traversal and file reads on Windows/macOS/Linux. Renderer only receives a source ID and sanitized readings; renderer may not supply arbitrary file/glob/path.
- Never read `auth.json`, `config.toml`, keychain, `history.jsonl` if it contains prompts, unrelated files or files outside allowlist. Rollout content itself is sensitive, so only process matching expected structured events and promptly discard other lines without logging them. No commands, child process, HTTP server, file watcher, telemetry or sync.
- Do not persist sensitive raw event lines, session IDs, prompt text, project paths or identity claims. Persist a harmless local source descriptor only after an approved privacy review; permission and future automatic read should be separately approved and revocable.

**Candidate parser and data integrity**
- Only previously created, explicitly eligible `sessions/YYYY/MM/DD/rollout-*.jsonl` and opted-in `archived_sessions/rollout-*.jsonl`. Verify `session_meta` provenance; bounded max depth, files, bytes, line length, memory, time horizon and parse duration. Handle UTF-8, truncated JSONL tail, concurrent file rotation, huge files, symlinks and hostile local fixture data fail closed.
- Match `type="event_msg"`, `payload.type="token_count"`; consume only nested `payload.rate_limits`. **Do not** infer quota directly from token totals. Extract `rate_limits.plan_type`, `primary`, `secondary` and optional credit fields only when documented by pinned source. Treat absent, null, malformed, NaN, negative, overflow, unexpected/unsupported plan, missing date and inconsistent window IDs as absent.
- Identify 5-hour vs weekly by verified `window_minutes`/limit IDs, not always by `primary` vs `secondary`, since reported layout may change. No default fabricated 5h/7d duration.
- Source event `timestamp` is the observation time; file mtime is only discovery metadata, **never** a replacement for `observedAt` or account identity. Choose latest validated event within a single trusted source and prevent arbitrary future timestamps, out-of-order log writes, cross-session stale overwrites and reset-after clock mistakes.
- **Always label `Last observed`** with absolute timestamp + relative age. No `Connected` status, no `Live` badge and no countdown promise. When a stored quota window's `resets_at` is in the past, do not display its old remaining as current; remove that numeric reading from the active card and optionally retain it only in an explicitly historical chart.
- `remainingPercent = 100 - usedPercent` for valid 0–100, same bucket only; never add percentages, count user quotas from locally estimated token totals, infer subscription payment/expiry, or promote Free/Go/Plus/Pro from the file if event plan provenance is uncertain.

**Most serious gap: account identity**
- `session_meta` and `rate_limits.plan_type` do **not**, by themselves, verify the current ChatGPT account identity. The same `CODEX_HOME` may be reused after the user switches Codex sign-ins.
- Therefore **DO NOT** automatically attach an observed snapshot to `Codex - Personal`, `Codex - Account B`, an email address, or a user-selected connection alias just because files came from one directory, a plan label matched, or timestamps are recent.
- Default presentation is **`Local Codex observations — account unverified`** with no current-provider-auth claim. Per-account association requires a separately demonstrated reliable *non-secret* identity signal and user consent; absent one, personal multi-account remote quota remains unresolved. Two local aliases never imply two remote accounts.
- If account switches in the same home, invalidate attribution rather than grafting A's old limit under B. A disconnected account's last observed data may remain a historical record only with explicit source/age labeling.

**Native acceptance proof to demand**
- Target OS matrix including long symlinks and Windows junctions/reparse points, concurrent writes and partial final lines; memory/CPU/fd exhaustion; no credential reads; log-content canaries remain absent from IPC, logs, captures, persisted metadata and report.
- Security tests must verify zero provider networking, zero Codex executable launch, zero terminal status collection, zero `auth.json` access, no telemetry, no synthetic live fallback, and deterministic result for every fixture.
- Owner must separately approve this narrow local file read contract; Codex implementer cannot unilaterally choose broader scanning as a convenience.

## UX modifications worth applying across Quotafern

1. **Truthful provenance by design:** icon/label for `Live (provider-authorized)`, `Last observed (local)`, `Demo`, `Unavailable`. Avoid mixing readings under one unlabeled percentage.
2. **Compact triage, detailed drill-down:** one account row shows verified remaining windows and reset if present, with last-updated age; optional details show independent credit status, reset-credit inventory, and historical token usage. No empty plan/billing blocks.
3. **Personal multi-account without identity assumptions:** owner can name separate personal sources. Show account authenticity/attribution as `verified` only after a supported identity read, not because of the local alias.
4. **Account-independent refresh and cancellation:** one account/source error never rewrites others. Manual refresh independent; if ever approved live, poll only with backoff and limited concurrency, after explicit opt-in.
5. **Conditional threshold notifications:** only for verified fresh values; optional local-history pace/burndown must be explicitly tagged estimated, use enough samples, and must not claim precise depletion from old events. Rate-limit reset notifications must be event-based, not from a fabricated payment date.
6. **Read-only reset-credit status:** only show availableCount, safe status and individual expiry when officially reported. Never call consume or show action to spend/reset credit.
7. **Privacy-first defaults:** no browser cookie scraping, `auth.json` import, credential swapping, consent-free token scan, always-on localhost HTTP server or auto-start side effect. External usage page may be offered without reading or storing browser cookies.
8. **Provenance- and time-aware histories:** separate quota burndown (observations) from local token charts (events) and billing (different authority). Preserve capture timestamps, gaps and shared source identity; do not turn gaps into zeroes.
9. **Low-noise tray:** allow user pin one or more personal account windows and use the lowest verified remaining percentage only if the inputs are fresh and from the same intended source; never collapse unknown into 100% or 0%.
10. **No copied competitor design:** maintain Quotafern's own Soft Native visual language, keyboard navigation and 320–420px desktop layout; license/attribution check before reusing code/artwork.

## Priority and final ATM decision

**Adopt as product patterns (design approved, implementation not):** truthful missing-field omission, compact per-account status, distinct provenance/freshness, explicit per-window percentages/resets, personal multi-account isolation, carefully labeled local history and estimates, manual refresh/error handling, per-account stale/error survival, and restrained notifications.

**Investigate before implementation:** optional local-observed quota scanner, file-scope privacy and per-account provenance; a new provider-authorized quota-only interface (if OpenAI publishes one). This is a **new alternative that does not require the blocked app-server startup**, but it is not yet equivalent to a live adapter and still needs safety acceptance.

**Do not adopt:** copying first-party OAuth IDs/refresh mechanisms; reading `~/.codex/auth.json` or browser cookies; undocumented backend `wham/usage`; daemon/CLI credential promotion; triggering `codex app-server` despite known startup side effects; local HTTP API enabled by default; claiming enterprise/organization data.

**Implementation readiness gate:** This document is research and **does not tell Codex to write code**. Before issuing any implementation prompt, close the remaining candidate-specific **privacy model, account attribution and local-source contract** with synthetic fixtures and independent review. If account identity cannot be authenticated without credentials, explicitly release a **single unverified local source** view rather than promising per-personal-account quota. Production live Codex monitoring remains **NO-GO** regardless of whether this passive lane becomes acceptable.

## Sources

- [Versioned Codex research exit](codex-research-exit-01.md)
- [Codex startup threat review](codex-security-review-02.md)
- [Codex-specific implementation scope](codex-research-01.md)

Readme descriptions and upstream code may change; prior to any code work pin vendor commits, record verification dates and audit license terms. Public documentation is not a permission to reuse another application's credential grant.
