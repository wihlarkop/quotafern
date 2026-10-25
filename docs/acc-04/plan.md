# ACC-04 persistence design and implementation plan

Baseline: `9f6497b65188496fe9786787a75da6e7ce0fd5bf`. Scope: the owner's ACC-04 request; local labels and descriptors only.

## Persistence and threat review (before implementation)

Selected mechanism: one app-origin localStorage key, `quotafern.account-presentation.v1`, through the existing ACC-01 readMetadata / validMetadata / writeMetadata codec. This follows existing appearance storage without new native IPC, plugins, capabilities or CSP changes. Native WebView origin persistence across an actual app restart remains owner acceptance; browser reload proves the adapter only.

Alternatives considered: native file/plugin storage would add permissions without protecting these non-sensitive labels; in-memory-only management would fail restart durability. localStorage is synchronous, per-origin and atomic per setItem, but plaintext, user editable, and not a security authority. Local malware, a compromised renderer/dependency, browser clearing, disk loss and a user typing a secret into an alias are outside its protection. Copy tells users to enter non-sensitive labels. No telemetry or rejected-payload logging.

Only v1 account IDs/provider IDs/aliases, workspace IDs/owner IDs/aliases, connection IDs/owner/workspace IDs/aliases/mechanisms persist. The codec rejects extra fields, noncanonical aliases, duplicate IDs, orphan ownership, more than 200 records per collection and envelopes exceeding 65,536 UTF-8 bytes. No credential, locator, identity, consent, authorization, lifecycle, source, activity, billing or native runtime field persists. Restores go through restoreState and are always disconnected with no identities or sources.

Read failures, corruption, oversized and unknown versions lock editing and preserve the original bytes. Explicit confirmed reset replaces only this namespace with empty v1 metadata. No automatic discard. The sole defined synthetic v0 migration is written as v1 before its new IDs become visible; write failure retains v0 and locks editing. No F3 account is inferred. Writes validate a candidate and compare the stored envelope to the last read to detect intervening edits; storage exceptions/conflicts leave visible state unchanged. This is best-effort conflict detection, not a multi-writer database; the app supports one main window. Reload recovers a conflict.

## Local removal proof

This controller creates/restores metadata only, never owns or invokes a native session. Its state is isolated from demo and F3. Removal additionally requires generation zero, disconnected, no consent/authorization, last-success or diagnostic, no identities/sources, and no pending removal for the owner. It does not use ACC-01 synthetic cleanup acknowledgments. A future adapter must replace this controller boundary with a native coordinator before passing records to native work; generation zero alone is never native cleanup proof. Active, previously managed, missing runtime and pending records fail closed. No provider logout or external credential deletion.

## UI and navigation

Extend existing AccountsPanel and AccountOverview; keep current tokens, icons and source projections. Add local account chooses a catalog provider and alias. Account actions add a descriptor (mechanism and optional existing/new workspace), rename or remove. Connection actions rename or remove independently. Dialogs show complete aliases, owner context and local-only consequences, validate with validateAlias, trap focus, cancel on Escape, save on Enter except IME, preserve failed input and restore an opener/fallback. Unsupported providers retain Coming Soon. Demo has no management/persistence actions. Overview uses the local metadata when Demo is off, with unknown empty sources and stable-ID navigation.

## Implementation steps

- [x] Add a feature-local storage/controller module with transactional add/rename/remove/reset and precise alias feedback, using the unchanged v1 schema.
- [x] Add focused management dialogs/action menus and integrate local state/navigation above tab unmounts; preserve demo isolation and dormant native code.
- [x] Extend Bun regression with storage limits/failures/recovery, independent IDs, Unicode, restore and blocked native removal cases.
- [x] Exercise source and compiled browser flows, keyboard/focus/IME/modal, 320/380/420px and reduced motion; capture genuine screenshots.
- [x] Run required frontend and Rust checks, one independent Luna High security/accessibility review, fix actionable findings, and record exact-HEAD hosted CI in the Draft PR.
- [x] Prepare the Draft PR delivery with final SHA, matrices, evidence and explicit native/provider limits. Hosted status and delivery are recorded in the PR; do not merge/release.

Review focus: storage unavailable or changed externally; Unicode code-point boundaries and invisibles; write-before-visible-state; prior native work masquerading as disconnected; focus/selection after deletion. Regression and browser checks cover these cases. Optional workspace rename is deferred; workspace ownership is preserved and workspace creation uses the existing schema.
