# DX-01 — Developer Experience and Codebase Cleanup

**Status:** Planned / documentation only. **Implementation:** NOT STARTED.  
**Prerequisite:** The owner has accepted both the Codex live/multi-account and Claude Code integrations. Do not start this milestone while either provider is still under implementation or awaiting acceptance.

## Why

Quotafern should remain a simple, fast, local-first desktop quota app for one user with multiple personal provider accounts. Once Codex and Claude Code actually work, use those **two real integrations** to improve code organization, contributor onboarding, and feature-development ergonomics. Avoid inventing a general-purpose plugin system before evidence shows it is useful.

This PR is a planning placeholder, not a refactor. Revisit its assumptions against the actual merged and accepted implementations before touching code.

## Scope — deliberately small

1. **Architecture cleanup.** Audit Svelte/TypeScript and Tauri/Rust module boundaries, file sizes, coupling, account ownership, provider-specific parsing and UI state. Remove proven duplication and dead code. Split oversized modules when readability improves, not just to maximize file count.
2. **Provider extensibility.** Compare the actual Codex and Claude Code flows: authenticated session ownership, account isolation, quota window normalization, optional fields, refresh/cooldown, errors, and sanitized snapshots. Extract only the shared behavior that both already need; preserve provider-specific adapters and permissions. Do not introduce a new provider or speculative framework.
3. **Developer workflow.** Make setup/build/QA commands predictable and documented. Preserve the existing Bun-only, Oxc-first, feature-first toolchain and committed lockfiles. Improve unclear scripts only with reproducible evidence.
4. **Contributor experience.** Introduce or update a concise `CONTRIBUTING.md`, a developer quickstart, an architecture map, guidance for adding a future provider, and PR/evidence expectations. Keep a single canonical entry point; link to detailed docs instead of duplicating them.
5. **Quality and security.** Preserve existing regression suites, browser QA, platform-specific native checks, Tauri IPC permissions, CSP, local-first credential boundaries, secret-safe logging, and deterministic CI. Remove obsolete documentation only after checking references and preserving historically important evidence.
6. **UX preservation.** Keep the current Quotafern layouts, tray behavior, settings, component styling, accessibility and user flows intact. DX-01 is not a UI revamp.

## Out of scope

- No Codex or Claude feature work, live gate changes, account re-auth redesign or extra provider integrations.
- No new unit-test suite or TDD mandate. Use existing regression-first, feature-first practice; add focused integration/security/regression evidence where changes require it.
- No unnecessary abstractions, repository rewrites, dependency churn, migration to a new framework, visual redesign, telemetry, cloud backend or multi-user/enterprise support.
- No merge, deployment, release or deletion of historical evidence without owner approval.

## Execution order — only after both providers are accepted

| Step | Result |
| --- | --- |
| 1. Baseline & audit | Rebase from current accepted `main`; map modules, dependencies, duplicated behavior, poor DX, documentation gaps and CI state. Record measured pain points rather than hypothetical issues. |
| 2. Small refactors | Separate provider-specific clients from shared snapshot/account contracts where warranted; simplify Svelte state and Rust command ownership without changing behavior. |
| 3. Contributor docs | Publish a short reproducible onboarding flow, architecture overview and provider-contribution checklist. |
| 4. Verification | Run existing locked Bun/Rust checks, regression suites, browser QA and available Windows/macOS/Linux native checks. Compare key user flows before vs. after. |
| 5. Independent review | Obtain an independent Luna High review for architecture, security, accidental behavior changes and unnecessary complexity. Address findings and update evidence. |
| 6. Delivery | Push reviewed changes to the dedicated DX-01 Draft PR, check exact HEAD and CI/GitGuardian where configured, report remaining platform acceptance separately. **Do not merge without owner approval.** |

## Acceptance criteria

- A new contributor can follow the README / CONTRIBUTING quickstart on a clean machine using the **documented** Bun and Rust prerequisites and run the established checks without guessing commands.
- Existing Codex and Claude Code account connection, refresh, quota presentation, missing-field behavior and error states work unchanged. One account can never show another's values.
- No visual redesign; comparison evidence covers existing tray/window/account screens and primary flows.
- Shared modules represent **observed duplication in both actual provider implementations**, not premature generic interfaces. Small provider-specific code may remain duplicated when an abstraction would be harder to understand.
- Any behavior changes are explicitly separated, justified and approved rather than slipped into a DX cleanup.
- CI and regression checks pass at the final HEAD, with native/manual acceptance clearly marked PASS, FAIL, BLOCKED or NOT RUN.
- Documentation navigation links are valid; outdated claims are corrected, and security/acceptance history is retained accurately.
- No additional unit-test obligation, new external service, unnecessary runtime permissions or credential exposure.

## Dependencies and start gate

- [ ] Codex live quota + personal multi-account implementation has been reviewed and owner-accepted.
- [ ] Claude Code integration has been reviewed and owner-accepted.
- [ ] Both accepted changes are integrated into the chosen implementation baseline.
- [ ] Owner explicitly authorizes **DX-01 implementation** and its concrete, limited scope.

Until these are true, keep this PR **Draft, documentation-only and unmerged**. Updating this plan is fine; starting source-code refactors is not.

## Existing sources of truth

- [Repository guidance](../../AGENTS.md)
- [Architecture](../specs/architecture.md)
- [Provider roadmap](provider-connections-roadmap.md)
- [Security roadmap](security-roadmap.md)
- [Documentation index](../README.md)
- [Root README](../../README.md)

**Guiding rule:** make the next contributor's first hour and the next provider's first PR easier, while keeping Quotafern as small and user-friendly as it is today.
