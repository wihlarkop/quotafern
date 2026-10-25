# Provider Connections and Multi-Account Roadmap

Status: Planned. Documentation only. Owner-approved product direction.

Quotafern follows a local-first, consent-first connection model for every supported provider. The standard onboarding flow is Detect locally, Connect with explicit consent, optionally Remember connection, and Disconnect. This roadmap does not enable any connection or credential access.

## Provider coverage

Every provider adapter must be designed for more than one account, workspace, or authorized connection. The same architectural contract applies to Codex, Claude Code, Gemini CLI, GitHub Copilot, OpenCode-connected services, OpenRouter, and future subscription or API providers.

Support in the account model does not imply that each provider already offers a supported read-only monitoring API or multi-login capability. Providers without documented and authorized monitoring access remain Coming Soon.

### Codex

Codex CLI supports ChatGPT account sign-in. F3's live-disabled foundation was squash-merged in PR #3 at `4bdf1fe4344bfb6ac93f47a1ac89710b866bb49c`. The bridge is still single-session, and live startup remains blocked. Do not read or copy Codex credentials, change a user's CLI login, or bypass the startup gate to implement multiple accounts.

### Claude Code

Claude Code has its own Claude account login. Anthropic places restrictions on third-party use of subscription OAuth credentials. Quotafern must not extract Claude Code tokens or imitate the provider's OAuth client. A compliant, documented read-only quota path must exist before implementation.

### Gemini CLI

Gemini CLI supports Sign in with Google and the interactive `/stats model` command. Neither proves a stable headless read-only quota API. Investigate documented machine-readable quota access and provider permission before implementation.

### GitHub Copilot

GitHub provides official sign-in and billing/usage APIs. Personal, organization, and enterprise account entitlements and API scopes differ. Quotafern must request only supported minimum permissions and never assume GitHub identity login is permission to read Copilot quota.

### OpenCode and API providers

OpenCode is a coding client that can use multiple upstream providers, not necessarily a single billing provider. Two API keys might belong to one shared billing wallet. Distinguish upstream provider, user account or workspace, credential, and authoritative billing source. Never count a shared balance twice or mistake API metering for subscription quotas.

## ACC-01: Shared multi-account data model

Status: ACC-01 additive foundation implemented; integration and account-management UI remain planned. See [architecture and migration](../specs/acc-01-architecture.md), [future UX contract](../specs/acc-01-ux-contract.md) and [validation](../validation/acc-01-validation.md). The module is not wired into the F3 runtime or storage, and does not authorize a second adapter.

Use these independent concepts:

- Provider: integration type, such as Codex or OpenRouter.
- Account: a logical user account, workspace, or billing owner.
- Connection: one authorized local session, OAuth grant, or Quotafern-owned API key.
- Quota source: the authoritative subscription window, billing pool, credit balance, or activity stream.
- Local account ID: stable and opaque, never based on credential content.
- Local connection ID: stable and opaque, independent of its display label.
- Account alias: user-editable name for each account.
- Connection alias: user-editable name for each session or API key.

Allow names such as `Codex - Personal`, `Codex - Work`, `OpenRouter - Key A`, and `OpenRouter - Project B`. Aliases are local labels, not a claim about authenticated external identity. Renaming an account or connection must not change the provider account, credentials, login state, consent, quota, or billing mapping.

Allow duplicate names without merging identities. Where external identity is not verified through a documented authorized read, show an unknown identity rather than guessing it.

Migration from the F3 single bridge and single snapshot must be explicitly designed and tested. Do not alter its disabled production gate just to introduce this model.

## ACC-02: Independent account connections

Status: Planned, following ACC-01 and an approved provider-specific security gate.

- Permit at least two separately named accounts for a provider when official authorization supports it.
- Manage status, consent, error, cooldown, token expiry, freshness, and disconnect independently.
- Prevent account A's login change, error, refresh, or removal from affecting account B.
- Offer optional Remember connection per connection only after native consent and security acceptance.
- Keep automatic reconnect off by default and revoke it when a connection is removed.
- Do not copy external CLI tokens or silently switch another application's active account.

## ACC-03: Multiple API keys and shared billing

Status: Planned, following ACC-01 and an approved app-owned secret storage design.

