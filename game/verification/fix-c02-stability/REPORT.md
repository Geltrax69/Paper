# C02 stability regression: lazy first-upload, not a leak

## Verdict

After C02 added insect and brute families, `npm test` failed only its stability
check: geometries settled at 18 after every wave, but textures grew across
waves (portable suite: wave 2 at 29–30, wave 3 at 31–32, wave 4 at 32–33,
against 27, 27, 27 before C02). The probe below proves the growth is lazy
GPU upload of new family frames and runner directions as they first render,
not a per-enemy or per-wave leak. No game code path creates a texture per
enemy: `loadTextures` in `src/assets.ts` creates exactly one `THREE.Texture`
per manifest asset id, enemy materials share those maps, and enemy `dispose()`
disposes geometries and materials but not textures, which is correct for
shared textures. Three.js 0.186.0 `renderer.info.memory.textures` counts a
texture only when its first render creates a WebGLTexture, and the count never
drops when an enemy is disposed, so it rises only when a previously unrendered
texture first renders.

Plateau, measured with a complete warmup: warmup complete 69 textures,
21 geometries, then waves 4, 5, 6, 7, 8 all at 69 textures and 21 geometries.
Wave 8 has 20 enemies (12 active, 8 queued) and adds nothing. That is the
plateau point: the last new texture appears during warmup, and five
consecutive post-warmup waves are flat.

## Probe method

All probes run headless Chromium from the Playwright cache via exec, against
a `vite preview` server, using only the existing `?debug=1` API plus one
temporary debug method described below. Headless game time advances slowly
and each frame's dt is clamped to 50 ms, so every probe waits on game state
(frame indices, phase), never on short real-time sleeps.

- `probe.mjs` / `probe-run.log` / `probe.json`: first probe. Page 1 forced
  direction and frame cycling; page 2 replayed the original sequence (waves
  1–3 via `killAll`, which kills from above). Two probe bugs, found and fixed,
  not hidden: page 1 first failed because a runner that reaches the player
  stops walking, so its run frames freeze; later segments spawn a fresh runner
  and keep the player far away. Page 2 first broke immediately for waves 2
  and 3 because it checked phase before waiting for `playing`, so it exited
  while phase was still `waveComplete` from the previous wave.
- `census.mjs` / `census.json`: names visible map sources by traversing the
  scene. It needed texture names, which `renderer.info` does not expose, so
  a temporary debug-only `listSceneTextures` method was added to the debug
  API in `src/main.ts`, used, and removed (verified 0 matches in the file
  after removal). The census distinguishes visible sources (current frame)
  from the info count (cumulative since page load): sky is `scene.background`,
  not a mesh map, and canvas textures (pickups, barrel, FX) are in the info
  count but have no file source. Census failed at the runner attack segment
  (timeout under headless load with full-scene traversals inside the wait
  loop) and did not reach post-warmup waves; its `census.json` was still
  written in `finally`.
- `warmup.mjs` / `warmup-run.log` / `warmup.json`: warms runner directions,
  runner/insect/brute attacks, and insect identity, then clears waves 4–6.
  Two warmup bugs, found and fixed: killing a runner for its defeat frames
  triggers `waveComplete`, so the next family spawned frozen in a non-playing
  phase and never attacked (fixed by restarting via Start before each family);
  and `startWaveDebug` never requests pointer lock, while phase `playing` is
  set only by the `pointerlockchange` event, so later waves needed a Start
  click to resume (fixed for waves 5–6; wave 4 worked because phase was still
  playing from the identity segment).
- `plateau.mjs` / `plateau-run.log` / `plateau.json` /
  `plateau-post-waves.png`: the deciding probe. Complete warmup with the
  camera facing the runner (yaw 0.785, so frames actually render), then waves
  4–8 with cumulative file-source sampling during each wave. One plateau bug,
  found and fixed: the first plateau run called `setRunnerDirection(dir)`
  with one argument, but the API takes `(index, direction)`, so the override
  never applied and runners showed their natural front; the rerun uses
  `setRunnerDirection(0, dir)`. The first plateau run also failed at wave 4
  start for the pointer-lock reason above; the rerun requests pointer lock
  directly after `startWaveDebug(4)`.
