# Pass 3 loop and support report

Harness: `verify.mjs`, headless Chromium cached 1248, vite preview on 127.0.0.1:5178.
Final run: 19/19 PASS. Full detail is in `report.json`. Budgets are in `budgets.json`.

## What was built

- `game/src/audio.ts`, new. Synthesized Web Audio sounds only. No audio files exist.
- `game/src/pickups.ts`, new. Procedural canvas-drawn paper sprites only. No bespoke pickup art exists.
- `game/src/main.ts`, edited. Waves, score, combo, pickups, audio wiring, settings, cached HUD, camera shake, perf tracking, debug extensions.
- `game/src/weapon.ts`, edited. Reduced-motion and flash-strength setters.
- `game/src/enemy.ts`, edited. Per-wave speed scale.
- `game/index.html`, edited. Score, combo, health progressbar with numeric value, announcements, settings panel, responsive HUD, desktop requirement text.

## Wave and score rules, exactly as implemented

- Wave 1 has 6 runners at speed 3.4. Wave n has 6 + 2(n - 1) runners at speed 3.4 times min(1.5, 1 + 0.05(n - 1)). Wave 2 is 8 runners at speed 3.57.
- A kill scores 100 points times the combo multiplier. Combo 1 to 2 is x1, 3 to 4 is x2, 5 and up is x3.
- The combo lasts 4 seconds between kills. It decays only while playing, so it survives the wave-complete menu pause. It is lost on death.
- Wave bonus is 250 times the wave number, added on wave clear.
- Death restarts the current wave with full health. Score and wave are kept, combo is lost.
- Wave transition keeps health, refills ammo to 6, and respawns pickups.
- Measured wave 1 clear: score 1450, combo 6. That is 100 + 100 + 200 + 200 + 300 + 300 for kills, plus 250 bonus.
- Scoring happens at the death transition in the game loop, not in the shot path, so every kill scores exactly once.

## Pickup rules and amounts

- Health pickup at (-9, 0, 5) restores 40, capped at 100. Ammo pickup at (9, 0, 5) restores 3, capped at 6.
- A pickup is a floating ivory disc with a red cross or gold shells, plus a ground ring, and it bobs.
- Collection is walking within 1.0 unit with feet at or below 1.2 height. Collection applies once, removes the mesh, bursts particles, and plays the pickup sound.
- A new pickup of a kind spawns at wave start only if none of that kind is still present.
- Measured: health 60 to 100 after collection, ammo 4 to 6 after collection, both pickups marked taken.

## Audio implementation and its limits

- Sounds: shot, reload, impact, footstep, monster attack, jump, land, pickup, wave-complete, player-damage. All are oscillators or filtered noise through one master gain.
- The AudioContext is created only in the Start click handler. Before Start, measured state is initialized false and context state none. After Start, measured state is running.
- Volume and mute drive the master gain. Measured: muted gives gain 0, unmuting to volume 0.5 gives gain 0.5.
- Headless audibility is inconclusive. No sound was heard. What was measured is context creation, context state, gain, mute state, and per-sound call counts, including shot count 1 after one shot.
- Footsteps come from runner footstep events, throttled to one sound per 120 ms across all runners. Monster attack sounds play once per attack entry.

## Settings list and how each takes effect

- Shake strength, 0 to 1. Scales damage camera shake amplitude. Measured change from the settings panel applied to stored settings.
- Flash strength, 0 to 1. Scales the damage vignette opacity and the muzzle flash opacity.
- Mouse sensitivity, 0.25 to 2. Multiplies mouse yaw and pitch deltas.
- Volume, 0 to 1. Sets the audio master gain.
- Mute. Sets the master gain to 0 without changing volume.
- Reduced motion. Forces sprint scale 1 and no weapon bob through the weapon view.
- Settings persist in localStorage under paper-settings-v1 and apply on load. The settings panel is the same menu shown at start and on pause.
- Health is a labeled progressbar with aria-valuenow plus a numeric 100 / 100 value. Announcements use a polite live region only for wave start, wave complete, and defeat.
- HUD text is assigned only when its value changes, including health, ammo, wave, score, combo, hitmarker, damage, and crosshair.
- Narrow menus were checked at 390x844. The Start button stays inside the viewport and the settings panel opens.
- Desktop keyboard and mouse are stated as required on the menu. Touch controls do not exist and are not claimed.

## Budgets, measured

- Startup bytes on the wire, one load: 23,848,517 total. PNG assets 23,252,028, JS 590,049, HTML 6,440. Browser is Chromium cached 1248, resolution 1280x720.
- Disk asset bytes: 23,252,028 across 37 manifest assets. Single JS chunk: 590,049 bytes. The Vite chunk warning remains and was not hidden.
- Texture estimate: 128,626,261 bytes. This is a planning estimate from manifest pixel dimensions at RGBA8 with a 4/3 mipmap factor. It is not measured GPU driver memory.
- Draw calls, measured in play at 1280x720: 18 per frame, world plus overlay renders combined.
- Frame time, measured in headless Chromium: the loop exponential average reads 50.0 ms. That is the loop dt clamp ceiling, and headless software rendering runs slower than wall time, so this number is not a real-hardware frame time and 60 fps is not claimed.
- Not done in this batch, per the F14 remainder: atlas packing, lazy loading of later content, and moving alpha diagnostics behind a review flag. Startup still loads all 37 assets.

## Verification results, final run

- Build: tsc and vite build pass.
- Wave 1 clear with score and combo: PASS, score 1450, combo 6.
- Wave 2 starts with 8 runners: PASS.
- Health pickup: PASS, 60 to 100. Ammo pickup: PASS, 4 to 6.
- Settings menu changes take effect: PASS.
- Audio starts only after Start and respects mute: PASS, with audibility inconclusive as above.
- HUD at 1280x720: PASS, wave, score, combo, health value, ammo, progressbar role all present.
- Narrow menu: PASS.
- Two shots and reload: PASS. Kill and removal: PASS. Crate-blocked shot: PASS, runner health 36, tracer to z 3.10.
- Sprint: PASS, still 1.000, running 1.100, idle 1.000.
- Two runners out of phase: PASS, phases 0.50 and 1.00.
- Death restarts current wave at full health: PASS.
- Fire clip and audio counts: PASS. Environment layers: PASS, sky, skyline, ruins, floor, wall, and three crate variants.

## Known behaviour to review

- Combo survives the wave-complete menu because its timer only decays while playing. That is the implemented rule, stated above, not a hidden bonus.
- Frame time in headless rendering is clamp-limited and is not evidence about real hardware smoothness.

## Placeholders and out-of-scope items, explicit

- No directional runner views, hit frames, defeat frames, reload poses, sprint pose frames, smoke, spark, or shell were added.
- No superjump, grapple, melee, additional weapons, or additional monsters were added.
- No enemy, weapon, or environment art was changed. Pickup art is procedural canvas drawing, not bespoke art.
