# ACC-01 multi-account UX acceptance contract

Date: 2026-10-25. Target implementers: ACC-04 / UX-02; visual exploration: UX-01. This document specifies future behavior; ACC-01 does not implement the screens or activate connections.

## Purpose and visual direction

Help a person quickly identify whose quota, reset, credits and activity they are inspecting, then manage independent local connection names without confusing those names with a provider login. Preserve the Soft Native direction from the [UI roadmap](ui-ux-roadmap.md): Things 3 whitespace and hierarchy, Raycast keyboard feedback and Ice restraint. Use the existing semantic components and tokens. UX-01 chooses visual composition through its own exploration; it must not redesign source ownership.

## Information architecture and view fields

Accounts uses Provider → Account → optional Workspace → Connection. A workspace is context within an account, not another credential. A provider's heading includes display name and adapter availability; unknown capability is not a connectable button. All non-Codex adapters remain Coming Soon, Codex remains disabled pending F4. A generic model entry or an installed CLI is not proof of monitoring permission.

Use `accountsView`, `overviewView`, `detailsView`, and `Selection` in `src/lib/accounts/views.ts` as the typed boundary. The exact entity and source fields are in `model.ts`. No raw credential, key suffix, provider email, filesystem path or protocol body belongs in a view.

| Context        | Required identity and presentation                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider       | `providerId`, display name, availability, assessed capabilities and future Add affordances                                                                        |
| Account        | `accountId`, provider ID, local alias, configured/removing state, optional separate verified identity, independently listed workspaces and connections            |
| Workspace      | `workspaceId`, parent account ID, local alias; selection stays inside that account                                                                                |
| Connection     | `connectionId`, account/workspace IDs, local alias, mechanism label, lifecycle, consent/authorization descriptors, last successful read and static error category |
| Source         | `sourceId`, owner IDs, observing/authorized connection IDs, verified or unknown association, live/synthetic origin, authority, fetch time, independent freshness  |
| Quota window   | Window ID, safe label, remaining percentage or unknown, reset timestamp or unknown, duration or unknown                                                           |
| Other measures | API metering and units, spending decimal text and reported currency or unknown unit, credits and units, earned resets and activity independently                  |

Display aliases in prominent text. Verified identity, when permitted, is secondary and explicitly labeled “Verified identity”; absent verification reads “Identity not verified”. Connection identities remain independent. A header may show a verified label only for a context with one connection; multiple connections expose their own labels instead of implying a common identity. Never infer identity from aliases. IDs are selection keys, not prominent copy. Duplicate aliases receive visible local ordinal disambiguation within their provider/account group (for example “Personal · account 2” and “Key · connection 2”), assigned consistently for the current list, without changing saved aliases or using email/key fragments. Accessible names include provider, alias, ordinal and action. A future sort may alter ordinal display, but never the selected stable ID.

## Accounts actions

Add account, Add connection, Rename account, Rename connection, Disconnect and Remove are separate actions. ACC-01 describes future capabilities, not implemented production controls. View action descriptors for Add remain false. Rename is a local metadata operation; disconnect/remove require a future native coordinator where monitoring could exist. Never map Remove to provider logout or credential deletion.

Future Add starts a local presentation record and only proceeds to connection after the adapter's supported read-only monitoring method, native consent and security gates are accepted. Do not collect API keys in a generic form before ACC-03's credential lifecycle is reviewed. Coming Soon entries explain that supported monitoring is pending, without a misleading Connect affordance. Existing disabled Codex disclosure remains intact.

### Rename workflow

1. Open a labeled action menu for the intended account or connection. Actions say “Rename account” and “Rename connection”; API key connections may say “Rename key label”.
2. A form/dialog shows provider, parent account, connection/workspace context and the complete existing alias. Focus/select the name input. Give it a visible label; no placeholder-only labels.
3. Explain “Local name only. This does not change your provider account, sign-in, quotas or billing.” Apply the same 80-code-point NFC/trim/control validation as `validateAlias`. Allow duplicate aliases and Unicode; reject invalid values inline with the field associated to the error. Show a code-point counter or precise remaining-length message; do not clip entered text silently.
4. Enter submits unless an IME composition is active. Save commits only the named alias; Cancel/Escape leaves it unchanged. A future storage failure keeps the form and text available, states that saving failed, and must not report success. Do not include the alias or rejected text in diagnostics.
5. Return focus to the initiating action, announce the successful rename politely, and preserve selection and every source association by ID. An account rename never renames its connections and vice versa. Account removal pending disables edits.

