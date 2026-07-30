"""
Platform icon variants derived from the 32x32 penny in art/final.

`coin_icon.py` draws the coin and `icon.png` / `favicon.png` were made from it,
but the splash screen and the Android adaptive icon were originally left on the
previous mascot artwork. This regenerates all three from the same source so
they cannot drift apart again.

    python art/scripts/coin_platform_icons.py

Outputs (1024x1024):
  apps/mobile/assets/splash-icon.png          white background, coin centred
  apps/mobile/assets/android-icon-foreground.png  transparent, coin in safe zone
  apps/mobile/assets/android-icon-monochrome.png  transparent, black silhouette
"""

from PIL import Image

SRC = "art/final/coin_v1_nobackground.png"
OUT = 1024

# Android renders the adaptive foreground inside a mask and may zoom/animate it;
# only the centre ~66% is guaranteed visible. 58% leaves visible breathing room.
SAFE_FRACTION = 0.58

coin = Image.open(SRC).convert("RGBA")


def scaled(fraction: float) -> Image.Image:
    """Nearest-neighbour upscale to `fraction` of the canvas, centred."""
    side = int(OUT * fraction)
    # Keep the upscale an integer multiple of the source so pixels stay square.
    step = max(1, side // coin.width)
    art = coin.resize((coin.width * step, coin.height * step), Image.NEAREST)
    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    canvas.paste(art, ((OUT - art.width) // 2, (OUT - art.height) // 2), art)
    return canvas


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

print("Wrote splash-icon.png, android-icon-foreground.png, android-icon-monochrome.png")
