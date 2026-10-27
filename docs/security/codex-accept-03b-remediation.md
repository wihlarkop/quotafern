# CODEX-ACCEPT-03B: existing Windows Codex reuse

> Unexecuted historical ACL-remediation proposal. No system ACL or credential remediation was applied. The reviewed supervised System route replaced this proposal; see [current scope](../validation/codex-merge-prep-01.md).

Status: PROPOSED; no owner approval or real ACL modification. The source-only patch is prepared and has not been deployed in the running acceptance binary. Approval is requested separately for each of the two existing files below. No credential/config contents were read by this investigation.

## Confirmed cause

PR #16 baseline: `181378ff41b62b3a7d7ef32e31b9753ec572be46`. Production gates remain disabled in the prepared production patch; only the existing acceptance worktree has enabled direct gates. Both legacy app-server gates remain disabled.

The selected system home, auth.json, and existing config.toml are current-user-owned, non-reparse objects. Each has one outside allow ACE for the Codex sandbox local group, granting ReadAndExecute plus Synchronize. Its directory grant is inherited by both files. No actual path, SID, local member identity, token or raw descriptor is published here.

The directory grant provides listing/traversal/read-metadata, with no outside create-child, write-EA/attributes, delete, delete-child, owner-change or DACL-change grant. The inspected ancestor chain has no outside replacement or write-metadata grant. Directory listing is separable from reading a child file's data.

The credential-file grant authorizes FILE_READ_DATA. Prior metadata-only Authz checks granted that bit for 2/2 simulated member-plus-enabled-group contexts. No real sandbox process token, S4U logon, credential-content read or exfiltration was exercised. Restricted tokens can impose additional limits; the result describes the ACL's grant.

Two source concerns must be addressed together:

1. Quotafern's strict directory policy unnecessarily refuses a current-user-owned system directory with only outside read/traverse rights.
2. File security must remain strict. The inherited auth.json grant is unsafe. The native adapter also parses bounded top-level config.toml to establish whether file storage is authoritative; it must validate that opened file before reading it. Ignoring config could authorize a stale file when Codex actually selects keyring/auto storage.

