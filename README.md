# Paper

Paper-and-ink arcade shooter visual development based on [gun.mp4](gun.mp4).

## Playable vertical slice

The build in [game/](game/) has one shotgun, eight-direction runner animation, waves, score/combo, pickups, synthesized sound, settings, sprint, double jump, dash, grapple and melee. Run it from `game/` with `npm ci`, then `npm run dev`; for production preview run `npm run build` followed by `npm run preview`. The screenshots immediately below show the original milestone, not the latest art review.

## Current audit and punchy ink direction

- [Current fix plan, audited at 6f109f2](fix.md)
- [Reference-matched game, animation and UI implementation prompt](docs/PUNCHY_INK_GAME_PROMPT.md)
- [Matching asset prompts and all 40 optimization techniques](docs/PUNCHY_INK_ASSET_PROMPTS.md)
- [New illustrated gameplay/UI target and candidate-art notes](output/punchy-ink-v2/README.md)
- [Latest actual gameplay capture](game/verification/audit-2026-10-31/gameplay-desktop.png)

The new direction pack is a target and source-art guide. Its planned restyle, reload poses, monster families and explosion gameplay are not yet integrated into the runtime.

![Paper arena, shotgun overlay, and one runner](game/verification/view-1.png)

![Paper gameplay, shotgun in hand and a runner approaching](game/verification/gameplay.png)

## Game-building and image prompts

- [Master prompt: build the image-based 2.5D web game](docs/GAME_BUILD_PROMPT.md)
- [Image prompt pack: transparent weapons, monsters, effects and scenery](docs/IMAGE_PROMPTS.md)
- [Example sprite/atlas manifest](docs/ASSET_MANIFEST_EXAMPLE.json)

The plan uses a small spatial scene for movement and collision, with image-based weapons, animated enemy cutouts and layered environment art. Start with one shotgun and one monster before expanding the asset library. The vertical slice above is now playable, with newly generated shotgun and runner sprites. The full game described in these documents is still future work.

### Slice sprites

These are four original source images from the first slice, after alpha extraction (see `scripts/make_alpha.py`). The current manifest contains 101 images, including animation frames and environment layers; these four previews are not the complete runtime library. Raw generator files stay under their source folders.

<img src="assets/weapons/shotgun/shotgun_idle.png" alt="Paper shotgun sprite" width="400">

<img src="assets/monsters/runner/runner_front.png" alt="Paper runner sprite" width="300">

<img src="assets/effects/muzzle_flash_shotgun.png" alt="Paper muzzle flash sprite" width="300">

<img src="assets/scenery/crate_face.png" alt="Paper crate face texture" width="300">

## Gameplay concepts

Three generated boards explore richer colors and distinct combat effects while retaining the original ink-and-paper aesthetic. Each board contains two gameplay concepts.

| Weapons | Reference image |
| --- | --- |
| Shotgun and pistols | [Open board](output/gameplay/01-shotgun-pistols.png) |
| Automatic gun and blaster | [Open board](output/gameplay/02-automatic-blaster.png) |
| Grenades and throwing knives | [Open board](output/gameplay/03-throwables-knives.png) |

![Shotgun and pistol gameplay concepts](output/gameplay/01-shotgun-pistols.png)

[Video analysis and effect direction](output/gameplay/analysis.md) · [Generation prompts](output/gameplay/generation-prompts.md)

## Shotgun modeling reference

[Six-view shotgun sheet](output/shotgun/shotgun-turnaround.png) · [Blender setup notes](output/shotgun/README.md) · [Generation prompt](output/shotgun/generation-prompt.md)

![Shotgun exterior modeling reference](output/shotgun/shotgun-turnaround.png)

The sheet is an interpreted prop variant. Its top view conflicts with the vertically stacked barrels shown in the other views; prioritize the front and side views when modeling. Bottom and rear three-quarter views are not included.

## Video reference frames

- [Contact sheet sampled across the video](output/reference/contact-sheet.jpg)
- [Gameplay reference frame](output/reference/gameplay-reference.png)
- [Sampled firing sequence](output/reference/shooting-sequence.jpg)

Images were created with built-in image generation as visual concepts. The repository now contains a playable vertical slice in `game/`. It does not yet contain a Blender model or the full game. The original video is unchanged.
