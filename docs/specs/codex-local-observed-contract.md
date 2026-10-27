# CODEX-LOCAL-01 — Passive last-observed quota contract (design only)

**Design decision:** 2026-10-26. **Implementation status:** NOT STARTED / NOT AUTHORIZED. **Product:** one Quotafern owner, personal Codex Free, Go, Plus or Pro only. **Source:** version-pinned existing Codex `rollout-*.jsonl`, if the user opts into this separate privacy-sensitive local read.

This contract is **not** a live Codex connection, a supported third-party quota API, an OAuth scheme, or a way to verify account identity. Its purpose is to make a future restricted Codex implementation unambiguous while the production live gate remains closed.

## A clear decision hierarchy

1. **Never** start `codex`, `codex app-server`, a headless TUI or a background service just to obtain a passive source. Do not read Codex `auth.json`, keychains, CLI config, browser sessions or private REST APIs.
2. User explicitly opens **Local observations** and grants a separate source-folder read. Nothing is scanned when browsing Accounts/Overview or launching Quotafern. Remembering a folder/automatic polling is **off** and needs its own later security approval.
3. The authorized scan reads only already-written and eligible session/archived-session files with a bounded, Rust-owned parser. No provider network, file mutation, optional package download or local HTTP server. Never read transcript text _as a result field_ or export it to the renderer.
4. Only verified-shaped, recent, source-specific **observations** may appear with label **Last observed** and exact `observedAt`. They are neither live, authenticated, nor guaranteed up-to-date.
5. If the scope cannot be met on a platform or a source is ambiguous, report unavailable/source-unverified instead of relaxing it. Demo and live remain separate.

## Explicit native data contract proposal

Proposed wire shape, **not implemented**:

`source = "local-observed"`  
`providerId = "codex"`  
`sourceId = opaque Quotafern-managed local observer id`  
`accountBinding = "unverified"`  
`observedAtMs = exact validated JSONL event timestamp, not scan time`  
`scannedAtMs = local scan timestamp`  
`state = "recent" | "stale" | "expired" | "unavailable" | "invalid"`  
`windows[] = { id: safe source/bucket/window label, remainingPercent: 0..100 or absent, resetAtMs: validated timestamp or absent, durationMins: validated positive duration or absent }`  
`observedPlan = "free" | "go" | "plus" | "pro" | absent` **historical metadata only**, not an authenticated current account plan  
`diagnostic = finite fixed code only`

No account ID, user email, session UUID, absolute path, JWT, auth method, private event payload, prompt, project directory, model tool result, raw usage JSON or raw provider error crosses the Rust-to-renderer boundary. Avoid labels derived directly from file content that could reveal user identifiers.

**Identity policy:** The local `sourceId` identifies the explicitly selected data source, **not the ChatGPT account currently logged into that directory**. The current user's `account` and `plan` must not be marked verified from a log. Even with an `observedPlan`, the compact account card must not render a current Free/Go/Plus/Pro badge unless a separately supported, current identity source exists. Historical details may eventually say _Observed plan (account unverified)_, but omission is preferred over ambiguity.

## Parsing and coverage

Pinned source references:

- https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/protocol/src/protocol.rs (`TokenCountEvent`, `RateLimitSnapshot`)
- https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/rollout/src/tests.rs (canonical `event_msg/token_count` fixture)
- https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/core/src/session/mod.rs (`update_rate_limits`, `send_token_count_event`)

- Match outer `type="event_msg"`, nested `payload.type="token_count"`, validated outer `timestamp`, and nested object `payload.rate_limits`; do **not** parse arbitrary content as a quota.
- Require a recognized Codex `session_meta` envelope for eligible session-file provenance. Files missing provenance are skipped.
- Parse `rate_limits.primary`, `rate_limits.secondary`; each field optional. Preserve any supported independent rate-limit identity. Treat `plan_type` as source-observed only. Do not default absent limit/window names to 5h or 7d.
- `used_percent` must be a finite JSON number inside 0–100. `remainingPercent = 100 - used_percent`. Zero is valid. Null, string, negative, overflow, 101+, malformed or unrecognized scope becomes **absent** with no fabricated zero.
- `window_minutes` positive finite bounded; `resets_at` validated Unix seconds converted to JS-safe milliseconds. Prefer no reset display to guessing from `resets_in_seconds` or from a local calendar.
- Match windows by stable provider metadata/window duration if available, never assume `primary` is always shorter and `secondary` always weekly. Unrecognized or contradictory descriptors remain generic, not relabeled.
- Use the newest **validated** event timestamp within a single source. A malformed newer event must not convert an older successful result to live, and an unobserved source must not inherit another source's reading.
- If reset has already passed at display time, **hide the active remaining value**, because old usage percentage cannot represent the new window. Display historical capture only in an explicitly historical surface, never with a countdown implying the latest balance.
- Fixed proposed `CODEX_FRESHNESS_MS = 5 * 60_000` is suitable for consistency with dormant F3. Even an observation younger than this is labelled **Last observed**, not Live. Older observations are `stale`; historical values may be retained only with time and provenance. A scan that finds no newly written event must not stamp old data as freshly observed.
- Local token usage in `info.last_token_usage` or `info.total_token_usage` is an **independent optional feature**, not a quota measurement and not automatically converted into cash.

