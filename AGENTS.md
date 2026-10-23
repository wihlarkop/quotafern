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
