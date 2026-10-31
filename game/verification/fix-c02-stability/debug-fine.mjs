import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const port = 5184;
const base = `http://127.0.0.1:${port}`;
function discoverBrowser() {
  const root = path.join(os.homedir(), ".cache/ms-playwright");
  for (const dir of readdirSync(root).sort().reverse()) {
    const full = path.join(root, dir, "chrome-linux64/chrome");
    if (existsSync(full)) return full;
  }
  throw new Error("no Chromium binary");
}
const require = createRequire(path.join(gameDir, "package.json"));
const { chromium } = require("playwright-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const debug = (page, expr) => page.evaluate(`window.__paperDebug.${expr}`);
const server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: gameDir, stdio: "ignore" });
try {
  for (let i = 0; i < 60; i += 1) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }
  const browser = await chromium.launch({ executablePath: discoverBrowser(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await sleep(1500);
  const before = await debug(page, "getState()");
  console.log(`before clear textures=${before.textures} geometries=${before.geometries} runners=${before.runners.length} phase=${before.phase}`);
  await debug(page, "clearRunners()");
  const afterClear = await debug(page, "getState()");
  console.log(`after clear textures=${afterClear.textures} geometries=${afterClear.geometries}`);
  await debug(page, "spawnFamilyAt(0,0,\"insect\")");
  await debug(page, "setPlayerFeet(6,10,9)");
  let lastCount = null;
  let lastFrame = null;
  for (let i = 0; i < 120; i += 1) {
    const s = await debug(page, "getState()");
    const r = s.runners[0];
    const key = r ? `${r.state}|${r.visibleMesh}|${r.runFrame}|${r.attackFrame}|${r.defeatFrame}` : "none";
    if (s.textures !== lastCount) {
      console.log(`count change t=${i} textures=${s.textures} key=${key} x=${r ? r.x.toFixed(2) : "-"} z=${r ? r.z.toFixed(2) : "-"} geo=${s.geometries}`);
      lastCount = s.textures;
    }
    lastFrame = key;
    await sleep(100);
  }
  await browser.close();
} finally { server.kill(); }
