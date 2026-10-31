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
async function startGame(page) {
  await page.goto(`${base}/?debug=1`, { timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing phase");
}
async function waitCooldown(page) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 30000, "fire cooldown");
}

let server = null;
let browser = null;
try {
  try {
    execSync("npm run build", { cwd: gameDir, stdio: "pipe", timeout: 180000 });
    record("build", "npm run build", "PASS", "tsc and vite build succeeded");
  } catch (e) {
    record("build", "npm run build", "FAIL", String(e.message).slice(0, 300));
    throw e;
  }
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await startGame(page);

  const expected = {
    shotgun: "Shotgun",
    pistol: "Pistol",
    automatic: "Automatic",
    blaster: "Blaster",
    knife: "Throwing knife",
    throwable: "Grenade",
  };
  for (const id of ["shotgun", "pistol", "automatic", "blaster", "knife", "throwable"]) {
    await debug(page, `selectWeapon("${id}")`);
    await sleep(600);
    const hud = await debug(page, "getHud()");
    await page.screenshot({ path: path.join(outDir, `view-${id}.png`) });
    if (id === "pistol" || id === "automatic") {
      await page.screenshot({ path: path.join(outDir, `view-${id}-close.png`), clip: { x: 500, y: 280, width: 780, height: 440 } });
    }
    const ok = hud.weapon === id && String(hud.ammoCount).startsWith(expected[id]);
    record(`view-${id}`, `View and HUD match for ${expected[id]}`, ok ? "PASS" : "FAIL", `hudWeapon=${hud.weapon} ammo=${hud.ammoCount} screenshot=view-${id}.png taken immediately after select`);
  }

  {
    await debug(page, `selectWeapon("shotgun")`);
    await debug(page, "fireShot()");
    await waitCooldown(page);
    await debug(page, "fireShot()");
    await waitCooldown(page);
    const w = await debug(page, "getWeapons()");
    const ok = w.ammo.shotgun === 4;
    record("accept-shotgun", "Shotgun two shots use ammo 6 to 4", ok ? "PASS" : "FAIL", `ammo=${JSON.stringify(w.ammo)}`);
  }
  {
    await debug(page, `selectWeapon("pistol")`);
    await debug(page, "spawnRunnerAt(0,3)");
    await waitFor(page, async () => {
      const r = await debug(page, "getLastSpawned()");
      return r && r.state === "pursue";
    }, 60000, "runner pursue");
    const before = (await debug(page, "getLastSpawned()")).health;
    await debug(page, "fireShot()");
    await waitCooldown(page);
    const after = (await debug(page, "getLastSpawned()")).health;
    const ok = before === 36 && after === 16;
    record("accept-pistol", "Pistol shot deals 20 damage, unchanged", ok ? "PASS" : "FAIL", `before=${before} after=${after}`);
  }
  {
    const ok = errors.length === 0;
    record("accept-errors", "No page or console errors", ok ? "PASS" : "FAIL", errors.join(" | ") || "none");
  }
} catch (e) {
  record("harness", "Harness failed", "FAIL", String(e).slice(0, 500));
  console.error(e);
} finally {
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results }, null, 2));
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`TOTAL ${results.length} PASS ${results.length - failed} FAIL ${failed}`);
process.exit(failed ? 1 : 0);
