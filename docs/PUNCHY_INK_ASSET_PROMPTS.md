# Paper — matching asset prompts and the 40-technique plan

Use with PUNCHY_INK_GAME_PROMPT.md. The original gameplay boards are the art authority. New source candidates are under `output/punchy-ink-v2/`; they have not been wired into gameplay. Generate in reviewed batches, not an arbitrary million-frame target.

## Shared prompt prefix

> Paper game art, matching the supplied original gameplay reference. Bold charcoal hand-printed contours, creamy opaque ivory paper forms, deep violet-black shadow, turquoise atmospheric accents, controlled gold action highlights and small graphic red ink accents. Coarse purposeful crosshatching, expressive readable silhouettes, sharp shape hierarchy. A comic world with weight and motion, not clean gray polygons, realistic metal, a cute blank-mask robot, a beige tiled courtyard or generic neon fantasy. Keep the approved object's exact anatomy/geometry, proportions, markings, viewpoint and line weight across every state. No watermark or decorative labels.

For sprites/FX, append and set the tool's transparent-background option:

> Actual RGBA transparency outside the subject, no background/checkerboard/matte or baked ground shadow. Ivory areas inside the subject remain opaque. Keep full silhouette and motion margin. Same original canvas, scale, root/grip anchor and light direction in every frame. Empty areas must not contain a translucent rectangular haze. Soft alpha is intentional only for the requested glow/smoke. Images are reviewed before cropping/packing; do not invent metadata inside the artwork.

For opaque surface textures/sky omit the transparency request and use the appropriate prompt below.

## A. Canonical first-person shotgun

> Create ONE canonical first-person ivory-paper twin-barrel shotgun matching the top panel of the reference: chunky parallel barrel pair, dark central seam, ivory receiver, black fore-end and thick drawn contours. Two ink-drawn hands with complete wrists and forearms entering from the bottom edge; fixed first-person camera, lower-right placement aimed toward the upper-left aiming region. Clear top/center aim space. No flash, smoke, shells, impact, UI or environment. Approve one barrel arrangement and exact silhouette. This idle image defines every subsequent pose. Do not copy the conflicting old modeling turnaround or invent a new stock/receiver between frames.

**Firing key poses, one small coherent batch:**

> Use the approved canonical shotgun as identity and camera reference. Produce five consecutive visual key poses: idle/pre-shot, initial recoil, maximum recoil, partial recovery, exact idle return. Keep barrel length, receiver thickness, hands, grip anchor and arm continuation unchanged. The weapon may rotate/recoil but cannot become a different model. No flash/ejected object baked into the frames. Same fixed canvas, framing and scale; transparent outside the art. If a shape change cannot be achieved consistently, retain the canonical image and use runtime recoil rather than swapping incompatible drawings.

**Reload key poses:**

> Same approved shotgun, same camera/canvas and hands. Produce eight ordered exterior animation key poses: ready, lower/turn, support hand releases, readable reload interaction, interaction completes, support hand regrips, raise, exact ready return. Maintain the precise weapon silhouette and consistent forearms at every pose. No mechanical diagram, exposed internals, scenery, flash or airborne ammo. These are hand/prop performance poses for a fictional game. The game will assign pose timing and the one ammo-transfer event after visual review.

Do not blend incompatible full-frame poses into doubled fingers. Add 2–4 in-betweens only where motion testing exposes an unacceptable jump. For layered rigging, generate approved isolated hand/forearm and gun components with hidden joint overlap rather than trying to bend one opaque screenshot.

## B. Additional gun and throwable assets

Apply the canonical/firing/reload recipe separately to each design. Share controllers, not identical recoil or timing.

| ID | Canonical design prompt addition | Unique action requirement |
| --- | --- | --- |
| pistol | Compact angular ivory/charcoal handgun, short dark grip, one consistent supported-hand pose | Small tight flash, crisp kick, fast recovery. |
| automatic | Compact long ivory game rifle, dark forward grip, bold readable sight silhouette | Short burst poses and sustained-fire heat/smoke parameter, bounded cases. |
| blaster | Chunky ivory energy prop, three cyan bands and round luminous aperture | Charge pose and bolt release; separate halo/bolt/pulse. |
| knife | Ivory blade, ink bevel, wrapped black grip, readable hand silhouette | Ready/windup/release/follow-through; projectile is separate. |
| grenade | Graphic dark segmented throwable with ivory top, simple bold silhouette | Ready/anticipation/release/recovery; four rotation views for the world sprite. |

