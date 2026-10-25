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

## Global personal-only scope (2026-10-26 owner decision)

Quotafern serves **one human operator** with **their own personal accounts** and optionally multiple independently authorized personal API keys. Multi-account does not mean multi-user or organization support. This scope applies to **all** present and future providers; see `docs/plans/personal-only-product-scope.md`.

Do **not** implement enterprise/team/business workspace administration, organization billing/analytics, company seat or member monitoring, shared dashboards, admin API scopes, or payment management. It is fine to recognize unsupported workspace plan types solely to reject or safely omit them. Optional plan, Free/Paid, quota, renewal, next-charge and expiry fields appear only when source-verified; omit missing fields and empty sections without manual billing entry.

Active provider research is **Codex (PR #16)** and **Claude Code (PR #17)** only. Gemini, Copilot, OpenRouter and OpenCode research is paused. Keep provider research and implementation within its own Draft PR, and cross-cutting scope rules in a separate documentation PR. No automatic merger, release or provider live enabling.

## F3 Codex exception and ongoing boundaries

F1 rules above remain historical foundation boundaries. F3 separately authorizes one native Codex app-server integration after explicit in-app consent. The Rust bridge owns process/protocol communication and returns a small sanitized live presentation contract to TypeScript. No other live provider is authorized.

- Start disconnected; never remember or silently restore consent. Opening a view must not initiate provider access. Manual refresh only, with a native cooldown.
- Codex owns authentication. Never directly inspect/copy its credential files, enumerate secrets, or implement login/logout, token injection, turns, reset redemption, purchases, or a raw app-server proxy. Disclose Codex-managed refresh and possible authentication-state writes before connection.
- No developer or CI credential access is authorized. Use synthetic protocol fixtures and isolated fake processes. Real authenticated acceptance belongs to the owner unless separately authorized.
- Keep live and demo sources explicit and separate. A live failure must never fall back to synthetic data. Never persist provider secrets, consent/authorization, live quota, account identities or native runtime state. ACC-04 separately permits only schema-validated non-sensitive local metadata as described below.
- Native commands are fixed, main-only operations; no renderer-controlled executable, path, arguments, filesystem access, or network URL. Keep CSP unchanged and disable optional child telemetry.
- Review subprocess containment/cleanup and all new permissions. Never merge, deploy, publish, or release without explicit owner approval.
- The F3 addendum permits read-only `account/usage/read` and optional credit/spending/earned-reset metadata. Never consume resets, purchase credits, change limits, or initiate inference. Calendar gaps are unknown; token counts never imply money. Unimplemented providers are Coming Soon outside explicitly labeled demos.
- Sign in with ChatGPT identity and inference scopes are distinct from Codex monitoring authorization. Do not add OAuth or request inference scopes without evidence of the required read-only monitoring grant and a separately reviewed credential lifecycle. Keep SEC-01/SEC-02 gates in `docs/security-roadmap.md` explicit.

## ACC-01/ACC-04 account metadata (current scope)

- The current multi-account UI supports local accounts, workspaces, connection descriptors and user-defined aliases, not authenticated provider sessions. `docs/acc-01-architecture.md`, `docs/acc-01-ux-contract.md`, and `docs/acc-04/README.md` define the model and limits.
- ACC-04 may persist only validated, non-sensitive ID/alias/owner/mechanism metadata using the strict `quotafern.account-presentation.v1` codec. Never persist credentials, auth file paths, consent, authorization, provider identity, quotas, activity, billing or subprocess state. The storage is plaintext and is **not** an authority or secret store.
- On startup, local connections are disconnected with no real usage. Demo accounts are synthetic and must never enter saved user metadata. Renames never change stable IDs. Real/native-managed deletion needs independently verified cleanup authority; never fake a cleanup acknowledgment or provider logout.
- Both live Codex gates are intentionally disabled: Rust `LIVE_CONNECTION_ENABLED = false` and renderer `CODEX_CONNECTION_AVAILABLE = false`. F4 startup side effects and Unix forced-parent termination are unresolved; do not enable live provider work merely because the UI and local account flows passed Windows acceptance.
- Owner-reported combined Windows native GUI acceptance covers the **live-disabled foundation** after ACC-04. macOS/Linux native GUI, real provider sessions, signed installers and updater behavior remain unverified.

## Documentation hygiene

- Keep `docs/superpowers/plans/`, architecture/security decisions, roadmap contracts, and acceptance evidence needed for audit or reproducibility.
- A screenshot without an explicit Markdown link may still be used by a dynamically named browser capture or JSON results. `source-` and `production-` screenshots may be byte-identical but carry separate test provenance. Do not delete based on filenames or file hashes alone.
- Future milestones should curate their canonical linked screenshots and use temporary/CI artifacts for nonessential exploratory captures. Before deleting existing files, verify scripts, result artifacts, Markdown references and test reproduction together.
- Keep public README descriptions aligned with implemented milestones; historical F1/F2/F3 evidence should remain historically accurate, not retroactively edited to claim native or live acceptance.
