import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = process.env.PAPER_OUT_DIR ? path.resolve(process.env.PAPER_OUT_DIR) : scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5181);
const base = process.env.PAPER_BASE_URL ?? `http://127.0.0.1:${port}`;
mkdirSync(outDir, { recursive: true });

function discoverBrowser() {
  if (process.env.PAPER_BROWSER) return process.env.PAPER_BROWSER;
  const root = path.join(os.homedir(), ".cache/ms-playwright");
  if (!existsSync(root)) throw new Error("no Playwright cache found, set PAPER_BROWSER");
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
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing phase");
}
async function waitPursue(page, timeoutMs = 30000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners[0] && s.runners[0].state === "pursue";
  }, timeoutMs, "runner pursue");
}
async function waitCooldown(page) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 30000, "fire cooldown");
}
async function killAll(page, timeoutMs = 180000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") return true;
    await debug(page, "setPlayerFeet(0,10,9)");
    if (s.runners.length > 0) await debug(page, "damageRunner(0,36)");
    return false;
  }, timeoutMs, "wave cleared by damageRunner");
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

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const logs = [];
    const bytes = { total: 0, assets: 0, js: 0, count: 0 };
    page.on("console", (m) => logs.push(m.text()));
    page.on("response", async (res) => {
      try {
        const buf = await res.body();
        bytes.total += buf.length;
        bytes.count += 1;
        if (res.url().includes("/assets/")) bytes.assets += buf.length;
        if (res.url().endsWith(".js")) bytes.js += buf.length;
      } catch {}
    });
    try {
      await page.goto(`${base}/`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
      await sleep(500);
      const alphaLogs = logs.filter((t) => t.startsWith("[assets]"));
      const ok = alphaLogs.length === 0;
      record("n08-startup-no-alpha", "Normal play start performs no alpha scan", ok ? "PASS" : "FAIL",
        `alphaLogs=${alphaLogs.length} startupBytes=${bytes.total} assetBytes=${bytes.assets} jsBytes=${bytes.js} responses=${bytes.count}`);
      writeFileSync(path.join(outDir, "startup.json"), JSON.stringify({ bytes, alphaLogs: alphaLogs.length }, null, 2));
    } catch (e) {
      record("n08-startup-no-alpha", "Normal play start performs no alpha scan", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const logs = [];
    page.on("console", (m) => logs.push(m.text()));
    try {
      await page.goto(`${base}/?review=1`);
      await waitFor(page, async () => logs.some((t) => t.startsWith("[assets]")), 60000, "review alpha log");
      await page.screenshot({ path: path.join(outDir, "review-alpha.png") });
      const count = logs.filter((t) => t.startsWith("[assets]")).length;
      record("n08-review-alpha", "Review mode still shows alpha diagnostics", "PASS", `alphaLogs=${count}`);
    } catch (e) {
      record("n08-review-alpha", "Review mode still shows alpha diagnostics", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const caps = await debug(page, "getCaps()");
      const capsOk = caps.activeRunnerCap === 12 && caps.maxAttackers === 4;
      record("n08-caps", "Caps reported as 12 active runners and 4 attackers", capsOk ? "PASS" : "FAIL", JSON.stringify(caps));
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,0)");
      await debug(page, "spawnRunnerAt(0.3,0)");
      await debug(page, "spawnRunnerAt(9,9)");
      await sleep(1000);
      const probe = await debug(page, "spatialProbe()");
      const probeOk = probe.fullCount === 3 && probe.gridCandidates === 2;
      record("n08-spatial", "Spatial grid excludes a far runner from neighbor candidates", probeOk ? "PASS" : "FAIL",
        `fullCount=${probe.fullCount} gridCandidates=${probe.gridCandidates}`);
    } catch (e) {
      record("n08-spatial", "Spatial grid excludes a far runner", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const before = await debug(page, "getState()");
      const wave5 = await debug(page, "startWaveDebug(5)");
      await waitFor(page, async () => {
        await debug(page, "setPlayerFeet(0,10,9)");
        const c = await debug(page, "getCaps()");
        return c.activeRunners === 12 && c.queuedRunners === 2;
      }, 240000, "wave 5 capped at 12 active with 2 queued");
      await page.screenshot({ path: path.join(outDir, "cap-wave5.png") });
      const capped = await debug(page, "getCaps()");
      await debug(page, "damageRunner(0,36)");
      await waitFor(page, async () => {
        await debug(page, "setPlayerFeet(0,10,9)");
        const c = await debug(page, "getCaps()");
        return c.activeRunners === 12 && c.queuedRunners === 1;
      }, 120000, "queued runner replaces a kill");
      await killAll(page);
      const afterWave = await debug(page, "getState()");
      const ok = wave5.queued === 14 && capped.activeRunners === 12 && capped.queuedRunners === 2 && afterWave.phase === "waveComplete";
      record("n08-cap-queue", "Wave 5 caps at 12 active, queues 2, drains on kill, then completes", ok ? "PASS" : "FAIL",
        `wave5Queued=${wave5.queued} cappedActive=${capped.activeRunners} cappedQueue=${capped.queuedRunners} phase=${afterWave.phase} beforeGeometries=${before.geometries} afterGeometries=${afterWave.geometries}`);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "next wave playing");
    } catch (e) {
      record("n08-cap-queue", "Wave 5 caps at 12 active, queues 2, drains on kill", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      for (const [x, z] of [[0, 7], [0.5, 7], [-0.5, 7], [1, 7], [-1, 7], [0, 6.5]]) await debug(page, `spawnRunnerAt(${x},${z})`);
      await waitFor(page, async () => {
        const c = await debug(page, "getCaps()");
        return c.attackers >= 1 && c.attackers <= 4;
      }, 60000, "attackers between 1 and 4");
      const caps = await debug(page, "getCaps()");
      const ok = caps.attackers >= 1 && caps.attackers <= 4;
      record("n08-attack-cap", "Attack concurrency stays at or below 4", ok ? "PASS" : "FAIL",
        `attackers=${caps.attackers} active=${caps.activeRunners}`);
      await debug(page, "clearRunners()");
    } catch (e) {
      record("n08-attack-cap", "Attack concurrency stays at or below 4", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      const after1 = await debug(page, "getState()");
      await debug(page, "fireShot()");
      await waitCooldown(page);
      const after2 = await debug(page, "getState()");
      const shotsOk = after1.ammo === 5 && after2.ammo === 4;
      record("accept-shots", "Two shots use ammo 6 to 4", shotsOk ? "PASS" : "FAIL", `after1=${after1.ammo} after2=${after2.ammo}`);
      await debug(page, "pressKeyDown(\"KeyR\")");
      await waitFor(page, async () => (await debug(page, "getState()")).weapon.reloading === true, 15000, "reloading");
      await waitFor(page, async () => (await debug(page, "getState()")).weapon.reloadTransferred === true, 30000, "reload transfer");
      await waitFor(page, async () => (await debug(page, "getState()")).ammo === 6, 30000, "ammo back to 6");
      await page.screenshot({ path: path.join(outDir, "accept-reload.png") });
      record("accept-reload", "Reload transfers ammo and refills to 6", "PASS", "reloadTransferred true, ammo 6");
      const hudBefore = await debug(page, "getHud()");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      await debug(page, "damageRunner(0,36)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 30000, "runner removed");
      const afterKill = await debug(page, "getState()");
      const hudAfter = await debug(page, "getHud()");
      await page.screenshot({ path: path.join(outDir, "accept-kill.png") });
      const killOk = afterKill.score > 0 && hudAfter.comboCount !== hudBefore.comboCount;
      record("accept-kill", "Kill scores and changes the comic HUD combo", killOk ? "PASS" : "FAIL",
        `score=${afterKill.score} comboBefore=${hudBefore.comboCount} comboAfter=${hudAfter.comboCount} wave=${hudAfter.waveNum} ammo=${hudAfter.ammoCount}`);
    } catch (e) {
      record("accept-kill", "Kill scores and changes the comic HUD combo", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(-6,1)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(-6,0,7)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      const s = await debug(page, "getState()");
      const tracerZ = s.lastTracer ? s.lastTracer.to[2] : null;
      const ok = s.runners[0] && s.runners[0].health === 36 && tracerZ !== null && Math.abs(tracerZ - 4.90) < 0.5;
      record("accept-crate-blocked", "Crate-blocked shot leaves runner at 36 and stops at the crate near face z 4.90", ok ? "PASS" : "FAIL",
        `health=${s.runners[0] ? s.runners[0].health : "none"} tracerZ=${tracerZ}`);
      await debug(page, "setRunnerDirection(0,\"left\")");
      await sleep(500);
      const dir = await debug(page, "getState()");
      const dirOk = dir.runners[0] && dir.runners[0].direction === "left";
      record("accept-directional", "Forced direction shows the left run clip", dirOk ? "PASS" : "FAIL",
        `direction=${dir.runners[0] ? dir.runners[0].direction : "none"} runClip=${dir.runners[0] ? dir.runners[0].runClip : "none"}`);
    } catch (e) {
      record("accept-directional", "Forced direction shows the left run clip", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,10,1.5)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(-1)");
      await sleep(800);
      await debug(page, "startMelee()");
      await sleep(1500);
      const aerial = await debug(page, "getState()");
      const aerialOk = aerial.runners[0] && aerial.runners[0].health === 36;
      record("n03-aerial", "Melee from 10m above deals no damage", aerialOk ? "PASS" : "FAIL",
        `health=${aerial.runners[0] ? aerial.runners[0].health : "none"}`);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,2)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "setYaw(Math.PI)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "startMelee()");
      await sleep(3000);
      const close = await debug(page, "getState()");
      const closeOk = close.runners[0] && close.runners[0].health === 18;
      record("n03-close", "Valid close strike deals exactly 18", closeOk ? "PASS" : "FAIL",
        `health=${close.runners[0] ? close.runners[0].health : "none"}`);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(1000);
      const cue = await debug(page, "getPowers()");
      const attached = await debug(page, "tryGrapple()");
      const powers = await debug(page, "getPowers()");
      await debug(page, "releaseGrapple()");
      const grappleOk = cue.grappleCue && cue.grappleCue.anchor[2] < 9 && powers.grapple.attached && powers.grapple.anchor[2] < 9;
      record("n05-behind", "No behind-camera grapple", grappleOk ? "PASS" : "FAIL",
        `cue=${cue.grappleCue ? cue.grappleCue.anchor.join(",") : "none"} anchor=${powers.grapple.attached ? powers.grapple.anchor.join(",") : "none"}`);
      await debug(page, "pressJump()");
      await sleep(800);
      await debug(page, "pressJump()");
      await sleep(1500);
      const jump = await debug(page, "getState()");
      const jumpOk = jump.jumpCount === 2 || jump.airJumpsUsed === 1;
      record("accept-double-jump", "Two jump presses register as ground plus air jump", jumpOk ? "PASS" : "FAIL",
        `jumpCount=${jump.jumpCount} airJumpsUsed=${jump.airJumpsUsed}`);
    } catch (e) {
      record("accept-double-jump", "Double jump, melee, grapple acceptance", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(3,1.5,1)");
      await sleep(800);
      const before = await debug(page, "getState()");
      await debug(page, "pressKeyDown(\"KeyD\")");
      let offSample = null;
      const start = Date.now();
      while (Date.now() - start < 20000) {
        const s = await debug(page, "getState()");
        if (s.playerFeet[0] > 3.75 && s.grounded === false) {
          offSample = { feet: s.playerFeet, grounded: s.grounded };
          break;
        }
        await sleep(100);
      }
      await debug(page, "pressKeyUp(\"KeyD\")");
      const ledgeOk = before.grounded === true && offSample && offSample.grounded === false;
      record("n04-ledge", "Stepping off a crate clears grounded", ledgeOk ? "PASS" : "FAIL",
        `beforeGrounded=${before.grounded} offGrounded=${offSample ? offSample.grounded : "none"}`);
      await debug(page, "setPlayerFeet(0,0,-8)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      const healthBefore = (await debug(page, "getState()")).playerHealth;
      await debug(page, "explodeAt(0,1,-4)");
      await sleep(1500);
      const healthAfter = (await debug(page, "getState()")).playerHealth;
      const coverOk = healthBefore === healthAfter;
      record("accept-barrel-cover", "Explosion behind a crate deals no player damage through cover", coverOk ? "PASS" : "FAIL",
        `healthBefore=${healthBefore} healthAfter=${healthAfter}`);
      const barrel = await debug(page, "triggerBarrel(0)");
      await waitFor(page, async () => {
        const b = await debug(page, "getBarrels()");
        return b[0] && b[0].state === "gone";
      }, 90000, "barrel detonates");
      const barrels = await debug(page, "getBarrels()");
      const barrelOk = barrels[0] && barrels[0].state === "gone";
      await page.screenshot({ path: path.join(outDir, "accept-barrel.png") });
      record("accept-barrel", "Triggered barrel detonates and is gone", barrelOk ? "PASS" : "FAIL",
        `trigger=${barrel} barrel0=${barrels[0] ? barrels[0].state : "none"}`);
    } catch (e) {
      record("accept-barrel", "Ledge, cover, barrel acceptance", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      const decals = await debug(page, "getDecals()");
      await debug(page, "setYaw(0.5)");
      await sleep(800);
      const decals2 = await debug(page, "getDecals()");
      const decalOk = decals.length > 0 && decals2.length > 0 && decals[0].x === decals2[0].x && decals[0].normal[2] !== 0;
      record("n10-decal", "Decal stays on its surface after a camera move", decalOk ? "PASS" : "FAIL",
        `decals=${decals.length} normal=${decals[0] ? decals[0].normal.join(",") : "none"}`);
      const sprintPhase = (await debug(page, "getState()")).phase;
      if (sprintPhase !== "playing") {
        await page.click("#startBtn");
        await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock after restart");
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing after restart");
      }
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "pressKeyDown(\"ShiftLeft\")");
      await debug(page, "pressKeyDown(\"KeyW\")");
      await waitFor(page, async () => (await debug(page, "getState()")).playerFeet[2] < 8.0, 20000, "sprint moves forward");
      await debug(page, "pressKeyUp(\"KeyW\")");
      await debug(page, "pressKeyUp(\"ShiftLeft\")");
      const sprint = await debug(page, "getState()");
      const sprintOk = sprint.playerFeet[2] < 8.0;
      record("accept-sprint", "Sprint moves the player forward", sprintOk ? "PASS" : "FAIL",
        `feetZ=${sprint.playerFeet[2].toFixed(2)}`);
      await page.screenshot({ path: path.join(outDir, "accept-gameplay.png") });
    } catch (e) {
      record("accept-sprint", "Decal and sprint acceptance", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const before = await debug(page, "getState()");
      const cycle = await debug(page, "cycleRunners(10)");
      const afterCycle = await debug(page, "getState()");
      await debug(page, "resetGame()");
      await killAll(page);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "wave 2 playing");
      await killAll(page);
      const mid = await debug(page, "getState()");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "wave 3 playing");
      await killAll(page);
      const after = await debug(page, "getState()");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "wave 4 playing");
      await killAll(page);
      const after4 = await debug(page, "getState()");
      const stable = after4.geometries === after.geometries && after4.textures === after.textures;
      record("n08-stability", "Wave 3 and wave 4 clears settle at the same geometry and texture counts", stable ? "PASS" : "FAIL",
        `beforeGeo=${before.geometries} midGeo=${cycle.mid} afterCycleGeo=${cycle.after} wave2Geo=${mid.geometries} wave2Tex=${mid.textures} wave3Geo=${after.geometries} wave3Tex=${after.textures} wave4Geo=${after4.geometries} wave4Tex=${after4.textures} drawCalls=${after4.drawCalls} frameTimeMs=${after4.frameTimeMs}`);
      await page.screenshot({ path: path.join(outDir, "stability.png") });
    } catch (e) {
      record("n08-stability", "Two wave clears and a restart leave counts stable", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await startGame(page);
      const s = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "gameplay-1920.png") });
      record("accept-1920", "Game runs at 1920x1080 with HUD state", "PASS",
        `phase=${s.phase} wave=${s.wave} drawCalls=${s.drawCalls} frameTimeMs=${s.frameTimeMs} triangles=${s.triangles}`);
    } catch (e) {
      record("accept-1920", "Game runs at 1920x1080", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  const failed = results.filter((r) => r.status === "FAIL");
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results, failed: failed.length }, null, 2));
  console.log(`RESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) {
    console.log("FAILURES:");
    for (const f of failed) console.log(` - ${f.id}: ${f.detail}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error("HARNESS ERROR", e);
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results, harnessError: String(e) }, null, 2));
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } catch {}
  try {
    if (server) server.kill();
  } catch {}
}
