# Pickup disposal leak: probe and fix

## Verdict
The leak was real. A taken pickup was removed from the scene but never disposed, and it stayed in the pickups array, so every collected wave added two taken entries, two new CanvasTextures, and four new geometries. The fix disposes on collection and on respawn replacement, and the counts now plateau exactly.

## Probe method
Headless Chromium via Playwright, same warmup principle as the C02 stability probe. Wave 1 is warmup, so first texture upload does not masquerade as a leak. Each wave from 1 to 6 uses startWaveDebug, clears runners, moves the player to (0,0,9) before spawn so a pickup is not auto-collected at its own spawn point, damages the player by 40, fires one shot, faces each pickup from 4 units away so its texture uploads, then stands on it to collect it. Counts are renderer.info.memory textures and geometries from the debug state, recorded after both pickups are collected each wave. An early probe version collected the ammo pickup at spawn time and showed only plus 1 texture per wave. Moving the player away before spawn fixed that artifact, and the clean probe shows plus 2 textures and plus 4 geometries per wave before the fix.

## Numbers before the fix
Measured in probe-pre.json. After collection, per wave: textures 24, 26, 28, 30, 32, 34. Geometries 27, 31, 35, 39, 43, 47. Pickup entries 2, 4, 6, 8, 10, 12, all taken. Deltas from wave 2 onward are plus 2 textures, plus 4 geometries, plus 2 pickup entries every wave. Health went 60 to 100 and ammo 5 to 6 every wave, so collection itself worked while leaking.

## Numbers after the fix
Measured in probe-post.json. After collection, every wave from 1 to 6: textures 22, geometries 23, pickup entries 0. Deltas are 0, 0, 0 across all five wave transitions. Health went 60 to 100 and ammo 5 to 6 every wave, unchanged rules. Respawn at the next wave still creates exactly 2 pickups, one per kind, because the collection path removed the taken entries.

## Fix
Files changed, nothing else: game/src/pickups.ts and game/src/main.ts.

- pickups.ts stores the ring geometry and ring material as fields instead of creating them inline, and dispose now disposes the disc geometry, the disc material, its CanvasTexture map, the ring geometry, and the ring material. The old dispose missed the ring pair entirely, so even clearPickups on restart leaked ring geometry and material.
- main.ts collection path calls pickup.dispose after scene.remove, and after the pickup loop the array is filtered to untaken entries, so a disposed pickup cannot linger and cannot block or duplicate a respawn.
- main.ts spawnPickups disposes and drops any taken entry of a kind before creating its replacement, so the respawn path is safe even if a taken entry ever survives collection.

No pickup rule changed. Positions, amounts, radius, height limit, respawn rule, score, and audio are untouched. No weapon, monster, explosion, cap, or settings logic changed.

## Verification
- npm install: up to date, no changes.
- npm run build: tsc and vite build succeeded, no TypeScript errors.
- npm test end to end: 23/23 PASS, including accept-shots, accept-reload, accept-kill, crate-blocked, directional, N03 aerial and close melee, N05 behind-camera grapple, N04 ledge, barrel cover and trigger, N10 decal, sprint, N08 stability at waves 5 and 6 with equal geometry and texture counts, and 1920x1080 acceptance. The npm test run rewrote verification/fix-n08-n11 screenshots and report as a side effect, and those files were reverted to HEAD, so the only remaining diff is the fix plus this new folder.
- Screenshot: pickup-probe.png in this folder, taken after the post-fix probe wave 6. It is a menu-free gameplay frame, not a proof of the counts. The counts in probe-pre.json and probe-post.json are the proof.

## Inconclusive
GPU memory beyond the renderer info counts was not measured, so the claim is limited to texture count, geometry count, and pickup array length, all of which plateau. Real-hardware feel and frame rate are unchanged by this fix and were not re-measured here.
