# Paper game fix.md Pass 1 report

Date: 2026-10-30. Branch: main, uncommitted. Harness: `verify.mjs` in this directory, Playwright with cached Chromium 1248, Vite preview on 127.0.0.1:5174. Final run: 24 of 24 checks PASS.

## Build

`npm run build` in `game/` passes with no TypeScript errors. One Vite chunk warning remains: a single minified JS chunk is about 553.79 kB, above the 500 kB advisory threshold. This warning was present before Pass 1 and is not a failure.

## Files changed

- `game/src/arena.ts`
- `game/src/pathing.ts` (new)
- `game/src/enemy.ts`
- `game/src/weapon.ts`
- `game/src/assets.ts`
- `game/src/main.ts`
- `game/index.html`
- `scripts/make_alpha.py`
- `game/verification/fix-pass1/` (this harness, its screenshots, and `report.json`)

No files outside `game/` and `scripts/make_alpha.py` were edited. Nothing was committed or pushed.

## Findings, fixes, and evidence

### F01 pathing

Fix: a visibility graph over crate footprints expanded by mover radius plus 0.25, Dijkstra over at most 22 nodes for five crates, waypoint routes, replan on material target move or stall, neighbor separation, and no full search every render frame per enemy.

Evidence: route graph 10 of 10 routes, all five crates from both sides, reach the goal without crossing a crate. Reproduced audit route from (-6, 0, 1) to (-6, 0, 7): final runner at -7.67, 5.19, state pursue, distance 2.46, health 100.

### F02 height-aware player body

Fix: one authoritative player body, feet plus height 1.7, camera eye separate, ground support from the floor or a crate top, horizontal crate collision only when vertical intervals overlap, walls still block dash and jump, melee checked against the actual body interval plus reach plus obstruction.

Evidence: airborne player took no ground melee damage, health stayed 100. Landing on the crate at (-6, 4) gave feet Y 1.80 and grounded true. High movement east above crates ended at x 6.17, y 0.00, with no crate push.

### F03 reset and focus-loss input cleanup

Fix: centralized reset clears keys, mouse deltas, jump buffer, coyote, dash time, direction, and cooldown, fire cooldown, feedback timers, particles, tracers, plus a WeaponView reset for ammo, reload, recoil spring, flash, sway, and bob. Window blur, hidden document, and pointer lock loss clear transient input. Pause preserves world progress but requires fresh input.

Evidence: after reset, keys empty, dash 0 and 0, fire cooldown 0, ammo 6, feet 0.00, 0.00, 9.00. After blur, keys empty.

### F04 startup states

Fix: startup states loading, ready, and error, separate from game phase. Start is disabled until ready, loading progress is shown, a failed load names the asset and file and offers Retry without reloading the page or duplicating listeners, the init promise is caught, pointer lock errors show a recoverable explanation, and the menu is preserved until lock is acquired.

Evidence: deliberately missing asset gave the error naming `crate_face` and its file, a Retry button that was enabled, and retry reached the ready Start state.

### F06 resource disposal

Fix: Runner dispose owns its plane geometry, mesh material, shadow geometry, and shadow material, never shared textures. Tracer geometry and material are disposed on removal and on reset.

Evidence: geometries before 12, during 32, after 12, for ten created and disposed runners. The count settles at the starting value.

### F07 muzzle transform

Fix: a muzzle node sits in the weapon hierarchy, the flash is its child, and the reported muzzle uses the node world position after an update, so rotation, position, and scale flow through the hierarchy. The local position comes from manifest source size, rect, trim offset, pivot, and the muzzle attachment, not from a translation-only offset.

Evidence: reported muzzle 0.0592, -0.0489, expected 0.0592, -0.0489, error 0, through recoil.

### F08 shot origin

Fix: the camera ray finds the aim point, then the shot is validated from a consistent world-space gameplay muzzle toward that aim point, blocked by crates and walls, with cosmetic tracers from the world muzzle toward the resolved hit, never an eye-origin streak.

World muzzle point chosen: a fixed offset from the eye, 0.55 forward, 0.28 right, 0.22 down. The first-person overlay has no world transform, so this offset is the gameplay muzzle, documented in code in `main.ts`.

Evidence: wall-blocked shot tracer ran from -0.28, 1.48, 11.55 to -0.04, 1.68, 12.00, while the eye would have been 0, 1.70, 11.00. Crate-blocked shot at the 1.8 metre crate at (-6, 4) left the runner at health 36 and ended the tracer at -5.99, 1.27, 3.10, the crate front face.

Correction learned during testing: the original low crate scenario at (0, -6) with height 1.2 does not block a shot aimed at a runner chest, because the ray passes over the 1.2 metre top. That is correct height-aware behaviour, not a game bug.

### F09 spawn-hit policy

Policy, documented in code: spawning runners are visible but invulnerable for their 500 ms spawn period, are excluded from damage selection, and produce no hit feedback. Pellets pass through a spawning runner and may hit what is behind it. `takeDamage` returns applied, killed, invulnerable, or dead, and the shooter uses that result to decide hitmarker, impact, and score, never reporting a damaging hit that did nothing.

