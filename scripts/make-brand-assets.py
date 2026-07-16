# Generates the Bukit Pennies pixel-art brand assets (gold coin rising over a
# green hill) into apps/mobile/assets/. Art is drawn on a 64x64 grid and
# upscaled with nearest-neighbor so the fat pixels stay crisp.
#
#   python scripts/make-brand-assets.py
from PIL import Image, ImageDraw

GRID = 64
SCALE = 16  # 64 * 16 = 1024

# Greens (brand #0E7C66 ramp) and golds.
G_OUT = (7, 46, 38, 255)      # darkest — outlines
G_D = (10, 90, 74, 255)       # hill shadow
G_M = (14, 124, 102, 255)     # brand green (sky)
G_L = (46, 145, 121, 255)     # horizon band
G_XL = (123, 196, 169, 255)   # sparkle / rim light
Y_OUT = (122, 74, 18, 255)    # coin edge shadow
Y_D = (201, 138, 27, 255)
Y_M = (242, 179, 44, 255)
Y_L = (255, 215, 94, 255)
Y_XL = (255, 243, 176, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def circle(d, cx, cy, r, fill):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def draw_coin(d, cx, cy, r, mono=None):
    """Coin with rim, face, '$' glyph, and a specular glint."""
    if mono:
        circle(d, cx, cy, r, mono)
        return
    circle(d, cx, cy, r, G_OUT)          # outline
    circle(d, cx, cy, r - 1, Y_OUT)      # edge shadow
    circle(d, cx, cy, r - 2, Y_M)        # rim
    circle(d, cx, cy, r - 4, Y_D)        # inset ring
    circle(d, cx, cy, r - 5, Y_M)        # face
    # top-left face light
    d.ellipse([cx - r + 5, cy - r + 5, cx + 1, cy + 1], fill=Y_L)
    # $ glyph (7 wide x 11 tall), pixel rows
    glyph = [
        "..XXX..",
        ".XXXXX.",
        "XX.X.XX",
        "XX.X...",
        ".XXXX..",
        "..XXXX.",
        "...X.XX",
        "XX.X.XX",
        ".XXXXX.",
        "..XXX..",
    ]
    gx, gy = cx - 3, cy - 5
    for row, line in enumerate(glyph):
        for col, ch in enumerate(line):
            if ch == "X":
                d.point((gx + col, gy + row), fill=Y_OUT)
    # specular glint on the rim
    d.point((cx - r + 3, cy - r + 6), fill=Y_XL)
    d.point((cx - r + 4, cy - r + 5), fill=Y_XL)
    d.point((cx - r + 5, cy - r + 4), fill=Y_XL)
    d.point((cx - r + 4, cy - r + 4), fill=WHITE)


def draw_hill(d, horizon, mono=None):
    """Rounded hill silhouette across the lower part of the grid."""
    if mono:
        d.ellipse([-18, horizon, GRID + 18, GRID + 26], fill=mono)
        return
    d.ellipse([-18, horizon - 1, GRID + 18, GRID + 25], fill=G_OUT)  # outline crest
    d.ellipse([-18, horizon + 1, GRID + 18, GRID + 27], fill=G_D)
    # crest highlight following the curve
    d.arc([-18, horizon + 2, GRID + 18, GRID + 28], start=200, end=340, fill=G_L, width=2)


def draw_sparkle(d, x, y, color):
    d.point((x, y), fill=WHITE)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        d.point((x + dx, y + dy), fill=color)


def scene(background: bool, mono: str | None = None) -> Image.Image:
    img = Image.new("RGBA", (GRID, GRID), CLEAR)
    d = ImageDraw.Draw(img)
    horizon = 42
    if background:
        d.rectangle([0, 0, GRID, GRID], fill=G_D)  # base under the hill
        d.rectangle([0, 0, GRID, horizon], fill=G_M)
        d.rectangle([0, horizon - 8, GRID, horizon], fill=G_L)  # horizon glow
    m = WHITE if mono else None
    draw_hill(d, horizon, mono=m)
    draw_coin(d, GRID // 2, 24, 15, mono=m)
    if background and not mono:
        draw_sparkle(d, 10, 12, G_XL)
        draw_sparkle(d, 54, 18, G_XL)
        draw_sparkle(d, 47, 7, G_XL)
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

    # Full-bleed app icon (iOS masks its own corners).
    save(scene(background=True), os.path.join(assets, "icon.png"), 1024)

    # Android adaptive: transparent foreground (safe-zone padded), flat
    # brand-green background, white monochrome silhouette.
    fg = padded(scene(background=False), content_frac=0.58)
    save(fg, os.path.join(assets, "android-icon-foreground.png"), 1024)
    bg = Image.new("RGBA", (GRID, GRID), G_M)
    save(bg, os.path.join(assets, "android-icon-background.png"), 1024)
    mono = padded(scene(background=False, mono="white"), content_frac=0.58)
    save(mono, os.path.join(assets, "android-icon-monochrome.png"), 1024)

    # Splash mark (transparent) + web favicon.
    save(padded(scene(background=False), content_frac=0.8), os.path.join(assets, "splash-icon.png"), 1024)
    save(scene(background=True), os.path.join(assets, "favicon.png"), 64)
