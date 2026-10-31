"""Reference-matched slice asset swap, rerunnable and idempotent.

Reads the parent-provided masters under assets/, writes runtime copies
under game/public/assets/, and rewrites game/assets.json in place:
new floor, sky, shotgun idle, reload frames, and front run frames go in,
and the superseded floor, sky, idle, and front run entries come out.
Reload frames and runner frames are copied at source size. Floor and
sky follow the earlier runtime sizing policy, 512 and 1024 wide, and
are resized with Lanczos. No source master is modified or deleted.
"""
import json
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(os.path.dirname(ROOT), "assets")
MANIFEST = os.path.join(ROOT, "assets.json")
PUBLIC = os.path.join(ROOT, "public", "assets")


def copy_resize(src, dst, width=None):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if width is None:
        shutil.copyfile(src, dst)
    else:
        im = Image.open(src)
        h = round(im.size[1] * width / im.size[0])
        im.resize((width, h), Image.LANCZOS).save(dst)
    return Image.open(dst).size


def entry(id_, file_, size, alpha, pivot=(0.5, 0.5), muzzle=None):
    e = {
        "alpha": alpha,
        "file": file_,
        "id": id_,
        "pivot": list(pivot),
        "rect": [0, 0, size[0], size[1]],
        "size": list(size),
        "sourceSize": list(size),
        "trimOffset": [0, 0],
    }
    if muzzle is not None:
        e["attachments"] = {"muzzle": muzzle}
    return e


def main():
    manifest = json.load(open(MANIFEST))
    assets = manifest["assets"]

    floor_size = copy_resize(
        os.path.join(SRC, "environment", "punchy_floor_dark_ink.png"),
        os.path.join(PUBLIC, "environment", "punchy_floor_dark_ink.png"),
        width=512,
    )
    sky_size = copy_resize(
        os.path.join(SRC, "environment", "punchy_sky_cyan_open.png"),
        os.path.join(PUBLIC, "environment", "punchy_sky_cyan_open.png"),
        width=1024,
    )
    idle_size = copy_resize(
        os.path.join(SRC, "weapons", "shotgun", "punchy_shotgun_idle.png"),
        os.path.join(PUBLIC, "weapons", "shotgun", "punchy_shotgun_idle.png"),
    )
    assets["punchy_floor_dark_ink"] = entry(
        "punchy_floor_dark_ink",
        "assets/environment/punchy_floor_dark_ink.png",
        floor_size,
        False,
    )
    assets["punchy_sky_cyan_open"] = entry(
        "punchy_sky_cyan_open",
        "assets/environment/punchy_sky_cyan_open.png",
        sky_size,
        False,
    )
    assets["punchy_shotgun_idle"] = entry(
        "punchy_shotgun_idle",
        "assets/weapons/shotgun/punchy_shotgun_idle.png",
        idle_size,
        True,
        pivot=(0.5, 1.0),
        muzzle=[0.095, 0.023],
    )

    reload_ids = []
    for i in range(1, 9):
        id_ = f"punchy_shotgun_reload_{i:02d}"
        size = copy_resize(
            os.path.join(SRC, "weapons", "shotgun", "frames_punchy", f"{id_}.png"),
            os.path.join(PUBLIC, "weapons", "shotgun", "frames_punchy", f"{id_}.png"),
        )
        assets[id_] = entry(
            id_,
            f"assets/weapons/shotgun/frames_punchy/{id_}.png",
            size,
            True,
            pivot=(0.5, 0.9419),
        )
        reload_ids.append(id_)
    manifest["clips"]["shotgun_reload"] = {
        "assetIds": reload_ids,
        "events": [{"name": "ammo", "timeMs": 675}],
        "frames": [
            {"durationMs": d, "id": id_}
            for d, id_ in zip(
                [150, 175, 175, 175, 225, 175, 150, 175], reload_ids
            )
        ],
        "loop": False,
    }
    manifest["weapons"]["shotgun"]["reloadClip"] = "shotgun_reload"

    run_ids = []
    for i in range(1, 9):
        id_ = f"punchy_runner_front_run_{i:02d}"
        size = copy_resize(
            os.path.join(SRC, "monsters", "runner", "frames", f"{id_}.png"),
            os.path.join(PUBLIC, "monsters", "runner", "frames", f"{id_}.png"),
        )
        assets[id_] = entry(
            id_,
            f"assets/monsters/runner/frames/{id_}.png",
            size,
            True,
            pivot=(0.5, 0.94625),
        )
        run_ids.append(id_)
    clip = manifest["clips"]["runner_run_front"]
    clip["assetIds"] = run_ids
    clip["frames"] = [{"durationMs": 71, "id": id_} for id_ in run_ids]
    clip["events"] = [
        {"name": "footstep", "timeMs": 0},
        {"name": "footstep", "timeMs": 284},
    ]
    clip["frameMs"] = 71
    clip["loop"] = True

    manifest["environment"]["floor"]["asset"] = "punchy_floor_dark_ink"
    manifest["environment"]["sky"]["asset"] = "punchy_sky_cyan_open"

    removed = ["floor_seamless", "sky_panorama", "shotgun_idle"] + [
        f"runner_run_front_{i:02d}" for i in range(1, 9)
    ]
    for id_ in removed:
        assets.pop(id_, None)
    for rel in [
        "environment/floor_seamless.png",
        "environment/sky_panorama.png",
        "weapons/shotgun/shotgun_idle.png",
    ] + [f"monsters/runner/frames/runner_run_front_{i:02d}.png" for i in range(1, 9)]:
        path = os.path.join(PUBLIC, rel)
        if os.path.exists(path):
            os.remove(path)

    json.dump(manifest, open(MANIFEST, "w"), indent=2)
    print(f"assets={len(assets)} clips={len(manifest['clips'])} removed={len(removed)}")
    print(f"floor={floor_size} sky={sky_size} idle={idle_size}")


if __name__ == "__main__":
    sys.exit(main())
