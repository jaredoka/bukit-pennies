"""
Hornbill sprite sheet + GIF generator.

Sprite sheet layout (256×256 per cell):
  Row 0 — idle / breathing   4 frames
  Row 1 — blink              4 frames
  Row 2 — head turn          4 frames
  Row 3 — tail wag           4 frames
  Row 4 — coin pickup        6 frames

Output:
  art/final/hornbill_sheet.png
  art/final/hornbill_idle.gif
  art/final/hornbill_blink.gif
  art/final/hornbill_head.gif
  art/final/hornbill_tail.gif
  art/final/hornbill_coin.gif
"""
import math, os
from PIL import Image

SCALE  = 8     # logical px → real px
G      = 32    # logical grid size
COLS   = 6     # max frames per animation
ROWS   = 9     # number of animations
GUTTER = 16    # transparent px between cells (prevents downscale bleed on web;
               # HornbillMascot.tsx GUTTER_FRAC must equal GUTTER / (G*SCALE))
BASE   = r"C:\Users\User\Desktop\Bukit Pennies\art\final"
os.makedirs(BASE, exist_ok=True)

# ── Palette ───────────────────────────────────────────────────────────────────
BK = (12,  16,  26, 255)
NV = (28,  42,  60, 255)
NL = (48,  68,  90, 255)
YL = (245, 168,   0, 255)
YD = (158, 106,   0, 255)
YH = (255, 213,  85, 255)
WH = (255, 255, 255, 255)
# Pale-yellow beak palette (main beak only; casque keeps YL/YH)
BL = (250, 226, 140, 255)   # pale beak (upper mandible)
BD = (214, 184, 108, 255)   # pale beak shadow (lower mandible)
BH = (255, 244, 200, 255)   # pale beak highlight


# ── Low-level pixel helpers ───────────────────────────────────────────────────
def sp(buf, x, y, c):
    if 0 <= x < G and 0 <= y < G and c is not None:
        buf[y][x] = c

