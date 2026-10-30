# Paper

Paper-and-ink arcade shooter visual development based on [gun.mp4](gun.mp4).

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

Images were created with built-in image generation as visual concepts. This repository does not yet contain a playable game or a Blender model. The original video is unchanged.
