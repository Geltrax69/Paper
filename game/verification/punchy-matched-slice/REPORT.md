# Reference-matched slice, part 1 — verification report

Scope: fix.md N01, N02, N09 and Missing content order item 1, except explosion
gameplay (out of scope for this part). Base `eafe247`, branch `main`, all
changes left uncommitted, nothing pushed, deployed, or published.

## Result: 33 / 33 PASS

Harness: `verify.mjs` (runs `npm run build`, starts vite preview on
`http://127.0.0.1:5178`, drives headless Chromium). Full results in
`report.json`. Build: `tsc` and vite build succeed; `dist/index.html`
11.70 kB, JS chunk 638.57 kB, with the pre-existing over-500 kB chunk
warning, not a failure.

## What was replaced, with timings, events, and rules

### World (N01)
- Floor: `punchy_floor_dark_ink` (runtime copy 512x512), repeat 8x8.
- Sky: `punchy_sky_cyan_open` (runtime copy 1024x512) as the scene
  background. Skyline (`far_skyline`) and ruins (`mid_ruins`) layers are
  unchanged and independent, so near and far motion still differs.
- Crates and wall texture kept. No saturation or bloom was applied to
  force a match, and no screenshot proved a crate or wall clash, so
  nothing was recolored.

### Shotgun (N02)
- Idle: `punchy_shotgun_idle` (1920x1280) is now the canonical idle.
  Diagonal lower-right to upper-left, twin barrels, two full forearms
  with complete wrists. Muzzle attachment [0.095, 0.023] in the manifest.
  World gameplay muzzle stays independent: eye + 0.55 forward, 0.28
  right, 0.22 down.
- Fire: NOT replaced. The punchy fire frames (456x912) match the idle
  barrels and hands but are near-vertical, while the idle is diagonal
  at about 35-38 degrees. No rotation compensation was applied to force
  them into place. The existing diagonal fire clip is kept: 5 frames,
  50/60/60/50/50 ms, 270 ms total, shot and flash events at 0 ms, fire
  cooldown 750 ms independent.
- Reload: real clip, 8 frames over 1400 ms, durations
  150/175/175/175/225/175/150/175 ms. Order: windup, break open, eject,
  reach for shells, loading, closing, regrip, settle. The single
  `ammo` event is at 675 ms, the start of frame 05 (loading).
  Rules as implemented and verified:
  - Shooting cancels reload. Fire is checked before the cooldown and
    ammo gates, so a fire click during reload always cancels, then
    fires only if cooldown and ammo allow.
  - Ammo transfers only at the event, never on timer expiry.
  - Cancel before the event keeps old ammo (measured: ammo 4,
    transferred false).
  - Cancel after the event keeps transferred ammo minus the shot
    (measured: ammo 5, transferred true).
  - The pose recovers to idle in both cases. The old reload dip is
    removed; reload poses replace it.
  - Sprint stays smoothly closer while preserving aim, driven by
    actual travel, not Shift alone (measured sprintScale 1.1 while
    travelling). The reload mesh follows the same sprint scale, which
    already blends back to 1 while reloading, so sprint does not break
    the reload clip.
- Reload HUD: live progress percentage while reloading, pips follow
  transferred ammo (old count before the event, 6 after it). Measured
  at the transfer point: frame 4, transferred true, ammo 6,
  progress 0.5357. Reload finishes at 6 with idle recovered.

### Runner front run (N01)
- `runner_run_front` clip assets replaced with the 8 punchy front run
  frames (400x800, pivot [0.5, 0.94625], groundY 757). Timing unchanged:
  71 ms frames, 568 ms loop, footstep events at 0 ms and 284 ms.
  Phase is preserved across direction changes. Front run `topY`
  changed 103 to 58, the measured topmost opaque row of punchy frame 01.
- Attack, hit, defeat, and all other run directions are unchanged.
  Other directions remain the older drifted set, not matched. This is
  the required scope, stated, not hidden.

### Comic HUD (N09)
All changing numbers are live text, never baked into an image.
- Upper-left: torn ivory combo card, slanted gold count, COMBO label,
  decay bar width equal to combo timer / 4000 ms. Count animates about
  1.15 to 1 on increment and restarts cleanly on rapid kills,
  suppressed under reduced motion. Measured: combo 1, score 100.