def fl(buf, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            sp(buf, x, y, c)

def ov(buf, cx, cy, rx, ry, c):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1.0:
                sp(buf, x, y, c)

def ov_out(buf, cx, cy, rx, ry, c=None):
    c = c or BK
    for y in range(cy-ry-1, cy+ry+2):
        for x in range(cx-rx-1, cx+rx+2):
            d = math.sqrt(((x-cx)/rx)**2 + ((y-cy)/ry)**2)
            if 1.0 < d <= 1 + 1.2/min(rx, ry):
                sp(buf, x, y, c)


# ── Body-part drawing functions (all accept per-part offsets) ─────────────────

def draw_tail(buf, dy=0):
    fl(buf, 2, 20+dy, 11, 23+dy, NV)
    fl(buf, 2, 24+dy, 11, 24+dy, WH)
    for x in range(2, 12):
        sp(buf, x, 19+dy, BK)
        sp(buf, x, 25+dy, BK)
    for y in range(20, 25):
        sp(buf, 1, y+dy, BK)


def draw_body(buf, dy=0):
    ov(buf, 14, 22+dy, 6, 7, NV)
    # ventral white (lower portion)
    BCX, BCY, BRX, BRY = 14, 22+dy, 6, 7
    for gy in range(BCY+2, BCY+BRY+1):
        for gx in range(BCX-BRX, BCX+BRX+1):
            if ((gx-BCX)/BRX)**2 + ((gy-BCY)/BRY)**2 <= 1.0:
                sp(buf, gx, gy, WH)
    fl(buf, 9, 16+dy, 13, 19+dy, NL)   # wing sheen
    ov_out(buf, 14, 22+dy, 6, 7)


def draw_neck(buf, dy_body=0, dy_head=0):
    """Neck stretches downward when head dips below body."""
    y0 = 18 + dy_body
    y1 = 20 + dy_body + max(0, dy_head)   # extends when head dips
    fl(buf, 15, y0, 19, y1, NV)
    for y in range(y0, y1 + 1):
        sp(buf, 14, y, BK)
        sp(buf, 20, y, BK)


def draw_head(buf, dx=0, dy=0):
    ov(buf, 18+dx, 13+dy, 5, 5, NV)
    ov_out(buf, 18+dx, 13+dy, 5, 5)


def draw_casque(buf, dx=0, dy=0):
    rows = [
        (20, 24,  5),
        (18, 26,  6),
        (17, 27,  7),
        (16, 28,  8),
        (16, 28,  9),
        (16, 28, 10),
    ]
    for x0, x1, row in rows:
        fl(buf, x0+dx, row+dy, x1+dx, row+dy, BL)
        sp(buf, x0-1+dx, row+dy, BK)
        sp(buf, x1+1+dx, row+dy, BK)
    for x in range(20, 25):
        sp(buf, x+dx, 4+dy, BK)
    fl(buf, 18+dx, 6+dy, 22+dx, 7+dy, BH)
    fl(buf, 17+dx, 8+dy, 20+dx, 9+dy, BH)


def draw_beak(buf, dx=0, dy=0):
    upper = [(23, 31, 11), (23, 31, 12)]
    lower = [(29, 31, 13), (29, 31, 14), (23, 29, 14), (23, 28, 15), (28, 29, 15)]
    for x0, x1, row in upper:
        fl(buf, x0+dx, row+dy, x1+dx, row+dy, BL)
    for x0, x1, row in lower:
        fl(buf, x0+dx, row+dy, x1+dx, row+dy, BD)
    fl(buf, 24+dx, 11+dy, 29+dx, 11+dy, BH)
    for x in range(23, 32):
        sp(buf, x+dx, 10+dy, BK)
    fl(buf, 23+dx, 13+dy, 28+dx, 13+dy, BK)   # mouth gap interior
    sp(buf, 22+dx, 11+dy, BK); sp(buf, 22+dx, 12+dy, BK)
    sp(buf, 22+dx, 13+dy, BK)                  # left edge at mouth gap row
    sp(buf, 22+dx, 14+dy, BK); sp(buf, 22+dx, 15+dy, BK)
    for x in range(23, 28):
        sp(buf, x+dx, 16+dy, BK)
    sp(buf, 31+dx, 11+dy, BK); sp(buf, 31+dx, 12+dy, BK)
    sp(buf, 31+dx, 13+dy, BK); sp(buf, 31+dx, 14+dy, BK)
    sp(buf, 28+dx, 15+dy, BK); sp(buf, 29+dx, 15+dy, BK)
    sp(buf, 29+dx, 13+dy, BK); sp(buf, 30+dx, 13+dy, BK)


def draw_eye(buf, dx=0, dy=0, blink=0):
    """blink: 0=open, 1=half-closed, 2=fully closed.
    In blink states: no white pixels at all.
    Top row of eye region (y=11) is painted YL to match beak/casque area.
    """
    if blink == 2:
        # Fully closed: restore beak-yellow to top row, draw full eyelid line.
        fl(buf, 18+dx, 11+dy, 20+dx, 11+dy, BL)   # top → beak/casque colour
        fl(buf, 17+dx, 12+dy, 21+dx, 12+dy, BK)   # full eyelid line
    elif blink == 1:
        # Half closed: same top restore, shorter eyelid (looks mid-blink).
        fl(buf, 18+dx, 11+dy, 20+dx, 11+dy, BL)   # top → beak/casque colour
        fl(buf, 18+dx, 12+dy, 20+dx, 12+dy, BK)   # shorter eyelid line
    else:
        # Fully open: white sclera oval, black pupil, catch-light
        ov(buf, 19+dx, 12+dy, 2, 2, WH)
        sp(buf, 19+dx, 12+dy, BK); sp(buf, 20+dx, 12+dy, BK)
        sp(buf, 19+dx, 13+dy, BK); sp(buf, 20+dx, 13+dy, BK)
        sp(buf, 18+dx, 11+dy, WH)


def draw_legs(buf, dy=0, pose='stand'):
    """Two separate legs with a clear gap; both feet point forward (+x, beak side).

    Each foot = short back toe + longer forward toes, so both feet face the
    same direction the bird is facing.
    """
    if pose == 'tuck':
        for lx in [12, 17]:
            fl(buf, lx, 28+dy, lx+1, 29+dy, BK)   # shank tucked up
            sp(buf, lx-1, 29+dy, BK)               # back toe
            fl(buf, lx, 29+dy, lx+2, 29+dy, BK)    # forward toes
    elif pose == 'crouch':
        for lx in [11, 18]:
            fl(buf, lx, 29+dy, lx+1, 31+dy, BK)   # shank, wider stance
            sp(buf, lx-1, 31+dy, BK)               # back toe
            fl(buf, lx, 31+dy, lx+2, 31+dy, BK)    # forward toes
    else:
        for lx in [12, 17]:
            fl(buf, lx, 29+dy, lx+1, 31+dy, BK)   # shank
            sp(buf, lx-1, 31+dy, BK)               # back toe
            fl(buf, lx, 31+dy, lx+2, 31+dy, BK)    # forward toes


def draw_pile(buf, topped=False):
    """Fixed coin pile at lower-left (below tail), 2 coins base + optional 3rd."""
    coins = [(5, 30), (5, 28)]
    if topped:
        coins.append((5, 26))
    for cx, cy in coins:
        ov(buf, cx, cy, 2, 1, YL)
        sp(buf, cx, cy, YH)
        ov_out(buf, cx, cy, 2, 1)


def draw_coin(buf, stage, dx=0, dy=0):
    """
    Stage 1: loose coin on ground (fixed, right side, near beak reach).
    Stage 2: coin at beak tip moving with head during pickup arc.
    Stage 3: coin held at beak tip, head returned upright.
    """
    if stage == 1:
        cx, cy = 29, 26          # fixed ground position
    elif stage == 2:
        cx, cy = 30+dx, 14+dy   # beak tip during dip
    else:
        cx, cy = 28+dx, 12+dy   # held high at beak tip
    ov(buf, cx, cy, 2, 1, YL)
    sp(buf, cx, cy, YH)
    ov_out(buf, cx, cy, 2, 1)


# ── Compose one frame ─────────────────────────────────────────────────────────
def make_frame(dy_all=0, dy_tail=0, dx_head=0, dy_head=0,
               blink=0, leg_pose='stand', coin_stage=0, pile=False, pile_topped=False):
    buf     = [[None]*G for _ in range(G)]
    dy_body = dy_all
    dy_h    = dy_all + dy_head
    draw_tail(buf, dy=dy_body + dy_tail)
    draw_body(buf, dy=dy_body)
    draw_neck(buf, dy_body=dy_body, dy_head=dy_head)
    draw_head(buf, dx=dx_head, dy=dy_h)
    draw_casque(buf, dx=dx_head, dy=dy_h)
    draw_beak(buf, dx=dx_head, dy=dy_h)
    draw_eye(buf, dx=dx_head, dy=dy_h, blink=blink)
    draw_legs(buf, dy=dy_body, pose=leg_pose)
    if pile or pile_topped:
        draw_pile(buf, topped=pile_topped)
    if coin_stage:
        draw_coin(buf, coin_stage, dx=dx_head, dy=dy_h)
    return buf


def buf_to_img(buf):
    img = Image.new("RGBA", (G*SCALE, G*SCALE), (0, 0, 0, 0))
    pix = img.load()
    for gy in range(G):
        for gx in range(G):
            c = buf[gy][gx]
            if c is None:
                continue
            for dy in range(SCALE):
                for dx in range(SCALE):
                    pix[gx*SCALE+dx, gy*SCALE+dy] = c
    return img


# ── Animation definitions ─────────────────────────────────────────────────────
# Each entry: (label, [list of param dicts], gif_duration_ms)
ANIMATIONS = [
    ("idle", [
        dict(),
        dict(),
        dict(),
        dict(),
    ], 120),

    ("blink", [
        dict(),
        dict(),
        dict(blink=1),
        dict(blink=2),
        dict(blink=1),
        dict(),
    ], 80),

    ("head", [
        dict(),
        dict(dx_head=-1),
        dict(dx_head=-1),
        dict(),
        dict(dx_head=1),
        dict(),
    ], 120),

    ("tail", [
        dict(),
        dict(dy_tail=-1),
        dict(),
        dict(dy_tail=1),
        dict(),
        dict(),
    ], 100),

    ("coin", [
        dict(coin_stage=1, pile=True),
        dict(dy_all=-1, dy_head=2, coin_stage=1, pile=True),
        dict(dy_all=-1, dy_head=5, coin_stage=2, pile=True),
        dict(dy_head=3, coin_stage=2, pile=True),
        dict(coin_stage=3, pile=True),
        dict(pile_topped=True),
    ], [500, 150, 150, 150, 150, 500]),

    ("preen", [
        dict(),
        dict(dx_head=-2, dy_head=2),
        dict(dx_head=-3, dy_head=4),
        dict(dx_head=-3, dy_head=4),
        dict(dx_head=-1, dy_head=2),
        dict(),
    ], [400, 150, 120, 300, 150, 500]),

    ("hop", [
        dict(),
        dict(dy_all=1,  leg_pose='crouch'),
        dict(dy_all=-3, leg_pose='tuck'),
        dict(dy_all=-2, leg_pose='tuck'),
        dict(dy_all=1,  leg_pose='crouch'),
        dict(),
    ], [400, 80, 150, 150, 80, 400]),

    ("bob", [
        dict(),
        dict(dy_all=-1),
        dict(dy_all=-2),
        dict(dy_all=-1),
        dict(),
        dict(dy_all=1),
    ], 90),

    ("look_around", [
        dict(),
        dict(dx_head=-1),
        dict(dx_head=-2),
        dict(),
        dict(dx_head=2),
        dict(dx_head=1),
    ], [500, 150, 600, 400, 600, 150]),
]

# ── Render sprite sheet ───────────────────────────────────────────────────────
PITCH   = G * SCALE + GUTTER   # cell stride incl. transparent gutter
sheet_w = COLS * PITCH
sheet_h = ROWS * PITCH
sheet   = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

for row_idx, (label, frames, _) in enumerate(ANIMATIONS):
    for col_idx, params in enumerate(frames):
        buf  = make_frame(**params)
        cell = buf_to_img(buf)
        x    = col_idx * PITCH
        y    = row_idx * PITCH
        sheet.paste(cell, (x, y))

sheet.save(os.path.join(BASE, "hornbill_sheet.png"))
print("saved → hornbill_sheet.png")

# ── Render individual GIFs ────────────────────────────────────────────────────
for label, frames, dur in ANIMATIONS:
    imgs = []
    for params in frames:
        buf = make_frame(**params)
        imgs.append(buf_to_img(buf).convert("RGBA"))

    path = os.path.join(BASE, f"hornbill_{label}.gif")
    dur_list = dur if isinstance(dur, list) else [dur] * len(frames)
    imgs[0].save(
        path,
        save_all=True,
        append_images=imgs[1:],
        loop=0,
        duration=dur_list,
        disposal=2,
    )
    print(f"saved → hornbill_{label}.gif")

print("done.")
