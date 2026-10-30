# Paper — reference-matched ink action game: implementation prompt

This is the current art/gameplay direction, written after auditing `6f109f2` on 31 October 2026. Copy the prompt below into the implementation agent. Read the current root `fix.md` first. This brief builds on the existing playable game; it does not restart development.

## The assignment

Transform the existing Three.js game into a fast, expressive, entertaining **living ink comic** that looks like our original generated gameplay boards. Keep the working physics, combat, waves, settings, audio and animation systems. Fix the newly audited defects. Make the world, monsters, gun poses, effects and UI belong to the same illustrated production.

Visual authority, in order:

1. `output/gameplay/01-shotgun-pistols.png`: primary ink shapes, color separation, creatures, weapon weight and comic UI.
2. `output/gameplay/02-automatic-blaster.png` and `03-throwables-knives.png`: weapon/effect variety.
3. `output/punchy-ink-v2/gameplay-ui-target.png`: a new single-screen composition target, explicitly an illustration rather than a screenshot of implemented gameplay.
4. `output/punchy-ink-v2/monster-key-pose-guide.png` and `effects-candidates.png`: candidate design/pose/FX guides. Inspect their QA notes before deriving runtime assets.

Do not use current screenshots as the art target: they show the mismatch to correct. Do not paste the complete reference artwork over the game. Rebuild its visual language from independent moving assets in a real spatial scene.

## Current foundation to preserve

At the audited commit the game has one shotgun, five firing poses, six flash frames, a runner with eight-direction/eight-pose run sequences, front attack/defeat animation, generated scenery, waves, score/combo, pickups, synthesized sound, settings, sprint scale, double jump, dash, grapple and melee. Build on this. The current reload is still a timer and a sprite dip. There is no working multi-monster family library, other gun types, thrown weapon system or complete explosion gameplay pipeline.

Use the existing TypeScript/Vite/Three.js project and installed version. Keep `AnimationPlayer`, data-driven clips and one player per animated instance, while extending metadata and render backends where needed. Do not remove useful debug/review tools. Read source and recent tests; older READMEs and verification documents may describe earlier milestones.

## Lock the visual language before generating more frames

Use these starting design tokens, adjusting by screenshot comparison rather than treating them as unchangeable paint values:

| Role | Starting color | Visual rule |
| --- | --- | --- |
| Paper | `#F3E6C8` | Warm ivory object faces, HUD cards and small sky openings. |
| Ink | `#12101B` | Deep contours, ground mass and readable interface backing. |
| Shadow | `#35234F` | Violet structural shade; forms remain legible inside it. |
| Mid violet | `#6B478A` | Secondary architecture, less saturated than action. |
| Distance | `#24C9D6` | Turquoise skyline/cloud accents and atmospheric separation. |
| Action | `#FFC928` | Short sharp golden bursts, shell glints and strong hits. |
| Contact | `#F52D39` | Graphic red ink impacts, danger marks and health accents. |

The ground must read as dark charcoal/violet with restrained ivory scuffs, not a bright tiled courtyard. Walls need bold ink edges, shadow masses and large readable material marks. Put detail on object faces without making every pixel equally contrasty. Keep the center aiming region and enemy silhouettes readable.

The sky must read as open space: quiet ivory/cyan atmosphere and distant turquoise towers. Replace the current giant overhead cream shapes. A seamless equirectangular sky must be authored for spherical mapping; a normal perspective painting is not automatically a panorama. Check seams, poles, horizon height and looking straight up. Keep towers/ruins on independent world layers so near/far motion differs naturally.

Use coarse hand-printed linework, controlled hatching and small registration imperfections. Avoid a generic bloom filter, realistic PBR sheen, a parchment app dashboard, or globally shaking every layer to manufacture excitement.

## Game UI: drawn, reactive and readable

Build real interactive UI. Generated panels can supply torn-paper/brush textures, but all changing numbers, text, cooldowns and settings remain live HTML/CSS or explicit runtime UI elements. Reuse native buttons, labels and accessible controls. Never bake ammo or health into a static screenshot.

