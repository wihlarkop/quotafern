# ICON-01 · Original fern identity specification

Status: proposed separate design milestone. The current fern icon is provisional. UX-02A changes no browser favicon, application icon or tray asset. Owner visual selection and a separate implementation/review are required.

## Design brief

Create one recognizable fern identity across browser favicon, Windows/macOS/Linux app icons and high-contrast tray glyphs. It should suggest a quick, calm quota check through a living botanical form, without encoding a quota percentage, connection status or activity level into the icon.

Use original authored vector geometry, no external artwork, remote assets, stock logo or additional icon package. Keep a simple fern silhouette and generous negative space. Use Graphite & Jade for full-color application contexts; use true monochrome masks for system tray/template contexts. Provide light and dark surface proofs and 1×/2×/3× HiDPI exports. Do not animate the tray.

## Owner-selectable concepts

_Screenshot removed from current repository_

Editable SVG study (archived visual removed). The raster proof is drawn from the same original geometry at each stated size; this is a design study, not a browser screenshot or OS acceptance.

| Concept                         | Intended character                                                                             | Trade-off                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A · Upright frond (recommended) | A short upright stem with alternating pinnae; the most clearly botanical silhouette            | Needs optical stroke/leaf spacing adjustment at 16px rather than blind scaling |
| B · Unfurl                      | A young fern head with an open circular curl and two lower leaves; softer and more distinctive | At the smallest size the curl can read as a generic loop or magnifier          |
| C · Angled sprig                | A diagonal stem with sparse branching leaves; quiet and efficient                              | At 16px it looks more like a twig; weaker fern recognition than A              |

Recommendation is a design judgment for owner selection, not approval.

## Small-size evaluation

Evaluated the supplied actual-size light/jade and dark/monochrome raster proof visually on 25 October 2026. This is preliminary silhouette/readability review, not a user study, OS tray test or final pixel-hinted export acceptance.

| Size | A · Upright frond                                                          | B · Unfurl                                              | C · Angled sprig                                      |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| 16px | Stem and leaf tiers remain separable; thin tips need optical strengthening | Curl survives but dominates; fern identity is ambiguous | Stem survives; short branches resemble a twig         |
| 20px | Clear fern, useful negative space between tiers                            | Curl and two leaves become distinct                     | Branching is clear, still less recognizably fern-like |
| 24px | Comfortable botanical reading in both tones                                | Clear young-frond form                                  | Crisp and restrained; low visual mass                 |
| 32px | Strongest overall silhouette; enough room for refined asymmetry            | Distinctive curl with good separation                   | Clean silhouette, but more generic than A             |

A should proceed to pixel-hinted trials first if selected. At 16/20px, simplify the leaf count or strengthen stem/pinna strokes if necessary; do not use blur, tiny veins or shadows to compensate. Reserve at least one pixel of negative space between independent strokes at 1×. Tray variants must survive both light/dark taskbar backgrounds, forced high contrast and single-color template rendering; no color-only state meaning.

## Next milestone deliverables and acceptance

1. Owner chooses A, B or C, or requests a focused revision.
2. Produce a clean master vector, optical 16/20/24/32px monochrome glyphs and high-resolution color composition. Review clear space, alignment and dark/light treatment.
3. Prepare favicon SVG/ICO/PNG; Windows ICO sizes including 16/20/24/32/48/256; macOS ICNS/template mask; Linux PNG/SVG sizes required by the current Tauri bundler. Confirm exact packaging requirements during implementation.
4. Inspect 1×, 2× and 3× proofs without upscaling the displayed logical size; check edge alignment and no clipping. Test actual tray/taskbar/Dock/favicon contexts on available OSes. Check Windows high contrast and macOS template tinting with owner/native acceptance.
5. Submit a separate Draft PR containing only approved assets and required references, with source provenance and screenshots. No production replacement until owner visual approval. No animated tray icon.
