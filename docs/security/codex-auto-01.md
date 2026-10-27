# CODEX-AUTO-01: remembered monitoring permission

> Historical AUTO-01 preparation notes follow. The final presenter has Cancel / Connect only; Connect remembers verified permission. Windows is intentionally enabled; other platforms and legacy integration remain closed. The owner now confirms full Windows acceptance. See [current scope](../validation/codex-merge-prep-01.md). Earlier local-only/pending/three-button statements describe those earlier builds.

Local Windows acceptance implementation based on PR #16 HEAD `181378ff41b62b3a7d7ef32e31b9753ec572be46`, preserving the previous supervised System and isolated Managed adapters. No commit, push, merge or release is implied.

## Permission and lifecycle

The next manual native Connect offers **Connect once**, **Connect and remember**, or **Cancel**. Previous session consent is not upgraded. The dialog discloses automatic Codex/OpenAI contact and supervised App Server startup for the existing system profile. Normal Codex-managed authentication renewal remains permitted; Quotafern implements no renewal or automatic login/logout.

Remembered authority is stored natively beneath the OS-known user profile in `.quotafern/codex-authorizations`, separate from ACC-04 renderer metadata. Records contain only local opaque account/connection references, kind, preference, policy/schema version, revision, in-flight marker and a SHA-256 native identity binding. The digest is pseudonymous personal metadata, not anonymous data. No raw identity, token, quota, credential path or subprocess state is saved.

Private directories are created atomically with protected ACLs on Windows. Existing ancestors are checked for tampering, sensitive objects retain strict owner/DACL checks, and reparse points/hardlinks are rejected. Unix creation uses owner-private modes and checks ancestor ownership/mutation. Files are bounded, strictly decoded and atomically replaced with synchronized writes. No system credential ACLs are rewritten.

Startup reads only local authorization metadata, then resumes matching descriptors without opening Accounts. No provider access or subprocess occurs for a descriptor without native authority. Native resume never runs login or prompts. Per-account generations and bridge locking prevent duplicate reservations and late results resurrecting revoked consent. Identity is checked before quota access/publication through the same adapters as manual Connect.

Before a remembered operation accesses credentials or the provider, a durable in-flight lease blocks replay. Success, typed transient failure or acknowledged cancellation clears that exact revision after cleanup and validation. A terminal or unknown failure cannot become a safe acknowledgement; the RPC reader records terminal provider errors before a cancellation race. Quit cancels work and waits up to five seconds globally for safe acknowledgement outside the bridge lock. Crash, hung cleanup, failed durable writes or terminal outcomes leave permission blocked and require manual Connect. Normal idle/acknowledged Quit preserves permission.

Disconnect cancels the account and writes a durable revoked tombstone before best-effort unlink. An open handle blocking deletion cannot preserve permission. Failed revocation is reported rather than acknowledged as success. Quit does not revoke; it terminates only Quotafern-owned resources. No launch-at-login or tray behavior changes.

## Startup policy and retries

Existing System monitoring retains the reviewed private executable copy, exact Codex `0.164.0-alpha.11.1` SHA-256 pin `1103e9e09c71fa2cd0afd6d8f3b9a2d63174fe8efd7cb5bd09f1cb14ef58a098`, fixed stdin/stdout startup arguments, DisabledEphemeral Remote Control policy, runtime status checks and Windows Job containment. A changed policy or image invalidates remembered permission. The previous startup/network review remains in [CODEX-EXISTING-RPC-02](codex-existing-rpc-02-startup-review.md).

Connected polling remains every three minutes with native cooldown/backoff. Typed transient failures schedule at most three retries (60, 120, 240 seconds). Managed HTTP network/timeout/429/5xx failures have typed categories. Generic App Server errors do not reliably distinguish network/auth/provider causes in the pinned implementation, so they stop automatic retry; no raw error text is parsed or exposed. Authentication, identity, unsafe-source and unsupported-policy failures require manual intervention. Failed refresh never receives a new success timestamp or synthetic quota.

## Verification and owner acceptance

The existing frontend/native regression suites cover permission binding, native-only authority, startup deduplication, no access without permission, revocation and late completion, policy/identity mismatch, private/unsafe synthetic layouts, bounded retries, tombstones, durable leases, terminal cancellation races and normal Quit. Browser checks use only synthetic native responses and three synthetic accounts; they do not establish real authenticated acceptance.

Local results (2026-10-28): Windows native regression **95 passed, 4 fixture entry points ignored**, frontend **19 groups / 2113 assertions passed**, Rust Clippy and formatting passed, Svelte check **0 errors / 0 warnings**, Oxlint passed. Bundled Playwright via Bun/Edge passed six synthetic browser checks, including three-account startup from Overview and disconnect persistence across reload; evidence is local at `.tmp/qa/auto-01-browser.json` and `.tmp/qa/screenshots/auto-01-synthetic.png`.

Independent GPT-6 Luna High review found and required correction of a queued-provider-error/Quit race. The reader now marks a provider error terminal before consumer cancellation can mask it. Completion validates the exact active lease rather than treating the in-flight marker as a new-start denial; successful resumed Connect and subsequent refresh are covered together by the native regression. The final source review found no remaining blocker in authorization, identity binding, retries or shutdown ordering. This is source and synthetic evidence; it does not certify a real provider run or platform acceptance.

