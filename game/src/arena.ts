import * as THREE from "three";

export type Box = { half: number; height: number; x: number; z: number };
export type RayHit = {
  crate?: Box;
  distance: number;
  kind: "crate" | "floor" | "wall";
  normal: THREE.Vector3;
  owner: string;
  point: THREE.Vector3;
};

// One authoritative player body. feet is the ground contact point, not the
// camera eye. The eye is feet plus a fixed eye height, kept in main.ts.
export type PlayerBody = { feet: THREE.Vector3; height: number };

export function bodyTop(feetY: number, height: number): number {
  return feetY + height;
}

export function intervalsOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && bMin < aMax;
}

export function groundSupportY(x: number, z: number, radius: number): number {
  let support = 0;
  for (const crate of [...CRATES, ...BARRELS]) {
    const nearestX = Math.max(crate.x - crate.half, Math.min(crate.x + crate.half, x));
    const nearestZ = Math.max(crate.z - crate.half, Math.min(crate.z + crate.half, z));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    if (dx * dx + dz * dz <= radius * radius && crate.height > support) {
      support = crate.height;
    }
  }
  return support;
}

export function resolveBody(feet: THREE.Vector3, radius: number, height: number): void {
  const limit = ARENA_HALF - radius;
  feet.x = Math.max(-limit, Math.min(limit, feet.x));
  feet.z = Math.max(-limit, Math.min(limit, feet.z));
  const top = bodyTop(feet.y, height);
  for (const crate of [...CRATES, ...BARRELS]) {
    if (!intervalsOverlap(feet.y, top, 0, crate.height)) continue;
    const nearestX = Math.max(crate.x - crate.half, Math.min(crate.x + crate.half, feet.x));
    const nearestZ = Math.max(crate.z - crate.half, Math.min(crate.z + crate.half, feet.z));
    const dx = feet.x - nearestX;
    const dz = feet.z - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq === 0) {
      feet.x = crate.x + crate.half + radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    feet.x = nearestX + (dx / dist) * radius;
    feet.z = nearestZ + (dz / dist) * radius;
  }
}

export function segmentHitsExpandedRect(
  from: THREE.Vector3,
  to: THREE.Vector3,
  crate: Box,
  expand: number,
): boolean {
  // Shrink by a hair so a segment that only touches the expanded boundary
  // (for example, travelling along a corner edge) does not count as a hit.
  // A segment through the interior still hits.
  const eps = 0.01;
  const minX = crate.x - crate.half - expand + eps;
  const maxX = crate.x + crate.half + expand - eps;
  const minZ = crate.z - crate.half - expand + eps;
  const maxZ = crate.z + crate.half + expand - eps;
  let tMin = 0;
  let tMax = 1;
  const axes: [number, number, number, number][] = [
    [from.x, to.x - from.x, minX, maxX],
    [from.z, to.z - from.z, minZ, maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return tMax > 0 && tMin < 1;
}

export const ARENA_HALF = 12;
export const WALL_HEIGHT = 3;

export const CRATES: Box[] = [
  { half: 0.75, height: 1.5, x: -3, z: -2 },
  { half: 0.75, height: 1.5, x: 3, z: 1 },
  { half: 0.6, height: 1.2, x: 0, z: -6 },
  { half: 0.9, height: 1.8, x: -6, z: 4 },
  { half: 0.75, height: 1.5, x: 6, z: -5 },
];

// Explosive barrels are real boxes, not a texture on a crate. The working
// list is mutated when a barrel detonates or respawns, so collision, ray
// and pathing queries always see the live set.
export const BARREL_DEFS: Box[] = [
  { half: 0.55, height: 1.1, x: 4, z: -3 },
  { half: 0.55, height: 1.1, x: 7, z: -3 },
  { half: 0.55, height: 1.1, x: 10, z: -3 },
  { half: 0.55, height: 1.1, x: -7, z: -7 },
];

export const BARRELS: Box[] = BARREL_DEFS.map((box) => ({ ...box }));

export function buildArena(
  textures: Map<string, THREE.Texture>,
  env: {
    crates: string[];
    floor: { asset: string; repeat: [number, number] };
    wall: { asset: string; repeat: [number, number] };
  },
): THREE.Group {
  const group = new THREE.Group();
  const floorTexture = textures.get(env.floor.asset);
  if (floorTexture) {
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(env.floor.repeat[0], env.floor.repeat[1]);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ map: floorTexture ?? null }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = false;
  group.add(floor);

  const wallTexture = textures.get(env.wall.asset);
  if (wallTexture) {
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(env.wall.repeat[0], env.wall.repeat[1]);
  }
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture ?? null });
  const wallGeoLong = new THREE.BoxGeometry(ARENA_HALF * 2 + 1, WALL_HEIGHT, 0.5);
  const wallGeoShort = new THREE.BoxGeometry(0.5, WALL_HEIGHT, ARENA_HALF * 2 + 1);
  const walls: [THREE.BufferGeometry, number, number][] = [
    [wallGeoLong, 0, -ARENA_HALF - 0.25],
    [wallGeoLong, 0, ARENA_HALF + 0.25],
    [wallGeoShort, -ARENA_HALF - 0.25, 0],
    [wallGeoShort, ARENA_HALF + 0.25, 0],
  ];
  for (const [geo, x, z] of walls) {
    const wall = new THREE.Mesh(geo, wallMaterial);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    group.add(wall);
  }

  for (let i = 0; i < CRATES.length; i += 1) {
    const crate = CRATES[i];
    const variant = textures.get(env.crates[i % env.crates.length]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(crate.half * 2, crate.height, crate.half * 2),
      new THREE.MeshStandardMaterial({ map: variant ?? null }),
    );
    mesh.position.set(crate.x, crate.height / 2, crate.z);
    group.add(mesh);
  }
  return group;
}

