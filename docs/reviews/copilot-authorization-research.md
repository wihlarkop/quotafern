# GitHub Copilot: Individual AI Credits authorization and monitoring feasibility

**Assessment date:** 2026-10-26  
**Stage:** PROVIDER-01 / COPILOT-AUTH-01 — public official documentation research only.  
**Outcome:** **CONDITIONAL GO for synthetic design / proof-of-contract; NO-GO for live connection or remaining-quota claims.**  
**Scope exclusions:** no GitHub App registered, no OAuth/device authorization performed, no API token obtained or read, no authenticated billing endpoint invoked, no provider adapter, no renderer/native changes, no automatic polling.

## Executive decision

An eligible user who **personally purchases** GitHub Copilot can, according to GitHub's official REST contract, request an AI Credit **usage report** with a GitHub App **user access token** or fine-grained personal access token carrying **user-level Plan: read** permission. A GitHub App device authorization flow is documented for desktop software; unlike its web authorization flow, it does not require embedding a GitHub App client secret. The resulting credential still needs explicit native consent, secure ownership/storage and lifecycle isolation.

The endpoint provides **historical consumed AI Credits**, not a verified current subscription name, current remaining allowance, accurate remaining percentage, remaining number of completions, upcoming invoice, renewal or expiry. These optional Quotafern fields must **not** be shown without their own authorized, authoritative data. A published pricing/plan table is insufficient evidence of what this account actually has.

**Separate payer paths:** an organization- or enterprise-paid Copilot seat is explicitly excluded from personal billing reports. Do not escalate to organization **Administration: read** just to populate an individual's dashboard; that is a different, privileged adapter requiring separate review.

## Official API and authorization contract

- **Usage read:** `GET https://api.github.com/users/{username}/settings/billing/ai_credit/usage`
- **API version:** `X-GitHub-Api-Version: 2026-03-10`; recommended media type `application/vnd.github+json`.
- **Permitted token types:** GitHub App **user** access token or fine-grained personal access token.
- **Documented permission:** account/user permission `Plan: read`. This is **not** a repository permission. Do not add repository Contents, Actions, write/admin, enterprise or organization grants.
- **Parameters:** optional year, month, day, model, product. Only data from the preceding 24 months is documented as accessible.
- **Response family:** `timePeriod`, `user`, and `usageItems[]` entries carrying fields such as `product`, `sku`, `model`, `unitType`, `grossQuantity`, `discountQuantity`, `netQuantity`, `grossAmount`, `discountAmount`, `netAmount`.
- **Errors:** documented 400/403/404/500/503 (401 is possible for invalid credentials). A 200 with empty results is not proof of Free status or zero remaining; a 403 is not proof the account lacks a Copilot subscription.
- **Source semantics:** per-user **billed usage**, not included base/flex allowance, all features' model-request entitlement or future payments. Filter to intended Copilot AI Credit products/SKUs and compatible units. Do not add dollars to credits or conflate net billed units, gross usage and allowance depletion without a documented relation.

**Authenticated identity binding:** `GET https://api.github.com/user` supports GitHub App user tokens with no additional fine-grained permission. Use its immutable numeric user `id` as the verified account identity and its returned `login` only as the canonical current REST path value. A user-controlled alias or username field must **not** determine a privileged billing query. The `plan` property shown in some examples of `GET /user` refers to a **GitHub account plan**, not an established Copilot Pro/Pro+/Max subscription; never use it to label Copilot's paid tier.

## Native local-first authorization recommendation (proposed, not implemented)

