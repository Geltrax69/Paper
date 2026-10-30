# Paper: image generation prompt pack

Use alongside GAME_BUILD_PROMPT.md. These are reusable prompts, not a claim that the listed sprites have already been generated. Existing output images are reference boards only.

## 1. Shared art direction

Prepend this to every image-generation request:

> Create production-intent game art for Paper, a first-person paper-and-ink arcade shooter. Warm ivory paper surfaces, bold charcoal ink contours, restrained hand crosshatching, cool violet shading, turquoise accents, and golden-yellow combat highlights. Use clear large shapes that survive reduction in size. Stylized ink creatures and graphic impacts, no anatomical gore. Match the supplied approved reference's proportions, markings, surface details, palette, lighting and line weight. No text, labels, borders, watermark, HUD or UI. No cinematic depth-of-field blur. Preserve the exact identity of repeated objects across frames.

For all cutout assets append:

> Actual transparent RGBA background. No painted background, checkerboard pattern, solid matte, ground plane or baked ground shadow. Preserve intentional ivory/white surfaces as opaque; white parts of the object are not transparency. Keep a clean alpha edge with no gray or white halo. Leave transparent margin around the complete silhouette, including motion extremes. Do not crop extremities or effects. Use consistent canvas size, scale and anchor position across all frames. Export image art only; frame metadata is recorded separately.

Set the image tool's transparency option as well as including these words. Verify the returned alpha channel. A written instruction alone does not guarantee usable transparency or exact frame alignment.

For opaque scenery replace the cutout instructions with the specific background instructions below.

## 2. Production rules before generating hundreds of frames

1. Approve one canonical still per object. Use the gameplay boards only to establish style; they include backgrounds and cannot serve as runtime textures.
2. Generate a small sequence from the canonical image. Inspect the silhouette and camera consistency before commissioning more angles or states.
3. Prefer individual frames or small four/eight-frame strips. If a sheet is returned, verify its actual cell layout; never assume the generator followed the requested grid exactly.
4. Keep an untrimmed master canvas. Register frames to the same grip/foot pivot; store trim offsets if packing removes transparent margins. Do not center every frame by its changing visible bounding box.
5. Review at game size and playback speed. Correct inconsistent hands, barrel count, torso width, limb length and frame alignment. Never ship an AI sheet without playback QA.
6. Pack approved frames with a deterministic atlas tool; record rectangles, pivots, events and attachment points. A generated decorative grid is not a reliable atlas layout.

Proposed starting master sizes, subject to actual tool support and visual testing: weapons 1024²; monsters 512²; compact effects 256² or 512²; scenery 1024–2048 wide. Export runtime sizes after review rather than loading all master-resolution images.

## 3. Weapon canonical prompt

Use a separate request for each weapon. Replace the bracketed values.

> Asset: [WEAPON ID] canonical first-person view sprite. Show [WEAPON DESCRIPTION] held in two consistent ink-drawn gloved hands, with wrists entering from the bottom edge. Weapon occupies the lower-right foreground and aims toward the upper-left aiming region, leaving most of the upper canvas empty. Fixed first-person camera and moderate perspective, suitable for a 16:9 game viewport. Maintain a stable grip anchor near the bottom of the canvas. Full visible weapon silhouette, no unrelated objects. Idle pose only: no muzzle flash, smoke, shell, tracer, impact, background or interface. Design this as one reusable game overlay, not a complete gameplay screenshot.

| ID | Weapon description |
| --- | --- |
| shotgun | Chunky short fictional twin-barrel shotgun, two parallel barrels side by side, ivory paper barrel shrouds, black central seam, dark fore-end, angular ivory body and compact grip. Select this layout once and preserve it in all frames. |
| pistol | One compact angular ivory-and-charcoal pistol with a short dark grip, supported by the other gloved hand. |
| automatic | Compact ivory-and-charcoal automatic game rifle with readable front sight and dark foregrip; a distinct long silhouette. |
| blaster | Chunky fictional ivory energy blaster with three turquoise glowing bands, a round luminous muzzle and a dark grip. |
| knife | Ivory blade with dark ink bevels and a black wrapped grip held by the right hand; the other hand relaxed and out of the aim region. |
| grenade | Small graphic game grenade held in the right hand, dark segmented body and ivory cap; bold simple silhouette, no firing effects. |

