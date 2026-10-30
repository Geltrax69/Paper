# Paper — current audit and punchy ink correction plan

**Audited 31 October 2026 after pulling `main` to `6f109f2`.** This replaces the 30 October report, preserved in Git at `9562fe2`. This pass creates new findings, implementation/image prompts and three visual guides. The planned runtime restyle and gameplay fixes are **not yet applied**.

## Current direction

- **[Detailed implementation prompt](docs/PUNCHY_INK_GAME_PROMPT.md)** — art matching, live comic UI, weapons, fluent animation, explosions, monsters and mechanics.
- **[Asset prompts and all 40 techniques](docs/PUNCHY_INK_ASSET_PROMPTS.md)** — generation recipes and technical qualifications.
- **[Gameplay/UI target](output/punchy-ink-v2/gameplay-ui-target.png)** — a new illustration, not a current game screenshot.
- **[Monster poses](output/punchy-ink-v2/monster-key-pose-guide.png)** and **[FX candidates](output/punchy-ink-v2/effects-candidates.png)** — real-alpha guides, not approved runtime atlases. [QA/provenance notes](output/punchy-ink-v2/README.md).

The original boards in `output/gameplay/` remain the art authority: violet-black ground, turquoise open depth, expressive ivory/charcoal creatures, golden bursts and drawn HUD. The runtime must match that language rather than merely contain more detailed images.

## Latest pull: what exists now

Seven implementation commits since the old audit added correctness fixes, animation, scenery, loop features and powers.

| Area | Current state |
| --- | --- |
| Build | Strict TypeScript + Vite production build passes. |
| Runner | Eight directions × eight run poses, six front attack poses, eight front defeat poses, phase offsets and spawn cue. |
| Gun | One shotgun, five diagonal firing poses, six flash phases, recoil/sway and closer-gun sprint scale. |
| Reload | Functional 1400 ms refill; still the idle image plus a dip, no reload poses. |
| World | Sky, skyline, ruin layers, floor/wall materials and three crate variants are integrated. Their presence does not establish a visual match. |
| Loop | Waves, score/combo, pickups and synthesized sound. |
| Player | Sprint, jump/double jump, dash, grapple and melee. |
| Settings | Sensitivity, shake, flash, sound and reduced motion; health semantics; desktop support notice; review stepping/playback. |
| Still missing | Other playable weapons, throwables, other monster families, proper explosion gameplay, coherent reload animation and final comic HUD. |

Do not describe the current build as four images, one still runner and no powers/audio. That is an outdated milestone.

## Verification

```sh
cd game
npm ci
npm run build
npm run preview -- --host 127.0.0.1
```

Preview: `http://127.0.0.1:5174/`. Browser: local Playwright-driven headless Chrome **156.0.8078.74**. Controlled scenarios use the existing `?debug=1` API; no tracked source or served source response was patched for inspection.

- **Pass:** install/typecheck/build. Vite warns about a **625.51 kB** minified JS chunk; this is advisory, not compilation failure.
- **Pass:** normal tested loading/play paths had **no console/page errors or failed asset requests**.
- **Pass:** pointer lock, two shots `6 → 5 → 4`, reload back to `6`, independent runner frame advancement, pause and sprint scale approximately `1.10 → 1.00` on stopping.
- **Pass:** ten rendered temporary enemies changed geometry count `22 → 52 → 22` after disposal. The original simple enemy-geometry leak did not reproduce.
- **Pass:** jump count progressed `1 → 2 → 2` after a third midair attempt; landing reset the air-jump allowance.
- **Pass:** intentionally aborting an asset request showed its name and Retry with no unhandled page error; allowing the request and retrying returned to Start.
- **Controlled reproductions:** aerial melee overreach, stale grounding off a crate and a grapple target behind the camera, detailed below.
- **Asset inventory:** **101** manifest images, **40,049,406 bytes**; approximately **225.3 MiB** estimated RGBA8 storage with full mip chains, before other resources. Not measured GPU allocation.
- **Local startup observation:** approximately 1.53 seconds to ready, 102 `/assets/` requests including the JS bundle. This is not a deployment/network benchmark.
- **Visual checks:** 1280×720 and 1920×1080 gameplay plus a 390×844 menu. No real-hardware FPS, long-session memory or subjective swing-feel claim.

Evidence: [main results](game/verification/audit-2026-10-31/results.json), [follow-up](game/verification/audit-2026-10-31/followup-results.json), [gameplay](game/verification/audit-2026-10-31/gameplay-desktop.png), [fire](game/verification/audit-2026-10-31/firing.png), [reload](game/verification/audit-2026-10-31/reloading.png), [narrow menu](game/verification/audit-2026-10-31/menu-narrow.png), [1920 view](game/verification/audit-2026-10-31/gameplay-1920.png).

