# UX-02C validation

Date: 25 October 2026. Baseline `12826af477afc29cbc078fc8e413e976c01112cd`. Exact final HEAD and hosted CI results belong in the Draft PR description to avoid a self-referential commit hash.

## Preflight

The specified post-merge [baseline run 40207675832](https://github.com/wihlarkop/quotafern/actions/runs/40207675832) completed successfully in all four jobs: frontend, Windows, macOS and Ubuntu desktop checks. The main checkout was clean on an older F3 branch and was preserved. Work uses the managed `ux-02c-navigation` worktree and `codex/ux-02c-navigation` branch. All unrelated worktrees/branches and REL-01 PR #11 were preserved.

Read AGENTS.md, CONTEXT.md, ACC-01 architecture/UX contract, UI roadmap, UX-02B README/validation, security roadmap and provider roadmap. Inspected production presentation, fixture/view contracts and dormant native security gates. Frozen Bun 1.4.4 install passed with no lockfile changes. Baseline frontend regression passed 15 groups / 1,202 assertions.

## Local checks

| Check                                    | Result                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frozen Bun 1.4.4 install                 | Passed; lockfiles unchanged                                                               |
| Oxlint                                   | Passed, no warnings                                                                       |
| Oxfmt                                    | Passed (final check recorded with delivery)                                               |
| Svelte diagnostics                       | Zero errors and warnings                                                                  |
| Full frontend regression                 | 16 groups / 1,747 assertions; zero failures                                               |
| Production frontend build                | Passed                                                                                    |
| Source browser                           | 547 checks; zero failures; [JSON](browser-results.json)                                   |
| Compiled production browser              | 134 checks; zero failures; [JSON](production-results.json)                                |
| Rust formatting / Clippy / package check | Passed locally on Windows with locked dependencies and warnings denied                    |
| Synthetic Rust regression                | Passed locally on Windows: 57 passed, zero failed, 4 ignored                              |
| Impeccable mechanical detector           | Empty finding list for changed UI targets                                                 |
| Independent Luna High review             | Two P2 accessibility findings, both fixed and browser-verified; [dispositions](review.md) |

No native GUI acceptance is included. Hosted exact-HEAD status is recorded in the Draft PR and kept distinct from these local results.

## Browser evidence

The source UI is served locally by Vite on 4175, and the compiled production bundle by a localhost-only Bun static server on 4176. Both use the existing typed `scripts/tab-capture.ts` helper. Source-browser coverage includes all four screens at 320/380/420 × 480/660, both palettes and light/dark appearance, System light/dark changes, reduced motion, all fixed synthetic scenarios, tab highlight consistency, and horizontal document/panel/descendant overflow checks. Fixture coverage includes empty, single/multiple accounts, multiple keys, workspace/provider scope, duplicate/Unicode aliases, stale/current sources, errors/auth required, shared/unknown billing, pending removal, disconnected and unsupported providers, plus Demo OFF.

`interaction-check.js` drives actual browser keyboard actions for provider disclosure, account/source navigation, native select focus/Escape, tab arrows, source activation and popup Escape fallthrough. It verifies cross-tab selection, direct/nested Back, exact focus/scroll restoration, hidden and removed opener fallbacks, source-specific announcements, synchronous activity clearing, disconnected/removed Details and reset on demo/reload. Source and compiled production execute their applicable portions; development fixture controls are absent from production.

Source request recording remains localhost-only and storage checks allow only existing appearance/palette keys. No provider session is created or modified by any fixture. Shared-source de-duplication, sparse unknown activity, confirmed zero, independent freshness and per-source funding are retained from ACC-01/UX-02B and exercised again.

Reproduction with a dedicated Bun-run Playwright CLI session:

```text
bun run dev --port 4175 --strictPort
bun x --bun @playwright/cli -s=quotafern-ux02c open http://127.0.0.1:4175/ --browser chrome
bun run scripts/run-ui-check.ts browser quotafern-ux02c ux-02c
bun run build
# Serve dist on localhost 4176 before the production check.
bun x --bun @playwright/cli -s=quotafern-ux02c-production open http://127.0.0.1:4176/ --browser chrome
bun run scripts/run-ui-check.ts production quotafern-ux02c-production ux-02c
```

Canonical `after-*-380.png` files are compiled-production screenshots. Palette captures and Unicode/duplicate/error/removing/shared/unknown-source edge images come from source Svelte. `source-*` and `production-*` navigation images identify their runtime explicitly. Full-content captures temporarily expand only browser height/scroll containment for documentation and are supplemental; bounded 480/660 acceptance is separate. No animation is disabled to create captures; runtime reduced motion is tested independently.

## Security and acceptance limits

No Rust implementation, capability, permission, CSP, IPC, process containment, workflow, dependency, lockfile or ICON-01 asset changed. `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain unchanged. No credentials, external keychains, real provider account, app-server, OAuth, API input/storage, polling/reconnection, network request or new persistence is introduced. Native Escape handling is unchanged; browser Escape checks cannot prove OS hide behavior.

Actual assistive-technology speech, 200% OS text scaling, native tray/Show/Hide/Quit/focus, DPI and monitor acceptance are pending. Combined owner Windows native acceptance follows UX-02B/C, ACC-04 and ICON-01; macOS/Linux native interaction remains NOT RUN until suitable devices exist. SEC-01/02 and F4 blockers remain open. No release/deployment/merge was performed.
