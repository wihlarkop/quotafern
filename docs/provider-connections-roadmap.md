# Quotafern provider connections roadmap

**Status:** Planned / research-backed design note only — 2026-10-24.

**Dependency:** Finish and review Codex F3 integration and SEC-01/SEC-02 live-connection blockers before implementing other provider adapters. PR #3 is still Draft and its live Codex gate remains disabled. This document does not authorize a live provider connection, account-login workflow, token access, background polling, deployment or merge.

## Product principle: effortless, explicit, provider-specific

The common Quotafern UX pattern is **Detect locally → Connect with informed consent → Optional Remember connection → Easy Disconnect**.

The provider's official "Sign in with X" and the authorization Quotafern requires to **read subscription quota** are **different things**. Never assume identity-login scopes, agent-inference permissions, API billing, or another CLI's existing tokens automatically grant permission to read remaining subscription allowances.

**Detection** must remain passive and non-sensitive. Discover a plausible supported local executable/install without launching authenticated operations, opening credentials, refreshing a token, accessing remote services, or claiming the user is logged in. Explain the difference between "installed", "session detected through a specifically reviewed mechanism", and "connected/monitoring". No fake connection status based on presence of a directory.

**First connection** requires explicit consent for the actual mechanism and side effects, enforced natively by the Rust host; an ordinary Svelte checkbox is not an authorization boundary. Only a documented, scoped read-only monitoring path may be enabled.

**Remember connection** is opt-in, revocable and off by default. Persist only the minimum non-sensitive preference after a separate consent/security review. Never persist raw credentials, silently resume unauthorized activity, or bypass a provider's expired/revoked permissions. Auto-reconnect is a future feature, not part of the gated F3 build.

**Disconnect** terminates Quotafern-owned monitoring/child processes and clears in-memory monitoring state without logging the user out of the original provider CLI or changing that application's accounts. Tell users clearly if Quotafern owns separate OAuth credentials and revocation differs.

**Honest states:** Coming Soon, not installed, installed/not connected, connecting, connected, stale, auth required, unsupported auth type, unavailable/error. No demo-to-live fallback. Unsupported providers do not get fake usage meters, login buttons or background credential discovery.

## Provider-by-provider authorization decisions

| Provider | Provider-owned sign-in is documented | Preferred future Quotafern monitoring path | Important authorization caveat | Current state |
| --- | --- | --- | --- | --- |
| **Codex** | ChatGPT-backed Codex CLI login | Official Codex app-server account/rate-limits/usage contract using a user-approved existing local session if safe | SIWC identity/inference permissions do not establish a read-only quota grant; F3 has startup/Remote Control, native consent, and child-containment blockers | **F3 Draft; live disabled** |
| **Claude Code** | Claude account login for subscription-backed Claude Code, distinct from Anthropic Console/API-key use | Research **documented read-only, provider-permitted** status/quota export through supported Claude Code surfaces | Anthropic restricts use of Claude subscription OAuth credentials in third-party tools; do **not** extract/reuse Claude Code tokens, pose as official Claude Code, or offer an unofficial Claude subscription OAuth flow | **Coming Soon; authorization research gate** |
| **Gemini CLI** | Official **Sign in with Google** in Gemini CLI; Google AI Pro/Ultra and personal/organization modes differ | Research supported local quota/status reporting (Gemini CLI `/stats model`), or separately authorized Google quota API/scopes if documented | Google account identity OAuth is not itself permission to read Gemini CLI subscription limits. Avoid hidden internal Code Assist endpoints and automated agent turns just to fetch stats | **Coming Soon; documented non-interactive read method unverified** |
| **GitHub Copilot** | Official Copilot CLI browser/device OAuth; `gh` CLI fallback | Evaluate **documented GitHub billing/usage REST API** for eligible personal accounts, org/enterprise paths only when explicitly supported | GitHub identity does not itself grant Copilot usage scopes; personal billing and org-billed seats differ. Inspect granted token permissions; no broad repo/org permissions merely for billing visibility | **Future candidate; entitlement and scope research** |

### Critical Claude boundary

Anthropic's published help states subscription OAuth is intended for Anthropic's own applications and places restrictions on third-party software tools using subscription plan authentication. Do not clone Claude Code's OAuth login or use Claude Code's cached auth tokens against private endpoints. Installing Claude Code does not grant Quotafern the right to read its credential store. A potential *read-only status integration* must be researched against current supported product terms and an authorized documented interface; if no compliant method exists, keep **Coming Soon** with an honest explanation rather than an unofficial workaround.

### Gemini boundary

The official Gemini CLI supports Google sign-in and the interactive `/stats model` command for usage and quotas. That is a user-facing feature, not proof of a stable machine-readable API safe for background monitoring. Research an official structured read-only interface, subprocess startup behavior, token ownership, exact data meaning/reset semantics, and permission scopes before implementation. Do not run CLI prompts or inference for a quota check. Keep API-key usage/cost separate from Gemini Code Assist subscription quotas.

### Copilot boundary

Copilot CLI can authenticate via official OAuth, token-based flows, or an existing `gh` login. However, GitHub's documented billing usage endpoints have different eligibility and scopes for personally billed subscriptions versus organization/enterprise seats. Build the adapter around **an authorized quota/billing API**, not a generic GitHub login badge. Review least-privilege OAuth or a provider-supported local token broker; do not copy `gh` tokens indiscriminately. If only billed consumption is available, do not invent remaining quota/reset data.

