# UX-02C interaction design and implementation plan

Spec: owner UX-02C brief, 25 October 2026. Baseline `12826af477afc29cbc078fc8e413e976c01112cd`.

## Design

Extend the approved Hybrid A+B Svelte presentation. Keep one native select; lift its ID-backed selection and source-specific Details target to App so tabs do not destroy context. Accounts provides provider disclosure, account/workspace Overview links and eligible connection/source Details links. Return records contain only transient selection, originating screen/control and scroll offset. No persistence or authorization is created.

Alternatives considered: independent screen state loses continuity; a new routing/store dependency adds unnecessary machinery. Parent-owned typed presentation state is the smallest seam compatible with ACC-01. Keep configured provider groups expanded initially and allow collapse; unsupported catalog entries stay compact explanatory rows.

Invalid Overview contexts resolve through ACC-01 to All accounts with an announcement; invalid Details never substitutes another source. Context changes remove the prior grid synchronously, reset content scroll and announce ownership. Back restores a valid origin or a safe focus fallback. Source freshness and billing relationships remain independent.

## Implementation

- [x] Add `src/lib/accounts/navigation.ts`: shared selection options, labels and typed transient route/return contracts; stable entity IDs throughout, including duplicate ordinal labels.
- [x] Integrate App, AccountOverview and AccountsPanel: context continuity across tabs; provider disclosure; account/workspace/connection navigation; scoped Details ownership; focus and scroll restoration. Keep existing native Escape handling and the standard select keyboard contract.
- [x] Add fixed disconnected fixture and regressions after implementation for stable selection, invalidation, duplicate/Unicode labels, source isolation and navigation. No TDD, dependencies or ACC-04 lifecycle approximation.
- [x] Run frozen Bun install, all frontend quality/regression/build commands and applicable locked Rust checks. Exercise source and compiled browser UI through the existing settled-tab capture helper at 320/380/420 × 480/660, palettes, appearance, keyboard, reduced motion and synthetic edge states.
- [x] Obtain one focused GPT-6 Luna High architecture/accessibility/security review, resolve findings, record exact local/hosted evidence and deferred native/screen-reader acceptance. Create Draft PR and leave unmerged (final hosted status recorded in PR).

## Boundaries and review focus

Both live gates remain false. No native code, permissions, CSP, ICON-01 assets, network requests, authentication, storage keys or connection lifecycle changes. ACC-04 owns aliases/records/cleanup/persistence; SEC-01/02 and F4 blockers remain open. PR #11 is untouched.

Review stale return targets, duplicate aliases under narrowed Details, invalid workspace/connection ownership, rapid tab/context changes, and source removal while Details is retained. Browser checks prove DOM/keyboard behavior, not native GUI or assistive-technology speech acceptance.
