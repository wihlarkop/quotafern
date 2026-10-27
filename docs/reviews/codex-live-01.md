# CODEX-LIVE-01 independent review

Reviewer: GPT-6 Luna, High, separate read-only agent with no implementation authorship. Review scope: native direct bridge and Windows ACL helper, subprocess changes, Tauri command/capability changes, ephemeral ACC-04 projection and minimal existing UI integration. Reviewed working-tree snapshot after fixes on 2026-10-26; no authenticated acceptance or live activation approval was given.

| Finding                                                   | Severity                                     | Resolution                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Native could return 32 windows while renderer accepted 16 | P2                                           | Native rejects total output above 16; boundary regression added.                                                               |
| Credit decimal formats differed across IPC                | P3                                           | Exact canonical decimal grammar aligned; invalid optional balance omitted without replacing valid quota. Boundary tests added. |
| Mixed auth records could include unmodeled Bedrock fields | Hardening / P2 for inconsistent records      | Both current Bedrock auth fields are explicitly modeled and rejected. Synthetic mixed-auth tests added.                        |
| Initial auto-refresh objection                            | Withdrawn after checking owner authorization | Owner explicitly requires conservative automatic refresh. Native consent now discloses manual and five-minute refresh.         |

Final re-review found **no remaining P0-P2 issues in the inspected paths**. The reviewer checked generation-scoped consent cancellation, isolated CLI environment/cwd, and atomic Windows managed-directory DACL creation followed by verification. This is code review, not a provider compatibility guarantee or production activation approval.

Parent integration review additionally corrected old-dialog cancellation affecting a newer session, native duplicate system/account reservations, recoverable refresh data preservation, and successful mocked Windows fixture directory creation without relaxing credential permissions. Focused synthetic tests cover these boundaries.

Residual limits: private endpoint compatibility and personal-plan behavior require owner acceptance; file adapter does not reproduce Codex's entire layered config resolver; keyring-only login is unsupported; Unix forced-parent-death login-child containment remains unaccepted. Production direct and legacy app-server gates remain closed.

Follow-up review: the parent added manual Refresh all through the existing per-account controller and Overview header. Luna High reviewed the four-file follow-up and found no P0-P2 issue. It targets only consented connected accounts, preserves independent cooldown/error handling, and remains hidden with the direct gate closed or Demo active. Regression now includes three-account refresh together.
