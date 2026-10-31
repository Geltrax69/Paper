# Final audit, 2026-10-31, main at 4498ff9

## Verdict

The game is playable end to end at 1280x720 and 1920x1080 with no console or page errors in the final harness. Seven fix.md items are Done by their own Done-when clauses. The rest are Partial, not Done. Real-device performance, feel, pointer-lock denial in a real browser, and headless audio audibility are Left, not PASS. True video was not produced. Frame sequences below prove frame order and state, not smooth timing or feel.

## Build and portable suite, measured

- `npm install` and `npm run build` pass with no TypeScript errors. Vite output is one chunk of 695.87 kB, gzip 174.17 kB, with the chunk-size warning still present. That warning is not a build failure.
- `npm test` is 23/23 PASS. Its full output is in `verification/fix-n08-n11/report.json`, rewritten by that run. Startup in that run is 53,002,166 bytes total, 52,989,329 bytes of assets, 695,872 bytes of JS, 136 responses, and 0 alpha logs in normal play. Review mode still shows 402 alpha logs.
- Final harness is 15/26 PASS on its first run and 6/12 on its rerun, and 7/8 on a short run. The failures in the first two runs are harness sequencing faults, not game faults, and each one is named below. The short run and the prior per-slice reports are the evidence for the items those runs failed to sequence.

## Harness faults found and fixed during this audit, not game faults

- Environment check in the first final run required the sky texture in the mesh map list. The sky is a scene background texture, not a mesh map. The rerun check uses background true plus floor and idle maps, and passes. The first run FAIL for that check is withdrawn.
- Weapon screenshots for pistol, automatic, blaster, knife, and throwable in the first final run are identical wave-complete menus, not weapon views. The shotgun shot in that section killed the only runner, the wave completed, and later selects happened in the menu phase. The real gameplay views are in `verification/fix-c03-views/`, and those are the weapon-view evidence used here.
- Insect and brute pursue waits in the first final run and the rerun used `getLastSpawned()`. `spawnFamilyAt` never sets that handle, so those waits could never succeed. The short run waits on `getState().runners[0].state` and passes both.
- Ink, reload, sprint, and attack waits in the first final run and the rerun failed because killing the only runner moves the game to waveComplete, and runners and keys do nothing in that phase. The short run guards the phase, clicks Next wave, and passes reload frames 0 through 7, sprint scale 1.0 to 1.1, and attack frames 0 through 5. The corrected ink run passes with 20 ink per kill, 60 total, spend 50, leaving 10.
- Stability in the rerun used an unwarmed comparison. Wave 4 is 18 geometries and 28 textures, wave 5 is 18 and 31, wave 6 is 18 and 31. Geometries are flat and textures rise once and then stay flat. That matches the documented lazy-upload premise in `verification/fix-c02-stability/REPORT.md`, not a leak. The exact-equality evidence is the warmed npm test comparison, waves 5 and 6 both at 20 geometries and 60 textures.

## Per-item re-audit

