# Paper — verified issues and implementation plan

Audited 30 October 2026 after pulling `main` to **`2cbdcb4`**. This is an audit and a specification for the next implementation pass. The fixes and new animation assets below have **not** been implemented by this audit.

## What actually works and what is missing

The game builds and runs. The ordinary browser paths tested produced **no JavaScript page errors, console errors or failed asset requests**. The most visible problems are incomplete animation/art and several gameplay defects, rather than a game that cannot start.

Monsters **already translate toward the player**, but they slide in one fixed pose. There is only one runner image, one shotgun image, one muzzle-flash image and one crate image. Increasing image detail alone will not animate them: the runtime needs an animation player, registered frames, animation events and directional selection.

Verified working: Start/pointer lock; pause on lock loss; two successive shots changing ammo `6 → 5 → 4`; reload displaying `Reloading...` then returning to `6`; enemy pursuit; crate depth occlusion in the rendered scene; and a controlled shot killing/removing a runner. The controlled kill positioned an existing target in a clear lane, so it does not prove full-wave completion through normal play.

Missing content: monster run/attack/hit/death frames, gun firing/reload/sprint poses, sky and skyline imagery, generated ground/wall textures, richer environment props, sound, more waves, additional weapons and the planned superpowers.

## Run and verification record

From the repository root:

```sh
cd game
npm ci
npm run build
npm run preview -- --host 127.0.0.1
```

- Production preview: `http://127.0.0.1:5174/`.
- Development server used for source instrumentation: `http://127.0.0.1:5173/`.
- TypeScript and Vite production build: **pass**.
- Vite warning: one minified JS chunk is **545.99 kB**, above its 500 kB advisory threshold. This is a warning, not a compilation failure.
- Browser: local headless Google Chrome **156.0.8078.74**, Playwright-driven, desktop **1280×720** and narrow view **390×844**.
- No native-hardware FPS claim. Headless browser results establish behavior/rendering, not how good motion feels on a real gaming device.
- The first browser pass used the unmodified production build. Diagnostic tests then injected a temporary inspection hook into the development response, without changing tracked game source. Controlled class tests and forced network failure are identified below.

Evidence: [main results](game/verification/audit-2026-10-30/results.json), [additional results](game/verification/audit-2026-10-30/extra-results.json), [desktop sprint](game/verification/audit-2026-10-30/desktop-sprint.png), [reload](game/verification/audit-2026-10-30/desktop-reloading.png), [narrow viewport](game/verification/audit-2026-10-30/mobile-view.png), [first viewport of asset review](game/verification/audit-2026-10-30/asset-review.png).

## Priorities and audit summary

Priorities: P0 = cannot proceed; P1 = fix before treating this as the requested playable game; P2 = fix during the next quality pass. Planned content expansions are distinguished from defects in the current slice.

**Implementation integrity: partial.** The game has a useful spatial scene, separate weapon layer, manifest and enemy state machine. It does not yet meet the image-animation brief. Normal startup is functional; edge-case recovery and state ownership need work.

| Dimension | Score / 4 | Main finding |
| --- | --- | --- |
| Accessibility | 2 | Named Start button and keyboard controls exist; health semantics and motion settings are missing. |
| Performance | 2 | Bounded particles, but undisposed GPU resources and oversized eagerly decoded images. |
| Responsive behavior | 1 | Desktop-focused; narrow weapon view crops heavily and touch play is unsupported. |
| Visual configuration | 1 | Palette and effect/motion settings are scattered through code/CSS. A separate dark theme is not a requirement for this game. |
| Implementation integrity | 2 | Coherent slice, but no frame playback plus verified pathing/state/height defects. |
| **Total** | **8 / 20** | Major implementation and content work remains. Scores are scoped review judgments, not a WCAG certification. |

There are **14 findings below: 0 P0, 5 P1, 9 P2**. F05 is a verified implementation gap against the requested next milestone, not a regression in a feature that the slice claimed to have.

## Verified findings and concrete fixes

### F01 — P1: runners can get stuck behind crates

**Location:** `game/src/enemy.ts:94–121`.

**Evidence:** deterministic update test with runner at `(-6,0,1)` and player at `(-6,0,7)`, on opposite sides of the crate at `(-6,4)`. After 20 simulated seconds the runner remained about **5.26 units** away and dealt no damage. Three other basic detour scenarios did reach attack range. This is a specific path failure, not a claim that all pursuit is broken.