Optional dual pistols are a later separate design, not a mirrored copy unless the hand pose and markings remain plausible.

## 4. Weapon motion frames

For each state, supply its approved canonical image. Generate each weapon separately. Keep flashes and smoke in separate effect assets.

**Firing/recoil — four frames**

> Reference is the approved [WEAPON ID] idle sprite. Create four consecutive first-person animation frames: initial kick, maximum recoil, partial recovery, return to the exact idle pose. Same hands, camera, grip pivot, canvas, lighting and weapon geometry throughout. Change only the pose needed for recoil. Keep the hands attached and anatomy consistent. No flash, projectile, smoke, shell, impact or background. Keep the muzzle visible so its attachment point can be recorded for every frame.

Suggested initial playback: 20–30 fps; tune the shot event at the initial kick. For automatic fire, do not restart a long recovery sequence for each render frame. Let the game blend a procedural recoil spring with a short art loop.

**Reload — eight key poses**

> Reference is the approved [WEAPON ID]. Create eight ordered first-person game-animation key poses showing a readable stylized reload: idle, lower, turn slightly, reload gesture begins, gesture completes, return begins, raise, exact idle. Keep design and hands identical. Favor broad clear hand gestures and stable silhouettes; exterior appearance only. Keep the object within a fixed transparent canvas. No special effects or scenery.

Use durations and ammo-transfer events from gameplay data; the generator does not determine reload timing. If the sequence does not stay coherent, use fewer approved poses and smooth transform motion instead of pretending eight broken frames form an animation.

**Melee/throw — six key poses**

> Reference is the approved [knife/grenade] first-person sprite. Create six ordered poses: ready, anticipation, acceleration, release or slash peak, follow-through, recovery. Fixed first-person camera, consistent hands and pivot. For a throw, the item leaves the hand at the release frame and is absent from follow-through; the airborne item is a separate world sprite. For a slash, keep the held knife in the hand throughout. No trail, flash, detached projectile or environment baked into these frames.

Holster, draw, sprint sway and small idle movement should first use continuous runtime transforms. Generate additional hand poses only when the existing art cannot support the action convincingly.

## 5. Muzzle flashes and “gun shatter”

**Shotgun muzzle flash — three shape variants, four frames per variant**

> Isolated angular golden-yellow comic muzzle blast, white-hot opaque center fading through gold to transparent tips. Four ordered phases: ignition, wide maximum burst, smaller breakup, almost vanished. Same emission anchor at center-left in every frame, spreading rightward along a fixed axis. Broad jagged shotgun character. No weapon, shell, hand, background, text or impact target. Preserve margin around all spikes. Match Paper's ink accents.

The engine rotates/scales this art to the actual muzzle orientation. A weapon-frame muzzle attachment must drive placement.

**Pistol/automatic flash — repeat as two distinct assets**

> Isolated compact [pistol star / narrow automatic burst] muzzle flash with white core, golden tips and subtle ink contour. Three consecutive phases: ignition, peak, disappearance. Fixed emission point, consistent axis and transparent canvas. No gun or scene.

**Cosmetic gun-shatter fragments — separate pieces**

> Create an isolated set of eight fictional paper-prop fragments matching the approved [WEAPON ID]'s ivory and charcoal outer surfaces: a few irregular ivory paper chips, two dark angular casing chips, and smaller ink flecks. Each fragment is visually separate with generous transparent space, no overlap, no weapon assembly or internal parts. Strong readable silhouettes. No shadows, background, labels or explosion. These will be cropped into separate visual particles after review.

**Optional shatter burst — six frames**

> A small stylized ivory-paper and charcoal-ink burst: compressed cluster, rapid outward spread, maximum spread, thinning fragments, fading flecks, nearly gone. Fixed center and canvas; transparency between pieces. Cosmetic game effect only; no complete weapon, background or text.

Use the fragments as independent rotating particles; the flipbook adds only a brief central accent. Never replace the entire game view with the shatter image.

## 6. Combat effect library