The [September comment on issue #24256](https://github.com/openai/codex/issues/24256#issuecomment-5598031702) reports the inherited auth-file read grant and a local file-only workaround. This is anecdotal compatibility evidence, not a vendor-supported fix. The issue's main report was opened in May and its closed status does not establish this host's safety.

## Prepared repository patch

- Add a Windows SystemHome policy: current-user owner, no reparse points, outside directory rights limited to read/list/traverse/read-metadata. Expand generic rights and reject creation, writes, deletion, delete-child, owner/DACL changes and unsupported ACEs. Validate and pin the full ancestor chain with existing anti-replacement checks and no-delete-share handles through the file read.
- Keep managed homes strictly private. Keep the auth-file ownership and zero-outsider-allow policy unchanged; no CodexSandboxUsers exception.
- Validate the opened config file's owner/DACL, type, reparse flag and bounded size before parsing bytes. An unsafe config returns directConfigFileUnsafe; an unsafe auth file still returns directCredentialFileUnsafe. No config or credential contents cross IPC or logs. Native consent explicitly discloses the storage-mode configuration inspection as well as the credential read.
- No automatic ACL modification is added to Connect, Refresh, login or renewal. Native consent, binding, fixed endpoint, cooldown, and separate gates remain mandatory.

Existing native regression cases cover safe directory vs unsafe config/file, managed privacy, two-file synthetic hardening, successful reuse, in-place renewal, unsafe recreation, invalid rights and unsafe ancestors. No new standalone suite.

## Exact proposed live maintenance operation — approval required

**Targets requested separately:** (A) the selected existing auth.json, and (B) the selected existing config.toml. No directory ACL changes. If approval covers only A, B stays untouched and the source must continue to block on unsafe config. Neither file's data will be read, copied, hashed or written by the maintenance operation.

1. Owner pauses/quits every Codex CLI/app/extension writer using this home and disconnects Quotafern monitoring. Do not log out, sign in again, run inference or force token renewal. This is a one-time owner-approved maintenance action outside the app, with no new repair IPC command or persistent watcher.
2. Re-resolve the home; verify ownership, file types, links/reparse protections and ancestor anti-replacement rights. Open each exact existing file without following reparse points, requesting only READ_CONTROL, WRITE_DAC and FILE_READ_ATTRIBUTES, with no delete sharing. Hold the handles; record volume/file identity, link count and parent-descriptor fingerprints. Abort on metadata drift, multiple hard links, unexpected ACEs, another outsider allow, owner mismatch or active-writer uncertainty. Do not request READ_DATA, WRITE_DATA, ownership or SACL modification rights.
3. Create a private, protected local ACL-metadata backup under the existing private Quotafern tree, outside Git/uploads. Save each file's owner/group, DACL, inheritance/protection control and object identity, plus unchanged parent descriptor fingerprints. Save no credential/config data. Re-read and verify backup metadata before applying anything. Show only a redacted preview for each file: one confirmed target allow ACE removed, inheritance protected, all unrelated permissions and owner/group retained.
4. For each separately approved file, construct the DACL in memory by preserving inherited entries as explicit and removing only the already-identified sandbox group's allow ACE. Preserve all deny entries, user/SYSTEM/Administrators access and every non-target ACE; preserve owner/group. Validate canonical Windows ACE ordering rather than applying a simplistic deny/allow sort. Abort if additional descriptor changes would be necessary. Set DACL protection to prevent reinheritance.
5. Through the same pinned file handle, apply only DACL_SECURITY_INFORMATION plus PROTECTED_DACL_SECURITY_INFORMATION using a non-null DACL. Do not set owner/group/SACL, touch parent permissions, replace a file or change its data. Check file identity/owner before and after. Treat the two-file repair as one checked operation: if a postcondition fails, disconnect and roll back already-changed approved files only under the same-object rules below.
6. Re-read metadata: protected DACL, zero outside allow ACEs, current-user owner unchanged, owner read retained, sandbox-group read-data denied in evaluated contexts, unrelated ACEs preserved, parents unchanged. Confirm the unchanged strict private-file checker accepts both opened files. Do not proceed to native connection if either remains unsafe.

Mechanics: [protected access rules](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.objectsecurity.setaccessruleprotection), [same-handle SetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setsecurityinfo), [separate directory/file access checks](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights).

## Rollback

Keep Quotafern disconnected. Restore only the original DACL and original inheritance/protection control for each changed file, using its private metadata backup and the same verified volume/file identity. Do not restore file data, timestamps or an older auth cache. If a file was replaced, the parent descriptor changed or metadata is uncertain, stop for owner recovery instead of applying a stale descriptor. Verify restored metadata. Rollback reintroduces the known unsafe read grant, so system monitoring must remain blocked afterward. No automatic ACL widening or login follows.

## CLI compatibility, renewal and real retest

[Current upstream FileAuthStorage::save](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs) uses truncate/write/create and flushes the existing path (inspected blob d990d609b78220767258a6a20f9b2a21cae3804e, lines 226-244). In-place writes preserve that file's security descriptor. This does not pin the installed app/CLI writer or guarantee future behavior. [Official authentication guidance](https://developers.openai.com/codex/auth) documents Codex-managed renewal and file/keyring storage choices.

After approval and successful metadata postchecks, owner resumes normal trusted Codex use and confirms the existing login and selected identity still work. Report only a sanitized success/failure; do not request developer auth-status output or personal identifiers. The sandbox group will intentionally lose access to both files; workflows depending on its config read may be affected, so compatibility must be observed and rollback kept available. Config replacement/editors can also reintroduce inherited permissions.

Then rebuild/relaunch the local acceptance app, confirm all accounts start disconnected and no pre-consent access, and have the owner Connect existing Codex account with native approval. Verify real quota/reset information and independence from accepted managed Plus/Free sources. Owner checks system login remains unchanged. No real-account PASS is recorded before observation.

After the next owner-observed natural Codex token renewal, repeat metadata identity/DACL checks and monitoring acceptance. Do not force renewal or implement refresh. Recreated auth/config files or later ACL grants can reintroduce the group ACE; each native read must revalidate and fail closed. No automatic ACL re-hardening is approved. File-only repair preserves login material by design, but unrelated expiry or auth failure can still require owner-managed login later.

## Approval requested

Approve A (auth.json) and B (existing config.toml) protected-DACL repairs, their private ACL-metadata backup and checked same-object rollback, with all constraints above. Neither directory ACL nor user/group configuration is in scope. If only one file is approved, do not expand scope silently or bypass the other file. Until explicit approval, only repository source/plan and synthetic fixtures may change; do not deploy the new source or mutate live ACLs. No commit/push/merge/release, new provider or production activation.

Independent review: GPT-6 Luna High reviewed the concrete source patch and revised two-file remediation/threat model; no remaining blocker. Live ACL changes still require explicit owner approval. Verification: 19 focused native regressions passed; Rust check/clippy, Svelte diagnostics, Oxlint and formatting passed. No live credential/config contents or ACLs were changed; deployment and real existing-account acceptance remain pending.
