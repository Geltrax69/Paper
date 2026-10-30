# Pass 3 directional runner views, spawn, impact, and defeat effects

Harness: `verify.mjs`, headless Chromium cached 1248, vite preview on 127.0.0.1:5176.
Final run: 16/16 PASS. An earlier 6/12 run failed on harness timing, not on game
code. The cause is measured, not guessed. On this VM the headless game loop
renders slowly and each frame is clamped to 50 ms, so game time advances at
about one fifth of real time. A 4000 ms decal therefore needs about 20 s of
real time to expire, a 750 ms fire cooldown needs about 4 s, and a 1400 ms
reload needs about 7 s. The fixed harness waits on game state (cooldowns,
reload flags, decal counts, removal) instead of short real-time sleeps. On
real hardware at 60 fps the loop delta is about 16 ms and game time tracks
real time. No frame rate or feel claim is made from headless rendering.

## What was built

- `game/src/enemy.ts`, extended. One run player per runner, shared across all
  eight run directions, so run phase survives a direction change. Direction
  owns only visuals: one run mesh whose geometry and texture switch per
  direction. Attack, hit, and telegraph keep the existing front clips.
- `game/src/assets.ts`, extended. `EnemySpec` gains `defeatClip`.
- `game/src/main.ts`, extended. Directional textures are built from a single
  exported direction table, impact decals are created per shot impact and
  updated in every render path, and debug exposes direction, run clip,
  defeat frame, spawn cue, decals, and a direction override.
- `game/assets.json`, extended by `verification/pass3-directional/add_clips.py`.
  101 assets, 14 clips, status `pass3_directional`. Figure tops are measured
  from the alpha channel of the copied frames, not guessed from canvas size.
  The script rewrites the whole file with expanded arrays, so the diff is
  large, but a parsed comparison confirms no pre-existing asset, clip,
  weapon, environment, or enemy entry changed except the added defeatClip
  field and the status string.
- `game/public/assets/monsters/runner/frames/`, 64 new run frames and 8
  defeat frames, copied from the parent-provided slices and hash-identical
  to them for the spot-checked frame.

## Clips, timings, and events

- Every run direction: 8 frames, 71 ms each, 568 ms loop, footstep events at
  0 ms and 284 ms, exactly as the front run clip.
- `runner_run_front` 373x912 ground 832 top 103.
- `runner_run_front_right` 400x800 ground 756 top 51.
- `runner_run_right` 400x800 ground 729 top 82.
- `runner_run_back_right` 320x960 ground 908 top 32.
- `runner_run_back` 400x800 ground 775 top 46.
- `runner_run_back_left` 400x800 ground 800 top 35.
- `runner_run_left` 342x912 ground 809 top 108.
- `runner_run_front_left` 342x912 ground 808 top 113.
- `runner_defeat_front`: 8 frames, 90 ms each, 720 ms total, no events,
  order hit recoil, stagger, arms up, kneeling, leaning, falling, crumpled
  on ground, ink fragments. Removal is driven by the defeat player
  finishing, not by an event.

## Direction selection rule, exactly as implemented

Direction is chosen from the enemy movement heading relative to the camera.
`toCamera` is the angle from the enemy to the camera. `relative` is the
heading angle minus `toCamera`, normalised to (-pi, pi]. The sector index is
`round(relative / 45 degrees)` mod 8, in this order: front, front-right,
right, back-right, back, back-left, left, front-left. Relative 0 means the
enemy moves toward the camera and shows front. Relative +90 degrees means
it moves toward the camera's right and shows right. The same run player
keeps its time across the switch, so the frame index and phase continue
instead of restarting. Starting phases still vary by spawn order, 0, 0.25,
0.5, 0.75. A debug-only override, `setRunnerDirection`, forces a direction
for the harness. It is gated behind `?debug=1` like the other debug setters.

## Spawn, impact, defeat, and scoring rules

- Spawn cue: a floor-facing ink ring under the runner, growing from 0.3 to
  1.3 scale while fading from 0.9 to 0 opacity over the 500 ms spawn period.
  It ends exactly when the runner leaves spawn and becomes hittable. The
  existing 500 ms invulnerability policy is unchanged, and the spawn scale
  fade-in is kept.
- Impact decal: one decal per pellet impact on a solid or floor point, not
  for runner hits, which already show burst particles. Floor points get a
  floor-facing circle at y 0.03. Higher solid points get a camera-facing
  circle offset 0.03 toward the camera. Radius 0.35, opacity 0.55, lifetime
  4000 ms of game time, fading over the last 1000 ms. Pool is capped at 12,
  oldest removed first. Decals are world-space objects, not an overlay, so
  they never draw over the reticle as UI. Seven pellets landing close
  together merge visually into one larger blotch, as seen in `impact.png`.
