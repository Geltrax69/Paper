# Paper vertical slice

First-person arena shooter slice. One shotgun. One runner monster, front view only. One wave of six runners. Built with Vite, TypeScript, and Three.js 0.186.0.

## Run and build

Run `npm install` once, then `npm run dev` for development, `npm run build` for a production build, or `npm run preview` to serve the built game on port 5174.

## Controls

WASD moves. Mouse aims. Left click fires the shotgun. R reloads. Shift sprints. Space jumps. Q dashes. Escape pauses. Click Start to enter pointer lock.

## Verification modes

`?view=1` renders the arena, shotgun overlay, and one runner from a fixed camera with no pointer lock. `?review=1` shows each runtime image on light, dark, and checker backgrounds with its pivot and muzzle point marked.

## Files

`src/main.ts` owns the loop, input, and phases. `src/assets.ts` owns the manifest, texture creation, and alpha logging. `src/arena.ts` owns the floor, crates, walls, and collision. `src/enemy.ts` owns the runner state machine. `src/weapon.ts` owns the first-person shotgun overlay, recoil spring, and muzzle flash sprite. `assets.json` is the real manifest for this slice.

## Runtime images

Only these four images are used at runtime, copied into `public/assets/` so Vite serves them from one consistent path.

- `public/assets/weapons/shotgun/shotgun_idle.png`, pivot bottom, muzzle attachment at [0.27, 0.36].
- `public/assets/monsters/runner/runner_front.png`, pivot at the feet, front view only.
- `public/assets/effects/muzzle_flash_shotgun.png`, centred radial flash.
- `public/assets/scenery/crate_face.png`, opaque crate texture.

Nothing under `output/` is used as a runtime texture. Those files are references only.

## Placeholders

These are procedural or missing, and are not claimed as final art.

- Impact sparks, tracers, and dust are procedural canvas and point effects.
- The floor grid, wall colour, and sky colour are procedural. There is no generated floor tile, wall tile, sky, or skyline image in this slice.
- The runner has one still frame. It has no run, attack, hit, or defeat frames, so telegraph is a tint and pulse, hit reaction is a tint, and death is an opacity fade, not an ink dissolve with paper fragments.
- There is no audio. No sound is claimed.
- There is no grapple, melee, superjump, weapon switching, second weapon, second monster, directional runner view, or second wave. Those are out of scope for this slice.
