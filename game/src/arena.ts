import * as THREE from "three";

export type Box = { half: number; height: number; x: number; z: number };
export type RayHit = { distance: number; kind: "crate" | "wall"; point: THREE.Vector3 };

export const ARENA_HALF = 12;
export const WALL_HEIGHT = 3;

export const CRATES: Box[] = [
  { half: 0.75, height: 1.5, x: -3, z: -2 },
  { half: 0.75, height: 1.5, x: 3, z: 1 },
  { half: 0.6, height: 1.2, x: 0, z: -6 },
  { half: 0.9, height: 1.8, x: -6, z: 4 },
  { half: 0.75, height: 1.5, x: 6, z: -5 },
];

export function buildArena(crateTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = 256;
  floorCanvas.height = 256;
  const ctx = floorCanvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f0e7d2";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(60,50,40,0.18)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(12, 12);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
    new THREE.MeshStandardMaterial({ map: floorTexture }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = false;
  group.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd8cdb4 });
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

  const crateMaterial = new THREE.MeshStandardMaterial({ map: crateTexture });
  for (const crate of CRATES) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(crate.half * 2, crate.height, crate.half * 2),
      crateMaterial,
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
  for (const crate of CRATES) {
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

export function rayHitSolid(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDistance: number,
): RayHit | null {
  let best: RayHit | null = null;
  const consider = (distance: number | null, kind: "crate" | "wall") => {
    if (distance === null || distance > maxDistance) return;
    if (best && distance >= best.distance) return;
    best = {
      distance,
      kind,
      point: origin.clone().addScaledVector(dir, distance),
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
    );
  }
  const h = ARENA_HALF;
  consider(slabHit(origin, dir, -h - 0.5, h + 0.5, -h - 0.5, -h, 0, WALL_HEIGHT), "wall");
  consider(slabHit(origin, dir, -h - 0.5, h + 0.5, h, h + 0.5, 0, WALL_HEIGHT), "wall");
  consider(slabHit(origin, dir, -h - 0.5, -h, -h - 0.5, h + 0.5, 0, WALL_HEIGHT), "wall");
  consider(slabHit(origin, dir, h, h + 0.5, -h - 0.5, h + 0.5, 0, WALL_HEIGHT), "wall");
  return best;
}

export function segmentBlockedByCrate(from: THREE.Vector3, to: THREE.Vector3): Box | null {
  const dir = to.clone().sub(from);
  const length = Math.hypot(dir.x, dir.z);
  if (length === 0) return null;
  dir.divideScalar(length);
  for (const crate of CRATES) {
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
