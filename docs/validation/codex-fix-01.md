# CODEX-FIX-01 validation

Date: 2026-10-26 (Asia/Jakarta). Existing Draft PR #16, branch research/codex-only-quota-auth. Verified remote and clean existing worktree baseline: e1699fbc82ac84d117d39ee7f78e0a9703325e02. Primary checkout was on another clean branch and was preserved. No Claude PR #17 or DX PR #19 changes.

## Windows cause and fix

Hosted run [40235899705](https://github.com/wihlarkop/quotafern/actions/runs/40235899705) had 72 passing tests and two failures at secure_create(root): selected_home_file_adapter_config_and_size_guards and managed_login_uses_only_isolated_home_and_disconnect_reaps_fake_process. Local Windows baseline file-adapter reproduction passed, narrowing the failure to runner security context rather than a universal path problem.

The directory creation SDDL specified a protected DACL but omitted the owner. Windows defaults ownership from TokenOwner, which can be Administrators for an elevated token; verification correctly requires TokenUser ownership. This creates a production creation/verification mismatch on such tokens, not a reason to weaken validation. Creation now supplies O:TokenUser atomically alongside the unchanged protected user/SYSTEM/admin DACL. Existing objects are never repaired or relaxed. Ancestor/reparse checks and strict owner/DACL verification are unchanged. See Microsoft's [owner of a new object](https://learn.microsoft.com/en-us/windows/win32/secauthz/owner-of-a-new-object) and [file security](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights).

The synthetic auth.json fixture independently inherits token-default file ownership rather than its parent owner. Only that cfg(test) fixture assigns its verified private home's owner through a WRITE_OWNER handle and re-verifies the file. Production credential reads never change owners or permissions. No real credential files were read.

## Focused UI and launcher changes

The existing Accounts and Overview/Details components call live quota a reading, preserve synthetic sample/Demo copy, scope Descriptor only to disconnected descriptors with no source, use real authentication/read error guidance, and omit absent live timestamps and measure fields (including partial metadata objects). Zero quota remains visible. Live verified identity does not gain a synthetic suffix. Layout, styling, components, accessibility and navigation are preserved.

Windows lookup continues to accept only native codex.exe on absolute PATH entries and never invokes cmd/bat/ps1 shims. The direct login bridge now preserves an unsupported-launcher diagnostic so its existing renderer message advises installing a native executable on PATH and restarting Quotafern. Existing regression coverage checks refusal without script execution and the actionable message. No-executable-found still uses the existing generic login failure; this is outside the shim defect.

## Verification

- Genuine local Windows: bun run fmt:rust, lint:rust, check:rust PASS; regression:rust **75 passed, 0 failed, 4 existing subprocess fixture entries ignored**. Both originally failing tests PASS. The new shim refusal check is Windows-only.
- Frontend: bun run check **0 errors/0 warnings**, lint PASS, regression **19 groups / 2,036 assertions PASS**, build PASS. Formatting checked after evidence formatting.
- Windows bun run build:desktop --no-bundle PASS; this proves compilation, not authenticated or native GUI acceptance.
- Existing Edge ACC-04 browser suites: source **189** and production **159** checks PASS, zero page errors. [Source evidence](../evidence/codex-fix-01/source-app.json), [production evidence](../evidence/codex-fix-01/production-app.json).
- Affected components in Edge at 380x660: **17 source + 17 production checks PASS**, zero runtime errors or external requests. Ignored QA-only harness mounts the actual components with live-shaped synthetic state and leaves CODEX_DIRECT_CONNECTION_AVAILABLE=false; production harness is compiled separately with Vite production mode. It exercises connected/current, missing fields/timestamp, auth failure, disconnected descriptors, zero quota, Demo copy, Details navigation and actionable launcher copy. [Source evidence](../evidence/codex-fix-01/source-components.json), [production evidence](../evidence/codex-fix-01/production-components.json). Screenshots visually inspected; retained under ignored .tmp/qa/fix01/source-live-details.png and production-live-details.png.
- Independent GPT-6 Luna High source review against e1699fb: no actionable P0-P2 findings in the Windows fix, UI adjustments or launcher handling. Final freshness-omission followup reviewed separately; final assessment recorded in delivery.

All direct and legacy native/renderer live-disabled gates remain false. No real credentials, login, provider requests, monitoring activation, merge, release or publishing occurred. Hosted CI is reported against the exact final pushed commit in the delivery because it is mutable external state.
