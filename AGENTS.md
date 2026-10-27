# Repository guidance

## Stack and commands

**Bun-only, Oxc-first, feature-first; no TDD.** Use Bun for all JavaScript installation, execution, scaffolding, scripts, and builds. Oxlint and Oxfmt are the primary lint/format tools; svelte-check supplies Svelte diagnostics. Do not introduce ESLint, Prettier CLI, or Biome.

Use Tauri 2, Rust, Svelte 5, TypeScript, Vite, Bun 1.4.4, Tailwind CSS 4, local shadcn-svelte components, Bits UI, Lucide, Oxlint, and Oxfmt. Bun and Rust lockfiles are committed. Do not add Node/npm setup to project workflows.

Use the package scripts as the command interface:

```text
bun run dev                 bun run dev:desktop
bun run build               bun run build:desktop
bun run lint                bun run lint:fix
bun run fmt                 bun run fmt:check
bun run check               bun run check:rust
bun run regression
bun run lint:rust           bun run fmt:rust
```

## F1 product and security boundaries (historical baseline)

- F1 quota data are synthetic and visibly labeled as demo in every build, including production. Do not add an implicit mock fallback to any future provider flow.
- F1 must not access credentials, provider HTTP, OAuth, token refresh, account synchronization, telemetry, or credential discovery.
- Keep the quota snapshot seam in TypeScript. Do not add a redundant Rust quota model or native snapshot authority in F1.
- At F1, persist only the non-sensitive appearance mode (`system`, `light`, `dark`) and palette (Graphite & Jade / `graphite-jade`, Zinc & Signal / `zinc-signal`) in `localStorage`, as separate preferences. The later ACC-04 exception is narrowly defined below.
- Keep the native surface to the single `main` window. It opens visible; close hides it; tray actions are Show, Hide, and Quit. Scope the `hide_popup` permission to `main` only.
- Keep release CSP restricted to bundled content and Tauri IPC. Development-only Vite/HMR allowances must not reach release policy.
- Treat future CLI discovery, app-owned keychain use, provider token refresh, and sanitized snapshots as design-only until separately scoped.

## Quality and acceptance

Keep this application local-first and secure by default. Prefer minimal dependencies and small, reviewable changes. Never merge or publish a release without explicit owner approval.

Do not use TDD for this foundation slice. Unit suites are deferred until main features; add the regression, integration, and security checks required by those features. CI covers locked frontend quality, Rust formatting/lint/check on Linux, Windows, and macOS, and an unbundled desktop compilation. Compilation does not prove native tray behavior. Record actual browser or OS acceptance separately from CI results, and leave unexercised platform behavior explicitly pending.

## F3 Codex exception and ongoing boundaries (historical app-server route)

F1 rules above remain historical foundation boundaries. F3 separately authorizes one native Codex app-server integration after explicit in-app consent. The Rust bridge owns process/protocol communication and returns a small sanitized live presentation contract to TypeScript. No other live provider is authorized.

- Start disconnected; never remember or silently restore consent. Opening a view must not initiate provider access. Manual refresh only, with a native cooldown.
- Codex owns authentication. Never directly inspect/copy its credential files, enumerate secrets, or implement login/logout, token injection, turns, reset redemption, purchases, or a raw app-server proxy. Disclose Codex-managed refresh and possible authentication-state writes before connection.
- No developer or CI credential access is authorized. Use synthetic protocol fixtures and isolated fake processes. Real authenticated acceptance belongs to the owner unless separately authorized.
- Keep live and demo sources explicit and separate. A live failure must never fall back to synthetic data. Never persist provider secrets, consent/authorization, live quota, account identities or native runtime state. ACC-04 separately permits only schema-validated non-sensitive local metadata as described below.
- Native commands are fixed, main-only operations; no renderer-controlled executable, path, arguments, filesystem access, or network URL. Keep CSP unchanged and disable optional child telemetry.
- Review subprocess containment/cleanup and all new permissions. Never merge, deploy, publish, or release without explicit owner approval.
- The F3 addendum permits read-only `account/usage/read` and optional credit/spending/earned-reset metadata. Never consume resets, purchase credits, change limits, or initiate inference. Calendar gaps are unknown; token counts never imply money. Unimplemented providers are Coming Soon outside explicitly labeled demos.
- Sign in with ChatGPT identity and inference scopes are distinct from Codex monitoring authorization. Do not add OAuth or request inference scopes without evidence of the required read-only monitoring grant and a separately reviewed credential lifecycle. Keep SEC-01/SEC-02 gates in `docs/security-roadmap.md` explicit.

