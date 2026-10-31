# Verification

## Current entry point

Run `npm test` (same as `npm run check`) in `game/`. It runs verification/fix-n08-n11/verify.mjs, which builds, starts its own preview server, and drives headless Chromium. Environment variables: PAPER_BROWSER (Chromium executable path, discovered from the Playwright cache by default), PAPER_PORT (default 5181), PAPER_BASE_URL, and PAPER_OUT_DIR. The latest report from that suite is verification/fix-n08-n11/report.json. The sections below are the original milestone report and are historical. Later pass reports under verification/ record later work. `?debug=1` setups in any harness are controlled test setups, not ordinary keyboard and mouse play, and headless results are not real-device review.

## Build

`npm install` and `npm run build` in `game/` succeed. Three.js is pinned to 0.186.0 in `package.json`. Three.js 0.187.0 was the latest at check time, but `@types/three` 0.187.0 was not published yet, so the pinned pair is 0.186.0 for both. TypeScript compiles with no errors. Vite build output is `dist/`.

## Browser and method

Headless Chromium from the Playwright cache at `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, run by this agent via exec. Gameplay interaction used playwright-core driving the same Chromium binary. The built game was served with `npm run preview` on port 5174. No frame rate is claimed. Headless rendering cannot prove feel, smoothness, or animation quality, and none is claimed here.

## Screenshots

All screenshots are in `game/verification/`, at 1280x720 unless noted.

- `view-1.png`: `?view=1`, one runner. Proves the fixed-camera mode renders the arena, the shotgun overlay at the bottom right with its muzzle pointing up and left, and one runner centred in the arena with its feet on the floor and a ground contact shadow beneath it. No pointer lock was used.
- `view-occlusion.png`: the earlier `?view=1` frame with the runner at (2.5, 0, -3). Proves depth occlusion. The runner is partly hidden behind a crate that stands between it and the camera, and the crate is depth-writing.
- `review-1.png`: `?review=1`, 1280x2600, all four runtime images. Proves each image on light, dark, and checker backgrounds. The red pivot marker sits at the crate centre, the flash centre, and the runner feet. The gold muzzle marker sits on the upper barrel tip of the shotgun image. No checkerboard is baked into any transparent image. The crate is opaque, as recorded.
- `menu.png`: the start menu, opaque, with the scope line and controls visible.
- `gameplay.png`: live play after Start. Proves pointer lock engages, the menu hides, firing drops ammo from 6 to 5, and R shows Reloading. A second click in a later script did not visibly change ammo, which is recorded below as inconclusive rather than explained away.
- `gameplay-approach.png`: live play after 7 seconds, six runners in the wave. Proves the player now faces into the arena, runners approach from the far side, and a runner behind a crate is occluded.
- `gameplay-attack.png`: live play after 16 seconds. Proves runners reach the player, with one runner large in the foreground, feet grounded, contact shadow visible. Health was still 100 percent at this point.
- `gameplay-attack-30s.png`: live play after 30 seconds. Proves the attack loop end to end in the other direction. Health reached 0 percent and the dead menu appeared with a Restart button. First-hit timing is slower than a straight-line estimate, because spawn staggering and crate detours delay arrival.
- `gameplay-shoot.png`: a scripted kill attempt. The crosshair sat above the runner torso, so pellets missed, and the runner count stayed at 6. This screenshot proves aiming error in the script, not a hit.

## What works, by evidence

Menu, pointer lock, pause on lock loss, WASD and mouse aim, shotgun fire with ammo decrement, reload, sprint, jump, and dash are implemented. Firing, reload, pointer lock, pursuit, attack, and death after 30 seconds were observed in the headless browser. Crate and wall collision for the player, enemies, and shots is implemented with circle resolution and slab ray tests in `src/arena.ts`. Enemy behaviour is the spawn, pursue, telegraph, attack, hit, and death state machine in `src/enemy.ts`, with no separate boolean tracking life or death.

## Inconclusive or not screenshot-proven

- Killing a runner, the hit reaction, the death dissolve, and wave completion were not captured in a screenshot. The scripted kill attempt missed, and a full wave clear was not played to completion headless.
- Dash distance, jump height, and crate collision for the player were not measured in a screenshot. They are implemented and unit-shaped, but headless position reads were not taken.
- A shot blocked by a crate was not captured in a screenshot. The slab test is in code, and crate occlusion of a runner is proven visually, but pellet blocking is not.
- The second click in the scripted shoot test did not change ammo from 5 to 4. Single-shot fire and reload were proven in an earlier script, so this is recorded as an inconclusive headless scripting result, not as a confirmed game bug.
- Frame rate, smoothness, and animation feel were not measured and are not claimed. Only real hardware can confirm those.
- The one console 404 seen in the first interaction script did not reproduce in the later script, which reported no console errors. Its source was not identified, so it is recorded here rather than claimed fixed.

## Bugs found and fixed during verification

- The player started facing the back wall. Initial yaw was PI, which faces positive Z, while the arena lies in negative Z from the spawn. Yaw was changed to 0 in both the initial value and reset. The approach screenshot after the fix shows the arena ahead.
- The menu was translucent, so HUD text showed through it faintly. The menu background is now opaque.
- The view-mode runner was half hidden behind a crate. It was moved to (0, 0, -3.5) for a clear attachment shot, and the occluded frame was kept as `view-occlusion.png`.
