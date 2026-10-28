# QA tools and historical evidence

The local browser check implementations live under `qa/browser/<milestone>/`. The UX-01 isolated design prototype lives under `qa/prototypes/ux-01/`. Source icon derivation is in `qa/assets/icon-01/`.

Run source/production UI checks using `bun run scripts/run-ui-check.ts <browser|production> <playwright-session> <ux-02b|ux-02c|acc-04>` after starting the corresponding localhost server and Playwright CLI session. See the matching [validation records](../docs/validation/).

Generated screenshots are written to ignored `.tmp/qa/screenshots/`; current run result JSON goes to ignored `.tmp/qa/results/`. Older committed result JSON is retained in `docs/evidence/` for historical reproduction. Do not commit regenerated gallery screenshots by default.

No QA script may read real provider credentials or enable Codex live gates.

## UX-03

Start `bun run dev --port 4177`, then run `bun run qa:ux03 source`. For the bundled route, run `bun run build`, start `bun run preview --port 4178`, then run `bun run qa:ux03 production`. The Bun runner opens and closes its own named Playwright CLI session and creates isolated browser contexts. It requires the existing Playwright CLI/Chromium runtime; it adds no app dependency.

`qa/browser/ux-03/fixture.js` supplies a fake Tauri IPC port and synthetic account/plan/quota values; it never enters the app bundle. HTTP requests outside loopback are blocked. The fixture clock advances only to exercise the unchanged cooldown. Existing controller rules still require stopping one connection before another connection to the same account can start.

The two result JSON files record assertions and capture paths. Five canonical after views per mode are saved in `docs/evidence/ux-03/` for the explicitly requested comparison; additional state captures go to ignored `.tmp/qa/screenshots/ux-03/`. See [validation](../docs/validation/ux-03.md). The release demo uses its fixed multi-account scenario, so the development-only shared-source fixture contributes two additional source-browser assertions.

## UX-03B (current)

The same `bun run qa:ux03 source` and `bun run qa:ux03 production` commands now include UX-03B. Start the same source/preview servers on 4177/4178. Current results and six canonical captures per mode are written to `docs/evidence/ux-03b/`; additional captures go to ignored `.tmp/qa/screenshots/ux-03b/`. Old UX-03 results remain historical; use commit `1f3ce659a6aff771ba88868c6cf5694f94a3bb12` to reproduce that exact earlier UI.

Current checks add 380×660/320px Add radios/cancellation, compact Appearance-first Settings and storage feedback, Demo warning/cleanup failure/no reconnect, 1/3/24 grouped account choices, advanced context recovery, and View quota → Overview → Back focus/scroll. See [UX-03B validation and owner Windows checklist](../docs/validation/ux-03b.md). All providers/credentials/IPC remain synthetic during developer verification.

## UX-03C (current)

The same source/production commands now validate direct focused quota details as well as the existing flows. Results and four canonical views per mode go to `docs/evidence/ux-03c/`; other captures go to ignored `.tmp/qa/screenshots/ux-03c/`. Use `e2307da2dee61a79031aaea49da9d8a788048724` to reproduce UX-03B exactly.

Focused checks cover one/multiple/shared/zero sources, pinned-source disappearance, direct Back with scroll/focus, normal Overview by mouse/keyboard, optional diagnostics and 320px dark mode. The fixture clock advances only to exercise existing automatic refresh with fake IPC; this does not change production polling. [Evidence and limits](../docs/validation/ux-03c.md).
