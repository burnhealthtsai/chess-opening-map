#!/usr/bin/env python3
"""Trim one transparent chess piece and center it on a square canvas."""

from pathlib import Path
import sys

from PIL import Image


def main() -> None:
    source = Image.open(Path(sys.argv[1])).convert("RGBA")
    destination = Path(sys.argv[2])
    alpha_box = source.getchannel("A").getbbox()
    if not alpha_box:
        raise RuntimeError("No visible piece pixels found")
    piece = source.crop(alpha_box)
    piece.thumbnail((448, 448), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    output.alpha_composite(piece, ((512 - piece.width) // 2, (512 - piece.height) // 2))
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, optimize=True)


if __name__ == "__main__":
    main()