Each request: one design, one fixed camera and one state sequence. Never generate a poster of all guns and call it a runtime sprite library.

## C. Monster design recipe

> Create ONE full-body [FAMILY] creature according to [SILHOUETTE/ANATOMY/ACCENT/BEHAVIOR] below, in the original Paper gameplay's rough charcoal-and-ivory monster style. Front three-quarter neutral performance pose with visible feet/appendages and space around all extremities. Large readable face/core and clear separated limbs. Preserve a non-graphic fantasy appearance. No weapons, scenery, attack effect or ground shadow. This canonical design must remain identical across the later poses, views and optional cutout parts.

| Family | Fill-in silhouette/behavior |
| --- | --- |
| Rag runner | Hunched long-armed humanoid, ragged charcoal mass, ivory skull-like mask, tiny turquoise throat mark; flanks and swipes. Use the new pose guide for shape direction, not a complete run loop. |
| Needlebrood | Low armored six-legged insect, broad front wedge, long jointed antennae, ivory plate edge and gold abdominal cue; skitters then leaps. |
| Cinderhorn | Broad horned demon, bent heavy legs, ivory shoulder plates, scarlet ember marks; plants then charges. |
| Ribbon wraith | Compact hovering ivory core with four heavy black ribbon tentacles and cyan inner marks; coils, grabs or teleports. |
| Kitewyrm | Foldable angular paper wings, narrow beast head and tail, violet underside/cyan leading edge; banks and dives. |
| Patchmaw | Asymmetric stitched-looking ink silhouette with one larger arm and visible violet core mark; staggers and channels regeneration. |
| Bell brute | Wide blocky shoulders, low ivory head, huge fists and short weighty legs, small gold cracks; stomps/slams. |

First production batch: runner, insect and brute. Others follow once the visual/animation pipeline works. A palette variant or giant-scaled version is a variant, not proof of a different family.

## D. Monster key poses and cutout rigs

**Key-pose request:**

> Approved [MONSTER] identity, fixed [VIEW] camera, unchanged scale and root registration. Produce six to eight coherent [STATE] key poses: [EXACT PHASE LIST]. Keep anatomy, markings and limb lengths fixed. Actual root translation is driven by the game; do not move the creature across the canvas. Leave room for limb extension. No floor, shadows, effects or text. Poses must make sense at small gameplay size and be reviewed in order, not just admired as a contact sheet.

Suggested states:

- Run: alternating left contact, left compression, passing, flight, right contact, right compression, passing, flight. Last leads back to first without duplicating it.
- Attack: alert/anticipation, windup, commitment, strike, follow-through, recovery. Visual strike and actual damage share one event.
- Hit: contact recoil, maximum stagger, recovery. These can use a few poses plus procedural spring motion.
- Defeat: buckle, collapse or stylized paper breakup, remaining fragments. Two strong poses plus pooled particles may outperform eight inconsistent full-body pictures.
- Family-specific: insect leap, winged dive, tentacle coil, demon charge and brute slam require distinct anticipation and recovery.

**Cutout-rig component request:**

> Based on the approved [MONSTER] neutral design, provide separate non-overlapping isolated exterior art components suitable for a flat articulated character: [PART LIST]. Preserve scale, ink style and colors. Give joint ends extra hidden overlapping artwork so rotating components does not reveal transparent holes. Render connected anatomy consistently, including surfaces normally hidden behind the torso. Do not include a skeleton diagram, background, labels or cast shadow. These are candidate layers; a technical artist will assign pivots, mesh weights and a hierarchy after checking the art.

Part lists differ: humanoid head/torso/upper-lower limbs; insect carapace plus six articulated legs/antennae; flying creature body, paired wing segments and tail; wraith core plus segmented ribbons. Do not promise universal humanoid rig reuse.

**Directional request:**

> Re-render the approved identity and the same approved phase poses from [front / front-three-quarter / side / rear-three-quarter / rear], with unchanged anatomy/markings and world scale. Keep phase correspondence and a common foot/root origin. The viewer sees a different side of the same creature, not a redesigned cousin. Keep asymmetry correct. No baked shadow or ground.

