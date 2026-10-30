# Paper: master game-building prompt

Historical foundation prompt. The repository now has a playable implementation. For work after the 31 October audit, start with [PUNCHY_INK_GAME_PROMPT.md](PUNCHY_INK_GAME_PROMPT.md), [PUNCHY_INK_ASSET_PROMPTS.md](PUNCHY_INK_ASSET_PROMPTS.md) and the current root fix.md. Preserve the existing working systems rather than restarting from this original build brief.

---

You are an experienced browser-game developer and technical artist. Build **Paper**, a fast first-person 2.5D arena shooter using image-based art, responsive movement and real spatial gameplay.

The goal is a playable, cohesive game that feels like moving through a hand-drawn comic world. Use generated transparent sprites, frame animations, textured planes, layered scenery and simple collision proxies. Avoid the asset cost of modeled and rigged characters, modeled weapons and detailed 3D environments.

Work in this repository. Inspect the existing files and instructions before implementing. Prefer TypeScript, Vite and Three.js for a new implementation; respect an existing suitable stack if one exists. Check the installed engine version before using its APIs. Do not build the game as a sequence of full-screen illustrations or a video player.

## References and visual identity

- gun.mp4 is the motion and arena-combat reference.
- output/gameplay/01-shotgun-pistols.png is the primary color and ink-style reference.
- output/gameplay/02-automatic-blaster.png and 03-throwables-knives.png establish the remaining weapon effects.
- Existing boards are composition references; they contain UI, backgrounds and effects and cannot be used directly as transparent gameplay sprites.
- output/shotgun/shotgun-turnaround.png is an interpreted variant with inconsistent barrel layout in the top view. Do not use it to define a production sprite's geometry. First approve one canonical weapon image and keep every frame consistent with that image.

Use warm ivory paper, bold charcoal contours, restrained crosshatching, turquoise distance, violet shadow and golden-yellow firing accents. Red marks are stylized ink hits. Keep monsters graphic and readable, with no anatomical gore. Concentrate saturation around action and landmarks; preserve visual rest around the aim point.

## Spatial architecture: cheap art, genuine movement

Use a perspective camera and continuous world coordinates. Render at the display refresh rate while sprite artwork advances at its own animation rate. Movement must remain smooth even when an animation contains only a few frames.

Use only minimal geometric support: a floor, low-cost ramps/platforms, simple walls, cubes for solid crates and invisible capsules/boxes for collision. Surface imagery supplies their appearance. These can be constructed in code; no detailed modeling workflow is required. Do not replace the floor with a tilted screenshot: translation, landing, perspective and projectile depth need a consistent world.

Render enemies as upright textured quads. Rotate them around the vertical axis toward the viewer; keep their feet grounded. Use camera-facing sprites for sparks and smoke, not automatically for every world surface. Decorative distant structures may be flat cards. Walkable walls and nearby solid cover need matching collision and depth-writing proxy surfaces. Players must not walk behind a wall image and discover that it is an empty sheet.

Distant scenery uses separate sky, far skyline, mid-distance silhouette and near-prop layers. Position layers in world space so camera translation creates natural relative motion. Do not bake nearby enemies or interactive objects into these background images. Limit the arena footprint and sight lines so the player cannot reach or circle flat distant scenery.

## Make the images feel alive

Implement all of the following:

1. Perspective scaling and real depth occlusion. An enemy behind a crate must disappear behind it. Walls must stop both movement and shots.
2. Continuous positions and velocities independent of artwork frames. Update transforms every render frame; do not advance motion by jumping one sprite-width per frame.
3. Foot-anchored enemy sprites with stable scale, explicit pivots and distance-based animation speed. Running in place must not look like sliding across the floor.
4. Small separate ground-contact shadows that react to height. Airborne entities cast a shadow on the ground beneath them, not on their sprite plane.
5. Directional enemy frames selected from the enemy's facing relative to the viewer. The enemy's gameplay facing remains independent of the billboard's rotation.
6. Stable directional selection with hysteresis; preserve gait phase when changing direction. Do not restart the run loop whenever a direction boundary is crossed.
7. Camera-driven weapon sway, a little distance-driven bob, spring-based recoil and smooth recovery. Do not regenerate these movements as dozens of images.
8. Layered effects: muzzle flash, a few particles, impact sprite, short light/tint response and sound. Each layer has its own lifetime. A frozen explosion image is not a firing animation.
9. Several small effect variants and independently phased enemy animations to prevent synchronized repetition.
10. Collision-driven dust, impact placement and landing feedback. Bind effects to events and world positions; do not scatter decoration randomly over the screen.

