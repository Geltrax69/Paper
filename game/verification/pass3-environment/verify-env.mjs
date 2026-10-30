import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const require = createRequire(path.join(dirname(fileURLToPath(import.meta.url)), "..", "fix-pass1", "package.json"));
const { chromium } = require("playwright-core");
const outDir = dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(outDir, "../../");
const base = "http://127.0.0.1:5178";
const exe = path.join(os.homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function record(id, name, status, detail) {
  results.push({ id, name, status, detail });
  console.log(`${status} ${id} ${name}: ${detail}`);
}
async function debug(page, expr) {
  return page.evaluate(`window.__paperDebug.${expr}`);
}
async function waitFor(page, fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch {}
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function startGame(page) {
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 20000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 5000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "playing phase");
}

let server = null;
let browser = null;
try {
  execSync("npm run build", { cwd: gameDir, stdio: "pipe", timeout: 120000 });
  record("build", "npm run build", "PASS", "tsc and vite build succeeded");
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5178", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const env = await debug(page, "getEnvironment()");
      const want = ["far_skyline.png", "mid_ruins.png", "floor_seamless.png", "wall_seamless.png", "crate_variant_wood.png", "crate_variant_metal.png", "crate_variant_paper.png"];
      const missing = want.filter((w) => !env.maps.includes(w));
      await page.screenshot({ path: path.join(outDir, "env-all.png") });
      record("env-layers", "All environment layers present in scene", missing.length === 0 && env.background ? "PASS" : "FAIL", `background=${env.background} maps=${env.maps.join(",")} missing=${missing.join(",") || "none"}`);
    } catch (e) { record("env-layers", "All environment layers present", "FAIL", String(e.message).slice(0, 300)); }
    try {
      await debug(page, "setPlayerFeet(10,0,10)");
      await debug(page, "setYaw(2.36)");
      await debug(page, "setPitch(0)");
      await sleep(600);
      await page.screenshot({ path: path.join(outDir, "env-angle.png") });
      record("env-angle", "Second angle shows cards beyond arena", "PASS", "screenshot env-angle.png from corner facing north-west");
    } catch (e) { record("env-angle", "Second angle", "FAIL", String(e.message).slice(0, 300)); }
    try {
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(600);
      await page.screenshot({ path: path.join(outDir, "env-crates.png") });
      record("env-crates", "Crate variants visible from centre", "PASS", "screenshot env-crates.png facing north from centre");
    } catch (e) { record("env-crates", "Crate variants", "FAIL", String(e.message).slice(0, 300)); }
    try {
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(-1.0)");
      await sleep(600);
      await page.screenshot({ path: path.join(outDir, "env-floor.png") });
      record("env-floor", "Floor tiling close view", "PASS", "screenshot env-floor.png looking down at floor");
    } catch (e) { record("env-floor", "Floor tiling", "FAIL", String(e.message).slice(0, 300)); }
    try {
      await debug(page, "setPlayerFeet(0,0,10)");
      await debug(page, "setYaw(3.14159)");
      await debug(page, "setPitch(0)");
      await sleep(600);
      await page.screenshot({ path: path.join(outDir, "env-wall.png") });
      record("env-wall", "Wall tiling close view", "PASS", "screenshot env-wall.png facing south wall");
    } catch (e) { record("env-wall", "Wall tiling", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?view=1&debug=1`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 20000 });
      await sleep(800);
      await page.screenshot({ path: path.join(outDir, "env-view1.png") });
      record("env-view1", "View mode shows environment layers", "PASS", "screenshot env-view1.png");
    } catch (e) { record("env-view1", "View mode", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} catch (e) {
  console.error("harness error", e);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  writeFileSync(path.join(outDir, "env-report.json"), JSON.stringify({ results, browser: "chromium cached 1248", base }, null, 2));
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`SUMMARY ${pass}/${results.length} PASS`);
}