**Cause:** selecting only the nearest corner of the first blocking crate can repeatedly select a corner that does not lead around the obstacle. Waypoint validity is not tracked as an actual route.

**Fix:** build a small walkability grid or visibility graph from crate footprints expanded by enemy radius. Calculate a reachable route, advance through waypoints and replan when the target moves materially or progress stalls. Do not run a full path search for every enemy on every render frame. Add neighbor separation so multiple runners do not collapse onto the same position.

**Accept:** the reproduced route reaches attack range; all five crate placements can be navigated from both sides; enemies neither clip through crates nor permanently oscillate at corners.

### F02 — P1: vertical gameplay is disconnected from collisions and melee

**Location:** `game/src/main.ts:133–135,432–446`; `game/src/enemy.ts:84–86,131–135`; `game/src/arena.ts:79–97`.

**Evidence:** a controlled attack with camera height `10`, horizontal distance `1`, and the normal ground-level player position still dealt **12 damage**. The real game tracks jump height separately in `playerY` while passing ground-level `playerPos` to enemy combat. A direct collision check also pushed position `(3,10,1)` to `(4.15,10,1)` even though it is well above the crate.

**Impact:** jumping does not correctly change melee reach, and crates behave as vertically infinite movement obstacles. There is no landing on crate tops.

**Fix:** maintain one authoritative player body/feet position including height, with a capsule or explicit vertical interval. Test melee against the actual player body and reach, plus obstruction. Resolve horizontal crate collision only when the player's vertical interval overlaps the crate; implement top-surface grounding, step/landing rules and ceiling checks. Keep camera eye offset separate from body position.

**Accept:** a player above melee reach takes no ground-melee damage; descending onto a low crate grounds on its top; jump/dash cannot pass through a colliding wall; camera, hitbox and shadow agree on player height.

### F03 — P1: restart and focus loss leave stale input and action state

**Location:** `game/src/main.ts:206–218,249–286`.

**Evidence:** invoking the actual reset during a dash retained `KeyW`, approximately **147 ms** of dash, **1,167 ms** dash cooldown and **717 ms** fire cooldown. A window blur left a held `KeyW` in the key set.

**Impact:** a restart can immediately move/dash without a fresh input, refuse an initial shot or inherit old visual state. Lost key-up events can cause unwanted movement after returning to the tab.

**Fix:** centralize input/action cleanup. Clear held keys, pending mouse deltas, buffered jump, coyote timer, dash time/direction/cooldown, fire cooldown, feedback timers, particles and tracers on new-run reset. Give WeaponView a reset method for ammo, reload, recoil spring, flash, sway, pose and bob. Clear transient input on blur, hidden document and pointer-lock loss. Resume should preserve world progress while requiring fresh input.

**Accept:** fresh runs begin stationary with no active dash/reload/flash and a ready shotgun; tab switching does not retain movement; pause/resume never fires a buffered accidental action.

### F04 — P1: failed asset loading leaves a dead Start screen

**Location:** `game/src/main.ts:75,101–107,242–245`; `game/src/assets.ts:96–105`.

**Evidence:** deliberately aborting the crate texture request produced an unhandled page rejection reported as `Event`. The menu continued to say “Vertical slice…” with an apparently active Start button; clicking it did not acquire pointer lock. Ordinary loading had no failure in this audit.

**Cause:** the initialization promise is discarded without a catch, and input listeners are installed only after loading finishes. Pointer-lock acquisition also has no rejection/error UI.

**Fix:** explicit `loading → ready → playing/error` startup states, visible loading progress, disabled Start until ready, useful failed-asset names, Retry, and a caught initialization promise. Handle pointer-lock errors/rejections and unsupported browsers. Preserve the menu until lock is actually acquired. Avoid duplicate listeners/resources on retry.

**Accept:** a deliberately missing asset shows a readable error and retry path; clicking Start during loading cannot silently do nothing; denying pointer lock leaves a recoverable explanation.

### F05 — P1: there is no frame-animation runtime

**Location:** `game/assets.json:1`; `game/src/assets.ts:15–20`; `game/src/enemy.ts:19–32,122–150`; `game/src/weapon.ts:80–123`.

**Evidence:** all three clips contain one asset ID. Runtime code does not evaluate clip frames, frame durations, loop settings or events. Monsters use tints/scales for attacks/hits and opacity for death; the gun uses one sprite plus a recoil spring and reload dip. Sprint state is not passed into WeaponView.

