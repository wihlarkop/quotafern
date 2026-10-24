# F3 validation — 2026-10-24

Branch: `codex/f3-codex-quota`. Base: F2 squash merge `61333d4069ddd15cb296a53c1b97cc90d7819042`, verified as `origin/main` before implementation. The Draft PR handoff pins the final delivery HEAD and exact hosted CI run. This file describes the checked source; it cannot self-reference the commit that contains it.

## Security gate resolution follow-up

The accepted quota/credit/spending/reset/Activity/84-day heatmap/Coming Soon implementation at `ac05182df2906a005834f540d7a4be23bca6e1cc` is preserved. Earlier results below are historical; this section records the gate-hardening evidence. The final PR handoff identifies the exact follow-up HEAD and its hosted run.

| Gate | Status and scope |

| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |

| 1. Supported quota-only startup | **BLOCKED.** Pinned Codex 0.164.0 may restore persisted outbound Remote Control, load/refresh cloud config and models, and refresh/save managed auth. No documented supported quota-only mode found. Both live constants remain false. |

| 2. Native consent authorization | **PASS in direct-IPC/mock/process regression.** Fixed Rust-owned OS prompt, no renderer approval argument, one attempt, no remembered consent, cancellation/late approval/concurrency/exit invalidation. Actual OS-dialog interaction **NOT RUN**. |

| 3. Windows containment | **PASS in local Windows fake-process runtime.** Atomic `JOB_LIST` membership under suspended creation; root/grandchild membership, normal/drop/timeout/unexpected-exit cleanup, startup/assignment failure. Windows 10+ API contract; local host reports Windows version 10.0.26200. GUI acceptance is separate. |

| Linux/macOS process groups | Graceful cleanup has dedicated fake-process and blocked-I/O regressions in hosted CI; see exact-HEAD handoff results. Forced parent termination **BLOCKED**: process groups have no parent-death guarantee. Native GUI/tray acceptance **NOT RUN** for F3. |

| 4. Independent review | **PASS — completed independent static review**, including recheck of cancellation/shutdown findings after fixes. See [finding disposition](f3-security-review.md). The interrupted historical addendum review is not counted. |

| Live/Plus acceptance | **BLOCKED / NOT RUN.** No proposed enable diff or executable owner Plus checklist is eligible while Gate 1 is unresolved. |

Native consent tests invoke the actual generic `codex_connect` Tauri handler via MockRuntime with forged IPC bodies, compile-time-only dialog answers and a fake process launcher. They cover closed-gate direct invocation, cancellation, concurrent Connect, late approval after Disconnect, startup cancellation at app exit and rejection after shutdown. This validates the native authorization state machine, not an actual clicked OS dialog. Test injection is compiled out of production; no environment/debug setting enables the real connection.

Disconnect first revokes the attempt's cancellation token, then synchronizes the same native barrier used for process creation/resume and outbound protocol writes. Future operations check revocation under that barrier. A watchdog can kill the job/group without acquiring the barrier, interrupting a blocked writer before cancellation completes. Snapshot clearing stays under the session lock after worker shutdown, so an older Disconnect cannot erase a newer connection. Application shutdown permanently closes that bridge instance.

The standalone `tests/fixtures/app_server.rs` executable is compiled by the test harness into ignored `target/` storage. It impersonates only synthetic version/initialize/account/quota/activity replies and never touches Codex installation, profiles or credentials. Separate fixtures deliberately stop reading stdin, create descendants and exit unexpectedly. The watchdog regression fills a real stdin pipe and proves both deadline and explicit cancellation unblock it by terminating the owned process. The Windows process fixture verifies job membership for root and grandchild; it does not runtime-test an unrelated inheritable-handle sentinel. The explicit native handle list is source-reviewed. Job containment is not a native executable sandbox or protection against a child delegating execution to another OS service.

