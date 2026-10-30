# Phase 2 batch 1 report

Harness: `verify.mjs`, headless Chromium cached 1248, vite preview on 127.0.0.1:5175.
Final run: 12/12 PASS. Earlier runs exposed three harness bugs, not game bugs, and one
review defect, all fixed in the harness or in review playback. Details are below.

## What was built

- `game/src/animation.ts`, new. One `AnimationPlayer` per instance. Variable frame
  durations, loop and non-loop, pause and resume, completion callback, event crossing
  once per cycle even on large steps, and loop wrap refiring only on the next cycle.
  No shared texture offset is mutated. Movement advances at render rate, art at art rate.
- `game/assets.json`, extended. 30 assets, 6 clips, status
  `phase2_batch1_run_attack_fire_flash`. New clips are `runner_run_front`,
  `runner_attack_front`, `shotgun_fire`, and `muzzle_flash`. No second registry was added.
- `game/src/assets.ts`, extended. `ClipFrame` type, `frames?` on `Clip`, `runClip` and
  `attackClip` on the enemy spec, `fireClip` and `flashClip` on the weapon spec.
- `game/src/enemy.ts`, rewritten. Three meshes per runner when clips are present:
  idle, run, attack. Each has its own material and geometry. Run phase is preserved
  across direction changes and across telegraph interruptions, because the run time
  is stored when leaving pursue and restored on re-entering it. Gait rate is the
  clamped actual horizontal speed divided by spec speed, 0 to 1.5. Telegraph is
  400 ms on attack frame 01 with a tint pulse, then the attack clip plays. Damage
  fires only at the strike event, and only if reach, height, and line of sight still
  pass at that instant. Hit and death keep the Pass 1 tint and fade. No hit or
  defeat frames exist yet.
- `game/src/weapon.ts`, rewritten. Idle mesh, fire mesh, and flash mesh. Fire frames
  use the per-frame muzzle attachments from the manifest. Flash is repositioned from
  the active muzzle node each update. The recoil spring is kept as a procedural layer.
  Sprint is covered below. `reset()` stops both players, hides the flash, shows idle,
  and resets sprint scale and bob phase. `forceFlashVisible()` replaces the old
  `flashTimeMs` debug path.
- `game/src/main.ts`, integrated. Spawns pass run and attack textures plus a varied
  start phase, 0, 0.25, 0.5, 0.75 by spawn order. `fireShot()` damage stays at click
  time, because the clip shot event is at 0 ms, so the visual and the damage share
  one timeline and the clip event does not double-apply damage. The movement loop
  computes actual horizontal speed from the player-feet delta and passes it, sprint
  key state, grounded state, and current action into WeaponView. `?view=2` shows two
  runners side by side at different run phases, animated in place. `?review=1` shows
  each new clip with Play and Pause, Step, and 1x, 0.5x, 0.25x speed, plus pivot and
  muzzle markers per frame. The `?debug=1` hook now reports run frame, attack frame,
  run phase, footstep count, fire frame, flash frame, flash visibility, and sprint
  scale. The `?view=2` caption was moved to the top right so it does not overlap the
  wave counter.

## Clips, timings, and events (measured from the manifest, verified by the harness)

- Runner run front: 8 frames, 71 ms each, 568 ms loop, about 14 art fps. Footstep
  events at 0 ms and 284 ms. Frames 2 and 6 are the same crouch pose, and 1/5 and
  4/8 are near repeats, so this is effectively a 4-pose cycle repeated twice. All 8
  frames are used as delivered. No claim of 8 distinct poses is made.
- Runner attack front: 6 frames over 700 ms, durations 100, 120, 140, 140, 100,
  100 ms. Strike event at 360 ms, the start of frame 04. Telegraph is a separate
  400 ms windup, so telegraph plus attack is about 1100 ms, slower than the old
  500 ms plus 280 ms. That slowdown is a real behaviour change to review.
- Shotgun fire: 6 frames over 270 ms, durations 40, 50, 50, 40, 45, 45 ms. Shot and
  flash events at 0 ms. Fire cooldown 750 ms stays independent of the clip.
- Muzzle flash: 6 frames over 100 ms, durations 15, 20, 20, 15, 15, 15 ms. Flash
  event at 0 ms. The last frame is already almost gone, 1.6 percent opaque, so no
  extra opacity fade was added. The flash is removed when the clip finishes.

## Pivot handling (measured, not assumed)

Run geometry: ground line 832 px, top 103 px, world height 2.0 m, plane about
2.501 m high and 1.023 m wide. Attack geometry: ground line 885 px, top 31 px, plane
about 2.136 m high and 1.212 m wide. The geometry is translated by
(pivotY minus 0.5) times plane height, so the manifest pivot, not the plane bottom,
sits at the group origin. For the run clip the pivot is at the ground line, so the
ground line equals the group origin, which is the ground plane. Contact feet touch
the ground and flight feet stay above it. Evidence: `p2-run.png` shows the runner
with its shadow directly under its feet, and `p2-review-runner_run_front.png` shows
the red pivot marker between the planted feet at the ground line.

## Muzzle estimates and verification (estimated, not measured)

Fire frame muzzles, in 468 by 912 normalized coordinates, accuracy about plus or
minus 0.03, recorded in the manifest on both the asset and the clip frame:

- Fire 01: 0.325, 0.603
- Fire 02: 0.355, 0.535
- Fire 03: 0.302, 0.620
- Fire 04: 0.375, 0.625
- Fire 05: 0.366, 0.633
- Fire 06: 0.355, 0.625

Verification: `p2-review-fire-frame0.png` shows the gold muzzle marker sitting
between the two muzzle ovals on fire frame 0, at their centre height. That is within
the stated accuracy. The same marker is repositioned per frame in review mode from
the frame attachment, so each frame can be checked the same way.

