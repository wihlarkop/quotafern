# UX-02B · Account-aware production UI

25 October 2026. Base main: `b577eb66ff6159974d2335785538e990fe387105`. Draft PR delivery only; no merge, release, deployment or live activation.

The production Svelte interface now presents the approved Hybrid A+B account hierarchy through ACC-01 projections. The default remains disconnected. Explicit Demo shows independently named synthetic accounts, connections, source values and activity. Account management and persistent aliases remain deferred.

## Before and after

Before images are actual baseline Svelte components served by Vite at 380 × 660. After images below are from the compiled production bundle, served locally with no native bridge. They are browser evidence, not prototype images or native GUI acceptance.

| Screen       | Before                                       | Production after                             |
| ------------ | -------------------------------------------- | -------------------------------------------- |
| Overview     | _Screenshot removed from current repository_ | _Screenshot removed from current repository_ |
| Accounts     | _Screenshot removed from current repository_ | _Screenshot removed from current repository_ |
| Disconnected | _Screenshot removed from current repository_ | _Screenshot removed from current repository_ |

_Screenshot removed from current repository_

_Screenshot removed from current repository_

Full-content production captures temporarily expand only the browser popup height and scrolling for documentation; normal acceptance uses the unchanged bounded shell. No data or component markup is replaced: Accounts (archived visual removed), Overview (archived visual removed), Details (archived visual removed). These captures do not imply a taller native window.

## Ownership mapping

| Boundary                     | Presentation                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountsView`               | Provider → local account alias → optional workspace → connection alias. Separate connection lifecycle, verified/unverified identity, source freshness and static error text. Configured demo providers lead the catalog.                                         |
| `overviewView` + `Selection` | One compact transient selector for All, provider, account, workspace and eligible connection contexts. Every source retains provider/account/source IDs. No totals or arithmetic.                                                                                |
| `detailsView`                | Explicit account context plus one selected source. Funding, quota and activity use that same source. Missing/removing/mismatched ownership fails closed.                                                                                                         |
| Existing `CodexDetails`      | The `activityOnly` presentation option reuses its 84-day grid, exact date/token labels, zero/unknown semantics and arrow navigation. Only source-owned daily buckets are adapted; no activity summary is inferred. The dormant live presentation remains intact. |

Context changes synchronously discard selected Details and its grid. The grid is keyed by account, selected connection and source, so focused dates and tokens cannot survive a different owner. There is no cross-account content animation. Back keeps the Overview selection and restores the same source button, falling back to the selector if that opener disappears. Duplicate aliases receive visible and accessible ordinals; IDs remain selection keys.

Only the existing appearance and palette keys persist. The fixture, selection, aliases, consent and connection states stay in memory. Opening any view performs no provider request. Demo OFF shows no synthetic accounts or quota; Codex remains gated and all other providers remain Coming Soon. Add/Rename/Disconnect/Remove previews are explanatory text, not clickable lifecycle controls.

## Synthetic examples

`src/lib/accounts/demo.ts` supplies fixed valid ACC-01 opaque UUIDs. It is explicitly fictional, does not call an adapter, and does not authorize native sessions. Personal Codex has a current source and a separately labeled synthetic verified identity; Work has a stale source, unverified identity and the Studio workspace. Their quota windows and 84-day activity differ. OpenRouter Personal has independently named Personal Key and Project B Key connections; their observations have unknown billing relationships and are never added.

The development-only scenario selector also covers one account, two Codex accounts, two keys, a verified shared source shown once through either key, errors/auth expiry, 80-code-point-compatible long Unicode aliases, duplicate names with different IDs, removal pending and no accounts. Release Demo uses the multiple-account example. No synthetic records are stored as user connections.

[Validation and complete screenshot index](../validation/ux-02b.md) · [Independent review and dispositions](../reviews/ux-02b.md) · [Implementation plan](../plans/ux-02b.md).

## Deferred work

UX-02C owns advanced filtering and interactions. ACC-04 owns Add/Rename/Disconnect/Remove, local account management and persistence review. SEC-01/SEC-02, F4 startup safety and Unix forced-parent-termination blockers remain open. Windows combined native acceptance follows ICON-01, UX-02B/C and ACC-04; macOS/Linux native interaction remains **NOT RUN** until devices are available. Native compilation and browser screenshots do not close those gates.

## Screenshot timing correction

The final captures now wait for real tab transitions and assert selected tab, linked visible panel, heading and settled highlight. The prior Overview/Accounts visual mismatch was a mid-transition capture, not a runtime selection defect. [Frame diagnosis and updated validation](../validation/ux-02b.md#final-screenshot-consistency-follow-up). Production animation and reduced-motion code remain unchanged.
