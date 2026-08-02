"""
Platform icon variants derived from the hand-drawn 32x32 penny in art/raw.

`coin_icon.py` drew the first coin (v1); the owner has since drawn coin_v2 by
hand. Everything the app ships as an icon comes from that one file so the
pieces cannot drift apart again — this script strips the white canvas, then
writes every platform asset:

    python art/scripts/coin_platform_icons.py

Outputs (1024x1024 unless noted):
  apps/mobile/assets/icon.png                    white background, opaque, the
                                                 coin at its in-canvas size
  apps/mobile/assets/favicon.png (32x32)         white background, the coin
  apps/mobile/assets/splash-icon.png             white background, coin centred
  apps/mobile/assets/android-icon-foreground.png transparent, coin in safe zone
  apps/mobile/assets/android-icon-monochrome.png transparent, black silhouette
  apps/mobile/assets/android-icon-background.png solid white (was a hornbill-era
                                                 green; the icon is white
                                                 everywhere else now)
"""

from collections import deque
from PIL import Image

SRC = "art/raw/coin_v2.png"
OUT = 1024

# Android renders the adaptive foreground inside a mask and may zoom/animate it;
# only the centre ~66% is guaranteed visible. 58% leaves visible breathing room.
SAFE_FRACTION = 0.58


def transparentize(src: str) -> Image.Image:
    """Strip the white canvas a pixel-art coin is drawn on.

    Flood-fill from the corners rather than a blanket white->transparent pass so
    that any white *inside* the coin (a highlight) would survive. The coin's own
    outline is dark and blocks the fill, so only the outer margin is removed;
    coin_v2 has no interior white, so the two are equivalent here.
    """
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    px = img.load()
    white = (255, 255, 255, 255)
    seen = [[False] * w for _ in range(h)]
    queue = deque((x, y) for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)) if px[x, y] == white)
    for x, y in queue:
        seen[y][x] = True
    while queue:
        x, y = queue.pop()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] == white:
                seen[ny][nx] = True
                queue.append((nx, ny))
    return img


coin = transparentize(SRC)


def on_white(img: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", img.size, (255, 255, 255, 255))
    canvas.alpha_composite(img)
    return canvas


def scaled(fraction: float) -> Image.Image:
    """Nearest-neighbour upscale to `fraction` of the canvas, centred."""
    side = int(OUT * fraction)
    # Keep the upscale an integer multiple of the source so pixels stay square.
    step = max(1, side // coin.width)
    art = coin.resize((coin.width * step, coin.height * step), Image.NEAREST)
    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    canvas.paste(art, ((OUT - art.width) // 2, (OUT - art.height) // 2), art)
    return canvas


# iOS / general app icon: white background, the coin at its natural in-canvas
# size (32 -> 1024 is an exact x32 upscale). Flattened to RGB: App Store icons
# must not carry an alpha channel.
on_white(coin).resize((OUT, OUT), Image.NEAREST).convert("RGB").save("apps/mobile/assets/icon.png")

# Web favicon: the 32px coin on white.
on_white(coin).convert("RGB").save("apps/mobile/assets/favicon.png")

# Splash: white background, matching `expo-splash-screen`'s backgroundColor.
splash = Image.new("RGBA", (OUT, OUT), (255, 255, 255, 255))
splash.alpha_composite(scaled(0.72))
splash.convert("RGB").save("apps/mobile/assets/splash-icon.png")

foreground = scaled(SAFE_FRACTION)
foreground.save("apps/mobile/assets/android-icon-foreground.png")

# Monochrome (themed icons): shape only. Android tints it, so the colour here is
# irrelevant — but a flat black silhouette is what the alpha is read from.
alpha = foreground.getchannel("A")
mono = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
mono.putalpha(alpha)
mono.save("apps/mobile/assets/android-icon-monochrome.png")

# Android adaptive background. Was a hornbill-era green; the coin is white-backed
# in the icon, splash and favicon, so the adaptive layer joins them.
Image.new("RGB", (OUT, OUT), (255, 255, 255)).save("apps/mobile/assets/android-icon-background.png")

print("Wrote icon.png, favicon.png, splash-icon.png, android-icon-{foreground,monochrome,background}.png")