**Fix:** implement a reusable per-instance animation player, then add the real image sequences specified below. It needs variable frame durations, current time/frame, loop/non-loop behavior, state interruption, one-shot event crossing, pause/resume and completion callbacks. Advance object movement at render/simulation rate and image poses at art rate. Do not synchronize all monsters by mutating one shared texture's UV offset.

**Accept:** a stationary observer sees actual alternating running legs and arms; firing and reloading show distinct hand/weapon poses; two enemies can play different phases; events do not repeat per render frame or get lost when a frame boundary is skipped.

### F06 — P2: removing visuals does not release their GPU resources

**Location:** `game/src/enemy.ts:163–165`; `game/src/main.ts:185–194,481–488`.

**Evidence:** creating, rendering and disposing ten Runner instances through the real class increased renderer-tracked geometries from **22 to 42**. `Runner.dispose()` only removes its group. Tracers also create a geometry/material per pellet and remove them without disposal.

**Fix:** dispose owned enemy geometries/materials and tracer geometries/materials when retiring them, or reuse pooled shared geometry and appropriately managed materials. Do not dispose shared textures when removing one enemy. Track ownership explicitly.

**Accept:** repeated kills/restarts and firing settle at a stable resource count rather than increasing indefinitely.

### F07 — P2: muzzle flash ignores the weapon's rotation/scale

**Location:** `game/src/weapon.ts:67–71,119–123`.

**Evidence:** a controlled recoil update showed approximately **0.0068 overlay-world units** of discrepancy between the reported muzzle and the correctly transformed attachment. The current calculation only adds translation. The bug will become more obvious when adding sprint scale and reload rotation.

**Fix:** put the flash under a muzzle attachment node in the weapon hierarchy, or transform the frame's local muzzle point through the weapon matrix. Account for the frame's original canvas, trim offset and pivot. Use the same hierarchy for flash, smoke and ejection sockets.

**Accept:** an attachment debug marker stays on the barrel tip through idle, recoil, sprint, draw and reload; it remains correct after resize.

### F08 — P2: tracers and shot origins are disconnected from the visible muzzle

**Location:** `game/src/main.ts:186–187,299–344`.

**Evidence:** both tracer origin and hit ray start at `camera.position`; no gameplay muzzle-origin obstruction check exists. This is a code-confirmed limitation, not a reproduced claim that the current camera can shoot through every crate.

**Fix:** acquire the aim point with a camera ray, then validate the shot from a consistent world-space gameplay muzzle toward that point. Use an actual capsule/ray shape for hit tests. Render cosmetic tracers from the visible muzzle toward the resolved world hit; do not originate a visible line at the eye. Keep overlay placement separate from authoritative collision.

**Accept:** firing next to a wall hits the wall when the weapon origin is obstructed; a tracer visibly connects firing to impact without covering the reticle with an eye-origin streak.

### F09 — P2: spawning enemies consume pellets and trigger hit feedback without taking damage

**Location:** `game/src/main.ts:318–348`; `game/src/enemy.ts:58–60`.

**Evidence:** `takeDamage(12)` on a spawning runner leaves health at **36**. Shot selection excludes death but includes spawn, and displays hit feedback without knowing whether damage was applied.

**Fix:** choose a documented spawn policy. Either make a fully visible runner hittable, or exclude invulnerable spawning enemies from damage selection and clearly communicate their state. Have `takeDamage` return a damage result used to decide hitmarker, impact and score. Do not report a damaging hit that did nothing.

**Accept:** spawn-state shots produce consistent damage/feedback and do not unexpectedly shield other enemies.

### F10 — P2: visual states are not fully restored when interrupted

**Location:** `game/src/enemy.ts:53–55,122–150`; `game/src/main.ts:393–398,471–495`.

**Evidence:** telegraph changes scale/color, but `setState()` only resets time. A hit/death interrupt can inherit old telegraph scale or tint. Separately, particles/tracers update outside the playing guard while hit/damage timers stop inside it, producing inconsistent pause behavior.

**Fix:** give states explicit enter/exit visual rules and let clips own pose changes. Reset temporary tint/scale on transition. Choose one pause policy for world-space effects and feedback timers; freeze/resume them together or explicitly clear transient feedback on pause. Gate damage callbacks once the player is dead.

**Accept:** attacking then taking damage returns to the right neutral pose; pause/resume does not preserve a frozen damage flash while other effects finish.

### F11 — P2: repeated/paused keyboard input can queue unintended jumps

**Location:** `game/src/main.ts:269–286,432–438`.

