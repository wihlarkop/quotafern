# UX-02B implementation plan

Spec: owner-provided UX-02B Account-Aware Production UI brief; approved Hybrid A+B and ACC-01 UX contract.

Keep the existing Svelte shell, appearance tokens, native behavior and both disabled live gates. Implement inline with one independent Luna High review. Feature-first; no TDD, per AGENTS.md. No new dependencies or persistence.

- [x] Add deterministic synthetic ACC-01 fixture states and a presentation-only activity adapter. Preserve domain ownership/lifecycle code.
- [x] Render hierarchical Accounts through `accountsView`; show source freshness, connection lifecycle, identity, duplicate disambiguation and pending states independently.
- [x] Render account-first Overview through `overviewView` and transient `Selection`; render Details through `detailsView`, keyed by source and connection with synchronous context clearing. Reuse the existing activity grid.
- [x] Preserve settings and disconnected production behavior; add OpenRouter and the remaining Coming Soon catalog without synthetic records when Demo is off.
- [x] Run required quality/regression/build checks and bounded browser acceptance at 320/380/420px, normal/short heights, both palettes/modes and reduced motion; save actual Svelte screenshots.
- [x] Request one Luna High visual/architecture/security review, address material findings, record evidence and prepare Draft PR delivery.

Review focus: cross-account detail leaks; shared source duplication; zero versus unknown; duplicate/Unicode aliases and overflow; Demo OFF and persisted state. All are covered by synthetic regression and browser checks. Native Windows acceptance is deferred until ICON-01, UX-02B/C and ACC-04; macOS/Linux native interaction NOT RUN.

Progress: baseline main `b577eb66ff6159974d2335785538e990fe387105`; specified post-merge CI 4/4 success; frozen Bun install, baseline regression (13 groups, 1,001 assertions), Svelte diagnostics and production build pass. Before screenshots captured.

Completion evidence: 183 new presentation assertions; 1,184 total regression assertions; 324 source-browser checks; 50 compiled-production checks; lint, formatting, Svelte diagnostics, build and Windows Rust format/lint/check passed. Both review findings fixed and browser-verified. See validation.md and review.md.

Delivery instruction: commit these reviewed changes, push the feature branch, create/attach a Draft PR, report exact final HEAD and hosted CI accurately, and stop without merging or releasing.
