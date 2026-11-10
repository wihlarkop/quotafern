# Quotafern — Parallel Execution Playbook

**Status:** owner-requested governance, 2026-11-10. [ROADMAP-001 #22](https://github.com/wihlarkop/quotafern/issues/22) is the only authoritative issue membership, order and strict dependency graph. This playbook governs **scheduling and safe file ownership**, not feature scope. Read [AGENTS.md](../../AGENTS.md), [OPS-001 #23](https://github.com/wihlarkop/quotafern/issues/23) and the selected issue first.

## Modes of owner authorization

| Owner instruction | Permitted work |
| --- | --- |
| `Execute issue #N` | That issue and required contained groundwork; one Draft PR, then stop |
| `Execute next eligible issue` | The earliest verified READY task from ROADMAP; one issue, stop |
| `Execute next eligible parallel wave in Qn` | Current smallest eligible group of independent READY issues in named phase, then stop |
| `Execute complete Qn with maximum safe parallelism` | Dispatch all independently READY issues in that named phase; after each actual reviewed upstream merge, recalculate downstream readiness without waiting for unrelated siblings; stop when blocked or phase complete |
| No explicit issue/phase/wave selection | Read-only examination or owner-requested documentation; **no implementation** |

No issue, green CI, time passage, PR merge or roadmap update auto-authorizes work. Deferred/optional issues require named owner selection. No background polling/dispatch after a Codex run.

## Preflight: prove readiness before writing

1. Inspect `main` HEAD, active PRs, [ROADMAP #22](https://github.com/wihlarkop/quotafern/issues/22), issue bodies, security decisions and [QA ledger #24](https://github.com/wihlarkop/quotafern/issues/24).
2. Classify each candidate: `COVERED/MERGED`, `READY`, `DRAFT_PR`, `WAITING_FOR_MERGE`, `BLOCKED`, `DEFERRED`, `OUT_OF_SCOPE`. Do not implement an already merged feature again.
3. Mark task **READY only if every strict prerequisite has a ChatGPT-independent review and a verified merge SHA on the required base**. A completed Draft, green CI or worktree **does not** satisfy this.
4. Create a writer-reservation table:

   | Issue | Accountable Luna | Branch/worktree | Exact integrated base | Reserved paths | Working outcome | Status |
   | --- | --- | --- | --- | --- | --- | --- |
   | `#N` | `Luna High` | `...` | `main@sha / prerequisite merge sha` | `...` | `...` | `READY` |

5. Only after paths and dependencies are proven disjoint, start independent features in parallel. Never spawn extra agents merely to claim concurrency.

## Hard dependency rule: no provisional stacked downstream implementation

For a dependency chain `A → C` and independent `B`: while A is an unmerged Draft, **C cannot start**. If B has no A dependency and independent files, B may start or continue. After ChatGPT reviews and **merges A**, C can start within an explicitly authorized whole-phase scope without waiting for unrelated B. This is dynamic execution **without a global wave barrier**.

The already-existing [PERF-01 PR #21](https://github.com/wihlarkop/quotafern/pull/21) is grandfathered: it was stacked against [UX-03 PR #20](https://github.com/wihlarkop/quotafern/pull/20) before these instructions. **Preserve it**, but do not add more stacked downstream PRs. Once #20 actually merges, pin and rebase/retarget #21 to integrated main and re-run exact-HEAD review and CI; do not claim its original green build proves integrated correctness.

## Single-writer reservations

Serialize or designate one integrator for:
- `AGENTS.md`, roadmap/OPS/QA issue edits, approved ADRs and `docs/operations/*`.
- `package.json`, `bun.lock`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, Rust toolchain and `.github/workflows/*`.
- Tauri capabilities/CSP, `src-tauri/src/lib.rs`, native consent/grant/security store and shared Codex executable/IPC/process lifecycle code.
- `src/App.svelte`, global `src/app.css`, account navigation/state/source schemas, shared quota readout/consent components and theme tokens.

Different worktrees do **not** guarantee distinct logical ownership. If two issues need a shared file, keep a single writer/integrator or serialize that edit after reviewing the upstream merge. Other agents may perform read-only research.

Examples: Claude policy research and isolated performance measurements may proceed in parallel if authorized and file-disjoint; Windows-native Codex helper and macOS/Linux process-lifecycle changes may share Rust contracts and therefore must be serialized or integrated by one owner. Never parallelize independent feature issues just because each has a separate Git branch.

## Quotafern-specific checks and native acceptance

Unlike the reference Adevyn/Algonaru repositories, Quotafern **already has** deterministic Bun/TypeScript regressions, Rust regression fixtures, source/production browser QA and hosted Windows/macOS/Linux CI. Preserve these, and run applicable checks under `AGENTS.md`. Do **not** add standalone new unit-test suites or switch to TDD without owner authorization. Never sacrifice security checks for benchmark percentages.

Real Codex/Claude credentials, authenticated provider calls, native tray/consent UX and device-level performance are **owner-only or separately authorized**. Report `PASS`, `FAIL`, `PENDING`, `DEFERRED`, `NOT RUN`, `BLOCKED` accurately. A passing build/browser simulation cannot be promoted to native PASS.

Owner checks belong in [QA-MANUAL-001 #24](https://github.com/wihlarkop/quotafern/issues/24). An engineering merge must not be described as release or certification. The current UX-03 native acceptance remains pending until the owner tests the exact relevant build.

## Handoff and stop condition

For every issued PR, report stable issue ID, Luna owner, exact main/base and new HEAD SHA, upstream merged proof, owned files, work outcome, permitted regression/CI evidence, independent Luna High findings, known risks, deferred native checks and PowerShell commands for the owner. Create/update a **Draft PR only**, stop at handoff for ChatGPT's independent exact-HEAD review and owner-governed merge. Do not mark ready, merge, enable auto-merge, change visibility, tag, release or advance to unrequested work.

Recheck ROADMAP-001 after verified merges; never use a stale screenshot or old roadmap document to override current issue order.
