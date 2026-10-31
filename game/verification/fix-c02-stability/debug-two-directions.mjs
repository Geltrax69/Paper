import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const port = 5188;
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
  for (const dir of ["front", "front-right"]) {
    await debug(page, "clearRunners()");
    await debug(page, "spawnFamilyAt(0,0,\"runner\")");
    const ret = await debug(page, `setRunnerDirection(0,"${dir}")`);
    await debug(page, "setPlayerFeet(8,10,8)");
    const seen = new Set();
    const seenMaps = new Set();
    const start = Date.now();
    while (Date.now() - start < 60000 && seen.size < 8) {
      const s = await debug(page, "getState()");
      const r = s.runners[0];
      if (r && r.direction === dir) seen.add(r.runFrame);
      const list = await debug(page, "listSceneTextures()");
      for (const e of list) if (e.visible && e.mapSrc && e.mapSrc.includes("runner")) seenMaps.add(e.mapSrc.split("/").pop());
      await sleep(200);
    }
    const end = await debug(page, "getState()");
    console.log(`dir=${dir} returned=${ret} frames=${[...seen].sort().join(",")} info=${end.textures} maps=${[...seenMaps].sort().join(",")}`);
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
