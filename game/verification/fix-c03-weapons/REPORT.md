# C03 weapons plus ink pressure — verification report

Result: 18/18 PASS in `verify.mjs` (headless Chromium, port 5183, run alone).
Build: `npm run build` passes (TypeScript plus Vite; the 693.98 kB single-chunk
warning pre-exists and is not a failure). `npm test` (portable N08/N11 suite)
was rerun alone after this harness, in a separate process: RESULT 23/23 PASS,
exit 0, including the post-warmup waves 5 and 6 stability check (wave4/5/6
all at 22 geometries and 65 textures) and the 1920x1080 check. An earlier
`npm test` run that showed 3/13 was contaminated: it ran concurrently with
the C03 harness while the `reloadClip` bug was still present, and is not a
regression signal. A later `npm test` attempt was killed by a VM restart
mid-run; the rerun above is the authoritative result.

## Weapon registry (data-driven, `game/assets.json` under `weapons`)

| Key | Name | Kind | Damage | Pellets | Spread | Interval ms | Ammo | Reload ms | Range | Extra |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 shotgun | Shotgun | hitscan | 12 | 7 | 0.055 | 750 | 6 | 1400 | 30 | transfer at 675 ms, 8-pose clip, unchanged |
| 2 pistol | Pistol | hitscan | 20 | 1 | 0.004 | 300 | 12 | 900 | 40 | transfer at 60 percent of reload |
| 3 automatic | Automatic | hitscan | 8 | 1 | 0.03 | 110 | 30 | 1600 | 30 | hold to fire, tracer every 3rd shot, transfer at 60 percent |
| 4 blaster | Blaster | bolt | 30 | 1 | 0 | 600 | 8 | 1200 | 40 | bolt speed 40 u/s, transfer at 60 percent |
| 5 knife | Throwing knife | knife | 34 | 1 | 0 | 450 | 6 count | none | 30 | windup 180 ms, projectile speed 18 u/s |
| 6 throwable | Grenade | grenade | 0 in registry (damage comes from the explosion) | 1 | 0 | 800 | 3 count | none | 30 | fuse 1600 ms |

Shotgun damage, pellets, spread, interval, ammo, and reload transfer event
are exactly preserved. No shotgun, runner, insect, or brute stat, wave, score,
combo, pickup, or explosion rule changed, except ink-pressure scoring (below).

## Key bindings

1-6 select shotgun, pistol, automatic, blaster, knife, grenade. G throws a
grenade from reserve without switching weapon. G had no prior binding, so
there was no conflict and no resolution was needed. R reloads the current
reloadable weapon. X spends ink pressure. Mouse hold fires the automatic
repeatedly; all other weapons fire on click only. Switching cancels reload
(preserving already-transferred ammo) and cancels knife windup. F melee is
unchanged and is a separate action from the knife throw.

## Projectile and collision rules

- Hitscan (shotgun, pistol, automatic): camera-ray aim from the world
  gameplay muzzle, solid test first, then runner test.
- Blaster bolt: cyan box 0.09 x 0.09 x 0.7 with pulse scale, stepped at most
  0.25 units per substep, so it cannot tunnel through a crate or a runner.
  Solid hits use the surface from the previous substep position and spawn an
  impact effect plus a decal; a barrel hit triggers the barrel. Runner hits
  use 0.85 units distance to runner centre (centre y 1.1), damage 30.
- Knife: world sprite spinning at 12 rad/s with periodic spark glints,
  stepped like bolts, damage 34 on contact only, floor and wall hits give an
  impact plus a decal, range despawn leaves the last-knife record at "flying".
- Grenade: sprite with velocity forward x 10 plus up 6, gravity 18 per
  second, ground rest at y 0.35 with velocity x 0.4 per frame while grounded,
  arena clamping. Detonation is fuse 1600 ms OR runner contact, whichever
  comes first. Detonation reuses the C01 explosion layers, sound, and
  `applyExplosionDamage` (radius 4.5, maximum 60, linear falloff, cover via
  `rayHitSolid`). It triggers at most one nearest barrel within chain radius
  5, and that barrel's chain follows the existing C01 caps (depth 2, total
  6), so grenades cannot chain infinitely.
- Projectiles clear on death, restart, and wave transitions.

## Ink pressure (the one new mechanic)

Meter 0-100. Every kill adds 20, grounded or airborne, because scoring
happens at the death transition regardless of source. Cost 50, key X.
Shock burst centred 3 units ahead of the eye and lowered to at least y 0.6,
radius 6, maximum damage 80, linear falloff, cover via `rayHitSolid`
(blocked targets take 0). Cooldown 3000 ms. Sound `shock()`. No damage to
the player from their own shock. Shock does not trigger barrels.
Scoring rule, stated exactly: ink shock kills score and combo exactly like
any kill, because scoring happens at the death transition regardless of
damage source (100 x combo multiplier, combo increments). No other meter
was added. Aerial style rewards and barrel chains were not built and are
not claimed. Explosive barrels already exist from C01 and do not count as
this mechanic.

## Measured harness results (final run, 18/18)

