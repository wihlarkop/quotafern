# CODEX-LIVE-01: direct personal Codex quota

> Current production scope is Windows-only and owner-accepted; System uses reviewed supervised stdio, managed accounts use direct HTTPS. The original direct-adapter boundary below is historical/managed-route specific. See [final activation, controls and acceptance](../validation/codex-merge-prep-01.md). Legacy gates remain closed; macOS/Linux live access is blocked.

Historical initial status: implementation under review; activation was gated. The separate F3 app-server path remains disabled. No real credentials or authenticated account requests belong to developer/CI validation.

## Approved boundary

After native consent, Rust may read the selected Codex file login and request `GET https://chatgpt.com/backend-api/wham/usage`. It returns an account/connection-bound presentation DTO. Tokens, provider account IDs, auth-file paths and raw responses never belong in Svelte, IPC responses, logs or fixtures. No app-server polling, session-log fallback, custom OAuth client, token-refresh HTTP implementation, inference or billing is part of this feature.

ACC-04 remains the local metadata registry. Opaque IDs bind native sessions; renaming an alias cannot switch identity. The system source selects configured `CODEX_HOME` or the default Codex home. Additional accounts use distinct app-owned homes and ordinary, explicitly requested Codex login. Codex owns auth creation and renewal. A keyring-only login is unsupported by the file adapter. Remove stops reading and cancels monitoring; it does not delete or log out any credential store.

The direct endpoint is internal/unpublished. Source compatibility and synthetic tests do not establish server authorization, current entitlement or real-account success. Missing values stay absent, valid zero stays zero, and only returned Free/Go/Plus/Pro plan labels are shown. Independent quota pools are never added together. Failed reads retain only explicitly stale successful readings, without advancing the success timestamp.

## Focused ATM reference

Inspected 2026-10-26; these moving sources are compatibility references, not a supported public API promise.

| Source                                                                                                                               | Observation used                                                                                      | Deliberately excluded                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [CodexBar Codex documentation](https://github.com/steipete/CodexBar/blob/main/docs/codex.md)                                         | Selected CLI file login, bearer usage request, optional windows/credits, stale-auth UX                | UI, browser-cookie import, autonomous refresh-token rotation, reset-credit operations |
| [OpenUsage usage client](https://github.com/robinebers/openusage/blob/main/Sources/OpenUsage/Providers/Codex/CodexUsageClient.swift) | Fixed usage URL, bearer header, `ChatGPT-Account-Id`, bounded request                                 | Its refresh-token POST, copied OAuth client identifier, reset-credit consumption      |
| [Codex auth storage](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs)                                   | Codex-owned `auth.json`, optional auth modes and token/account association, file/keyring alternatives | Reading arbitrary keyrings, copying system credentials, rewriting shared auth         |
| [Codex backend types](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/types.rs)                                | Optional account identity and independent additional limits                                           | Account discovery, arbitrary upstream URLs, raw response forwarding                   |
| [Official authentication guidance](https://learn.chatgpt.com/docs/auth)                                                              | Codex manages login/cache and renewal                                                                 | A claim that identity/inference scopes grant a new monitor OAuth client access        |

The observed wire fields are `plan_type`, `rate_limit.primary_window` / `secondary_window`, `used_percent`, `reset_at` (Unix seconds), `limit_window_seconds`, optional `credits`, and optional `additional_rate_limits`. Window position alone does not establish duration. Account headers bind the request; a conflicting returned identity must fail closed. Quotafern does not adopt competitor refresh-token logic.

[CodexBar](https://github.com/steipete/CodexBar/blob/main/LICENSE) and [OpenUsage](https://github.com/robinebers/openusage/blob/main/LICENSE) use MIT; [Codex](https://github.com/openai/codex/blob/main/LICENSE) uses Apache-2.0. Implementation is original against observed contracts; no competitor UI/code is copied. License compatibility does not make a private endpoint stable or publicly authorized.

## SEC-01 / SEC-02 activation criteria

- Dedicated review of credential isolation, file/path/permission handling, account binding, main-only IPC, HTTP policy, login containment and cancellation.
- Synthetic tests for concurrent independent accounts, auth failures, redirects, limits, malformed/schema-changing bodies, missing/zero data, in-flight removal and absence of secret data from serialized snapshots.
- Native dialog/login/cleanup acceptance on each claimed platform, including the existing Unix forced-parent-exit limitation.
- Owner-only personal-account acceptance for actual endpoint/auth behavior and multiple independent accounts. Do not ask the owner to share credentials, auth files or raw responses.
- Both direct source gates remain closed until required acceptance is recorded and the owner separately approves activation. There is no environment setting, persisted consent or renderer argument that bypasses them.

See [validation and owner steps](../validation/codex-live-01.md). Earlier F3/SIWC reviews retain their historical findings; the owner authorization supersedes the blanket credential-read prohibition only for this separate direct route. No other provider or release safeguard is relaxed.