- **Combo:** upper-left torn ivory paper card, thick irregular black outline, large slanted gold count, smaller COMBO label and a short real combo-decay mark. On an increment, animate the count from about 1.15 scale to 1 with a short settle; cancel/restart cleanly for rapid kills. The card does not bounce forever.
- **Wave:** small upper-center black brush stamp with ivory text and a gold numeral. A wave-start banner tears/wipes in, holds briefly, then clears the arena view. It must not steal input.
- **Health:** lower-left ivory cross and large live number over a contained red/black ink patch. Damage briefly compresses the number and adds a directional edge mark; color is not the only signal. Preserve health progress semantics and a readable value.
- **Ammo:** lower-right live count and six shell pips on a compact ink backing. A spent pip flicks/fades out; an empty state visibly says RELOAD. During reload, show real progress or pose-linked pips, then transfer ammo at the chosen event.
- **Powers:** a small lower-center strip for dash ready/cooldown, remaining air jump, grapple valid/invalid anchor and melee cooldown. Show actual state. No fake circular meters disconnected from gameplay.
- **Reticle:** crisp four-part ink reticle with a quiet center opening. Briefly expand on firing, then recover. On hit, show one short contact confirmation; use a different shape for a kill. Never hide a monster telegraph behind oversized hit text.
- **Comic words:** occasional small `KABAM!`, `CRACK!` or `INKED!` near major events, not every pellet. Keep them outside the aim region, cap simultaneous stamps and provide an option to reduce them. They reflect real events.
- **Menu:** a deliberate illustrated opening with a clear Play action, short controls, Settings and a separate How to play/rules section. Move the current long rules paragraph out of the first screen. Pause, error, wave-clear and defeat states share the same paper/ink system with clear actions.
- **Settings:** retain sensitivity, volume/mute, reduced motion, shake and flash strength. Add effect density/quality as needed. Persist valid values safely. Make narrow menus scrollable; desktop keyboard/mouse support must remain explicit until touch controls exist.

Compose at both 1280×720 and 1920×1080. Use safe margins, tabular or stable-width numerals and concise labels. HUD panels must not cover the closer-gun sprint pose or change layout when a number gains a digit. Keep UI animation independent of simulation hit-stop.

## Combat: one causal event, several short feedback layers

Give each action a readable sequence: **anticipation → commitment → contact → follow-through → recovery**. Event timing, damage, ammo, sound and visuals share one authoritative timeline. An animation image cannot apply damage just because it was drawn.

Initial feedback targets below are tuning values to verify in play, not claims about current behavior:

| Event | Layered response |
| --- | --- |
| Shotgun shot | Immediate shot/sound, sharp 40–90 ms golden flash, heavy but brief recoil, a small smoke curl, shell sprite, a few traced pellets and grouped hit feedback. Recover gun art over roughly 200–300 ms while retaining the configured fire interval. |
| Hard hit | Target-local ink star, 2–5 paper/spark fragments, a short pose recoil, contact sound and hitmarker. Combine same-shot pellets into one sensible visual event per target. |
| Finishing hit | Stronger outward ink/paper breakup, a brief score/combo confirmation, optional 25–40 ms local hit-stop. Do not freeze the world separately for every pellet. |
| Explosion | Tiny bright core, angular golden bloom, expanding ring, fragments, smoke breakup and a few fading flecks. Separate hit logic from visual size; damage obeys radius, falloff and cover rules. |
| Landing | Ground-oriented dust ring and restrained weapon settle, strength from landing velocity. Never play the heavy-landing response for a small ordinary step. |
| Dash | Short turquoise streaks, lean/sway and release; continuous collision and full control recovery. No full-screen illustration replacement. |

Use 3–5 high-quality flash shapes and 5–8 shared effect textures. Vary scale, orientation, color, lifetime and emission without changing the underlying meaning. A ring can expand with transforms; fragments can rotate as particles; a trail can stretch along a path. Generate additional images only when they add an actual shape/pose change.

Keep explosions spectacular but localized. Brief readable bright shapes, dark negative space and sound contrast create punch. Continuous white flashes, dense smoke over the reticle and constant camera shake make the action harder to read. Scale feedback with user settings; preserve critical telegraphs at all effect-density levels.

Choose hit-stop scope explicitly: local target/weapon hit-stop is the default; global simulation hit-stop is optional for rare finishers and needs input buffering plus correct grapple/projectile behavior. Use separate real-time and gameplay clocks so menus, input capture and sound are not accidentally stalled.

## Weapons: same object through every pose

The existing idle and fire art visibly change the shotgun silhouette and hand framing. Replace the mismatching art as one approved set; more transform compensation cannot fix a different object design.

First choose a canonical shotgun matching the original board: chunky ivory twin-barrel game prop, dark seam/fore-end, thick drawn contours, stable hands and barrel arrangement. Record camera, grip pivot, muzzle and ejection attachments. All firing/reload/sprint poses inherit that exact design. Preserve complete wrists/forearms entering the screen edge; do not expose floating cutoff hands.

