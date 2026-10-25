# ACC-04 independent review

One focused GPT-6 Luna High security/accessibility review examined the concrete implementation against the ACC-04 design, ACC-01 architecture and UX contract. No further agents or implementation workers were used.

| Finding                                                                                           | Disposition                                                                                                                                                                           | Verification                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P2: removed opener always returned focus to Add local account, skipping surviving account actions | Fixed: connection removal returns to owner action; account removal prefers next same-provider surviving account action, then provider heading; empty list returns to Accounts heading | Actual source and compiled browser assertions, including long aliases and last-account deletion |

Browser testing separately exposed reverse-Tab from the first native-dialog input leaving focus on browser chrome/body. Explicit first/last control wrapping fixes it while native showModal retains background inertness. IME Enter, Escape cancellation and normal Save/Cancel are exercised.

The same reviewer checked the focused removal/modal fixes and strengthened shared invisible-character denylist and reported no unresolved actionable issue. Emoji joiners and variation selectors remain supported. No claim of actual screen-reader speech or native GUI review is made.

Review limitation: the child could inspect source but did not obtain the managed worktree's Git baseline comparison. The parent separately inspected the baseline diff, native/config/lockfile boundaries and fixed gate values. This review does not approve provider enablement or prove future native cleanup guarantees.
