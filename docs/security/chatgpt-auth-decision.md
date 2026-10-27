# ChatGPT authentication decision

> **2026-10-26 scope update:** CODEX-LIVE-01 authorizes a separate consented, native direct-HTTP adapter using selected Codex file credentials and isolated Codex-managed login. The historical app-server/SIWC conclusions below remain evidence for those routes, not a prohibition on the new route. Both old app-server gates remain closed. See [current direct integration](../security/codex-live-01.md); live direct activation still requires security and owner acceptance.

Research date: 2026-10-24. This decision uses public OpenAI documentation and the public Codex `rust-v0.164.0` source. No account sign-in, credential inspection, or authenticated request was performed.

## Decision

Do not add Sign in with ChatGPT (SIWC) or a “Continue with ChatGPT” button to F3. SIWC identity authorization and ChatGPT-plan inference authorization are documented, but a grant for Quotafern’s quota and activity reads is not specified by the SIWC scope contract. The Codex app-server documentation describes external ChatGPT-token support for some account reads, while the pinned `0.164.0` source marks the corresponding external-token login as internal-only. That documentation/source mismatch must be resolved before Quotafern can rely on that path.

The existing Codex CLI session remains the only designed connection method. Its implementation is disabled before executable discovery or process startup because the pinned app-server startup policy is not yet safely controlled; see [the F3 integration decision](codex-integration.md). No real authentication behavior has been validated. Do not infer that the owner’s Plus plan authorizes monitoring.

## What SIWC documents

| Capability                      | Documented authorization                                                                                                  | What it establishes                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT identity                | `openid profile email`                                                                                                    | An ID token and available identity/profile claims. Identity scopes do not grant ChatGPT conversation or OpenAI API-resource access. |
| Eligible ChatGPT-plan inference | Separately consented `offline_access resource.invoke chatgpt.tokens.use.direct`, for resource `https://api.openai.com/v1` | A token for eligible Responses API inference. Applications must check the actual granted scopes.                                    |
| Codex quota/activity monitoring | No SIWC quota/activity scope or explicit SIWC grant contract found                                                        | Neither identity nor inference scopes are documented as a Quotafern monitoring grant.                                               |

The SIWC Codex app-server guide configures an OAuth access token for Responses API inference through `/v1/responses`, using `requires_openai_auth=false`; it describes thread/turn inference and says no separate Codex sign-in is required for that setup. This is not a documented authorization rule for `account/rateLimits/read` or `account/usage/read`.

The current Codex app-server guide documents `account/rateLimits/read` and `account/usage/read`. It also says that `account/usage/read` requires authentication backed by Codex services and accepts “external ChatGPT tokens.” Separately, it documents experimental `chatgptAuthTokens` login for host-managed tokens. These statements establish protocol-level support in the documented app-server surface; they do not say which SIWC scopes authorize those Codex-service reads.

There is a versioned source conflict: in the public `rust-v0.164.0` source, `account/login/start` with `chatgptAuthTokens` is annotated unstable and for OpenAI internal use only. Quotafern must not call that path in its pinned CLI version. The current documentation and pinned implementation need an explicit compatibility/authorization resolution before this conclusion changes.

These are claims about distinct protocols and grants, not a claim that SIWC quota access is technically impossible. Based on the official contracts reviewed, SIWC monitoring authorization is **undocumented and unverified**, so it is not implemented.

## Plus-plan compatibility

The SIWC sessions guide says Plus inference usage limits are shared across apps that use a user’s ChatGPT plan. That describes inference-plan consumption, not permission to read Codex quota or activity. **Owner Plus compatibility is blocked/unverified for live quota monitoring.** The existing CLI-session route needs safe startup, native consent/containment review, then owner acceptance. A separate SIWC route additionally needs a documented monitoring grant and resolution of the pinned-source conflict. SIWC uncertainty does not require more accounts, another subscription, or partner access to finish mock implementation. No owner account was tested, and no inference request was made to test entitlement.