- Upper-center: black brush wave stamp with ivory text and gold
  numeral, plus a wave-start banner that wipes in, holds 1600 ms real
  time, then clears, with pointer events none so it never steals
  input. Measured: banner WAVE 1, visible true, wave numeral 1.
- Lower-left: ivory cross and large live health number over a
  contained red and black ink patch. Health progressbar semantics and
  `aria-valuenow` retained. Damage briefly compresses the number
  horizontally for 180 ms (suppressed under reduced motion) and shows
  a directional edge mark. Measured: 88 to 68 on a 20 hit, edge
  opacity 1, red edge visible in `hud-health.png`.
- Lower-right: live ammo count and six shell pips on a compact ink
  backing. Spent pips flick to a dim state. Empty state visibly says
  RELOAD (measured: ammoState RELOAD, ammo 0, count 0 / 6).
  Firing at empty starts a reload (pre-existing behavior); the RELOAD
  text shows while empty and not reloading.
- Lower-center: power strip with live text for dash ready or cooldown
  seconds, air jump ready or used, grapple valid, blocked, or unknown,
  and melee ready or cooldown seconds. No fake meters. Measured:
  "Dash: ready · Air jump: ready · Grapple: valid · Melee: ready".
- Reticle: crisp four-part ink reticle with a quiet centre opening.
  Ticks move outward by 5 px for 120 ms on firing, then recover. Hit
  shows `×` (26 px, red); kill shows `✕` (38 px, gold with ink
  shadow). Measured: melee non-killing hit `×`, killing shot `✕`.
- Comic words: `INKED!` on kills, `CRACK!` on melee hits, never per
  pellet. Capped at 3 simultaneous stamps, at four fixed spots outside
  the aim region, each removed after 900 ms real time. Gated by the
  Comic words setting and hidden under Reduced effect density.
  Measured: comicWords 1 at the killing shot read.
- Menu: first screen is Play, Settings, How to play. The long rules
  paragraph moved into the hidden How to play panel. Pause, error,
  wave-clear, and defeat reuse the same menu system with clear
  actions. Narrow menus scroll (`overflow-y: auto`). Desktop keyboard
  and mouse support stated explicitly. Sensitivity, volume, mute,
  reduced motion, shake, and flash retained. Settings gained Comic
  words (default true) and Effect density (`full` default, or
  `reduced`); reduced density halves impact particle counts in
  `burst` and hides comic words, so it actually gates an effect layer.
  Wave-clear menu measured: "Wave 1 complete. Bonus 250. Score 1450.
  Next wave has 8 runners at speed 3.6. Health carries over, ammo
  refills." with Next wave, Settings, How to play actions.

