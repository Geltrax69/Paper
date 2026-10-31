# C02: runner plus insect plus brute

## What changed for the player

Waves now mix three readable families instead of one runner type. The insect is small, fast, and low, and it leaps. The brute is tall, wide, and slow, and it slams the ground in a marked circle. Both are recognizable without a label. The trio screenshot shows the runner on the left, the small insect in the center, and the large brute on the right, all at gameplay distance.

## Family stats, exactly as implemented

All families use the existing enemy controller, animation players, pathing, and spatial grid. No family is a runner recolor. Stats live in `game/assets.json` under `enemies`, one registry entry per family.

- Runner, unchanged behavior. Health 36. Speed 3.4. Radius 0.55. Height 2.0. Attack range 2.3. Damage 12. Telegraph 400 ms. Attack clip 700 ms, strike at 360 ms. No recovery hold.
- Insect. Health 24. Speed 4.6. Radius 0.45. Height 1.2. Attack range 2.0. Damage 10. Telegraph 500 ms, shown as a turquoise ground ring of radius 0.75 plus a turquoise tint and pulse. Attack clip 600 ms, strike at 270 ms. During the first 250 ms of the attack it leaps toward the player at 9 units per second, about 2.25 m of travel, with crate collision applied. Recovery hold 200 ms after the clip ends. Counterplay is to step out of range during the 500 ms telegraph or behind cover, since the leap is aimed at the position where the attack started and the strike still needs line of sight and vertical overlap.
- Brute. Health 72. Speed 2.2. Radius 0.85. Height 2.6. Slam radius 2.6. Damage 20. Telegraph 900 ms, shown as a gold ground ring of radius 2.6 plus a gold tint and pulse. Attack clip 900 ms, strike at 450 ms. The slam damages only a player whose horizontal distance is at most 2.6, whose feet are at most 1.5 high, and whose segment from the brute is not blocked by a crate or barrel. Recovery hold 900 ms after the clip ends, with the gold ring fading through recovery. Counterplay is to leave the 2.6 m circle during the 900 ms windup, jump above 1.5 m at the strike moment, or get behind cover.

Player height, cover, and real 3D reach rules from N03 apply to all three families. The insect strike uses the same chest-to-center line of sight check as the runner. The brute slam uses a horizontal distance check plus a crate segment check, not a through-wall radius.

## Spawn composition, exactly as implemented

Total enemies per wave are unchanged: 6 plus 2 per wave after wave 1, with the wave speed scale of 1 plus 0.05 per wave, capped at 1.5. The queue is built by repeating the cycle runner, insect, runner, brute and skipping a family whose count is already used, so families interleave instead of arriving in blocks.

- Wave 1: 6 runners, 0 insects, 0 brutes.
- Wave 2: 6 runners, 2 insects, 0 brutes.
- Wave 3: 5 runners, 3 insects, 2 brutes.
- Wave 4: 7 runners, 3 insects, 2 brutes.
- Wave 5: 7 runners, 4 insects, 3 brutes.

General rule: brutes appear from wave 3 as the smaller of 2 plus half the waves past 3, rounded down, and a quarter of the wave total. Insects appear from wave 2 as the smaller of 30 percent of the wave total, rounded down, and the total minus brutes minus one runner. Runners take the remainder. The active cap of 12 and the attack cap of 4 from N08 apply across all families combined, not per family. Wave completion, score, combo, pickups, and barrel explosion scoring are unchanged, and kills of any family score 100 times the combo multiplier at the death transition.

## Dropped art frames

- Insect run: frames 1 and 8 are side views. Only frames 2 to 7, six frames, are used for the front run clip. The side frames are not in the manifest.
- Insect attack: frame 1 is a side view, low and left-facing. Only frames 2 to 6, five frames, are used. Frame 2 is the rear lift with raised antennae, frame 3 is the leap and strike, frames 4 to 6 are recovery.
- Brute run: frame 1 is a side view. Only frames 2 to 8, seven frames, are used for the front run clip.
- Brute attack: all six frames are front views and all six are used. Frames 1 to 3 are the overhead windup, frame 4 is the slam, frames 5 and 6 are recovery. Every brute attack frame carries a small gold triangle baked in at the feet, which reads as part of the ground warning mark in game.

## Fallbacks, stated plainly

- No directional, hit, or defeat art exists for insect or brute. Both families use the front run clip for every direction, with the existing hysteresis logic keeping the front pose. Directional art for these families is still missing.
- No bespoke defeat clip exists for either family. A kill shows the run pose with a tint and fade over 800 ms, then the enemy is removed. This is not a bespoke defeat animation and is not claimed as one.
- The insect telegraph does not add a separate procedural antennae mesh. The rear lift is visible in the attack art itself, and the telegraph cue is the turquoise ring, tint, and pulse.
- The brute slam impact reuses the shared heavy impact effect plus a synthesized slam sound. No new effect texture was added for the slam.
- Brute attack frames are tinted gold during telegraph, which makes the whole brute read yellow in the telegraph screenshot. The gold ring on the ground is the precise radius cue, the tint is only a state cue.

## Audio

Synthesized only, no audio files. Insect attack entry plays a rising sine plus noise as `insectLeap`. Brute attack entry plays a low sawtooth windup as `bruteWindup`. The brute strike plays a low noise and sine thump as `bruteSlam` plus the heavy impact effect. Runner attack sound is unchanged.

## Files changed, uncommitted

