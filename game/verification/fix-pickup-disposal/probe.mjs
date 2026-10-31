import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = process.env.PAPER_OUT_DIR ? path.resolve(process.env.PAPER_OUT_DIR) : scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5187);
const base = process.env.PAPER_BASE_URL ?? `http://127.0.0.1:${port}`;
mkdirSync(outDir, { recursive: true });

function discoverBrowser() {
  if (process.env.PAPER_BROWSER) return process.env.PAPER_BROWSER;
  const root = path.join(os.homedir(), ".cache/ms-playwright");
  for (const dir of readdirSync(root).sort().reverse()) {
    const full = path.join(root, dir, "chrome-linux64/chrome");
    if (existsSync(full)) return full;
    const shell = path.join(root, dir, "chrome-linux/chrome");
    if (existsSync(shell)) return shell;
  }
  throw new Error("no Chromium binary found in Playwright cache, set PAPER_BROWSER");
}

const require = createRequire(path.join(gameDir, "package.json"));
const { chromium } = require("playwright-core");
const exe = discoverBrowser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function debug(page, expr) {
  return page.evaluate(`window.__paperDebug.${expr}`);
}
async function waitFor(page, fn, timeoutMs, label) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch (e) {
      last = String(e.message).slice(0, 200);
    }
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}: ${last}`);
}

let server = null;
let browser = null;
const rows = [];
try {
  execSync("npm run build", { cwd: gameDir, stdio: "pipe", timeout: 180000 });
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${base}/`);
      if (r.ok) break;
    } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing phase");

  const collectOne = async (kind, faceX, px, pz, valueCheck) => {
    await debug(page, `setPlayerFeet(${faceX},0,9)`);
    await debug(page, "setYaw(0)");
    await sleep(900);
    await debug(page, `setPlayerFeet(${px},0,${pz})`);
    await waitFor(page, async () => {
      const s = await debug(page, "getState()");
      return valueCheck(s);
    }, 30000, `${kind} collected`);
  };

  for (let wave = 1; wave <= 6; wave += 1) {
    await debug(page, "setPlayerFeet(0,0,9)");
    await debug(page, `startWaveDebug(${wave})`);
    await debug(page, "clearRunners()");
    await debug(page, "setPlayerFeet(0,0,9)");
    await sleep(600);
    await debug(page, "damagePlayer(40)");
    await debug(page, "fireShot()");
    await sleep(300);
    const before = await debug(page, "getState()");
    await collectOne("health", -9, -9, 5, (s) => s.playerHealth === 100);
    const afterHealth = await debug(page, "getState()");
    await collectOne("ammo", 9, 9, 5, (s) => s.ammo === 6);
    await sleep(900);
    const after = await debug(page, "getState()");
    rows.push({
      wave,
      beforeTextures: before.textures,
      beforeGeometries: before.geometries,
      beforePickups: before.pickups.length,
      afterHealth: afterHealth.playerHealth,
      afterAmmo: after.ammo,
      afterTextures: after.textures,
      afterGeometries: after.geometries,
      afterPickups: after.pickups.length,
      afterTaken: after.pickups.filter((p) => p.taken).length,
    });
    console.log(`wave ${wave} beforeTex=${before.textures} beforeGeo=${before.geometries} pickups=${before.pickups.length} healthAfter=${afterHealth.playerHealth} ammoAfter=${after.ammo} afterTex=${after.textures} afterGeo=${after.geometries} pickupsAfter=${after.pickups.length} taken=${after.pickups.filter((p) => p.taken).length}`);
  }
  await page.screenshot({ path: path.join(outDir, "pickup-probe.png") });
  await page.close();
  const deltas = [];
  for (let i = 1; i < rows.length; i += 1) {
    deltas.push({ fromWave: rows[i - 1].wave, toWave: rows[i].wave, texDelta: rows[i].afterTextures - rows[i - 1].afterTextures, geoDelta: rows[i].afterGeometries - rows[i - 1].afterGeometries, pickupDelta: rows[i].afterPickups - rows[i - 1].afterPickups });
  }
  console.log("deltas", JSON.stringify(deltas));
  writeFileSync(path.join(outDir, "probe.json"), JSON.stringify({ rows, deltas }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