Real Windows acceptance remains owner-only:

1. Connect Existing Codex and choose **Connect and remember** in the native dialog. Observe real quota/reset values.
2. Repeat for Managed Plus and Free; verify independent readings.
3. Quit Quotafern completely and relaunch. All three remembered accounts should reconnect from Overview without clicks or login.
4. Disconnect one account, Quit and relaunch: only the other two should reconnect.
5. Manually Connect that account with remembered permission again and repeat restart.
6. Verify unrelated Codex remains usable, owned App Server jobs stop after each read/Disconnect/Quit, and Remote Control remains disabled. No account without remembered permission may access the provider.

Do not automate personal consent/login or inspect credentials. Record actual owner observations separately. macOS/Linux native acceptance and three-OS hosted CI are **NOT RUN** for this uncommitted local acceptance work. Hosted CI is required before claiming committed cross-platform source validation. Production gates must stay disabled in the separate production patch.

## Windows build and launch receipt

The first `bun run build:desktop --no-bundle` completed successfully. The actual native Quotafern window opened (PID 25628, window title Quotafern); its initial direct child was WebView2. No real remembered-consent acceptance was claimed. First executable SHA-256: `3b9a82450f35fcd215f97d51eda461f9d741b134b476f86f29730c8b57f28ffd`; its receipt is preserved at `.tmp/qa/auto-01-first-launch.json`.

Exact launch command:

```powershell
Start-Process -FilePath '<acceptance-worktree>\src-tauri\target\release\quotafern.exe' -WorkingDirectory '<acceptance-worktree>' -WindowStyle Normal -PassThru
```

The local launch receipt is `.tmp/qa/auto-01-launch.json`. A separately generated `.tmp/codex-auto-01.production.patch` preserves all production live gates disabled and passes reverse-apply validation against this worktree. The enabled acceptance gates remain local; legacy app-server gates stay disabled. No commits, pushes, merges or releases were performed.

## Installed CLI update compatibility (2026-10-28)

Owner retry returned `directRpcVersionUnsupported`. Metadata/version-only inspection confirmed the system CLI had updated to `0.165.0-alpha.1.2`, image SHA-256 `5c1b55966bf9f757dcbf00065c9a6cb862ead55d34b015f1be1939ff18e43943`. The old adapter rehashed the mutable installation on every connection before considering its private approved copy, so the strict pin rejected the updated image before App Server startup. No fresh startup receipt or remembered grant had been produced; remembered permission is saved only after successful verified quota retrieval. Cooldown advice was also misleading for a disconnected account and now directs a later Connect rather than Refresh.

The exact official tag `rust-v0.165.0-alpha.1.2` resolves to `720fec862a608ae1e5878d1eecb04fb93192e93c`. The installed image differs from that release's published Windows raw executable digests; the reason is not established. A version string alone does not authorize this image, and its pin has **not** been added. The new cloud-config source also changes managed configuration support. No new-version App Server or authenticated RPC was executed.

The minimal acceptance fix reuses the **existing reviewed private 0.164.0-alpha.11.1 program copy** first. Every use still checks protected directory ancestry, owner/DACL, nonreparse regular file, single link, exact SHA-256 and a retained handle preventing write/delete. A damaged or unsafe private copy fails closed without replacement or fallback. If the cache is absent, only an installed image matching the existing reviewed pin may seed it. No new download, credential copy, system program downgrade, system ACL change or global configuration change occurs.

Native consent explicitly discloses the retained program version across system CLI updates. System remembered-policy version is bumped to `3/stdio-private-cache`, requiring renewed native consent; managed policy is unchanged. Existing image regressions cover a valid cached image despite changed installation bytes, an absent cache, tampered cache and hardlinks. Real compatibility between this reviewed helper and the current Codex-owned login/renewal remains owner acceptance; errors continue to fail closed. This local acceptance pin is not an assurance of compatibility or security for arbitrary future Codex versions.

Luna High independently approved this cache-first implementation, policy invalidation and disclosure. The focused upstream comparison found no auth-storage/model change between these two tags, but does not guarantee future or concurrent-client compatibility. Any incompatibility must stop monitoring rather than select the newer unreviewed executable. Latest checks: native **95 passed / 4 fixture entry points ignored**, frontend **19 groups / 2117 assertions passed**, Clippy, Oxlint, Rust formatting and Svelte check passed. Disconnected Refresh now preserves the existing connection advice instead of replacing it with a misleading recently-checked-usage message. A synthetic native dialog probe returned the expected custom remember label; no consent interpretation change was justified.

The corrected `bun run build:desktop --no-bundle` passed and the native Quotafern window opened at PID 16644. Corrected executable SHA-256: `7e223467202821b735c614361a347c073e48ca77eb2765ce560d25d5812566c8`. The exact launch command above is unchanged; current receipt `.tmp/qa/auto-01-launch.json` records this replacement. The old acceptance process was stopped by exact PID/path; unrelated Codex processes were untouched. Fresh System **Connect and remember**, real quota, restart auto-reconnect and current shared-login compatibility remain owner-pending. Production-disabled patch refreshed; no commit/push/merge/release.
