# CODEX-MERGE-PREP-01: final Windows implementation

## Owner acceptance

On 2026-10-28 the owner explicitly confirmed Windows PASS for Existing Codex via supervised stdio, managed Plus and Free accounts, independent account quota/Refresh all, Disconnect/Reconnect, remembered permission/automatic reconnect after full relaunch, and Svelte consent. These are owner observations, not developer-authenticated tests. No developer or CI credential access is authorized.

## Intentional activation and support scope

- Native `DIRECT_CONNECTION_ENABLED = cfg!(windows)`. Connect/login/refresh/resume fail closed off Windows; remembered listing returns no grants. Revocation and in-memory status are not provider access.
- Renderer availability recognizes Windows `Win32`/`Win64` only. It is presentation advice; Rust is authoritative. There is no stored preference, runtime environment switch or renderer argument that can lift the native gate or grant consent.
- Retired legacy `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain independent. The retired route cannot authorize monitoring.
- Acceptance-only stdio/startup/attach switches and startup probe are removed. Windows System uses only the reviewed short-lived private stdio process; unused shared-daemon attachment is removed.
- macOS/Linux native and authenticated acceptance remains **NOT RUN**. Their CI compile/regression results do not enable live access.

## Shipped behavior and controls

Connect shows the Rust-created isolated Svelte consent window and always requests remembered monitoring permission. Old session consent never upgrades itself. Only a successful identity-bound normalized reading can persist a native grant. The child cannot call provider commands; main cannot confirm its own pending challenge. Close/Cancel/Escape/expiry/Disconnect/Quit invalidate pending approval. Opening views is not permission.

System uses the reviewed private `codex-cli 0.164.0-alpha.11.1` executable, SHA-256 `1103e9e09c71fa2cd0afd6d8f3b9a2d63174fe8efd7cb5bd09f1cb14ef58a098`, source `6905ecede7816e91373e9eabda3f6b0368fc747b`. Every use verifies private ancestry/owner/DACL, nonreparse regular file, single link, exact bytes and retained non-write/delete-sharing handles. A safe cached image may survive installed-CLI updates; an absent cache can be seeded only from matching installed bytes. No automatic download or fallback to an unreviewed image. A clean installation without the pinned helper is unsupported until that exact helper is available; it fails closed. This is a documented compatibility limitation, not a claim of arbitrary Codex-version support.

Fixed private stdin/stdout startup uses the reviewed internal Remote Control disable marker and fixed arguments. Disabled status is required before explicit account reads; identity is verified before quota, then account/workspace and Remote Control are checked again. Unsafe notifications, protocol abuse, unexpected owned listeners and audit/cleanup failures stop monitoring. Windows Job assignment precedes process resume; cancellation/Quit stops only owned descendants. Codex may perform its own ordinary auth renewal, cloud-config/model initialization after consent. Quotafern does not read raw System tokens, alter system login/ACLs, enable Remote Control, start a listener, perform inference or copy credentials.

Managed accounts retain strictly private isolated homes and native-only direct HTTPS reads to the fixed unofficial usage endpoint. User-requested Windows Sign in uses the same pinned private executable and controlled executable/system-only PATH as System monitoring; an inherited mutable CLI launcher is not executed. This hardens program selection without implementing authentication. Sign in therefore also requires the reviewed helper; an already authenticated managed home can be read directly. Redirect/proxy/TLS/response/account-binding checks remain. No token-renewal implementation, browser-cookie access, provider logout or credential deletion is added. Owner acceptance preceded this program-selection hardening; no developer-authenticated rerun is claimed.

Three-minute polling runs only for valid connected permission. Typed transient failures have bounded backoff; unknown RPC/auth/policy/identity failures stop unattended attempts. Durable in-flight permission leases fail closed on terminal/crash/unacknowledged cleanup; normal Quit preserves explicit permission. Disconnect durably revokes it. Live failure never becomes demo or receives a fresh success timestamp.

## Acceptance instrumentation removed

Production no longer writes startup receipts, references the build checkout at runtime, records remote TCP endpoints/ports, or offers startup-only/unused attach transports. The owned-job listener guard remains in memory and fail-closed. Safe allowlisted error categories remain for recovery; acceptance-stage UI wrappers are removed. Tests run against intentional production gates directly; the compile-time test presenter always denies personal consent and cannot activate provider access. Synthetic HTTP/process/ACL/challenge fixtures remain in the existing suites.

## Validation and review provenance

Local and exact-commit hosted results are recorded in the PR description and final handoff. Hosted matrix covers Windows, macOS and Linux without real credentials. No native acceptance is inferred from compilation.

Final local checks passed with the production Windows gate in place, without rewriting gates: locked Bun install, Svelte check (0 errors/warnings), Oxlint, Oxfmt, frontend regression (20 groups / 2121 assertions), Rust formatting, warnings-denied Clippy, locked Rust check and native regression (94 passed / 4 ignored fixture entry points). HTTP/process/ACL/protocol fixtures are synthetic. A high-confidence changed-source secret-pattern scan found no candidates; it is not a guarantee against all possible secrets or a substitute for hosted scanning.

The final Windows unbundled desktop build also passed after managed-login executable hardening. Existing synthetic browser checks ran against its actual bundled `dist` assets: 14 consent checks and 6 account auto-reconnect/disconnect checks passed. They performed no real native consent, login, quota request or credential access. These are separate from the owner's real-account evidence above.

Earlier independent Luna High reviews covered the cumulative stdio, storage, persistent permission and isolated Svelte design. For this preparation Luna accepted the Windows-only activation policy and completed an initial cleanup source pass, then hit its model usage limit. The owner explicitly authorized one independent GPT-6.1 Sol High reviewer as replacement. That fresh reviewer completed the final cumulative tracked/untracked source and regression-coverage audit: **no actionable P0–P2 blocker**, conditional on final exact-commit checks. It checked existing test logs rather than rerunning them, and performed no native/auth/provider operation. Managed-login program-selection hardening still has no fresh real-login acceptance claim. No merge/release/tag is authorized; Draft status remains unchanged.
