# QA tools and historical evidence

The local browser check implementations live under `qa/browser/<milestone>/`. The UX-01 isolated design prototype lives under `qa/prototypes/ux-01/`. Source icon derivation is in `qa/assets/icon-01/`.

Run source/production UI checks using `bun run scripts/run-ui-check.ts <browser|production> <playwright-session> <ux-02b|ux-02c|acc-04>` after starting the corresponding localhost server and Playwright CLI session. See the matching [validation records](../docs/validation/).

Generated screenshots are written to ignored `.tmp/qa/screenshots/`; current run result JSON goes to ignored `.tmp/qa/results/`. Older committed result JSON is retained in `docs/evidence/` for historical reproduction. Do not commit regenerated gallery screenshots by default.

No QA script may read real provider credentials or enable Codex live gates.