Use a layered weapon/hand rig where it remains convincing. Recoil, sway, idle breathing, sprint approach, landing settle, draw and holster are primarily smooth transforms. Supply 3–5 silhouette-changing weapon key poses and 6–8 reload key poses where hands must articulate; use extra intermediate poses only when playback reveals a gap. Interpolate compatible layer transforms or mesh deformation, not arbitrary whole-frame dissolves with doubled hands.

Reload needs a deliberate windup, hand interaction, ammo-transfer event, regrip and settle. Define interruption rules before coding: whether shooting cancels it, when ammo becomes available and which pose recovers. Keep the camera/grip registration stable. The image shows an external game animation, not a technical firearm diagram.

Sprint already scales the overlay toward 1.1. Refine it with a matching arm pose and spring transition driven by **actual travel**, not Shift alone. The orthographic weapon overlay cannot be made “closer” by moving it along Z. Keep the grip anchored, a small apparent scale increase, restrained bob and a clear reticle. Frame muzzle attachments must follow all transforms.

Expand the arsenal after the matching shotgun slice works:

| Weapon | Distinct behavior/art |
| --- | --- |
| Pistol | Tight star flash, precise single impact, light quick recovery. |
| Automatic | Compact repeated bursts, occasional tracers, controlled smoke/shell budget; no flash on every rendered frame. |
| Blaster | Cyan white-core traveling bolt and violet/cyan pulse, visible projectile travel and obstruction. |
| Knife | Hand windup/release, separate spinning world sprite, short glint and localized contact effect. |
| Throwable | Visible arc, readable object silhouette, explicit fuse/contact rule, pooled explosion layers. |

Each has ammo/cooldown, hit behavior and pose/event data. Do not reuse shotgun mechanics with only a different image.

## Monsters: reuse systems, preserve individuality

Replace the current blank-mask runner look with the original board's hunched ivory-and-charcoal ink creature. Approve one identity before expanding directions. Preserve its face markings, silhouette, limb lengths, highlights and scale across run/attack/hit/defeat. Attacks and defeat currently use front-only art; account for other viewpoints rather than showing a creature's face from every side.

Use a hybrid asset strategy:

- **Near/mid-distance:** 6–8 strong key poses with continuous procedural root motion and carefully rigged layers where appropriate.
- **Articulation:** separate overlapping head/torso/limb/wing/tail cutouts with hidden joint coverage; animate parented quads or a weighted flat mesh. Skinning requires actual vertices, indices/weights and bones. A one-piece PNG is not already rigged.
- **Direction:** front, side and three-quarter masters first, with clear conventions. Add rear/opposite/elevated views only when play exposes them. Use phase-matched view changes and angular hysteresis; do not flip artwork with asymmetric markings carelessly.
- **Compatibility:** share the animation controller and proportions-aware motion parameters within a body plan. Do not force insect, winged and tentacled anatomy through the humanoid rig.
- **Procedural layers:** subtle breathing, head aim on a separated head layer, springy antennae, short tentacle chains, wing cycles, grounded feet and separate shadows. Keep deformations inside silhouette limits; a billboard cannot reveal surfaces that were never drawn.
- **Variants:** palette/material masks, limited accessories and scale variants supplement genuinely different silhouettes. Scaling one runner into all enemy families is not acceptable.

| Family | Silhouette and movement | Telegraph / attack / counterplay |
| --- | --- | --- |
| Rag runner | Hunched lean ink humanoid, long forearms, ivory mask; fast flanking run | Shoulder draw-back, committed swipe; sidestep or stagger. |
| Needlebrood insect | Low six-legged armored wedge, two raised antennae | Rear-body lift, a short leap or visible acid projectile; avoid the landing/puddle. |
| Cinderhorn demon | Broad upper body, curved horns, heavy feet | Foot plant and gold/red warning wedge, then charge/fire cone; break line of sight. |
| Ribbon wraith | Central ink core and 3–4 thick trailing ribbons | Ribbons coil before a limited grab/teleport; marked destination and breakable windup. |
| Kitewyrm beast | Wide folded paper wings, long tail, narrow head | Wing flare, dive line, recoverable landing; punish after a miss. |
| Patchmaw mutant | Asymmetric torso and visible violet regeneration mark | Obvious healing channel; hit the mark to interrupt, no silent health reset. |
| Bell brute / giant | Blocky ivory shoulders, short heavy legs, massive fists | Long overhead windup, ground ring then radial slam; jump/dash out, long recovery. |

Start with runner + insect + brute, then expand. Every family needs a distinct audio/shape/behavior cue and a fair counter. Spawn behind scenery with a sound/shadow cue, not directly on top of the player. Limit attack concurrency and honor player height, cover and actual reach.

