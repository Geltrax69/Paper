# Paper — remaining work to fix and finish

**Checked against `main` at `170b950`, 31 October 2026.** No newer commits were available at the last pull. Runtime code remains at the `6f109f2` implementation; the later commit added audit/prompt/art documents. All tasks below are still open. This file is an implementation checklist, not a claim that the fixes have been applied.

## Start here

The game builds and starts. Shooting, ammo refill, pause, runner animation and closer-gun sprint already work. **Do not rebuild those systems from scratch.** Fix the remaining behavior defects, then make the actual game match the original ink artwork.

| Order | Work | Exit condition |
| --- | --- | --- |
| 1 | Melee reach, grounding, grapple targeting and release | Correct predictable movement/combat, with regression checks. |
| 2 | Matching world, one coherent gun, runner animation and comic UI | One complete playable scene looks like the original boards in motion. |
| 3 | Impacts, accessibility, asset budgets and portable tests | Feedback remains clear, scalable and verifiable. |
| 4 | More monster families, weapons and one new mechanic | Expand using the proven pipeline, not placeholders presented as finished content. |

Use these detailed supporting documents:

- [Game, animation, UI and combat implementation prompt](docs/PUNCHY_INK_GAME_PROMPT.md)
- [Image prompts and all 40 optimization techniques](docs/PUNCHY_INK_ASSET_PROMPTS.md)
- [Original visual authority](output/gameplay/01-shotgun-pistols.png) and [new illustrated target](output/punchy-ink-v2/gameplay-ui-target.png)
- [Candidate-art QA notes](output/punchy-ink-v2/README.md): the monster sheet is mixed key poses, not a run cycle; the FX sheet needs terminal fade correction and registration before runtime use.

## Batch 1 — fix gameplay correctness first

### N03 — P1: melee reaches enemies far below the player

- [ ] Fix the damage query in `game/src/main.ts:619–637`.

**Reproduced:** a ground runner lost health `36 → 18` while player feet were approximately **9.52 m above the floor**, looking down. The query uses horizontal distance plus aim/obstruction, without a bounded 3D attack volume.

**Change:** define a world-space melee origin/volume with actual reach and vertical limits. Check target body intersection and solid obstruction at the strike event. Keep once-per-swing/per-target damage, including when low frame rates cross several animation frames. Do not let looking down extend the arm vertically.

**Done when:** the overhead reproduction deals no damage; a close valid strike deals 18 once; crate cover blocks it; valid aerial melee uses the same documented bounded reach. Preserve the existing windup, cooldown and recovery.

### N04 — P1: player remains grounded after walking off a crate

- [ ] Fix support/grounding transitions in `game/src/main.ts:1568–1607`.

**Reproduced:** start on crate `(3,1.5,1)`, strafe right; at approximately `(4.92,1.16,1)` the player is falling above floor height zero but `grounded=true` and `coyoteMs=100`.

**Change:** derive support/contact every step. Clear grounded on loss of support; start coyote time once on the grounded-to-airborne transition, rather than refreshing it while falling. Require appropriate foot-height/contact tolerance or swept landing, not merely feet below a possible support height. Reset the air-jump allowance only on a genuine landing.

**Done when:** walking off a ledge immediately becomes airborne; the coyote window expires; a third midair jump cannot be gained from a false reset; landing audio/dust fires once. Keep ordinary jumping and crate-top landings working.

### N05 — P2: grapple can choose an anchor behind the camera

- [ ] Replace nearest-only candidate selection in `game/src/main.ts:495–515`.

**Reproduced:** at `(0,0,9)` facing negative Z, E attaches to `(0,2.8,11)` behind the view, rope length about 3.44. This is current selection behavior, not a JavaScript exception.

**Change:** filter by a visible aim cone, range and clear line of sight. Rank reticle angle before world distance, add selection stability, and show the exact available/blocked anchor. Use the same candidate for the cue and the attachment action.

**Done when:** aiming at a visible valid anchor predictably attaches there; E does not unexpectedly select behind the player; walls/crates still block acquisition.

### N06 — P2: grapple release loses useful momentum

