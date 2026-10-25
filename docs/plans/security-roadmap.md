# Quotafern security roadmap

Research and status date: 2026-10-24. This roadmap covers the local-first Tauri desktop app and its provider connections. It records the current foundation and concrete acceptance conditions; it does not claim the full roadmap is complete.

## SEC-01 — Threat model and auth architecture

**Status: Documented for F3. Live-connection approval remains blocked.** The current gate keeps process discovery and launch disabled until app-server startup behavior is supportable and reviewed.

### Assets and boundaries

| Asset or component              | Trust boundary and protection                                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local user and consent          | The user chooses whether a future connection may start. Consent is not remembered. Disconnect stops Quotafern monitoring and does not sign out of the external Codex CLI.                                                                                                    |
| Svelte WebView                  | Treat as untrusted relative to the Rust host. It receives only sanitized quota/status DTOs; commands are scoped to `main`, take no process/path/RPC arguments, and do not return credentials or account identity.                                                            |
| Rust/Tauri host                 | Owns command authorization, the closed startup gate, process lifecycle, RPC allowlist, normalization, and static diagnostics. It must not expose generic shell, filesystem, or network IPC.                                                                                  |
| Codex child process             | A separately installed executable can access Codex-owned auth/runtime state and may perform Codex-managed refresh or startup activity. Quotafern does not inspect or overwrite the CLI credential store. A malicious or replaced executable is outside the trusted boundary. |
| OS credential store             | No Quotafern OAuth secrets or keychain integration are implemented. A future SIWC adapter may store only Quotafern-owned credentials using OS-protected storage; it must never enumerate or rewrite other applications’ records.                                             |
| Upstream OpenAI/Codex services  | Receive requests made by the Codex child under Codex’s authentication and policy. Quotafern makes no direct provider request in the current gated build. Startup side effects must be understood before live launch is allowed.                                              |
| Dependencies and build pipeline | Third-party crates, Bun packages, build tools, GitHub Actions, and release artifacts can change what ships or execute during CI. Lockfiles and read-only workflow permissions reduce but do not eliminate supply-chain risk.                                                 |

### Threats and required controls

- A compromised renderer attempts arbitrary process execution, RPC calls, or secret exfiltration. Keep commands main-only and argument-free; expose only operation-specific calls; deny shell/filesystem/network capabilities; return sanitized DTOs.
- Malformed or excessive child output exhausts memory or corrupts state. Use bounded frames and queue, strict response correlation and schemas, fixed allowlists, deadlines, and synthetic adversarial protocol tests.
- Account changes or failed refreshes display another account’s or stale quotas as current. Track account generation; invalidate on account changes; distinguish current, stale, unknown, and error; never fall back to demo data.
- Startup restores saved Remote Control or performs other background activity. Keep the native and renderer gates closed until a documented startup policy controls those effects. Fixed telemetry/plugin flags alone are not sufficient evidence.
- A child or descendant survives disconnect or exit. Contain and reap the process tree; verify behavior on each target OS. Windows process creation now associates the private job atomically while suspended; failure/descendant/cleanup regressions and native platform acceptance are tracked separately.
- A malicious local process or compromised OS reads or substitutes executables and credentials. Do not claim protection against local administrator/malware compromise; use safe executable resolution, strict invocation, integrity/signing strategy, and clear user disclosure.
- A vulnerable or compromised dependency changes runtime/build behavior. Review dependency changes, CI permissions, secrets exposure, build artifacts, and release provenance.

### Identity, inference, and monitoring decision

SIWC identity scopes (`openid profile email`) and separate inference scopes (`offline_access resource.invoke chatgpt.tokens.use.direct`) are not documented as quota/activity scopes. Current Codex app-server docs describe external ChatGPT-token support for some account reads, but do not bind a SIWC scope to those methods. The pinned CLI source also marks its `chatgptAuthTokens` login path internal-only. Record monitoring authorization as **undocumented/unverified**, not as an inferred grant. See [the SIWC decision](chatgpt-auth-decision.md).

### SEC-01 acceptance

