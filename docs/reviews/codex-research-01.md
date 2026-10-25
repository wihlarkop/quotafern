# CODEX-RESEARCH-01 — Official quota authorization and startup safety

> **2026-10-26 scope update:** CODEX-LIVE-01 authorizes a separate consented, native direct-HTTP adapter using selected Codex file credentials and isolated Codex-managed login. The historical app-server/SIWC conclusions below remain evidence for those routes, not a prohibition on the new route. Both old app-server gates remain closed. See [current direct integration](../security/codex-live-01.md); live direct activation still requires security and owner acceptance.

**Status:** Draft research, 2026-10-26. **Scope:** OpenAI Codex personal Free/Go/Plus/Pro accounts only, documentation and synthetic acceptance planning. No real login, CLI execution, account read, secret inspection, source change, Tauri permission change, live gate change or release.

## Goal and user-facing truth

Determine whether Quotafern can show the current user's Codex plan, each authoritative remaining quota window, reset time, activity and optional credit balance using a documented and appropriately authorized read-only method. If a provider does not supply a trustworthy plan name, Free/Paid classification, renewal, next payment or expiry, **omit that optional field and its empty section**. A missing quota is **not** zero; retain an honest separate disconnected/permission/unavailable state.

- **Plan coverage:** Official documentation says Codex is included across ChatGPT plans, including Free and Go. Exact limits and model availability vary by plan and account/workspace; a public tier description is **not** a current account entitlement. Do not assume every Free/Go account supports the same bucket or Codex Cloud (which is separately restricted).
- **Read semantics:** Documented app-server `account/read`, `account/rateLimits/read`, and optional `account/usage/read` can expose plan classification, independent primary/secondary windows, percentages, reset timestamps, credits, spending and token activity when actually returned. Do not fabricate unavailable fields. Unsupported future schemas fail closed.
- **Plan labels:** A returned `planType` is an observed Codex/ChatGPT usage-plan classification, **not** authenticated subscription billing status. Do not derive invoice amount, renewal date or payment schedule from this field.
- **Independent sources:** Each personal Codex account can report multiple authoritative quota windows or limit IDs; do not add percentages, double-count related buckets or infer another account's allowance.
- **Reset distinctions:** `resetsAt` for the 5-hour, weekly, monthly or source-specific window is not the billing date. Banked one-time reset expiry is not subscription expiry. Quota display remains source/window-specific.

## Existing Quotafern foundation

F3 is merged, dormant and **live disabled**. The Rust bridge implements fixed JSONL stdio protocol, response bounds, correlation, normalized rate windows, mock process containment, static diagnostics and manual refresh with cooldown. It does **not** prove authenticated native acceptance. The account catalog/aliases from ACC-04 are local disconnected metadata, not login grants.

- `LIVE_CONNECTION_ENABLED = false` in Rust.
- `CODEX_CONNECTION_AVAILABLE = false` in Svelte.
- Do not modify either constant in this research milestone, or add a runtime override.
- Do not copy Codex CLI `auth.json`, read OS credential stores, reuse an app's OAuth token or switch the CLI's active account.
- Never spawn app-server, contact a real account or call a paid reset/purchase/inference operation merely to determine usage.

## Independent auth and startup blockers

1. **Startup policy:** The pinned `rust-v0.164.0` app-server source can resolve persisted Remote Control enrollment and establish outbound Remote Control even when its primary RPC transport is `stdio://`. This may expose unintended remote-control capabilities. No published quota-only per-launch opt-out was accepted in F3. Do not rely on the internal disabled-start marker or alter saved user configuration.
2. **Background side effects:** Cloud-config and model refresh may run during app-server startup independently of rate-limit RPC calls. Stdio and an RPC method allowlist do not prove no unrelated networking or credential refresh.
3. **Monitoring grant:** Sign in with ChatGPT documents identity `openid profile email` and separately authorized inference scopes. Neither is an expressly documented least-privilege Quotafern quota-monitoring grant. The pinned external ChatGPT-token account path had a documentation/source mismatch and an internal-only CLI marker.
4. **Process containment:** On Linux/macOS, SIGKILL/forced parent exit can bypass teardown and leave a child running; native parent-death/supervisor strategy remains a blocking requirement. Windows mock and owner GUI acceptance do not prove Unix cleanup.
5. **Multi-account isolation:** F3 was single-session. Separate local account aliases cannot safely switch CLI login identities. A future Rust coordinator must own connection generations, identity binding and native cleanup, without asking the renderer to certify teardown.