## Space and powers

Keep the small real 3D scene for camera motion, collision, floor/platforms and projectile simulation. Image art supplies appearance. Perspective handles apparent distance scaling already; world-size monsters must not be scaled down again by inverse distance.

Use upright axial billboards for grounded creatures, camera-facing effects, actual simple solid geometry for nearby cover, and parallax cards/cylinders for distant scenery. Fade distant sprite limitations with art-directed fog rather than flattening every depth plane. Normal sprite shadows are separate art or projected effects, not an assumed automatic engine feature.

Fix the audited aerial melee reach and off-ledge grounding before adding aerial rewards. Aim the grapple at a visible anchor near the reticle, preserve meaningful tangential/vertical release velocity, sweep collisions and check rope obstruction. Show available anchors clearly without covering enemies. Improve the existing powers rather than creating duplicate state machines.

Entertaining mechanics to stage after correctness:

1. **Ink pressure:** grounded and airborne kills fill a real meter; spending it adds one larger, cover-respecting ink shock burst. HUD fill reflects actual earning/spending.
2. **Paper barrels:** distinct marked destructibles that trigger a limited chain reaction with a visible warning and projectile/LOS validation. Do not silently make every cover crate explosive.
3. **Aerial finisher:** a well-aimed superjump or grapple-release hit can increase style score; clear rules and a capped bonus avoid farming.
4. **Enemy interactions:** a demon charge can stagger another monster; a brute slam can push paper debris. Introduce each interaction with clear visual causality.

Choose one mechanic for the next playable slice. Do not add four unfinished meters and call that variety.

## Runtime and asset budgets

The current manifest eagerly loads **101 images / 40,049,406 bytes** and implies approximately **225.3 MiB** of RGBA8 texture storage with full mip chains before other resources. This is an estimate, not measured driver memory. The user authorizes more generation; that is not a reason to load every source image at startup.

Keep high-resolution masters separate from exported runtime sizes. Use atlases or another measured batching strategy, trim with source-size/pivot metadata, edge-extrude and pad for filtering. Pool sparks, fragments, decals, smoke and projectiles; cap transparent overlap, active enemies and attack effects. Stream later enemy families and weapons; move alpha diagnostics to review/development. Share texture storage and static geometry without sharing independent animation clocks.

Use per-instance UV/rig parameters where batching supports them. A lit scene does not make `MeshBasicMaterial` sprites react to light: use controlled shader/material tint or explicit light masks for flashes and glowing eyes, or an appropriate measured lighting approach. Do not add dozens of ineffective dynamic lights.

Keep collision, hit queries and AI based on bodies and actions, not transparent rectangle corners. Add broad-phase/spatial lookup as population grows. Particle and audio budgets must preserve enemy tells. Report measured frame times, draw calls, startup and resident texture estimates at named hardware/resolutions. Do not advertise headless numbers as universal performance.

## Delivery order and definition of success

1. Fix the new correctness defects in `fix.md`; preserve earlier fixes and passing behavior.
2. Prove one **reference-matched slice**: dark ink floor, cyan open sky, matching runner poses, one consistent shotgun including reload, one strong explosion and live comic HUD.
3. Compare the actual game at the reference camera/composition and scale. Include idle, peak shot, reload, sprint, monster run/attack and explosion states plus a short gameplay recording. A beautiful generated poster does not prove the runtime matches it.
4. Add insect and brute with compatible reusable animation backends and genuinely different attacks.
5. Expand weapons and one chosen new mechanic after that slice is playable and visually coherent.
6. Verify 1280×720 and 1920×1080, menu/failure/narrow-device states, reduced motion/flash settings, pause/resume, wave progression, hit/ammo event deduplication, collisions and repeated-wave memory stability.

Deliver source changes, reviewed runtime assets, prompt/provenance records, atlas/rig manifests, automated checks for real regressions and short clear run/build instructions. Clearly mark guides, candidates, placeholders and unimplemented content. Do not claim that every generated sheet is a ready atlas. Do not publish/deploy unless separately requested.

## Technical references

Project-specific tuning and architecture above are recommendations. Engine behavior is checked against official references:

- [Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html): skeletal animation needs a skeleton and geometry skin data.
- [Three.js Sprite](https://threejs.org/docs/pages/Sprite.html): camera-facing sprite behavior; sprites do not cast engine shadows automatically.
- [Three.js MeshBasicMaterial](https://threejs.org/docs/pages/MeshBasicMaterial.html): this material is not affected by scene lights.