- [ ] Rework release velocity at `game/src/main.ts:523–533,1545–1558`.

**Source-confirmed:** release sets momentum Y to zero, applies horizontal movement for 400 ms and damps it sharply. The old powers report measured only small release drift; that historical value is not a fresh measurement from this check.

**Change:** keep authoritative world velocity, remove/limit the rope's radial velocity appropriately and preserve tangential/vertical release motion. Apply consistent air steering/drag, swept collision and rope obstruction detach. Avoid a separate arbitrary displacement timer that fights normal movement.

**Done when:** releasing at different swing phases creates predictable arcs and meaningful carry; pumping, landing and wall collision work at varied frame rates. Verify actual feel on real hardware, not only an active momentum flag.

## Batch 2 — make one complete scene match the images

### N01 — P1: world and monster art do not match the original style

- [ ] Correct environment assets/mapping in `game/src/arena.ts:110–149`, `game/src/environment.ts:6–53`, `game/assets.json` and the relevant runtime textures.
- [ ] Approve a consistent original-style runner identity before making more variants.

**Current mismatch:** pale tiled courtyard, giant overhead cream sky shapes, beige walls and smooth masked characters. **Target:** dark violet-black ink ground, open ivory/cyan atmosphere, turquoise distant towers, layered fortress silhouettes, expressive charcoal/ivory creatures and controlled golden highlights.

**Change:** replace the wrong floor/sky/material art, not just its saturation. Use an actual seam/pole-checked equirectangular sky or another suitable sky treatment. Keep skyline/ruins as separate depth layers with coherent scale and horizon. Use dark resting areas around clear enemy silhouettes and a quiet aiming region. Preserve real floor/platform/cover geometry and collision.

**Done when:** actual gameplay captures at 1280×720 and 1920×1080 match the reference palette, depth and silhouettes. Looking up does not resemble a giant painted ceiling. A generated poster is a target, not proof of completion.

### N02 — P1: gun changes shape when firing; reload has no hand animation

- [ ] Replace incompatible shotgun art and extend `game/src/weapon.ts:223–245,278–283,299–325` plus manifest metadata.

**Current mismatch:** idle/fire use different-looking barrel/receiver proportions and hand framing. Fire exposes cutoff wrists. A hardcoded 0.38-radian fire-mesh compensation cannot fix a different drawing. Reload is still a timer-driven dip of the idle image.

**Change:** approve one canonical shotgun matching the original board. Produce consistent idle/fire/reload/sprint poses with complete forearms, common grip registration and per-frame muzzle/ejection attachments. Use layered transforms for recoil/sway/sprint and a few real silhouette-changing poses for hands/reload. Replace art-specific dimensions/orientation patches with metadata where feasible.

Add explicit action priority and reload interruption rules. Trigger one ammo-transfer event at the correct pose; pause/resume or a long time step must not duplicate it. Preserve the existing actual-speed-driven sprint scale around 1.1; refine its matching arm pose rather than implementing it again.

**Done when:** no identity change, hand pop, floating wrist or muzzle drift between states. Reload visibly progresses through anticipation, interaction, regrip and recovery. Sprint/landing/fire blend cleanly without blocking the reticle.

### N07 — P2: monster direction and state transitions need continuity

- [ ] Fix view selection/registration in `game/src/enemy.ts:53–68,281–284,572–575` and associated clips/metadata.

**Remaining:** direct 45-degree rounding without hysteresis; front-only attack/defeat; hit switches to old idle art; root/ground measurements are partly hardcoded. The existing independent frame players and preserved run phase are good foundations.

**Change:** add angular hysteresis while retaining phase. Match identity, scale and foot/root registration across run/attack/hit/defeat. Use suitable directional art or prepared layered/weighted cutouts, adding elevated views when close aerial play exposes missing surfaces. Share rigs only within compatible anatomy. A single PNG is not automatically rigged.

**Done when:** no boundary flicker, wrong-side face, hit-state size pop, foot sliding or transparent joint holes. Separate shadows follow body/height. Review loops and direction changes at normal and slowed speed.