export function resolveCircle(pos: THREE.Vector3, radius: number): void {
  const limit = ARENA_HALF - radius;
  pos.x = Math.max(-limit, Math.min(limit, pos.x));
  pos.z = Math.max(-limit, Math.min(limit, pos.z));
  for (const crate of [...CRATES, ...BARRELS]) {
    const nearestX = Math.max(crate.x - crate.half, Math.min(crate.x + crate.half, pos.x));
    const nearestZ = Math.max(crate.z - crate.half, Math.min(crate.z + crate.half, pos.z));
    const dx = pos.x - nearestX;
    const dz = pos.z - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq === 0) {
      pos.x = crate.x + crate.half + radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    pos.x = nearestX + (dx / dist) * radius;
    pos.z = nearestZ + (dz / dist) * radius;
  }
}

function slabHit(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  minY: number,
  maxY: number,
): number | null {
  let tMin = 0;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [origin.x, dir.x, minX, maxX],
    [origin.y, dir.y, minY, maxY],
    [origin.z, dir.z, minZ, maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

function faceNormal(
  point: THREE.Vector3,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  minY: number,
  maxY: number,
): THREE.Vector3 {
  const candidates: [number, THREE.Vector3][] = [
    [Math.abs(point.x - minX), new THREE.Vector3(-1, 0, 0)],
    [Math.abs(point.x - maxX), new THREE.Vector3(1, 0, 0)],
    [Math.abs(point.z - minZ), new THREE.Vector3(0, 0, -1)],
    [Math.abs(point.z - maxZ), new THREE.Vector3(0, 0, 1)],
    [Math.abs(point.y - minY), new THREE.Vector3(0, -1, 0)],
    [Math.abs(point.y - maxY), new THREE.Vector3(0, 1, 0)],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  return candidates[0][1];
}

export function rayHitSolid(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDistance: number,
): RayHit | null {
  let best: RayHit | null = null;
  const consider = (
    distance: number | null,
    kind: "crate" | "wall",
    owner: string,
    crate: Box | undefined,
    bounds: [number, number, number, number, number, number],
  ) => {
    if (distance === null || distance > maxDistance) return;
    if (best && distance >= best.distance) return;
    const point = origin.clone().addScaledVector(dir, distance);
    best = {
      crate,
      distance,
      kind,
      normal: faceNormal(point, ...bounds),
      owner,
      point,
    };
  };
  for (const crate of CRATES) {
    consider(
      slabHit(
        origin,
        dir,
        crate.x - crate.half,
        crate.x + crate.half,
        crate.z - crate.half,
        crate.z + crate.half,
        0,
        crate.height,
      ),
      "crate",
      `crate(${crate.x},${crate.z})`,
      crate,
      [crate.x - crate.half, crate.x + crate.half, crate.z - crate.half, crate.z + crate.half, 0, crate.height],
    );
  }
  for (const barrel of BARRELS) {
    consider(
      slabHit(
        origin,
        dir,
        barrel.x - barrel.half,
        barrel.x + barrel.half,
        barrel.z - barrel.half,
        barrel.z + barrel.half,
        0,
        barrel.height,
      ),
      "crate",
      `barrel(${barrel.x},${barrel.z})`,
      barrel,
      [barrel.x - barrel.half, barrel.x + barrel.half, barrel.z - barrel.half, barrel.z + barrel.half, 0, barrel.height],
    );
  }
  const h = ARENA_HALF;
  consider(slabHit(origin, dir, -h - 0.5, h + 0.5, -h - 0.5, -h, 0, WALL_HEIGHT), "wall", "wall-south", undefined, [-h - 0.5, h + 0.5, -h - 0.5, -h, 0, WALL_HEIGHT]);
  consider(slabHit(origin, dir, -h - 0.5, h + 0.5, h, h + 0.5, 0, WALL_HEIGHT), "wall", "wall-north", undefined, [-h - 0.5, h + 0.5, h, h + 0.5, 0, WALL_HEIGHT]);
  consider(slabHit(origin, dir, -h - 0.5, -h, -h - 0.5, h + 0.5, 0, WALL_HEIGHT), "wall", "wall-west", undefined, [-h - 0.5, -h, -h - 0.5, h + 0.5, 0, WALL_HEIGHT]);
  consider(slabHit(origin, dir, h, h + 0.5, -h - 0.5, h + 0.5, 0, WALL_HEIGHT), "wall", "wall-east", undefined, [h, h + 0.5, -h - 0.5, h + 0.5, 0, WALL_HEIGHT]);
  return best;
}

export function rayHitSurface(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDistance: number,
): RayHit | null {
  const solid = rayHitSolid(origin, dir, maxDistance);
  if (dir.y < -1e-9 && origin.y > 0) {
    const floorT = -origin.y / dir.y;
    if (floorT > 0 && floorT <= maxDistance) {
      const point = origin.clone().addScaledVector(dir, floorT);
      if (Math.abs(point.x) <= ARENA_HALF && Math.abs(point.z) <= ARENA_HALF) {
        if (!solid || floorT < solid.distance) {
          return {
            distance: floorT,
            kind: "floor",
            normal: new THREE.Vector3(0, 1, 0),
            owner: "floor",
            point,
          };
        }
      }
    }
  }
  return solid;
}

export function decalFitScale(hit: RayHit, radius: number): number {
  const crate = hit.crate;
  if (!crate) return 1;
  let edgeDistance = Infinity;
  if (hit.normal.y === 1) {
    edgeDistance = Math.min(
      hit.point.x - (crate.x - crate.half),
      crate.x + crate.half - hit.point.x,
      hit.point.z - (crate.z - crate.half),
      crate.z + crate.half - hit.point.z,
    );
  } else if (hit.normal.x !== 0) {
    edgeDistance = Math.min(
      hit.point.z - (crate.z - crate.half),
      crate.z + crate.half - hit.point.z,
      hit.point.y,
      crate.height - hit.point.y,
    );
  } else if (hit.normal.z !== 0) {
    edgeDistance = Math.min(
      hit.point.x - (crate.x - crate.half),
      crate.x + crate.half - hit.point.x,
      hit.point.y,
      crate.height - hit.point.y,
    );
  }
  if (!Number.isFinite(edgeDistance)) return 1;
  return Math.max(0.3, Math.min(1, edgeDistance / radius));
}

export function segmentBlockedByCrate(from: THREE.Vector3, to: THREE.Vector3): Box | null {
  const dir = to.clone().sub(from);
  const length = Math.hypot(dir.x, dir.z);
  if (length === 0) return null;
  dir.divideScalar(length);
  for (const crate of [...CRATES, ...BARRELS]) {
    const d = slabHit(
      from,
      dir,
      crate.x - crate.half,
      crate.x + crate.half,
      crate.z - crate.half,
      crate.z + crate.half,
      0,
      crate.height,
    );
    if (d !== null && d < length) return crate;
  }
  return null;
}
