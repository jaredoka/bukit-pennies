"""
Pixel art penny icon — copper coin, standing upright face-on, 32x32.
White background. Wide reeded-edge band with high-contrast ridges.
Face is nearly flat copper — only a faint shadow at bottom-right corner.
"""

from PIL import Image, ImageDraw
import math, os, shutil

SCALE = 8
SIZE  = 32
W = H = SIZE * SCALE   # 256x256

os.makedirs("art/raw",   exist_ok=True)
os.makedirs("art/final", exist_ok=True)

# ── Copper palette ────────────────────────────────────────────────────────
WHITE      = (255, 255, 255, 255)
BLACK      = (0,   0,   0,   255)
RIDGE_HI   = (218, 142,  52, 255)  # raised ridge — bright copper catch-light
RIDGE_DARK = ( 38,  16,   2, 255)  # groove — very dark brown
FACE_BASE  = (198, 118,  36, 255)  # flat copper, covers almost all of face
FACE_SHADE = (128,  66,  12, 255)  # faint shadow — bottom-right corner only
FACE_HI    = (250, 208, 128, 255)  # specular highlight spot

# ── Canvas ────────────────────────────────────────────────────────────────
img  = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

CX = CY = 15.5

def put(x, y, color):
    draw.rectangle(
        [x * SCALE, y * SCALE, (x + 1) * SCALE - 1, (y + 1) * SCALE - 1],
        fill=color,
    )

def dist(x, y):
    return math.sqrt((x + 0.5 - CX) ** 2 + (y + 0.5 - CY) ** 2)

# ── Radius zones ──────────────────────────────────────────────────────────
R_OUTER     = 13.4   # white background beyond here
R_OUTLINE   = 13.0   # thin black outline ring
R_RIDGE_IN  = 10.8   # ridge band goes from here out to R_OUTLINE
R_FACE      = 10.8   # face starts here (same — no separate inner-rim line)

# ── Ridge parameters ──────────────────────────────────────────────────────
# 13 ridges → each ridge+groove pair spans ~(2π×12)/13 ≈ 5.8 logical px
# → each ridge is ~2-3 logical pixels wide: clearly visible at 32×32.
NUM_RIDGES = 13

# ── Specular highlight (upper-left of face) ───────────────────────────────
HI_CX, HI_CY = 11.8, 10.8
HI_RX, HI_RY = 1.6,  1.1

# ── Lighting direction (only used for the very-corner shadow) ─────────────
LIT_DX, LIT_DY = -0.5, -0.85
SHADOW_THRESH   = -7.5   # only pixels with lit < this get FACE_SHADE

# ── Per-pixel pass ────────────────────────────────────────────────────────
for y in range(SIZE):
    for x in range(SIZE):
        d   = dist(x, y)
        dx  = (x + 0.5) - CX
        dy  = (y + 0.5) - CY
        ang = math.degrees(math.atan2(dy, dx)) % 360

        if d > R_OUTER:
            put(x, y, WHITE)

        elif d > R_OUTLINE:
            put(x, y, BLACK)

        elif d > R_RIDGE_IN:
            # Ridge zone: alternate raised / grooved segments by angle
            seg       = int((ang / 360.0) * NUM_RIDGES * 2)
            is_ridge  = (seg % 2 == 0)
            put(x, y, RIDGE_HI if is_ridge else RIDGE_DARK)

        else:
            # Coin face
            hi_d = ((x + 0.5 - HI_CX) / HI_RX) ** 2 + \
                   ((y + 0.5 - HI_CY) / HI_RY) ** 2
            if hi_d <= 1.0:
                put(x, y, FACE_HI)
            else:
                lit = dx * LIT_DX + dy * LIT_DY
                put(x, y, FACE_SHADE if lit < SHADOW_THRESH else FACE_BASE)

# ── Save ──────────────────────────────────────────────────────────────────
img.save("art/raw/coin_v1.png")
print("Saved art/raw/coin_v1.png")
