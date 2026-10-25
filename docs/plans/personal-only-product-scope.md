# Quotafern personal-only product scope

**Owner decision:** 2026-10-26. **Applies to every current and future provider** without reopening paused research. Documentation-only product boundary.

## Who Quotafern is for

Quotafern is a **local-first, single-user desktop app** for **one human operator** monitoring their **own individually authorized** AI coding subscriptions, usage allowances and personal API-key sources. Single-user means **one app owner**, not a restriction to one provider account. The owner may have multiple distinct personal accounts and app-owned API keys, if their provider officially permits monitoring them. Keep each identity, connection, quota source, limit window and payer distinct.

**Out of scope across all providers:**

- Enterprise, Business, Team or organizational workspace administration; shared team dashboards, admin impersonation, delegated access, seat management, billing-owner management or member-wide reporting.
- Organization/enterprise API credentials, service accounts, organization/admin analytics scopes, invoice retrieval, payment management, HR/employee activity monitoring and workplace compliance/audit tools.
- Reading a company-funded seat's organization quota or bill through an individual's local connection, even if the user happens to have access to that workspace.
- Automatic import of credentials or sessions from another CLI, browser or operating-system keychain.

A plan enum or public documentation may **mention** Team/Enterprise for compatibility or explicit exclusion; that is **not** a feature commitment. Unexpected plan types remain unknown/unsupported and never trigger an organization-permission request. Do not build enterprise handling to fill a personal card.

## Current priority and paused providers

- **OpenAI Codex:** personal ChatGPT Free, Go, Plus and Pro entitlements. A valid rate-limit result is specific to the signed-in individual/source. Existing PR #16 documents authorization and safe-startup blockers; no live integration approval.
- **Claude Code:** personal Claude Pro/Max subscription entitlement. Claude Free product availability must not be confused with a working Claude Code subscription allowance. Existing PR #17 is research-only; no live integration approval.
- **Gemini CLI, GitHub Copilot, OpenRouter and OpenCode:** research **paused**. When authorized to resume, create a **separate provider-specific Draft PR** following this personal-only rule. For example, investigate a personal Copilot account, a personally owned OpenRouter key and upstream personal accounts, but not organization billing APIs.

## Display and authorization rules

1. Show only **authorized, source-verified and current** plan names, verified Free/Paid status, actual remaining quota, reset, billing or expiry fields. If any optional field is unavailable, **omit it and empty UI sections**. No placeholder, invented payment date or manual billing-date fallback.
2. An account may be Free yet have actual quota. Published generic Free limits do not prove an individual account's remaining balance. Unknown never equals zero.
3. Account identity, connection, plan, quota source, key, credit wallet and billing owner remain independently bound. Multiple personal keys may share a payer; never deduplicate or add balances unless explicitly verified.
4. Use only provider-documented **appropriately scoped consented read-only monitoring**. No OAuth impersonation, login token copying, inference/admin grants just to obtain monitoring data, background process side effects or CLI startup that violates approved security gates.
5. Avoid processing personally sensitive billing details unless required to display an authoritative optional field, specifically authorized, and separately reviewed for minimization, lifecycle and storage. Quotafern does not read mail, invoices, cards or payment accounts.
6. Keep live-provider flags disabled unless each relevant provider's documented authentication, local process custody and native acceptance is independently approved. Demo data must remain explicitly synthetic.

## PR ownership

Shared scope/policy updates belong in a **non-provider documentation PR**. Each provider's research, tests, source adapter and provider-specific security review belong in that provider's own Draft PR. A general single-user rule does not merge providers' implementation branches or authorize changes in another provider's PR.

This document is a constraint for product planning and reviews, **not** permission to connect to a provider, retain credentials, ship a release or merge a PR.
