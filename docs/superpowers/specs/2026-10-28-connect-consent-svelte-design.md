# Connect once, remember permission; Svelte consent

Status: approved by the owner on 2026-10-28, then implemented and independently reviewed by Luna High. Owner subsequently expanded the scope to all Quotafern-owned OS message boxes; external Codex/browser UI remains outside scope.

## Owner intent

One successful Connect also remembers monitoring permission. Remove the separate Connect once / Connect and remember choice. Replace the Windows OS message box with a Svelte dialog matching Quotafern. Preserve the existing Accounts/Overview design, three-minute refresh, isolated accounts and reviewed helper.

## Approaches

- **Recommended: isolated Tauri window, Svelte content.** Rust creates a small parented consent window with a dedicated bundled entry and narrow IPC. This supports custom styling and prevents the main renderer from approving its own connection request. It requires a small additional window/capability surface.
- **Svelte modal inside the main page:** visually simpler, but the main renderer can already invoke Connect; its UI state cannot prove approval. Rejected for the current consent boundary.
- **Keep the OS dialog:** strongest OS authenticity and lowest implementation cost, but does not satisfy the requested Svelte appearance. Owner's later all-dialog instruction excludes this fallback: unsupported custom-window behavior fails closed instead.

## Visible dialog

Use the existing Graphite/Jade tokens and shared button styling; no new visual system.

**Connect Codex account?**

“Allow Quotafern to read this account's quota and reconnect automatically when Quotafern opens?”

Compact source-specific details disclose the reviewed supervised helper, Codex-owned auth renewal, cloud-config/model startup and local sanitized network receipts for System; isolated home, native credential use and the fixed usage endpoint for Managed. These are existing access scopes, not new permissions. No aliases, provider identities, tokens or credential paths enter this page.

“Refreshes every three minutes. Disconnect stops monitoring and removes this permission. Quit keeps permission for the next launch.”

Buttons: **Cancel** / **Connect**. Escape and close mean Cancel. Keyboard focus initially favors Cancel. There is no remember checkbox or session-only option. Successful manual Connect remembers; failed or cancelled Connect creates no grant. Existing remembered grants remain valid only under the current versioned policy; old session consent is never upgraded.

## Native authority

- Existing main-only Connect validates/reserves the native connection, then requests one global pending consent window. A dedicated bundled entry must never mount App, hydrate account storage, resume accounts or poll providers.
- Rust owns a cryptographically random one-time challenge bound to the selected native connection, kind, generation and bounded expiry. It is never placed in URLs, events, storage or logs.
- Only the actual consent window has capabilities for reading its fixed disclosure and confirming/cancelling that challenge. Main cannot approve; the consent window cannot invoke provider, arbitrary filesystem, network or window-management commands. Every native handler verifies caller label and pending binding.
- Confirm consumes the challenge once. Rust rechecks the current connection attempt before continuing the existing guarded adapter. It saves permission only after verified identity binding, normalization and cleanup succeed.
- Cancel, close, timeout, build failure, Disconnect and Quit invalidate pending consent. No provider access is allowed before approval. Parent/focus behavior must be verified on Windows; unverified platform behavior fails closed without an OS-dialog fallback.
- Keep CSP unchanged, use only bundled assets, prevent navigation/new windows, disable drag/drop and developer tools in the consent surface. The page must not read or trust shared local storage. The main app keeps its current hide-on-close behavior.

## Threat-model distinction

This preserves a native authorization boundary against approval forged through the main renderer, provided the isolated window and capabilities are verified. It does not reproduce all OS-dialog authenticity: a compromised renderer can still draw misleading content. Luna found this design feasible and rejected same-main-page approval. Final implementation requires independent review before an acceptance build.

## Verification and boundaries

Extend the existing Bun/Rust regressions after implementation: caller/capability denials, challenge mismatch/replay/expiry, cancel/close/disconnect races, no provider before consent, remember only after successful read, restart and revoke. Use synthetic browser/native dialog checks; the owner performs real consent and observes quota. Preserve production-disabled gates in the separate patch; no commit/push/merge/release, no real credential inspection, no system ACL/login changes. macOS/Linux native acceptance remains NOT RUN unless exercised.