**Current decision: NO-GO live.** An official published way to read plan usage inside Codex's own UI or `/status` is not evidence of an authorized side-effect-free third-party polling method.

## Required next research inside this Codex PR

- Reverify the latest **supported Codex app-server version** versus F3's pinned 0.164.0: public startup controls, remote-control state, cloud config, model refresh, and compatibility with existing RPC response schemas.
- Determine whether OpenAI offers a genuinely **quota-only** startup policy, direct official read-only endpoint, or separately granted monitoring token without inference entitlement. Capture exact version/source lines; do not invent undocumented switches.
- Verify which provider-returned plan/entitlement fields distinguish **personal Free, Go, Plus and Pro** without treating the API-key mode as a ChatGPT subscription. Unsupported Team/Business/Enterprise or organization-specific plan variants must be safely omitted; do not research or implement organization access.
- Confirm the meaning of every per-window `usedPercent`, `resetsAt`, credit, spending limit, earned reset and activity field; unknown/null/malformed values and different time windows remain separate.
- Address forced-parent process cleanup on Windows/macOS/Linux, including startup failure, timeout, disconnect, process tree descendants and user-account changes.
- After independent security review, prepare **synthetic-only** DTO/transport tests and an explicit owner-native-acceptance checklist. Never perform authenticated acceptance without separate approval.

## Fail-closed acceptance checklist for a future implementation

- Absent plan => no plan field or placeholder; confirmed Free with actual quota => Free and observed quota; confirmed Free without quota => Free only with no numeric quota.
- Unknown plan + valid source quota => show verified quota without inventing tier.
- Independent 5-hour/weekly/monthly buckets preserve exact source identities and reset times; no sum of percentages.
- Confirmed `remaining=0` differs from missing, malformed, stale, revoked, permission-denied or not connected.
- No payment, subscription expiry, renewal, invoice or banked-reset expiry mislabelling.
- Duplicate local aliases and race between account switch/refresh/disconnect cannot show account A's values under account B.
- Renderer can only call fixed bounded operations; no arbitrary CLI flags, RPC, process, URL, token or untrusted raw diagnostic.
- A no-live-gate build never discovers the Codex executable, starts it, reads credentials, or silently loads demo values as live.
- Native forced shutdown removes descendants; per-OS tests and explicit security approval recorded separately.

## Official sources and repo evidence

- OpenAI Codex availability, Free/Go and plan usage: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- One-time banked versus purchased resets: https://help.openai.com/en/articles/20001498-how-resets-work-in-codex
- OpenAI app-server documentation: https://learn.chatgpt.com/docs/app-server
- SIWC app-server behavior (inference authorization, not a quota grant): https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- [F3 integration and schema](../security/codex-integration.md)
- [Pinned startup security investigation](../security/f3-startup-security-investigation.md)
- [ChatGPT scope decision](../security/chatgpt-auth-decision.md)
- [Multi-account model](../specs/acc-01-architecture.md)
- [Security roadmap](../plans/security-roadmap.md)

Provider contracts and version-specific source can change; reverify before any implementation. This research **does not lift F4, SEC-01 or SEC-02 gates**.

## Research exit decision (2026-10-26)

See [CODEX-RESEARCH-EXIT-01](codex-research-exit-01.md): public-source research is **complete** for pinned v0.164.0, with **NO-GO live** because monitoring authorization, safe quota-only startup and Unix forced-parent child containment remain unresolved. Optional plan and quota mapping are ready for separately owner-approved **synthetic-only** implementation by Codex; there is no production authorization, current-plan billing API, payment-date fallback, authenticated test or safe live startup claim. Pause at this research boundary until the owner separately approves implementation.

## Follow-up security decision (2026-10-26)

The version-pinned [CODEX-SEC-REVIEW-02](codex-security-review-02.md) confirms that the stable Codex 0.164.0 release still does not establish a supported quota-only app-server startup mode. The documented rate-limit RPC is technically suitable for synthetic normalization, but persisted Remote Control restoration, startup cloud/model refresh, monitoring authorization and Unix forced-parent cleanup are independent live blockers. The managed daemon's disable-remote-control operation mutates daemon settings and is not a safe substitute for a per-launch monitor policy. All live flags remain false. Future scope in this Codex-only PR is security evidence and synthetic acceptance; no authenticated API call or CLI launch is approved.
