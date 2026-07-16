# Generates the Bukit Pennies brand assets — a hill built out of pennies on a
# white background — into apps/mobile/assets/. Art is drawn on a 64x64 grid
# and upscaled nearest-neighbor so the fat pixels stay crisp.
#
#   python scripts/make-brand-assets.py
from PIL import Image, ImageDraw

GRID = 64
WHITE_BG = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
WHITE = (255, 255, 255, 255)

# Penny (gold) ramp.
P_OUT = (94, 56, 12, 255)     # outline
P_D = (191, 128, 22, 255)     # shaded side
P_M = (240, 176, 42, 255)     # face
P_L = (255, 214, 92, 255)     # light
P_XL = (255, 241, 168, 255)   # glint


def draw_penny(d, cx, cy, r, mono=None):
    """Face-on coin: outline, bright face, engraved rim ring, small highlight."""
    if mono:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=mono)
        return
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=P_OUT)
    d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=P_M)
    # engraved rim ring (1px, inset)
    d.ellipse([cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3], outline=P_D, width=1)
    # inner face slightly lighter than the rim band
    d.ellipse([cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4], fill=P_L)
    d.ellipse([cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5], fill=P_M)
    # top-left shine
    d.line([cx - 3, cy - r + 2, cx - r + 2, cy - 3], fill=P_XL, width=1)
    d.point((cx - r + 2, cy - 2), fill=P_XL)


# Hill rows: (pennies, center y, x-jitter per coin) — slight jitter and varied
# radii so the pile reads as a grown mound, not a rigid pyramid. Top row is
# drawn first so nearer pennies overlap the ones behind.
ROWS = [
    (1, 20, [1]),
    (2, 28, [-1, 1]),
    (3, 37, [0, -1, 1]),
    (4, 46, [1, 0, -1, 0]),
    (5, 54, [0, 1, 0, -1, 0]),
]
RADIUS = [5, 6, 6, 6, 6]
SPACING = 12.0


def scene(background: bool, mono: str | None = None) -> Image.Image:
    img = Image.new("RGBA", (GRID, GRID), WHITE_BG if background else CLEAR)
    d = ImageDraw.Draw(img)
    m = WHITE if mono else None
    for (count, cy, jitter), r in zip(ROWS, RADIUS):
        left = GRID / 2 - (count - 1) * SPACING / 2
        for i in range(count):
            draw_penny(d, round(left + i * SPACING + jitter[i]), cy, r, mono=m)
    return img


def save(img: Image.Image, path: str, size: int):
    img.resize((size, size), Image.NEAREST).save(path)
    print(f"wrote {path} ({size}x{size})")


def padded(img: Image.Image, content_frac: float) -> Image.Image:
    """Center the 64-grid art inside a larger transparent canvas (adaptive
    icons keep content inside the middle ~66% safe zone)."""
    canvas_px = round(GRID / content_frac)
    canvas_px += canvas_px % 2
    out = Image.new("RGBA", (canvas_px, canvas_px), CLEAR)
    off = (canvas_px - GRID) // 2
    out.paste(img, (off, off))
    return out


if __name__ == "__main__":
    import os
    assets = os.path.join(os.path.dirname(__file__), "..", "apps", "mobile", "assets")

    # Full-bleed app icon (iOS masks its own corners): penny hill on white.
    save(scene(background=True), os.path.join(assets, "icon.png"), 1024)

    # Android adaptive: transparent foreground (safe-zone padded), flat white
    # background, white monochrome silhouette.
    fg = padded(scene(background=False), content_frac=0.58)
    save(fg, os.path.join(assets, "android-icon-foreground.png"), 1024)
    bg = Image.new("RGBA", (GRID, GRID), WHITE_BG)
    save(bg, os.path.join(assets, "android-icon-background.png"), 1024)
    mono = padded(scene(background=False, mono="white"), content_frac=0.58)
    save(mono, os.path.join(assets, "android-icon-monochrome.png"), 1024)

    # Splash mark (transparent) + web favicon.
    save(padded(scene(background=False), content_frac=0.8), os.path.join(assets, "splash-icon.png"), 1024)
    save(scene(background=True), os.path.join(assets, "favicon.png"), 64)
