# UX-02C · Multi-account interaction and navigation

25 October 2026. Baseline main `12826af477afc29cbc078fc8e413e976c01112cd`. Draft review delivery; no merge, release or deployment.

The production Svelte interface now preserves transient ACC-01 context across Accounts, Overview, Details and Settings. Accounts is a navigation surface: configured provider groups start expanded, their disclosure buttons support Enter/Space, account names open Overview, workspace links narrow ownership, and connection links open an eligible authoritative source's Details. Unsupported providers retain truthful Coming Soon explanations.

## Architecture and behavior

`src/lib/accounts/navigation.ts` contains the typed transient navigation/return contracts, stable-ID context options, complete-owner duplicate labels and Overview invalidation. App owns selection, Details target, provider disclosure and screen scroll positions above the unmounting tab panels. The domain's `accountsView`, `overviewView`, `detailsView` and ownership/lifecycle implementations remain authoritative and unchanged.

The existing native selector offers All Accounts, provider, account, workspace and connection contexts. Its full label is visible immediately below it and available through its title. Duplicate ordinals come from complete owning lists, including narrowed Details. Unicode aliases wrap without losing accessible names. No extra always-visible filter row or routing dependency is introduced.

While Details is open, the selector and its accessible description identify the Details target. The originating Overview filter remains separate in transient navigation state, so Back restores All Accounts, provider, account or workspace filtering exactly. Changing the selector exits Details. If its owner is removed, a disabled “Selection unavailable” option retains the missing target instead of displaying an unrelated filter.

Details always names its source and observing connection(s) before the readings. Quota, credits, spending, earned resets and the 84-day Activity calendar stay tied to that source. Shared verified sources appear once; unknown billing relationships remain explicitly unknown. A context change replaces the prior readings/grid synchronously and resets scrolling. No outgoing account values animate.

Back from an Overview source restores that source button and reading position. Back from an Accounts connection returns directly to its connection action. Accounts → Overview → Details supports two Back steps. If an originating control is hidden under a collapsed provider, focus returns to the disclosure; if removed, it returns to the context selector or Accounts heading. Ordinary tab visits preserve the selected context and reading position.

An invalid Overview filter becomes All Accounts with a polite announcement and does not reappear when records return. A retained Details target with a missing owner, unavailable source, disconnected connection or removal pending fails closed; Back is still available. Changing the Overview context exits Details. Demo OFF and reload discard transient navigation and synthetic records.

## Production screenshots

These are genuine compiled Svelte captures at 380 × 660. The capture helper checks the selected tab, linked visible panel, heading, finished transitions and settled highlight before saving. Source-browser captures of palettes and edge fixtures are supplemental; no prototype or native GUI claim is made.

| Accounts                                                   | Overview                                                   | Details                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| *Screenshot removed from current repository* | *Screenshot removed from current repository* | *Screenshot removed from current repository* |

Direct connection navigation: *Screenshot removed from current repository*

[Validation and reproduction](../validation/ux-02c.md) · [Focused review and dispositions](../reviews/ux-02c.md) · [Implementation plan](../plans/ux-02c.md).

## Deferred contracts

ACC-04 owns Add/Remove/Rename, aliases, account records, local metadata persistence, connection-management integration and native cleanup acknowledgements. UX-02C needs no approximation of those actions. A future coordinator must deliver sanitized ACC-01 state updates; current selection invalidation consumes those updates without granting authorization. No saved selection or return record may become monitoring consent.

Both live gates remain false. SEC-01/SEC-02, F4 startup policy and Unix forced-parent termination blockers remain open. Combined owner Windows native acceptance follows UX-02B, UX-02C, ACC-04 and ICON-01. macOS/Linux native interaction and actual screen-reader speech remain NOT RUN. The separate REL-01 documentation PR #11 is untouched.
