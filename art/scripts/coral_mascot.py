# Bukit Pennies mascot: a cute coral polyp. Tiny polyps build a whole reef —
# "sedikit-sedikit, lama-lama jadi bukit" under the sea.
#
#   python art/scripts/coral_mascot.py   -> art/raw/coral_mascot_v1.png (512px)
from PIL import Image, ImageDraw
import os

GRID = 64
SCALE = 8  # 64 * 8 = 512 working resolution
CLEAR = (0, 0, 0, 0)

# Coral ramp
C_OUT = (71, 21, 15, 255)
C_D = (166, 58, 42, 255)
C_M = (226, 96, 74, 255)
C_L = (245, 143, 118, 255)
C_XL = (255, 195, 174, 255)
# Rock base ramp
R_OUT = (46, 42, 38, 255)
R_D = (110, 101, 93, 255)
R_M = (148, 138, 128, 255)
R_L = (185, 175, 164, 255)
# Penny golds (brand tie-in)
P_OUT = (94, 56, 12, 255)
P_M = (240, 176, 42, 255)
P_L = (255, 214, 92, 255)
INK = (40, 16, 12, 255)
WHITE = (255, 255, 255, 255)


def outlined_ellipse(d, box, fill, outline):
    x0, y0, x1, y1 = box
    d.ellipse([x0 - 1, y0 - 1, x1 + 1, y1 + 1], fill=outline)
    d.ellipse(box, fill=fill)


def draw():
    img = Image.new("RGBA", (GRID, GRID), CLEAR)
    d = ImageDraw.Draw(img)

    # --- tentacle crown (drawn first; the body overlaps their roots).
    # (cx, cy, w, h) nubs fanning out from the rim.
    nubs = [
        (22, 25, 5, 12),
        (27, 20, 5, 13),
        (32, 18, 5, 14),
        (38, 20, 5, 13),
        (42, 25, 5, 12),
    ]
    for cx, cy, w, h in nubs:
        outlined_ellipse(d, [cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], C_L, C_OUT)
        d.ellipse([cx - 1, cy - h // 2 + 1, cx + 1, cy - h // 2 + 3], fill=C_XL)  # tip light

    # --- rock base
    outlined_ellipse(d, [13, 52, 51, 61], R_M, R_OUT)
    d.ellipse([17, 53, 34, 58], fill=R_L)
    d.ellipse([36, 56, 46, 60], fill=R_D)

    # --- body: plump vase shape (two stacked ellipses)
    outlined_ellipse(d, [20, 27, 44, 50], C_M, C_OUT)
    outlined_ellipse(d, [18, 38, 46, 56], C_M, C_OUT)
    d.ellipse([20, 40, 44, 54], fill=C_M)  # merge the seam
    # left rim light + belly shade
    d.ellipse([21, 30, 27, 44], fill=C_L)
    d.ellipse([23, 32, 26, 40], fill=C_XL)
    d.chord([20, 40, 44, 55], start=20, end=120, fill=C_D)
    d.ellipse([24, 34, 42, 51], fill=C_M)  # restore face area

    # --- face
    for ex in (27, 38):
        d.rectangle([ex - 1, 39, ex, 41], fill=INK)
        d.point((ex - 1, 39), fill=WHITE)
    # smile
    d.arc([29, 40, 36, 45], start=15, end=165, fill=INK, width=1)
    # blush
    d.rectangle([23, 43, 24, 43], fill=C_XL)
    d.rectangle([41, 43, 42, 43], fill=C_XL)

    # --- a penny tucked against the base (the first penny of the hill)
    cx, cy, r = 49, 55, 5
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=P_OUT)
    d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=P_M)
    d.ellipse([cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3], outline=P_L, width=1)
    d.point((cx - 2, cy - 3), fill=P_L)

    return img


if __name__ == "__main__":
    root = os.path.join(os.path.dirname(__file__), "..")
    os.makedirs(os.path.join(root, "raw"), exist_ok=True)
    out = os.path.join(root, "raw", "coral_mascot_v1.png")
    draw().resize((GRID * SCALE, GRID * SCALE), Image.NEAREST).save(out)
    print(f"wrote {out}")
