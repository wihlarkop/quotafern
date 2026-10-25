# ICON-01 — approved brand asset integration

The owner approved **Soft Ivory & Forest Jade** in the ICON-01 integration request on 2026-10-25 (Asia/Jakarta). This supersedes the pack README's earlier provisional approval language. This is source integration for a Draft PR; packaged release and native visual acceptance are not authorized by this change.

## Scope and baseline

- Base: verified `origin/main` = `87ce072f95300d362a08c15b8852e7c8d51272cf` after fetching `main`.
- Branch: `codex/icon-01-approved-brand`, dedicated managed worktree.
- PR #8 (`codex/ux-02a-soft-native`) was read only for isolation evidence: HEAD `49162f948311470b0e02dbf9274633940e848ef0`, clean worktree at initial observation. Its worktree, branch and changes are outside ICON-01.
- No new design, generated artwork, alternative icon study, runtime dependency, credential access or live provider access.
- The current session's requested lead model/effort cannot be independently verified. One requested GPT-6 Luna / High worker is used only for final read-only review; the configured worker identifier is recorded, without claiming backend identity attestation.

## Asset provenance and inventory

`ICON_ASSET_ROOT = C:\Users\Edo\Downloads\Videos` (the owner's actual extracted folder). The ZIP itself was not present in that folder; this work verifies the supplied extracted files, not an unavailable ZIP checksum or a vendor signature.

[Source inventory](source-inventory.json) lists all **41 supplied files**, byte lengths, SHA-256 hashes, decoded formats/dimensions/modes, alpha ranges, ICO entries, ICNS chunks/sizes and tray RGB values. [Installed asset inventory](installed-assets.json) maps all **24 installed assets** to exact source paths, destination hashes and operations. Hashes identify the inspected bytes; they are not independent proof of authorship.

All supplied PNG chunk CRCs and complete IEND boundaries were checked. PNGs decoded successfully, production PNGs are RGBA with both transparent and opaque pixels, and tray files have a single visible RGB color plus antialiasing alpha. Every ICO representation and advertised ICNS representation decoded with the bundled Pillow runtime; directory/chunk lengths and bounds were checked. This offline verification added no project dependency.

- App ICO sizes: 16, 24, 32, 48, 64, 128, 256px.
- Web ICO sizes: 16, 32, 48px.
- ICNS decoded representations: 32, 64, 128, 256, 512, 1024px, including the pack's advertised Retina representations.
- Original selected reference: 1254×1254 RGB, intentionally opaque; master: 1024×1024 RGBA with transparent exterior corners.
- Historical [pack README](source/asset-pack-README.md) is a text copy formatted by Oxfmt; its original byte hash remains in the source inventory. All copied image files retain exact source bytes.

## Integration

Application: copied `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns`, `icon.png`, and `icon-512.png` from `tauri/src-tauri/icons/`. The 512px PNG is added to the existing Tauri bundle icon list for larger Linux representations. The existing `64x64.png` is the only artwork regenerated: a Pillow LANCZOS resize exclusively from the approved 1024px RGBA master. App name, identifier, version and package configuration remain unchanged.

Existing `StoreLogo.png` and `Square*Logo.png` resources have no references in the application/bundle configuration and are left unchanged. They are not substituted blindly with app-tile artwork; any future Store packaging needs its own resource review.

Tray: Rust now embeds `icons/tray/fern-dark-32.png` rather than `icons/32x32.png`. Pack filenames describe their **intended background**: `fern-dark-*` is a white glyph for dark taskbars, and `fern-light-*` is a forest-jade glyph for light taskbars. Both approved variants at 16/20/24/32px are retained unchanged for review; only the 32px white glyph is embedded.

The owner explicitly selected **white fern for dark taskbars** as the fixed Windows/Linux fallback during this task. Tauri's window theme is not used to infer shell theme: its Windows backend reads `AppsUseLightTheme`, which need not match taskbar appearance. No registry access, new theme detector, preference or permission is added. White-on-light contrast is a known limitation, demonstrated below, and is not claimed to pass. Linux panels vary too. This reviewed fallback is static; there is no animation, polling or theme switching. On macOS, the existing Tauri `icon_as_template` API delegates menu-bar contrast to AppKit; actual native results remain NOT RUN.

The Rust diff changes only the embedded image and template builder flag, plus explanatory comments. Tray click/Show/Hide/Quit handlers, anchors, single-instance behavior, process cleanup and popup lifecycle are unchanged.

Browser: Vite copies local files from `public/` to `dist/`. `index.html` declares `/favicon.ico`, 16px and 32px PNG icons, and the 180px Apple Touch Icon. No web manifest, service worker or external resource is added. Built-output paths and bytes are checked separately from browser cache behavior.

## Actual asset comparison

![Baseline and approved application icons, tray variants at actual sizes, and favicon](before-after.png)

This is a static composition of actual baseline and supplied image bytes, not a native application screenshot. Tray glyphs appear at actual 16/20/24/32px sizes, including both matching and mismatched backgrounds. Only the large app comparison and the Apple icon thumbnail are resized for the sheet. The baseline had no declared favicon.

The unchanged [owner-supplied review sheet](pack-review-sheet.png) retains its historical provisional label; the current owner's approval is recorded above.

## Verification evidence

Frontend and Rust commands use repository package scripts and Bun 1.4.4. No unit-first workflow was used.

| Check                                                                | Result                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Locked `bun install --frozen-lockfile`                               | PASS; Bun 1.4.4                                                                                 |
| Supplied PNG/ICO/ICNS decode, dimensions, transparency and structure | PASS; offline static assets only                                                                |
| Copied-image SHA-256 identity and generated 64px provenance          | PASS; inventories above                                                                         |
| Frontend baseline regression                                         | PASS; 12 groups / 827 assertions                                                                |
| `bun run regression` with ICON-01 static checks                      | PASS; 13 groups / 955 assertions                                                                |
| `bun run lint`                                                       | PASS                                                                                            |
| `bun run fmt:check`                                                  | PASS; final documentation checked                                                               |
| `bun run build` (includes Svelte/TypeScript diagnostics)             | PASS; 0 errors / 0 warnings                                                                     |
| Built favicon references and byte equality                           | PASS; all four built links resolve to byte-identical local assets                               |
| `bun run fmt:rust`                                                   | PASS                                                                                            |
| `bun run lint:rust`, `bun run check:rust`                            | PASS on Windows                                                                                 |
| `bun run regression:rust`                                            | PASS; final Windows run: 55 passed / 4 ignored fixture entry points / 0 failed                  |
| `bun run build:desktop --no-bundle`                                  | PASS; Windows optimized release executable compiled; no native GUI launch                       |
| Permission/CSP/dependency/security gate diff                         | PASS; protected owning files unchanged; both live gates remain false                            |
| Independent final source review                                      | PASS; configured GPT-6 Luna / High; no Critical/Important/Minor findings; no declined judgments |
| Exact-HEAD hosted frontend + Windows/macOS/Linux CI                  | Pending Draft PR creation; owner requested no wait for hosted CI                                |

The new Bun asset regression checks installed hashes, PNG headers, ICO/ICNS container bounds, bundle paths, local Vite links and separation of tray glyph from app tile. The one-time Pillow verification additionally decoded the representations and checked PNG CRCs/transparency. Neither proves shell rasterization, contrast at system scaling, icon caches or platform packaging.

## Deferred native acceptance — carried forward

By explicit owner decision, combined Windows native acceptance occurs **after ICON-01, UX-02B/C and ACC-04**. These checks do not block the architecture-independent icon Draft PR. Do not mark them passing on the strength of compilation, static contact sheets or synthetic tests.

| Acceptance                                                  | Status  | Required follow-up                                                                              |
| ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| Windows notification-area visibility on light/dark taskbars | NOT RUN | Confirm selected white fallback; record light-taskbar limitation and any approved follow-up     |
| Actual Windows taskbar/application icon                     | NOT RUN | Inspect the native executable and shell presentation                                            |
| Windows DPI scaling and system icon caching                 | NOT RUN | Test relevant DPI/monitor combinations and refreshed shell caches                               |
| Native popup interactions after UI integration              | NOT RUN | Recheck tray click, Show/Hide/Quit, anchors, focus and repeated launches with UX-02B/C + ACC-04 |
| macOS menu-bar template and application icon                | NOT RUN | Inspect real macOS light/dark menu bar and app shell                                            |
| Linux panel/tray and desktop icon appearance                | NOT RUN | Inspect supported panel/desktop environments and static fallback contrast                       |
| ICO/ICNS packaged installer/application integration         | NOT RUN | Check platform packaging after acceptance; no release authorized                                |
| Browser/Apple device favicon cache/selection behavior       | NOT RUN | Static Vite output verified separately; no browser/device rendering claim                       |

## Security boundaries

`LIVE_CONNECTION_ENABLED = false` and `CODEX_CONNECTION_AVAILABLE = false` remain unchanged. Codex/authentication, process/protocol/lifecycle ownership, native commands, permissions, capabilities, release/development CSP, telemetry, persistence, provider behavior, polling and all lockfiles/dependency manifests are outside this change. Existing F4 startup-policy and Unix forced-parent-termination blockers, and SEC-01/SEC-02 gates, remain explicit in their owning source/docs.

No real authenticated acceptance, credentials, provider requests, merge, deployment or release was performed.

## Changed files and delivery

The [complete changed-file list](changed-files.txt) records the source/asset/evidence scope. The [installed asset inventory](installed-assets.json) gives every copied/generated destination. Additional changes are `index.html`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `scripts/icon-regression.ts`, `scripts/regression.ts`, this evidence file, the two inventories, and `before-after.png`.

The Draft PR description records the immutable exact HEAD and latest observed hosted CI status, avoiding a self-referential commit hash in this file. Keep the managed worktree for owner review. Stop after Draft PR delivery; do not merge, deploy, release or start another UX stage.
