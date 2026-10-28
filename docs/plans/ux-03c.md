# UX-03C direct account quota details

Continue Draft PR #20 on its existing branch from `e2307da2dee61a79031aaea49da9d8a788048724`. The owner requests direct focused details from Accounts, preserving normal Overview and all native/PERF-01 boundaries.

- [x] Add transient focused navigation with a pinned account/source ID and direct Accounts return point, separate from normal Overview selection.
- [x] Reuse SourceReadings in a focused detail view with account-alias title, lifecycle/freshness, reported fields and optional technical disclosures; no selector, advanced filter or extra View details action.
- [x] Resolve one eligible source at entry; show an account-only chooser for several and useful empty/recovery states for none. A disappearing selected source/account fails closed without selecting another.
- [x] Preserve the ordinary Overview tab, selectors and advanced contexts, and Back scroll/focus restoration.
- [x] Extend existing regression and source/production browser QA for one/multiple/shared/missing sources, disappearance, stale/disconnected states, normal Overview and 320px. Use synthetic fixtures only; no TDD or new unit suite.
- [ ] Obtain Luna High review, fix actionable findings, run all required Bun/Oxc checks, save focused screenshots, push/update Draft PR #20 with exact HEAD and CI; do not merge or touch PERF-01.

The focused target pins source identity at entry/selection. It never uses Overview's invalid-filter fallback to All. If candidates change before selection, an explicit source choice remains required; once selected, disappearance stays unavailable. The normal Overview filter is retained independently.

Verification: 20 regression groups / 2327 assertions; 139 source and 135 production browser checks passed. Independent Luna High review found no actionable issues. Delivery records exact HEAD and CI in Draft PR #20. See [validation](../validation/ux-03c.md).