Generate one effect per request, using the shared style/transparency instructions. For every sequence, keep its emission point and canvas fixed. The last visual frame should fade close to nothing; the engine can finish the fade and remove it.

| Asset | Copy-ready effect prompt |
| --- | --- |
| sparks_gold | Six phases of a compact golden contact-spark burst: sharp ignition, expanding thin spokes, fragment spread, falling tiny sparks, dim remnants, nearly vanished. Transparent gaps; no object or target. |
| impact_ink | Five phases of a graphic scarlet ink impact star with a small ivory center: contact, peak, outward droplets, reduced droplets, fading remnants. No creature or anatomy, no ground. |
| smoke_curl | Eight phases of a small curling ivory-gray smoke puff with charcoal sketch detail, expanding gently and becoming transparent. No black matte, glow or lighting baked into empty space. |
| blaster_bolt | One cyan energy bolt with opaque white core and short turquoise tail, axis horizontal, isolated; plus a separate small halo image. No impact or environment. |
| blaster_impact | Eight phases of a cyan-white impact pulse with violet ink shards: contact, growing ring, peak, split ring, dispersal, thinning, fade, almost gone. Keep transparent spaces between arcs. |
| grenade_blast | Eight phases of a golden-orange graphic explosion, ivory smoke and charcoal paper flecks, from tight ignition to breakup and fade. Fixed origin, full silhouette contained; no ground, creatures or scenery. |
| shell | One tiny stylized gold-and-ivory ejected case, clean profile, opaque object on transparency; no flash or smoke. |
| knife_projectile | Four isolated views of the approved thrown knife rotating about its long axis, identical length and grip design, centered fixed canvas, no hand or trail. |
| grenade_projectile | Four isolated rotation views of the approved grenade prop, same silhouette and palette, no hand or effects. |
| hit_mark | One small scarlet comic ink decal with transparent holes and a bold irregular shape, no ground texture or shadow. |

Long straight tracers, ropes, trails and shockwave expansion should usually be runtime lines/ribbons/rings using these small textures. Do not request hundreds of nearly identical long images.

## 7. Monster canonical images

Choose and approve one before animating. Supply the shared art direction and cutout instructions.

**Runner**

> One full-body ink creature for a fast arcade shooter, lean forward-running silhouette, long but anatomically coherent limbs, ivory mask-like face, charcoal torso, small turquoise chest marking, recognizable asymmetrical shoulder patch. A graphic creature, not a human photograph. Neutral upright ready pose viewed straight from the front at torso-height camera, feet visible, arms separated from torso, identical line detail suitable for repeated animation. Bottom-center foot pivot, consistent body height, no environment or ground shadow.

**Brute**

> One full-body heavy ink creature in Paper's style: broad shoulders, compact strong legs, large ivory faceplate, charcoal body and a violet shoulder marking. Readable slow powerful silhouette distinct from the runner. Front neutral stance, feet and hands fully visible, fixed bottom-center foot pivot, no props, environment or shadow.

**Leaper**

> One full-body crouched ink creature in Paper's style: springy hind legs, compact torso, ivory angular face and turquoise forearm accents. Clear separation between limbs, ready to leap. Front neutral crouch at a fixed torso-height camera, full silhouette visible with spare space above for a future jump. No background or shadow.

## 8. Monster motion and directional views

Begin with front-view running, attacking, hit and dissolve. Prove gameplay before requesting all angles. Supply the same approved canonical reference in every request.

**Eight-frame run loop, one direction per request**

> Reference is the approved [MONSTER ID]. Create eight consecutive frames of a coherent in-place fast run cycle viewed from [DIRECTION]. The camera is fixed at torso height. The creature's body heading stays fixed; do not turn it during the sequence. Show alternating contact, compression, passing and flight poses with readable arm counter-swing. Frame 8 continues smoothly into frame 1 without duplicating it. Preserve proportions, markings, limb count and face exactly. Keep a stable bottom-center root anchor and unchanged canvas/scale. Natural center-of-mass motion is allowed but no drifting or arbitrary recentering. No translating across the canvas, scenery, dust or motion blur. Leave margins for all poses.

Run at an initial 12–16 art fps; movement remains smooth at the game's render rate. Tune gait playback to actual travel speed and keep attacks readable.