**Evidence:** a synthetic repeating Space keydown set `jumpBufferMs` from `0` to **120**. Space is accepted regardless of game phase, and repeat is not filtered.

**Fix:** allow jump-buffer writes only during play and on an intentional new press, using `event.repeat` or input edge tracking. Call `preventDefault` for game-bound keys only while the canvas is active. Clear buffered actions on phase changes. Decide explicitly whether hold-to-bunnyhop is a feature; do not let OS repeat timing decide it.

**Accept:** holding Space does not produce undocumented automatic jumps, and pressing it in a menu cannot trigger a jump after Start/Resume.

### F12 — P2: the asset-review weapon row overflows its viewport

**Location:** `game/index.html:25–27`; `game/src/main.ts:40–43`.

**Evidence:** at 1280 px the shotgun row measured **1240 px available / 1317 px content**. Each weapon cell expanded to **482 px**, overlapping its grid track. The review is an inner scroll region (1784 px content), so an ordinary full-page screenshot only captured its first viewport.

**Fix:** use `minmax(0,1fr)` columns, `min-width:0`, and an image wrapper whose actual aspect ratio determines its height. Put markers on that wrapper, not on a letterboxed outer container. Collapse review columns at smaller widths. Add frame playback and frame-step controls when implementing F05.

**Accept:** every asset is fully reviewable on light/dark/checker backgrounds without overlap, and pivot/muzzle markers align with the visible artwork.

### F13 — P2: narrow-view play and motion/accessibility controls need explicit support boundaries

**Location:** `game/index.html:12–22,42–48`; `game/src/weapon.ts:24,74–77,114–117`.

**Evidence:** at 390×844 the weapon is heavily cropped; there are no touch movement/aim controls. HUD positions are fixed and health is represented only by a visual fill. There are no motion/flash settings. Desktop pointer-lock play is the existing target, so missing touch controls should not be advertised as an accidental runtime failure.

**Fix:** make overlay size/position responsive to viewport aspect, with a safe reticle/health/ammo region. Expose health through a labeled progressbar plus readable value; use announcements sparingly for important phase changes. Keep visible keyboard focus. Add settings for shake, flash strength, sensitivity, volume and reduced motion. If touch play is deferred, show a clear desktop-keyboard/mouse requirement instead of an unusable Start flow.

**Accept:** 1280×720 and 1920×1080 remain clear, narrow-screen menus remain usable, and the product states which devices it supports. Motion settings preserve gameplay feedback without requiring shake or bright flashes.

### F14 — P2: asset loading and scale will become costly when frames are added

**Location:** `game/src/assets.ts:64–105`; `game/package.json`; `game/src/main.ts:491–493`.

**Evidence:** four runtime PNGs total **9.91 MiB downloaded**. Their current dimensions imply about **51.56 MiB** for RGBA8 GPU storage with complete mipmaps, before other resources; this is a planning estimate, not measured compressed-driver memory. Loading is serial and every image is scanned pixel-by-pixel for diagnostics at startup. HUD strings are assigned every frame. The build emits the separate 545.99 kB JS chunk warning.

**Fix:** keep high-resolution source art but export measured runtime sizes, especially for the brief flash. Pack approved frames into bounded atlases with gutters/edge extrusion. Load only the starting weapon/enemy/arena first; load later content in batches. Move alpha diagnostics behind a review/dev flag. Update unchanged HUD text only on state changes. Profile before splitting the engine bundle; do not merely hide the warning. Choose budgets from measured device results.

**Accept:** report startup bytes/time, resident texture estimate, draw calls and measured frame time for a named browser/device/resolution. Adding a run cycle must not multiply startup into dozens of full-resolution standalone downloads.

## Required image and animation work

Use [IMAGE_PROMPTS.md](docs/IMAGE_PROMPTS.md) for prompt templates. This table specifies what the current game must actually generate, review, export and connect. More detail must come from clear forms/materials and coherent shading, not just denser hatching.

| Asset group | Produce next | How it is used |
| --- | --- | --- |
| Runner | 8 front-run poses, 6 attack poses, 3 hit poses, 8 defeat poses; then the remaining 7 run directions | Animated foot-anchored world quad; gait tied to speed, state clips tied to AI. |
| Shotgun | Approved idle master, 6 firing/recovery poses, 12 reload poses, 4 sprint-raise/settle poses | Transparent first-person overlay; all frames share grip pivot and design. |
| Firing effects | 6 flash phases plus 2 alternate shapes, 8 smoke phases, 6 contact-spark phases, separate ejected-shell sprite | Layered effects placed at muzzle/ejection/impact attachments with independent lifetimes. |
| Environment | Sky panorama, transparent far skyline, transparent mid-distance ruins, seamless floor, seamless wall, 3 crate material variants | Separate world surfaces/cards; solid close cover remains depth-writing and collidable. |
| Ambient detail | Separate paper scraps, dust mote, ground-contact shadow, impact decals | Bounded particles and floor-facing decals, not animated scenery screenshots. |