## Prior acceptance, still passing (measured)
Two shots (ammo 4), reload to 6, kill with defeat clip, death and
restart (health 100), crate-blocked shot with a surface decal
(decal flush: normal [0, 0, 1], facing dot 1.000, at z 4.92 on the
near face of crate (-6, 4) from the player's side), directional run,
wave clear (wave 1, score 1450), sprint, double jump (airJumpsUsed 1),
grapple (valid anchor, no behind-camera grapple), melee, N03 aerial
melee no damage (runner health 36), N04 ledge grounding false, N05
no behind-camera grapple, N10 decal flush.

## Seam and mismatch findings, stated honestly
- Floor seam, measured: left-right mean absolute difference about 14,
  top-bottom about 12, versus interior neighbour difference about 5,
  so about 3x interior, not pixel-perfect. In the 2x2 composite
  (`seam-2x2-floor.png`) and in gameplay screenshots the seams read
  weakly because the texture is dark and noisy. No seam was spotted
  in gameplay at 1280x720 or 1920x1080.
- Sky seam, measured: left-right about 23 versus interior about 4,
  about 6x interior, not pixel-perfect; top-bottom about 5. In the
  2x2 composite (`seam-2x2-sky.png`) the left-right cloud mismatch at
  the wrap meridian is visible, and the tile boundary shows the
  skyline strip meeting blank ivory. In game the image wraps once
  around, so the top-bottom join sits at the poles: zenith is blank
  ivory (no visible pinch), nadir is below the floor (hidden). The
  left-right wrap discontinuity was not spotted in gameplay
  screenshots; the sky is pale and the clouds are wispy.
- Sky horizon: in equirectangular mapping the image middle is the
  horizon and the image bottom is straight down. The source towers
  sit near the bottom of the 2D image (about 85% down), so in game
  they sit well below eye level and are mostly hidden by walls and
  floor. Horizon architecture in game comes from the independent
  skyline cylinder, not from this image's towers. The cyan sky
  provides open atmosphere above it. This is a property of the
  artwork as supplied, not a code defect introduced here.
- Shotgun fire mismatch: punchy fire frames are near-vertical while
  the idle is diagonal at about 35-38 degrees. They were rejected for
  use and the existing diagonal fire clip was kept. No rotation
  compensation was applied.
- Reload frames 1 and 2 have barrel tips cropped at the left strip
  edge, as the parent stated, so the first frames show a barrel
  entering from the edge, not a tip. Reload frame 05 also carries a
  neighbour barrel fragment at its right edge, observed during this
  task.
- Runner front run frame 01 touches the right edge (left 9, right
  399, top 58, bottom 755). Other frames also touch left 0 or right
  399 in places, the same edge-fragment class as earlier directional
  strips.
- Crate and wall textures were kept. No screenshot proved a clash, so
  nothing was recolored.

## What the screenshots do and do not prove
Screenshots do not certify animation timing. Clip timing is certified
by state reads (frame index, progress, transfer flag, cooldown) and by
review frame stepping, not by stills. Specific screenshot limits,
found by inspecting every capture:
- `hud-banner.png` does not show the large wave banner. The banner
  was measured visible (WAVE 1, visible true) by debug read, but the
  screenshot round-trip outlasted its 1600 ms hold, so the capture
  shows only the persistent wave stamp. Banner presence is proven by
  the debug read, not by this still.
- `fire-peak.png` does not show the muzzle-flash peak. The fire clip
  is 270 ms game time, shorter than the screenshot round-trip, so the
  capture caught the recovered idle. Firing is proven by state
  (sawFiring true, fireFrame 4, ammo 5), not by this still.
- `monster-attack.png` does not clearly show the attack pose. At
  attack range the runner stands behind the weapon overlay from the
  player's viewpoint. Attack is proven by state (state attack,
  attackFrame 3), not by this still.
- `hud-kill.png` does not show the `INKED!` stamp. The stamp's 900 ms
  real lifetime expired during screenshot capture. The kill comic
  word is proven by the debug read (comicWords 1 at kill time), not
  by this still. The still does show combo 1, score 100, ammo 4 / 6,
  and the dying runner.
- `review-reload.png` shows the top of the review page (crate_face),
  not the reload frames. The review page lists `shotgun_reload`
  (text check passed). Reload frame timing is proven by state reads,
  not by this still.
- What the stills do show: dark floor and cyan sky at 1280x720 and
  1920x1080, canonical diagonal idle with two forearms, the punchy
  front-run creature at distance, the vertical broken-open reload
  pose at 71% with ammo 6 / 6 transferred, the larger sprint gun
  (sprintScale 1.1) with the viewpoint advanced, combo 1 with decay
  bar, health 68 / 100 with a red damage edge, ammo 0 / 6 with six
  dim pips and red RELOAD, and the wave-clear menu with Next wave,
  Settings, How to play.

## Harness failures found and fixed during this run (harness, not game)
- The debug state did not expose `weapon.reloading`, so the reload
  wait polled `undefined` forever. Fixed by adding `reloading` to
  `getState().weapon` in `main.ts` (debug surface only).
- The debug environment check looked for the sky texture in scene
  meshes, but the sky is a scene background, and the weapon overlay
  lives in its own scene. Fixed by collecting the weapon scene in
  `getEnvironment` and checking the background flag for the sky.
- Early failures came from the harness reading HUD state after a
  screenshot instead of before it (banner 1600 ms hold, comic word
  900 ms lifetime, fire clip 270 ms game). Fixed by reading state
  first, then capturing.
