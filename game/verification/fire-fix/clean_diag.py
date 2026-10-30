"""Keep only the largest connected component of each diagonal fire frame.

The delivered frames carry stray fragments of neighbouring figures at the
canvas edges. Removing every component except the largest leaves the main
gun pixel-identical and drops the fragments. Run from the repo root:
  python3 game/verification/fire-fix/clean_diag.py
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/weapons/shotgun/frames_diagonal_v1"
DST = "game/public/assets/weapons/shotgun/frames"

for i in range(1, 6):
    name = f"shotgun_fire_diag_0{i}.png"
    im = Image.open(os.path.join(SRC, name)).convert("RGBA")
    alpha = np.asarray(im.getchannel("A")) > 16
    labels, _ = ndimage.label(alpha)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    keep = int(np.argmax(counts))
    arr = np.asarray(im).copy()
    arr[labels != keep, 3] = 0
    out = Image.fromarray(arr, "RGBA")
    out.save(os.path.join(DST, name))
    dropped = int(alpha.sum() - (labels == keep).sum())
    print(f"{name}: kept {int((labels == keep).sum())} px, dropped {dropped} px")
