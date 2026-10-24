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

## F1 product and security boundaries

- F1 quota data are synthetic and visibly labeled as demo in every build, including production. Do not add an implicit mock fallback to any future provider flow.
- F1 must not access credentials, provider HTTP, OAuth, token refresh, account synchronization, telemetry, or credential discovery.
- Keep the quota snapshot seam in TypeScript. Do not add a redundant Rust quota model or native snapshot authority in F1.
- Persist only the non-sensitive appearance mode (`system`, `light`, `dark`) and palette (Graphite & Jade / `graphite-jade`, Zinc & Signal / `zinc-signal`) in `localStorage`, as separate preferences.
- Keep the native surface to the single `main` window. It opens visible; close hides it; tray actions are Show, Hide, and Quit. Scope the `hide_popup` permission to `main` only.
- Keep release CSP restricted to bundled content and Tauri IPC. Development-only Vite/HMR allowances must not reach release policy.
- Treat future CLI discovery, app-owned keychain use, provider token refresh, and sanitized snapshots as design-only until separately scoped.

## Quality and acceptance

Keep this application local-first and secure by default. Prefer minimal dependencies and small, reviewable changes. Never merge or publish a release without explicit owner approval.

Do not use TDD for this foundation slice. Unit suites are deferred until main features; add the regression, integration, and security checks required by those features. CI covers locked frontend quality, Rust formatting/lint/check on Linux, Windows, and macOS, and an unbundled desktop compilation. Compilation does not prove native tray behavior. Record actual browser or OS acceptance separately from CI results, and leave unexercised platform behavior explicitly pending.

## F3 Codex exception and ongoing boundaries

F1 rules above remain historical foundation boundaries. F3 separately authorizes one native Codex app-server integration after explicit in-app consent. The Rust bridge owns process/protocol communication and returns a small sanitized live presentation contract to TypeScript. No other live provider is authorized.

- Start disconnected; never remember or silently restore consent. Opening a view must not initiate provider access. Manual refresh only, with a native cooldown.
- Codex owns authentication. Never directly inspect/copy its credential files, enumerate secrets, or implement login/logout, token injection, turns, reset redemption, purchases, or a raw app-server proxy. Disclose Codex-managed refresh and possible authentication-state writes before connection.
- No developer or CI credential access is authorized. Use synthetic protocol fixtures and isolated fake processes. Real authenticated acceptance belongs to the owner unless separately authorized.
- Keep live and demo sources explicit and separate. A live failure must never fall back to synthetic data. Persist only the existing appearance preferences.
- Native commands are fixed, main-only operations; no renderer-controlled executable, path, arguments, filesystem access, or network URL. Keep CSP unchanged and disable optional child telemetry.
- Review subprocess containment/cleanup and all new permissions. Never merge, deploy, publish, or release without explicit owner approval.
- The F3 addendum permits read-only `account/usage/read` and optional credit/spending/earned-reset metadata. Never consume resets, purchase credits, change limits, or initiate inference. Calendar gaps are unknown; token counts never imply money. Unimplemented providers are Coming Soon outside explicitly labeled demos.
- Sign in with ChatGPT identity and inference scopes are distinct from Codex monitoring authorization. Do not add OAuth or request inference scopes without evidence of the required read-only monitoring grant and a separately reviewed credential lifecycle. Keep SEC-01/SEC-02 gates in `docs/security-roadmap.md` explicit.
