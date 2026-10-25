# PROVIDER-01: Official monitoring capability assessment

**Research checkpoint:** 2026-10-26. **Scope:** documentation and provider contract research only. No network calls to authenticated accounts, tokens, browser sessions, CLI startup, implementation, permission changes, or live enablement. This is a decision record, not permission to connect.

## Objective

Identify the first provider with an **officially documented, permitted, appropriately authorized read-only monitoring route** for quota or usage, with truthful plan/subscription labels, Free or no-subscription behavior, and billing dates only if their source is established. Maintain the provider/account/workspace/connection/quota-source separation from ACC-01 and the F3 closed gates.

**Key distinction:** a publicly documented HTTP endpoint is evidence of a data surface, not proof of least-privilege authorization, terms suitability, consent, secret containment, or production readiness. Different API usage data and subscription allowances cannot be combined.

## Provider capability matrix

| Provider context | Plan / Free facts from official documentation | Quota / usage reading evidence | Billing / renewal / expiry evidence | Current Quotafern decision |
| --- | --- | --- | --- | --- |
| OpenAI Codex / ChatGPT | Codex is available across ChatGPT plans, including Free and Go, with plan-specific usage allowances. App-server account/read can expose planType when available. | Codex app-server documents account/rateLimits/read (usedPercent, windows, resetsAt, planType), and account/usage/read (daily token buckets). This is not evidence that invoking app-server startup is safe. | No authorized Codex monitoring response has been established for next subscription charge, contract renewal, or subscription end date. Earned reset-credit expiresAt is **not subscription expiry**. | **NO-GO for live**. Existing F3 bridge stays dormant until documented app-server startup policy, monitoring grant, Unix forced-parent cleanup, and owner native acceptance. No OAuth workaround. |
| Claude / Claude Code subscription | Claude has Free for the app; Claude Code is included in paid plans, not Free. Pro/Max and organization plans have pooled usage depending on sign-in and entitlements. | Claude Code exposes human-oriented /status and usage screens; no independently approved headless third-party subscription remaining-quota API established. | Subscription billing can be monthly or annual; settings/invoices may carry dates, but no approved read-only third-party subscription billing API has been verified. | **RESEARCH / NO-GO for subscription scraping or token reuse**. Never extract Claude Code OAuth tokens. |
| Anthropic Claude API / Console | Usage is pay-as-you-go or based on separate API credits; distinct from Claude Code subscription allowance. | Official organization Usage and Cost Admin API gives token/cost history with **Admin API key** and permission requirements. It is not a consumer subscription-quota endpoint. | Some monthly API promotional credits expire by billing cycle; availability in Console does not establish an allowed programmatic renewal date. | **CONDITIONAL RESEARCH**. Require authorized admin role, scoped access review and explicit customer intent; high-privilege keys are not suitable for implicit read-only monitor onboarding. |
| Gemini CLI with Google account | Official table: Code Assist Individual Free 1,000 model requests/day; Google AI Pro 1,500; AI Ultra 2,000; workspace editions vary. Static published numbers can change or be subject to availability. | Gemini CLI /stats model describes current-session usage and applicable limits, **not** a documented third-party headless remaining-quota API. | No approved billing/renewal/expiry read endpoint for this monitor. | **RESEARCH / NO-GO live**; static plan allowance is never evidence of account remaining balance. |
| Gemini API key / Vertex | Gemini CLI docs list unpaid Gemini API key Free tier (250 model requests/day, Flash only) and paid metering; Vertex Express quotas vary. | Published tiers describe maxima. No verified user-specific read-only quota endpoint for Quotafern from this research. | Cloud invoice cycle and subscription renewal are different from quota reset; unverified per account. | **RESEARCH** with separate API billing identity and explicit credentials review. |
| GitHub Copilot | GitHub changed Copilot to AI Credits from June 1, 2026. Current docs describe Free with included credits, Pro/Pro+/Max, and exceptions for legacy annual request units. | Official REST billing usage reports include AI credits; user reports require **Plan (read)** and are documented for **users who purchased their own Copilot plan**. Managed seats require org/enterprise-level rights. Historical premium-request reports do not imply current credit-based quota. | AI Credits reset on UTC calendar-month boundary, **not** necessarily subscription billing/renewal date. Reported historical usage does not alone prove remaining allowance or paid plan/expiry. | **CONDITIONAL CANDIDATE** for authorized eligible paid self-serve user; Free remains NOT VERIFIED via this API; org admin use needs independent scope assessment. |
| OpenRouter API key | Key endpoint has is_free_tier, free_model_daily_requests {limit,used,remaining}, per-key spend limits and usage. This is not a verified name for a monthly subscription package. | GET /api/v1/key explicitly reports daily free-model request allowance, remaining per-key limit, usage and budget info. GET /api/v1/credits returns user credits **only with a management key**, distinct from ordinary key monitoring. | Key expires_at refers to **API key expiry**, not account subscription expiry. limit_reset, budgets.resets_at, and free-model daily reset are **quota/budget** resets, not monthly subscription charges. Credit purchase/expiry depends on product rules. | **BEST DATA-FEASIBILITY CANDIDATE, NOT LIVE APPROVED**. Verify permissible low-privilege scoped monitoring credentials, app-owned OS secret storage, billing identity and native read-only networking before implementation. |
| OpenCode integration family | OpenCode is a client selecting independent upstream services, **not** one subscription/billing authority. | Read quota from separately approved upstream integrations only. | Plan and billing belong to individual upstream providers, not OpenCode globally. | **AGGREGATION / PRESENTATION ONLY**. No synthesized shared quota. |

## Free-plan monitoring policy