Quotafern must not request inference scopes just to read quota, send a token-consuming inference request as a test, or use another application’s client identifier. If a future official contract identifies a least-privilege read grant, review that scope and the supported app-server version before implementing consent.

## Feature and authorization matrix

| Feature                                                                   | App-server contract                                                                                                                                       | F3 state                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Quota windows, remaining percentages, reset times, multiple limit buckets | `account/rateLimits/read` documents these fields and multi-bucket responses.                                                                              | Normalization foundation and synthetic coverage exist behind the closed live gate. No live read.         |
| Optional credit balance                                                   | The quota response documents optional `credits`; pinned schema has flags and decimal balance, without a currency field.                                   | Addendum normalization/presentation behind the closed gate; no balance is assumed when absent.           |
| Spending controls and usage                                               | Pinned app-server schema exposes `individualLimit` with limit, used, remaining percentage and reset time. It does not specify a currency unit.            | Addendum read-only presentation, with unknown units stated explicitly; no limit-changing operation.      |
| Earned reset credits                                                      | Quota response may include reset-credit count/details; a separate consume method changes state.                                                           | Addendum count/expiry presentation only; no opaque redemption IDs or consume RPC.                        |
| Token activity metrics and daily buckets                                  | `account/usage/read` documents summary metrics and optional daily buckets; current app-server docs list external ChatGPT tokens as an accepted auth mode. | Optional addendum read/normalization behind the gate. SIWC scope-level authorization remains unresolved. |
| Activity heatmap                                                          | Uses validated daily buckets; absent dates stay unknown and no live activity is fabricated.                                                               | Addendum Codex Details calendar, separately labeled synthetic preview for acceptance.                    |

The official app-server guide describes `account/rateLimitResetCredit/consume` as consuming a reset. Quotafern must not expose or call it in a read-only monitor.

## Modular boundary for a future review

Keep provider monitoring independent from session ownership:

- A backend-specific session lifecycle owns consent, authentication state, refresh/revocation, and teardown. The current Codex CLI lifecycle remains Codex-managed; a hypothetical SIWC lifecycle would own a separate Quotafern-issued client registration and app-owned token storage.
- Provider adapters return a sanitized monitoring DTO containing only validated quota/activity fields and safe status. They never return access tokens, refresh tokens, account identifiers, raw RPC payloads, or arbitrary provider text to the WebView.
- The UI consumes the monitoring DTO and does not know which credential mechanism produced it. A future adapter must not replace or mutate the Codex CLI session.
- SIWC implementation, if later supported, requires PKCE S256, fresh and validated state/nonce, exact redirect/resource validation, actual granted-scope checks, and OS-protected storage for Quotafern-owned secrets. No token belongs in WebView storage, logs, IPC responses, or Codex CLI credential files.

## Official references

- [SIWC quickstart](https://developers.openai.com/siwc/quickstart) — separates identity scopes from optional plan inference.
- [SIWC registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) — lists identity and inference scopes, resource, PKCE/state/nonce, and granted-scope checks.
- [SIWC Codex app-server guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) — describes the OAuth token’s use for Responses inference through app-server.
- [SIWC token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference) — documents token audience, granted-scope claim, and token response fields.
- [SIWC accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) — documents token renewal, credential storage guidance, and shared Plus inference limits.
- [SIWC overview](https://developers.openai.com/siwc/token-sharing-open-source) — scopes this plan-usage flow to open-source and locally hosted apps; paid or remotely hosted apps need a separate access decision.
- [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server) — documents quota/activity RPCs and external-token auth behavior. The current page does not establish which SIWC scopes authorize those methods.
- [Pinned `rust-v0.164.0` account protocol source](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-protocol/src/protocol/v2/account.rs) — version-specific source that marks `chatgptAuthTokens` as internal-only.

No authenticated or inference behavior was run. A future manual acceptance requires a supported, documented auth contract and owner authorization; it never requires sharing credentials with Quotafern developers.
