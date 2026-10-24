# UX-01 validation evidence

Date: 25 October 2026 (Asia/Jakarta). Baseline: `8d8f6b4186ac9fd5e4978b1f34c9ec8445f32dcd`. All preview data are fixed synthetic examples. No provider was contacted.

## Reproduction and source isolation

```powershell
bun install --frozen-lockfile
bun run dev:ux
# Open http://127.0.0.1:4174/
```

Locked installation used Bun 1.4.4. The Bun server serves only the five named artifact routes, binds loopback and denies browser connections with its own preview-only CSP. The production Tauri CSP is unchanged. No dependencies, lockfiles, native source, permissions, production source or workflow are modified. Only `dev:ux` and `lint:ux` are added to package scripts.

The prototype has no imports of the production application, ACC-01 runtime or native bridge. Inspection found no browser fetch/WebSocket, storage, Tauri/invoke or credential APIs in the preview. `serve.ts`'s `fetch(request)` is the loopback HTTP handler, not a provider request. Production `dist` contained none of the UX-01 name, artifact path or preview heading. The production source entry and build remain unchanged.

## Frontend validation

| Command                             | Observed result                                      |
| ----------------------------------- | ---------------------------------------------------- |
| `bun install --frozen-lockfile`     | Passed, committed lockfile unchanged                 |
| `bun run fmt` / `bun run fmt:check` | Passed; final artifact formatting check clean |
| `bun run lint:ux`                   | Passed, isolated source lint                         |
| `bun run lint`                      | Passed, production lint                              |
| `bun run check`                     | Passed, 0 Svelte errors / 0 warnings                 |
| `bun run regression`                | Passed, 12 groups, 827 assertions, 0 failures        |
| `bun run build`                     | Passed; production bundle excludes preview           |
| Impeccable detector                 | `[]`, no findings on HTML/CSS/JS                     |

No new unit suite was added for the throwaway prototype. Existing feature/security regression checks ran unchanged. Rust commands were not rerun locally because no native source/configuration changed. The baseline's hosted Linux, Windows and macOS desktop jobs all passed.

## Actual browser rendering

Captured using the Codex in-app browser on Windows, with its Chromium engine. This is browser rendering evidence, not a native Tauri run. Files are original JPEG browser screenshots; no generated UI illustrations, compositing or image edits were used.

The comparison viewport is 1360 × 1000; each proposed popup frame is exactly 380px wide. The 420px comparison uses a 1440 × 1000 viewport so all three frames fit side by side. `Full content` exposes the complete long view for review; this is not a proposed native window height. Short captures use fixed 480px popup heights with internal content scrolling.

| Capture                                                                                         | What it verifies                                                                                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Baseline disconnected](screenshots/baseline-disconnected-380.jpg)                              | Unchanged product in actual 380 × 660 browser viewport; live gate closed                                                   |
| [Overview light](screenshots/overview-light-380.jpg), [dark](screenshots/overview-dark-380.jpg) | A/B/C, independent windows, resets, stale/current, API billing separation                                                  |
| [Accounts light](screenshots/accounts-light-380.jpg), [dark](screenshots/accounts-dark-380.jpg) | Complete multi-account groups, workspace, two named key connections, mixed statuses, future actions                        |
| [Details light](screenshots/details-light-380.jpg), [dark](screenshots/details-dark-380.jpg)    | Scoped funding, resets, quotas and complete 84-day calendar                                                                |
| [Settings light](screenshots/settings-light-380.jpg), [dark](screenshots/settings-dark-380.jpg) | Independent appearance/palette, explicit demo, unchecked unavailable Remember option                                       |
| [320px Unicode Accounts](screenshots/accounts-unicode-light-320.jpg)                            | Three full-width 320px frames, wrapped long Unicode alias                                                                  |
| [420px Details](screenshots/details-dark-420.jpg)                                               | Three 420px frames, contextual account and readable heatmap                                                                |
| [320px / 480px Overview](screenshots/overview-short-dark-320.jpg)                               | Bounded short-height content region, persistent navigation/footer                                                          |
| [380px / 480px Activity](screenshots/activity-short-dark-380.jpg)                               | Calendar scrolled into view; sticky selected-account context stays visible                                                 |
| [Jade dark Accounts](screenshots/accounts-jade-dark-380.jpg)                                    | C's ledger/tree grammar also works with jade; same semantics                                                               |
| [Rename at 320px](screenshots/rename-320.jpg)                                                   | Native HTML modal with context, labeled field, counter and validation feedback; dialog constrained to selected popup width |

The rename screenshot uses the wide review viewport; “320” names the selected popup width, not the entire screenshot width. The modal measured 294px client width within that constraint. The surrounding toolbar is a review instrument and does not belong to the proposed app.

## Responsive measurements

Read-only DOM measurements compared `.content.scrollWidth` with `.content.clientWidth`, including descendants; hidden horizontal overflow would still increase `scrollWidth`. No CSS scale transforms were used to claim narrow-width acceptance.