## Reassessment of the old findings

| Old ID | Current assessment |
| --- | --- |
| F01 pathing | Visibility-graph routing/separation implemented. Source-reviewed; older pass reports route tests. Do not repeat the old failure as newly reproduced here. |
| F02 height | Authoritative body position and enemy-to-player height/LOS checks implemented. New player-to-enemy melee overreach is a separate defect. |
| F03 reset/input | Central input/action/weapon reset and blur/lock-loss cleanup implemented. |
| F04 startup | Loading/error/retry and pointer-lock error UI implemented. Current missing-asset retry rechecked successfully. |
| F05 animation | Run/attack/defeat/fire/flash now animated. Reload/hit/other viewpoints remain incomplete. |
| F06 disposal | Enemy/tracer resource disposal implemented; geometry reclamation rechecked. |
| F07 muzzle | Transform-following attachment nodes implemented. Source-art registration/identity still needs work. |
| F08 shots | Gameplay muzzle offset and camera-aim-to-muzzle obstruction check implemented. |
| F09 spawn | Spawning enemies excluded from shot damage; damage outcomes returned. |
| F10 visual state/pause | State visual reset and world effects inside playing loop implemented. |
| F11 repeated jump | Phase-gated non-repeat jump input implemented. Off-ledge grounding is a different new defect. |
| F12 review | Responsive wrapper/grid and playback controls implemented. |
| F13 settings | Health semantics, settings and support notice implemented; presentation still needs redesign. |
| F14 loading | Cached HUD writes improved; eager serial loading and production alpha scans remain. Asset volume grew. |

## Current prioritized findings

P1 = major next-pass work; P2 = important follow-up. Art gaps are requirements failures, not JavaScript exceptions. No normal-startup P0 blocker was reproduced.

### N01 — P1: world, creatures and HUD do not match the original boards

**Evidence:** direct screenshot comparison. Current game has a pale square-grid courtyard, giant cream ceiling-like sky shapes, beige walls and small smooth masked characters. Reference has dark violet ink ground, cyan atmosphere, layered fortress structures and rough monstrous silhouettes. Plain system text replaces the drawn HUD cards.

**Locations:** `game/src/arena.ts:110–149`, `game/src/environment.ts:6–53`, `game/index.html:9–35`, current environment/monster textures.

**Fix:** apply the reference-locked palette and image recipes in the new prompts. Replace inappropriate source images, especially floor and spherical sky. Set coherent horizon/architecture scale and independent depth layers. Build live ink/paper HUD panels. Do not solve wrong artwork solely with saturation or bloom.

**Accept:** actual idle, shot, reload, sprint and monster-action captures match the reference language at both desktop sizes. A generated poster is a target, not evidence of an implemented restyle.

### N02 — P1: weapon changes identity when firing; reload remains a dip

**Evidence:** idle/fire screenshots show different barrel/receiver proportions and hand framing; cutoff wrists become visible during fire. The separate fire mesh has approximately **0.38 radians** of orientation compensation. Rotation cannot make two incompatible drawings the same prop. Reload still lowers idle art and refills from a timer.

**Locations:** `game/src/weapon.ts:223–245,278–283,299–325`; shotgun clips in `game/assets.json`.

**Fix:** approve one canonical reference-matched shotgun. Produce consistent idle/fire/reload/sprint poses, full forearm continuation, common grip and per-frame muzzle/ejection metadata. Prefer layered transforms plus a few true shape-changing poses. Add reload performance and one ammo-transfer event with explicit interruption/recovery rules. Replace art-specific hardcoded dimensions/rotation fixes with metadata where appropriate.

**Accept:** no silhouette/hand pop, floating wrists, changing barrel arrangement or flash drift. Reload visibly uses hands/prop poses; sprint remains smoothly closer while preserving aim.

### N03 — P1: player melee can hit ground enemies from far above

**Reproduced:** a vulnerable ground runner was spawned, then player feet placed at `(0,10,1.5)` looking down. The existing melee action changed runner health **36 → 18** while player feet remained about **9.60 m** high.

**Location:** `game/src/main.ts:619–637`.

**Cause/fix:** reach is horizontal; aim-cone/ray checks do not impose actual 3D reach or vertical overlap. Use a swept melee volume or height-aware cone/capsule, solid obstruction and per-swing hit deduplication.

**Accept:** the reproduction deals no damage; a valid close strike still deals exactly 18 once, cover blocks it, and aerial attacks have explicit bounded reach.

