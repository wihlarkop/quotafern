# Existing Codex attach-only acceptance plan

**Goal:** Reuse the owner's already-running, authenticated Windows Codex daemon without system token access, ACL changes, or new server startup.

**Architecture:** Existing System selections use a fixed local WebSocket-over-UDS endpoint only after native consent. Verify the complete directory chain, Codex's exact protected socket-directory ACL, kernel-reported same-user non-elevated peer, and audited executable hash before any protocol bytes. Keep managed HTTP unchanged. Fail closed without a spawn fallback. The existing daemon belongs to Codex; only Quotafern's socket is closed.

**Scope:** CODEX-EXISTING-OSS-01. Installed source tag 6905ecede7816e91373e9eabda3f6b0368fc747b. Research/design evidence: docs/security/codex-existing-oss-01.md and codex-existing-oss-01-startup-review.md.

- [ ] Add native attach client with bounded handshake, frames, requests, cancellation, and sanitized failures. Restrict outbound methods to initialize, initialized, account/read (refreshToken false), and account/rateLimits/read; no experimental capabilities.
- [ ] Bind native account ID from rate-limit results across refreshes; reject authentication notifications or account changes; project only actual provider fields into the existing snapshot contract.
- [ ] Route Windows System only, update accurate native consent and safe diagnostic messages; retain managed path and false legacy gates.
- [ ] Extend existing synthetic regressions for protocol bounds, identity substitution, cancellation, private/unsafe endpoint layouts, and unchanged managed projection; run Bun/Rust/browser checks.
- [ ] Obtain independent Luna High review, fix findings, save disabled-gate production patch separately, then build and launch the local acceptance binary.
- [ ] Owner performs fresh native consent and real quota retest. Do not claim real authenticated PASS before owner observation.

No credential/config contents, raw RPC responses, identities, or token logging. No commits/push/merge/release. No process-owned daemon termination, permissions rewrite, system login changes, new test suite or TDD. A missing endpoint or changed binary is an explicit compatibility blocker. Existing daemon background work cannot be disabled or attributed to Quotafern.
