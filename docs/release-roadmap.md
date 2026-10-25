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

## Distribution decision — GitHub Tags + Releases + Actions

**Owner-approved architecture decision (25 October 2026):** use GitHub as Quotafern's official source of published app releases; do not build a bespoke release-hosting or update server.

- Keep `src-tauri/tauri.conf.json` as the authoritative **installed app version**. Check that `Cargo.toml` and `package.json` agree before publishing.
- An explicitly approved, immutable annotated Git tag such as `v0.2.0` identifies the exact release commit. A GitHub Release references that tag and publishes release notes, platform-specific installers/packages, hashes and **signed Tauri updater artifacts**, along with compatible `latest.json` metadata when REL-02 is implemented.
- Use GitHub Actions for reproducible, pinned-dependency CI and building release candidates for specifically supported platforms. Publishing the GitHub Release, signing artifacts and creating/updating release metadata must be separately owner-approved and protected by least-privilege workflow permissions and release-environment controls; routine PR merges must never publish.
- Build once from the approved tag/ref with traceable commit/manifest versions, check integrity/signatures and retain provenance; do not silently retag or overwrite previously published artifacts.
- An approved GitHub Release may be a draft/prerelease until platform-native acceptance, signing and distribution checks are satisfied. Do not claim that a successful CI compile makes an installer safe or a release supported.
- **Distribution prerequisite:** public GitHub Release assets can support a direct static updater metadata URL (for example a release asset such as `latest.json`). A private repository/private asset may require authorization; never embed a personal access token or a repository secret into a shipped Quotafern binary. Decide on public assets or an independently reviewed secure distribution route before implementing REL-02.
- Versioning, publishing and updating are distinct actions. This roadmap makes **no new tags/releases, uploads, builds or updater configuration**.

## REL-02 — Manual Check for Updates (official Tauri updater; later implementation)

Status: **Product interaction approved; implementation deferred.** The owner chose GitHub Releases + GitHub Actions and a user-controlled updater. This selection is NOT approval to install an updater plugin, add a remote endpoint/capability, sign binaries, publish releases or fetch remote data now.

Tauri 2's official updater plugin separates checking (`check()`) from downloading and installation (`download()`, `install()` or `downloadAndInstall()`). Use it rather than creating a custom downloader.

### Approved UX and consent boundary

- Under **Settings → About & Updates**, show the true locally installed version (through official Tauri `getVersion()`), a clear **Check for Updates** button and a neutral status/error area.
- **Manual-only default:** no version check at app startup, popup open, Settings open, tray click or on a timer. No background polling, silent download or automatic installation. Do not make a network call merely to render About.
- On user click, make a bounded, HTTPS metadata-only check against a configured trusted release source. No installer/package download or install is permitted as part of this check.
- If no update exists, say **You're up to date** only after a successful check. For offline/network/manifest errors, report **Unable to check** and offer Retry. Do not treat failure/unknown as up to date.
- If a verified, newer compatible release is available, show current and offered versions, release notes, supported platform/architecture, and download size if available. Provide **Install Update** and **Later**; no action is preselected. **Later** keeps the current version.
- Start a package download **only after a separate explicit Install Update click**. Show progress, integrity/signature-verification result and actionable download or installation errors. Fail closed for invalid signatures, wrong target, downgrade, unsupported channel or compromised metadata.
- Before installer execution/app exit/restart, clearly describe the expected OS-specific behavior and obtain appropriate user confirmation where feasible. Some installers may close the running app and may not be cancelable after handoff; never promise guaranteed cancel/reversal on all OSes.
- No forced updates or "Automatically install updates" setting in the initial REL-02. A separate **opt-in update-availability notification** setting is permitted as defined below, without downloading or installing anything.

### Opt-in new-version notification and dedicated release notes view

**Owner-selected UX addition (25 October 2026):** a small, unobtrusive **New version available** banner/toast in Quotafern that opens a dedicated **Settings → About & Updates → Release Notes** view. This changes the earlier *strictly manual-only check* policy only **when the user explicitly enables notification checks**; update installation always remains manual.

