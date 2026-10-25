# CODEX-SEC-REVIEW-02 — Version-pinned feasibility and live gate decision

Research date: 2026-10-26. Scope: **one individual's personally owned OpenAI Codex accounts, Free/Go/Plus/Pro only**. Organization and Enterprise features are out of scope for every provider. This is a
documentation-first, source-based security review. It does not authorize or
perform a real CLI launch, ChatGPT login, authenticated quota read,
credential inspection, provider mutation, release or live gate change.
It is not an independent runtime security attestation.

## Decision

**NO-GO for live Codex quota monitoring in the current Quotafern build.**
**GO for synthetic fixtures, source/version compatibility research and
native process-lifecycle design behind both disabled gates.**

There is a documented account/quota **data contract** but no verified
**side-effect-free, least-privilege, quota-only startup and monitoring
authorization contract** for the existing bridge. The current stable
Codex release is `rust-v0.164.0` (published 2026-10-23), the same
version used for the prior F3 investigation. Public source from the
tag and official docs was inspected without running Codex.

No proposed workaround may set an undocumented internal flag, change
the user's saved Remote Control preference, read or copy the
Codex auth cache, or replace native authorization with frontend consent.

## Exact read surfaces and limits

The published app-server protocol includes:

- `account/read` with `refreshToken: false`: current auth/account
  information and `planType` when available. This is neither a
  billing receipt nor a subscription payment schedule.
- `account/rateLimits/read`: individual limit IDs, primary/secondary
  windows, `usedPercent`, reset timestamps, optional credit data,
  spending controls and earned rate-limit reset metadata.
- `account/rateLimits/updated` and `account/updated`: notifications
  that can invalidate or refresh source truth.
- `account/usage/read`: optional token-activity summary and daily
  buckets; unsupported auth modes or null buckets must remain
  unavailable, never converted into fake zero activity.

`account/rateLimitResetCredit/consume`, `account/logout`,
`account/login/start`, `account/sendAddCreditsNudgeEmail`,
turn/inference, general `command/exec`, arbitrary RPCs and
remote-control management **must not** be callable by Quotafern.

The app-server supports many powerful methods; a Rust allowlist
restricts Quotafern's own calls, but cannot prevent independent
startup/background behavior or other clients using Codex.

Only personal ChatGPT Free/Go/Plus/Pro plan types are product targets. Other plan variants may be recognized only to **omit or reject them safely**, never to trigger organization analytics, admin permissions or workspace features.

The auth documents distinguish ChatGPT subscription sign-in from
API-key pay-as-you-go. Only ChatGPT-backed authorized responses
are candidates for subscription rate limits. Public ChatGPT Free,
Go, Plus, Pro and workspace product descriptions do **not** prove
the current user has a particular quota or plan.

## Verified static blockers

### S-01 — Remote Control restoration: BLOCKER

The release-tag CLI can select
`RemoteControlStartupMode::ResolvePersisted` for ordinary app-server
startup. An internal daemon-specific environment marker can instead
select `DisabledEphemeral`, but the marker is explicitly internal
and not an approved public option for a third-party quota monitor.

`--listen stdio://` controls the RPC transport only. It does not
prove an enrolled user's outbound Remote Control is disabled. An
existing persisted enrollment may be resolved by the app-server and
connected; this behavior is conditional, **not** an assertion that
every stdio launch always creates a Remote Control websocket.

The managed app-server daemon's published
`disable-remote-control` command changes the **managed daemon**
setting and can restart its running server. It is not an acceptable
per-connection quota-only switch for Quotafern because it can
mutate/disrupt the user's Codex environment. Quotafern must not call it.

**Required evidence:** documented per-launch isolation that does not
modify a user's settings or restore Remote Control, with pinned-source
and native-network proof. If absent, keep gate disabled.

### S-02 — Independent background activity: BLOCKER

The release-tag app-server creates a cloud-config bundle loader
that can refresh remotely; a model-catalog refresh worker is also
scheduled. Static model catalog configuration, telemetry suppression
and RPC allowlisting do **not** collectively prove quota-only
networking, no state writes or no Codex-owned auth refresh.

