# CLAUDE-RESEARCH-01 — Claude Code subscription quota and permitted monitoring

**Status:** Draft provider-specific research, 2026-10-26. **Scope:** one individual's personally owned Claude Code Pro/Max accounts only. This single-user scope applies to all Quotafern providers; organization and Enterprise support is out of scope. No real Claude sign-in, CLI execution, credential reading, API request, subscription auth reuse, network adapter, source code or permission changes.

## Product question

Can Quotafern show an **actual remaining Claude Code subscription quota** for an identified user, including a verified plan name, 5-hour session allowance, weekly allowance and reset times, using a provider-supported and appropriately authorized read-only interface?

Any plan, Free/Paid classification, quota figure, reset, credits, billing renewal, next charge or subscription expiry is **independent and optional**. If no authorized source supplies it, **do not render the field, empty row or empty billing panel**. A connection-level unsupported or disconnected state may remain visible. Never turn unknown remaining into 0%.

## Official entitlement distinctions

- Claude's consumer service offers **Free, Pro, Max 5x and Max 20x** tiers. The existence of Claude Free does **not** establish Free access to **Claude Code**.
- Individual **Claude Code** subscription use is documented for **Pro and Max** subscribers. Organization, Team, Business, Enterprise and company-paid seats are **not supported** and are not research targets.
- Pro/Max session usage is generally based on **5-hour limits** plus **weekly limits** shared across Claude web, desktop/mobile and Claude Code. Additional features or models may impose separate limits. Plan size is not a static exact count of messages/tokens.
- Claude Code with an **API key** is not the same as using a Claude consumer subscription: API usage is metered and billed through Claude Console or the chosen cloud platform. Do not use API Cost or a `/cost` local-session estimate as a subscription remaining-quota field.
- The `/status` UI can show remaining subscription allocation; human-facing availability **does not prove a stable third-party machine-readable API**. `/cost` shows session-level API spending in API-key mode, not global Pro/Max usage.
- Subscription quota reset, a purchased or manually credited overage, API token spend, billing cycle and payment dates are different authoritative sources.

## Authentication and third-party rights

Anthropic explicitly describes third-party tooling, including open-source integrations, as preferring **Claude Console API key authentication or supported cloud-provider keys**. It prohibits impersonating Anthropic clients, routing third-party traffic against a user's subscription limits without authorization, or otherwise violating its policies. A future allowance to charge third-party usage credits is **not** permission to harvest Claude Code OAuth credentials.

**Decision: NO-GO for live Claude consumer-subscription quota polling** until an officially documented permissioned third-party read-only monitoring path is verified. This includes:

- No reading/copying Claude CLI credential stores, native keychains, cookies or browser sessions.
- No extracting Claude Code subscription OAuth tokens; no impersonation of the native Claude client or client identifier.
- No undocumented `claude.ai` usage endpoints, private GraphQL or browser scraping as a substitute for an official quota API.
- No launching `claude` just to scrape interactive `/status`, since startup could touch authentication, activate background tasks or mutate local state and it is not an approved headless monitoring contract.
- No organization/Enterprise Usage/Cost Admin API, organization-scoped credentials, company member reporting or administration. These are excluded by Quotafern's global single-user product scope.
- No automatic sign-in, new OAuth client, token refresh, remembered credential or network permission in this documentation-only milestone.

An explicit authorized API-key integration would be a **different billing source and separate provider adapter**, not an allowed workaround for the consumer subscription limits.

## Source availability and display decision

- **Actual subscription plan:** show a specific Pro/Max tier only if an appropriate authorized read returns that tier for the bound user. Do not guess from installed CLI presence, a public price page or local login state.
- **Free:** never label a Claude Code connection as supporting Free quota based solely on the Claude.ai Free consumer tier. If no Claude Code entitlement exists, display no fabricated quota; mark provider unavailable/unsupported at the connection level when needed.
- **Remaining 5-hour and weekly quota:** display only when a permitted, documented, account-bound source supplies it. Published general limits are not actual remaining.
- **Reset:** use only source-specific validated date/window. A five-hour timer is not a subscription renewal; weekly boundary is not the next monthly payment.
- **Billing/expiry:** omit entire panel when provider-authoritative subscription or billing fields are unavailable. Do not add a manual payment-date fallback, estimate a date from subscription plan, or request invoices.
- **Out-of-scope account:** do not attempt to connect a Team/Enterprise or employer-paid seat using organization permissions. Reject or omit unsupported fields without impersonating another user.

## Independent security questions to resolve in this Claude PR

1. Does Anthropic provide a **public officially permitted read-only quota-status API** for **individual personal** Claude Pro/Max subscription accounts? Record exact contract, scopes, terms and stable response schema. No undocumented workaround.
2. Can Quotafern obtain authorization in its **own identity** without cloning the Claude Code OAuth application, touching existing native auth or requesting inference privileges? If not, retain Coming Soon.
3. What are the documented independent personal Pro/Max 5-hour, weekly and model-specific quota windows? Record observed versus published-reference semantics.
4. Are plan name, exact quota reset, paid usage credits and subscription billing dates available via independently permissioned read-only sources? If not, hide each field.
5. Does any proposed official API consume usage credits, create a billing event, mutate CLI state, refresh provider tokens or expose data belonging to another account? Refuse it as a passive monitor without explicit risk acceptance.
6. Which bounded native connection/cleanup/secret-storage coordinator is required before integrating any provider-owned credentials? ACC-02 native coordinator and ACC-03 app-owned OS secret model remain unimplemented.
7. What official alternative should Quotafern link to when live read is impossible? Documentation-only external usage page is acceptable after source verification, but must never be described as embedded monitoring.

## Synthetic-only future acceptance

- Confirmed Pro with no authorized quota endpoint: do **not** display a numeric quota/plan unless a verified source independently establishes the plan; keep truthful connection status.
- Consumer Free without Claude Code entitlement: no fabricated Claude Code Free remaining; don't infer that Claude Free has zero general product quota.
- Pro and Max with distinct 5-hour/weekly snapshots: no percent addition, each source/window reset separate and timezone-correct.
- Two separately owned personal Pro/Max accounts with identical local aliases: never mix quotas or claim a shared billing owner. An organization-plan variant is rejected as out of scope.
- Claude API Console key data never appears as Claude Pro/Max included subscription remaining.
- No optional billing/renewal/expiry values without authoritative per-field evidence; no empty sections or manual inputs.
- Denied login, expired connection, 401/403, malformed quota, unknown remaining, stale data, token redaction, canceled refresh and account removal all fail closed.
- No production feature claiming access based on screenshot, HTML scraping, external CLI login, a guessed URL, or unpublished API path.
- The native security gates and independent review must pass before **any** authenticated acceptance.

## Official sources and repo references

- Anthropic third-party tools, OAuth subscription use and key preference: https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account
- Claude Code with Pro/Max: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Consumer tier differences and Free plan: https://support.claude.com/en/articles/11049762-choose-a-claude-plan
- Claude usage and reset windows: https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- Claude Code usage and different API-key billing: https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code
- [Current provider roadmap](../plans/provider-connections-roadmap.md)
- [ACC-01 account and source model](../specs/acc-01-architecture.md)
- [Security roadmap](../plans/security-roadmap.md)

This research documents **currently unverified monitoring authorization**, not confirmation that a permissioned consumer quota API exists or that any live credential request would be compliant.
