import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const port = 5187;
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
let browser = null;
try {
  for (let i = 0; i < 60; i += 1) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }
  browser = await chromium.launch({ executablePath: discoverBrowser(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await sleep(1500);
  await debug(page, "clearRunners()");
  const baseState = await debug(page, "getState()");
  console.log(`baseline info=${baseState.textures}`);
  await debug(page, "spawnFamilyAt(0,0,\"runner\")");
  const dirResult = await debug(page, "setRunnerDirection(0,\"front-right\")");
  console.log(`setRunnerDirection returned=${dirResult}`);
  await debug(page, "setPlayerFeet(8,10,8)");
  const seen = new Map();
  for (let i = 0; i < 60; i += 1) {
    const s = await debug(page, "getState()");
    const r = s.runners[0];
    const list = await debug(page, "listSceneTextures()");
    const visible = list.filter((e) => e.visible && e.mapSrc && e.mapSrc.includes("runner"));
    for (const e of visible) seen.set(e.mapSrc, (seen.get(e.mapSrc) ?? 0) + 1);
    if (i % 10 === 0) console.log(`t=${i} info=${s.textures} dir=${r ? r.direction : "-"} runFrame=${r ? r.runFrame : "-"} visibleRunnerMaps=${JSON.stringify(visible.map((e) => e.mapSrc.split("/").pop()))}`);
    await sleep(200);
  }
  console.log(`distinct runner map sources seen: ${[...seen.keys()].map((x) => x.split("/").pop()).join(",")}`);
  const end = await debug(page, "getState()");
  console.log(`end info=${end.textures}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