### N04 — P1: stepping off a crate leaves the player grounded in midair

**Reproduced:** stand on crate `(3,1.5,1)`, strafe off the right edge and sample before floor contact. At approximately `(4.92,1.16,1)`, **grounded was true** and **coyoteMs was 100**, with actual support at floor height zero.

**Location:** `game/src/main.ts:1568–1607`.

**Cause/fix:** support can set grounded true without clearing it when support disappears, so coyote time refreshes while falling. Derive grounding from current support/contact, transition to airborne on support loss, start one finite coyote window, and reset air jumps only on real landing.

**Accept:** leaving a ledge clears grounding immediately, the window expires, air jumps cannot get unintended resets, and landing feedback triggers once.

### N05 — P2: grapple selection can choose an anchor behind the camera

**Confirmed behavior:** player at `(0,0,9)`, facing negative Z, attached to `(0,2.8,11)` behind the view with rope length about **3.44**. Current nearest-anchor selection is intentional code; this is a control/readability change, not an exception.

**Location:** `game/src/main.ts:495–515`.

**Fix:** visible aim cone plus range/LOS, rank by reticle angle before distance, and show a stable valid/blocked cue. Pressing E must use the indicated point.

**Accept:** looking toward a valid point predictably selects it, no unexpected attachment behind the player, and cover still blocks acquisition.

### N06 — P2: grapple release drops vertical momentum and damps sharply

**Evidence:** source review at `game/src/main.ts:523–533,1545–1558` sets momentum Y to zero and applies damped momentum for 400 ms. The historical powers report also notes only about 0.07 units of measured release drift; that value was not independently remeasured here.

**Fix:** retain a world velocity, constrain appropriate rope components and preserve useful tangential/vertical release velocity. Use coherent air steering/drag, swept collision and obstruction detach. Tune the existing mechanic before promising an aerial-score system.

**Accept:** different release phases produce predictable arcs and useful motion without tunneling; verify at varied frame rates and on real hardware.

### N07 — P2: view/state switching exposes sprite discontinuities

**Evidence:** `game/src/enemy.ts:53–68,281–284` rounds directly into 45-degree sectors without hysteresis. Phase preservation exists and should remain. Attack/defeat are front-only; hit switches to old idle art (`:572–575`). Artwork measurements are hardcoded rather than fully described per frame.

**Fix:** hysteresis, preserved phase, coherent state/view art or prepared cutout rigs, and per-frame root/ground/attachment metadata. Compatible anatomy may share a rig; a one-piece PNG is not already skinned. Add elevated coverage where close aerial views expose missing surfaces.

**Accept:** no boundary flicker, backward-facing enemy showing its front during every attack, hit-state size pop or foot drift. Check motion, not only contact sheets.

### N08 — P2: asset volume and wave population need budgets before expansion

**Evidence:** `game/src/assets.ts:115–137` loads all 101 textures serially and scans image alpha in ordinary startup; there is no runtime atlas. `main.ts:702–708` adds two enemies per wave without an active cap; neighbor separation scans other runners per enemy. Current full-mip texture estimate is about 225.3 MiB. Bundle advisory is 625.51 kB.

**Fix:** separate masters from runtime exports, resize appropriately, pack with edge gutters/extrusion and stream later families. Move diagnostics to review/dev. Share static geometry/texture storage with explicit ownership while preserving independent animation clocks. Add spatial lookup and active-enemy/attack caps. Profile bundle splitting rather than hiding the warning.

**Accept:** named hardware/browser/resolution startup, frame-time, draw-call and repeated-wave memory measurements. More generated masters must not imply more eager downloads or unlimited active entities.

### N09 — P2: plain HUD and long opening rules obscure the action hierarchy

**Evidence:** current HUD is small system text with a simple health rectangle. No visible power-readiness strip exists. The initial menu includes the whole rules specification; at 390×844 Start sits close to the bottom. Desktop-only support is correctly disclosed already.

**Locations:** `game/index.html:9–35,63–79`; `main.ts:1784–1835`.

**Fix:** live comic cards/stamps, stable numbers, event-linked responses and actual dash/air-jump/grapple/melee indicators. Short Play/Settings/Help menu, optional rules and scrollable content. Keep backing art separate from text/state, retain focus and semantic health.

**Accept:** readable center aim, clear true status, no decorative meters, usable settings at narrow sizes/zoom and no effect covering an attack tell.

### N10 — P2: decals are eye-facing discs rather than surface-attached ink

**Evidence:** `game/src/main.ts:407–424` aims non-floor circles at the camera. `RayHit` at `arena.ts:4` has no normal/owner metadata. Contact marks can appear to float instead of sticking to a wall/crate.

