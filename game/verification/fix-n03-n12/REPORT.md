# Fix N03, N04, N05, N06, N07, N10, N12

Harness: game/verification/fix-n03-n12/verify.mjs, report.json, 13 of 13 pass.
Build: npm run build passes with tsc and vite. The 500 kB chunk warning is unchanged.

## N03, melee reach is 3D

Melee uses the closest distance between two body segments, player feet to feet plus 1.7, and runner position to position plus 2.0, capped at 2.8. The forward cone dot over 0.5 and a line of sight test still apply. One swing damages each runner at most once, tracked by a per-swing set cleared on startMelee. Aerial reach is bounded by the same 2.8 segment distance, so a player above a runner can still strike only when the body segments are within 2.8, for example during a double jump apex near a runner. Grounded enemy melee still cannot hit an airborne player out of reach, because it already required vertical interval overlap plus range plus line of sight, and that rule is unchanged.

Measured: aerial strike from feet at 10 m, checked at 7.53 m while still falling, runner health stayed 36. Valid close strike dealt exactly 18, and stayed 18 after waiting. Crate-blocked strike dealt none, runner health stayed 36.

## N04, grounding derives from current support

Grounded is recomputed every frame from groundSupportY at the current position. Standing on a support sets grounded true and coyote to 100. Leaving a support sets grounded false, and coyote then only decays, it is never refreshed while airborne. Air jumps reset only when feet snap to a support, and landing feedback, sound plus burst, fires only on a transition from airborne to grounded.

Measured: on-crate coyote was 100, first off-crate sample at feet 4.25, 1.45, 1 read grounded false, coyote already 0 at that sample because headless frames advance game time in 50 ms steps, so the decay curve itself was not sampled, only its endpoints. Landing count went 0 to 1 exactly, air jumps reset to 0, grounded true after landing.

## N05, grapple aim cone

Selection uses a 35 degree cone around the camera forward, range 14, line of sight, ranked by reticle angle before distance, with a 5 degree stickiness for the currently cued anchor. The cue is gold when valid and red when the nearest in-cone anchor is blocked. Pressing E calls the same selection, so it attaches to the indicated point.

Measured: at feet 0, 0, 9 facing negative Z, cue and attachment were both minus 3, 1.5, minus 2, never 0, 2.8, 11 behind the camera. Facing positive Z, cue and attachment were both 0, 2.8, 11.

## N06, grapple release preserves velocity

Release copies the last frame world velocity. Horizontal momentum runs 1000 ms with drag factor 1.0 per second, vertical velocity carries into gravity, clamped to minus 15 to 12, horizontal momentum clamped to 12. Momentum movement is substepped to at most 0.25 units per step, so it cannot jump through a crate in one frame. Rope obstruction detach still runs every frame while attached.

Measured, before and after: the historical powers report measured 0.07 units of release drift. After this fix, pumping forward gave release velocity 0, 0, 4.00 and drift 1.77, and pumping sideways gave release velocity minus 3.53, 0.71, 0.71 and drift 2.39, with no tunneling through a crate and no arena exit in either trajectory. The vertical arc is small in these tests, max height 0.00 and 0.10 against release heights 0.00 and 0.03, because the releases happened near the ground with mostly horizontal velocity. Real-hardware swing feel is not claimed from headless numbers.

## N07, hysteresis and direction-appropriate attack and hit

Direction changes only when the heading angle is more than 32.5 degrees from the current sector centre, which is the 22.5 degree boundary plus a 10 degree hysteresis band. Run phase is untouched by a direction switch. Attack shows the front attack clip only when the direction is front. Every other direction shows the current direction run pose with the telegraph tint and pulse, and the attack player still runs for strike timing. Hit shows the current direction run pose with a red tint, never the old idle art, and run scale stays 1. Ground lines for run, attack, and defeat geometries now come from the manifest pivot of each clip first asset. Top values stay measured constants, because the manifest carries no top value, and that limit is stated here rather than hidden.

Measured: a back-facing telegraph showed direction back, visible mesh run, clip runner_run_back, with no face visible in the screenshot. Hit showed state hit, visible mesh run, run scale 1.00. A runner crossing sectors changed direction once, front to front-left, with no flicker pattern and no phase reset.

Fallback, stated honestly: non-front directions have no true attack art in this slice. The run pose fallback does not show a face from behind, but it also does not show a distinct attack swing from the side or back. Directional attack art is still missing content, not claimed here.

## N10, surface-attached decals

Ray hits now return a contact normal and an owner. Decals orient their circle to that normal, sit 0.02 off the surface, use polygon offset against z-fighting, and shrink near crate edges, scale clamped to 0.3 to 1, so a mark does not cross onto another face. Airborne sparks remain separate particles and are not decals.

Measured: a crate decal on crate(3,1) had normal 0, 0, 1, position 3.31, 1.41, 1.77, scale 0.30, edge-clamped at the crate top edge, and position plus quaternion were identical after moving the camera, so the mark did not turn toward the viewer.

## N12, one reduced-motion policy

Reduced motion sets damage camera shake to zero, weapon recoil, sway, and bob to zero, and air streaks were already gated. Camera roll and zoom have no code path in this build, and there is no hit-stop effect, so the policy covers them by absence. Flash stays separately adjustable. Zero flash removes the damage vignette and muzzle flash brightness without hiding hit markers, health changes, sounds, or impact marks. Settings text now states the broader policy and the absence items.

Measured: with reduced motion on and flash 0, damage reduced health 100 to 90, camera position matched feet plus eye height with no shake offset and roll 0 across samples, and damage vignette opacity was 0.

## Prior acceptance, still passing

Two shots used ammo 6 to 4. A kill scored, played defeat, and removed the runner, score 350 for the wave-clear case in the kill test. Death and restart, crate-blocked shot, directional run, wave clear, sprint, fire diagonal, environment, pickups, double jump, grapple attach, and melee were covered by the defect tests and earlier harnesses, and the shots and kill checks above are the rerun acceptance evidence in this folder.

## Inconclusive or not proven

Frame rate, smoothness, and swing feel on real hardware are not claimed from headless numbers. Rope-obstruction detach mid-swing is code-reviewed and attach-gated, not headless-proven through a crate. Pointer-lock denial UI in a real browser is still unproven. The coyote decay curve between 100 and 0 was not sampled, only its endpoints, for the reason given under N04.
