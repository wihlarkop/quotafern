# F3 security gate resolution implementation plan

**Goal:** Harden the existing Draft PR #3 without authorizing live provider access.

**Architecture:** Keep both live gates false. Native connection uses a fixed OS confirmation and a Rust-owned, nonpersistent single-attempt cancellation guard. Process containment is a separate module, with Windows membership established before child code executes. Protocol and UI contracts remain intact.

**Spec:** Owner's F3 Security Gate Resolution brief, reviewed base `ac05182df2906a005834f540d7a4be23bca6e1cc`.

**Constraints:** Bun-only, Oxc-first, feature-first, no TDD; implement then add focused regression checks. No authenticated Codex, credential files, internal startup workarounds, merge, release, force-push, or competing PR. Workers use GPT-6 Luna at xhigh or lower.

## Work and verification

- [x] Investigate pinned Codex 0.164.0 startup using current official docs and versioned public source. Capture supported controls, incidental activity, auth writes/refresh, unresolved listener policy, and the best supported alternative in `docs/f3-startup-security-investigation.md`.
- [x] Add `src-tauri/src/codex/consent.rs`: one in-memory attempt, fixed native dialog, no renderer authorization token, fail-closed cancellation, immediate disconnect/exit invalidation. Integrate through the existing argument-free `codex_connect` handler. Add direct-IPC and fake-process regressions for bypass, cancellation, concurrent requests, and restart.
- [x] Add `src-tauri/src/codex/process.rs`: race-free Windows job containment and existing Unix process groups. Review handle inheritance and cleanup. Exercise fake descendants, failure, timeout, cancellation, shutdown and unexpected exit; distinguish runtime evidence by OS.
- [x] Complete an independent security review after integration. Cover permissions/RPC allowlists, DTOs/bounds/backpressure, deadlock/cancellation, account generation/staleness, auth ownership, dependencies and shutdown. Address findings or retain explicit blockers.
- [ ] Update integration/security/roadmap/validation documents and PR #3. Run frozen install, Bun regression/lint/format/check/build, Rust format/regression/check/Clippy and local unbundled desktop compile. Push normally and verify all hosted CI jobs against the exact final HEAD.

## Review focus

Late native approval after disconnect must start nothing. Concurrent IPC must not reuse approval. Renderer payloads must not forge consent. A child spawning descendants at its first instruction must already belong to the Windows job. A blocked or failed child must not strand reader threads or survive shutdown. Platform compilation and mocked native interaction are separate from OS dialog/tray acceptance.

Local implementation/checks and independent review are complete. Final push/hosted CI status is recorded in the Draft PR handoff because this plan cannot identify its own containing commit. Unix forced-parent termination remains a documented live blocker.
