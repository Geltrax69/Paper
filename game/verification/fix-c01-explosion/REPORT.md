# Fix C01: shared FX pipeline, explosion interaction, explosive barrels

Harness result: 26 of 26 PASS, measured in headless Chromium on this machine.
Build result: `npm install` then `npm run build` pass with no TypeScript errors.
Vite bundle note: the existing over-500 kB chunk warning remains, unchanged by
this slice. All changes are left uncommitted. Nothing was pushed or deployed.

## What was built

### Shared FX pipeline: `game/src/fx.ts` (new)

One `FxEmitter` owns every impact and explosion visual. Call sites no longer
spawn one-off particles for shots. The emitter reuses 3 procedural flash
designs (4-point star, 8-point star, angular burst) and 7 shared procedural
canvas textures in total: the 3 flashes plus spark, ink star, smoke, and paper
fragment. Transforms, emission, lifetime, and palette are driven
procedurally per spawn. The explosion ring is shared geometry, not a texture.

Pool caps, all pooled and reused, none allocated per shot:

- flashes 24, sparks 96, ink stars 24, smoke 24, rings 16, fragments 48,
  explosion slots 4, for a pooled total of 236 objects.
- The pre-existing points pool (300), decal pool (12), and jump-ring pool (4)
  are unchanged. Tracers are still created per pellet with a 60 ms life and
  disposed on expiry; that is unchanged shot rendering, not FX feedback.

A normal impact combines one angular flash, one target-local ink star, 2
fragments, and 3 sparks, plus contact audio. A heavy impact (killing blow)
combines one angular flash, one ink star, 5 fragments, and 6 sparks.
Same-shot pellet feedback for one target is grouped: one impact per runner
per shot, and one impact per surface owner per shot. Melee hits use the same
impact path, once per runner per swing.

### Explosion interaction

Phases, in game time: ignition and bright core 0 to 80 ms, angular golden
bloom 80 to 220 ms, expanding floor ring 0 to 600 ms to a visual radius of
3.2, outward fragments 800 ms, smoke breakup 1100 ms, then every layer is
hidden and the slot is freed. The terminal phase genuinely fades: opacity
ramps to zero and meshes are set invisible, so no frozen frame and no
lingering opaque card remain. This is measured, not inferred: after the
terminal check the active explosion count is 0 and the active explosion
getter returns null.

Damage is defined separately from visual size:

- Radius 4.5 units, measured in 3D from the explosion centre to the target
  centre (runner centre at feet plus 1.1, player centre at feet plus 0.85).
- Falloff is linear: damage equals round(60 times (1 minus distance divided
  by 4.5)), so 60 at the centre and 0 at the edge.
- Cover: a ray from the explosion centre to the target centre is tested
  against crates, barrels, and walls with the existing solid-ray test. A
  blocking hit closer than the target minus 0.05 units gives zero damage.
  Barrels and crates both block; ordinary crates never explode.
- The player takes the same radius, falloff, and cover rules as runners.

Hit-stop is local and capped: runners damaged by an explosion freeze for
35 ms each, and a runner killed by a shot freezes for 30 ms. No global
freeze exists, and pellets never freeze anything. Shake: an explosion within
radius plus 3 units of the player sets shake amplitude 0.35 times the shake
setting times proximity, for 350 ms. Reduced motion forces shake amplitude
and time to zero. Flash scales the bright core and bloom opacity; zero
flash hides both while the ring, smoke, fragments, and damage stay visible.
A new synthesized explosion sound (noise plus a falling low tone) is counted
as `explosion` in the audio state. Enemy tells are preserved: footstep
throttling, monster attack sounds, and telegraphs are untouched, and
explosion fragments and sparks are capped by the pools above.

### Explosive barrels

Four barrels, all real arena boxes with collision, support, ray hits, and
pathing nodes, not a texture swap on a crate:

- (4, 0, -3), (7, 0, -3), (10, 0, -3), (-7, 0, -7).
- Cylinder radius 0.55, height 1.1. The procedural texture is dark red with
  gold chevron bands, gold top and bottom bands, a black outline, and an
  ivory exclamation mark, so a barrel reads as dangerous without reading a
  label. Ordinary crates keep their wood, metal, and paper variants.