- [Layout matrix](evidence/layout-matrix.json): 72 review configurations × 3 directions = **216 compositions**. Four surfaces × three popup widths × light/dark × direction-default/jade/zinc. No measured horizontal overflow.
- [Fixture matrix](evidence/fixture-matrix.json): 432 configurations × 3 directions = **1,296 compositions**. All 18 fixtures × four surfaces × three widths × light/dark, direction-default palettes, 480px short height. No measured horizontal overflow. Both palette families are represented simultaneously by direction defaults.
- [Narrow browser viewports](evidence/narrow-viewport.json): actual 320/380/420px browser widths with a long Unicode account. Document and content had no horizontal overflow. Browser page and popup scrollbars reduce the interior width in this wrapper; fixed-width frame evidence is the comparison matrix above.
- [Full-capture measurements](evidence/capture-metrics.json): actual rendered widths/heights for the eight principal screenshots. Multi-account Overview heights at 380px: A 1,516px, B 1,409px, C 1,403px. Complete Accounts heights: A 1,533px, B 1,527px, C 1,505px. These are full-document design measurements, not native performance metrics.

The preview provides 18 explicitly synthetic fixtures: no accounts, single account, two accounts, multiple keys, mixed connections, auth required, source error, stale/current, unknown quota/reset, low/critical quota, verified shared source, unknown billing relationship, duplicate aliases, long Unicode, removal pending, Coming Soon, explicit Demo and the combined multi-account composition. Calendar zero/unknown are present in every available Codex activity fixture.

## Focus, semantics and accessibility

Observed through actual control interactions and DOM state:

| Scenario                       | Result                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Duplicate account aliases      | Separate account 1/account 2 labels and stable preview IDs; rename does not merge them                                   |
| Rename initial focus           | Focused and selected the complete alias in `alias-input`                                                                 |
| Empty / 81-code-point alias    | Rejected with associated inline alert and `aria-invalid=true`                                                            |
| Unicode rename                 | Saved `仕事用 · Équipe 🌿`; the other account's alias remained separate                                                  |
| Save focus return              | Returned to `rename-account-personal`; its disclosure reopened                                                           |
| Escape in rename               | Closed only the dialog; preserved saved alias and returned to trigger                                                    |
| Details Personal → Work        | Work heading, 18% / 7% windows and Work-specific activity; no Personal quota retained                                    |
| Unavailable Details            | 0 meters and 0 day buttons; explicit unavailable selection                                                               |
| Calendar ArrowRight            | Day 0 → day 7; date/count readout updated                                                                                |
| Calendar End                   | Focused day 83; exactly one day remained in the Tab order                                                                |
| Calendar zero vs unknown       | Solid outlined confirmed zero vs dashed unknown; date/count available without color inference                            |
| Key filter on verified billing | Source ID remained `router-shared`; exactly one balance source before/after                                              |
| Disconnect one shared key      | One source and 24.80 provider credits remained through the other key; disconnected key lost its link                     |
| Unknown billing Details        | Two distinct key observations, no total or inferred shared authority                                                     |
| Long Details scroll            | At 480px height the main region scrolled; selected-account context stayed at its top and calendar focus remained visible |

The calendar uses roving focus with day/week arrows and Home/End. The preview adds explicit Tab/Shift+Tab boundary handling to its native HTML dialogs; actual browser checks confirmed both wraps stay inside the modal. Native selects retain standard keyboard behavior. Disclosures use Enter/Space and local Escape handling. Decorative status badges are not Tab stops. The preview has no native Escape-to-hide path; production layer arbitration remains unchanged and requires UX-02/native acceptance.

[Computed contrast](evidence/contrast.json) checks seven semantic text/accent tokens against four relevant background tokens in both palettes and appearances: 112 pairs, minimum **5.34:1**, none below 4.5:1. This checks token pairs, not every rendered glyph, browser-native control, disabled control or heatmap intensity distinction. Unknown/zero calendar shapes and textual readouts carry meaning alongside color.

Follow System resolved the browser's current OS preference and is wired to media-query changes. Live OS theme changes were not forced. The prototype has no nonessential animation and contains a reduced-motion override; changing the OS reduced-motion preference was not performed. Source/DOM review supports these implementations, not full OS-event acceptance.

The [Follow System capture](screenshots/settings-system-380.jpg) records all three concepts resolving the observed light OS preference. The [standard handoff comparison](screenshots/comparison-standard-light-380.jpg) shows the three bounded 380 × 660px frames. These two additional captures were inspected by the parent after the independent review's initial 15-image pass.

## Independent review and limits

One independent GPT-6 Luna / High review is recorded in [review.md](review.md). Its disposition applies to the design artifacts at the reviewed scope, not owner approval for production. No final design direction has been selected.

**NOT RUN:** screen-reader interaction, 200% browser zoom/text scaling, live OS theme/reduced-motion switching, Tauri rendering, native dialogs, tray Show/Hide/Quit, popup Escape-to-hide integration, monitor/DPI changes, macOS/Linux native interaction and authenticated provider acceptance. Browser layout and token measurements are not claims of WCAG certification or OS compatibility.

**Deferred unchanged:** F4 startup policy, Unix forced-parent-termination containment, multi-session coordinator, native credential lifecycle and SEC-01/SEC-02 enablement gates. Both connection flags remain false. No merge, deployment or release is part of UX-01.

Baseline [CI run 40122268111](https://github.com/wihlarkop/quotafern/actions/runs/40122268111): **4/4 passed**, exact baseline SHA above. UX-01 hosted CI, exact final HEAD and Draft PR identity are recorded in the PR delivery metadata to avoid a self-referential commit hash inside this file.