`account/read.refreshToken=false` prevents the caller-requested
forced refresh, not Codex-managed automatic token refresh during
other authenticated activity.

**Required evidence:** version-pinned, documented launch effects,
their containment/permission model and an explicit consent policy
that accurately describes any unavoidable side effects.

### S-03 — Monitoring authorization: BLOCKER

Official app-server authentication docs permit some local/open-source
integrations and document account reads, but this does not create a
separate published Sign in with ChatGPT **monitoring-only OAuth
scope**. SIWC identity scopes and inference scopes are not quota
scopes. The experimental `chatgptAuthTokens` mode expects the host
to own the token lifecycle, and the F3 source review recorded
internal-only/source-versus-doc friction for the pinned implementation.

Do not clone OpenAI's OAuth client, request inference privileges
to show a quota, use browser cookies, intercept session traffic,
or read another app's `auth.json` or keychain entries.

**Required evidence:** current official permitted integration method
and independently reviewed account-bound authorization contract.
The existing Codex-managed session plan does not bypass S-01/S-02.

### S-04 — Unix forced parent termination: BLOCKER

Current mock termination handles graceful cleanup and Windows has
atomic Job Object assignment. But on macOS/Linux the parent can
exit via `SIGKILL` or crash without executing Rust destructors,
so process-group cleanup cannot be the sole child-stop guarantee.

**Required evidence:** native supervisor/parent-death strategy
covering descendants, plus cancellation, ungraceful exit and
restart testing on each supported OS. Do not claim a proposed
Linux-only `PR_SET_PDEATHSIG` alone solves macOS.

### S-05 — Account identity and generation: REQUIRED

ACC-04's local aliases and workspaces are **not verified provider
accounts**. The F3 bridge is single-session. A future ACC-02 native
connection coordinator must tie every result to a stable verified
provider account and local connection generation.

Reject stale/late results after switch, Disconnect, revocation,
Remove, cancellation or process death. Duplicate aliases must
not merge identities. Never infer shared billing from identical
planType or limit IDs.

## Plan and billing truth contract

The owner-approved UI rule for Quotafern is **display a field only
when its exact meaning, owning account, freshness and permission
are established; otherwise omit the field and any empty section**.

- Observed `planType` may render a plan label only when it is an
  actual result for the selected authenticated ChatGPT account.
- A known Free tier may have a real quota. Render remaining if the
  source actually reports valid `usedPercent` for its window.
  Do not display Free as zero when a quota is missing.
- Treat separate primary, secondary and named rate-limit windows
  individually. Never add percentages, invent a fixed 5-hour period,
  or subtract limits with incompatible units.
- `resetsAt` and available earned-reset `expiresAt` are quota
  semantics; neither is a subscription renewal/payment/expiry.
- Subscription next payment, renewal, access expiry and invoice date
  have **no verified authorized source in the accepted Codex
  monitoring response**. Hide them, including empty billing panels.
  Do not request manual billing dates.
- A stale account field must not be presented as current. Preserve
  explicit distinct state (disconnected, blocked, permission denied,
  expired, stale) separately from optional numeric fields.
- A source-wide or workspace shared quota must never be counted
  twice across multiple local account/connection descriptors.

## Synthetic-only acceptance matrix

1. `planType=free` with valid 25% used and source reset:
   show Free and observed 75% remaining for that specific window.
   No billing fields.
2. `planType=free` with null/absent quota: Free label only;
   no 0%, no guessed reset or empty billing section.
3. `planType` unknown with source valid quota: show observed
   quota without inventing Plus/Pro/Go or paid status.
4. Paid `planType` known but bill date unavailable:
   show the authorized plan, omit payment/renewal/expiry entirely.
5. Multiple limit IDs with different durations or malformed
   non-null `rateLimitsByLimitId`: preserve source separation,
   reject malformed rather than falling back to unrelated fields.
6. Real observed zero remains zero. Invalid, NaN, negative or
   > 100% usage, missing dates, future overflow, permission denied
   > and stale data must not turn into an invented numeric reading.