Evidence: spawn shot left health 36 and hitmarker 0, and a later shot after the spawn period reduced health to 0.

### F10 state interruption

Fix: state transitions call a visual reset that restores tint to white, scale to 1, opacity to 1, and shadow opacity to 0.35, except entering death sets transparent to true for the fade. One pause policy freezes world effects and feedback timers together. Damage callbacks are gated once the player is dead.

Evidence: interrupted telegraph returned to pursue with scale 1 and color 16777215 (white). Pause held hitmarker opacity at 1 through the pause, and it cleared to 0 after resume.

Note on the harness: the pause check triggers lock loss with the browser `document.exitPointerLock()` call, which fires the same handler the game uses for real lock loss. Playwright Escape proved flaky for exiting headless pointer lock in this environment, so the test uses the direct lock-loss call instead.

### F11 jump input

Fix: Space writes the jump buffer only during play and only on a non-repeat press. `preventDefault` for game keys runs only while playing and pointer locked. Buffered actions are cleared on phase changes.

Evidence: held Space gave jump count 1 and feet Y 0.00. Menu Space gave jump count 0.

### F12 review layout

Fix: review rows use `repeat(3, minmax(0, 1fr))`, cells use `min-width: 0`, the image wrapper sets its height from the asset aspect ratio, markers sit on that wrapper, and columns collapse at widths up to 1000 px.

Evidence: at 1280 px, all four rows had scroll 1240 and client 1240, with no overlap. At 390 px, the row had scroll 350 and client 350.

### make_alpha.py hardening

Fix: if SciPy is unavailable, the script now fails loudly with an explicit message that SciPy is required for connected-component background removal, and it refuses to fall back to removing every bright low-saturation region, which would erase ivory object surfaces. The silent fallback branch was removed.

Evidence: a normal run on the runner raw image still gave 1600x1600, 80.0 percent transparent, 20.0 percent opaque. A run with SciPy imports blocked gave the loud failure message and wrote no output file.

## Acceptance checks

- Two shots and reload: ammo 6 to 5 to 4, reload showed `Reloading...`, then returned to 6.
- Kill and removal: runner removed after death.
- Death and restart: health after restart 100.
- Crate-blocked shots: covered under F08 above.
- One full wave clear through the browser: 6 runners killed sequentially with kiting, waveComplete menu shown. The wave test spawns the next runner at a far north point before killing the current one, so the wave never empties mid-test, and it retreats when a runner gets within 4 units, so the player survives the wave in slow headless time. An earlier wave design with a distant dummy runner failed because the dummy kept attacking throughout the wave.

## Screenshots

- [f04-error.png](sandbox://workspace/Paper/game/verification/fix-pass1/f04-error.png)
- [f04-ready.png](sandbox://workspace/Paper/game/verification/fix-pass1/f04-ready.png)
- [f07-flash.png](sandbox://workspace/Paper/game/verification/fix-pass1/f07-flash.png)
- [f08-crate.png](sandbox://workspace/Paper/game/verification/fix-pass1/f08-crate.png)
- [f12-review-1280.png](sandbox://workspace/Paper/game/verification/fix-pass1/f12-review-1280.png)
- [f12-review-390.png](sandbox://workspace/Paper/game/verification/fix-pass1/f12-review-390.png)
- [accept-dead.png](sandbox://workspace/Paper/game/verification/fix-pass1/accept-dead.png)
- [accept-wave.png](sandbox://workspace/Paper/game/verification/fix-pass1/accept-wave.png)
- [report.json](sandbox://workspace/Paper/game/verification/fix-pass1/report.json)
- [verify.mjs](sandbox://workspace/Paper/game/verification/fix-pass1/verify.mjs)

## What is placeholder

The slice still has no run, attack, hit, or defeat frames. Those belong to Pass 2. The wave test uses debug hooks enabled only by `?debug=1` and is not part of the shipped game.

## What failed or stayed inconclusive

- Pointer lock denial UI: implemented in code with a promise catch and a `pointerlockerror` listener, but not browser-proven, because headless Playwright allows pointer lock. The F04 browser proof covers only the missing asset error and retry.
- Frame rate, smoothness, and animation feel: not proven. Headless results establish behaviour and rendering only.
- Nothing else failed in the final run. Earlier failures in this session were harness timing issues in slow headless time, not game bugs, except for two test-design fixes: the wave test no longer fires through a dying runner, and the pause test no longer relies on flaky headless Escape handling.

## Principles applied

Principles whose leaf files were read in this session: model-the-domain, prove-it-works, and sequence-verifiable-units.

- Model-the-domain shaped the `PlayerBody` with feet plus height, the `DamageResult` union, and the visibility graph route, instead of scattered booleans or repeated shape assumptions.
- Prove-it-works shaped the Playwright harness that reproduces the audit coordinates in a real headless browser, instead of trusting code review alone.
- Sequence-verifiable-units shaped the order of work: arena and pathing first, then enemy and weapon, then main integration, with the harness rerun after each fix batch.
