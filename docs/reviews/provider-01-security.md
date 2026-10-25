# PROVIDER-01: Initial security and evidence review

**Date:** 2026-10-26. **Reviewer:** ChatGPT, first-pass research/security assessment of the Draft PR documentation and official public provider contracts. **Not** an independent second-reviewer attestation, pen test, native runtime test, approval to obtain credentials, or live integration acceptance.

**Review scope:** `docs/plans/provider-01-official-capability-matrix.md`, `docs/specs/account-plan-billing-contract.md`, documentation index, existing ACC-01/ACC-04 boundaries and F3/SEC-01/SEC-02 gates. The PR changes only Markdown; no production Rust, Svelte, Tauri permissions, CSP, native process launches, OAuth, dependencies or network calls are in scope.

## Decision

- **Documentation-only design:** acceptable for continued review; the no-empty-field rule is fail-closed and improves data correctness. Subject to exact-HEAD CI, link checks and a separate human/independent security review before any provider implementation is approved.
- **OpenRouter regular API key:** **NO-GO live** until an approved way to constrain the credential's inference and spend capability exists, or an explicit risk/permission architecture is separately accepted. Endpoint method GET does not make the bearer credential read-only.
- **OpenRouter management key:** **NO-GO for Quotafern monitoring**. Official docs say management keys are unscoped across account workspaces and can create/update/delete API keys. Although they cannot call completions, their administrative authority is not proportionate to displaying a credit balance.
- **GitHub Copilot paid self-billed individual:** **CONDITIONAL research candidate**. Official user AI credit usage REST supports fine-grained `Plan: read` and user-scoped GitHub App tokens for users who purchased their own Copilot plan; it is consumption reporting, not automatically a valid remaining quota or subscription expiry. Need entitlement/allowance source, billing owner and permission verification before any live implementation.
- **GitHub Copilot Free or org/enterprise:** **NOT ESTABLISHED** for Quotafern's personal user endpoint. Org reporting requires `Administration: read` and different payer/ownership; do not escalate privileges automatically.
- **Codex, Claude subscription, Gemini CLI:** **NO-GO live** under present evidence and security gates. Static public tier limits do not equal account-bound remaining allowance. Never start a provider CLI or harvest another application's tokens to fill optional display fields.

## Findings and required disposition

### H-01: Monitoring with inference-capable OpenRouter key is over-privileged — BLOCKER

`GET /api/v1/key` includes per-key usage, `is_free_tier`, free-model daily requests and key expiry; a standard bearer API key also authenticates completion calls. A read-only HTTP method does not constrain the authority of the bearer. Possession/exfiltration may permit spending within the key's available limit.

**Disposition:** no live connection, key import or OAuth-generated OpenRouter key without review of precise permission architecture, bounded exposure, revocation, and owner consent. Rate/credit limit reduces impact but does not convert the key into monitoring-only. Any OS-protected storage is necessary but does not fix over-privilege by itself.

### H-02: OpenRouter management credential has broad administrative scope — BLOCKER

Official management-key docs state keys are **unscoped** account-wide, cannot call completions, and can create/update/delete keys (plus other administrative operations). The `GET /api/v1/credits` endpoint requires such a management key.

**Disposition:** do not request/store a management key just to display credits or paid status. Hide account-level credit fields until a safely constrained authorized alternative is demonstrated.

### H-03: Account/source binding and stale response bleed — REQUIRED BEFORE LIVE

Two same-named accounts, sessions, workspaces or keys can have different usage and different billing owners. A late response after Disconnect/Remove/Change Account could display the wrong source, a stale billing date or double-counted wallet.

**Disposition:** Rust-owned connection generation, cancellation and cleanup; source-specific stable IDs, verified billing ownership, and response generation equality. Unknown shared billing remains unknown, never double-counted. Renderer may not forge cleanup receipts.

### M-01: GitHub AI Credit billing report is historical usage, not full entitlement — OPEN

User-level report is scoped to *personally billed paid users*, while GitHub organization/enterprise reporting has distinct privilege and payer ownership. The report's consumed credits cannot be subtracted from arbitrary static plan limits without proof of current allowance and adjustments. Free users' applicability is unverified.

**Disposition:** prefer investigating `Plan: read` user-auth for eligible individuals first; do not use an org admin grant as the default. Prove inclusion, effective allowance, reset boundary and whether usage includes additional paid credits before showing percentage/remaining. Suppress plan/billing fields absent independent authority.

### M-02: Truthfulness and minimization of optional billing fields — MITIGATED IN DESIGN

Plan type, spend, budget resets, key expiry, billing-period resets, renewal, next charge, and access expiry are distinct. A static public Free allowance is not the current user's balance. Empty placeholder rows, manually entered dates, guessed charge recurrence and unsupported subscription labels increase misunderstanding and optional data-collection surface.

**Disposition:** owner-approved PLAN-01 now **omits** unavailable plan/Free/Paid/billing/date fields and entire empty panels; adds **no manual fallback**, payment prediction, storage or reminders. A separately visible Not connected/Permission required state may explain monitoring without misrepresenting quota. Must be enforced through negative UI fixtures before merging implementation.