1. Owner approves registration of **a minimal GitHub App** with only **Account / Plan: read**, no repository access, no install-wide admin permission, no workflow write permission; inspect the resulting GitHub consent screen independently.
2. Explicit user action starts **GitHub App Device Flow**, separately for each local connection. Show the GitHub-provided code and `https://github.com/login/device` in a native-scoped UX with clear user cancellation. Never silently use an existing GitHub CLI, browser or Copilot credential.
3. Rust-only `POST https://github.com/login/device/code` uses public app `client_id`. Generate an authorization attempt id tied to local connection id and generation. Treat `device_code` and user access tokens as confidential; never emit them to the WebView, logs, crash reports or URLs. The human `user_code` can be displayed, not stored or reused.
4. Rust polls `POST https://github.com/login/oauth/access_token` with `client_id`, `device_code` and grant `urn:ietf:params:oauth:grant-type:device_code`. Respect the returned `interval`, `expires_in`, `authorization_pending`, `slow_down`, `expired_token`, denial and cancellation; no unbounded background polling.
5. On success, verify `GET /user` _under that same token_ before marking an account bound. Persist at most a separately approved opaque mapping of local account/connection to verified GitHub numeric user id. Distinguish user alias from GitHub login. Drop results if connection generation changed while authentication/read was in flight.
6. Only then may a separately approved connector make the fixed read request, and only to that bound user's `login`. Use strict HTTPS host allowlist and bounded response sizes/times, correlation, freshness and static error categories. Device authorization does not establish eligibility for self-paid Copilot billing.
7. **Do not implement auto-remember or reconnect by default.** Expiring GitHub App user tokens are documented as typically 8 hours and refresh tokens 6 months. Official refresh guidance says `client_secret` is **not required when the original user token came from device flow**. Nevertheless refresh-token storage, rotation, revocation, native custody and restart behavior require a separate ACC-03 security approval. If that approval does not exist, do not persist tokens or auto-refresh.
8. Disconnect/revoke/cancel invalidates native consent and generation before stopping in-flight requests, removes **Quotafern-owned** token material per approved cleanup policy, and never logs a user out of Copilot, GitHub CLI or GitHub.com. Late successes after cancellation are discarded; native confirms cleanup rather than accepting a renderer-generated acknowledgement.

**Why Device Flow:** GitHub explicitly describes it for desktop applications. The alternate GitHub App web authorization flow requires a `client_secret` during code exchange, making direct embedding in a distributed Tauri binary inappropriate. An external callback server is not necessary for the documented device flow. Actual app registration/terms/user experience/permission test are still NOT RUN.

## Account coverage and no-assumption policy

- **Self-billed paid personal Copilot:** _documented endpoint eligibility_, with successful real-account reading still NOT RUN. A read may return historical usage; do not treat an empty report as 'Free'.
- **Copilot Free:** GitHub publicly documents that Free receives a monthly AI Credit allowance and 2,000 code completions/month, but the **self-billed paid user** condition on the billing usage endpoint does not establish Free-tier API accessibility. Do not claim a working Free-quota integration; omit unsupported remaining and plan metadata.
- **Copilot Student:** public individual offering also has AI Credits; direct authorized per-user billing report eligibility is not established under the paid-purchaser rule.
- **Copilot Pro, Pro+, Max:** advertised plan allowances are documentation reference values, **not proof of the selected account's tier, flex eligibility or remaining**. Tier upgrades/downgrades, discounts and overage billing can change assumptions.
- **Copilot Business / Enterprise / organization-paid seat:** usage billed to the organization **will not** appear through the personal billing endpoint. Organization AI Credit report requires organization-level `Administration: read`; use neither it nor `read:org` as an implicit fallback. Organization billing ownership and per-seat entitlement require a distinct project scope.

## Honest Quotafern UI contract

Only the following fields are candidates if a future permitted read actually succeeds with correct account binding:

- **AI Credits used in a defined period**, properly labelled as _reported usage_, with provider-supplied period and as-of timestamp. Avoid unqualified `Remaining` or `Quota %`.
- **Usage by model/product**, if item categories and units are documented, interpreted correctly and useful. Do not label all GitHub billing items as Copilot usage.
- **Next monthly allowance reset:** GitHub documents a UTC calendar-month boundary, _but this is an official general plan rule, not a guaranteed authorized account-specific reset observation_. Only show as a clearly labelled scheduled calendar reset after separate product/semantics approval; **never display it as next payment**.

Hide, by default, all unsupported fields: Copilot plan name, Free/Paid badge, monthly included entitlement, remaining AI Credits, remaining percentage, next payment, renewal, subscription expiry and organizational billing details. Suppress the entire empty Plan/Subscription/Billing section. Render a separate truthful Not connected/Unavailable/Permission required connection state when needed, rather than an invented 0%.

