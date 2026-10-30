"""Slice a strip by equal cells, not by connected components.

Directional strips merge figures where hands or a drawn ground line
touch, so component slicing fails or trims figures. Equal cells keep
every figure whole. All frames share one canvas (max cell width,
strip height) and one ground line (max opaque bottom across cells),
so scale and root registration stay consistent.

For front-right, crop off the drawn ground line first: it is a thin
horizontal line below the feet, detected as a row with dark pixels
across most of the width in the lower third. Cropping above it
removes the line without cutting feet.

Usage:
  python3 scripts/slice_equal.py <strip.png> <out_dir> <prefix> <count> [--drop-ground-line]
Output: <prefix>_01.png ... and <prefix>_manifest.json
"""
import json
import os
import sys

import numpy as np
from PIL import Image


def main(src, out_dir, prefix, count, drop_line):
    os.makedirs(out_dir, exist_ok=True)
    im = Image.open(src).convert("RGBA")
    if drop_line:
        a = np.asarray(im.getchannel("A")) > 16
        rgb = np.asarray(im.convert("RGB")).astype(int)
        dark = a  # ground line spans the full width in alpha, even if light grey
        h = im.size[1]
        for y in range(int(h * 0.66), h):
            if dark[y].mean() > 0.8:
                im = im.crop((0, 0, im.size[0], y))
                print(f"{prefix}: dropped ground line at y={y}, new height {im.size[1]}")
                break
    w, h = im.size
    cell_w = w // count
    cells = [im.crop((i * cell_w, 0, (i + 1) * cell_w, h)) for i in range(count)]
    a = np.asarray(im.getchannel("A")) > 16
    bottoms = []
    for i in range(count):
        col = a[:, i * cell_w:(i + 1) * cell_w]
        rows = np.where(col.any(axis=1))[0]
        bottoms.append(int(rows[-1]) + 1 if len(rows) else h)
    ground_y = max(bottoms)
    canvas_w = cell_w
    frames = []
    for i, cell in enumerate(cells):
        frame = Image.new("RGBA", (canvas_w, h), (0, 0, 0, 0))
        frame.alpha_composite(cell, (0, 0))
        name = f"{prefix}_{i + 1:02d}.png"
        frame.save(f"{out_dir}/{name}")
        frames.append(
            {
                "id": f"{prefix}_{i + 1:02d}",
                "file": name,
                "size": [canvas_w, h],
                "pivot": [0.5, ground_y / h],
                "bottom": bottoms[i],
            }
        )
    json.dump(
        {"frames": frames, "groundY": ground_y, "cellWidth": cell_w},
        open(f"{out_dir}/{prefix}_manifest.json", "w"),
        indent=2,
    )
    print(f"{prefix}: {count} frames, canvas {canvas_w}x{h}, groundY {ground_y}, bottoms {bottoms}")


if __name__ == "__main__":
    args = sys.argv[1:]
    drop = "--drop-ground-line" in args
    args = [a for a in args if a != "--drop-ground-line"]
    main(args[0], args[1], args[2], int(args[3]), drop)
