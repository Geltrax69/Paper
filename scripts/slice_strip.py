"""Slice a generated strip into registered frames.

Method: alpha-extract the strip, label large connected components,
sort them left to right, and cut cell boundaries at the midpoints
between component centres. All frames share one canvas size and one
ground line (the maximum component bottom for runners, the strip
bottom for weapons, the centre for flashes), so scale and root
registration stay consistent across poses. Trimming each figure to
its own box would put flight feet on the ground and change scale.

Usage:
  python3 scripts/slice_strip.py <strip.png> <out_dir> <prefix> <count> <kind>
  kind is runner, weapon, or flash.
Output: <prefix>_01.png ... and a <prefix>_manifest.json fragment.
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def main(src, out_dir, prefix, count, kind):
    import os

    os.makedirs(out_dir, exist_ok=True)
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im.getchannel("A")) > 16
    labels, _ = ndimage.label(a)
    objs = ndimage.find_objects(labels)
    comps = []
    for i, sl in enumerate(objs, 1):
        area = int((labels[sl] == i).sum())
        if area > 2000:
            comps.append(
                {
                    "x0": int(sl[1].start),
                    "x1": int(sl[1].stop),
                    "y0": int(sl[0].start),
                    "y1": int(sl[0].stop),
                    "area": area,
                }
            )
    comps.sort(key=lambda c: (c["x0"] + c["x1"]) / 2)
    if kind == "flash":
        width = im.size[0] // count
        bounds = [i * width for i in range(count + 1)]
        bounds[-1] = im.size[0]
        ground_y = im.size[1] // 2
        pivot = [0.5, 0.5]
    else:
        if len(comps) != count:
            raise SystemExit(
                f"expected {count} components, found {len(comps)}: {comps}"
            )
        centres = [(c["x0"] + c["x1"]) / 2 for c in comps]
        bounds = [0]
        for left, right in zip(centres, centres[1:]):
            bounds.append(int((left + right) / 2))
        bounds.append(im.size[0])
        widths = [b - a for a, b in zip(bounds, bounds[1:])]
        canvas_w = max(widths)
        ground_y = max(c["y1"] for c in comps) if kind == "runner" else im.size[1]
        pivot = [0.5, ground_y / im.size[1]]
        frames = []
        for i, (lo, hi) in enumerate(zip(bounds, bounds[1:])):
            cell = im.crop((lo, 0, hi, im.size[1]))
            frame = Image.new("RGBA", (canvas_w, im.size[1]), (0, 0, 0, 0))
            offset = (canvas_w - cell.size[0]) // 2
            frame.alpha_composite(cell, (offset, 0))
            name = f"{prefix}_{i + 1:02d}.png"
            frame.save(f"{out_dir}/{name}")
            frames.append(
                {
                    "id": f"{prefix}_{i + 1:02d}",
                    "file": name,
                    "size": [canvas_w, im.size[1]],
                    "sourceSize": [canvas_w, im.size[1]],
                    "pivot": pivot,
                    "bbox": [comps[i]["x0"] - lo, comps[i]["y0"], comps[i]["x1"] - lo, comps[i]["y1"]],
                }
            )
        json.dump(
            {"frames": frames, "groundY": ground_y, "bounds": bounds},
            open(f"{out_dir}/{prefix}_manifest.json", "w"),
            indent=2,
        )
        print(f"{prefix}: {count} frames, canvas {canvas_w}x{im.size[1]}, pivot {pivot}, bounds {bounds}")
        return
    canvas_w = bounds[1] - bounds[0]
    frames = []
    for i, (lo, hi) in enumerate(zip(bounds, bounds[1:])):
        cell = im.crop((lo, 0, hi, im.size[1]))
        name = f"{prefix}_{i + 1:02d}.png"
        cell.save(f"{out_dir}/{name}")
        frames.append(
            {
                "id": f"{prefix}_{i + 1:02d}",
                "file": name,
                "size": [cell.size[0], cell.size[1]],
                "sourceSize": [cell.size[0], cell.size[1]],
                "pivot": pivot,
            }
        )
    json.dump(
        {"frames": frames, "bounds": bounds},
        open(f"{out_dir}/{prefix}_manifest.json", "w"),
        indent=2,
    )
    print(f"{prefix}: {count} frames, canvas {canvas_w}x{im.size[1]}, pivot {pivot}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5])