## CODEX-LIVE-01 direct quota exception (2026-10-26)

- Owner authorization permits native read-only reuse of the selected Codex file login after fresh native consent. This narrowly supersedes F3's credential-read/login prohibition for the separate direct adapter only. Developer/CI access to real credentials remains unauthorized.
- Support personal Free, Go, Plus and Pro. Use only the fixed trusted HTTPS usage endpoint; no app-server polling, local session logs, copied OAuth client registration, browser cookies, token renewal implementation, inference, purchases, reset consumption or billing.
- Codex owns authentication and credential renewal. Managed accounts use ordinary user-initiated Codex login in isolated app-owned homes, without changing system login. Never overwrite system auth or expose tokens, credential paths or native account identity to the renderer, logs or evidence.
- ACC-04 opaque IDs bind selected native sessions; aliases never authenticate identities. Persist only non-sensitive metadata, including the managed connection mechanism. Consent and live readings remain memory-only. Remove disconnects without deleting credentials.
- Fixed main-only commands accept validated opaque account/connection IDs and system/managed selection, never executable/path/URL/RPC input. Keep CSP and unrelated provider gates unchanged.
- Conservative refresh is allowed only for explicitly consented connected sessions, with native cooldown/backoff and per-account cancellation. Failures never produce demo fallback or a fresh success timestamp.
- The new native and renderer direct gates stay false until dedicated security review and required native/owner account acceptance. Old app-server gates remain false independently. See docs/security/codex-live-01.md and docs/validation/codex-live-01.md.

## ACC-01/ACC-04 account metadata (current scope)

- The current multi-account UI supports local accounts, workspaces, connection descriptors and user-defined aliases, not authenticated provider sessions. `docs/acc-01-architecture.md`, `docs/acc-01-ux-contract.md`, and `docs/acc-04/README.md` define the model and limits.
- ACC-04 may persist only validated, non-sensitive ID/alias/owner/mechanism metadata using the strict `quotafern.account-presentation.v1` codec. Never persist credentials, auth file paths, consent, authorization, provider identity, quotas, activity, billing or subprocess state. The storage is plaintext and is **not** an authority or secret store.
- On startup, local connections are disconnected with no real usage. Demo accounts are synthetic and must never enter saved user metadata. Renames never change stable IDs. Real/native-managed deletion needs independently verified cleanup authority; never fake a cleanup acknowledgment or provider logout.
- Both live Codex gates are intentionally disabled: Rust `LIVE_CONNECTION_ENABLED = false` and renderer `CODEX_CONNECTION_AVAILABLE = false`. F4 startup side effects and Unix forced-parent termination are unresolved; do not enable live provider work merely because the UI and local account flows passed Windows acceptance.
- Owner-reported combined Windows native GUI acceptance covers the **live-disabled foundation** after ACC-04. macOS/Linux native GUI, real provider sessions, signed installers and updater behavior remain unverified.

## CODEX-AUTO-01 remembered monitoring exception (2026-10-28)