## Sprint behaviour (measured)

Accepted sprint requires the sprint key held AND actual horizontal speed above
1.0 unit per second. Holding Shift while standing still gives sprint scale 1.000.
Holding Shift while running gives 1.100. Releasing keys returns to 1.000. Blend is
exponential with a 50 ms time constant, which reaches about 95 percent in about
150 ms, inside the 120 to 180 ms target. Bob is distance-driven, phase advancing by
horizontal speed, at 0.018 amplitude, and only while grounded and moving. Reduced
motion forces scale 1.0 and zero bob. Aim, reload, and fire take priority over sprint
scale, because reload forces the sprint target to 1.0 and the fire clip replaces the
idle mesh. No camera FOV change was made. No stamina UI was added, because there is
no stamina gameplay. Evidence: `p2-sprint.png` shows the enlarged gun, and the
harness reports still 1.000, running 1.100, idle 1.000.

## Defects the review exposes (not hidden)

- Flash truncation: flash frame 1, the wide maximum, has spikes touching the left
  and right canvas edges and cut there. Evidence: `p2-review-flash-frame1.png`,
  light cell, burst touching both edges. Frames 03, 04, and 05 also touch x equals 0
  in their bboxes. All flash frames are kept as delivered, because the burst still
  reads as a burst and the old single flash is a different style that would break
  sequence continuity. No frame was replaced with the old single flash.
- Shotgun orientation snap: the idle gun is diagonal, barrels upper left and grip
  lower right. The fire frames are near vertical, barrels up and grip at the bottom.
  Firing therefore snaps orientation from diagonal to vertical and back.
  Evidence: `p2-fire-mid.png` shows the vertical fire pose, and the idle pose is
  visible in `p2-fire.png` and `p2-sprint.png`. The frames were used as delivered,
  not rotated.
- Fire frame 6 is described in the parent manifest as exact idle, but the image is
  a vertical gun, not the diagonal idle pose. It is near idle in position only.
- Review cells are independent: stepping one background cell does not step the
  other two, because each cell owns its own player. This was fixed for finished
  clips only in this batch: Play and Step now restart a finished non-loop clip,
  because otherwise a 100 ms flash clip could never be inspected after it played
  once. That restart fix is in the final build and covered by the capture script,
  not by the main harness step test, which uses the looping run clip.

## Verification results (final harness run, 12/12 PASS)

- Build: tsc and vite build pass. The 500 kB chunk warning remains, as in Pass 1.
- Run clip: distinct run frames 5, 6, 0, 1, 3, 4, 7, 2, footsteps 1 to 5.
- Two runners: left run frame 5, phase 0.73, right run frame 1, phase 0.23.
  Evidence: `p2-view2.png`.
- Attack: health 100 to 88, damage exactly 12, attack frames 1, 2, 3, 4, 5.
  Evidence: `p2-attack.png`.
- Fire and flash: fire frames 1, 2, 3, 4, 5, firing false at the end, flash off
  after the clip, flash frame end 5. Evidence: `p2-fire-mid.png` for the in-clip
  pose, `p2-fire.png` for the returned idle pose.
- Sprint: still 1.000, running 1.100, idle 1.000. Evidence: `p2-sprint.png`.
- Review: run clip stepped from frame 1 to frame 2. Evidence: `p2-review.png`,
  plus the per-clip captures below.
- Pass 1 acceptance: kill and removal, two air shots plus reload to 6 ammo,
  crate-blocked shot with tracer to z 3.10, death and restart with health 100,
  full wave clear with kiting to waveComplete. Evidence: `accept-dead.png`,
  `accept-wave.png`, `f08-crate.png` is in the Pass 1 folder and was not overwritten.

## What stayed inconclusive

- Frame rate, smoothness, and animation feel are not claimed from headless
  rendering. They need real hardware eyes.
- Pointer-lock denial UI in a real browser is still unproven, as after Pass 1.
- Muzzle estimates are visual estimates, accuracy about plus or minus 0.03, not
  measured from the artwork geometry. The gold marker check above is the verification
  that was done, and it covers frame 0 directly. Other fire frames use the same
  method and the same tolerance, and should be spot-checked the same way.
- Review slowed playback at 0.5x and 0.25x is implemented through the speed select
  and the same player, but the harness only checks stepping, not the slowed speeds
  frame by frame. The speed control exists and is visible in the review screenshots.

## Placeholders and out-of-scope items (explicit)

Hit frames do not exist. Defeat frames do not exist. Reload poses do not exist.
Sprint pose frames do not exist. Smoke phases, spark phases, and an ejected-shell
sprite do not exist. No sky, skyline, floor, wall, or crate variants were added.
No waves, score, audio, settings, superjump, grapple, melee, other weapons, other
monsters, or other directions were added in batch 1.

## Files changed (uncommitted)

- `game/src/animation.ts`, new
- `game/src/assets.ts`, edited
- `game/src/enemy.ts`, rewritten
- `game/src/weapon.ts`, rewritten
- `game/src/main.ts`, edited
- `game/assets.json`, extended
- `game/public/assets/monsters/runner/frames/`, 8 run plus 6 attack frames, copied
- `game/public/assets/weapons/shotgun/frames/`, 6 fire frames, copied
- `game/public/assets/effects/frames/`, 6 flash frames, copied
- `game/verification/phase2-batch1/`, harness, report, and screenshots, new

Nothing outside `game/` was edited. Nothing was committed, pushed, deployed, or
published. Pass 1 folders `game/verification/fix-pass1/` and
`game/verification/audit-2026-10-30/` were not overwritten.
