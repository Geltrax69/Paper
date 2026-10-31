import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const port = 5186;
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
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch (e) { last = String(e.message).slice(0, 200); }
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${label}: ${last}`);
}
async function startGame(page) {
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing");
}
async function killAll(page, timeoutMs = 300000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") return true;
    await debug(page, "setPlayerFeet(0,10,9)");
    if (s.runners.length > 0) await debug(page, "damageRunner(0,100)");
    return false;
  }, timeoutMs, "wave cleared");
}
async function ensurePlaying(page) {
  const s = await debug(page, "getState()");
  if (s.phase === "playing") return;
  await page.click("#startBtn");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 60000, "playing after restart");
}
async function cycleDirection(page, dir, frameCount) {
  await ensurePlaying(page);
  await debug(page, "clearRunners()");
  await debug(page, "spawnFamilyAt(0,0,\"runner\")");
  await debug(page, `setRunnerDirection(0,"${dir}")`);
  await debug(page, "setPlayerFeet(8,10,8)");
  const seen = new Set();
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const s = await debug(page, "getState()");
    const r = s.runners[0];
    if (r && r.direction === dir) seen.add(r.runFrame);
    if (seen.size >= frameCount) break;
    await sleep(100);
  }
  const s = await debug(page, "getState()");
  note(`direction ${dir}: frames seen=${[...seen].sort().join(",")} count=${seen.size}/${frameCount} textures=${s.textures} geo=${s.geometries}`);
  return { dir, frames: [...seen].sort(), textures: s.textures, geometries: s.geometries };
}
async function cycleAttack(page, family, attackFrames, defeatFrames) {
  await ensurePlaying(page);
  await debug(page, "clearRunners()");
  await debug(page, `spawnFamilyAt(0,0,"${family}")`);
  const seenAttack = new Set();
  const seenDefeat = new Set();
  for (let attempt = 0; attempt < 4 && seenAttack.size < attackFrames; attempt += 1) {
    await debug(page, "setPlayerFeet(0,0,2)");
    const start = Date.now();
    let movedAway = false;
    while (Date.now() - start < 60000) {
      const s = await debug(page, "getState()");
      const r = s.runners[0];
      if (!r) break;
      if (r.visibleMesh === "attack") {
        seenAttack.add(r.attackFrame);
        if (!movedAway) { await debug(page, "setPlayerFeet(8,10,8)"); movedAway = true; }
      }
      if (movedAway && r.state === "pursue") break;
      if (seenAttack.size >= attackFrames) break;
      await sleep(100);
    }
    note(`${family} attack attempt ${attempt}: frames seen=${[...seenAttack].sort().join(",")} count=${seenAttack.size}/${attackFrames}`);
  }
  let s = await debug(page, "getState()");
  note(`${family} attack done: frames=${[...seenAttack].sort().join(",")} textures=${s.textures}`);
  await debug(page, "damageRunner(0,100)");
  await waitFor(page, async () => {
    const st = await debug(page, "getState()");
    for (const r of st.runners) if (r.visibleMesh === "defeat") seenDefeat.add(r.defeatFrame);
    return st.runners.length === 0;
  }, 180000, `${family} removal`);
  s = await debug(page, "getState()");
  note(`${family} defeat: frames=${[...seenDefeat].sort().join(",")} count=${seenDefeat.size}/${defeatFrames} textures=${s.textures}`);
  return { family, attack: [...seenAttack].sort(), defeat: [...seenDefeat].sort(), textures: s.textures };
}
const result = { directions: [], attacks: [], waves: [], identity: null };
const server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: gameDir, stdio: "ignore" });
let browser = null;
try {
  let up = false;
  for (let i = 0; i < 60; i += 1) { try { const r = await fetch(`${base}/`); if (r.ok) { up = true; break; } } catch {} await sleep(200); }
  if (!up) throw new Error("preview server did not start");
  browser = await chromium.launch({ executablePath: discoverBrowser(), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await startGame(page);
  await debug(page, "clearRunners()");
  let s = await debug(page, "getState()");
  note(`baseline textures=${s.textures} geo=${s.geometries}`);
  result.baseline = { textures: s.textures, geometries: s.geometries };
  for (const dir of ["front", "front-right", "right", "back-right", "back", "back-left", "left", "front-left"]) {
    result.directions.push(await cycleDirection(page, dir, 8));
  }
  result.attacks.push(await cycleAttack(page, "runner", 6, 8));
  result.attacks.push(await cycleAttack(page, "insect", 5, 0));
  result.attacks.push(await cycleAttack(page, "brute", 6, 0));
  await ensurePlaying(page);
  await debug(page, "clearRunners()");
  await debug(page, "spawnFamilyAt(0,0,\"insect\")");
  await debug(page, "setPlayerFeet(8,10,8)");
  const seenA = new Set();
  await waitFor(page, async () => {
    const st = await debug(page, "getState()");
    const r = st.runners[0];
    if (r) seenA.add(r.runFrame);
    return seenA.size >= 6;
  }, 120000, "insect A run frames");
  const afterA = (await debug(page, "getState()")).textures;
  await debug(page, "spawnFamilyAt(2,0,\"insect\")");
  const seenB = new Set();
  await waitFor(page, async () => {
    const st = await debug(page, "getState()");
    for (const r of st.runners) seenB.add(r.runFrame);
    return seenB.size >= 6;
  }, 120000, "insect B run frames");
  const afterB = (await debug(page, "getState()")).textures;
  note(`identity: after insect A textures=${afterA} after insect B textures=${afterB} delta=${afterB - afterA} framesA=${[...seenA].sort().join(",")}`);
  result.identity = { afterA, afterB, delta: afterB - afterA };
  s = await debug(page, "getState()");
  note(`warmup complete textures=${s.textures} geo=${s.geometries}`);
  result.warmup = { textures: s.textures, geometries: s.geometries };
  for (const w of [4, 5, 6]) {
    if (w === 4) {
      await debug(page, `startWaveDebug(${w})`);
    } else {
      await page.click("#startBtn");
    }
    await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 60000, `wave ${w} playing`);
    await killAll(page);
    s = await debug(page, "getState()");
    note(`post-warmup wave ${w} textures=${s.textures} geo=${s.geometries} phase=${s.phase} waveField=${s.wave}`);
    result.waves.push({ wave: w, textures: s.textures, geometries: s.geometries, phase: s.phase });
  }
  await page.screenshot({ path: path.join(scriptDir, "warmup-post-waves.png") });
} catch (e) {
  note(`warmup FAILED: ${String(e.message).slice(0, 500)}`);
  result.error = String(e.message).slice(0, 500);
} finally {
  writeFileSync(path.join(scriptDir, "warmup.json"), JSON.stringify(result, null, 2));
  writeFileSync(path.join(scriptDir, "warmup.log"), log.join("\n") + "\n");
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
note("warmup done");