Use additional elevated views only where close airborne gameplay needs them. Three view masters alone do not provide all 360-degree or overhead surfaces. View switching needs hysteresis and preserved gait phase.

## E. Shared sparks, flashes and explosions

**Flash family:**

> Three distinct isolated golden comic muzzle-star shapes: compact tight star, broad irregular shotgun blast, narrow directional burst. Bold charcoal strokes, ivory hot core and gold/orange tips, transparent spaces between spikes. No weapon or background. Same emission-axis convention, large clean margins. Source art for independent scale/rotation/pulse, not three consecutive action frames.

**Impact family:**

> A small isolated set of distinct Paper impact accents: sharp gold contact spark fan, red graphic ink star, cyan ring with transparent center, violet-cyan pulse, tiny ivory paper flecks. Keep each separated with generous transparent margin, no object/creature/scene. Make silhouettes readable at 64–128 displayed pixels; no giant soft glow cloud.

**Explosion key phases:**

> Six ordered key phases of the same isolated comic explosion at a fixed center: tiny compressed ignition, rapid angular bloom, bright peak with ring, hollow breakup with outward paper shards, sparse fading fragments, almost invisible residue. Match the reference's gold/ivory/charcoal energy. No environment, target, text or full-screen vignette. The last two phases must visibly have less area/opacity, not repeat the peak. Maintain a fixed canvas/origin and leave margins for expansion.

Use transforms and particles between these phases. The already-generated effects candidate sheet's bottom row does **not** fade sufficiently; treat it as shape research, not an approved explosion sequence.

**Smoke and paper:**

> One separate ivory-gray curling smoke wisp and a small set of ivory/charcoal angular paper chips in the Paper ink style. Smoke gently alpha-fades; chips are opaque cutouts. No floor or background. Keep subjects separated for later review/cropping, no baked explosion or shadow.

## F. Environment images that fit their mapping

**Floor:**

> Opaque seamless square top-down material: dark violet-black rough paper/ink arena ground, sparse ivory scratches, restrained violet scuffs and a few subtle red ink stains. No pale square tile grid, dominant central symbol, perspective, horizon, props or cast shadows. Low-frequency dark mass with readable contact areas; consistent opposite edges for tiling.

**Wall:**

> Opaque seamless straight-on fortress masonry surface, large ivory faces bounded by irregular charcoal strokes and deep violet recesses, rough printed edges and occasional cyan reflected accents. Flat material image only, no sky/ground/perspective or built-in dramatic cast shadow. Opposite edges match; avoid dense high-contrast microdetail everywhere.

**Sky:**

> Opaque 2:1 equirectangular sky panorama designed to wrap on a sphere, continuous left/right seam and quiet poles. Mostly open ivory/cyan atmosphere with a few flat turquoise ink-cloud shapes near the horizon. Calm overhead region, no giant outlined ceiling shapes, buildings, objects, typography, ground or perspective vanishing point. Subtle paper texture, no painted sun flare or cinematic blur. Verify mapped onto a sphere, not just as a rectangle.

**Skyline / ruins:**

> [Far turquoise tower silhouette / mid-distance violet ruined arches] as an independent wide transparent scenery layer. Hand-ink architecture with a strong irregular upper contour, muted contrast at distance, no opaque sky rectangle, floor, monsters or near props. Sparse internal details, controlled scale. Distant scenery only, not a walkable painted bridge.

**Boxes and barrels:**

> One straight-on square crate material variant [ivory timber with dark crossbrace / violet riveted metal / patched paper panels], strong black structural marks, restrained hatching, consistent surface scale. No perspective or ground. For explosive barrels use a separate clearly readable red/gold hazard-marked design without tiny text; ordinary cover must remain visually distinct.

## G. UI art assets

Generate panels without numbers or functional text; implement typography and state in code.

> A small family of isolated Paper game-UI backing shapes: one torn ivory rectangular combo card with thick irregular black ink edge, one black horizontal brush stamp, one compact red/black health ink patch, one small dark ammo backing and one gold-edged comic exclamation burst. Separate shapes with transparent gutters, no text/numbers/icons baked in, no background, consistent coarse printmaking style and readable empty centers. The game overlays live values and applies short transforms.

Prefer HTML/CSS or existing vector assets for simple symbols, shell pips, bars and live text. Generated art supplies organic material, not a raster replacement for every interface element.

## H. How the 40 supplied techniques map to implementation