## Consent, filesystem and resource bounds to review

A later Rust implementation must define and test bounded limits, including: explicit trusted root selection, no recursive traversal beyond the expected sessions date tree, allowlisted regular files, no user-provided arbitrary path in Tauri IPC, symlink/junction/reparse-point rejection, no network/filesystem writes, maximum file count/size/line bytes/time and total memory, cancellation of a running scan and immediate data invalidation when source is removed.

**Proposed conservative initial envelope (not benchmarked):** scan only the most recent 14 days, at most 64 eligible rollout files, at most 64 MiB aggregate bytes read, each physical line at most 256 KiB, and fail closed when these bounds cannot cover useful recent data. These are design defaults to be independently performance-tested and adjusted with explicit evidence; do not silently hide incomplete coverage. Scan is a **manual user action by default**; no periodic timer, file watcher, login startup scan or persisted permission without its own privacy approval.

The implementation cannot promise **not to inspect** arbitrary line bytes because reading the JSONL file necessarily reads them. It can and must promise: only restricted lines are parsed into structured quota results, all other content is discarded immediately, and raw content never enters logs, IPC, caches, snapshots, crash artifacts or telemetry. Test with deliberate secret canaries in adjacent input records.

## UI states and user comprehension

Use existing Soft Native design, with no fabricated field:

- **Local Codex observations** — `Last observed 2 minutes ago`; display observed quota windows and verified timestamps only. Account attribution unverified.
- **No recent observation** — truthful status, not a 0% quota and not a fake `Connected` card.
- **Expired observation** — keep optional last-observed timestamp; do not present the old remaining as a current remaining balance.
- **Unsupported plan or missing quota** — omit the plan/remaining rows; no N/A/Unknown fields, empty sections or renewal dates.
- **Source removed/revoked** — remove in-memory readings and descriptor on requested cleanup; no attempt to log out of Codex or delete the user's logs.

Data-source selector and source age are visible in details. A future real `live` source can coexist only after its independent provider/security gates pass. No silent fallback from live to local-observed.

## Synthetic acceptance requirements (Codex to implement only after owner approval)

1. Free/Go/Plus/Pro event variants, unknown and organization plan values; no current plan verification based solely on local logs.
2. `used_percent` valid 0%, 100%, decimals, missing, string, infinity-equivalent, negative, >100, overflow, nonsense; retain zero-vs-unknown.
3. Primary and secondary order reversed, absent one or both, non-5h and non-weekly windows, unknown IDs and duplicate IDs; no fabricated labels.
4. Valid 32/64-bit Unix timestamps, future reset, past reset, malformed timestamp, clock-skew/future observation and daylight-saving transitions.
5. Older valid event followed by malformed or incomplete tail, burst of appended writes, rotated/archive files, two sources with identical plan/alias, session-level account changes without verified identity.
6. Files with prompt/code/key canaries adjacent to legitimate quota events; parser must not send any canary, raw text or path across IPC/logs.
7. Long lines, oversized files, symlinks/junctions, path escape, Unicode paths, invalid UTF-8 and missing/permission-denied directories; bounded failure and no arbitrary reads.
8. Manual scan cancellation/removal while a result is in flight: generation invalidates; late results discarded; no provider/logout side effect.
9. Explicitly verify that mock/live flags remain disabled, the executable was never discovered/launched, no credential store touched and no HTTP requests were emitted.
10. Windows/macOS/Linux source fixtures; compiler/CI passing is not proof of native file authorization behavior. Record platform-specific NOT RUN status faithfully.

## Unresolved facts outside the design

- The local record does **not** establish current authenticated account identity, and an external Codex login may replace which account uses the same file root.
- A source may have no `rate_limits` event if the user has no recent turn or has disabled persistence.
- The log shape is version-pinned upstream implementation evidence, not a supported stability promise. A Codex update can change its structure.
- This design does not clear auth/G1, app-server startup/G2, or all-OS process/G3 for future **live** connections.

These unknowns are explicitly modeled as unavailable/last-observed rather than pending implementation decisions. **No more questions are required to implement a limited truthful _synthetic parser_ if that work is later approved; native file-read consent and acceptance remain security gates.**

## References

- [CODEX-ATM-01: competitive benchmark and adoption decisions](../reviews/codex-atm-competitor-benchmark.md)
- [CODEX-RESEARCH-EXIT-01: live monitoring verdict](../reviews/codex-research-exit-01.md)
- [CODEX-SEC-REVIEW-02: existing launch/security blockers](../reviews/codex-security-review-02.md)

**Owner approval required before any source-code implementation.** Research documentation alone is not live or filesystem permission.