- `debug-*.mjs`: diagnostic scripts only (insect frame cycling, fine-grained
  count changes, single-direction and two-direction uploads, insect attack
  state logging). They are not the portable check and are not presented as
  one.

## Texture names per wave

### Original sequence (probe page 2, second run; geometries 18 throughout)

- Wave 1 clear: textures 22. Frames seen: front run 01, 03, 05, 07 plus
  defeat 01–08. Only front run and defeat render, because `killAll` kills
  from above before enemies cycle other frames or directions.
- Wave 2 clear: textures 26. New: insect run 05, 06. Insects first appear
  in wave 2.
- Wave 3 clear: textures 28 in the second run (30 in the first run; the
  ±2 spread is which frames happen to render before `killAll` kills).
  New: brute run 03. Brutes first appear in wave 3.
- Direction of growth: counts move with first render of new family frames,
  not with enemy count. Geometries stay flat at 18 in every wave.

### Warmup (warmup.mjs, deterministic across two runs)

Baseline 13 textures, 18 geometries after clear. Directions (override set,
no yaw facing): front 15, front-right 19, right 23, back-right 26, back 29,
back-left 32, left 35, front-left 38. Runner attack 6/6 frames, textures 46.
Runner defeat 8/8 frames, textures 54. Insect attack 5/5 frames, textures 59.
Insect defeat 0/0 (no defeat clip), textures 60. Brute attack 6/6 frames,
textures 71. Brute defeat 0/0, textures 71. Identity (below) 74. Warmup
complete 75 textures, 26 geometries. Post-warmup waves: wave 4 at 76,
wave 5 at 76, wave 6 at 77, all geometries 22.

The warmup per-direction deltas (+2 to +4, not +8) do not contradict the
direct tests, which give exactly +8 for a new direction in isolation
(front +8, front-right +8, and census left/front-right/right/back-right
+8 each). In a sequential warmup page, many frames are already uploaded
before their segment: the initial wave 1 runner, spawn-gap renders between
spawn and direction set, and attack frames during long run segments all
upload frames early. Segment deltas therefore undercount per-direction
uploads; the direct tests are the clean causal evidence, and the warmup
totals are the coverage evidence.

### Warmup wave 6 +1, explained as a coverage gap, not a leak

Warmup did not set yaw during direction segments and did not cycle brute
run fully (the brute attack segment starts 2 units from the player, so only
a few run frames show before the attack). One frame therefore first rendered
in wave 6 (75 → 76 → 76 → 77). Plateau, which faces the camera at the runner
and cycles insect run (6/6) and brute run (7/7) fully, is flat from wave 4
onward, which closes that gap. If wave 6's +1 were a per-wave leak, plateau
waves would keep growing; they do not.

### Plateau (plateau.mjs, deciding evidence)