| # | Application / qualification |
| --- | --- |
| 1 | Approve one distinct silhouette per family before variations. |
| 2 | Real RGBA for world cutouts and effects; verify alpha numerically and visually. |
| 3 | Start with 6–8 meaningful poses; do not confuse pose count with runtime smoothness. |
| 4 | Pack reviewed poses deterministically; generated grids need layout verification. |
| 5 | Front/side/three-quarter seed views, then rear/elevated coverage as gameplay requires. |
| 6 | Reuse compatible art for idle/recovery/hit with transforms; avoid incorrect attack poses. |
| 7 | Reference-preserving edits create damaged accents; damage state must remain readable and non-graphic. |
| 8 | Archive high-res masters, export runtime sizes appropriate to displayed scale. |
| 9 | Distinct insect, demon, wraith, beast, mutant and giant families. |
| 10 | Anatomy differs, not just hue or size. |
| 11 | Share rigs only within compatible proportions/body plans. |
| 12 | Dedicated crawling, flying, ribbon and humanoid articulation models. |
| 13 | Share animation controller/gait parameters; retain each creature's pose character. |
| 14 | Mask-based colors and attachments make variants; attach horns/wings at real pivots. |
| 15 | Elite/giant/infected variants get explicit stats, collision and telegraphs, not only scale. |
| 16 | Unique attack commitments, recovery and counterplay. |
| 17 | Use articulated cutouts/weighted flat meshes where prepared; a PNG alone has no skeleton. |
| 18 | Procedural appendage chains/wing joints with bounded deformation and LOD. |
| 19 | Small breathing/balance motion on appropriate layers, not whole-body jelly scaling. |
| 20 | Interpolate rig/transform keyframes; do not blindly crossfade incompatible limb images. |
| 21 | Head tracking only on separate head art or a deformable mesh, with limited yaw. |
| 22 | Independent floor shadows follow height and body movement. |
| 23 | Short hit recoil rotation/displacement/squash with reset and consistent collision. |
| 24 | Body-plan-specific crawl/fly/leap/charge/teleport behaviors. |
| 25 | Perspective already gives distance scaling; keep world size stable and avoid double scaling. |
| 26 | Axial billboards for grounded monsters, freely camera-facing effects where suitable. |
| 27 | Direction selection uses heading/view angle, hysteresis and preserved animation phase. |
| 28 | World-space near/mid/far scenery supplies parallax; sky orientation follows camera rotation. |
| 29 | Art-directed distance fog, not uniform haze that destroys silhouette contrast. |
| 30 | Shadow art/projected ground quads; do not assume Sprite.castShadow works. |
| 31 | Real world coordinates, perspective and collision maintain the spatial illusion. |
| 32 | Reuse 3–5 flash designs with controlled variants and lifetimes. |
| 33 | Spring recoil/sway/transforms plus a few silhouette-changing poses. |
| 34 | Pool surface-normal-aligned impacts/decals; bind them to real contact data. |
| 35 | Shared procedural ink/acid/spark/magic systems, family tint/mask/lifetime settings. |
| 36 | Capped local hit-stop on strong events; don't repeat it per pellet. |
| 37 | Directional short shake for heavy action, adjustable and disabled by reduced-motion policy. |
| 38 | Eye masks/material pulses and effective sprite lighting; scene lights do not affect BasicMaterial. |
| 39 | Bounded fog/dust/smoke layers with alpha-overdraw budgets. |
| 40 | Sound, silhouettes and telegraphed entrances create suspense without unfair unseen damage. |

## I. Acceptance gate before an asset enters the runtime

Check real alpha, opaque ivory, silhouette, identity, complete wrists/feet, margins, consistent pivot and frame order. Play clips at speed and slowed down. Test view transitions on the actual camera; compare idle/fire/reload side by side. Register muzzle/ejection/foot points. Confirm genuinely fading terminal FX phases. Pack with correct rectangles, original size, trims and edge gutters. Record source prompt/reference and whether it is a guide, candidate or approved runtime asset.

Initial budget: one matching shotgun set, one runner set, one insect, one brute, 3–5 flash designs, 5–8 shared FX, 5–10 environment materials/layers and a small reusable UI backing set. Expand only where a behavior or silhouette needs more art. Do not sacrifice the original aesthetic to reduce images, and do not sacrifice coherence to increase their count.