- Permit multiple independently named keys per API provider where the provider permits it.
- Never store raw API keys in the renderer, localStorage, logs, or source control.
- Use OS-protected storage only for secrets Quotafern is expressly authorized to own.
- Respect each provider's published quota, API metering, credits, and billing distinctions.
- Associate multiple keys with one billing source only if confirmed by documented provider data.
- Never add percentages or different currencies and never double-count a shared wallet.
- Differentiate Disconnect, Remove connection, Delete owned credential, and provider logout.

## ACC-04: Account management and Soft Native UX

Status: Planned. Coordinate with `docs/ui-ux-roadmap.md`.

- Group accounts by provider and show each independently named account and connection.
- Include Rename account and Rename connection actions, including API key aliases.
- Provide Add account, Add connection, Disconnect, and Remove with clear consequences.
- Support All Accounts, Provider, Account, and Connection filters.
- Show per-account status, last successful refresh, source kind, reset and quota independently.
- Keep unknown, stale, disconnected, and Coming Soon visibly different from live data.
- Test duplicate and long aliases, keyboard navigation, and 320-420px popup widths.

## Consent, authorization, and safe persistence

Detection is passive and never reads credentials or starts authenticated operations. Installed does not mean logged in. Connected requires an actual permitted monitoring read rather than a successful generic identity login.

A native Rust-controlled consent decision is required before first connection. Every adapter must use a documented read-only path with appropriately scoped permission. Identity scopes such as Sign in with ChatGPT or Sign in with Google are not automatically quota scopes.

Aliases and non-sensitive user preferences may persist locally after an explicit design review. Quotafern-owned secrets require independently reviewed OS-protected storage; never enumerate or copy other applications' secret stores.

A failed provider must not display a synthetic live fallback. Unknown values are not zero. Credit units, API usage, subscription limits, and reset entitlements remain distinct.

## Security and evidence gates

- SEC-A: Provider terms, permitted monitoring method, scopes, and startup side effects.
- SEC-B: Native consent, bounded allowlisted IPC, and no renderer access to secrets.
- SEC-C: Process containment, cancellation, credential handling, and OS-specific cleanup.
- SEC-D: Data correctness, shared billing identity, timestamps, unknown states, and retention.
- SEC-E: Synthetic tests, independent review, hosted CI, and real native acceptance when available.

Windows owner F3 native acceptance passed 30/30. macOS and Linux native interaction remain NOT RUN because devices are not yet available. CI compilation alone does not prove native interactions.

Codex live startup policy and Unix forced-parent termination remain F4 blockers. Do not use undocumented Codex switches or access a real ChatGPT Plus account before separate review and owner approval.

## Delivery order

- Preserve F3 as a merged, live-disabled foundation.
- Design ACC-01 shared account, connection, alias, and quota-source boundaries.
- Research provider-specific official authorization and supported quota APIs.
- Build ACC-02 multi-account support for the first eligible provider.
- Build ACC-03 multiple keys and verified shared billing without double counting.
- Coordinate ACC-04 account UI with UX-01 Soft Native exploration.
- Validate security and real native behavior independently before any live release.

No additional paid accounts are required for model, UI, or mock security tests. Do not merge or release new implementation without owner approval.

## References

- Codex auth: https://developers.openai.com/codex/auth
- Claude Code plans: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Gemini CLI auth: https://geminicli.com/docs/get-started/authentication/
- Gemini usage: https://geminicli.com/docs/resources/quota-and-pricing/
- GitHub Copilot login: https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli
- GitHub usage billing API: https://docs.github.com/en/rest/billing/usage

## ACC-04 local-only delivery

[ACC-04](../specs/acc-04.md) implements Add/Rename/Remove for disconnected local account and connection labels, optional workspace grouping and strict non-sensitive metadata persistence. This supersedes the historical planned account-management/persistence status above only for descriptor management. It does not implement ACC-02/ACC-03 provider authorization, credential storage, multi-login isolation or native cleanup coordination. All adapters remain unavailable/gated or Coming Soon; Remember Connection stays deferred. [Functional and blocked action matrices](../specs/acc-04.md#functional-action-matrix) and [validation](../validation/acc-04.md).
