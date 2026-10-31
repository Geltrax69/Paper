# Fix N08 and N11

## What changed

- `src/spatial.ts` is a new generic grid. Cell size is 2.0 units. Rebuilt once per frame from the live runners. Neighbor candidates come from the runner cell and its eight neighbors. Enemy separation still filters by exact gap, so the grid changes cost, not behavior.
- `src/main.ts` caps active runners at 12 and concurrent attackers at 4. The spawn gate only releases a queued runner when the active count is below 12. Queued runners are not lost. They spawn when a slot frees. A telegraph runner holds its windup while 4 attackers are already active. The debug API gained `getCaps`, `spatialProbe`, and `startWaveDebug` for controlled test setups. `startWaveDebug` is a test setup, not normal play.
- `src/assets.ts` no longer scans image alpha during ordinary loading. `loadTextures` takes an `alphaDiagnostics` option. Normal play passes it off. Debug and review passes pass it on. Review mode also logs one alpha report per image on load, behind the review flag itself.
- `src/enemy.ts` accepts an optional `canAttack` option. A telegraph runner holds at the end of its windup while the option is false. It does not change damage, range, or strike timing.
- `assets.json` no longer lists `crate_face` or `muzzle_flash_shotgun`. No clip, environment entry, or source file referenced either. Their runtime copies were removed from `game/public/`. Their masters remain in the repo `assets/` tree outside `game/public/`. No other art was resized. The canonical shotgun, front run, floor, sky, and comic HUD art are untouched.
- `package.json` gained `npm test` and `npm run check`, both running `verification/fix-n08-n11/verify.mjs`.
- `README.md` and `VERIFICATION.md` now name the current check command and its environment variables. Older verification folders are historical. The old milestone text in `VERIFICATION.md` is labeled historical.

## Caps, stated plainly

- Active runners: 12. Wave 5 has 14 runners. 12 spawn, 2 stay queued, and a queued runner spawns after a kill frees a slot. Wave completion still requires an empty queue and no live runners.
- Concurrent attackers: 4. A fifth telegraph runner holds in telegraph until an attacker slot frees. It does not lose its windup progress in the sense that its state time keeps counting, but it does not enter attack until allowed.
- Transparent effects: pooled in `src/fx.ts` and unchanged by this slice. Explosions 4, flashes 24, fragments 48, ink stars 24, rings 16, smoke 24, sparks 96, for 236 pooled slots.
- Neighbor queries: grid candidates, not a full scan. Measured in the harness: 3 runners total, 2 grid candidates for a runner with one close neighbor and one far runner.

## Bundle

- The JS chunk was not split. Measured before: 664,380 bytes. Measured after: 665,412 bytes. The chunk is dominated by Three.js. Splitting would move bytes between chunks, not remove them, and would not reduce startup bytes on the wire. The Vite chunk warning therefore remains, and it is a warning, not a build failure. No warning limit was raised to hide it.

## Budgets

See `budgets.json` for the full before and after table. Headline numbers, measured on this VM:

- Manifest assets: 109 before, 107 after.
- Runtime asset bytes: 43,379,985 before, 36,508,256 after, a saving of 6,871,729 bytes from the two unreferenced assets.
- Texture estimate at RGBA8 with a 4/3 mipmap factor: 237.2 MiB before, 211.2 MiB after. This is a planning estimate from manifest pixel dimensions, not measured GPU memory.
- Startup bytes on the wire in the harness, normal play start: 37,185,370 total, including 665,412 JS bytes and 109 responses. That total is manifest assets plus JS plus HTML, measured after the removal. A pre-removal wire total was not measured, so no wire saving is claimed beyond the manifest byte saving.
- Largest remaining runtime textures: canonical shotgun idle 1,994,448 bytes, runner front 1,773,606 bytes, cyan sky 861,326 bytes, ruins 746,414 bytes. The idle and runner front were not resized, because resizing the canonical matched-slice art would visibly change the scene. That tradeoff is stated, not hidden.

## Verification

Run `npm test` in `game/`. It builds, starts its own preview server on `PAPER_PORT` (default 5181), and drives headless Chromium from `PAPER_BROWSER` (discovered from the Playwright cache by default). `PAPER_BASE_URL` and `PAPER_OUT_DIR` override the base URL and output directory. The full run takes roughly 15 to 18 minutes on this VM, because headless game time advances slowly and wave spawns are timer based. The report is `report.json` in this folder. The final clean run passed 23 of 23 with exit 0.

Deliberate regression proof, by the copy method, not in shipped code: a copy of the game in /tmp had `ACTIVE_RUNNER_CAP` changed from 12 to 999, and the same suite failed loudly on the caps check, reporting the cap as 999 instead of 12. The copy was deleted after the check. Shipped code still has the cap at 12, confirmed by grep after the negative run.

- Normal play start: 0 alpha logs. Review mode: 321 alpha logs.
- Wave 5: 14 queued, 12 active, 2 queued, then a kill drains the queue to 1 active 12, then wave complete.
- Attack cap: 6 runners placed in range produced 1 attacker at the sampled moment, never above 4.
- Stability: 10 cycled runners went from 21 to 51 geometries and back to 21 on disposal. Wave counts are in `report.json`. The first settled comparison used wave 2 against wave 3 and grew by one texture, which is first-upload of a clip texture to the GPU, not a new allocation. The suite therefore compares wave 3 against wave 4, after all direction clips have been exercised.
- Prior acceptance in the same suite: two shots 6 to 4, reload transfer to 6, kill score 350 with combo change, crate-blocked shot at the crate near face z 4.90 with runner health 36, left direction clip, aerial melee no damage, close melee exactly 18, no behind-camera grapple, double jump, ledge grounding false, explosion cover with player health unchanged, barrel gone after detonation, decal stable after a camera move, sprint forward, 1920x1080 play with 25 draw calls.

## Inconclusive and not claimed

- All performance numbers are headless software rendering on this VM. No real-device frame rate, startup time, or memory is claimed. Frame time in the harness sits at the 50 ms loop clamp ceiling, so it is not a real-hardware frame time.
- The texture estimate is not measured GPU memory. No driver measurement is available headless.
- Pointer-lock denial in a real browser is still unproven, as before.
- Animation feel on real hardware is still unproven, as before.
- The cap test uses a debug hover, holding the player at height 10, so runners cannot attack while 14 runners spawn. That is a controlled setup for the cap, not normal play. Normal play caps use the same spawn gate and attack reservation code.
- Runner cover by a crate uses the same ray test as player cover, which the suite proves directly. Runner cover was proven in the C01 report and is not re-proven with a moving runner here.