- N03, melee reach. Done. Aerial melee from 10 m leaves runner health at 36. A close strike deals exactly 18 once. A crate-blocked strike deals none. Evidence is npm test n03-aerial, n03-close, and the final harness n03-aerial.
- N04, ledge grounding. Done. Stepping off a crate reads grounded false, coyote goes from 100 to 0 without refreshing while falling, landing fires once, and air jumps reset to 0. Evidence is npm test n04-ledge and the earlier fix-n03-n12 report.
- N05, grapple selection. Done. Aim cone, reticle-angle ranking, and cue equal to attachment. Facing away from an anchor selects a forward anchor, never the one behind the camera. Evidence is npm test n05-behind and the final harness n05-behind.
- N06, grapple release. Partial. Headless release keeps world velocity, with drift 1.77 forward and 2.39 sideways, no tunneling through a crate, and no arena exit. Real-hardware feel is not proven, and fix.md asks for that, so this stays unchecked.
- N01, matching world. Partial. Dark ink floor and cyan open sky are in game at both desktop sizes, with the matching front runner. Walls are still the pale tiled texture, and non-front runner directions are still the older drifted set. Looking up shows open sky, not a giant painted ceiling.
- N02, coherent shotgun. Partial. Canonical idle, real 8-frame reload over 1400 ms with one ammo-transfer event at 675 ms, and sprint scale 1.1 all pass. Fire still uses the diagonal clip with a hardcoded 0.38 radian compensation on the fire mesh alone, so the metadata goal is not met. Reload cancel before the event gives no ammo and cancel after keeps transferred ammo, both proven in the matched-slice report.
- N07, direction and state continuity. Partial. Hysteresis passes with one direction change and no flicker or phase reset. Back-facing attack shows the back run pose, not a face. Hit shows the current run pose at scale 1.00, not the old idle art. True directional attack art is still missing, and the run-pose fallback is not a distinct attack swing from the side or back.
- N09, comic HUD. Done. Combo card, wave stamp, health number with cross, ammo pips with RELOAD state, power strip for dash, air jump, grapple, and melee, ink meter, four-part reticle with different hit and kill shapes, and capped comic words are all live text and state, not baked images. Menu is Play, Settings, and How to play. Narrow menu at 390 width keeps the Start button inside the viewport.
- N10, surface decals. Done. Decals carry normal and owner, sit flush on the surface, do not turn toward the eye, and stay in place after a camera move. Evidence is npm test n10-decal with normal 0,0,1.
- C01, shared FX and explosion. Done. Grouped pellet feedback, heavy impact with at least five fragments, explosion warning, bloom, smoke, and a fading terminal phase with nothing lingering, linear falloff with distance, crate cover blocking damage, barrel chain depths 0, 1, 2, and pooled effects capped at 236. Evidence is the fix-c01-explosion report, 26/26, plus the final harness barrel cover check with player health unchanged at 100.
- N12, reduced motion and flash. Done. Reduced motion plus zero flash gives no camera shake or roll on damage, and explosions do not shake or roll the camera. Zero flash removes bright bloom and core layers while the ring and hit cues remain. Evidence is the final harness settings-reduced check and the C01 reduced and zero-flash checks.
- N08, asset budgets and caps. Partial. Alpha scans moved to review and dev only, active runners capped at 12 with a queue, attackers capped at 4, neighbor queries use a spatial grid, and warmed waves are exactly stable. No atlas packing, no streaming of later families, and startup grew to 53.0 MB across 134 eager assets. The single-chunk warning remains.
- N11, portable verification. Partial. `npm test` runs on this machine with PAPER_BROWSER, PAPER_PORT, PAPER_BASE_URL, and PAPER_OUT_DIR, and covers melee reach, ledge grounding, grapple selection, action-event deduplication, and disposal. Current docs are not accurate, because both READMEs still describe the old state. That docs gap is listed below and keeps this item unchecked.
- C02, insect and brute. Partial. Both families spawn with distinct front run clips, distinct telegraphs, and distinct counterplay. Insect telegraph is a 0.75 turquoise ring and its leap strikes for 10. Brute windup is a 2.6 gold ring and its slam hits for 20. Crate cover blocks both. Attacks stay at or below the cap. Both are front-only art, with the run-pose fallback for non-front attacks and a tint and fade defeat, not full directional coverage.
- C03, arsenal and ink pressure. Partial. All six weapons switch with correct HUD ammo, shotgun 6, pistol 12, automatic 30, blaster 8, knife 6, grenade 3. Pistol deals 20, blaster bolt stops at a crate and hits a runner for 30, knife windup and world projectile hit for 34, grenade arc and fuse detonate, automatic fires repeatedly, and ink pressure builds 20 per kill and spends 50 for a shock with a cooldown. Pistol and automatic views are procedural and read simpler than the generated shotgun and blaster art, and the automatic dark magazine block may read as a second grip at gameplay distance. That art gap keeps this item unchecked.

## Completion gate, item by item

- Build passes. Normal loading and play produce no unexpected console, page, or network errors in the final harness.
- Reach, grounding, grapple, and release defects from the audit are fixed as far as headless evidence can show. Real-hardware feel is Left.
- Actual runtime matches the reference in floor, sky, front runner, shotgun idle and reload, and comic HUD. Walls and non-front directions do not yet match.
- Recordings are frame sequences, not video. Normal polling gives run frames 2 through 7 then 0 through 1 in order, fire frames 1 through 4, reload frames 0 through 7, sprint scale 1.0 to 1.1, attack frames 0 through 5, and six explosion samples with a ring and fragments screenshot. Slowed review stepping gives runner run front 8 steps, shotgun fire 5 steps, shotgun reload 8 steps, and runner attack front 6 steps, each with a screenshot. True video was not produced, and screenshots alone do not certify animation timing.
- True alpha, opaque ivory, clean edges, frame order, pivots, and terminal fades were checked from the manifest and the runtime files. Muzzle flash fades from 0.184 opaque on frame 1 to 0.034 on frame 6. Runner defeat ends on ink fragments at 0.16 opaque. All clips keep a single pivot per clip. Defects found are listed below.
- Pause and resume, missing-asset retry, pickups, wave clear, death and restart, crate-blocked shots, and reduced-motion settings all pass in the final harness or the rerun.
- Repeated waves settle at stable counts after warmup, as stated in the stability section above.
- Performance is measured on headless software rendering only, as stated below. Real-device numbers are Left.
- Runtime textures live under `game/public/`, masters under `assets/`, guides under `output/`, and no runtime source references `output/`. Historical verification folders are labeled historical in `game/VERIFICATION.md`. Current docs are not fully accurate, as listed below.

## Performance and stability, headless only

