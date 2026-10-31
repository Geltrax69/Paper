import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const manifest = JSON.parse(readFileSync(path.join(gameDir, "assets.json"), "utf8"));
const assets = Object.values(manifest.assets);
let bytes = 0;
const byId = {};
for (const asset of assets) {
  const size = statSync(path.join(gameDir, "public", asset.file)).size;
  bytes += size;
  byId[asset.id] = { bytes: size, file: asset.file, size: asset.size };
}
const textureEstimateMiB =
  assets.reduce((sum, a) => sum + a.size[0] * a.size[1] * 4 * (4 / 3), 0) / 1048576;
let jsBytes = 0;
let jsFile = null;
for (const file of readdirSync(path.join(gameDir, "dist/assets"))) {
  if (file.endsWith(".js")) {
    jsBytes = statSync(path.join(gameDir, "dist/assets", file)).size;
    jsFile = file;
  }
}
const largest = [...assets]
  .map((a) => ({ bytes: byId[a.id].bytes, file: a.file, id: a.id, size: a.size }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 10);
const out = {
  after: {
    assetBytes: bytes,
    assetCount: assets.length,
    clipCount: Object.keys(manifest.clips).length,
    jsBytes,
    jsFile,
    largest,
    textureEstimateMiB: Math.round(textureEstimateMiB * 10) / 10,
  },
  before: {
    assetBytes: 43379985,
    assetCount: 109,
    clipCount: 15,
    jsBytes: 664380,
    note: "Measured on HEAD before this change with the same script logic: 109 manifest assets, 43,379,985 runtime bytes, 237.2 MiB texture estimate, 664,380 byte JS chunk.",
    textureEstimateMiB: 237.2,
  },
  removed: [
    { bytes: 4283728, file: "assets/scenery/crate_face.png", id: "crate_face", reason: "No clip, environment entry, or source file references it. Masters remain in the repo assets/scenery/crate_face.png outside game/public." },
    { bytes: 2588001, file: "assets/effects/muzzle_flash_shotgun.png", id: "muzzle_flash_shotgun", reason: "No clip, weapon, or source file references it. The flash clip uses frames instead. Masters remain in the repo assets/effects/muzzle_flash_shotgun.png outside game/public." },
  ],
  runtimeNote: "Texture estimate is manifest pixel dimensions at RGBA8 with a 4/3 mipmap factor. It is a planning estimate, not measured GPU memory.",
};
writeFileSync(path.join(scriptDir, "budgets.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.after, null, 2));
