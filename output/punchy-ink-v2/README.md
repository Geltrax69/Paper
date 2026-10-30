# Paper: punchy ink direction pack

Generated with built-in image generation on 31 October 2026, using the original shotgun/pistol gameplay board as a visual reference. Exact prompts are in generation-prompts.json.

- **gameplay-ui-target.png** is an illustrated composition target for the desired world, creatures, combat and live HUD. It is not a capture of implemented gameplay; its numbers and pips are illustrative.
- **monster-key-pose-guide.png** shows one reference-matched creature across eight different key poses/states. It is not an eight-frame run cycle, a cutout rig, or a registered production atlas. Some hidden-side/pose consistency still needs artist review.
- **effects-candidates.png** supplies reusable flash/impact/smoke/fragment shapes. The bottom sequence does not fade sufficiently to be a complete explosion clip. Review/correct the sequence before using it temporally.

Both cutout sheets have real alpha, checked in validation.json. That does not certify clean mattes or registered pivots: inspect low-alpha haze, effect overlap and subject edges against light/dark backgrounds. Preserve opaque ivory forms and intentional smoke/glow. Do not automatically split a generated grid into equal cells without checking every silhouette/gutter.

None of these three images is referenced by the runtime manifest. Use them for the style correction described in docs/PUNCHY_INK_GAME_PROMPT.md and derive reviewed runtime exports with explicit metadata.