Baseline 13 textures, 21 geometries (baseline here is after start, with the
wave 1 runner already rendered, unlike warmup's post-clear baseline of 18).
Directions (override set, yaw facing): front 17, front-right 22, right 29,
back-right 34, back 39, back-left 44, left 50, front-left 56. Insect run
6/6, textures 59. Brute run 7/7, textures 67. Runner attack 6/6, textures 69.
Runner defeat removal, textures 69. Insect attack 5/5, textures 69. Brute
attack 6/6, textures 69. Warmup complete 69 textures, 21 geometries.

Post-warmup waves, all phase `waveComplete`:

- Wave 4: 69 textures, 21 geometries, 31 cumulative file sources sampled.
- Wave 5: 69, 21, 25 sources, 0 newly sampled.
- Wave 6: 69, 21, 29 sources, 5 newly sampled.
- Wave 7: 69, 21, 25 sources, 2 newly sampled.
- Wave 8: 69, 21, 32 sources, 8 newly sampled.

The newly sampled sources in waves 6–8 (for example front run 03 and 07,
insect run 03–07, brute run 03–05, 07, 08) are sampling gaps, not uploads:
polling every 200 ms while `killAll` kills quickly misses frames, so a frame
that warmup already uploaded may first appear in a later wave's sample. The
proof is the count: if those 5, 2, or 8 sources were new uploads, the count
would have risen by that much; it stayed at 69 across all five waves. The
wave 4 sample includes environment, front run, attack, defeat, insect
run/attack, brute run/attack, and weapon idle/fire/reload/flash frame 01
sources; it is a sample, not a complete census, for the same polling reason.

## Per-enemy texture identity

- Census second insect: a second insect added no new file sources
  (cumulative visible sources stayed at 19; distinct visible UUIDs 9 → 10
  for the second insect's own mesh, with no new file source). Its info count
  rose by 1 with no new file source, consistent with a canvas FX texture,
  not a frame texture; it does not recur as a per-enemy pattern.
- Warmup identity: after insect A 71 textures, after insect B 74, delta +3,
  with insect A run frames 0–5 all shown. The +3 is bounded and does not grow
  with further insects: plateau waves 4–8 contain 12, 14, 16, 18, and 20
  enemies respectively and stay at 69. A per-enemy frame leak would add at
  least the 6 insect run textures per insect; it adds none.
- Two insects therefore share the same frame textures; no texture is created
  per enemy instance. The code reading agrees: one texture per manifest
  asset, shared maps, no `new THREE.Texture` or `clone()` in enemy code.

## Stability check premise change

`verification/fix-n08-n11/verify.mjs`, check `n08-stability`, now warms up
before comparing, instead of comparing early waves:

- Runner: all 8 directions × 8 run frames, with `setRunnerDirection(0, dir)`,
  player far away, camera facing the runner (yaw 0.785).
- Insect: run 6/6, attack 5/5. Brute: run 7/7, attack 6/6. Runner: attack 6/6
  plus defeat 8/8 (insect and brute have no defeat clip; their kills fade
  the run pose, which the check waits on via removal).
- After warmup, wave 4 is cleared as a settling wave, then waves 5 and 6 are
  cleared via Start clicks, and the check compares wave 5 vs wave 6.
- Pass threshold unchanged: exact equality of geometries and textures
  between the two post-warmup waves. The old wave 3 vs wave 4 comparison is
  superseded, not weakened: a per-enemy or per-wave texture creation path
  would still fail the new comparison, because it would grow across waves 5
  and 6 as well.
- The check uses only the existing debug API (`spawnFamilyAt`,
  `setRunnerDirection`, `getState`, `damageRunner`, `setPlayerFeet`, `setYaw`,
  `clearRunners`, `startWaveDebug`). It does not depend on the temporary
  `listSceneTextures` method, which was removed from `src/main.ts` before
  the final build (verified 0 matches).
- `VERIFICATION.md` gained a "Stability check premise (updated for C02)"
  subsection pointing to this report. The historical N08 report text was not
  rewritten as if it were never true.

## Files changed (uncommitted)

- `game/verification/fix-n08-n11/verify.mjs`: stability block replaced
  with the warmed-up premise above; no other check changed.
- `game/VERIFICATION.md`: new premise subsection; no other section changed.
- `game/verification/fix-c02-stability/`: new folder (probe, census, warmup,
  plateau, debug scripts, logs, JSON, screenshots). No earlier verification
  folder was overwritten.
- `game/src/main.ts`: no net change from this task. The temporary
  `listSceneTextures` debug method was added, used, and removed; the working
  tree diff for this file is the pre-existing uncommitted C02 change, which
  was not discarded. Verified with grep: 0 matches for `listSceneTextures`.
- No game logic changed: no weapon damage, wave, score, combo, pickup, or
  settings logic touched; N08 caps, spatial grid, C01 explosion, and C02
  family stats and composition are intact.

## Build and portable suite (final run, 2026-10-31)

- `npm install` in `game/`: succeeds.
- `npm run build` in `game/`: passes with no TypeScript errors (Vite
  chunk-size warning only, pre-existing). Chunk about 679 kB, same order as
  the C02 report.
- `npm test` end to end: **23/23 PASS** (was 22/23 before this task, with
  only the stability check failing). The new stability line reads:
  `PASS n08-stability Post-warmup waves 5 and 6 settle at the same geometry
  and texture counts: beforeGeo=21 midGeo=51 afterCycleGeo=21 insectRun=6/6
  bruteRun=7/7 runnerAttack=6/6 insectAttack=5/5 bruteAttack=6/6
  warmedTex=60 warmedGeo=20 wave4Geo=20 wave4Tex=60 wave5Geo=20 wave5Tex=60
  wave6Geo=20 wave6Tex=60`. The absolute count (60) differs from plateau's
  (69) because a fresh page uploads a different subset of weapon and FX
  textures before the stability comparison; what the check proves is
  flatness within its page (60 across waves 4, 5, 6), not a universal
  absolute count. Full log: `verification/fix-n08-n11/npm-test-run.log`;
  report: `verification/fix-n08-n11/report.json`.
- Prior acceptance in the same run still passes: two shots, reload transfer,
  kill score 350, crate-blocked shot, directional left clip, aerial melee,
  behind-camera grapple, double jump, sprint, barrel explosion cover and
  detonation, decal stability, and 1920×1080 play.

## Screenshots

- `game/verification/fix-c02-stability/warmup-post-waves.png`: wave-complete
  menu after warmup waves 4–6 (warmup run, before the plateau rerun).
- `game/verification/fix-c02-stability/plateau-post-waves.png`: wave-complete
  menu after plateau waves 4–8, all at 69 textures.
- `game/verification/fix-c02-stability/probe-original-sequence.png`: from
  the first probe's original-sequence page (waves 1–3, before the poll fix;
  counts in the log are the fresher record).
- Screenshots do not certify animation timing; clip timings come from
  manifest durations and state polling, not recorded video.

## Fallback and placeholder

- No directional, hit, or defeat art exists for insect or brute beyond the
  C02 fallback (front run clip for every direction, run-pose fade defeat).
  The warmup cycles what exists; it does not claim directional attack art
  for those families.
- Per-wave file-source lists are samples, not complete censuses, because
  polling is sparse relative to frame cycling and `killAll` kills quickly.
  The plateau conclusion rests on the info count (69 flat across five
  waves), not on any single wave's sampled source list.
- The warmup identity +3 and the census second-insect +1 are single
  unexplained info increments with no new file source, most plausibly canvas
  FX textures (footstep dust, landing burst). They are bounded, do not recur
  per enemy, and are not frame leaks; they are not hidden, but they are not
  fully identified by name, because canvas textures have no file source.

## Failed or stayed inconclusive

- Census failed at the runner attack segment (timeout under headless load
  with full-scene traversals inside the wait loop) and never reached
  post-warmup waves; warmup and plateau supersede it for the plateau
  conclusion, and census is retained only for its per-direction +8 and
  second-insect identity evidence.
- The first plateau run failed twice (wrong `setRunnerDirection` arity, then
  the pointer-lock wave 4 start); both were probe bugs, fixed, and the rerun
  is the evidence quoted above. The first warmup run failed at insect attack
  for the waveComplete-phase reason above; the rerun is the evidence quoted.
- Out-of-scope observation, not fixed (task forbids changing pickup logic,
  and the stability probe never collects pickups): in `src/pickups.ts` a
  `Pickup` creates one `CanvasTexture` per instance, and a taken pickup is
  removed from the scene but not disposed, while `spawnPickups()` creates a
  new `Pickup` for a taken kind at the next wave. That is a possible
  per-wave canvas-texture accumulation in normal play where pickups are
  collected every wave. It is a code-reading observation, not proven by this
  probe (probe player never collects pickups), and it is not the stability
  failure, whose growth is fully explained by first-render frame uploads.
- Not claimed: real-hardware frame rate, smoothness, or attack feel; headless
  audio audibility (only context counts and call counts measured); brute
  slam damage at the exact 1.5 m feet-height boundary (rule implemented,
  grounded case proven, boundary not sampled); insect leap path traced
  frame by frame through a crate (crate collision applied to leap movement
  and strike line-of-sight proven blocked, path itself not traced);
  pointer-lock denial UI in a real browser.
