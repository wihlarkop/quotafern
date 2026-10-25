# Quotafern ICON-01 — first asset refinement (NOT YET APPROVED FOR PRODUCTION)

Selected owner reference: **Soft Ivory & Forest Jade**, the earlier white/ivory rounded-square tile with a dark green embossed fern. The original image is copied unchanged in `source/selected-original-soft-ivory-fern.png`.

## What is in the pack

- `source/quotafern-app-master-1024.png`: prepared tile master preserving the selected appearance, with transparent exterior corners.
- `tauri/src-tauri/icons/`: candidate file names and sizes matching current `src-tauri/tauri.conf.json` (32,128,256, icon.ico, icon.icns), plus 512 and 1024 master outputs.
- `web/`: favicon ICO and 16/32/48/64/180/192/512 PNG variants and apple-touch-icon. The production `index.html` currently does not declare a favicon and must be updated separately after approval.
- `tray/`: transparent dark-green glyph for light taskbars and white glyph for dark taskbars, at 16,20,24,32,48,64,128,256,512; traced SVG variants.
- `preview/icon-review-sheet.png`: large-to-small visual acceptance sheet.

The tray silhouette comes from color-segmented artwork rather than a hand-tuned vector original. It is deliberately flattened for small-size legibility. Small-size rendering, antialiasing, tray background/contrast and high-DPI behavior still require native Windows acceptance before replacement. Mac/Linux native visual checks are NOT RUN. Check the generated ICNS/ICO and platform packaging on actual builds; export availability does not mean successful platform integration.

Do not simultaneously write the production UI/icon files while UX-02A Codex work is in flight. Follow up with a dedicated ICON-01 branch and Draft PR only after owner visually approves this candidate.

## Current application

The current Tauri bundle has these expected paths (relative to `src-tauri`):

```json
{
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```

Default icon uses ivory across themes; **system tray** should use the monochrome symbol with theme-aware contrast, and a reliable fallback where OS-specific theme detection is not supported. Don't make tray glyph animate as part of ICON-01.

## Security / scope

No Tauri permissions, IPC, CSP, native provider access, credentials, authentication, model behavior, or live Codex gates are changed. These assets have not been applied to the repository and no release is authorized. No external licensed artwork is included; the visual reference is generated from our design session.

ICNS prepared: yes.