The initial front monster batch is **25 poses**, not a claim of eight-direction coverage. Eight directions × eight run poses becomes **64 run frames**. Add directional attack/hit/defeat and elevated views in later reviewed batches. A monster must not rotate to show its face from every gameplay heading.

### Art requirements

- Preserve one approved shotgun design; the old turnaround's conflicting barrel arrangement must not leak into frame sequences. The current runtime weapon is the immediate reference to review, not an automatic mandate to replace it with a different weapon.
- Ivory paper forms, charcoal outlines, subtle hatching, violet shadow, turquoise accent, gold action highlights. Separate silhouettes clearly from the floor.
- Weapons, monsters and FX need **real RGBA transparency**. Background/environment textures may be opaque. Do not erase ivory parts of the object during background removal.
- Existing `scripts/make_alpha.py` falls back to removing every bright low-saturation region when SciPy is unavailable (`:34–35`), which can remove ivory object surfaces. Require a reliable mask/segmentation path, make the fallback explicit, and verify thin features and glow edges on light/dark backgrounds. This is a conditional pipeline risk, not proof that every current cutout is broken.
- Same frame canvas, root/grip registration, proportions, markings, camera and lighting. Transparent padding must accommodate pose extremes. No duplicated fingers, changing barrel counts or shifting torso sizes.
- Generate small coherent groups, review in motion and correct bad poses before packing. AI prompts cannot guarantee a production-ready animation by themselves.
- Muzzle flashes, dust and contact shadows remain separate from weapons/monsters. Never bake a rectangular arena background into a moving enemy.
- Scenery must match the gameplay's reachable space. Sky and distant ruins stay beyond reach; floor/near-wall textures go on simple matching surfaces. Do not add collision to flat painted clouds or permit players to circle a single-view distant card at close range.

### Frame playback and event contract

Add a tested animation player module (for example `game/src/animation.ts`). Extend the real manifest with per-frame durations and per-frame attachments. Its existing clip/event metadata is currently unused; wire it up rather than adding a second unrelated registry.

Proposed initial timings are art/tuning targets, not observed current behavior:

| Sequence | Initial timing | Required event |
| --- | --- | --- |
| Runner run | 8 poses at 12–16 art fps, loop | Footstep events at actual planted-foot phases. |
| Runner attack | 6 poses over roughly 650–800 ms | Damage once at strike, after a readable windup and only if reach/height/LOS still pass. |
| Runner defeat | 8 poses over roughly 600–800 ms | Become non-hittable once; remove/pool after the terminal pose. |
| Shotgun fire | 6 poses over roughly 240–300 ms | One shot/damage event, one flash and ejection event; keep fire cooldown independently configurable. |
| Reload | 12 poses over the initial 1400 ms | Ammo transfer exactly once near the completed reload gesture; never on each repeated frame. |
| Flash | 6 poses over roughly 80–120 ms | End with fade/removal; do not hold the peak image for the entire effect. |

Rendering and world movement remain continuous at the game loop rate. Animation art may advance more slowly. Preserve run phase when choosing a new direction, and vary starting phases between enemies. Do not dissolve every adjacent running pose: double limbs make it worse.

The player's damage and ammo should use the same authoritative action/event timeline as visual feedback, with deduplication across low-frame-rate time steps, state changes and interrupted clips. Define reload cancellation before implementing it.

## Sprint: make the gun come closer when the player actually runs

**Current:** `main.ts:417` knows whether Shift is held, but `weaponView.update()` receives only a generic `moving` boolean. The overlay camera is orthographic. Changing weapon Z alone will **not** make the image look closer.

**Implement:**