- Registry: all six ids present, shotgun preserved, per-weapon ammo correct.
- Switching: all six weapons show the correct view and HUD ammo text.
- Shotgun two shots: ammo 6 to 4.
- Pistol: single shot 36 to 16 (20 damage), ammo 12 to 11.
- Blaster blocked by crate: bolt end [3.28, 1.48, 1.75], hit "solid", runner
  behind unharmed at 36.
- Blaster direct hit: 36 to 6 (30 damage), bolt hit "runner".
- Knife: windup true, contact damage 36 to 2 (34 damage), hit "runner".
- Knife miss: hits the crate at [-5.72, 1.48, 4.9], hit "solid", no runner hit.
- Grenade: target 36 to -13 (killed), count 3 to 2, detonated at
  [0.28, 0.35, 0.45] with 800 ms fuse remaining, so this run detonated on
  runner contact, not on fuse expiry. Both rules are implemented; the fuse
  path itself was not the detonating path in this run.
- Grenade via G: count 2 to 1, weapon unchanged.
- Automatic: 3 shots, target 30 to 27, ammo 30 to 27.
- Ink: 100 to 90 with a shock that killed 2 runners, which is
  100 - 50 + 2 x 20, exactly the stated rule. Spend below 50 blocked:
  ink 40, spend false.
- Reduced motion plus zero flash: settings confirmed, new effects gated.
- Prior acceptance in this harness: shotgun fires after switching (ammo 5),
  wave clears to waveComplete with score 5400, no page or console errors.

## Art: generated versus procedural, stated plainly

- Generated (parent-provided, already alpha-extracted): blaster first-person
  view (`punchy_blaster_idle.png`, pivot [0.5, 1.0], muzzle [0.088, 0.148]
  estimated from the image at about plus or minus 0.01, not marker-verified
  frame by frame); knife world sprite, used as first-person view and as the
  spinning world projectile; grenade world sprite, used as first-person view
  and as the arcing world sprite.
- Procedural (canvas textures, not generated images): pistol and automatic
  first-person views, ivory body, dark seam, turquoise accent, full forearm
  silhouette, pistol compact and light, automatic longer with a curved
  magazine. Their behavior is fully distinct, not shotgun mechanics with a
  different image.
- No file under `output/` is used as a runtime texture. No image was
  generated for C03. No shotgun reskin is presented as a different weapon.

## HUD and menu

Ammo line reads `Name current / max` (for example "Shotgun 6 / 6"). Pips
rebuild to min(max, 12) with filled fraction by ammo ratio. Ammo state shows
"Winding up..." during knife windup, "Reloading N%", or "RELOAD" when empty.
The `#ink` HUD element shows live text such as "INK 0 / 100 · X needs 50",
"INK 70 / 100 · X: SHOCK READY", or "INK 70 / 100 · Shock in 2s", with a
turquoise fill bar at the ink percentage. Menu controls and How to play
list keys 1-6, G, X, reload times and transfer rule, knife windup, grenade
fuse and contact rule, ink rules, ammo pickup rule (3 to the current gun,
1 knife or grenade, capped at max), and wave refill of all weapons.
Reduced motion and flash gate the new flashes, blaster pulse, and shock
burst the same way as existing effects. Weapon flash scale: pistol 0.6,
automatic 0.8, blaster 1, knife 0.5, grenade 0.5.

## Bugs found and fixed during C03 verification

- Registry rewrite dropped `reloadClip` from the shotgun manifest entry, so
  startup failed with "Cannot read properties of undefined (reading
  'assetIds')". Restored `reloadClip: "shotgun_reload"` for the shotgun and
  empty string for the other weapons.
- Fire and ink cooldowns froze across the wave-complete and dead menus
  because they decremented only inside the playing branch. They now
  decrement outside the playing branch.
- Reset left the previous weapon's view on screen. `resetGame` now restores
  the shotgun idle view and flash scale.

## Inconclusive or unproven, stated plainly

- Real-hardware feel and frame rate for the new weapons: headless only.
- Blaster muzzle coordinates are an image estimate (plus or minus 0.01),
  not marker-verified per frame.
- Automatic tracer budget is verified only as an observed tracer count
  (1 in one run, 0 in the final run) after 3 shots, not by counting rendered
  tracer lines per shot. The tracer assertion in the harness is weak and
  the count varies run to run; this is not proven tight.
- Grenade cover damage (crate-blocked explosion) rests on the existing C01
  explosion rules; the C03 grenade test checks damage without a crate
  between grenade and target.
- The full prior-acceptance list from the brief (insect and brute kills,
  sprint, double jump, grapple, melee, barrel explosion, N03 aerial melee,
  N04 ledge grounding, N05 behind-camera grapple, N10 decal, pickup
  collection and disposal stability, directional run) is covered in part by
  this harness and in part by the portable `npm test` suite, which must be
  read alongside this report. Headless audio audibility is not proven;
  only that the sound functions exist and are called.
- Screenshots: `weapon-pistol.png`, `weapon-blaster.png`,
  `weapon-blaster-bolt.png`, `weapon-knife.png`, `weapon-grenade.png`,
  `weapon-automatic.png`, `ink-shock.png`, `accept-wave.png` in this folder.
