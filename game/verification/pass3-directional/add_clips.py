"""Add directional run clips and the front defeat clip to game/assets.json.

Reads pivot and size from the parent slice manifests and figure tops from
the alpha channel of the copied runtime frames. Run clips share the front
run timing, 71 ms per frame with footstep events at 0 and 284 ms. The
defeat clip runs 90 ms per frame, 720 ms total, with no events: removal is
driven by the defeat player finishing, not by an event.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

GAME = Path(__file__).resolve().parents[2]
SRC = GAME.parent / "assets" / "monsters" / "runner" / "frames"

RUN_CLIPS = [
    "runner_run_back",
    "runner_run_back_left",
    "runner_run_back_right",
    "runner_run_front_left",
    "runner_run_front_right",
    "runner_run_left",
    "runner_run_right",
]
DEFEAT_CLIP = "runner_defeat_front"


def figure_top(clip: str) -> int:
    tops = []
    import re

    pattern = re.compile(rf"^{re.escape(clip)}_\d\d\.png$")
    frames_dir = GAME / "public" / "assets" / "monsters" / "runner" / "frames"
    for path in sorted(p for p in frames_dir.iterdir() if pattern.match(p.name)):
        alpha = np.asarray(Image.open(path).convert("RGBA").getchannel("A")) > 16
        ys = np.where(alpha)[0]
        if len(ys):
            tops.append(int(ys.min()))
    return min(tops)


def main() -> None:
    manifest = json.loads((GAME / "assets.json").read_text())
    table = {}
    for clip in RUN_CLIPS + [DEFEAT_CLIP]:
        slice_manifest = json.loads((SRC / f"{clip}_manifest.json").read_text())
        frames = slice_manifest["frames"]
        ground_y = slice_manifest["groundY"]
        for frame in frames:
            frame_id = frame["id"]
            manifest["assets"][frame_id] = {
                "alpha": True,
                "file": f"assets/monsters/runner/frames/{frame_id}.png",
                "id": frame_id,
                "pivot": frame["pivot"],
                "rect": [0, 0, frame["size"][0], frame["size"][1]],
                "size": frame["size"],
                "sourceSize": frame.get("sourceSize", frame["size"]),
                "trimOffset": [0, 0],
            }
        if clip == DEFEAT_CLIP:
            manifest["clips"][clip] = {
                "assetIds": [f["id"] for f in frames],
                "events": [],
                "frameMs": 90,
                "frames": [{"durationMs": 90, "id": f["id"]} for f in frames],
                "loop": False,
            }
        else:
            manifest["clips"][clip] = {
                "assetIds": [f["id"] for f in frames],
                "events": [
                    {"name": "footstep", "timeMs": 0},
                    {"name": "footstep", "timeMs": 284},
                ],
                "frameMs": 71,
                "frames": [{"durationMs": 71, "id": f["id"]} for f in frames],
                "loop": True,
            }
        table[clip] = {"groundY": ground_y, "topY": figure_top(clip)}
    manifest["enemies"]["runner"]["defeatClip"] = DEFEAT_CLIP
    manifest["status"] = "pass3_directional"
    (GAME / "assets.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(table, indent=2))
    print(f"assets={len(manifest['assets'])} clips={len(manifest['clips'])}")


if __name__ == "__main__":
    main()