- Defeat: killing damage moves the runner to death, which plays the front
  defeat clip on a defeat mesh. The runner is non-hittable from the start
  of defeat, since `takeDamage` returns `dead` for the death state, and the
  harness confirms a second damage call returns `dead` with no extra score.
  The runner is removed when the defeat player finishes. Score is counted
  once, at the death transition in `main.ts`, exactly as before. When the
  killed runner is also the last runner of a wave, the wave bonus is added
  too, so the measured gain in the defeat test is 350, meaning 100 kill
  plus 250 wave 1 bonus, not a double kill score.
- Shadows stay under the feet in all directions, because every direction
  geometry places its manifest ground line at the group origin and the
  shadow mesh sits at group origin height 0.02.

## Verification results, final harness run, 16/16 PASS

- Build: tsc and vite build pass. The 500 kB chunk warning remains, as in
  earlier passes. The JS chunk grew to about 617 kB, measured, because the
  manifest is imported into the bundle and now lists 101 assets.
- Eight forced directions map to eight clips, in order front, front-right,
  right, back-right, back, back-left, left, front-left. Evidence: `dir-all.png`.
- Natural direction change preserves run phase: front-left to left, phase
  0.43 to 0.51, frame 3 to 4. Evidence: `dir-change.png`.
- Defeat clip reaches frame 7, the fragments frame, the enemy is removed,
  score gain is 350 with the wave bonus, and a second damage call returns
  `dead`. Evidence: `defeat.png`.
- Spawn cue is visible during spawn and gone in pursue. Evidence: `spawn.png`.
- Impact decals appear, 7 after one floor shot, and expire to 0.
  Evidence: `impact.png`.
- Two shots and reload: ammo 6 to 4, then back to 6. Kill and removal pass.
  Sprint scale is 1.1 running and 1.0 idle. Crate-blocked shot leaves
  decals on the crate face at z -5.37. Fire pose stays diagonal.
  Evidence: `fire-mid.png`.
- Two runners out of phase: phases 0.47 and 0.97. Evidence: `view2.png`.
- Environment layers present: sky, skyline, ruins, floor, wall, and all
  three crate variants. Player death reaches phase dead with health 0, and
  restart returns health 100. Full wave clear leads to wave 2 with pickups
  present. Evidence: `wave-complete.png`, `wave2.png`.
- Review mode shows all eight new run clips and the defeat clip with
  frame stepping. Evidence: `review-defeat.png`.

## Costume drift and frame fragments, found and not hidden

- The generator drifted costumes across directions, measured by eye from
  the frames and from `dir-all.png`. Front-right wears a hooded tunic with
  claw feet. Back-left wears a bandit head wrap. Front-left and back-right
  are barefoot. Left and right suits differ in colour. At gameplay distance
  the silhouettes still read as different directions, but costume details
  change when an enemy turns. No art was regenerated in this batch.
- Equal-cell slicing cut figures and neighbours. Front-right frame 01 is
  clipped at the right edge, where an arm is cut, and carries a thin drawn
  ground-line segment across the full width at ground level. In game that
  line reads as a ground contact line under the runner. Left frame 04
  carries two neighbour foot fragments at the bottom corners. Defeat
  frame 07 is clipped at the left edge and carries small slivers at the
  edges. Fragments below the ground line are mostly hidden by the floor
  in game. Fragments at mid height, such as the defeat edge slivers, can
  show at close range. No frame was cleaned or regenerated in this batch.

## Placeholders and out-of-scope items, explicit

Directional attack, hit, and defeat clips do not exist. Hit frames, reload
poses, sprint pose frames, smoke, spark, and shell do not exist. No weapon,
environment, wave, score, pickup, audio, or settings logic changed, except
defeat scoring stays exactly once at the death transition and spawn timing
stays 500 ms. No superjump, grapple, melee, additional weapons, or
additional monsters were added.

## What stayed inconclusive

- Frame rate, smoothness, and animation feel are not claimed from headless
  rendering. They need real hardware eyes.
- Pointer-lock denial UI in a real browser is still unproven, as after
  earlier passes.
- Fire pose diagonality is confirmed by eye from `fire-mid.png`, not by
  an automated angle measurement.
- The defeat shadow stays at full opacity until removal, since the defeat
  clip replaces the old fade. That is a visible choice, not a measured
  defect, and it ends when the runner is removed.