## Overview filters and navigation

Default to All Accounts on start. Provider, Account, optional Workspace and Connection filters are ID-backed tagged selections, never string matching. Filters are transient in ACC-01; no stored filter restores monitoring or consent. Provider selection groups all its accounts; Account selection includes its connections; Workspace narrows only within the account. Offer Connection only when the provider/source relationship makes it meaningful, especially for multiple keys. A shared source remains the same source across key filters.

Overview lists one row/card per source, with account context, source type, quota windows, reset times and per-source freshness. All Accounts is a collection of independent sources, not a percentage, currency or credits total. Shared verified sources appear once with a “Shared by N connections” disclosure. Unknown associations show “Billing relationship unknown; do not add these balances.” Do not assume they are distinct wallets. Cross-account shared billing is not implemented: leave totals unavailable pending a provider-specific reviewed mapping.

Opening Details passes provider/account/optional connection context. The heading always names the selected provider and account alias, with connection alias when narrowed. Quota, credits, spending, earned resets and activity all come from that context. Details rejects any missing/mismatched owner with an unavailable selection state and a safe Back action. It must never silently show the next account's details. During account switching, clear the previous context before requesting another view; loading is scoped to the new selection.

An invalid/deleted Overview filter resolves to All Accounts, with a polite “Selection removed; showing All Accounts” announcement. Details returns unavailable. Back retains a still-valid previous Overview selection; if it no longer exists, use All Accounts. Navigation never reads a provider or refreshes implicitly.

## Required state behavior

| Scenario                           | Required behavior                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No accounts                        | “No accounts configured”; explain local setup and provider availability. No invented connected account or synthetic allowance. Explicit Settings demo remains visibly separate.                        |
| One connected account              | Show its alias, connection and independent source freshness. No claim that all provider accounts are connected.                                                                                        |
| Multiple accounts for one provider | Separate account rows and connection lists; provider collapse/expand must not merge lifecycle or data.                                                                                                 |
| Multiple API keys                  | Separately named connections under the same account; credits shown once only if shared authority is verified. Never display key material.                                                              |
| Mixed connected/disconnected       | Connected sources remain usable; disconnected rows say disconnected with no retained authorization. Group status summarizes counts without replacing connection statuses.                              |
| One authentication expiry          | Only that connection becomes auth-required; clear its identity and owned links. Other connections/accounts retain their state. Quotafern does not initiate login.                                      |
| One stale source                   | Retain its last timestamp and label stale; other sources remain current. Show “Unknown” for absent timestamp/reset/value. Never rewrite missing data to zero.                                          |
| Loading or refresh                 | Local spinner/status only for affected connection/source; preserve navigation and unaffected controls. Manual Refresh only, native cooldown respected; no automatic polling/reconnect.                 |
| Error                              | Static sanitized text near affected connection; no raw provider error. ACC-01 failure transition clears that connection's values. Existing F3 stale behavior stays unchanged until reviewed migration. |
| Unknown billing relationship       | Separate observations with explicit uncertainty and no total. Equal aliases/balances do not establish shared authority.                                                                                |
| Duplicate aliases                  | Keep stable IDs; show contextual ordinals and full accessible labels. Renaming one does not rename or select another.                                                                                  |
| Removal while others remain        | Revoke target consent immediately; hide target data; show removing/pending cleanup until native acknowledgement. Keep other accounts and selections intact.                                            |
| Unsupported provider               | Coming Soon, supported-method explanation, no sign-in/key collection or fabricated quota. Codex gated status is distinct.                                                                              |
| Synthetic demo                     | Explicit “Synthetic demo” at screen and source context, including production. Live errors never substitute demo values.                                                                                |

Per-connection lifecycle and error are independent of per-source freshness. A verified shared source may remain visible through another authorized connection after one disconnects. The disconnected connection's own Details has no values. The surviving link does not mean the disconnected key remains authorized. Sparse activity keeps calendar gaps unknown, confirmed zero distinct, and tokens separate from spending.