### N09 — P2: game UI needs an ink identity and real power feedback

- [ ] Restyle `game/index.html:9–35,63–79` and connect live status in `game/src/main.ts:1784–1835`.

**Change:** torn ivory combo card, brush-stamp wave indicator, readable ink-backed health/ammo, shell pips, restrained event-linked scale responses and a compact dash/air-jump/grapple/melee readiness strip. Keep numbers/text/state live and accessible; generated art supplies backing materials only.

Shorten the opening menu to Play, controls, Settings and optional Help/rules. Make help/settings scrollable and preserve focus/health semantics and the desktop keyboard/mouse notice. Add occasional localized KABAM/CRACK stamps only for real major events, not every pellet.

**Done when:** values and cooldowns are accurate, layout stays stable, center aim/telegraphs remain clear, and no UI panel competes with sprint gun placement. Narrow menus and zoom remain usable.

## Batch 3 — effects, controls and performance

### N10 — P2: contact marks must attach to surfaces

- [ ] Extend `RayHit` in `game/src/arena.ts:4` and replace camera-facing decal placement in `game/src/main.ts:407–424`.

**Change:** return contact normal and surface/owner; orient and offset pooled organic ink decals on the struck surface. Handle edges, z-fighting and destructible owners. Use separate airborne sparks instead of eye-facing circles pretending to be wall marks.

**Done when:** moving around a mark keeps it flush to the same wall/crate; it does not turn toward the eye or cross unrelated geometry.

### C01 — required content: localized punchy impacts and proper explosions

- [ ] Build a shared FX emitter/clip pipeline, plus one complete explosion interaction.

**Change:** reuse 3–5 flash designs and 5–8 shared spark/ring/ink/smoke/fragment textures. Drive transforms, emission, lifetime and palette procedurally. A heavy impact combines an angular flash, target-local ink star, a few fragments, contact audio and short recoil; group same-shot pellet feedback instead of flooding the screen.

Explosions need ignition, bloom, ring, outward fragments, smoke breakup and a genuinely fading terminal phase. Define damage radius, falloff, cover and chain-reaction policy separately from visual size. Use brief capped local hit-stop and adjustable shake for strong events, not repeated global freezes per pellet. Mark explosive barrels distinctly from ordinary cover.

**Done when:** effects originate at correct attachments/contacts, cover rules work, particles are pooled/capped, and an explosion is both a working game event and a readable animation. The current FX candidate sheet's bottom row is not an approved fading clip.

### N12 — P2: unify reduced-motion and flash behavior

- [ ] Apply a shared policy to camera shake at `game/src/main.ts:1674–1678`, WeaponView, HUD and new effects.

**Remaining:** reduced motion handles sprint/bob/streaks but damage camera translation uses shake strength without an explicit reduced-motion gate.

**Change:** suppress shake/roll/large zoom when reduced motion is on; separately respect flash strength and effect density. Retain readable danger, hit and cooldown cues without compulsory flashing or camera movement.

**Done when:** reduced-motion damage/explosions do not shake/roll the camera; zero flash removes bright flash layers; menus and critical telegraphs remain functional.

### N08 — P2: bound asset loading, texture memory and enemy count

- [ ] Rework `game/src/assets.ts:115–137`, wave population at `main.ts:702–708` and neighbor-query scaling.

**Current inventory:** 101 PNGs, 40,049,406 bytes; about 225.3 MiB estimated RGBA8 storage with full mipmaps, not measured driver memory. All assets load serially and undergo production alpha scans. Wave count grows without an active cap. Vite's 625.51 kB chunk advisory is a warning, not a build failure.

**Change:** keep high-resolution masters outside runtime budgets; export suitable gameplay sizes, pack with trim/pivot metadata and filtering gutters, load the core scene first and stream later families/weapons. Move alpha analysis to review/dev. Share static geometry/texture storage while keeping animation clocks independent. Add active-enemy/attack/transparent-effect caps and spatial queries. Profile before splitting the bundle; do not only hide its warning.