- Hardware is this VM, 4 cores, Ubuntu 24.04.5, headless Chromium 156 from the Playwright cache, SwiftShader software rendering. Load average during runs ranged from about 2.4 to about 8.1, so the limiter is CPU rasterization, not the game logic. That is why these numbers are not real-device numbers.
- Startup bytes are 53,002,166 total, 52,989,329 assets, 695,872 JS, 136 responses, in one npm test run. Manifest files on disk total 52,293,457 bytes for 134 assets. Startup wall time was not recorded as a number, so none is claimed.
- Draw calls are 20 in the rerun stability waves, 25 in the npm test 1920x1080 check, and 8 in the npm test stability probe. These are different scenes and states, so no single draw-call number is claimed.
- Frame time reads 50.0 ms in most headless states and 46.3 ms at 1920x1080. That is the loop dt clamp ceiling under software rendering, not a real-hardware frame time. No frames per second number is claimed.
- Stability after warmup is exact in npm test, waves 5 and 6 both at 20 geometries and 60 textures. The unwarmed rerun is 18 geometries flat and textures 28, then 31, then 31, which is one lazy-upload step and then flat.

## Defects carried forward, including already-known items

- Walls are still the pale tiled texture, so the arena does not fully match the dark-ground reference.
- Runner non-front directions still drift in costume from the front identity. At gameplay distance the silhouettes read, at review distance the drift is visible.
- Insect and brute are front-only art. Non-front attacks use the run pose with telegraph tint, and defeat uses tint and fade, not a distinct directional defeat.
- Pistol and automatic views are procedural and simpler than the generated shotgun and blaster art. The automatic dark magazine block may read as a second grip at gameplay distance.
- Shotgun fire still carries the 0.38 radian rotation compensation on the fire mesh alone. The canonical fire set was not adopted.
- The manifest clip `shotgun_idle` references asset id `shotgun_idle`, which is not in the assets dict. Runtime idle uses `punchy_shotgun_idle` directly, so this is a manifest hygiene defect, not a runtime break. It was found by this audit.
- Insect run clip frames are numbered _02 through _07, six frames, with no _01 in the clip. The clip itself is complete at six frames.
- Brute run frames are 560x560 squares while runner frames are tall rectangles. In-game brute proportions read correctly in the screenshot, so this is a note, not a visual defect.
- Sky wrap seam measures about 23 and floor seams about 14 and 12 in raw pixel difference. No seam line is visible in the gameplay captures viewed, but pixel-perfect seamlessness is not claimed.
- Defeat shadow staying at full opacity until removal was reported earlier and was not rechecked in this audit. It is carried as unverified, not claimed fixed.
- `game/README.md` still says audited at 6f109f2, one shotgun, reload is an idle-sprite dip, hit reaction uses the old idle image, and additional weapons, monsters, comic HUD, and explosion gameplay are future work. All of those are false at 4498ff9. The root `README.md` still describes the same old state. `game/VERIFICATION.md` correctly labels its early sections historical, but the README screenshots still present milestone images as current.

## Left, not PASS

- Real-device frame rate, smoothness, and animation feel on named hardware.
- Grapple swing feel and release arcs on real hardware.
- Pointer-lock denial UI in a real browser. Headless Playwright allows pointer lock, so denial was not browser-proven.
- Headless audio audibility. Only context creation, state, gain, mute, and call counts were measured in earlier work, and no sound was heard headlessly.
- Wraith, winged beast, demon, and regenerating mutant families from C02. Only runner, insect, and brute are shipped.
- Atlas packing, lazy loading, and streaming from N08.
- True video recordings of run, fire, reload, sprint, attack, and explosion.
- A docs pass to make both READMEs match the shipped game.

## Evidence files

- `game/verification/final-audit/report.json`, first final harness, 15/26, with the harness faults named above.
- `game/verification/final-audit/report-rerun.json`, rerun, 6/12, with the corrected environment and wave checks passing.
- `game/verification/final-audit/report-short.json`, short run, 7/8, with reload, sprint, attack, insect, and brute passing.
- `game/verification/final-audit/stability-rerun.json`, unwarmed wave samples.
- Screenshots in the same folder, including `gameplay-1280.png`, `gameplay-1920.png`, `menu-narrow.png`, `pause.png`, `retry-error.png`, `retry-ready.png`, `pickups.png`, `settings-reduced.png`, `wave-complete-rerun.png`, `death-rerun.png`, `crate-blocked.png`, `barrel-explosion.png`, `weapon-shotgun.png`, `insect-telegraph.png`, `brute-slam.png`, `ink-shock.png`, `seq-explosion-rerun.png`, and slowed stepping screenshots `seq-runner_run_front-slowed-step*.png`, `seq-shotgun_fire-slowed-step*.png`, `seq-shotgun_reload-slowed-step*.png`, and `seq-runner_attack_front-slowed-step*.png`.
- Prior slice reports, all green, are `verification/fix-n03-n12/report.json` 13/13, `verification/fix-c01-explosion/report.json` 26/26, `verification/fix-c02-monsters/report.json` 24/24, `verification/fix-c03-weapons/report.json` 18/18, `verification/fix-c03-views/report.json` 10/10, `verification/punchy-matched-slice/report.json` 33/33, and `verification/fix-n08-n11/report.json` 23/23 from this audit run.