Do not routinely dissolve between running frames: it makes double limbs. Prefer clear frame changes with smooth spatial motion. Use blended transitions only where tested and visually suitable. Dense effects must not obscure aim, enemy intent or the next landing position.

## Movement and powers

Desktop first. Use pointer lock after an explicit start action and show a pause overlay on Escape or focus loss. Stop simulation input while menus are active.

Controls: WASD move; mouse aim; left click fire; R reload; 1–6 weapon selection; Shift sprint; Space jump/double jump; Q dash; E hold grapple, release to detach; F melee swing; G throw grenade. Make bindings visible in the pause menu and avoid browser shortcuts while playing.

Implement acceleration, responsive deceleration, air steering, gravity, reliable floor/wall collision and a short jump-input buffer/coyote window. Start with configurable tuning rather than hardcoded animation timing.

- **Superjump:** a strong first jump and one controlled midair jump. Use a short foot-level launch ring, air streaks and a landing burst. Height and air control come from physics, not a full-screen image. Reset the second jump only on valid grounding.
- **Dash:** an impulse with a cooldown and a short afterimage/streak treatment. Sweep collision through the dash; do not teleport through walls.
- **Grapple swing:** acquire only visible valid anchor points within range. Show a small anchor cue. Simulate rope-length constraint and momentum with world-space endpoints; allow pumping and release into a jump. Render the rope as a cheap line/ribbon with a small texture. Camera-side art alone cannot create a believable swing. Disable grappling through solid cover and handle rope obstruction consistently.
- **Melee swing:** one short arm/knife animation plus a separate curved slash sprite. Apply damage at an explicit animation event and check range/obstruction. Do not damage the same enemy every render frame.

Make FOV changes, camera roll, shake and flash strength restrained and adjustable. Include a reduced-motion setting and separate audio volume controls. Do not require camera shake to understand an attack.

## First-person weapons

Render transparent hand-and-weapon artwork in a separate view layer with stable aspect ratio and a common bottom pivot. Keep it clear of the reticle. Store muzzle and hand attachment positions per animation frame so flashes and projectiles do not drift during recoil.

Resolve aim using a ray from the camera. Then validate the projectile path from its gameplay origin toward that aim point so nearby walls can block it. A first-person overlay must not allow bullets to pass through cover. Render a cosmetic tracer from the visible muzzle toward the resolved hit when useful; authoritative hit detection uses the world, not opaque sprite rectangles.

Weapons:

| Weapon | Behavior | Visible identity |
| --- | --- | --- |
| Shotgun | Close-range spread, strong pushback, deliberate recovery | Wide golden flash, distinct pellet impacts, shell ejection |
| Pistol | Precise single shot and quick recovery | Compact flash, one clean impact |
| Automatic | Sustained fire with controlled spread | Short flash variants, occasional tracers, short-lived cases |
| Blaster | Traveling energy projectile | Cyan bolt, short trail and cyan/violet impact pulse |
| Throwing knife | Flying projectile with limited inventory | Rotating blade sprite, glint and compact contact mark |
| Grenade | Arcing projectile, timed or contact-triggered explosion as configured | Visible arc in motion, radial blast, dust and paper fragments |

Use data-driven damage, fire interval, spread, range, ammo and effect references. Keep projectile collision independent of the sprite's changing visual bounds. Use continuous collision for fast projectiles. Fire rate and recoil recovery use elapsed time, not browser frame count.

“Gun shatter” has two art entries: a firing burst and a cosmetic weapon-break/paper-fragment effect. Do not destroy the player's weapon during normal firing. A break effect is optional, used only for a deliberate pickup/destruction event.

Audio should synchronize with shot, impact, reload, jump and attack events. Use legitimate local assets or synthesized placeholders clearly marked during development. Browsers start audio only after user interaction. Do not ship broken remote sound links.

## Monsters

Start with one readable ink monster: a fast runner with an ivory face, charcoal torso and turquoise accent. Add a heavy brute and a leaping creature after the first loop works.

Each enemy uses a world-space collider and a visual sprite linked to it. Implement spawning, pursuit, obstacle avoidance or a small walkability grid, attack telegraph, attack, hit reaction and death. No direct pursuit through solid crates. Stagger spawn timing and cap active enemies.

Use eight horizontal view directions for normal ground combat. For large height differences, eight azimuth views alone are insufficient: add elevated-view sprites for close airborne encounters, or keep grounded enemies at a camera distance where the limitation is subtle. Do not tilt every monster into a floor-facing card during superjumps. Suppress unreachable ground melee attacks while the player is airborne.

Synchronize footsteps with gait and speed; interrupt animation only when the state changes. Trigger enemy damage once at the attack event. Death replaces the collider, plays a brief ink/paper dissolve and then removes or pools the visual. Avoid lingering piles of opaque rectangular cards.