- `game/assets.json`: 24 new runtime assets, 4 new clips, insect and brute enemy specs, runner spec given explicit family fields with unchanged values.
- `game/src/assets.ts`: `EnemySpec` gains family, attackKind, telegraphMs, leapSpeed, leapMs, slamRadius, and recoveryMs. Added `enemySpec(id)`.
- `game/src/enemy.ts`: family-driven telegraph time and tint, warning ground ring for insect and brute, leap movement, slam damage rule, recovery hold after the attack clip, front-only direction for non-runner families, run-pose fade defeat when no defeat clip exists, warning disposal.
- `game/src/audio.ts`: `insectLeap`, `bruteWindup`, `bruteSlam`.
- `game/src/main.ts`: spawn queue now carries a family per entry, `buildSpawnQueue` composition, per-family clip textures with measured top values, mixed-family attack sounds, slam impact and sound at the strike event, debug additions `spawnFamilyAt` and `getWaveComposition`, family and warning fields in `getState`, and `activeEnemies` in `getCaps`. HUD wave text now says Enemies left instead of Runners left. Menu text now says runner, insect, and brute waves.
- `game/public/assets/monsters/insect/frames/`: 11 selected frames copied from the parent slices.
- `game/public/assets/monsters/brute/frames/`: 13 selected frames copied from the parent slices.
- `game/verification/fix-c02-monsters/verify.mjs` and `report.json`: the new harness and its result.

Measured top values used for geometry, from the alpha bounding boxes of the used frames: insect run 193, insect attack 51, brute run 37, brute attack 62. Run clip timings: insect 6 frames at 60 ms, footstep events at 0 and 180 ms. Brute 7 frames at 90 ms, footstep events at 0 and 315 ms.

## Verification

- Build: `npm run build` passes, tsc plus vite, chunk 679.20 kB with the pre-existing chunk warning.
- New harness `game/verification/fix-c02-monsters/verify.mjs`: 24 of 24 PASS. Evidence in `game/verification/fix-c02-monsters/`:
  - `trio.png`: runner, insect, brute side by side.
  - `composition-wave3.png`: wave 3 queue.
  - `insect-telegraph.png`: insect close to the camera, antennae up, turquoise ring at the bottom edge.
  - `insect-attack.png`: insect attack pose.
  - `brute-telegraph.png`: brute in gold telegraph tint with the gold ring across the floor.
  - `brute-attack.png`: brute attack pose.
  - `brute-recovery.png`: brute after the slam.
  - `attack-cap-mixed.png`: brutes in gold telegraph tint surrounding the player with a runner in the center.
  - `report.json`: measured values. Insect warning radius 0.75, health 100 to 90, `insectLeap` count 1. Brute warning radius 2.6, health 100 to 80, still in attack after the strike for recovery, `bruteWindup` and `bruteSlam` counts 1 each. Kills: insect 100 and combo 1, then brute 200 total and combo 2. Cover: both families held at health 100 behind the crate at (3,1) in the scripted setup. Attack cap: maximum 2 attackers with 7 in telegraph at the sampled moment, never above 4. Reduced motion: roll 0, camera exactly at feet plus 1.7 eye height during a brute slam. Prior acceptance in the same harness: two shots 6 to 4, reload transfer to 6, runner kill score 350, crate-blocked shot health 36 with tracer z 4.9 and one decal with normal (0,0,1), directional left clip, aerial melee no damage, behind-camera grapple to (-3,1.5,-2), double jump count 2, sprint scale 1.1, barrel explosion cover and detonation, death restart at health 100, wave clear, HUD wave and ammo, wave 5 cap 12 active with 2 queued.
- Portable suite `npm test` (`game/verification/fix-n08-n11/verify.mjs`): all sections pass except one stability check, described below. N04 ledge grounding passes there, as do N03, N05, N10, crate-blocked shots, barrel explosion, and the wave 5 cap.

## Open issue: stability texture count

The portable suite's stability check compares texture counts after wave 3 and wave 4 clears and now fails. Measured in the portable suite, first run: wave 2 textures 30, wave 3 textures 32, wave 4 textures 33, while geometries settle at 18 in all three waves. Second run: 29, 31, 32, same pattern with absolute counts lower by one. Before this change the same check passed at 27, 27, 27. A separate probe that cleared waves 1 through 6 in sequence measured geometries 18 throughout and textures 22, 26, 29, 31, 34, 35. The count therefore keeps growing past wave 4, not just by one wave. The likely cause is lazy GPU upload of new visual content as it first renders: new families stagger their first appearances across waves, and the stability probe's kill-from-above method kills enemies before they cycle through all run frames and directions, so each wave reveals a few more direction and frame textures. Geometries settle, and no code path in this change creates a texture per enemy, which argues against a per-enemy leak, but this is not yet proven. A texture-name instrumented probe would be needed to name exactly which textures appear in wave 5 and 6. Until that is done, `npm test` does not fully pass, and that failure is reported here rather than hidden. Startup bytes in that suite also rose to 45,473,804 total with 133 responses, against the older 40,049,406 bytes at 101 assets, because the 24 new frames are shipped at full slice size. Runtime-sized exports and atlas packing remain out of scope here and are still owed by the N08 budget work.

## Inconclusive

- Real-hardware frame rate, smoothness, and attack feel are not claimed from headless numbers. Headless frame time sits at the 50 ms dt clamp ceiling.
- Headless audio audibility was not heard. Only context counts, gains, and call counts were measured.
- Brute slam damage at the exact feet-height boundary of 1.5 m was not sampled. The rule is implemented and the grounded case is proven, the boundary case is not.
- The insect leap passing through a crate was not headless-proven frame by frame. Crate collision is applied to leap movement and the strike line of sight check is proven blocked, but the leap path itself was not traced.
- Screenshots do not certify animation timing. Clip timings are from manifest durations and state polling, not from recorded video.
