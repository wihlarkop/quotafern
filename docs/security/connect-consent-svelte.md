# Svelte consent: Connect remembers

> The owner later confirmed the complete Windows lifecycle and real-account matrix in CODEX-MERGE-PREP-01, superseding the pending behavior checks below. See [current activation and acceptance](../validation/codex-merge-prep-01.md). Historical gate-disabled patches remain local artifacts; the final branch intentionally enables Windows only.

Owner approved the design on 2026-10-28 and expanded it to all Quotafern-owned native message boxes. Existing acceptance worktree/base remains `181378ff41b62b3a7d7ef32e31b9753ec572be46`.

## Behavior and boundary

Manual Connect now has only Cancel and Connect. It explains automatic reconnection; successful verified monitoring stores permission, Disconnect revokes it, Quit preserves it. Old session-only consent is not migrated. Version-4 policy requires fresh confirmation after this material presenter change. Existing System auto-reconnect was owner-reported successful before this new presenter; that observation does not certify the new dialog.

Rust creates one parented, centered `codex-consent` window, initially hidden, with an independent bundled Svelte entry. It disables main before showing/focusing the child. Incognito mode, fixed local navigation, denied new windows, disabled developer tools and drag/drop, unchanged CSP and a separate capability keep it isolated. It never mounts App, reads local storage, loads account metadata, auto-resumes or polls providers.

Rust owns a 32-byte random, one-time challenge bound to native account, connection, kind, generation and a 120-second expiry. Only the actual child label and exact bundled URL can request the fixed disclosure or confirm/cancel. Main's capability has no consent commands; the child has no provider or window-management commands. The challenge is never in URLs, logs, events or storage. Confirmation changes only pending native state. Original Connect rechecks its generation before performing the same guarded adapter and saves permission only after verified identity, schema and cleanup success.

Close, Cancel, Escape, expiry, Disconnect and Quit fail closed. Build and cleanup each have bounded acknowledgements. The native pending slot remains reserved until child destruction/main re-enable succeeds, preventing overlapping confirmations. A failed cleanup does not approve provider work. The custom view has less OS-authenticity assurance than an OS-owned dialog, but main cannot approve its own request through IPC.

All Quotafern OS message-box calls and the dialog plugin dependency are removed. The retired, disabled legacy path refuses authorization instead of displaying an OS box. Existing account-management dialogs were already Svelte. External browser/Codex authentication UI is not replaced. Unverified custom-window behavior on macOS/Linux fails closed; no OS message-box fallback or production activation is added.

## Review and verification

Luna High found no blocking bypass in the isolated approval flow and required the unofficial-endpoint disclosure on managed login, now present. Fixed source labels remain deliberately generic; local aliases are not authentication evidence. Real selected-account correctness remains native-bound and owner-observed.

Existing native suite: **97 passed, 4 ignored fixture entry points**. It covers challenge replay/mismatch/expiry, kind/account/generation mismatch, cancel/disconnect/shutdown, no provider authority from approval alone, actual generated IPC capability denials, wrong origins, main denied child commands and child denied provider commands. One prior synthetic process-monitor cancellation test failed transiently while concurrent browser work ran; the unchanged test passed on rerun. No security precedence was relaxed.

Existing frontend regression: **20 groups / 2123 assertions passed**. Clippy, Oxlint, Rust formatting and Svelte check passed before desktop build. Synthetic bundled Playwright/Edge checks passed **14 assertions**, covering light 460×580 and dark 360×420 layouts, keyboard focus, Escape/Connect one-shot IPC and no renderer persistence/provider calls. Local artifacts: `.tmp/qa/svelte-consent-browser.json`, `.tmp/qa/screenshots/consent-system-light.png`, `.tmp/qa/screenshots/consent-managed-dark.png`. Mechanical UI detector returned no findings. These are synthetic checks, not real consent or quota acceptance.

Owner acceptance: open Accounts, Connect one selected account, inspect the custom dialog, cancel once (no connection), then Connect and approve yourself. Observe quota, Quit/relaunch and confirm auto-reconnect; Disconnect must prevent it. Repeat for existing System and managed Plus/Free as needed. Parent focus/modal behavior, real browser login and fresh quota remain owner-only. macOS/Linux native acceptance and hosted three-OS CI are NOT RUN for this uncommitted local work.

## Build and owner observation

`bun run build:desktop --no-bundle` passed. The real native Quotafern window opened, PID 16692, executable SHA-256 `2771eec3c03ced25509bdbf060cec02982e281b6d55d36a5144c0002689b24ec`. Receipt: `.tmp/qa/svelte-consent-launch.json`.

Exact launch command:

```powershell
Start-Process -FilePath '<acceptance-worktree>\src-tauri\target\release\quotafern.exe' -WorkingDirectory '<acceptance-worktree>' -WindowStyle Normal -PassThru
```

Owner subsequently reported that the popup was tested and matches Quotafern's design system: **Windows native Svelte popup/visual acceptance PASS** (owner-reported, 2026-10-28). This statement does not separately establish cancellation, new consent persistence, authenticated quota, managed Plus/Free or reconnect behavior for this new presenter. Those observations remain distinct from the earlier owner-reported System auto-reconnect PASS.

The local enabled build is separate from `.tmp/codex-svelte-consent.production.patch`, whose live gates remain disabled and reverse-apply validation passes. No commit, push, merge or release was performed.