1. **Free is a plan/entitlement classification, not a quota measurement.** An account can be Free with a numeric allowance, Free with a rolling/rate-limited allotment, or Free with no authorized machine-readable remaining balance.
2. Only show numeric remaining when its **current, account-bound, source-specific** value is actually returned by a permitted read and valid for the window.
3. A published static allowance such as Gemini CLI 1,000 requests/day is a plan-level maximum or documentation value, **not** account-specific remaining; label it as reference-only if ever displayed.
4. A Free user is not a zero-quota user. Show **Free · Quota unavailable**, **Free · No permission**, or a verified actual Free quota instead of inventing a zero or percent.
5. Do not mislabel a key's free-model daily requests as whole-account subscription remaining; do not treat a Free model as proof of a Free account.
6. Missing, blocked, expired, stale, no grant, not offered, and genuinely known-zero are separate outcomes.

## Date and subscription evidence

The following are **independent concepts** and must never be inferred from each other:

- Quota reset time (rolling usage window)
- Billing-period start and end
- Subscription renewal date
- Next charge or invoice date
- Subscription access expiration or cancellation effective date
- Prepaid/promotional credit expiration date
- API-key expiration date
- Workspace budget reset date

Manual dates are acceptable as an explicitly marked user-maintained reminder, **not** provider verified fact. Never infer next charge from a quota reset, plan label, or calendar-month boundary.

## Security gating & provider candidate decision

### OpenRouter: highest-priority *feasibility research*, not live authorization

- Data proof: document exact GET /api/v1/key fields for free quota, paid key caps, per-key usage, optional budgets and expiry.
- **Open blocker:** ordinary API keys can authorize inference; a telemetry-only intent does not constrain a stolen key. Research officially supported limited-scope key/authorization and whether these reads can be performed with monitoring-only grants.
- **Open blocker:** account-level credits require management-key authority in docs; **do not** accept a management key solely to show dashboard balance without an explicit separate security review.
- **Open blocker:** ACC-03 app-owned OS-protected credential storage and native coordinator are not yet implemented. No renderer storage, logs, environment harvesting, or borrowing another app's credentials.
- **Open blocker:** per-key limit, account credits, and free-model daily quota must not be presented as one source or counted twice.
- **Decision:** candidate for first eligible adapter **only after** documented privilege/consent/storage approval. If read-only least-privilege grant cannot be achieved, stay disabled.

### GitHub: independent alternative

- Account-paid user AI credit usage appears available with official Plan(read) token permission, subject to account eligibility and API verification. A user with an org-assigned Copilot seat must not be shown personal spend from the incorrect payer.
- Determine exactly what remaining quota can be *verified* with current entitlement APIs. Historical credits spent alone are not enough without the included allotment and correctly assigned billing owner.
- Free eligibility and API access remain separately unverified. Do not infer paid status from successful GitHub sign-in.

### Codex remains blocked

The F3 dormant app-server protocol and native consent/security tests do not settle safe startup, allowed monitoring scope, or Unix SIGKILL descendants. Both production gates must remain false. ChatGPT planType from an account/usage response is a **usage classification**, not authoritative paid-invoice status or renewal metadata.

## Next gated work items

1. **PROVIDER-01 acceptance:** independent review of official sources, Free/paid distinctions, capability classification, specific required permission(s), prohibited methods, and owner approval of Go/No-Go candidates.
2. **PLAN-01 schema/UX:** model optional provider-observed plan, free/paid/unverified classification, per-source quota availability, billing/expiry separately, evidence/source timestamp and manual reminder. See [the companion contract](../specs/account-plan-billing-contract.md).
3. **SEC/provider authorization ADR:** for a selected first provider document exact read-only credential grants, negative tests, network/IPC boundaries, and whether a monitoring-only key exists. No connection if privileges are broader than accepted.
4. **ACC-02A:** Rust-owned multi-connection coordinator, generation invalidation, cancellation and native cleanup, tested with synthetic fixtures only.
5. **ACC-03A:** separately reviewed OS-protected secret lifecycle before any key-based provider is enabled.
6. **Provider implementation:** only after those gates, with owner-controlled native acceptance and no data mutation/inference.
7. **UX-03 / SEC-03–05 / REL-01/02:** platform testing, release and updater controls remain separate and not implied by this research.

## Official sources checked (2026-10-26)

- OpenAI Codex plan availability: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- OpenAI Codex app-server contract (including account/read, rateLimits/read and usage/read): https://learn.chatgpt.com/docs/app-server
- OpenAI separate ChatGPT and API billing: https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
- OpenAI ChatGPT invoice date versus API billing: https://help.openai.com/en/articles/8156167-invoice-dates-for-chatgpt-and-api-billing
- Claude plans: https://claude.com/pricing
- Claude Code on paid plans: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Claude API Usage and Cost Admin API: https://platform.claude.com/docs/en/manage-claude/usage-cost-api
- Claude API plan credits and expiry: https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
- Claude subscription invoices: https://support.claude.com/en/articles/16607638-understanding-your-pro-or-max-plan-invoices
- Gemini CLI quota / Free and paid matrix: https://geminicli.com/docs/resources/quota-and-pricing/
- GitHub 2026 Copilot AI Credits transition: https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/
- GitHub individual AI Credits: https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing
- GitHub REST billing use, scope and paid-user constraints: https://docs.github.com/en/rest/billing/usage?apiVersion=2026-03-10
- OpenRouter key details: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key
- OpenRouter limits: https://openrouter.ai/docs/api_reference/limits
- OpenRouter account credit read (management key required): https://openrouter.ai/docs/api/api-reference/credits/get-credits

Every documented limit, price, plan designation, API schema and authorization policy may change. Reverify official current contracts at implementation time. No live request, token, or real account was used in this assessment.
