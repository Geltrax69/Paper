# Pass 4 powers, first slice

Date: 2026-10-31. Harness: `verify.mjs`, report `report.json`, 9 of 9 PASS
on the final code, in headless Chromium. Build: `npm run build` passes
(tsc and vite, chunk warning unchanged).

## What the player gets

- Space jumps, and Space pressed again midair gives one double jump.
  The second jump resets only on landing, including crate-top landings.
- E held grapples to a fixed anchor. Releasing E detaches with
  retained momentum. Space while grappled detaches and jumps.
- F swings a melee attack with a curved slash sprite. Damage lands
  once per swing, at 120 ms into a 300 ms swing.

## Rules as implemented

- Jump velocity 8, gravity 22, same as the existing single jump.
  Measured single-jump apex 1.27 m, double-jump apex 2.14 m.
  A third midair press adds nothing. Coyote-time jumps count as
  ground jumps, so the air jump stays available after one.
- Launch ring on every jump, 300 ms, scaling 0.3 to 1.3 and fading.
  Air streak particles every 120 ms while airborne, off under
  reduced motion. Landing burst of 10 particles on landing.
- Grapple range 14 units from the eye. Anchors, fixed in code:
  wall tops (-11,2.8,-11), (11,2.8,-11), (-11,2.8,11), (11,2.8,11),
  (0,2.8,-11), (0,2.8,11), (-11,2.8,0), (11,2.8,0); crate tops
  (-3,1.5,-2), (3,1.5,1), (0,1.2,-6), (-6,1.8,4), (6,1.5,-5).
  Attach needs a clear line of sight through the same solid test
  shots use. The rope is a gold cylinder from a point 0.8 forward,
  0.25 right, 0.3 down from the eye to the anchor, and the gold
  anchor cue stays visible while attached. Rope length is measured
  from the feet, not the eye. Rope obstruction is re-checked every
  frame while attached and detaches on a block. Pumping uses the
  movement keys at 4 units per second into the rope constraint.
  Release keeps horizontal momentum for 400 ms of game time,
  decaying over that window.
- Melee range 2.8 units to the runner centre, plus runner radius
  in the check, damage 18, cooldown 500 ms, forward arc dot over
  0.5, line of sight required. Two swings kill a 36-health runner.
  Melee range was raised from an initial 2.0 during this slice:
  at 2.0, a crate-blocked melee was geometrically impossible in
  this arena, because a tall crate plus both body radii already
  span 2.75 units, so the line-of-sight check could never fire.
- Airborne immunity is the existing vertical-overlap rule, not a
  new exception. A runner's ground melee cannot hit a player whose
  body interval does not overlap the runner's 0 to 2.0 m interval.
  Measured: health stayed 100 through a strike while airborne.
- Sounds: jump sound reused for the double jump. New synthesized
  grapple and melee sounds added through the existing audio module.
  No existing sound changed.

## Files changed

- `game/src/main.ts` owns the powers state, grapple anchors and
  rope, jump rings and streaks, melee swing and slash, menu text
  wiring, and debug hooks (`getPowers`, `tryGrapple`,
  `releaseGrapple`, `startMelee`, `pressJump`, `pressKeyDown`,
  `pressKeyUp`, `getSceneMeshes`).
- `game/src/audio.ts` adds `grapple()` and `melee()`.
- `game/index.html` adds the new bindings and the powers rules
  to the menu text.
- `game/verification/pass4-powers/` holds `verify.mjs`,
  `report.json`, and the screenshots.

## Verification, measured

- Double jump: single apex 1.27, double apex 2.14, third press
  apex 1.27, air jumps used 1 midair and 0 after landing.
- Grapple: attached to (0,2.8,11) with rope length 3.44, stayed
  attached while standing on the ground, pump range 1.35 over
  3 seconds of forward input, release momentum 350 ms remaining
  at read time, post-release drift 0.07 units.
- Grapple blocked: from (-6,0,8), the cue and the attach target
  were (-11,2.8,11), never the blocked (-6,1.8,4) crate top.
- Melee: 36 to 18 on one swing, still 18 later, death on the
  second swing, score 100. Through a crate: 36 stayed 36 with
  the runner at (-6,2.55).
- Airborne immunity: health 100 after a strike resolved while
  the player was airborne from a crate edge.
- Prior acceptance: ammo 5, 4, then 6 after reload; sprint scale
  1.1 running and 1.0 idle; run clip back; wave complete with
  score 350; skyline present; death at 0 health and restart
  at 100 health.

## Honest limits

- Release momentum is real but small. Measured drift after
  release was 0.07 units, so the swing release will not feel
  like a launch without further tuning.
- Rope-obstruction detach during a swing was not headless-proven
  through a crate. Anchor heights make a mid-swing crate block
  rare, and the same ray test gates attach, which is proven,
  and runs every frame while attached. The detach branch itself
  is code-reviewed, not browser-proven.
- The landing burst is in the landing code path and the landing
  sound and grounded state were measured, but burst particles
  had faded before the landing screenshot, so the screenshot
  does not show them.
- Frame rate, smoothness, and swing feel are not claimed from
  headless rendering. Pointer-lock denial UI in a real browser
  is still unproven, as in prior slices.
- The rope visual start is offset from the eye. The gameplay
  rope length is still feet to anchor. A rope drawn from the
  exact eye point projects to a point, not a line, which is why
  the first rope version looked invisible.
- Crate-top anchors at 1.8 m are only grappleable from above.
  From ground level the eye at 1.7 m sees the crate side first,
  so the line-of-sight test blocks them. Lower crate tops are
  reachable from the ground.

## Not built, not claimed

Additional weapons, pistol, automatic, blaster, throwing knife,
grenade, brute or leaping monsters, elevated-view sprites,
1920x1080 verification, leak checks, re-audit, and polish.
No weapon damage, wave, score, pickup, or settings logic
changed, except melee damage once per swing and the existing
airborne melee rule.
