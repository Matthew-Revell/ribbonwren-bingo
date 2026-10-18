#!/usr/bin/env python3
"""Build static Nunito and Caveat instances for PDF embedding.

The brand kit ships variable fonts. Nunito's default instance is weight 200
(ExtraLight). pdf-lib embeds that default only, which prints too thin.
This writes static files:

  Nunito-Regular.ttf     weight 400
  Nunito-Bold.ttf        weight 700
  Nunito-ExtraBold.ttf   weight 800
  Caveat-Bold.ttf        weight 700

It also copies DM Serif Display Regular and strips web addresses out of the
name tables. License text stays in public/fonts/OFL.txt. Etsy delivery PDFs
must not contain URLs, including strings buried in an embedded font.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tools" / "variable-sources"
OUT = ROOT / "public" / "fonts"
DM_SERIF = ROOT / "public" / "fonts" / "DMSerifDisplay-Regular.ttf"

INSTANCES = [
    ("Nunito-VariableFont_wght.ttf", 400, "Nunito", "Regular", "Nunito-Regular", False),
    ("Nunito-VariableFont_wght.ttf", 700, "Nunito", "Bold", "Nunito-Bold", True),
    ("Nunito-VariableFont_wght.ttf", 800, "Nunito", "ExtraBold", "Nunito-ExtraBold", True),
    ("Caveat-VariableFont_wght.ttf", 700, "Caveat", "Bold", "Caveat-Bold", True),
]

URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)


def scrub(text: str) -> str:
    cleaned = URL_RE.sub("", text)
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = cleaned.replace(" :", ":").strip(" :-,")
    return cleaned.strip()


def scrub_names(font: TTFont) -> None:
    name = font["name"]
    for rec in list(name.names):
        try:
            text = rec.toUnicode()
        except Exception:
            continue
        if rec.nameID == 13:
            text = "Licensed under the SIL Open Font License, Version 1.1. See OFL.txt."
        elif rec.nameID in (11, 12, 14):
            text = scrub(text) or "See OFL.txt"
        else:
            text = scrub(text)
        if not text:
            continue
        rec.string = text


def set_name(font: TTFont, name_id: int, text: str) -> None:
    font["name"].setName(text, name_id, 3, 1, 0x409)
    font["name"].setName(text, name_id, 1, 0, 0)


def apply_weight(font: TTFont, weight: int, bold: bool) -> None:
    os2 = font["OS/2"]
    os2.usWeightClass = int(weight)
    # bit 5 = bold, bit 6 = regular. Keep the rest.
    if bold:
        os2.fsSelection = (os2.fsSelection | 0x20) & ~0x40
    else:
        os2.fsSelection = (os2.fsSelection | 0x40) & ~0x20
    if "head" in font:
        font["head"].macStyle = 1 if bold else 0


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src_name, weight, family, style, ps, bold in INSTANCES:
        font = TTFont(str(SRC / src_name))
        instantiateVariableFont(
            font,
            {"wght": weight},
            inplace=True,
            updateFontNames=True,
        )
        full = f"{family} {style}"
        set_name(font, 1, family)
        set_name(font, 2, style)
        set_name(font, 4, full)
        set_name(font, 6, ps)
        set_name(font, 16, family)
        set_name(font, 17, style)
        apply_weight(font, weight, bold)
        scrub_names(font)
        # Re-apply the PostScript name after the scrub, in case it was touched.
        set_name(font, 6, ps)
        out = OUT / f"{ps}.ttf"
        font.save(str(out))
        check = TTFont(str(out))
        got = check["OS/2"].usWeightClass
        print(f"wrote {out.name} usWeightClass={got}")
        if got != weight:
            raise SystemExit(f"{out.name} weight is {got}, expected {weight}")

    if DM_SERIF.exists():
        font = TTFont(str(DM_SERIF))
        scrub_names(font)
        font.save(str(DM_SERIF))
        print("scrubbed DMSerifDisplay-Regular.ttf")
    else:
        raise SystemExit(f"missing {DM_SERIF}")

    ofl = OUT / "OFL.txt"
    if not ofl.exists():
        raise SystemExit("public/fonts/OFL.txt is missing")
    print("done")


if __name__ == "__main__":
    main()
