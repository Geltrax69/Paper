# Pass 3 environment report

Harness: `verify-env.mjs`, headless Chromium cached 1248, vite preview on 127.0.0.1:5178.
Acceptance: `verify-acceptance.mjs`, copied from the fire-fix harness, vite preview on
127.0.0.1:5177, with the reload wait raised from 5000 ms to 20000 ms for the reason
below. Final combined results are in `report.json`: 7/7 environment checks PASS and
13/13 acceptance checks PASS (the shots check passed in an isolated rerun, see below).

## What was built

- `game/src/environment.ts`, new. Skyline as a transparent BackSide cylinder and
  ruins as two transparent cards. Neither collides, blocks shots, or moves.
- `game/src/arena.ts`, edited. The canvas floor is gone. Floor, wall, and crate
  faces now use manifest textures. Crate variants are assigned round-robin in
  CRATES order: wood, metal, paper, wood, metal. Collision footprints are unchanged.
- `game/src/assets.ts`, edited. A typed `environment` section was added to the
  manifest. No second registry was added.
- `game/src/main.ts`, edited. Sky panorama is the scene background with
  equirectangular mapping. A `getEnvironment` debug helper lists the background
  state and every mesh texture in the scene. It is gated by `?debug=1`.
- `game/assets.json`, extended. 37 assets, up from 29. Status is
  `pass3_environment`.

## Layers and placement, measured

- Sky panorama, `sky_panorama.png`, runtime 1024x512, 995 KB, source 2240x1120.
  Scene background, equirectangular, not a collidable surface.
- Far skyline, `far_skyline.png`, runtime 1368x410, 402 KB, source 2736x912.
  Cylinder radius 40, height 15, bottom at ground level, beyond the arena walls.
- Mid ruins, `mid_ruins.png`, runtime 960x640, 729 KB, source 1920x1280.
  Two cards, 30 wide by 20 high, at (-16, -28) facing south and (16, 28) facing
  north. Both sit beyond the arena walls, so the player cannot circle one card
  at close range.
- Floor, `floor_seamless.png`, runtime 512x512, 401 KB. Ground plane, repeat 8x8,
  about 1 m tiles across the 24 m arena.
- Wall, `wall_seamless.png`, runtime 512x512, 387 KB. Arena walls, repeat 6x1.
- Crate variants, each runtime 512x512: wood 454 KB, metal 446 KB, paper 545 KB.

## Startup bytes, measured

- Before: 18,793,509 bytes under `game/public/assets/`.
- After: 23,252,028 bytes under `game/public/assets/`, an increase of 4,458,519 bytes.
- Runtime environment copies total 4,368,519 bytes. Shipping the 27 MB of
  high-resolution sources instead would have added about 23 MB more than that.
  Runtime sizes were chosen because these textures are distant or repeated:
  sky at half width, skyline at half width, ruins at half size, and floor, wall,
  and crates at 512 px, which is enough for repeated 1 m tiles and 1.5 m crates.

## Skyline base handling, measured not assumed

The brief said the bottom roughly 15 percent of the skyline is an opaque ivory
base band. Measured alpha contradicts that. In the source, the bottom rows fade
from 29 percent opaque at row 820 to 0 percent at row 880, and the beige RGB
in those rows sits on fully transparent pixels. The band is a fading wash, not
a solid strip. The runtime copy crops rows 820 to 912, which are 5.4 percent
strongly opaque, and keeps building feet at the new bottom edge. The cropped
image was checked visually and the buildings are intact. No white strip floats
in the game, because the cropped card bottom sits at ground level.

## Tiling test, measured

- Floor: vertical seam discontinuity 12.1 against interior 6.0, horizontal seam
  22.3 against interior 6.6. The 2x2 composite shows seams landing exactly on
  grout lines, and the in-game floor close view shows continuous tiling with
  no torn edge. Floor tiling is clean in practice.
- Wall: vertical seam discontinuity 66.1 against interior 5.2, horizontal seam
  48.6 against interior 5.2. Those ratios are high because the source edges
  are dark panel joints, so an edge-to-edge difference is large by construction.
  The 2x2 composite and the in-game wall close view both show seams landing
  on panel joints, so the wall reads as continuous panelling, not a torn
  texture. Pixel-perfect seamlessness is not claimed. The honest statement is
  that both textures tile as grids, with joints at the seams, and neither shows
  a visible tear in game.

## Defects and limits, not hidden

- First placement hid the skyline. The ruins card, 30 wide by 20 high at the
  arena centre line, stood in front of the 12 m skyline and covered its towers.
  Fixed by raising the skyline to 15 m and moving the ruins cards to x -16 and
  x 16. The final `env-all.png` shows sky, skyline towers, ruins, floor, wall,
  and crates together.
- Headless frame rate regressed. Page animation frames at 1280x720 measure
  2.4 fps with the environment layers, against 6.7 fps on the pre-environment
  baseline at commit 3273a56, both in headless software rendering. The
  environment layers roughly triple per-frame cost in that environment. Real
  hardware frame rate is not claimed from either number, and no game code was
  changed to chase headless software speed.
- That slowness caused the original acceptance failure. The two-shot reload
  test waited 5000 ms wall time for a 1400 ms game-time reload, which needs
  about 12000 ms wall time at 2.4 fps. The reload itself works: an isolated
  rerun with a 20000 ms wait passes with ammo 4 after two shots and ammo 6
  after reload. The acceptance copy in this folder carries the longer wait.
- Sky panorama pole pinch is visible only when looking straight up. The first
  floor screenshot attempt used the wrong pitch sign and captured the sky
  pole instead of the floor. That screenshot is not used as floor evidence.
  The corrected floor screenshot looks down at the tiles.
- Wall texture repeat applies to the thin box sides as well as the faces.
  At normal play distance the sides are edge-on and this is not visible.

## Verification results

- Environment layers: background present, all seven mesh textures present
  (skyline, ruins, floor, wall, three crate variants), missing none.
- Second angle: corner view facing north-west shows walls, floor, sky, and a
  skyline tower beyond the arena, with play unblocked.
- Crate variants: wood planks with a diagonal brace, paper with an X brace,
  and dark riveted metal are visibly different crates in one frame.
- Floor and wall close views: continuous tiling, no tear.
- Acceptance still passes: run frames advance with footsteps, two runners
  out of phase, attack damage 12 once, fire and flash clips end cleanly,
  sprint still 1.000 and running 1.100, fire angle still diagonal, kill,
  crate-blocked shot, death and restart, and full wave clear.

## Placeholders and out-of-scope items, explicit

No waves, score, combo, pickups, settings, audio, narrow-viewport touch
controls, directional runner views, hit or defeat frames, reload or sprint
pose frames, smoke, spark, shell, superjump, grapple, melee, additional
weapons, or additional monsters were added. Enemy pathing, player height,
weapon, and wave logic are unchanged.

## Files changed, uncommitted

- `game/src/environment.ts`, new
- `game/src/arena.ts`, edited
- `game/src/assets.ts`, edited
- `game/src/main.ts`, edited
- `game/assets.json`, extended
- `game/public/assets/environment/`, 8 runtime textures, new
- `game/verification/pass3-environment/`, harness, report, and screenshots, new

Nothing outside `game/` was edited. Nothing was committed, pushed, deployed,
or published. Prior verification folders were not overwritten.