**Fix:** return contact normal and surface/owner, orient/offset pooled organic ink decals on that surface and handle edges/z-fighting. Keep airborne sparks separate.

**Accept:** moving the view preserves a mark flush to its original surface without turning toward the viewer or crossing unrelated geometry.

### N11 — P2: historical docs and harness paths are not a current portable test entry point

**Evidence:** before this documentation update, root/game READMEs still claimed one wave, one front view and four images. `game/VERIFICATION.md` covers the first milestone. Existing verify scripts hardcode Linux Chromium paths; `game/package.json` lacks a standard test command.

**Fix:** label milestone reports, keep current features/run/verification links accurate and parameterize browser executable/base URL/output paths. Provide a small portable regression suite for real reach/grounding/resource/action-timing risks. Distinguish scripted state setup from ordinary play.

**Accept:** contributors can follow documented build/check commands on supported machines without editing absolute paths. Current, historical and proposed content are clearly separated.

### N12 — P2: reduced-motion policy covers only some camera/visual effects

**Evidence:** WeaponView handles reduced-motion sprint/bob and aerial streaks check the setting. Damage camera translation at `main.ts:1674–1678` uses shake strength without an explicit reduced-motion gate. Current settings text promises limited reductions, so do not claim complete support from the checkbox.

**Fix:** one effective policy for camera shake/roll/zoom, weapon, HUD, hit-stop, streaks and new explosions. Suppress disruptive movement while retaining hit/danger cues; flash strength remains separately adjustable.

**Accept:** reduced-motion damage/explosions do not shake/roll the camera; zero flash removes bright layers without hiding intent or hit confirmation.

## Missing content: implementation order

These are planned additions/incomplete requirements, not newly reproduced exceptions:

1. **Matching slice:** dark ink floor, open cyan sky, reference-matched runner, one coherent shotgun including reload, live comic UI and one proper layered explosive effect.
2. **Shared FX:** 3–5 flashes and 5–8 impacts/rings/smoke/fragments. Explosion behavior has radius/falloff/cover, not just a pretty loop.
3. **Distinct monsters:** runner + insect + brute first, then wraith/winged/mutant/demon families. Share compatible technology; retain anatomy and unique telegraphs/counterplay.
4. **Arsenal:** pistol, automatic, blaster, knives and throwables with separate action events, ammo rules and collision/projectile behavior.
5. **One new mechanic first:** ink-pressure spend, a marked explosive-barrel chain or aerial style rewards. Do not show unused meters or claim all concepts are implemented.

## Acceptance checklist for the next implementation pass

- [ ] Fix aerial melee and off-ledge grounding with meaningful regressions.
- [ ] Make grapple selection/velocity predictable; preserve working cover/LOS checks.
- [ ] Lock the original art and compare the actual runtime against it.
- [ ] Replace incompatible gun/monster art; add real reload/action events once per action.
- [ ] Build organic live HUD/menu, power feedback and localized layered FX.
- [ ] Use the [40-technique mapping](docs/PUNCHY_INK_ASSET_PROMPTS.md): prepared cutouts/weights are needed for rigging; perspective already handles distance scale; unlit sprites require explicit lighting/tint logic.
- [ ] Verify true alpha, matte edges, ivory opacity, pivots, phase correspondence, trim metadata and terminal FX fade.
- [ ] Deliver normal/slowed short recordings of run, fire, reload, sprint, attack and explosion. Screenshots do not certify animation timing.
- [ ] Check pause/resume, missing-asset retry, pickups, settings, waves, kills, death/restart, crate-blocked shots and repeated-wave memory.
- [ ] Check 1280×720, 1920×1080 and narrow menus; measure real-device performance.
- [ ] Keep illustration targets, source candidates and approved runtime exports distinct in the manifest/docs.

## Audit tools and foundations to preserve

Impeccable's detector flags close text-size steps and the intentional red damage glow. Treat the latter as feedback needing appropriate controls, not an automatic deletion. Neither is a crash finding.

Technical scores, scoped judgment rather than certification: accessibility **3/4**, performance **2/4**, responsive **2/4**, visual configuration **1/4**, implementation integrity **2/4** = **10/20**. There are **12 current findings: four P1 and eight P2**.

Preserve strict build, separate render layers, per-instance animation players, grounded sprite geometry, explicit phases, body-aware collision, muzzle obstruction checks, reset/error handling, disposal, bounded particle/decals and honest pass reports. Useful focused passes: `$impeccable harden`, `$impeccable animate`, `$impeccable optimize`, `$impeccable adapt`, then `$impeccable audit` and finally `$impeccable polish`.