- Early failures came from killing via debug `damageRunner`, which
  bypasses hit feedback entirely (no hitmarker, no comic word). Fixed
  by killing through real `fireShot` and real `startMelee` paths.
- Early failures came from a live runner killing the player mid-test
  (cooldown frozen in the dead phase) and from wave-complete freezing
  the loop when the harness cleared the spawn queue and killed the
  last runner. Fixed by clearing runners before shot tests, using the
  real wave-clear menu advance (click Next wave, wait for playing),
  and resetting to a pristine wave before the ammo-empty section.
- The crate-face expectation was wrong (3.1 is the far face from the
  test side; the near face from z 7 is 4.9). The decal at z 4.92 is
  flush on the correct near face. Fixed the expectation, not the game.
- The ammo-empty expectation assumed 6 rounds but the mag held 5
  after the cancel-after test, so the sixth debug shot triggered the
  pre-existing fire-at-empty reload. Fixed by refilling first.

## What is fallback or placeholder
- Fire clip: the existing diagonal fire clip is the fallback for the
  rejected punchy fire frames. It is the older clip, with the known
  small position jump on clip entry and exit and about 5 degrees
  angle mismatch versus the old idle. Neither is claimed fixed here.
- Other run directions: the older drifted set, kept deliberately per
  scope (only front replaced).
- Pickups remain procedural canvas art, not bespoke art.
- Audio remains synthesized Web Audio, no audio files. Headless
  audibility was inconclusive at every stage; only context state,
  gain, mute, and call counts were measured.

## What failed or stayed inconclusive
- Nothing in the final run failed: 33 / 33 PASS, 0 fails.
- Frame rate, smoothness, and animation feel on real hardware are
  unverified. Headless software rendering is slow and is not a
  real-hardware claim.
- Pointer-lock denial UI is implemented but still not browser-proven
  in a real browser; headless Playwright allows pointer lock.
- The fire flash peak, the wave banner wipe, the attack pose, and the
  comic word stamp are proven by state reads, not by their
  screenshots, for the timing reasons above.
- Telegraph plus attack total about 1100 ms versus old about 780 ms,
  a gameplay slowdown the user has not ruled on. Carried forward.
- Flash frame 1 spike truncation from Phase 2 batch 1. Carried forward.
- Combo survives the wave-complete menu because its timer only decays
  while playing. This is the implemented rule, stated, not hidden.
- Atlas packing and lazy loading are still not done. Out of scope
  for part 1.
- Explosion gameplay, ink pressure, explosive barrels, new weapons,
  new monsters, shared FX, arsenal, and the new mechanic are out of
  scope for part 1 and were not built or claimed.

## Files changed (all uncommitted)
- `game/src/main.ts`: idle texture, reload textures, fire cancels
  reload, reticle expand 120 ms, hit/kill hitmarker split, comic
  words, wave banner pending, settings (comic words, effect density),
  HUD update for the new elements, debug `reloading` and `getHud`,
  first-menu labels Play, How to play toggle, debug environment
  collects the weapon scene.
- `game/src/weapon.ts`: canonical idle asset, reload mesh and
  `AnimationPlayer`, `startReload`, `cancelReload`,
  `reloadFrameIndex`, `reloadProgress01`, `reloadTransferredFlag`,
  old reload dip removed.
- `game/src/enemy.ts`: front run `topY` 103 to 58, damage callback
  accepts an optional source position, attack strikes pass the runner
  position for the directional edge mark.
- `game/src/assets.ts`: `Weapon` type gained `reloadClip`.
- `game/assets.json`: 109 assets (was 101), 15 clips (was 14), 11
  entries removed (old floor, sky, idle, front run frames).
- `game/index.html`: rewritten HUD and menu markup and CSS,
  preserving all ids used by code.
- `game/public/assets/`: punchy floor, sky, idle, reload frames,
  front run frames added; superseded copies removed.
- `game/verification/punchy-matched-slice/`: `add_assets.py`,
  `verify.mjs`, `report.json`, screenshots, this report. Earlier
  verification folders untouched.
