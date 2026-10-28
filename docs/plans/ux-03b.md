# UX-03B usability polish

Owner brief: “Final Usability Polish: Add Account, Settings & Account Selector”, 2026-10-29. Continue `codex/ux-03-accounts-polish`, Draft PR #20, from `1f3ce659a6aff771ba88868c6cf5694f94a3bb12`. No separate PR, work on PERF-01 or Claude Code, new dependencies, storage/native/adapter/consent/polling/gate changes.

## Implementation

- [x] Capture the four existing views at 380×660 with synthetic IPC.
- [x] Replace the sole available provider dropdown with a fixed label; retain a selector branch for multiple available providers. Use native radio choices for existing/another Codex login, optional name and Continue; remove routine validation paragraphs.
- [x] Put Appearance first; move Demo, privacy/storage, reduced-motion information and development controls inside More settings. Disclose disconnection and remembered-permission revocation before the Demo toggle; keep the existing transition. Use accessible nonvisual success feedback and visible storage errors.
- [x] Keep authoritative selection/ownership in the existing navigation model. Add grouped short-label account options for the main selector and provider/workspace/connection options behind Advanced filters. Keep active advanced selections explicit, duplicate labels distinguishable and removed selections fail closed.
- [x] Make account names plain text and View quota the one account-to-Overview action, including disconnected accounts. Retain Back, scroll and focus restoration. Keep source details available from Overview and add an account-management recovery action for empty quota states.
- [x] Extend existing regression and both source/bundled browser matrices; verify compact/light/dark layouts, 1/3/many accounts, duplicates/long aliases, advanced contexts, appearance/Demo safety, navigation and failures. No TDD or standalone unit suite.
- [x] Obtain GPT-6 Luna High review of UX, accessibility, context/action IDs, focus and security boundaries; fix actionable P0–P2 findings.
- [ ] Run all required Bun scripts, curate before/after evidence and owner Windows checklist, commit/push this branch and update Draft PR #20 with exact head and hosted CI status. Do not merge/tag/release.

## Decisions

The owner's detailed brief fixes the design direction. Keep native grouped selects rather than add dropdown architecture; OS popup scrolling/bounds require owner native acceptance in addition to browser keyboard tests. Keep full ownership labels for diagnostics/screen readers; shorten only selector presentation. Toggling disclosure never changes the selected context. Demo warning names both monitoring disconnection and the existing native grant revocation, without adding a new authorization path.

Verification: 20 regression groups / 2308 assertions, 119 source and 117 production browser checks passed. Luna High's one P2 catalogue-availability finding was fixed without enabling another provider. See [validation](../validation/ux-03b.md) and [review](../reviews/ux-03b.md).