## Disconnect and removal consequences

Disconnect stops only Quotafern's selected monitoring session, revokes its consent, cancels pending reads and clears its identity/data links. It never logs out another connection, changes the external CLI's active login or deletes a provider credential. A future Disconnect account action applies the same operation explicitly to all its connections, not the entire provider.

Remove connection deletes its local alias/record only after native cleanup succeeds. Remove account removes that account, workspaces, owned connections and source associations after the two-phase barrier in the [architecture](acc-01-architecture.md). The confirmation names the exact local target and counts affected connections, states what local data will disappear and explains that the provider account remains. Default focus is Cancel. Retained aliases belonging to other accounts remain intact.

If cleanup fails, retain a static “Removal pending: monitoring cleanup could not be confirmed” state, keep reconnect disabled and offer an explicitly reviewed retry. Never close the dialog with a success announcement while cleanup is unverified. No account undo may restore consent or monitoring; a future Undo could restore presentation metadata only. Focus moves to the next surviving account action, then provider heading, then Accounts heading if the list is empty. Announce removal and any Overview filter reset.

## Responsive contract

| Width          | Acceptance intent                                                                                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 320 logical px | Single column. Provider/account headings wrap; aliases use `min-width: 0` and wrapping/ellipsis with full accessible text. Status/actions remain operable. Filters stack or use one labeled selector; no horizontal document scroll or nested horizontal chip scroller. Dialog stays within popup width. |
| 380 logical px | Default native popup. Compact account rows, connection sublists and vertically ordered detail sections. Alias, freshness and actions keep distinct reading order; no action hidden on hover.                                                                                                             |
| 420 logical px | Use additional room for full context and secondary status; preserve the same hierarchy and keyboard order. Do not introduce a different ownership/navigation model.                                                                                                                                      |

At all widths test short popup height, zoom/text scaling, 80-code-point Unicode names, duplicate aliases, multiple workspaces/keys and all empty/error/removing states. Main content scrolls vertically; headings and action menus do not trap content under fixed chrome. Dialog content scrolls within the viewport with visible Cancel/Save. Keep the current single `main` window and native sizing/monitor constraints. No new window or privileged desktop behavior. Real OS resize/focus/tray and monitor acceptance is separate from browser responsive checks.

## Keyboard, focus and accessibility

Use semantic headings/lists and existing accessible buttons, Bits UI menus/selects/dialogs. Tab order follows provider → account → connections → actions; do not make every decorative status badge focusable. Native buttons use Enter/Space, menus support arrows/Home/End and Escape, and filters use their standard select/listbox keyboard contract. No new global shortcut is required. Every icon action has a contextual accessible name; tooltip alone is insufficient.

When a menu or dialog owns Escape, it closes only that layer and restores its trigger. The popup's existing Escape-to-hide runs only after the event is unconsumed. Tab is contained within a modal, with visible focus and no unexpected provider request on focus. Loading uses a polite live region on the affected item; urgent errors are announced once, not on every clock tick. Mark invalid fields with `aria-invalid` and associated descriptions. Do not rely on accent color for connected/stale/error/Coming Soon meaning. Text and controls meet WCAG AA contrast and work at 200% text/zoom. Details and account switching announce the newly selected context before data.

## Appearance and future acceptance matrix

Appearance (`system`, `light`, `dark`) and palette (`graphite-jade`, `zinc-signal`) remain separate preferences. System follows OS changes without resetting selection, alias edits or dialog focus. Both palettes use semantic tokens for status, borders, surfaces, focus and text. Accent changes must not change status meaning. Respect reduced motion; skip decorative transitions and avoid value/layout jumps during updates. Use tabular numeric alignment without hiding unknown units.

ACC-04/UX-02 must exercise all state rows at 320/380/420px in each palette and light/dark appearance, then system light/dark switching, reduced motion, keyboard-only operation and a screen reader pass. Include rename save/cancel/validation, duplicate alias disambiguation, workspace/account/key switching, shared-source disclosure, auth expiry and cleanup failure. Capture browser evidence independently from owner native tray/dialog/focus checks. This matrix is a future acceptance requirement, not an ACC-01 pass claim. Native macOS/Linux interaction remains NOT RUN until suitable devices are available.