- Shooting a barrel starts a 350 ms warning: the barrel pulses gold emissive
  and a gold floor ring appears and pulses. Detonation follows the warning.
- Chain: a detonating barrel warns every idle barrel within 5.0 units.
  Chain depth is capped at 2 (origin depth 0, next depth 1, next depth 2)
  and the total chain count is capped at 6 barrels. The four barrels in this
  slice chain at most 3 deep in practice, because only three sit in a row.
- Damage to runners and to the player from any detonation, including chained
  ones, uses the radius, falloff, and cover rules above, with projectile
  line-of-sight validation through the solid-ray test.
- A detonated barrel is removed from collision, ray, and pathing, and it
  respawns at the next wave start, like pickups. Ordinary crates never
  explode: shooting one leaves barrels idle and no explosion active.

### Scoring and combo rule for barrel kills, exactly as implemented

A barrel kill scores exactly like a normal kill. Scoring is centralized at
the death transition in the game loop, so the damage source does not matter:
combo increases by 1, the combo timer resets to 4000 ms, the multiplier is
x1 below combo 3, x2 at combo 3 to 4, and x3 at combo 5 or more, and points
equal 100 times the multiplier. Chain kills combo in the same way, one
increment per death transition, because each chained death is a separate
death transition. No wave, score, combo, pickup, weapon damage, or settings
logic was changed apart from this damage path and the new explosion sound.

## Prior fixes kept intact

N03 3D melee, N04 derived grounding, N05 aim-cone grapple, N06
velocity-preserving release, N07 hysteresis, N10 surface decals, N12 reduced
motion, matched slice floor, sky, shotgun reload with the ammo-transfer
event, front run, and comic HUD are all untouched except for the additions
above. The prior acceptance set in the harness covers two shots, reload with
transfer, kill with defeat clip, death and restart, tall-crate-blocked shot,
directional run, wave clear, sprint, double jump, grapple, melee, N03 aerial
melee, N04 ledge grounding, N05 behind-camera grapple, N10 decal, and comic
HUD values.

## Verification evidence

Harness: `verify.mjs` in this folder, run against `vite preview` on port
5179 with headless Chromium. Report: `report.json` in this folder.

- `impact-heavy.png`: killing shot, one grouped heavy impact.
- `explosion-warning.png`: isolated barrel in its 350 ms warning, gold
  pulse and floor ring.
- `explosion-bloom.png`: expanding gold ring with fragments and sparks.
- `explosion-smoke.png`: smoke breakup phase.
- `explosion-terminal.png`: clean frame, nothing lingering.
- `chain-warning.png`: second barrel glowing gold with a ring while the
  other barrels still show red with gold chevron bands.
- `crate-shot.png`: ordinary crate shot, no explosion.
- `reduced-explosion.png`: reduced-motion explosion, no shake or roll.
- `zero-flash.png`: zero-flash explosion, ring visible, no bright core.

Measured falloff in the final run, frozen runners: distance 1.05 damage 46,
distance 1.32 damage 42, distance 3.22 damage 17, all matching the linear
rule within rounding. Measured cover in the final run: the runner behind
the crate took 0 damage with blocked true at distance 3.79, while the
exposed runner took 20 at distance 2.98.

## Fallback, placeholder, and inconclusive items

- The explosion core and bloom sprites render in the world scene, so when
  an explosion sits directly ahead at close range the weapon overlay can
  cover the central star. The ring, fragments, sparks, and smoke stay
  visible, and the core and bloom visibility flags are measured through
  the debug getter. This is a composition limit, not a missing phase.
- Tracers are still per pellet. Grouping covers FX feedback (flash, ink
  star, fragments, sparks, decals, impact audio), not tracer lines.
- Headless game time runs slower than real time on this machine, roughly
  one quarter speed in the slowest stretches. Tests that depend on game
  time poll game state instead of sleeping fixed real-time intervals.
  Frame rate, swing feel, and audio audibility on real hardware are not
  claimed from headless numbers.
- The debug-only `explodeAt` helper applies explosion damage without a
  barrel and without chaining. It exists only for falloff and cover
  measurement. Real play always goes through barrels and the chain rules.
- Pointer-lock denial UI in a real browser remains unproven, as before.
