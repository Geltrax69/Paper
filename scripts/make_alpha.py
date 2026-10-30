"""Make real RGBA cutouts from generated images with painted backgrounds.

Method: a pixel is background-like when it is bright and low-saturation.
Label connected background-like components. Only the component that touches
the image border becomes transparent. Ivory surfaces enclosed by ink outlines
are separate components, so they stay opaque. This is the exact failure the
image prompt pack warns about: a painted checkerboard is not transparency.

Usage: python3 scripts/make_alpha.py <input.png> <output.png>
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

try:
    from scipy import ndimage
except ImportError:
    ndimage = None


def main(src, dst):
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im).astype(np.int16)
    brightness = arr.max(axis=2)
    saturation = arr.max(axis=2) - arr.min(axis=2)
    background_like = (brightness > 200) & (saturation < 60)
    if ndimage is not None:
        labels, _ = ndimage.label(background_like)
        border_labels = set(np.unique(np.concatenate([
            labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1],
        ])))
        border_labels.discard(0)
        is_background = np.isin(labels, list(border_labels))
    else:
        is_background = background_like
    alpha = np.where(is_background, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, "L")
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert("RGBA")
    out.putalpha(alpha_img)
    out.save(dst)
    total = alpha.size
    print(f"{dst}: {im.size} transparent={(alpha == 0).mean():.1%} "
          f"opaque={(alpha == 255).mean():.1%}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