## Animation and asset pipeline

Use IMAGE_PROMPTS.md. Make a canonical image for each weapon/monster first. Generate small coherent motion sequences from that same reference; do not independently invent the design in every frame. AI-generated frames are candidate art, not guaranteed production-ready animation. Review and register pivots, repair inconsistent silhouettes, and reject impossible frame changes before packing.

Store transparent individual PNG masters. Build runtime atlases plus JSON metadata; optional WebP exports must preserve alpha. Never deliver a baked checkerboard as “transparency.” Background paintings are the exception and may be opaque.

Start with a small working vertical slice. Generate only the art needed for it before expanding to every angle and weapon. Use a debug-only placeholder switch while coding; identify missing final assets explicitly. Do not claim a final sprite library exists because a mood board was generated.

The asset manifest must include atlas dimensions; pixel frame rectangles with a declared top-left origin; untrimmed source size; trim offsets; normalized pivots in untrimmed coordinates; durations; loop behavior; events; direction; and attachment points. Keep body and muzzle pivots independent. See ASSET_MANIFEST_EXAMPLE.json for a proposed format, not engine-native JSON.

Use per-entity frame selection. Do not mutate one globally shared texture offset to animate every monster: that synchronizes unrelated animations. Use independent UV rectangles through suitable per-object materials or a batched shader. Keep image/texture storage shared where possible.

Edge-extrude atlas sprites and leave sufficient gutters for the selected filtering/mip levels. Test for colored fringes against both light and dark backgrounds. Handle alpha premultiplication consistently. Use depth-writing cutouts for solid silhouettes where appropriate; blended smoke/light effects usually depth-test without writing depth. Transparent sorting is not solved simply by making every material transparent.

## Performance targets and validation

Target smooth 60 fps on a named, measured desktop baseline, with an adjustable lower-quality mode. Report the actual browser, hardware, resolution, enemy count, frame time and draw calls tested; do not promise universal 60 fps.

Start the vertical slice with roughly 12–20 active enemies and a bounded particle pool. Pool projectiles, effects and damage labels. Cull distant visuals, cap pixel ratio on dense screens, and avoid allocating new objects every frame. Load the initial arena's assets first, then later weapons/directions in the background. Respect device texture-size limits and split atlases when necessary.

A PNG's download size is not its GPU memory use. For planning, a 2048² RGBA8 texture is about 16 MiB before mipmaps, roughly 21.3 MiB with a full mip chain. Twelve uncompressed such atlases already approach 256 MiB. Track resident textures and choose smaller atlases/frames for low-detail assets; do not load every monster sequence at maximum resolution at startup.

Create an asset-review screen outside gameplay: alpha preview on light/dark/checker backgrounds, frame stepping, animation playback, pivot/muzzle overlays and directional preview. It must expose rather than conceal asset defects.

Test the meaningful risks: movement at different frame rates; wall collision during dash; landing and jump reset; grapple attach/detach and occlusion; shots against cover; independent enemy animations; damage events occurring once; and pause/resume without a huge time-step jump. Visually check sprite registration, atlas edges, grounded feet, direction switching, superjump views and near-wall weapon shots in the browser.

## Build order and completion

1. **Movement proof:** one small floor-and-cover arena, first-person camera, collision, sprint/jump/dash, one foreground weapon and one moving transparent enemy. Verify depth and contact shadows.
2. **Playable vertical slice:** working shotgun, runner, enemy attack/death, effects, health, combo, one wave, restart and pause. Show this loop before expanding art volume.
3. **Powers:** superjump, grapple swing and melee, with world-space physics and readable effects.
4. **Content expansion:** remaining weapons, monsters, directional/elevated sprites, scenery layers and multiple waves. Add weapon switching/reload/throw animations as assets are approved.
5. **Polish:** audio, optimization, accessibility controls, asset review and a concise playable build README.

The completed game must let the player move freely, turn around, shoot, evade monsters, jump onto a low platform, swing from an anchor, complete a wave and restart after dying. At no point should an animation be a full-screen background swap. The image art supplies appearance; simulation supplies position, timing, collisions and consequences.

Deliver the playable source, reproducible run/build commands, asset manifest, asset provenance/prompt records and a clear list of any missing or placeholder content. Do not deploy or publish as part of this prompt unless the user asks.

---

## Technical references

These support the underlying engine capabilities; gameplay architecture and tuning above are project design recommendations.

- [Three.js Sprite](https://threejs.org/docs/pages/Sprite.html): camera-facing planes, pivot control and the need for separate sprite shadows.
- [Three.js Texture](https://threejs.org/docs/pages/Texture.html): UV transforms, shared image sources, filtering and alpha settings.