**Done when:** report startup bytes/time, frame time, draw calls and repeated-wave resource stability on named hardware/resolutions. New generated images do not automatically become eager downloads; elite/giant variants have proper collision/stats rather than arbitrary visual scaling.

### N11 — P2: provide a portable verification entry point

- [ ] Make historical browser harnesses configurable and expose a documented check command in `game/package.json`.

**Change:** parameterize browser executable, base URL, ports and output path instead of hardcoded Linux paths. Add focused regressions for melee reach, ledge grounding, grapple selection, action-event deduplication and disposal. Keep historical reports labeled and current docs accurate. README feature descriptions have already been updated; do not repeat that documentation change as unfinished.

**Done when:** another contributor can run the checks on a supported machine without editing absolute paths. Controlled debug setups are clearly distinguished from normal keyboard/mouse play and subjective real-device review.

## Batch 4 — content expansion after the matching slice works

### C02 — distinct monsters

- [ ] Ship runner + insect + brute first, then wraith/tentacle, winged beast, demon and regenerating mutant families as needed.

Each needs an approved silhouette/anatomy, 6–8 useful movement poses or prepared cutout articulation, distinct attack windup/recovery and fair counterplay. Use compatible controllers/rigs, not one runner recolored for every family. Add procedural appendages/breathing/head tracking only with art layers or geometry that support them. Reuse shadows, impacts, material masks and animation technology while preserving identity.

**Done when:** players can recognize the family and its attack without reading a label; state/view changes preserve identity; attacks obey reach, player height, cover and concurrency limits.

### C03 — additional weapons and one new mechanic

- [ ] Add pistol, automatic, blaster, knives and throwables in reviewed batches.
- [ ] Choose one new mechanic to finish first: ink-pressure spend, marked barrel chains or aerial style rewards.

Every weapon needs real switching, action/cooldown/ammo rules, matching hand poses, projectile/hit behavior and distinct feedback. A blaster needs traveling bolts; a grenade needs arc/fuse/explosion rules; a knife needs a separate world projectile. Do not label a shotgun reskin as a different implemented weapon. New meters/rewards must reflect actual game logic.

**Done when:** each added item supports a complete usable loop with input, consequences, clear UI, sound, cancellation/pause handling and tests. Proposed mechanics remain labeled as concepts until playable.

## Completion gate

- [ ] `npm run build` passes; normal loading/play produces no unexpected console/page/network errors.
- [ ] Reproduced reach/grounding defects are fixed; aimed grapple release and collisions are predictable.
- [ ] Actual runtime matches the original ink images at 1280×720 and 1920×1080.
- [ ] Run/fire/reload/sprint/attack/explosion have short normal-speed and slowed recordings, not screenshots alone.
- [ ] True alpha, opaque ivory, clean edges, frame order, root/grip/muzzle pivots, view phases and terminal fades are reviewed before atlas export.
- [ ] Pause/resume, missing-asset retry, pickups, wave clear, death/restart, blocked shots and reduced-motion settings work.
- [ ] Repeated waves/restarts settle at stable resource counts; performance is measured on named real hardware.
- [ ] Final assets, source candidates and illustration targets remain clearly separated; update this checklist only with evidence.

## Evidence and preserved behavior

The most recent smoke check at `170b950` confirmed no tested runtime errors, pointer lock, ammo `5 → 4 → 6`, pause and the three remaining reach/grounding/grapple reproductions. [Latest smoke results](game/verification/audit-2026-10-31/latest-smoke-results.json). Broader prior checks: [audit results](game/verification/audit-2026-10-31/results.json), [jump/retry follow-up](game/verification/audit-2026-10-31/followup-results.json), [current gameplay](game/verification/audit-2026-10-31/gameplay-desktop.png), [firing mismatch](game/verification/audit-2026-10-31/firing.png).

Preserve the already implemented pathing/body collision foundations, reset/focus cleanup, startup retry, separate render layers, per-instance animation clocks, muzzle obstruction checks, independent runner phases, geometry disposal, bounded base particles/decals, waves/score/pickups/audio and settings. The remaining list is **12 open audit items (N01–N12) plus three content groups (C01–C03)**; it does not reopen completed fixes.
