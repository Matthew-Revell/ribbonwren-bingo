#!/usr/bin/env python3
"""Draw small theme decorations: stars and a ribbon swoosh.

These are original shapes in the brand colors, not traced from another shop.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "public" / "img"
FONTS = ROOT / "public" / "fonts"

GOLD = (201, 162, 74, 255)
CRANBERRY = (184, 67, 74, 255)
OAT = (232, 217, 192, 255)
CREAM = (250, 245, 236, 255)
EVERGREEN = (47, 93, 80, 255)
INK = (43, 42, 51, 255)
SNOW = (255, 255, 255, 255)


def star_points(cx, cy, r_out, r_in, n=5):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = -math.pi / 2 + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def make_star(color, path: Path) -> None:
    size = 128
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    pts = star_points(size / 2, size / 2, 58, 24)
    draw.polygon(pts, fill=color)
    # Solid center so a pixel sample of the middle stays the exact brand color
    # after the PDF rasterizer smooths the tips.
    draw.ellipse((44, 44, 84, 84), fill=color)
    im.save(path)


def make_swoosh(path: Path) -> None:
    w, h = 800, 160
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.arc((20, -40, w - 20, h + 80), 200, 340, fill=OAT, width=18)
    # A thinner cranberry arc over the oat ribbon.
    draw.arc((70, 10, w - 90, h + 10), 210, 330, fill=CRANBERRY, width=6)
    im.save(path)


def make_og(path: Path) -> None:
    w, h = 1200, 630
    im = Image.new("RGB", (w, h), CREAM[:3])
    draw = ImageDraw.Draw(im)
    # Oat dot grid
    for y in range(24, h - 80, 28):
        for x in range(24, w, 28):
            draw.ellipse((x, y, x + 3, y + 3), fill=OAT[:3])
    draw.rectangle((0, h - 92, w, h), fill=EVERGREEN[:3])
    mark = IMG / "ribbonwren-mark.png"
    if mark.exists():
        logo = Image.open(mark).convert("RGBA")
        logo.thumbnail((150, 150))
        im.paste(logo, (78, 150), logo)
    display = ImageFont.truetype(str(FONTS / "DMSerifDisplay-Regular.ttf"), 92)
    body = ImageFont.truetype(str(FONTS / "Nunito-Bold.ttf"), 36)
    caveat = ImageFont.truetype(str(FONTS / "Caveat-Bold.ttf"), 42)
    draw.text((280, 170), "Ribbonwren Bingo", font=display, fill=EVERGREEN[:3])
    draw.text((284, 290), "Printable cards from your own word list.", font=body, fill=INK[:3])
    draw.text((284, 360), "Cozy all year, merry when it counts.", font=caveat, fill=CRANBERRY[:3])
    small = ImageFont.truetype(str(FONTS / "Nunito-Bold.ttf"), 28)
    draw.text((48, h - 62), "Ribbonwren Paper Co.", font=small, fill=CREAM[:3])
    im.save(path, quality=90)


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    make_star(GOLD, IMG / "star-gold.png")
    make_star(CRANBERRY, IMG / "star-cranberry.png")
    make_swoosh(IMG / "ribbon-swoosh.png")
    make_og(IMG / "og.png")
    print("theme art ready")


if __name__ == "__main__":
    main()
