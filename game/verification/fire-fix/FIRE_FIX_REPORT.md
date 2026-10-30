# Shotgun fire orientation fix

Harness: `verify.mjs`, headless Chromium cached 1248, vite preview on 127.0.0.1:5176.
Final run: 13/13 PASS. The first run was 10/13, and all three failures were
harness faults, not game faults, fixed in the harness and rerun green. Details
are at the end of this report.

## What was changed

- `game/assets.json`, edited. The shotgun_fire clip is now the 5 diagonal
  frames only. The 6 old vertical frame entries were removed from the manifest,
  and the old vertical files were deleted from `game/public/assets/`. No old
  vertical fire id remains in code or manifest.
- `game/public/assets/weapons/shotgun/frames/shotgun_fire_diag_01.png` to
  `shotgun_fire_diag_05.png`, new. These are the parent-delivered diagonal
  frames, cleaned by `clean_diag.py` in this folder. Each delivered frame
  carried stray fragments of neighbouring figures at the canvas edges, 2 to 3
  fragments per frame, 3,614 to 20,160 px each. The script keeps only the
  largest connected component, so the main gun is pixel-identical and each
  cleaned frame has exactly 1 component above 500 px. Without that step the
  stray barrel and hand fragments would have shown in game at the frame edges.
- `game/src/weapon.ts`, edited. Fire plane aspect changed from 468/912 to
  640/912 in both the geometry and the muzzle-node calculation, and rotation
  compensation was added to the fire mesh only. The idle mesh is untouched.
- Nothing else was changed. No new media was generated. Nothing under
  `output/` was used.

## Clip, timings, and muzzle estimates

Measured from the manifest. Clip total is 270 ms, shot and flash events at
0 ms, fire cooldown 750 ms independent, and the clip ends at near idle
frame 4, after which the game returns to the existing diagonal idle mesh.
There is no exact-idle fire frame, by design, and no claim of 6 fire frames
is made.

- Frame 0, kick, 50 ms, muzzle [0.137, 0.155].
- Frame 1, maximum recoil, 60 ms, muzzle [0.126, 0.137].
- Frame 2, partial recovery, 60 ms, muzzle [0.103, 0.083].
- Frame 3, further recovery, 50 ms, muzzle [0.113, 0.092].
- Frame 4, near idle, 50 ms, muzzle [0.135, 0.101].

Muzzle method, measured from the artwork geometry, not eyeballed alone: for
each frame the largest component was isolated, and the centroid of its
topmost 15 and 25 rows was averaged. That strip spans both barrel tips, so
its centroid sits between the two muzzle ovals. Estimated accuracy is about
plus or minus 0.03. Verification: `review-fire-frame0.png` shows the gold
muzzle marker sitting between the two muzzle ovals on frame 0, and the dark
and checker cells in the same capture show the frame 4 marker on its barrel
tip. Review stepping labels are frame 0 to frame 4, 50, 60, 60, 50, 50 ms.

## Rotation compensation: added, and why

Measured from screenshots, estimated from barrel tip to grip pixel
coordinates. Before compensation, the idle gun was about 38 degrees above
horizontal and the uncompensated diagonal fire gun was about 60 degrees, a
mismatch of about 22 degrees, above the 10 degree threshold in the task.
So compensation was added: the fire mesh alone rotates an extra 0.38 radians
(about 22 degrees) on top of the shared recoil, sway, and sprint rotation,
pivoted on the grip anchor at normalized [0.75, 0.77] in the frame, so the
grip world position is unchanged by the rotation. Scale is included in the
grip calculation. After compensation, `fire-mid.png` shows the fire gun at
about 43 degrees against idle at about 38 degrees, a mismatch of about
5 degrees, inside the threshold. The grip stays at the bottom right of the
gun in both shots. The fire gun still sits higher than idle because its
plane is taller (1.6 against 1.15), which is position, not angle, and was
already true in batch 1.

## Verification results, final run 13/13

- Build: tsc and vite build pass. The 500 kB chunk warning remains, as before.
- Fire clip: fire frames 1, 2, 3, 4 seen, firing false at the end, flash off
  after the clip, flash frame end 5. Evidence: `fire-mid.png` for the
  diagonal in-clip pose, `fire-idle.png` for the returned idle pose.
- Run clip, two runners out of phase (frame 6 phase 0.82 against frame 2
  phase 0.32), attack damage 12 once, sprint still 1.000 and running 1.100,
  review stepping, kill, two shots plus reload to 6 ammo, crate-blocked shot
  with tracer to z 3.10, death and restart to health 100, full wave clear.
  Evidence: `p2-run.png`, `p2-view2.png`, `p2-attack.png`, `p2-sprint.png`,
  `p2-review.png`, `accept-dead.png`, `accept-wave.png`.

## Flash: what is proven and what is not

Measured: during a live shot the debug state reported flashOn true and
flashFrame advancing (frame 2 at the first read), and the harness records
flash off after the clip. `flash-held.png` shows the held flash burst
sitting on the barrel tip, which proves the flash mesh renders at the
muzzle node. A screenshot catching the live 100 ms burst at the fire muzzle
was not captured, because screenshot latency exceeds the burst duration:
the first flash screenshot showed the idle gun after the clip had already
finished. That live-burst screenshot is inconclusive, not claimed. The
flash position code path is identical for idle and fire muzzles, switching
on fireActive, so the held-muzzle evidence plus the live state evidence is
the basis for the flash claim, and the missing live screenshot is stated
here rather than hidden.

## First-run failures, all harness faults

- Fire frames empty: the first harness took the mid-fire screenshot before
  the sampling loop, pushing sampling past the 270 ms clip. The block was
  restructured to sample first, then take a second shot for the mid
  screenshot. No game code changed for this.
- Review fire frames failed with a ReferenceError: the node loop variable
  was referenced inside a browser evaluate without being passed in. Fixed
  by passing it as an evaluate argument.
- Wave clear timed out: long-range pellet spread made kills unreliable in
  the harness. The harness now steps the player to 5 units from the runner
  before shooting, still using the real game shot. No game aim or damage
  code changed for this.

## What still snaps or stayed inconclusive

- The fire gun position still jumps slightly on entering and leaving the
  clip, because the fire plane is taller and narrower than idle and its gun
  occupies the frame differently. Angle no longer snaps beyond about
  5 degrees, but position is not pixel-identical between idle and fire.
- Frame rate, smoothness, and animation feel are not claimed from headless
  rendering. They need real hardware eyes.
- Pointer-lock denial UI in a real browser is still unproven, as after
  Pass 1 and batch 1.
- Muzzle estimates for frames 1 to 4 rest on the same centroid method as
  frame 0 plus the review stepping labels. Only frame 0 and frame 4 were
  directly marker-checked in a screenshot.

## What was not changed

Animation player, run and attack clips, pivot handling, sprint behaviour,
reload, reset, startup states, Pass 1 pathing and height fixes, and the
`?debug=1` hook are untouched. Hit, defeat, reload, sprint pose, smoke,
spark, and shell frames were not built. Pass 3 and Pass 4 were not started.
All changes are uncommitted. Nothing was pushed, deployed, or published.