Direction convention: `front` = looking directly at the face; `back` = looking at its back. `front_right`, `right`, etc. name the side of the creature's body visible to the viewer, not the viewer's screen-right. Record camera positions/angles in metadata to remove ambiguity. Generate the same eight phase poses for all directions:

`front`, `front_right`, `right`, `back_right`, `back`, `back_left`, `left`, `front_left`.

Eight directions × eight run poses = **64 run images per monster**, before any other states. Plan this volume explicitly. Do not request all three monsters with every animation and camera angle in one giant generated sheet.

**Attack — six frames**

> Approved [MONSTER ID], viewed from [DIRECTION]. Six ordered in-place attack poses: alert, anticipation, windup, strike peak, follow-through, recovery. Same root location, size, identity and camera. Telegraph the action clearly. Keep feet anchored where physically plausible. No victim, blood, impact spark or scenery. Preserve room for extended limbs.

**Hit reaction — three frames**

> Approved [MONSTER ID], viewed from [DIRECTION], three brief poses: recoil, maximum stagger, recovery toward neutral. No design changes, missing limbs or baked impact. Stable root/canvas and full silhouette.

**Defeat — six frames**

> Approved [MONSTER ID], viewed from [DIRECTION], six consecutive stylized defeat phases: body buckles, crouches, breaks into paper-and-ink fragments, fragments spread, fragments thin, almost vanished. Graphic non-anatomical dissolve, no realistic injury. Stable ground-contact origin and full transparent canvas; no floor or environment.

**Leap — six frames**

> Approved leaper creature, viewed from [DIRECTION], six coherent poses: compression, takeoff extension, rising tucked pose, airborne apex, descending extended pose, landing compression. Keep the creature's root registration consistent across the canvas; actual vertical travel is driven by game physics. No ground, dust or baked trajectory.

**Elevated view set — later expansion**

> Re-render the approved [MONSTER ID] and its already-approved [STATE] phase poses from a camera elevated about 35 degrees looking down, keeping its body heading and geometry consistent with the reference. Repeat for [DIRECTION]. Same animation phase order and world-scale proportions. These frames are for a player looking down during a superjump; do not turn the creature into a new design or include the ground.

Start with an elevated front run loop and expand based on actual playtesting. Close overhead combat may require more coverage; a single flat sprite cannot supply arbitrary new viewpoints.

## 9. Monster scenes WITH backgrounds

These satisfy the visual-development need for full monster scenes. They are mood/concept references or separate intro art; do not use them as moving enemy textures.

> Full 16:9 Paper gameplay concept, one approved runner sprinting toward the viewer through a hand-drawn arena, ivory paper sky, turquoise distant towers, violet shadows, black-and-white crates and golden dust accents. Strong running pose, clear foot contact, directional motion in a few graphic streaks, sharp face and silhouette. Keep scene composition readable. Include a complete environment background; no HUD, labels or typography. Match the approved monster design. This image is a scene reference, not a transparent sprite.

For gameplay, generate the same monster separately on transparency using section 8 and generate the background without it using section 11. A rectangular background attached to a moving enemy will expose the trick immediately.

## 10. Superpower art

| Asset | Prompt |
| --- | --- |
| dash_streak | Four thin turquoise-and-ivory tapered streak textures, each isolated and separated, long axis horizontal, soft alpha taper and small ink breaks, no full-screen vignette. Runtime controls direction, length and lifetime. |
| jump_ring | Six phases of a flat radial turquoise launch ring viewed straight down, white core and sketchy outer edge; transparent inside/outside, fixed center. Designed to map onto a ground-facing plane. |
| landing_dust | Six side-view phases of a low outward ivory-gray dust puff, compressed origin at bottom center, spreading left/right and fading, no baked ground/shadow. |
| melee_arc | Four phases of a curved ivory-and-gold slash crescent with sharp leading edge and fading tail, isolated transparent texture, no hand or knife. |
| grapple_anchor | One small turquoise-and-ivory circular energy clasp marker with a clear center, bold ink edge, no scenery or text. |
| rope_strip | One narrow ivory-and-charcoal rope/ribbon texture, vertically seamless along its length, transparent outside edges, no knots or endpoints. Engine maps it along the simulated rope. |

