# C03 weapon views fix, verification report

Result: 10/10 PASS in `verify.mjs` (headless Chromium, port 5187, run alone).
Build: `npm run build` passes (TypeScript plus Vite, the 695.63 kB single-chunk warning pre-exists and is not a failure).
Portable suite: `npm test` RESULT 23/23 PASS, exit 0, including post-warmup waves 5 and 6 stability and the 1920x1080 check.
Note: running `npm test` rewrote its own evidence folder, and that folder was restored with git checkout afterwards, so the only modified code files are `src/weapon.ts` and `src/main.ts`.

## Root causes, stated plainly

- Pistol. The old procedural canvas drew an upright weapon with one wide forearm trapezoid from the grip down to the bottom edge, and the slide and grip merged into that block. The result read as a flat white slab, not a pistol.
- Blaster. No switching bug was found. The C03 harness loop selected weapons in order and ended on shotgun, then took a screenshot named `weapon-blaster.png` after the loop. The screenshot was mislabelled evidence, not a failed switch.

## What changed

- `src/weapon.ts` owns the procedural redraw in `proceduralWeaponTexture`. Both views are canvas textures, not generated images, and that is stated here rather than implied.
- Pistol. Diagonal from lower right toward upper left, like the other weapons. Distinct slide and barrel with a turquoise sight and a gold dot, a muzzle line at the tip, slide serration marks near the rear, a separate grip with crosshatch, a hand with finger lines over the grip top, an open trigger guard loop with a trigger line inside, and a forearm entering the bottom edge with hatch shading.
- Automatic. Longer diagonal barrel and receiver, a dark violet fore-end, a larger curved magazine hanging below the receiver with curved lines, a separate stock and grip, a hand on the grip, and a forearm to the fore-end. It is distinct from the pistol by length, fore-end, and magazine, and distinct from the shotgun by its single barrel and magazine.
- `src/main.ts` owns only the muzzle coordinates in the weapon view table. No damage, interval, range, ammo, reload, projectile, ink pressure, cap, family, explosion, or pickup rule changed.

## Pivots and muzzles

Canvas size is 512 by 640 for both views, and the plane is 0.92 wide by 1.15 high, matching that aspect.
Pistol muzzle is [0.195, 0.203], from the barrel tip at canvas (100, 130).
Automatic muzzle is [0.107, 0.148], from the barrel tip at canvas (55, 95).
The old pistol muzzle was [0.8, 0.32] and the old automatic muzzle was [0.85, 0.29], both for the upright drawing, and both are now replaced.
Pivots are unchanged, because `setIdle` places the plane by the same bottom-anchored geometry as every other weapon, and the diagonal is drawn inside the canvas, like the shotgun idle.

## Screenshots, HUD versus view in the same frame

Each screenshot below was taken immediately after `selectWeapon` for that weapon, in the same harness step as its HUD read, so a later switch cannot relabel it.
Shotgun: `view-shotgun.png`, HUD Shotgun 6 / 6, view is the twin-barrel shotgun.
Pistol: `view-pistol.png`, HUD Pistol 12 / 12, view is the redrawn diagonal pistol. Close view: `view-pistol-close.png`, showing barrel, trigger guard, grip, hand, and forearm.
Automatic: `view-automatic.png`, HUD Automatic 30 / 30, view is the longer diagonal automatic with fore-end and magazine. Close view: `view-automatic-close.png`.
Blaster: `view-blaster.png`, HUD Blaster 8 / 8, view is the generated blaster with its turquoise and gold body, not the shotgun. This is the corrected capture for the C03 defect.
Knife: `view-knife.png`, HUD Throwing knife 6 / 6, view is the wrapped-handle knife.
Grenade: `view-throwable.png`, HUD Grenade 3 / 3, view is the stitched round grenade.

## Prior acceptance in this harness

Shotgun two shots use ammo 6 to 4.
Pistol shot deals 20 damage, runner health 36 to 16, unchanged.
No page or console errors.

## Honest limits

- The pistol and automatic views are procedural canvas drawings, and they still read simpler than the generated shotgun and blaster art. They now read as a pistol and an automatic at gameplay distance, and the close views show their parts, but they do not match the generated art in linework richness.
- The automatic magazine reads as a hanging part below the receiver, but at gameplay distance it can still be mistaken for a second grip, because the hand and magazine sit close together. That is a remaining roughness, not a hidden one.
- Real-hardware feel and frame rate are headless only, as before.
- The first harness run in this folder recorded 6 view FAILs from a wrong assertion, because it compared the HUD weapon id to the display name. The screenshots from that run were valid, the assertion was fixed to compare id plus the HUD ammo text prefix, and the rerun is 10/10. That first run is not a regression signal.
