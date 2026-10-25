# CODEX-LIVE-01 validation

Date: 2026-10-26. This record distinguishes synthetic implementation evidence from native GUI and authenticated acceptance. The direct route and legacy app-server gates remain disabled.

## Baseline

- PR #16 head `20b2001530c84d6e783ce8e21ba143bd82e59fb5`, base `d11037909d72e0e9bb5fad7b6f277c6bf96fac76`.
- Bun 1.4.4; locked install PASS; Svelte 0 errors/0 warnings; regression 17 groups, 1,952 assertions PASS.
- Before screenshots captured at 380x660 in Edge: ignored `.tmp/qa/screenshots/codex-live-01/before-accounts.png` and `before-overview.png`.

## Final automated and independent evidence

| Command / check                    | Result                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| bun install --frozen-lockfile      | PASS, Bun 1.4.4, lock unchanged                                                                   |
| bun run check                      | PASS, 0 errors / 0 warnings                                                                       |
| bun run lint                       | PASS                                                                                              |
| bun run fmt:check                  | PASS                                                                                              |
| bun run regression                 | PASS, 19 groups / 2,035 assertions; 73 direct lifecycle assertions                                |
| bun run build                      | PASS                                                                                              |
| bun run fmt:rust                   | PASS                                                                                              |
| bun run lint:rust                  | PASS, warnings denied                                                                             |
| bun run check:rust                 | PASS on Windows                                                                                   |
| bun run regression:rust            | PASS, 74 passed / 0 failed / 4 ignored fixture entry points; 17 direct tests                      |
| bun run build:desktop --no-bundle  | PASS, Windows unbundled release build; final frontend asset name verified in binary               |
| Existing ACC-04 browser suite      | PASS, Edge source 189 checks / production 159, no page errors                                     |
| GPT-6 Luna High independent review | Findings fixed; no remaining P0-P2 in inspected source; see [review](../reviews/codex-live-01.md) |

Browser evidence: [source](../evidence/codex-live-01/source-browser.json), [production](../evidence/codex-live-01/production-browser.json). Synthetic coverage includes Free/Go/Plus/Pro, missing/zero/invalid fields, credits/window bounds, duplicate aliases, separate system/two managed sources, response ownership/generation rejection, disconnect/remove in flight, stale failures/auth expiry, HTTP 401/403/429/redirect/offline/timeout/malformed/oversized bodies, main-only local IPC, native consent races, and isolated fake login environment/cwd/cancellation/reaping. No real login or usage request was run.

Before/after screenshots are retained locally under ignored .tmp/qa/screenshots/codex-live-01/. Source and production views were inspected at 380x660; existing ACC-04 browser checks additionally exercise narrow layouts, themes, keyboard/focus and demo navigation. Layout/CSS/navigation were preserved; the gate explanation changed. Native GUI acceptance and authenticated behavior remain separate from compilation/tests.

Adapter limitations: selected-home top-level file/default-file settings only, with explicit auto/keyring profiles refused; no full layered Codex config resolver, keyring fallback, token renewal or managed credential deletion. The private endpoint has no stable public contract. Windows directories are atomically created with protected user/SYSTEM/admin ACLs; existing objects are verified without changing their permissions. Unix forced-parent-death child containment remains unaccepted; the closed gate prevents production launch.

Hosted CI/security status is recorded against the exact pushed HEAD in the PR handoff, because checks are external mutable state.

## Owner acceptance after activation approval

The committed production gates deliberately prevent connection. These steps require a separately reviewed acceptance build with the direct route enabled; do not enable the old app-server flags. The owner performs sign-in without developer access to auth files, tokens or screenshots containing personal information.

1. Start Quotafern with Demo off. Confirm every saved account starts disconnected; visiting Overview/Accounts causes no credential access or provider request.
2. Add a personal Codex account in the existing Accounts flow. Choose the existing system session, accept the native read disclosure, and connect. Confirm system Codex remains signed in to the same account. If auth is unavailable/keyring-only, choose a managed account instead.
3. For an additional account, use the managed sign-in action. Complete ordinary Codex login in the browser. Confirm only that account card gains live quota. Add another managed account and sign in to a different personal account.
4. Give both accounts the same local alias. Refresh each independently and refresh connected accounts together. Confirm the correct account keeps its own quota, plan, reset and success timestamp; aliases do not affect binding.
5. Confirm only server-returned fields appear. Zero remaining is visible as zero; absent fields, subscription renewal, expiry and billing dates are absent. Durations and extra model pools remain independent.
6. Disconnect/remove account A during a refresh. Confirm late results do not return, account B stays connected, and system credentials are unchanged. Removal retains managed credentials; there is no hidden credential deletion.
7. Exercise sign-in-again, expired sessions, offline and cooldown states. A failed refresh must not advance Last updated or fall back to Demo. Changing to Demo disconnects all monitoring; leaving Demo does not reconnect.
8. Close/reopen the window, quit/restart, test keyboard/Escape/focus and narrow layouts. Check login cancellation/timeout/app exit and ensure no child remains. Native GUI acceptance must be recorded by OS.

Personal plan matrix Free/Go/Plus/Pro and real endpoint behavior: **NOT RUN — owner acceptance required**. Windows gated binary launch/window discovery: **PASS (limited smoke only)**. Further Windows GUI, consent/login/tray acceptance and macOS/Linux native GUI: **NOT RUN — deferred to the owner**. Local previews and the task-owned smoke process were stopped at the owner's request. Synthetic credentials are never evidence of real entitlement.