7. Account A refresh returns after B becomes current: no A value
   in B's row, even when aliases are equal.
8. Disconnect while child startup/read pending, denied native
   consent, late callback, process crash and forced app exit:
   generation invalidated, no leaked child/credential or RPC data.
9. Renderer attempts to call any unapproved method or pass an
   arbitrary executable path/flag/URL: fixed typed command
   allowlist rejects it.
10. One verified quota source shared across two presentations:
    show once without adding percentages or inferred bill wallet.
11. Token-activity buckets missing/duplicated/malformed:
    unavailable distinct from known zero, no inferred spending.
12. Local metadata reload and Demo preview never authenticate
    or create a production live quota reading.

All fixtures must be synthetic and run with both live gates false;
no real Codex process is needed for acceptance of these tests.

## S-06 — Passive local rollout reading (candidate, not live)

A source-audited alternative to starting Codex may exist: `TokenCountEvent.rate_limits` in local `rollout-*.jsonl` session records. The upstream v0.164.0 parser test verifies the event shape, not that every session includes a quota event or that the log format is a supported stable monitoring API.

**Security review is not yet approved for implementation.** These files may contain prompts, code, private filesystem paths or sensitive outputs. An eventual opt-in scanner requires native-only bounded parsing of validated event types, no exposure of raw lines/other fields, strict realpath/symlink/junction containment, no credentials/network/spawn, per-source event ages and no unverified account association. Any `resets_at` in the past invalidates active remaining quota. A source that is not fresh cannot be called `live` or silently substituted for an authenticated reading.

See [CODEX-ATM-01](codex-atm-competitor-benchmark.md) for the competitor-method comparison, explicit exclusions and proposed acceptance requirements.

## Final research disposition

[CODEX-RESEARCH-EXIT-01](codex-research-exit-01.md) closes the 2026-10-26 public-source research for pinned v0.164.0: **NO-GO live**, with explicit official authorization, safe startup and native child-containment blockers and evidence-based restart triggers. Further CodeX implementation remains a separate owner-approved decision, including synthetic-only work. Nothing in this first-pass security review is an approval to turn on Codex or access a real account.

## Next engineering slices, all blocked from live

1. **CODEX-02A:** compare release-tag source and official docs for
   a publicly supported quota-only app-server launch or
   other read-only authorized quota interface.
2. **CODEX-02B:** design a cross-platform native supervisor and
   per-account generation coordinator, with threat modeling and
   synthetic process tests only. Separate owner approval required
   before implementation.
3. **CODEX-02C:** validate a typed, minimal sanitized plan/quota
   DTO with the above omission rules against synthetic fixtures.
4. **F4 / live gate:** only after explicit official authorization,
   startup and forced-termination proofs, independent security
   review and native owner approval on supported platforms.

Do not silently promote documentation checks, production compilation
or browser snapshots into native/authenticated acceptance.

## Evidence links

- Stable tag (2026-10-23): https://github.com/openai/codex/releases/tag/rust-v0.164.0
- Version-pinned CLI startup: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs
- Internal daemon marker: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-transport/src/transport/remote_control/mod.rs
- Persisted Remote Control: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-transport/src/transport/remote_control/websocket.rs
- Cloud config startup: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/config_manager.rs
- Model refresh worker: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/models_refresh_worker.rs
- Official app-server account and limits API: https://learn.chatgpt.com/docs/app-server
- Official CLI reference, experimental status: https://learn.chatgpt.com/docs/cli/reference
- Official authentication and managed token refresh: https://learn.chatgpt.com/docs/auth
- App-server daemon controls (not quota-only launch): https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-daemon/README.md
- Existing Quotafern detailed startup analysis: [F3 launch gate](../security/f3-startup-security-investigation.md)
- Existing SIWC scope decision: [ChatGPT auth](../security/chatgpt-auth-decision.md)
- Previous research scope: [CODEX-RESEARCH-01](codex-research-01.md)

**Verdict:** documentation and synthetic work may continue; live monitoring
is still disabled and **no provider account was touched**.
