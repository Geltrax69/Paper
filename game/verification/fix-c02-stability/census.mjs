import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const port = 5185;
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
const log = [];
function note(line) { log.push(line); console.log(line); }
async function waitFor(page, fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch {}
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function startGame(page) {
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing");
}
async function killAll(page, timeoutMs = 240000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") return true;
    await debug(page, "setPlayerFeet(0,10,9)");
    if (s.runners.length > 0) await debug(page, "damageRunner(0,100)");
    return false;
  }, timeoutMs, "wave cleared");
}
async function snapshot(page, cumulative) {
  const list = await debug(page, "listSceneTextures()");
  const visible = list.filter((e) => e.visible && e.mapSrc);
  for (const e of visible) cumulative.add(e.mapSrc);
  const uuids = new Set(visible.map((e) => e.mapUuid));
  const s = await debug(page, "getState()");
  return { infoTextures: s.textures, geometries: s.geometries, visibleEntries: visible.length, distinctVisibleUuids: uuids.size, cumulative: cumulative.size };
}
const result = { segments: [], waves: [] };
const server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: gameDir, stdio: "ignore" });
try {
  for (let i = 0; i < 60; i += 1) { try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {} await sleep(200); }
  const browser = await chromium.launch({ executablePath: discoverBrowser(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await startGame(page);
  const cumulative = new Set();
  await debug(page, "clearRunners()");
  await sleep(500);
  let snap = await snapshot(page, cumulative);
  note(`baseline visible cumulative=${snap.cumulative} info=${snap.infoTextures} geo=${snap.geometries} visibleEntries=${snap.visibleEntries} distinctUuids=${snap.distinctVisibleUuids}`);
  result.segments.push({ name: "baseline", ...snap, sources: [...cumulative].sort() });

  await debug(page, "spawnFamilyAt(0,0,\"insect\")");
  await debug(page, "setPlayerFeet(6,10,9)");
  for (let i = 0; i < 30; i += 1) { await snapshot(page, cumulative); await sleep(200); }
  snap = await snapshot(page, cumulative);
  note(`insect pursue 6s visible cumulative=${snap.cumulative} info=${snap.infoTextures} geo=${snap.geometries} distinctUuids=${snap.distinctVisibleUuids}`);
  result.segments.push({ name: "insect-pursue", ...snap, sources: [...cumulative].sort() });

  const beforeB = new Set(cumulative);
  await debug(page, "spawnFamilyAt(2,0,\"insect\")");
  for (let i = 0; i < 30; i += 1) { await snapshot(page, cumulative); await sleep(200); }
  snap = await snapshot(page, cumulative);
  const addedByB = [...cumulative].filter((x) => !beforeB.has(x));
  note(`second insect visible cumulative=${snap.cumulative} info=${snap.infoTextures} distinctUuids=${snap.distinctVisibleUuids} addedSources=${JSON.stringify(addedByB)}`);
  result.segments.push({ name: "insect-second", ...snap, addedSources: addedByB, sources: [...cumulative].sort() });

  await debug(page, "clearRunners()");
  const dirs = ["front", "left", "front-right", "right", "back-right", "back", "back-left", "front-left"];
  for (const dir of dirs) {
    await debug(page, "spawnFamilyAt(0,0,\"runner\")");
    await debug(page, `setRunnerDirection(0,"${dir}")`);
    await debug(page, "setPlayerFeet(8,10,8)");
    const before = new Set(cumulative);
    for (let i = 0; i < 40; i += 1) { await snapshot(page, cumulative); await sleep(200); }
    snap = await snapshot(page, cumulative);
    const added = [...cumulative].filter((x) => !before.has(x));
    note(`runner ${dir} visible cumulative=${snap.cumulative} info=${snap.infoTextures} added=${added.length} addedSources=${JSON.stringify(added)}`);
    result.segments.push({ name: `runner-${dir}`, ...snap, addedSources: added });
    await debug(page, "clearRunners()");
  }

  for (const family of ["runner", "insect", "brute"]) {
    await debug(page, "spawnFamilyAt(0,0,\"" + family + "\")");
    await debug(page, "setPlayerFeet(0,0,2)");
    const before = new Set(cumulative);
    await waitFor(page, async () => {
      const st = await debug(page, "getState()");
      const r = st.runners[0];
      if (r && r.state === "attack") { await debug(page, "setPlayerFeet(8,10,8)"); return true; }
      await snapshot(page, cumulative);
      return false;
    }, 120000, `${family} attack`);
    for (let i = 0; i < 30; i += 1) { await snapshot(page, cumulative); await sleep(200); }
    await debug(page, "damageRunner(0,100)");
    await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 120000, `${family} removal`);
    snap = await snapshot(page, cumulative);
    const added = [...cumulative].filter((x) => !before.has(x));
    note(`${family} attack and defeat visible cumulative=${snap.cumulative} info=${snap.infoTextures} added=${JSON.stringify(added)}`);
    result.segments.push({ name: `${family}-attack-defeat`, ...snap, addedSources: added });
    await debug(page, "clearRunners()");
  }
  snap = await snapshot(page, cumulative);
  note(`warmup complete visible cumulative=${snap.cumulative} info=${snap.infoTextures} geo=${snap.geometries}`);
  result.segments.push({ name: "warmup-complete", ...snap, sources: [...cumulative].sort() });

  for (const w of [4, 5, 6]) {
    await debug(page, `startWaveDebug(${w})`);
    await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, `wave ${w} playing`);
    await killAll(page);
    snap = await snapshot(page, cumulative);
    note(`post-warmup wave ${w} info=${snap.infoTextures} geo=${snap.geometries} visibleCumulative=${snap.cumulative} phase=waveComplete`);
    result.waves.push({ wave: w, textures: snap.infoTextures, geometries: snap.geometries, cumulative: snap.cumulative });
  }
  await page.screenshot({ path: path.join(scriptDir, "census-post-warmup.png") });
  await browser.close();
} catch (e) {
  note(`census FAILED: ${String(e.message).slice(0, 500)}`);
  result.error = String(e.message).slice(0, 500);
} finally {
  writeFileSync(path.join(scriptDir, "census.json"), JSON.stringify(result, null, 2));
  writeFileSync(path.join(scriptDir, "census.log"), log.join("\n") + "\n");
  server.kill();
}
note("census done");