The library test executable initially failed before its harness with `STATUS_ENTRYPOINT_NOT_FOUND`: the native dialog dependency imports `TaskDialogIndirect`, requiring common-controls v6 activation. The regression build substitutes the OS-dialog presenter at compile time but still links dialog-library imports. The existing `bun run regression:rust` command now selects a `native-regression` Cargo feature that embeds common-controls v6 for the `--lib` test executable. Normal desktop compilation does not select that feature and retains Tauri's existing resource manifest, avoiding duplicate manifest resources. This is build-only test setup, with no live-enable or renderer authorization switch. Use the package regression command; the feature is not intended for desktop binary builds. The earlier post-spawn implementation has been removed; there is no uncontained fallback.

The unchanged Bun regression covers 11 groups / 675 assertions, including quota/demo contracts, exact capabilities/CSP, stale presentation and Activity. The existing nine popup/focus Rust regressions remain. Browser acceptance from the prior addendum remains historical; only consent copy changes in this follow-up. Windows native dialog/tray interaction and real authenticated app-server behavior remain **NOT RUN**. No real credentials, local Codex auth/configuration file, keychain record, login/logout, inference or authenticated request was accessed.

## Direct-IPC harness CI repair

The exact `7c8b90d021b6d3d7e4b55e53f0d0e00c997960b7` [hosted run 40100172021](https://github.com/wihlarkop/quotafern/actions/runs/40100172021) passed Frontend quality and Windows desktop, but both macOS and Linux failed the same three direct-IPC consent tests: 45 passed, 3 failed, 1 ignored on each Unix job. Their error was `codex_connect not allowed. Plugin not found`; desktop compilation was skipped after regression failed. This supersedes the earlier handoff's pending CI status.

The cause was test configuration, before native command dispatch. In locked Tauri 2.12.5, `mock_context(noop_assets())` has an empty `RuntimeAuthority` and no app ACL manifest. The harness also hard-coded `http://tauri.localhost`, the Windows local-protocol mapping. macOS/Linux use `tauri://localhost`; the old HTTP URL was remote there. `Webview::on_message` requires ACL authorization for remote requests, and `RuntimeAuthority::resolve_access_message` reported the missing `__app-acl__` manifest as “Plugin not found”. On Windows the same URL was local, so Tauri's no-app-manifest compatibility path skipped app-command ACL enforcement, giving a false-positive security test pass.

The production `build.rs` command manifest, generated `acl-manifests.json`, `capabilities.json`, and `lib.rs` invoke handler all contained `codex_connect` and the four correctly named explicit Codex permissions. Production already builds with `generate_context!()`; no production command registration or native dialog plugin was missing. The rejection was reproduced locally on Windows by temporarily giving the old empty-context harness a remote origin, obtaining the exact same error. That diagnostic mutation is not retained and is not a macOS runtime claim.

The repaired test builder uses `generate_context!()` with `MockRuntime`, loading the actual generated app manifest and `main-capability`; request origins follow the target platform. Original consent tests still require successful IPC dispatch and their trusted native presenter result. A new negative control registers a harmless test-only command without granting it any permission, and verifies it is rejected. It also verifies other windows, an untrusted HTTPS origin and the opposite platform's local-looking origin fail ACL authorization before any consent callback or process launch. A permitted main/local request then reaches the presenter and is cancelled despite a forged renderer approval field.

All Rust changes are inside the existing `#[cfg(test)]` module. Production commands, capability/permission files, CSP, dependency lockfiles, `native-regression` feature/build-manifest handling and test-only presenter substitutions are unchanged. No wildcard capability, remote URL grant, generic shell/filesystem/network access or authorization bypass is introduced. Startup and Unix forced-parent termination remain **BLOCKED**; native dialog acceptance, real Codex compatibility and authenticated quota are **NOT RUN**.

The final repair HEAD and all four completed hosted job results are recorded in the Draft PR handoff. The failed run above is retained as diagnostic evidence, never reported as CI PASS.

Focused independent review of this repair found no actionable code/security findings. It confirmed that the diff is limited to the test module and these validation notes, the generated ACL is loaded without new grants, and denied requests never reach the consent callback. This was source review, separate from the lead's regression execution and hosted platform results.

Repair validation on Windows passed frozen Bun install, Oxlint/Oxfmt, Svelte check/build (0 errors/warnings), 11 Bun regression groups / 675 assertions, Rust format/check/Clippy, and 55 Rust tests with 0 failures / 4 subprocess fixture entry points ignored at the top level. The new ACL regression adds one test to the prior count. Normal `bun run build:desktop --no-bundle --debug` also passed without selecting `native-regression`, verifying production compilation remains separate from the headless test manifest/presenter setup. Hosted macOS/Linux execution and all four job conclusions must be verified on the exact repair HEAD before CI PASS is claimed.

## Follow-up local checks

| Check | Result |

| --- | --- |

| Bun frozen install | PASS; no package version/lock change |

| Bun regression | PASS: 11 groups, 675 assertions |

| Oxlint / Oxfmt | PASS |

| Svelte diagnostics / Vite build | PASS: 0 errors, 0 warnings |

| Rust format / check / Clippy all targets | PASS |

| Rust regression (Windows) | PASS: 54 tests, 0 failed; 4 ignored functions are subprocess entry fixtures invoked by their owning tests |

| Windows desktop compilation | PASS: `bun run build:desktop --no-bundle --debug`; production manifest configuration |

| Independent source/config security review | Completed; cancellation and shutdown findings fixed/rechecked; startup and Unix forced-exit blockers retained |

| Hosted exact-final-HEAD CI | Exact run and per-platform results are recorded in the Draft PR handoff; prior HEAD runs are not substituted |

Cargo added 14 locked package versions for the native dialog dependency and its platform/build support; no existing locked package version was removed. The temporary all-target manifest attempt caused a duplicate desktop resource and was replaced by the regression-command-only feature described above. Sandbox incremental hard-link warnings used Cargo copying successfully; Bun's optional Node-alias warning did not prevent Bun-only commands. No extra platform runtime acceptance is inferred from compilation.

## Delivery boundary

**The production live connection gate is closed.** F3 delivers the Codex bridge/normalized presentation foundation, native consent flow behind the gate, explicit demo separation, and credential-free regression. It does not deliver a verified live subscription monitor. Clicking or invoking Connect cannot discover/start Codex while this gate is closed. No local auth file, keychain secret, live account endpoint, account login/logout, or real app-server was used for implementation or validation.

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

| Evidence | Result | Limits |

| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |

| Frozen Bun install | PASS | Bun 1.4.4; no dependency changes |

| Bun regression | PASS, 11 groups / 675 assertions (634 core/security + 41 Activity) | Synthetic fixtures, live freshness/source, closed-gate and exact permission/CSP guards |

| Mock Rust transport/normalization | PASS | 38 Rust regressions passed: 29 Codex protocol/monitoring/security cases plus 9 existing popup cases. No real account or Codex executable |

| Integration contract/security review | PASS | Serde DTO field allowlist, TypeScript presentation/source checks, and exact command/CSP guards passed; independent source review findings were fixed |

| Browser UI | Partial PASS | Actual Chrome local preview: disconnected Overview, blocked Accounts, explicit demo mode, six demo meters at 320×480; Accounts at 380×660 and dark Zinc & Signal Settings at 420×480. No horizontal overflow in those checks |

| Windows F3 native UI | NOT RUN | Browser inspection and compilation do not establish F3 native behavior |

| Real authenticated quota | NOT RUN / blocked by launch policy | No credential authorization given or inferred |

| macOS/Linux native interaction | NOT RUN | Hosted compilation does not establish tray/child behavior |

Browser preview initially timed out against a sandbox-local Vite server; a dedicated normal-access preview on port 1422 was reachable. A batched all-scenario UI attempt timed out; do not count it as an eight-scenario browser pass. The deterministic Bun fixture checks establish all eight data contracts separately.

The local Windows checks passed frontend lint/format/Svelte/build and Rust format/regression/check/Clippy. One early normalization assertion incorrectly depended on bucket map order; it was corrected to identify windows by ID, and unknown bucket labels were made generic. Independent review identified startup account-change invalidation, unbounded aggregate frame buffering, and API-key routing; those were fixed and covered by synthetic regressions. The final protocol check also accepts the documented headerless wire format. All 28 core Rust cases passed before the addendum; the historical addendum run passed 38. The security-gate follow-up adds a standalone fake app-server lifecycle fixture, without claiming real installed-CLI compatibility.

Source review confirms that production Connect exits before PATH lookup or process launch, and all four renderer operations are argument-free/main-only. This does not prove dormant process-tree behavior on actual Codex installations. At the previously reviewed `ac05182` HEAD, Windows job attachment occurred after child creation. The security-gate follow-up replaces that path with atomic job membership while suspended; see the current follow-up evidence below. Actual native dialog/tray acceptance remains separate from fake-process runtime evidence.

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

8. Open Codex Details. Compare optional balances/spending amounts, reset counts/expiry, activity summary and exact daily counts with provider-returned data. Missing values must remain unavailable; no currency is inferred. Verify Activity navigation by keyboard, zero versus unknown days, date labels without timezone shifts, and stale metadata after a failed refresh. Do not consume a reset or run inference as a test.

F4 recommendation only: resolve the documented startup-policy/compatibility boundary and perform owner-authorized live acceptance for Codex before adding any provider or automatic polling.

## In-flight product/security addendum

The same branch and Draft PR #3 continue the original F3 work. The original core commit `2ef960c2e1016265c7717e624036454bd7cff11f` passed all four hosted jobs in [CI run 40074186247](https://github.com/wihlarkop/quotafern/actions/runs/40074186247). That run does not substitute for the addendum's final HEAD; the PR handoff records the fresh run.

| Codex feature | Read-only contract and presentation | Live status |

| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |

| Quota | Independent primary/secondary windows and limit buckets; validated remaining percent/reset metadata | Blocked by the unchanged production launch gate |

| Credits | Optional flags and validated decimal balance, shown as provider credits without invented monetary conversion | No owner balance accessed |

| Spending controls | Optional limit/used/remaining/reset fields; monetary unit is not declared by the schema and stays explicitly unknown | No owner spending data accessed |

| Earned resets | Authoritative available count, nullable detail list and expiry/status; no redemption ID/action | No reset consumed or live count accessed |

| Token activity | Optional `account/usage/read` summary and daily buckets; unsupported activity does not break valid quota | No authenticated usage read |

| Activity heatmap | Calendar-correct week columns/weekday rows, relative jade intensities, distinct zero/unknown and keyboard details in Codex Details | Provider-only for live data; mock examples remain labeled synthetic |

The owner has one Plus account. No other subscription, extra account, partner approval or live credential is needed to run mock checks. Actual Plus compatibility remains blocked/unverified until the local CLI startup/consent/process requirements are resolved, then accepted by the owner. SIWC identity and eligible inference support do not prove monitoring authorization; [the authorization decision](chatgpt-auth-decision.md) records the official scope evidence, source/documentation divergence, and absence of any real authorization probe.

Claude Code and Gemini CLI are Coming Soon catalog entries, with no login control, adapter or discovery. Codex is the only monitoring implementation. P2 thresholds, notifications, links, background refresh and local history are deferred. The [security roadmap](security-roadmap.md) records documented SEC-01 controls, partial implemented SEC-02 protections and explicit SEC-03–05 acceptance gates. No entire milestone set or live security approval is claimed complete.

Addendum browser acceptance used the actual Chrome preview without credentials. Disconnected Details showed unknown/unavailable quota, credits, resets and Activity. Accounts showed both Coming Soon providers without login actions. Explicit Demo preview showed the synthetic funding/reset data and 84 UTC calendar cells. Arrow Right moved from a reported zero-token date to the same weekday in the following week and updated both focus and the exact-count detail. Unknown and zero cells had distinct computed colors in dark Zinc & Signal at 320×480 and light Graphite & Jade at 420×660; neither inspected layout overflowed horizontally. Native Windows F3 interaction remains NOT RUN.

The addendum extends the existing code rather than replacing it. Its requested independent incremental review was interrupted by the worker usage limit; the lead completed the integration and source review. Review found the documented nullable multi-bucket map case, which now preserves legacy quota/credit metadata instead of dropping it. Tests also cover static diagnostics, no redemption IDs/raw secret-bearing fields, signed decimal credit balances, unspecified spending units, stale activity timestamps, unsupported usage preserving quota, and calendar/count validation. That historical author review did not resolve startup, native-consent binding, or process-containment acceptance. The gate-resolution follow-up below records the new implementation and independent review; startup remains blocked.