- Threat assets, boundaries, credential ownership, local malware/dependency assumptions, consent, and disconnect semantics are documented here.
- Identity, plan inference, and quota/activity authorization are reviewed against official contracts, including the pinned CLI/source divergence.
- The live connection gate remains closed until startup controls and auth authorization have a documented basis and pass separate review.
- No credential inspection, real sign-in, live account read, or inference request is part of F3 automated acceptance; protocol tests use synthetic data only.

The documentation gate is satisfied for this F3 foundation. It does not authorize lifting the live gate.

## SEC-02 — Credential and process hardening

**Status: Partially implemented in the dormant F3 bridge; live acceptance blocked.**

### Present controls

- No OAuth flow, keychain access, token handling, external CLI credential reads, or credential persistence is implemented.
- The native connection gate returns before executable discovery, version probing, spawn, or account reads. There is no runtime/environment bypass.
- The dormant launch uses a native executable rather than a shell shim, fixed arguments, `--strict-config`, a pinned CLI version, stdio JSONL, and no renderer-provided command/path/RPC input.
- RPC methods are allowlisted to initialization and account/quota reads. Account reads use `refreshToken: false`; no turns, login/logout, reset consumption, purchase, or inference request is implemented.
- Frame size and queue are bounded, requests have deadlines and correlation checks, malformed/unknown values remain unavailable, and diagnostics are static categories. Raw RPC bodies and auth fields do not cross IPC or enter logs.
- Unix process-group and Windows Job Object containment, child termination, and synthetic process/protocol tests are present in the foundation. Windows uses suspended `CreateProcessW` plus an atomic job-list attribute, without a post-spawn assignment window. An out-of-band watchdog bounds blocked protocol writes through tree termination.

### Acceptance before live enablement

- Resolve a documented Codex app-server startup policy that prevents unintended listeners, remote-control restoration, and background provider activity, or keep the gate closed.
- Eliminate and test the Windows spawn-to-job assignment gap; verify process-tree cleanup and reader-thread shutdown on Windows, macOS, and Linux under failure, timeout, disconnect, and app exit.
- Independent review confirmed a separate Unix forced-exit blocker: process-group cleanup needs a running parent. `SIGKILL`/forced termination bypasses Drop and RunEvent hooks, so the Codex child may survive. A supported parent-death/supervisor strategy and runtime evidence are required before claiming Linux/macOS forced-exit cleanup. The global live gate stays closed; graceful CI fixture tests do not close this condition.
- Exercise bounded frame saturation, malformed/oversized frames, RPC mismatches, account changes during startup/refresh, stale/auth invalidation, and static diagnostic redaction with synthetic fixtures.
- Verify the consent screen describes Codex-managed token refresh/state writes and that no account read happens before explicit consent.
- Implemented: the checkbox remains frontend UX; the directly invokable native command requires its own fixed OS confirmation and private single-attempt guard. Direct-IPC tests cover forged payloads, cancellation, concurrent Connect, late approval after Disconnect, and app-exit invalidation with fake processes. Production retains no runtime test injection, remembered authorization, or consent-setting IPC. Native OS dialog interaction still requires separate platform acceptance, and the startup gate remains closed.
- If SIWC is ever implemented: public authorization contract first, PKCE S256/state/nonce validation, exact issuer/audience/resource/client checks, granted-scope validation, serialized rotating-token refresh/revocation, app-owned OS-protected secret storage, and zero secret exposure to WebView/IPC/logs. Do not route credentials through the pinned internal-only `chatgptAuthTokens` method.

See [the detailed startup investigation](f3-startup-security-investigation.md) and [current gate validation](f3-validation.md) for the supported/manual alternative and exact evidence. SEC-02 remains partial until native platform acceptance and all live startup requirements are satisfied.

## SEC-03 — Dependency, supply chain, and local data

**Status: Planned; baseline controls exist.**

The repository uses committed Bun and Cargo lockfiles. CI uses frozen Bun installation and `--locked` Rust checks, with workflow permissions limited to `contents: read`; Tauri command permissions are explicit and scoped to the main window. No persistent quota history or auth-token cache is implemented; the live gate is closed.

