# Paper vertical slice design sketch

Scope for this slice only. Not the full GAME_BUILD_PROMPT.
One shotgun. One runner monster, front view only. One wave. No other weapons, directions, or monsters yet.

## Data shape first

Asset is a registry entry, not scattered conditionals:

```ts
type Asset = { id: string; file: string; pivot: [number, number]; attachments?: Record<string, [number, number]> };
type Clip = { assetIds: string[]; loop: boolean; frameMs: number; events?: { timeMs: number; name: string }[] };
type Weapon = { id: "shotgun"; damage: number; pellets: number; spread: number; fireIntervalMs: number; ammo: number; clip: Clip };
type EnemyState = "spawn" | "pursue" | "telegraph" | "attack" | "hit" | "death";
type Enemy = { id: string; state: EnemyState; position: [number, number, number]; health: number; speed: number };
type GamePhase = "menu" | "playing" | "paused" | "dead" | "waveComplete";
```

Enemy behaviour is the state machine above. No second boolean that must stay in sync with state.
Weapons, enemies, and effects are looked up from registries in `assets.json`.

## File layout

- `game/package.json`, `game/vite.config.ts`, `game/index.html`
- `game/src/main.ts` (loop, input, phases)
- `game/src/assets.ts` (manifest loading, texture creation, alpha check logging)
- `game/src/arena.ts` (floor, crates, collision proxies, sky)
- `game/src/enemy.ts` (runner state machine, foot-anchored billboard, contact shadow)
- `game/src/weapon.ts` (first-person shotgun overlay, recoil spring, muzzle flash sprite)
- `game/public/assets/` is a copy of the approved `assets/` images used at runtime, or Vite serves them from `assets/` via import. Pick one path and use it everywhere.
- `game/assets.json` (the real manifest for this slice, following ASSET_MANIFEST_EXAMPLE.json conventions)

## Rules for this slice

- Three.js version is pinned in `game/package.json` and checked before any API use.
- Existing gameplay boards in `output/` and the shotgun turnaround in `output/shotgun/` are references only. They are never runtime textures.
- Shotgun is a first-person overlay with a bottom pivot, kept clear of the reticle. Flash is a separate sprite at the recorded muzzle attachment.
- Runner is a foot-anchored upright textured quad, billboarded around the vertical axis, feet on the floor, with a separate ground contact shadow.
- Crates are depth-writing cubes with the crate texture. A runner behind a crate must be occluded. Walls and crates block movement and shots.
- Effects beyond the flash are procedural and clearly marked as placeholders in the README. No fake AI effect is claimed.
- A test mode must exist for verification without pointer lock. Example: `?view=1` renders the arena, shotgun, and a runner from a fixed camera, with no pointer lock required. The normal game still uses pointer lock after Start.
- An asset review view must exist outside gameplay. Example: `?review=1` shows each runtime image on light, dark, and checker backgrounds with its pivot and muzzle point marked.

## Throughput checkpoint

- Blocking first steps: generate the four slice images, check their alpha channels and dimensions, pin Three.js, write this sketch.
- Independent workstreams: none in parallel. The game build depends on the images, so it runs after them.
- Shared mutable state: the Paper working tree is owned by one implementation delegate at a time. The parent does not edit game files while the delegate runs.
- Smallest safe decomposition: one worker is best. Assets, manifest, rendering, collision, and enemy state are interdependent, and splitting them would create integration churn.