Beware: `grossQuantity`, `discountQuantity` and `netQuantity` must not automatically be assumed to equal 'included credits used'. Base-plus-flex credit allowance is variable and published per tier; historical billed credits and rollover/upgrades/overages introduce edge cases. Documentation does not establish a safe subtraction formula.

## Security review checkpoints and mock acceptance tests

**Blockers before any live authorization:**

- Independently validate a minimal GitHub App registration, the exact `Plan: read` consent display, and whether the user endpoint is reachable using only the granted user token. No repo access or org admin permission.
- Authoritatively determine if this endpoint can return genuinely useful individual usage while remaining least-privileged. If only a misleading quantity is available, remain disconnected rather than advertise remaining quota.
- Approve Rust-owned device authorization and user-code phishing-resistant UX, fixed endpoints, timeout/cancel/retry limits, log redaction and anti-CSRF/correlation lifecycle under ACC-02.
- Approve access/refresh token ownership, memory handling, OS secret storage or **session-only with no persistence**, revocation and native cleanup under ACC-03/SEC-02.
- Determine whether a separate **read-only Copilot entitlement/allowance** and subscription date endpoint is officially supported. If absent, **omit fields** rather than infer from public tier tables or GitHub core account plan.
- Validate cross-account isolation and explicit normal user vs organization-paid differences; never request `Administration: read` to bypass a personal 403.

**Synthetic negative cases (without any real GitHub auth):**

- Account A/B use duplicate aliases but two verified GitHub numeric IDs; only same-token `/user` identity can bind a billing path.
- Device flow pending, denied, expired, slow-down, polling interval, cancellation, simultaneous attempts, and success after Disconnect/Remove are all fail-closed.
- 401, 403, 404, 429, malformed product/sku/units, overflow, empty usageItems, mixed Copilot and Actions billing items, UTC month boundary, and stale data do not yield fabricated quota/paid status.
- Changing GitHub login while stable numeric id remains constant requires re-read of `/user`; no renderer-controlled username substituted into requests.
- Organization-managed seat gives no personal billed usage. Empty personal report must not suggest zero total Copilot usage.
- Static Pro/Pro+/Max tier allowance, Free marketing copy, core GitHub `GET /user.plan`, and monthly reset are **not** accepted as verified Copilot plan/remaining/payment events.
- Token expiry/refresh/revocation, unauthorized other endpoint attempt, token exposure in logs, process crash and account removal preserve native cleanup and zero secret exposure through renderer IPC.
- No numeric quota bar, percentage, plan badge or billing/expiry placeholders when absent; UI remains clean and connection state remains truthful.

## Decision and next tasks

**COPILOT-AUTH-01 (this document):** research **complete** for officially documented surface and device grant; documentation-only. Not a claim of production authorization, third-party compliance certification or test results.

**COPILOT-AUTH-02 (next):** targeted research / independent threat review of minimal `Plan: read` registration, free-plan API eligibility, verified allowance and correct AI Credit accounting; only public documentation and synthetic contract fixtures until explicit owner authorization.

**ACC-02A / ACC-03A:** native multi-account/generation coordinator and independently reviewed credential lifecycle (not authorized by this PR).

**COPILOT-ADAPTER:** separately owner-approved implementation PR after gates; at first it may legitimately provide only a **'Credits used'** reading, not the main remaining-quota feature. If user goal requires remaining quota first, re-evaluate provider priority instead of inventing a subtraction.

## Official sources reviewed (2026-10-26)

- Personal AI Credit usage REST permission, eligibility and response: https://docs.github.com/en/rest/billing/usage?apiVersion=2026-03-10
- GitHub App user token and Device Flow documentation: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- GitHub App token refresh; device flow exception for client secret: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
- GitHub App minimal permissions: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- Authenticated GitHub user endpoint: https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10
- Current Copilot AI Credits, base/flex, month reset and Free: https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing
- Self-billed versus organization-managed Copilot plan: https://docs.github.com/en/copilot/how-tos/manage-your-account/view-and-change-your-copilot-plan
- [Parent provider matrix](../plans/provider-01-official-capability-matrix.md)
- [Optional-field contract](../specs/account-plan-billing-contract.md)
- [Initial provider security review](provider-01-security.md)

All provider specs and entitlements are subject to change; reverify at implementation time. No authenticated API requests or live provider/desktop acceptance were run.