- The owner's CODEX-AUTO-01 authorization narrowly supersedes session-only monitoring consent. Old session consent and ACC-04 descriptors never authorize automatic access.
- Fresh native Connect offers Connect once / Connect and remember / Cancel. Only successful, verified monitoring may save a native grant. The private native store holds opaque references, kind, policy/revision, a pseudonymous identity digest and an in-flight safety lease; never tokens, raw identity, quota or credential paths. ACC-04 remains untrusted presentation metadata.
- Startup may resume only matching, current native grants through the existing guarded adapter, without login or repeated dialogs. Disconnect durably revokes that account's permission. Quit stops owned resources and preserves explicit permission after bounded safe cleanup acknowledgement; crashes or unacknowledged/terminal failures require manual reconnection.
- Preserve pinned executable/startup policy, Remote Control prevention, private transport, account isolation, native cooldown and three-minute refresh. Retry only typed transient failures with bounded backoff; unknown App Server failures remain terminal.
- No system ACL changes, automatic login/logout, launch-at-login or unrelated tray changes. Acceptance gates remain local; production patch gates remain disabled. See `docs/security/codex-auto-01.md`.

## Svelte consent simplification (2026-10-28)

- Owner approved the isolated Svelte/Tauri consent design and then requested replacement of all app-owned OS message boxes. Manual Connect now means remembered monitoring permission; Cancel/close/Escape never approve. Old session-only consent is not upgraded.
- Rust creates one dedicated `codex-consent` child with a separate bundled entry and only prompt/confirm/cancel IPC. Main cannot approve its own request; child cannot access provider or general window APIs. Challenges are native, random, one-time, expiring and bound to the current account/connection/kind/generation. Main is disabled while the dialog is active and re-enabled on bounded cleanup.
- Permission is still saved only after a successful verified read. Direct adapters, native identity/ACL checks, private helper and three-minute refresh remain unchanged. Policy version 4 invalidates previous grants for renewed consent.
- No app-owned OS message-box fallback. If the custom native window cannot be safely created/focused/cleaned, monitoring fails closed. Retired legacy integration remains disabled and refuses authorization. Codex/browser-owned authentication windows are outside Quotafern's UI authority.
- This narrowly permits the additional consent window; the main tray popup and main-only provider capabilities remain unchanged. See `docs/security/connect-consent-svelte.md`. No production activation, commit/push/merge/release.

## CODEX-MERGE-PREP-01 final Windows scope (2026-10-28)

- Latest owner authorization supersedes earlier acceptance-only/always-false direct-gate instructions: enable the reviewed live implementation on Windows with native `cfg!(windows)`; renderer platform availability is advisory. macOS/Linux live access stays closed pending native acceptance. Both retired legacy gates remain false.
- Existing System uses only the reviewed private pinned helper over supervised stdio; managed accounts keep isolated direct HTTP. No shared-daemon attachment or automatic unreviewed helper fallback. No system ACL or credential changes.
- Keep isolated Rust-owned Svelte consent, native remembered authority, identity binding, three-minute refresh, cancellation, Remote Control disable/status, listener guard and owned-job cleanup. Remove production startup probes/receipt writers and endpoint observations; retain synthetic regressions. Tests must not rewrite live gates or access real credentials.
- Owner confirms full Windows System/managed Plus/Free, multi-account/Refresh all, Disconnect/Reconnect, persistent consent/relaunch auto-reconnect and Svelte consent PASS. See `docs/validation/codex-merge-prep-01.md` for limits and exact validation/review provenance.
- Commit/push/update Draft PR #16 and await exact-commit three-OS CI are authorized. Never merge, tag, release or modify unrelated PRs/worktrees. Earlier contrary scope statements remain historical.

## Documentation hygiene

- Keep `docs/superpowers/plans/`, architecture/security decisions, roadmap contracts, and acceptance evidence needed for audit or reproducibility.
- A screenshot without an explicit Markdown link may still be used by a dynamically named browser capture or JSON results. `source-` and `production-` screenshots may be byte-identical but carry separate test provenance. Do not delete based on filenames or file hashes alone.
- Future milestones should curate their canonical linked screenshots and use temporary/CI artifacts for nonessential exploratory captures. Before deleting existing files, verify scripts, result artifacts, Markdown references and test reproduction together.
- Keep public README descriptions aligned with implemented milestones; historical F1/F2/F3 evidence should remain historically accurate, not retroactively edited to claim native or live acceptance.