- Add an explicit **Notify me when a new version is available** toggle, **OFF by default**. The UI must explain that turning it on authorizes occasional version-metadata network requests to the configured GitHub Release update endpoint; it never grants permission to download or install an update.
- With notification checks OFF, preserve strict manual-check behavior: **no startup, tray, Settings-open, periodic or background version request**. The **Check for Updates** button remains available and works independently of the notification preference.
- With notification checks ON, allow a rate-limited metadata-only check while Quotafern is running (e.g. once on launch *if due* and at most once per 24 hours thereafter); do not spawn an always-on separate daemon, poll aggressively, or check while the app is not running. Throttle retries/failures and prevent concurrent checks.
- When a compatible newer version is found, show a gentle **in-app toast/banner** and a subtle **Updates** dot/badge that the user can revisit. Notification actions: **View Release Notes** and **Later**. Never auto-open the update page, focus-steal, display full-screen prompts, trigger installation or show a repeated alert on every tray click. Debounce/dedupe notifications per offered version and respect a dismissed/snoozed version until a later version or an explicit user-initiated check.
- If the tray popup is hidden, retain an in-app update indicator to display when opened; **OS-native notification is optional, separately opted-in and gated on OS notification permission**, with accessible fallback when notifications are denied. Do not silently request notification permission or introduce new platform capabilities until independently reviewed.
- The dedicated **About & Updates** page includes installed version, latest checked version, last successful check/time, current update state, signed release provenance, release date, **trusted release notes** and an official GitHub Release link. Render fetched release-note content as sanitized plain text/safe Markdown, not unsanitized HTML or arbitrary scripts. Include **Check for Updates**, **Install Update** (only when a validated compatible update exists) and **Later**; no stale state presented as fresh.
- A background *metadata-check* result may offer the update and populate notes but **MUST NOT fetch installer binaries**, write/install an update, relaunch, or modify an existing provider session. Installation still requires explicit separate user action and the platform-specific confirmation described above.
- Store only a minimal validated **local non-secret** setting and dedupe metadata (opt-in flag, last-check time, last-notified version, snooze preference); no external account identity, tokens, API keys or credentials. Handle corrupt/missing settings safely with notifications OFF.
- Accessibility: banner is non-modal/non-intrusive, readable in both palettes/light/dark, keyboard accessible, honors reduced motion and does not intercept Escape/tray popup focus. No notification spam.
- Tests must cover OFF = zero automatic network requests, ON = bounded metadata-only requests, a new-version notification once, Later/dismissal/dedupe, version change, offline/error, reopening the hidden tray popup, OS permission denied, release-note sanitization, and proof that **no download/install occurs without explicit Install Update consent**.
- This is a **product specification only** in PR #11; actual updater/notification plugins, security capabilities, endpoints, publishing and native acceptance are deferred to a separately owner-approved implementation PR.

### Implementation prerequisites and acceptance

- Produce approved GitHub Release updater metadata compatible with Tauri 2 (typically `latest.json`), with platform/architecture artifact URLs and mandatory Tauri updater signatures. Validate metadata compatibility with the precise official plugin version used.
- Protect private update-signing keys in a dedicated release environment; ship only the public verification key. Do not expose keys, GitHub personal tokens or privileged release APIs to the Svelte renderer.
- Review every plugin command/capability grant, network origin, process restart behavior, update-channel mapping, error handling and platform-specific signing/notarization requirements. Do not widen unrelated F3/Codex IPC or CSP.
- Test metadata-only check (and proof of **no package download**), explicit user consent boundaries, up-to-date/offline/error results, Later, progress, tampered signatures, downgrade/prerelease rejection, interrupted download, invalid endpoint, installer handoff and restart behavior on supported platforms.
- Stage signing, packaging and native update acceptance with disposable test artifacts. Hosted compilation and synthetic/browser mocks are not proof of a working installer or updater.
- **No runtime implementation in PR #11.** The GitHub Release target is a plan until an approved public/supported distribution endpoint and signed-release workflow exist.

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
