"""Offline ICON-01 asset compiler. Run with Python and Pillow 12.3.0.

Reads only repository-relative approved masks; never rewrites source artwork.
No runtime dependency or OS/theme access. Outputs neutral PNGs and static evidence.
"""

from pathlib import Path
import hashlib
import json

import PIL
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
DOC = ROOT / "docs/assets/icon-01"
TRAY = ROOT / "src-tauri/icons/tray"
SIZES = (16, 20, 24, 32)
SCALE = 8
FILL = (248, 249, 246)
EDGE = (23, 40, 34)
BACKGROUNDS = (
    ("Near white", (250, 250, 250)),
    ("Light gray", (214, 214, 214)),
    ("Medium gray", (128, 128, 128)),
    ("Dark graphite", (40, 44, 47)),
    ("Near black", (12, 12, 12)),
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def luminance(rgb):
    values = [v / 255 for v in rgb]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
    return sum(v * weight for v, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(a, b):
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def derive():
    rows = []
    for size in SIZES:
        source = TRAY / f"fern-dark-{size}.png"
        alpha = Image.open(source).convert("RGBA").getchannel("A")
        # Preserve the approved per-size mask and its padding. A radius-7 square
        # dilation at 8x gives a restrained 0.875px dark edge, including leaf gaps.
        mask = alpha.resize((size * SCALE, size * SCALE), Image.Resampling.LANCZOS)
        outline = mask.filter(ImageFilter.MaxFilter(15))
        edge = Image.new("RGBA", mask.size, EDGE + (0,))
        edge.putalpha(outline)
        interior = Image.new("RGBA", mask.size, FILL + (0,))
        interior.putalpha(mask)
        output = Image.alpha_composite(edge, interior).resize((size, size), Image.Resampling.LANCZOS)
        # Discard only the resampling fringe at the canvas boundary; retain a
        # fully transparent one-pixel exterior rather than clipping into a tile.
        exterior = output.getchannel("A")
        ImageDraw.Draw(exterior).rectangle((0, 0, size - 1, size - 1), outline=0, width=1)
        output.putalpha(exterior)
        destination = TRAY / f"fern-neutral-{size}.png"
        output.save(destination, optimize=False, compress_level=9)
        rows.append({
            "source": source.relative_to(ROOT).as_posix(),
            "source_sha256": sha256(source),
            "destination": destination.relative_to(ROOT).as_posix(),
            "sha256": sha256(destination),
            "dimensions": [size, size],
            "operation": "approved per-size alpha; LANCZOS 8x; MaxFilter(15) dark underlay; light alpha-composite; LANCZOS to target; clear 1px exterior alpha; PNG compression 9",
        })
    installed_path = DOC / "installed-assets.json"
    installed = json.loads(installed_path.read_text(encoding="utf-8"))
    installed = [row for row in installed if "fern-neutral-" not in row["destination"]]
    installed.extend(rows)
    installed_path.write_text(json.dumps(installed, indent=2) + "\n", encoding="utf-8")


def evidence():
    report = {"pillow": PIL.__version__, "scale": SCALE, "outline_radius_px": 7 / SCALE,
              "fill_rgb": FILL, "edge_rgb": EDGE, "backgrounds": []}
    sheet = Image.new("RGB", (1280, 1280), "#e9eeea")
    draw = ImageDraw.Draw(sheet)
    title = ImageFont.load_default(size=26)
    text = ImageFont.load_default(size=19)
    small = ImageFont.load_default(size=16)
    draw.text((28, 20), "ICON-01 / Tray contrast / Actual output pixels", font=title, fill="#173328")
    draw.text((28, 60), "Static composites only. Native visibility, DPI, caching and interactions remain NOT RUN.", font=text, fill="#173328")
    draw.text((28, 103), "Variant", font=text, fill="#173328")
    for i, size in enumerate(SIZES):
        draw.text((490 + i * 190, 103), f"{size}px", font=text, fill="#173328")
    for index, (label, background) in enumerate(BACKGROUNDS):
        y = 140 + index * 215
        draw.rounded_rectangle((24, y, 1256, y + 200), radius=12, fill=background)
        ink = "#172822" if luminance(background) > 0.3 else "#f8f9f6"
        draw.text((40, y + 12), f"{label} / #{bytes(background).hex()}", font=text, fill=ink)
        row = {"label": label, "rgb": background,
               "opaque_fill_ratio": round(contrast(FILL, background), 3),
               "opaque_edge_ratio": round(contrast(EDGE, background), 3), "rasters": []}
        for variant_index, (variant, caption) in enumerate((
            ("dark", "Previous: white"), ("light", "Previous: forest jade"), ("neutral", "New: light core + dark edge"))):
            top = y + 55 + variant_index * 46
            draw.text((40, top + 4), caption, font=text, fill=ink)
            for i, size in enumerate(SIZES):
                icon = Image.open(TRAY / f"fern-{variant}-{size}.png").convert("RGBA")
                assert icon.size == (size, size)
                composed = Image.alpha_composite(Image.new("RGBA", icon.size, background + (255,)), icon)
                sheet.paste(composed.convert("RGB"), (490 + i * 190, top))
                if variant == "neutral":
                    ratios = [contrast(rgb[:3], background) for rgb, source in zip(composed.get_flattened_data(), icon.get_flattened_data()) if source[3] > 0]
                    row["rasters"].append({"size": size, "visible_pixels": len(ratios),
                                           "pixels_ratio_ge_3": sum(v >= 3 for v in ratios),
                                           "peak_ratio": round(max(ratios), 3)})
        report["backgrounds"].append(row)
    draw.text((28, 1230), "No opaque tile. Antialiasing softens the 0.875px outline; 16px leaf gaps are less distinct.", font=small, fill="#173328")
    output = ROOT / ".tmp/qa/icon-01"
    output.mkdir(parents=True, exist_ok=True)
    sheet.save(output / "tray-contrast.png", optimize=False, compress_level=9)
    (output / "tray-contrast.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    derive()
    evidence()
    print("Derived four neutral tray sizes, updated installed hashes, wrote contrast sheet/metrics.")
