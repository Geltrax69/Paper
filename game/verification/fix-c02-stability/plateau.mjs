import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const port = 5190;
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
const note = (s) => { log.push(s); console.log(s); };
async function waitFor(page, fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await fn()) return; } catch {} await sleep(100); }
  throw new Error(`timeout waiting for ${label}`);
}
async function ensurePlaying(page) {
  const s = await debug(page, "getState()");
  if (s.phase === "playing") return;
  await page.click("#startBtn");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 60000, "playing after restart");
}
async function killAll(page) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") return true;
    if (s.runners.length === 0 && s.phase === "playing") return true;
    try {
      await debug(page, "setPlayerFeet(0,10,9)");
      if (s.runners.length > 0) await debug(page, "damageRunner(0,36)");
    } catch {}
    return false;
  }, 300000, "wave clear");
}
async function cycleDirection(page, dir, frameCount) {
  await ensurePlaying(page);
  await debug(page, "clearRunners()");
  await debug(page, "spawnFamilyAt(0,0,\"runner\")");
  await debug(page, `setRunnerDirection(0,"${dir}")`);
  await debug(page, "setPlayerFeet(8,10,8)");
  await debug(page, "setYaw(0.785)");
  const seen = new Set();
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    for (const r of s.runners) seen.add(r.runFrame);
    return seen.size >= frameCount;
  }, 180000, `${dir} run frames`);
  const s = await debug(page, "getState()");
  note(`direction ${dir}: frames=${[...seen].sort().join(",")} count=${seen.size}/${frameCount} textures=${s.textures} geo=${s.geometries}`);
  return { textures: s.textures, geometries: s.geometries };
}
async function cycleRun(page, family, frameCount) {
  await ensurePlaying(page);
  await debug(page, "clearRunners()");
  await debug(page, `spawnFamilyAt(0,0,"${family}")`);
  await debug(page, "setPlayerFeet(8,10,8)");
  await debug(page, "setYaw(0.785)");
  const seen = new Set();
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    for (const r of s.runners) seen.add(r.runFrame);
    return seen.size >= frameCount;
  }, 180000, `${family} run frames`);
  const s = await debug(page, "getState()");
  note(`${family} run: frames=${[...seen].sort().join(",")} count=${seen.size}/${frameCount} textures=${s.textures} geo=${s.geometries}`);
  return { textures: s.textures, geometries: s.geometries };
}
async function cycleAttack(page, family, attackFrames) {
  await ensurePlaying(page);
  await debug(page, "clearRunners()");
  await debug(page, `spawnFamilyAt(0,0,"${family}")`);
  const seen = new Set();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await debug(page, "setPlayerFeet(0,0,2)");
    await debug(page, "setYaw(3.14159)");
    let movedAway = false;
    await waitFor(page, async () => {
      const s = await debug(page, "getState()");
      const r = s.runners[0];
      if (!r) return true;
      if (r.visibleMesh === "attack") {
        seen.add(r.attackFrame);
        if (!movedAway) { await debug(page, "setPlayerFeet(8,10,8)"); movedAway = true; }
      }
      if (movedAway && r.state === "pursue") return true;
      return seen.size >= attackFrames;
    }, 90000, `${family} attack attempt ${attempt}`);
    if (seen.size >= attackFrames) break;
  }
  const s = await debug(page, "getState()");
  note(`${family} attack: frames=${[...seen].sort().join(",")} count=${seen.size}/${attackFrames} textures=${s.textures}`);
  await debug(page, "damageRunner(0,100)");
  await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 180000, `${family} defeat removal`);
  const s2 = await debug(page, "getState()");
  note(`${family} defeat removal: textures=${s2.textures} geo=${s2.geometries}`);
  return { textures: s2.textures, geometries: s2.geometries };
}
async function collectSourcesDuringWave(page, wave) {
  const cum = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") break;
    try {
      const list = await debug(page, "listSceneTextures()");
      for (const e of list) if (e.mapSrc && e.mapSrc.includes("/assets/")) cum.add(e.mapSrc.split("/assets/")[1]);
    } catch {}
    try {
      await debug(page, "setPlayerFeet(0,10,9)");
      if (s.runners.length > 0) await debug(page, "damageRunner(0,36)");
    } catch {}
    await sleep(200);
  }
  return cum;
}
const result = { directions: {}, runs: {}, attacks: {}, waves: [] };
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
  let s = await debug(page, "getState()");
  note(`baseline textures=${s.textures} geo=${s.geometries}`);
  result.baseline = { textures: s.textures, geometries: s.geometries };
  for (const dir of ["front", "front-right", "right", "back-right", "back", "back-left", "left", "front-left"]) {
    result.directions[dir] = await cycleDirection(page, dir, 8);
  }
  result.runs.insect = await cycleRun(page, "insect", 6);
  result.runs.brute = await cycleRun(page, "brute", 7);
  result.attacks.runner = await cycleAttack(page, "runner", 6);
  result.attacks.insect = await cycleAttack(page, "insect", 5);
  result.attacks.brute = await cycleAttack(page, "brute", 6);
  s = await debug(page, "getState()");
  note(`warmup complete textures=${s.textures} geo=${s.geometries}`);
  result.warmup = { textures: s.textures, geometries: s.geometries };
  let prevCum = null;
  for (const w of [4, 5, 6, 7, 8]) {
    if (w === 4) {
      await debug(page, `startWaveDebug(${w})`);
      await page.evaluate(() => { const c = document.querySelector("canvas"); if (c) c.requestPointerLock(); });
    } else await page.click("#startBtn");
    await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 60000, `wave ${w} playing`);
    const cum = await collectSourcesDuringWave(page, w);
    s = await debug(page, "getState()");
    const newSources = prevCum ? [...cum].filter((x) => !prevCum.has(x)) : [...cum];
    note(`wave ${w}: textures=${s.textures} geo=${s.geometries} phase=${s.phase} cumulativeSources=${cum.size} newSources=${newSources.length} ${newSources.join(" | ")}`);
    result.waves.push({ wave: w, textures: s.textures, geometries: s.geometries, phase: s.phase, cumulativeSources: cum.size, newSources });
    prevCum = cum;
  }
  await page.screenshot({ path: path.join(scriptDir, "plateau-post-waves.png") });
} catch (e) {
  note(`plateau FAILED: ${String(e.message).slice(0, 500)}`);
  result.error = String(e.message).slice(0, 500);
} finally {
  writeFileSync(path.join(scriptDir, "plateau.json"), JSON.stringify(result, null, 2));
  writeFileSync(path.join(scriptDir, "plateau.log"), log.join("\n") + "\n");
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
note("plateau done");
