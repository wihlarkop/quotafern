# Documentation

Quotafern documentation is grouped by purpose; use the links below instead of searching old PR-specific folders.

- [Specifications](specs/): architecture, ACC-01 contracts, account management, visual design and ICON-01.
- [Implementation plans](plans/): UX, security, provider sequencing and milestone plans.
- [Security decisions](security/): current boundaries, Codex constraints, authorization and independent review.
- [Validation](validation/): feature acceptance records, test matrices and reported limitations.
- [Reviews](reviews/): historical review findings and dispositions.
- [Evidence](evidence/): saved machine-readable browser test results and validation metrics; not secrets.
- [Approved brand source](assets/icon-01/): retained original icon art, checksums and reproduction inputs.
- [Superpowers plans](superpowers/plans/): original implementation plans, preserved unchanged.

Historical screenshot galleries have been removed from the current Git tree at the owner's request. Their old versions remain in Git history. Reproducible browser captures now write to ignored `.tmp/qa/screenshots/` rather than tracked documentation.

Runtime and browser QA harnesses live under [QA scripts](../qa/README.md). Historical foundation acceptance covered the live-disabled baseline; the later owner-confirmed Windows live acceptance is recorded below. macOS/Linux native/authenticated acceptance remains unverified.

Initial gated Codex implementation history: [CODEX-LIVE-01 direct integration](security/codex-live-01.md) and [validation/owner acceptance](validation/codex-live-01.md).

Current Windows Codex behavior and owner-reported full acceptance: [CODEX-MERGE-PREP-01](validation/codex-merge-prep-01.md). macOS/Linux live access remains blocked pending native acceptance.