## Proposed end-user connection UX (not implemented)

### Detected supported installation

**Provider: Codex/Gemini/etc. — Installed**

"An existing provider installation was detected. Quotafern can connect to monitor quota, but won't read your session until you approve."

Action: **Connect existing session** — only where supported, legally/technically acceptable, and permitted by the user's explicit consent.

Optional opt-in: **Remember this connection**, available only after separate security acceptance.

### No supported existing session

Use a truthful action based on documented provider capabilities:
- **Open provider's own sign-in instructions/app**, if local login is officially supported; Quotafern does not imitate or intercept it.
- **Sign in with Google/GitHub/ChatGPT**, only where Quotafern has a valid supported third-party OAuth client, correct public scope/authorization contract for *monitoring*, PKCE, issuer/audience/state validation, and safe credential custody.
- **Coming Soon**, when monitoring authorization or safe quota access is unavailable.

Never display a functional-looking OAuth button that cannot retrieve permitted quota data. Identity-only sign-in may be offered separately only for an independent, useful identity feature—not to imply quota connection.

### Connection lifecycle requirements

- First-run explicit native consent with provider, requested data, background activity, credential ownership and optional session effects.
- Successful quota read determines Connected; executable detection or browser login alone does not.
- Per-provider state machine and independent errors/freshness.
- One provider failure cannot replace another provider's data or show synthetic fallback.
- Refresh with reasonable cooldown/backoff; no background login/poll without opt-in.
- Correct distinction: subscription quota vs API-key metering vs billing/credits vs activity tokens vs rate-limit reset entitlements.
- Disconnect and delete cached non-secret state, with Quotafern never forcing CLI logout.
- Support missing executable, unsupported account type, revoked/expired session, changed account, offline, unknown quota units and provider version changes.

## Security gates per provider

1. **SEC-A — Terms and documented capability**: current provider permission/terms, machine-readable quota method, official client registration where required, minimum scopes, version compatibility, and audit of startup/network side effects.
2. **SEC-B — Trust boundaries**: native consent enforcement, no secrets in Svelte/IPC/logs, host-owned allowlisted operations, no generic subprocess/RPC or arbitrary HTTP bridge, no access to other CLIs' credential stores.
3. **SEC-C — Process/auth hardening**: per-OS process containment, cancellation/timeout, no orphaned child processes, PKCE/state/nonce/issuer/resource/granted-scopes when Quotafern owns OAuth, OS-protected Quotafern-owned secret storage, revocation/logout semantics.
4. **SEC-D — Data correctness**: validated source schema, unknown versus zero, stale timestamps, currency/unit honesty, no invented limits or reset times, no synthetic fallback, data minimization and retention/deletion.
5. **SEC-E — Evidence**: fake-provider deterministic regression and security tests, final-HEAD cross-platform CI, real native/manual consent/cleanup acceptance, owner-authorized live test without sharing credentials; untested configurations remain NOT RUN.

Apply the main `docs/security-roadmap.md` SEC-01–SEC-05 milestones from the F3 branch when integrated. No adapter may pass product acceptance by compilation alone.

## Sequencing and scope

- **Now: F3 Codex** — resolve documented live-startup, native-consent, process-containment and actual Plus acceptance blockers. Do not broaden its scope to other providers.
- **Provider-01 Research** — after F3 acceptance, verify publicly documented authentication and quota data access for **Gemini CLI**, **Claude Code**, and **GitHub Copilot**. Identify those that actually have viable read-only interfaces. No account access required.
- **Provider-02 UX spec** — create a consistent connection component/state design with provider-specific auth labels, truthful Coming Soon, consent and Remember controls. Coordinate after approved UX-01 direction in the separate Soft Native roadmap.
- **Provider-03 First additional integration** — choose by **official authorization quality, read-only quota data, and testability**, not by brand popularity. Gemini may be a promising candidate because official `/stats model` surfaces quotas, but a safe structured API still needs proof. Claude must remain deferred if subscription-token restrictions cannot be satisfied.
- **Provider-04 Others** — integrate later, separately, with standalone security and real-OS acceptance.

**No additional paid subscriptions needed now.** Use synthetic/mocked adapter fixtures for other providers. When a real account is necessary, ask the owner to initiate an explicit account-local acceptance only after the security and authorization gates pass.

## Official references (reviewed 2026-10-24)

- Anthropic Claude login/third-party subscription limitations: https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account
- Claude Code Pro/Max sign-in and subscription/API distinction: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Gemini CLI sign-in: https://geminicli.com/docs/get-started/authentication/
- Gemini CLI usage/limits: https://geminicli.com/docs/resources/quota-and-pricing/
- GitHub Copilot CLI authentication: https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli
- GitHub billing usage API personal/org/enterprise distinction: https://docs.github.com/en/rest/billing/usage
- Codex F3 auth decision: `docs/chatgpt-auth-decision.md` (currently on Draft PR #3; not on main).
- Planned Soft Native design exploration: `docs/ui-ux-roadmap.md` (currently on Draft PR #4; not on main).

No live provider requests, credential inspection, or auth changes were made as part of this roadmap.