1. Pass actual horizontal speed, accepted sprint state, grounded/airborne state and current action into WeaponView. Holding Shift while standing still is not a running animation; neither is pushing into a solid wall without travel.
2. Keep the grip anchor fixed and smoothly enlarge the overlay toward approximately **1.08–1.12×** during accepted sprint to imply bringing it closer. Add a small inward turn and separate arm/sprint pose when those frames are approved. Tune against the reticle and lower HUD, not an arbitrary zoom number.
3. Blend in/out over roughly **120–180 ms**, use distance-driven bob with restrained vertical amplitude, and use the sprint pose's registered muzzle point. Aim/reload/fire poses take explicit priority rather than overwriting one another.
4. Keep camera FOV and overlay movement separate. A tiny optional FOV increase can communicate speed, but it does not replace the requested closer-gun pose. Respect reduced-motion settings.
5. Add sprint-to-fire recovery, dry-fire behavior, reload interruption rules and a clear sprint cooldown/stamina policy if stamina is introduced. Do not add stamina UI before there is actual stamina gameplay.

**Accept:** walk, run, stop, jump and turn transitions look continuous; gun increases in apparent size only during actual running; no flash drift, hand clipping or reticle obstruction; returning to idle never snaps or leaves permanent scale.

## Basic game features still to build

These are planned additions, not unexpected errors in the one-wave slice:

1. Reload/action animation state machine, empty-magazine feedback, clear ammo state and optional explicitly designed reserve-ammo behavior.
2. Monster animation and navigation fixes; enemy separation; spawn cues; readable attack telegraph and hit feedback.
3. More than one wave, scoring/combo, wave-complete transition and consistent restart. Show actual rules in the HUD; do not add decorative counters disconnected from gameplay.
4. Shot/reload/impact/footstep/monster/jump/land audio after a user gesture, with volume controls and valid asset provenance.
5. Health and/or ammo pickups only with working interaction and effects. Basic settings, help and a recoverable loading/error state.
6. Landing effects, real low-platform grounding and dash collision verification.
7. Then superjump/double jump, grapple swing, melee, additional weapons and monster types from GAME_BUILD_PROMPT.md. The current code has normal jump and dash; it does not already have these powers.

## Implementation order and acceptance

### Pass 1 — correctness before expanding the art library

- [ ] Fix F01–F04: navigation, height-aware body/combat, reset/input, startup error recovery.
- [ ] Fix muzzle transform, spawn-hit feedback, state interruption and resource cleanup.
- [ ] Add meaningful regressions for the reproduced coordinates/actions, not tests that only restate constants.
- [ ] Verify two valid shots, reload, a kill, death/restart, crate-blocked shots and one full wave clear through the browser.

### Pass 2 — real image-frame animation

- [ ] Add animation player, frame events, registration and review playback.
- [ ] Produce and approve the front runner cycle plus shotgun firing/reload/sprint sequences.
- [ ] Bind feet, hands, flashes, smoke and sounds to the right phase/attachment.
- [ ] Implement the closer-gun sprint behavior above.
- [ ] Show actual animation playback at normal and slowed speed; screenshots alone do not prove timing quality.

### Pass 3 — complete the world and basic loop

- [ ] Generate sky/skyline/floor/wall/box variants and integrate them as separate spatial layers.
- [ ] Add directional runner views, coherent shadows, spawn/impact/defeat effects and audio.
- [ ] Add waves, score and the selected pickups/settings.
- [ ] Resolve review layout, narrow-viewport behavior and runtime asset budgets.

### Pass 4 — powers and final verification

- [ ] Add superjump/grapple/melee and the remaining weapons after the core is stable.
- [ ] Verify height/collision and elevated monster views during aerial movement.
- [ ] Test desktop play at 1280×720 and 1920×1080, plus a clear narrow-device support state.
- [ ] Report actual frame times/memory on named hardware; recheck for leaks over repeated waves/restarts.
- [ ] Run the production build and audit again, then a final visual polish pass.

## Audit-tool interpretation

The Impeccable detector reported two warnings in `game/index.html`: flat text hierarchy (`:13`) and colored glow (`:20`). Neither is a gameplay blocker. The glow is an intentional damage indicator, so retain meaningful damage feedback while making intensity adjustable. Small HUD type steps are not the primary animation/readability problem. These warnings are not counted as separate confirmed defects.

Useful skill passes for implementation are `$impeccable harden` for recoverable states/input, `$impeccable animate` for transitions and state feedback, `$impeccable optimize` for asset/resource handling, `$impeccable adapt` for layout/support boundaries, followed by `$impeccable audit` and finally `$impeccable polish`.

Positive foundations to preserve: pinned Three.js/types pair, strict TypeScript build, explicit enemy/game phases, manifest-driven asset paths, separate first-person render layer, real depth-writing crate meshes, bounded particle storage, review/view routes, and honest placeholder documentation.
