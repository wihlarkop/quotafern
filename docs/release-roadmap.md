# Quotafern — Release and Versioning Roadmap

Status: Planned. Documentation only. Owner request: 25 October 2026.

The project must have a deterministic, auditable app-version policy before the first public release or external provider integrations. Versioning is distinct from automatic updates, code signing, packaging and publishing. This roadmap neither enables an updater nor authorizes a release.

## Current baseline

As audited after UX-02B PR #10:

- `src-tauri/tauri.conf.json`: `version: "0.1.0"`
- `src-tauri/Cargo.toml`: package `version = "0.1.0"`
- `package.json`: `version: "0.1.0"`

Tauri 2 supports native app versioning and recommends the `version` value in `src-tauri/tauri.conf.json`. No custom native version engine is needed. `@tauri-apps/api/app` includes `getVersion()` for reading the installed application version.

Current `0.1.0` is an internal development baseline, **not evidence of a public release or installer acceptance**. No new release number, published tag or updater is approved here.

## REL-01 — App version and release foundations

Status: Planned. Implement after UX-02B/C + ACC-04 and combined native Windows acceptance, before any public/third-party rollout.

- Adopt Semantic Versioning (`MAJOR.MINOR.PATCH`) with a documented pre-`1.0.0` policy and explicit stable/prerelease channels if useful.
- Make `src-tauri/tauri.conf.json` the **authoritative app version**. Keep `package.json` and `src-tauri/Cargo.toml` aligned via a small deterministic local script/check; do not silently bump versions during unrelated PRs.
- Validate SemVer syntax, equality across all three manifests, app bundle metadata and packaged product/identifier compatibility across Windows/macOS/Linux. Respect platform-specific metadata constraints.
- Provide an About section in Settings displaying the actual installed app version via official Tauri API `getVersion()` in the native shell; offer a safe browser-preview placeholder without making a fake native invocation.
- Define manual, explicit release steps: approved version change, release notes/`CHANGELOG.md`, commit, immutable annotated `vX.Y.Z` tag, build provenance and checksum manifests, reproducible locked dependencies, CI verification, owner approval, then only authorized publishing.
- Do not automatically create a tag, package, release, auto-merge or deployment when a regular feature PR lands.
- Add regression checks for malformed/inconsistent manifest versions, stale displayed version, duplicate tags, missing changelog or unsupported target-specific versions. Treat generated artifacts as untrusted until signed/verified.
- For release readiness, require the owner-completed combined Windows native acceptance and OS-specific packaging/signing checks. macOS/Linux native GUI acceptance remains NOT RUN until available; do not claim supported releases without appropriate acceptance.

## REL-02 — Optional secure update delivery (separate, later decision)

Status: Deferred. No implementation approval.

Tauri 2 offers an official updater plugin; do not build an update downloader from scratch. The updater is distinct from base app versioning and is **not installed or configured** by this roadmap.

Before any future updater implementation:

- Define supported installers, operating systems/architectures, stable/beta channel mapping and authoritative HTTPS update endpoints.
- Require genuine signed updater artifacts, public-key verification and **private signing keys stored only in a protected release environment**; never check keys into Git, read external CLI credentials, or expose secrets to the webview.
- Define explicit user-consented update check/install, failure handling, restart behavior, rollback/recovery and no forced/silent downloads without owner-approved policy.
- Test stale/malformed metadata, downgrade/replay, missing/bad signatures, compromised endpoints, wrong-platform artifacts, offline conditions and interrupted installations.
- Keep any updater command/capability grant narrowly scoped; independently review network, signature, CSP/IPC and supply-chain impacts.
- Do not treat hosted CI build success as proof that signing, installation or native updates work.

## Release safety gates

- Version number alone does not establish a release, user acceptance, compatibility or safe provider access.
- Keep `LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` until F4 independent startup/security blockers are resolved and the owner explicitly approves live activation.
- F4 Codex startup policy/Remote Control side effects and Unix forced-parent termination remain BLOCKED.
- Preserve provider-specific terms/official quota read contract, native consent, least-privilege auth and ACC-01 isolated ownership before any third-party connection.
- Do not merge implementation PRs, distribute installers, publish releases, or enable auto-updates without explicit owner approval.
- DOCS-CLEANUP remains planned after internal UX/ACC work and before third-party provider integrations. Preserve all Superpowers plans and security evidence that remains needed.

## Sequencing

1. UX-02B merged as synthetic-only account-aware presentation.
2. UX-02C: account context interactions, filtering and navigation.
3. ACC-04: local alias editing, carefully reviewed non-sensitive persistence and explicit disconnected lifecycle management.
4. Combined Windows native acceptance for ICON-01 + UX-02B/C + ACC-04; macOS/Linux native GUI remains NOT RUN until hardware is available.
5. DOCS-CLEANUP before external provider integration; retain required plans and evidence.
6. REL-01: versioning policy, About version and manual release readiness checks, **no shipping** without separate authorization.
7. Provider-specific security/API research and integration once authorized.
8. REL-02 optional secure updater and actual release workflow only after explicit owner decision.

Order of DOCS-CLEANUP and REL-01 may be swapped based on implementation dependencies, but both must precede public/third-party rollout.

## Official references

- Tauri versioning: https://v2.tauri.app/distribute/
- Tauri config schema: https://v2.tauri.app/reference/config/
- Read installed app version: https://v2.tauri.app/reference/javascript/api/namespaceapp/
- Updater and signature requirements: https://v2.tauri.app/plugin/updater/
- GitHub distribution/release guidance: https://v2.tauri.app/distribute/pipelines/github/