### M-03: Permission, secret lifecycle and native network boundary — REQUIRED BEFORE LIVE

ACC-04 `localStorage` is plaintext presentation metadata only. Raw provider credentials, billing identifiers and HTTP response bodies have no approved renderer storage path. Provider authorization does not follow automatically from identity login or CLI installation.

**Disposition:** separate ACC-02 native coordinator, ACC-03 OS-protected app-owned secret lifecycle, explicit consent/Disconnect/revoke, TLS with fixed allowlisted HTTPS endpoints, typed allowlisted IPC commands, strict response bounds, redacted logs, cooldown/timeouts, fail-closed 401/403 and no automatic startup polling. Prohibit inference requests, purchases, token or grant harvesting and privileged key-managing calls. Review CSP/capability changes separately.

### M-04: Provider documentation and terms are mutable — OPEN

Current pages describe endpoint schemas but do not prove that third-party Quotafern monitoring using available credentials is allowed on each provider/account type. Some capabilities are published only as human-facing UI. Future pricing, tier limits and free-plan accessibility can change.

**Disposition:** require provider-specific dated terms, official permission/scope and protocol evidence, and decision records. Lack of authorized machine-readable remaining quota means the numeric component is omitted rather than approximated.

### L-01: Missing runtime proof is not a negative result — ACCEPTED DOCUMENTATION LIMIT

This is a Markdown-only PR. No authenticated read, secret storage, Windows/macOS/Linux GUI, network containment, contract tests or version-pinned adapter integration has been executed.

**Disposition:** explicitly retain NOT RUN. CI can verify formatting and existing app regression only, not security acceptance of future connections.

## Provider next-step recommendation

**First explore GitHub's self-purchased Copilot individual AI credit report with `Plan: read`**, because its documented token permission is narrower than OpenRouter's standard inference key and much narrower than OpenRouter's unscoped management key. This is a **research priority**, not a declaration that it already provides a true remaining balance, Free support, direct paid-plan name or renewal date.

**OpenRouter may remain an API-data research track** for free-model per-key daily quota, but should not be the first production live adapter merely because it returns rich numbers. Account credit reads via management key must stay out of scope.

If a provider offers only historical spend, show an appropriately labelled usage figure **only when verified and useful**, without inventing remaining percentage, plan name or payment dates. If no accurate useful field exists, do not activate an adapter simply to display placeholders.

## Required negative acceptance matrix before any live provider PR

1. Deny attempts to submit a generic executable, RPC method, URL, token, arbitrary provider operation, purchase or inference call through renderer IPC.
2. Force unauthorized, expired, revoked, malformed, oversized, slow and replayed results; never fall back to synthetic quota or persist secrets.
3. Reject late response after connection switch, account remove, disconnect, native cleanup, application exit and multiple same-name account selection.
4. Verify Free-known + quota-known; Free-known + quota-unavailable; plan-unknown + valid usage; paid-known + billing-unknown; account key expired + subscription still active.
5. Enforce strict hiding of unavailable plan labels, numeric quota, Next payment, Renewal, Access expires, key/credit expiry and empty sections, with honest connection status.
6. Verify billing owner: self-billed Copilot vs organization-paid seat; shared OpenRouter account wallet vs key-level limits; currency/unit separation; unknown relationship does not deduplicate or sum.
7. Simulate response data `is_free_tier`, `free_model_daily_requests`, monthly key reset, API-key expiry, historical AI Credit report and calendar-month resets without automatically inferring payment or plan tier.
8. Security audit secret handling, OS keychain deletion, lifecycle/revocation, CSP/permission diffs, headers/log redaction and accidental telemetry; no real developer/CI credentials.
9. Run synthetic source + production browser tests, native Windows owner acceptance, and macOS/Linux acceptance when devices exist; compilation alone is not native evidence.
10. Obtain **independent** security review and explicit owner approval **before** implementing or enabling any live adapter.

## Official documentation rechecked

- OpenRouter current key fields: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key
- OpenRouter credential use (completion capability): https://openrouter.ai/docs/api_reference/authentication
- OpenRouter management keys (unscoped admin rights): https://openrouter.ai/docs/guides/overview/auth/management-api-keys
- OpenRouter credits requires management key: https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits
- OpenRouter OAuth code exchanges for API key, not proven read-only grant: https://openrouter.ai/docs/api/api-reference/o-auth/exchange-auth-code-for-api-key
- GitHub REST AI credit usage, payer distinctions and permissions: https://docs.github.com/en/rest/billing/usage?apiVersion=2026-03-10
- GitHub Copilot allowance/reset differs from charge date: https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing
- [PROVIDER-01 research](../plans/provider-01-official-capability-matrix.md) and [PLAN-01 display rules](../specs/account-plan-billing-contract.md).

**Net finding:** No production vulnerability introduced by this documentation-only PR; **live integration authorization remains blocked**. This first-pass review does **not** replace independently reviewed implementation design, native security or real platform acceptance.
