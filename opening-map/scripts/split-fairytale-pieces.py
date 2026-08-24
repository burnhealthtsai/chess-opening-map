#!/usr/bin/env python3
"""Split the generated 3x2 fairy-tale chess sprite into six square assets."""

from pathlib import Path
import sys

from PIL import Image


NAMES = ("pawn", "knight", "bishop", "rook", "king", "queen")


def keep_largest_component(image: Image.Image) -> Image.Image:
    """Remove neighboring sprite fragments that cross a cell boundary."""
    alpha = image.getchannel("A")
    width, height = image.size
    visible = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            if visible[x, y] <= 8 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                current_x, current_y = stack.pop()
                component.append((current_x, current_y))
                for next_x, next_y in ((current_x - 1, current_y), (current_x + 1, current_y), (current_x, current_y - 1), (current_x, current_y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height and visible[next_x, next_y] > 8 and (next_x, next_y) not in visited:
                        visited.add((next_x, next_y))
                        stack.append((next_x, next_y))
            components.append(component)

    keep = set(max(components, key=len))
    cleaned = image.copy()
    cleaned_alpha = cleaned.getchannel("A")
    cleaned_pixels = cleaned_alpha.load()
    for y in range(height):
        for x in range(width):
            if (x, y) not in keep:
                cleaned_pixels[x, y] = 0
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def main() -> None:
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    destination.mkdir(parents=True, exist_ok=True)
    sprite = Image.open(source).convert("RGBA")
    cell_width = sprite.width // 3
    cell_height = sprite.height // 2

    for index, name in enumerate(NAMES):
        column, row = index % 3, index // 3
        cell = keep_largest_component(sprite.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height)))
        alpha_box = cell.getchannel("A").getbbox()
        if not alpha_box:
            raise RuntimeError(f"No visible pixels found for {name}")
        piece = cell.crop(alpha_box)
        piece.thumbnail((448, 448), Image.Resampling.LANCZOS)
        output = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        output.alpha_composite(piece, ((512 - piece.width) // 2, (512 - piece.height) // 2))
        output.save(destination / f"{name}.png", optimize=True)


if __name__ == "__main__":
    main()