### Acceptance conditions

- Review direct and transitive dependency vulnerabilities before each release; document disposition, owner, and follow-up date for accepted risks.
- Run secret scanning on commits and release inputs; keep CI secrets absent from untrusted pull-request jobs and verify action pin/update policy.
- Recheck least-privilege workflow permissions, checkout/build actions, cache contents, and artifact upload scope whenever CI changes.
- Require a Tauri capability/permission diff review and test that renderer IPC exposes no generic process, filesystem, or network primitive.
- Before adding history/cache, define fields, encryption/OS protection where needed, retention, clear/delete behavior, and proof that tokens/raw provider payloads are excluded.
- Record source revision, locked dependency manifests, build inputs, and artifact hashes for releases; establish provenance/attestation before distributing signed installers.

## SEC-04 — Cross-platform release hardening

**Status: Planned; release and native acceptance remain pending.** F3 source/config review leaves release CSP restricted and capabilities scoped to the main window, but compilation is not OS security acceptance.

### Acceptance conditions

- Run owner-driven acceptance on supported Windows, macOS, and Linux targets for consent, connect gating, refresh, disconnect, window close/hide, app exit, and process cleanup.
- Choose installer and code-signing/notarization strategy; document certificate ownership, signing in CI, and artifact verification.
- If an updater is added, verify update metadata/signature verification, rollback/replay behavior, channel integrity, and recovery from interrupted updates before enabling it.
- Review release CSP, Tauri capabilities, shell/file/network/plugin permissions, browser-opening behavior, and runtime OS prompts for every target.
- Test logout, revoked/expired auth, account switching, managed workspace restrictions, forced app termination, and restart with no remembered consent. No account is required for synthetic tests.

## SEC-05 — Ongoing security maintenance

**Status: Planned.**

### Acceptance conditions

- Publish a vulnerability reporting contact and response expectations; define how reports are triaged, acknowledged, and tracked to resolution.
- Publish security advisories for shipped vulnerabilities and identify affected versions and remediation.
- Maintain a scheduled dependency review and owner assignment for high/critical findings.
- Add regressions for auth, account-switch, process-containment, stale-data, and secret-redaction defects found in prior releases.
- Maintain incident steps for disabling a compromised integration, revoking Quotafern-owned SIWC sessions through the documented revocation endpoint, clearing app-owned secrets, and advising the user how to review/revoke the app in ChatGPT settings. Never instruct the user to share credentials.

No SEC-03 through SEC-05 milestone is claimed complete. Passing synthetic tests or CI does not resolve the live startup/auth gate or constitute native OS acceptance.

## ACC-01 account isolation foundation

The [ACC-01 architecture and security analysis](acc-01-architecture.md) adds pure TypeScript ownership, aliases, metadata migration, selection and removal-barrier contracts with synthetic regressions. It is not connected to the native bridge, production UI or localStorage. It introduces no credential field, provider operation, new permission or CSP change; both Codex live gates remain false. Local aliases never authorize monitoring or establish shared billing. TypeScript cleanup acknowledgements are testable coordination contracts, not trusted proof of native cleanup. A future native coordinator must enforce account/connection generations and cleanup before removal, independently of renderer claims. SEC-01/SEC-02 and F4 startup/Unix forced-parent termination blockers remain open; app-owned secret storage and provider-specific multi-login grants require separate review.

## ACC-04 local metadata activation

The [ACC-04 persistence design and threat review](acc-04/plan.md) activates only the existing strict account-presentation codec in app-origin localStorage. No credential, consent, verified identity, runtime or usage field persists. Writes precede visible state; failed writes retain input and old data. Corrupt/unknown/oversized payloads are preserved behind explicit recovery; unavailable reads block reset. Local-only removal is isolated from native state and uses no renderer-generated cleanup acknowledgment. A future native coordinator must replace that boundary before sessions can be attached. Both live gates remain false; SEC-01/SEC-02, startup policy and Unix forced-parent cleanup remain open. [Actual checks and native limits](acc-04/validation.md).
