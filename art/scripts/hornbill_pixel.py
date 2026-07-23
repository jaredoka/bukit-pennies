"""
Oriental Pied Hornbill — 32×32 pixel art, side profile facing right.
Reshaped to match reference cartoon: large dome casque, upright pear body,
short neck, prominent eye, medium tail.
"""
import math
from PIL import Image

SCALE = 8
G = 32
img = Image.new("RGBA", (G * SCALE, G * SCALE), (0, 0, 0, 0))
buf = [[None] * G for _ in range(G)]

# ── Palette ──────────────────────────────────────────────────────────────────
BK = (12,  16,  26, 255)    # near-black (outline + dark plumage)
NV = (28,  42,  60, 255)    # dark navy body
NL = (48,  68,  90, 255)    # lighter navy (wing sheen)
YL = (245, 168,   0, 255)   # yellow – brand (beak + casque)
YD = (158, 106,   0, 255)   # yellow shadow
YH = (255, 213,  85, 255)   # yellow highlight
WH = (255, 255, 255, 255)   # white (belly, tail underside)


def s(x, y, c):
    if 0 <= x < G and 0 <= y < G and c is not None:
        buf[y][x] = c


def fill(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            s(x, y, c)


def oval(cx, cy, rx, ry, c):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                s(x, y, c)


def oval_outline(cx, cy, rx, ry, c=BK):
    for y in range(cy - ry - 1, cy + ry + 2):
        for x in range(cx - rx - 1, cx + rx + 2):
            inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0
            d = math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
            if not inside and d <= 1 + 1.2 / min(rx, ry):
                s(x, y, c)


# ═══════════════════════════════════════════════════════════════════════
# Draw order: back → front
# ═══════════════════════════════════════════════════════════════════════

# 1. TAIL — medium length, dark dorsal / white ventral underside
fill(2, 20, 11, 23, NV)     # dark tail feathers
fill(2, 24, 11, 24, WH)     # single white ventral row
for x in range(2, 12):
    s(x, 19, BK)             # top outline
    s(x, 25, BK)             # bottom outline
s(1, 20, BK); s(1, 21, BK); s(1, 22, BK); s(1, 23, BK); s(1, 24, BK)

# 2. BODY — upright pear shape (taller than wide, wider at bottom)
oval(14, 22, 6, 7, NV)
# White ventral belly (lower-front of body)
BCX, BCY, BRX, BRY = 14, 22, 6, 7
for gy in range(BCY + 2, BCY + BRY + 1):
    for gx in range(BCX - BRX, BCX + BRX + 1):
        if ((gx - BCX) / BRX) ** 2 + ((gy - BCY) / BRY) ** 2 <= 1.0:
            s(gx, gy, WH)
# Wing sheen stripe (upper back, dorsal)
fill(9, 16, 13, 19, NL)
oval_outline(14, 22, 6, 7)

# 3. HEAD — compact round, black cap
oval(18, 13, 5, 5, NV)
oval_outline(18, 13, 5, 5)

# 4. SHORT NECK — connects head bottom to body top
fill(15, 18, 19, 20, NV)
# Neck outlines
for y in range(18, 21):
    s(14, y, BK)
    s(20, y, BK)

# 5. CASQUE — large dome, covers top of head, same start as beak
#    In the reference: almost as tall as the head, widest in the middle
casque_rows = [
    (20, 24,  5),   # tip — narrow top
    (18, 26,  6),   # dome widens
    (17, 27,  7),   # dome body
    (16, 28,  8),   # dome widest
    (16, 28,  9),   # dome base
    (16, 28, 10),   # connects to beak top
]
for x0, x1, row in casque_rows:
    fill(x0, row, x1, row, YL)
    s(x0 - 1, row, BK)
    s(x1 + 1, row, BK)
# Top outline
for x in range(20, 25):
    s(x, 4, BK)
# Highlight (upper-left of dome)
fill(18, 6, 22, 7, YH)
fill(17, 8, 20, 9, YH)

# 6. BEAK — long, starts after eye, curves down at tip
#    Upper mandible: rows 11–13; tip curves to row 15
beak_upper = [
    (23, 31, 11),
    (23, 31, 12),
]
beak_tip = [
    (29, 31, 13),   # tip curves down
    (30, 31, 14),
]
beak_lower = [
    (23, 28, 14),   # lower mandible
    (23, 27, 15),   # tapers
]
for x0, x1, row in beak_upper + beak_tip:
    fill(x0, row, x1, row, YL)
for x0, x1, row in beak_lower:
    fill(x0, row, x1, row, YD)

# Beak highlight
fill(24, 11, 29, 11, YH)

# Beak outlines
for x in range(23, 32):
    s(x, 10, BK)                   # top edge
s(22, 11, BK); s(22, 12, BK)       # left edge
s(22, 14, BK); s(22, 15, BK)
for x in range(23, 28):
    s(x, 16, BK)                   # bottom of lower mandible
s(31, 11, BK); s(31, 12, BK); s(31, 13, BK); s(31, 14, BK)  # tip right
s(29, 13, BK)                      # tip curve junction
s(28, 15, BK); s(29, 15, BK)       # tip lower
s(29, 13, BK); s(30, 13, BK)       # gap slit between mandibles

# 7. EYE — prominent, white ring, dark pupil, catch-light
oval(19, 12, 2, 2, WH)
s(19, 12, BK); s(20, 12, BK)
s(19, 13, BK); s(20, 13, BK)
s(18, 11, WH)                      # catch-light

# 8. LEGS / FEET
for lx in [13, 16]:
    fill(lx, 29, lx + 1, 31, BK)
fill(10, 31, 15, 31, BK)            # back toes
fill(15, 31, 19, 31, BK)            # front toes

# ── Render ────────────────────────────────────────────────────────────────────
out_pix = img.load()
for gy in range(G):
    for gx in range(G):
        c = buf[gy][gx]
        if c is None:
            continue
        for dy in range(SCALE):
            for dx in range(SCALE):
                out_pix[gx * SCALE + dx, gy * SCALE + dy] = c

out = r"C:\Users\User\Desktop\Bukit Pennies\art\raw\hornbill_px_v1.png"
img.save(out)
print(f"saved → {out}")
