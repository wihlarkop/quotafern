# F3 validation — 2026-10-24

Branch: `codex/f3-codex-quota`. Base: F2 squash merge `61333d4069ddd15cb296a53c1b97cc90d7819042`, verified as `origin/main` before implementation. The Draft PR handoff pins the final delivery HEAD and exact hosted CI run. This file describes the checked source; it cannot self-reference the commit that contains it.

## Delivery boundary

**The production live connection gate is closed.** F3 delivers the Codex bridge/normalized presentation foundation, future consent flow, explicit demo separation, and credential-free regression. It does not deliver a verified live subscription monitor. Clicking or invoking Connect cannot discover/start Codex while this gate is closed. No local auth file, keychain secret, live account endpoint, account login/logout, or real app-server was used for implementation or validation.

The blocker is documented in [Codex integration notes](codex-integration.md): stdio does not disable persisted Remote Control in the inspected 0.164.0 source. Its only deterministic per-process disable mechanism found is internal/undocumented. Additional model/cloud-configuration background requests also prevent claiming that stock startup contacts only the quota endpoint. A safe documented startup policy requires a separately reviewed source change; owner account access alone does not resolve this blocker.

## Reproducible automated checks

All checks use committed synthetic data or fake processes; none requires provider access. Use Bun 1.4.4 and stable Rust with Tauri platform prerequisites:

```text
bun install --frozen-lockfile
bun run regression
bun run lint
bun run fmt:check
bun run check
bun run build
bun run fmt:rust
bun run regression:rust
bun run check:rust
bun run lint:rust
bun run build:desktop --no-bundle --debug
git diff --check
```

The existing CI retains frontend locked checks and Rust formatting/Clippy/check/regression plus unbundled desktop compilation on Linux, Windows, and macOS. No workflow credentials, provider access, bundling/release job, or Node setup was added. Compilation is separate from native interaction acceptance.

## Evidence ledger

| Evidence                             | Result                             | Limits                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Bun install                   | PASS                               | Bun 1.4.4; no dependency changes                                                                                                                                                                                             |
| Bun regression                       | PASS, 10 groups / 629 assertions   | Synthetic fixtures, live freshness/source, closed-gate and exact permission/CSP guards                                                                                                                                       |
| Mock Rust transport/normalization    | PASS                               | 28 Rust regressions passed: 19 Codex protocol/normalization/security cases plus 9 existing popup cases. No real account or Codex executable                                                                                  |
| Integration contract/security review | PASS                               | Serde DTO field allowlist, TypeScript presentation/source checks, and exact command/CSP guards passed; independent source review findings were fixed                                                                         |
| Browser UI                           | Partial PASS                       | Actual Chrome local preview: disconnected Overview, blocked Accounts, explicit demo mode, six demo meters at 320×480; Accounts at 380×660 and dark Zinc & Signal Settings at 420×480. No horizontal overflow in those checks |
| Windows F3 native UI                 | NOT RUN                            | Browser inspection and compilation do not establish F3 native behavior                                                                                                                                                       |
| Real authenticated quota             | NOT RUN / blocked by launch policy | No credential authorization given or inferred                                                                                                                                                                                |
| macOS/Linux native interaction       | NOT RUN                            | Hosted compilation does not establish tray/child behavior                                                                                                                                                                    |

Browser preview initially timed out against a sandbox-local Vite server; a dedicated normal-access preview on port 1422 was reachable. A batched all-scenario UI attempt timed out; do not count it as an eight-scenario browser pass. The deterministic Bun fixture checks establish all eight data contracts separately.

The final local Windows source passed frontend lint/format/Svelte/build and Rust format/regression/check/Clippy. One early normalization assertion incorrectly depended on bucket map order; it was corrected to identify windows by ID, and unknown bucket labels were made generic. Independent review identified startup account-change invalidation, unbounded aggregate frame buffering, and API-key routing; those were fixed and covered by synthetic regressions. The final protocol check also accepts the documented headerless wire format. All 28 final Rust cases passed. A complete fake Codex service and real installed-CLI compatibility are not claimed by these transport/contract tests.

Source review confirms that production Connect exits before PATH lookup or process launch, and all four renderer operations are argument-free/main-only. This does not prove dormant process-tree behavior on actual Codex installations. Windows job attachment occurs after child creation; eliminating/validating that startup race is an explicit prerequisite before lifting the live gate. Unix process-group cleanup and platform-specific native behavior also remain owner/platform acceptance.

## Security-sensitive diff

- Four new main-only permissions: `allow-codex-connect`, `allow-codex-refresh`, `allow-codex-status`, `allow-codex-disconnect`; `allow-hide-popup` retained. No generic process, filesystem, HTTP, shell plugin, or raw RPC proxy.
- No CSP change. No additional frontend network privileges.
- Serde/serde_json support native presentation serialization and parsing; libc/windows-sys provide native process containment bindings. Existing versions remain locked; no frontend package is added.
- Child stderr is discarded. Protocol payloads and credentials are not persisted in logs/artifacts. Only generated safe fields cross IPC; unexpected raw fields are ignored.
- Only appearance mode/palette persist. No account identity, quota history, connection identifier, or remembered consent.
- The source gate is deliberately not configurable at runtime. No internal Codex environment workaround is used to lift it.

## Manual acceptance after a separately reviewed gate-enabling change

Do not attempt the live steps on this delivery: Connect is intentionally unavailable. First establish documented supported startup controls and review all subprocess side effects, process-tree containment, and actual supported installations. Re-run mock checks and hosted compilation at that source HEAD. Then the owner, with an existing ChatGPT-backed Codex CLI login, can explicitly authorize and perform:

1. Launch Quotafern disconnected. Visit Overview/Accounts and hide/show the popup; verify no Codex process or authenticated request starts.
2. Read the complete consent text, including Codex-managed automatic refresh/auth-state writes and policy enforcement. Explicitly Connect. Verify only the intended child process/tree and local stdio transport exist, with no listening or remote-control service.
3. Compare each reported bucket/window with Codex's own usage display, accounting for fetch time. Verify remaining percent is `100 - usedPercent`, seconds convert to accurate resets, and missing metadata stays unknown.
4. Manually Refresh; confirm disabled/loading state and native cooldown. Simulate a temporary failure without changing login; last-known values must be stale with the original time, and no synthetic provider row may appear.
5. Disconnect. Confirm all monitoring children exit and all snapshot state clears; independently confirm Codex CLI stays signed in. Restart Quotafern and verify it does not reconnect.
6. Separately exercise missing CLI, unsupported shell-only installation, incompatible version, signed-out and API-key modes. Do not paste secrets or attach raw responses to a report.
7. Confirm native Show/Hide/Quit, Escape/X and single-instance behavior on the actual F3 executable; repeat supported platform/process cleanup checks on macOS/Linux when available.

F4 recommendation only: resolve the documented startup-policy/compatibility boundary and perform owner-authorized live acceptance for Codex before adding any provider or automatic polling.