Afterimages can reuse a tinted copy of the current sprite; shockwaves can expand a ring; falling paper can use rotating fragment sprites. Generate a few strong reusable textures instead of one image for every instant.

## 11. Scenery as separate layers

Use the shared style but exclude foreground objects not requested. Do not generate a complete perspective floor and then stretch it into a surface texture.

**Opaque sky panorama**

> Wide warm-ivory paper sky with subtle turquoise ink clouds, no ground, buildings, creatures, weapons, text or sun flare. Smooth horizontal visual rhythm, matching left and right edges for a wraparound background. No transparency required. Keep horizon region quiet. The result will be checked for a visible seam; do not assume seamlessness solely from the prompt.

**Far skyline — transparent**

> Wide distant skyline silhouette of irregular paper towers, muted turquoise and violet ink, consistent distant atmospheric contrast, irregular architectural top edge, opaque skyline shapes on actual transparency, no sky, foreground ground, monsters or weapons. Low detail, intended to sit beyond the reachable arena.

**Mid-distance ruins — transparent**

> Separate hand-drawn violet-gray ruined wall silhouettes and arched bridges viewed from a consistent low arena viewpoint, clear silhouettes, no creatures, foreground floor or sky. Wide separated cards with transparent margins, no overlapping pieces or baked contact shadows. These are scenery layers outside player reach.

**Floor tile — opaque**

> Seamlessly tiling top-down square texture of dark charcoal paper with sparse ivory scuffs and restrained violet ink mottling. Flat orthographic surface texture only, no perspective, horizon, objects, dramatic lighting or shadow. Even detail distribution, low enough contrast for enemy feet and impact decals to remain readable. Matching opposite edges; check tiling after generation.

**Wall material — opaque**

> Seamlessly tiling flat front-facing ivory paper masonry with restrained charcoal outlines, larger readable blocks and very subtle violet shading. Surface pattern only, no perspective, sky, props or cast shadows. Match opposite edges; avoid a single dominant central feature.

**Crate material — opaque**

> One square straight-on comic wooden crate face, ivory planks, bold charcoal diagonal bracing, restrained crosshatching, no background beyond the square surface, no perspective or cast shadow. Useful as the face texture of a simple runtime cube.

**Small decorative cutout props — transparent**

> One [barrel / broken sign / small stone cluster] in Paper's art style, neutral three-quarter exterior view, complete silhouette, actual transparent background, no ground shadow, labels or lettering. Strong readable shape with restrained detail.

Use a textured cube for near solid barrels/crates if players can circle them closely. Reserve single-view props for distant or view-constrained placements.

**Contact shadow**

> One soft irregular charcoal oval contact-shadow texture with a dark center and smooth alpha falloff to fully transparent edges. No object, light beam or background. Neutral top-down view, centered with generous transparent margin.

## 12. Minimum successful asset batch

Do not start with a 1,000-frame commission. Produce these first:

- One canonical shotgun still and four recoil frames.
- One canonical runner, eight front-run frames, six front-attack frames, three hit frames and six defeat frames.
- One four-frame shotgun flash, one six-frame spark effect, one contact shadow and one paper-fragment set.
- One floor tile, wall tile, crate face, sky and skyline.

This initial set tests alpha, sprite registration, combat timing, spatial depth and the paper style. It does not provide 360-degree enemy art. Add the other seven run directions before the unrestricted combat milestone, then fill attack directions/elevated views where gameplay exposes them.

## 13. Acceptance checklist for every asset batch

- Real alpha where required; no checkerboard, matte or transparent holes in white weapon surfaces.
- Same character/weapon across frames, correct limb/barrel count and stable lighting.
- No clipped pose, effects or extremities; constant scale and registered root/grip.
- Correct sequence order and explicit direction convention; no accidental repeated or missing poses.
- Muzzle and hit-event registration reviewed by a human or visual playback check.
- Readable silhouette at actual game size, clean edges on both bright and dark scenes.
- Packed atlas has verified rectangles, trim offsets, pivots, event times and padding.
- Every final asset has a source prompt/reference record; discarded attempts are not marked production-ready.
