import * as THREE from "three";
import rawManifest from "../assets.json";

export type Asset = {
  alpha: boolean;
  attachments?: Record<string, [number, number]>;
  file: string;
  id: string;
  pivot: [number, number];
  rect: [number, number, number, number];
  size: [number, number];
  sourceSize: [number, number];
  trimOffset: [number, number];
};
export type ClipFrame = {
  attachments?: Record<string, [number, number]>;
  durationMs: number;
  id: string;
};
export type Clip = {
  assetIds: string[];
  events?: { name: string; timeMs: number }[];
  frameMs: number;
  frames?: ClipFrame[];
  loop: boolean;
};
export type Weapon = {
  ammo: number;
  clip: string;
  damage: number;
  fireClip: string;
  fireIntervalMs: number;
  flashClip: string;
  reloadClip: string;
  id: "shotgun";
  pellets: number;
  spread: number;
};
export type EnemySpec = {
  attackClip: string;
  attackDamage: number;
  attackKind: "strike" | "leap" | "slam";
  attackRange: number;
  clip: string;
  defeatClip: string;
  family: string;
  health: number;
  height: number;
  id: string;
  leapMs: number;
  leapSpeed: number;
  radius: number;
  recoveryMs: number;
  runClip: string;
  slamRadius: number;
  speed: number;
  telegraphMs: number;
};
export type Environment = {
  crates: string[];
  floor: { asset: string; repeat: [number, number] };
  ruins: { asset: string; cards: [number, number, number][]; height: number; width: number };
  sky: { asset: string };
  skyline: { asset: string; height: number; radius: number };
  wall: { asset: string; repeat: [number, number] };
};
export type Manifest = {
  assets: Record<string, Asset>;
  clips: Record<string, Clip>;
  enemies: Record<string, EnemySpec>;
  environment: Environment;
  schema: string;
  weapons: Record<string, Weapon>;
};

export const manifest = rawManifest as unknown as Manifest;

export function asset(id: string): Asset {
  const entry = manifest.assets[id];
  if (!entry) throw new Error(`Unknown asset id: ${id}`);
  return entry;
}

export function weaponSpec(): Weapon {
  return manifest.weapons.shotgun;
}

export function runnerSpec(): EnemySpec {
  return manifest.enemies.runner;
}

export function enemySpec(id: string): EnemySpec {
  const spec = manifest.enemies[id];
  if (!spec) throw new Error(`Unknown enemy family: ${id}`);
  return spec;
}

export function alphaReport(image: HTMLImageElement, entry: Asset): void {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 16) {
        opaque += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const expected = entry.alpha ? "alpha expected" : "opaque expected";
  console.log(
    `[assets] ${entry.id} ${canvas.width}x${canvas.height} ${expected} ` +
      `opaque=${opaque} bbox=[${minX},${minY},${maxX},${maxY}] pivot=${entry.pivot.join(",")}`,
  );
}

export async function loadTextures(
  onProgress?: (done: number, total: number, id: string) => void,
  options?: { alphaDiagnostics?: boolean },
): Promise<Map<string, THREE.Texture>> {
  const loader = new THREE.TextureLoader();
  const out = new Map<string, THREE.Texture>();
  const entries = Object.values(manifest.assets);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    let texture: THREE.Texture;
    try {
      texture = await loader.loadAsync(`/${entry.file}`);
    } catch {
      for (const partial of out.values()) partial.dispose();
      throw new Error(`Failed to load asset "${entry.id}" from /${entry.file}`);
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const image = texture.image as HTMLImageElement;
    if (options?.alphaDiagnostics && image && image.naturalWidth > 0) alphaReport(image, entry);
    out.set(entry.id, texture);
    onProgress?.(i + 1, entries.length, entry.id);
  }
  return out;
}
