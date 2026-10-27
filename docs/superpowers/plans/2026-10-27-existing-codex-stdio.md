# Supervised existing-Codex startup acceptance plan

**Goal:** Verify the pinned Windows Codex App Server can start privately with Remote Control disabled before any real quota acceptance.

**Owner clarification:** After fresh native consent, ordinary Codex-owned authentication renewal/persistence is allowed. Quotafern token access, direct credential writes, ACL edits and persisted Remote Control changes remain prohibited.

**Architecture:** Windows System only uses a compile-time acceptance path. Pin the official native image by hash and keep its file/directory guards open through CreateProcess. Fixed private stdio, controlled environment with the audited internal marker, optional telemetry/hooks/plugins disabled. Reuse suspended-before-resume Windows Job containment and out-of-band cancellation. No daemon/listener, shell launcher or runtime override.

- [x] Add startup-only probe: initialize, initialized, experimental read-only RC status; require disabled, reject unsafe notifications, never call account/quota in the first build.
- [x] Collect bounded job-owned TCPv4/v6 metadata, reject listeners, redact private endpoints, and terminate/reap the complete job before saving a sanitized local receipt. Sampling is corroboration, not proof of absence; the exact-image controlled DisabledEphemeral branch is the primary source guard.
- [x] Run existing focused/full regression, source-review with Luna, build/open startup-probe acceptance app. Owner must approve native consent before actual Codex startup.
- [x] Review observed status/network/cleanup receipt with Luna. Only then prepare the final quota acceptance build, using account binding and the existing sanitized quota projection.
- [ ] Owner verifies correct real quota, CLI continuity, lifecycle and managed accounts. Keep production/legacy gates closed and save a disabled-gate patch; no commits/push/merge/release.

Spec: CODEX-EXISTING-RPC-02; source review: docs/security/codex-existing-rpc-02-startup-review.md. No actual startup behavior is claimed before the owner-consented probe.
