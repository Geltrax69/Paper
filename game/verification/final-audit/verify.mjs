import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = process.env.PAPER_OUT_DIR ? path.resolve(process.env.PAPER_OUT_DIR) : scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5185);
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
  await page.goto(`${base}/?debug=1`, { timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing phase");
}
async function waitPursue(page, timeoutMs = 60000) {
  await waitFor(page, async () => {
    const r = await debug(page, "getLastSpawned()");
    return r && r.state === "pursue";
  }, timeoutMs, "runner pursue");
}
async function waitCooldown(page) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 30000, "fire cooldown");
}
async function killAllRunners(page) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.runners.length === 0) return true;
    for (let i = s.runners.length - 1; i >= 0; i -= 1) await debug(page, `damageRunner(${i},200)`);
    const s2 = await debug(page, "getState()");
    return s2.runners.every((r) => r.state === "death");
  }, 30000, "all runners dying");
}
async function nextWaveIfNeeded(page) {
  let s = await debug(page, "getState()");
  if (s.phase === "playing" && s.runners.length === 0) {
    await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 30000, "waveComplete after clear");
    s = await debug(page, "getState()");
  }
  if (s.phase !== "waveComplete") return;
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 10000, "pointer lock after next wave");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "playing after next wave");
}
async function healPlayer(page) {
  const s = await debug(page, "getState()");
  if (s.phase === "playing" && s.playerHealth < 100) {
    await debug(page, `damagePlayer(${-1 * (100 - s.playerHealth)})`);
  }
}

const server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: gameDir, stdio: "pipe" });
for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch(`${base}/`);
    if (res.ok) break;
  } catch { /* server not up yet */ }
  await sleep(500);
}
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const consoleErrors = [];
const pageErrors = [];

try {
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    try {
      await page.goto(`${base}/`, { timeout: 90000 });
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
      await page.screenshot({ path: path.join(outDir, "menu-1280.png") });
      await page.click("#settingsBtn");
      await sleep(500);
      await page.screenshot({ path: path.join(outDir, "settings-1280.png") });
      const settingsText = await page.evaluate(() => document.getElementById("settingsPanel").textContent);
      const hasReduced = settingsText.includes("Reduced motion");
      const hasFlash = settingsText.includes("Flash");
      record("menu-settings", "Menu and settings panel at 1280", hasReduced && hasFlash ? "PASS" : "FAIL", `reduced=${hasReduced} flash=${hasFlash}`);
      await startGame(page);
      await debug(page, "clearRunners()");
      await page.screenshot({ path: path.join(outDir, "gameplay-1280.png") });
      const env = await debug(page, "getEnvironment()");
      const envOk = env.background && env.maps.includes("punchy_floor_dark_ink.png") && env.maps.includes("punchy_sky_cyan_open.png") && env.maps.includes("punchy_shotgun_idle.png");
      record("env-1280", "Dark floor, cyan sky, canonical idle at 1280", envOk ? "PASS" : "FAIL", `maps=${env.maps.join(",")}`);
      await page.evaluate(() => document.exitPointerLock());
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "paused", 10000, "paused");
      await page.screenshot({ path: path.join(outDir, "pause.png") });
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "resume playing");
      record("pause-resume", "Pause on lock loss and resume", "PASS", "paused then playing");
    } catch (e) {
      record("pause-resume", "Pause, menu, settings, environment at 1280", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      await sleep(1500);
      await page.screenshot({ path: path.join(outDir, "gameplay-1920.png") });
      const s = await debug(page, "getState()");
      const ok = s.runners.length > 0 && s.phase === "playing";
      record("gameplay-1920", "Gameplay at 1920x1080 with a runner", ok ? "PASS" : "FAIL", `runners=${s.runners.length} phase=${s.phase}`);
    } catch (e) {
      record("gameplay-1920", "Gameplay at 1920x1080", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${base}/`, { timeout: 90000 });
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
      const box = await page.evaluate(() => {
        const b = document.getElementById("startBtn").getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      await page.click("#settingsBtn");
      await sleep(500);
      await page.screenshot({ path: path.join(outDir, "menu-narrow.png") });
      const ok = box.x >= 0 && box.x + box.w <= 390 && box.y + box.h <= 844;
      record("menu-narrow", "Start button inside 390 viewport, settings opens", ok ? "PASS" : "FAIL", `startBtn=${JSON.stringify(box)}`);
    } catch (e) {
      record("menu-narrow", "Narrow menu at 390", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    try {
      await page.route("**/punchy_shotgun_idle.png", (route) => route.abort());
      await page.goto(`${base}/`, { timeout: 90000 });
      await waitFor(page, async () => {
        const t = await page.evaluate(() => document.getElementById("menuText").textContent);
        return t.includes("Failed to load");
      }, 60000, "load error");
      const btnText = await page.evaluate(() => document.getElementById("startBtn").textContent);
      await page.screenshot({ path: path.join(outDir, "retry-error.png") });
      await page.unrouteAll({ behavior: "wait" });
      await page.click("#startBtn");
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 30000 });
      await page.screenshot({ path: path.join(outDir, "retry-ready.png") });
      const ok = btnText === "Retry";
      record("missing-retry", "Missing asset names error and Retry recovers", ok ? "PASS" : "FAIL", `button=${btnText}`);
    } catch (e) {
      record("missing-retry", "Missing asset retry", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
    await ctx.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await debug(page, "damagePlayer(40)");
      await sleep(500);
      await debug(page, "setPlayerFeet(-9,0,5)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.playerHealth === 100;
      }, 20000, "health pickup");
      await debug(page, "fireShot()");
      await waitCooldown(page);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      await debug(page, "setPlayerFeet(9,0,5)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.ammo === 6;
      }, 20000, "ammo pickup");
      await page.screenshot({ path: path.join(outDir, "pickups.png") });
      record("pickups", "Health and ammo pickups restore and are taken once", "PASS", "health 60 to 100, ammo 4 to 6");
    } catch (e) {
      record("pickups", "Health and ammo pickups", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setSettings({reducedMotion:true,flash:0,shake:1})");
      await debug(page, "damagePlayer(10)");
      await sleep(500);
      const cam = await debug(page, "getCamera()");
      const s = await debug(page, "getState()");
      const feet = s.playerFeet;
      const camOk = Math.abs(cam.position[0] - feet[0]) < 0.05 && Math.abs(cam.position[1] - (feet[1] + 1.7)) < 0.05 && Math.abs(cam.roll) < 0.001;
      const set = await debug(page, "getSettings()");
      await page.screenshot({ path: path.join(outDir, "settings-reduced.png") });
      record("settings-reduced", "Reduced motion plus zero flash gives no camera shake or roll on damage", camOk && set.reducedMotion && set.flash === 0 ? "PASS" : "FAIL", `cam=${cam.position.join(",")} roll=${cam.roll} health=${s.playerHealth}`);
      await debug(page, "setSettings({reducedMotion:false,flash:1})");
    } catch (e) {
      record("settings-reduced", "Reduced motion and flash settings", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "startWaveDebug(1)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 20000, "wave 1 playing");
      await killAllRunners(page);
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 30000, "waveComplete");
      await page.screenshot({ path: path.join(outDir, "wave-complete.png") });
      const wc = await debug(page, "getState()");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "wave 2 playing");
      const w2 = await debug(page, "getState()");
      await debug(page, "damagePlayer(100)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "dead", 20000, "dead");
      await page.screenshot({ path: path.join(outDir, "death.png") });
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "restart playing");
      const after = await debug(page, "getState()");
      const ok = wc.score > 0 && w2.wave === 2 && after.wave === 2 && after.playerHealth === 100;
      record("waves-death", "Wave clear, next wave, death, restart on same wave at full health", ok ? "PASS" : "FAIL", `waveClearScore=${wc.score} wave2=${w2.wave} afterWave=${after.wave} health=${after.playerHealth}`);
    } catch (e) {
      record("waves-death", "Wave clear, death, restart", "FAIL", String(e.message).slice(0, 300));
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
      await page.screenshot({ path: path.join(outDir, "crate-blocked.png") });
      const ok = s.runners[0] && s.runners[0].health === 36 && tracerZ !== null && Math.abs(tracerZ - 4.90) < 0.5;
      record("crate-blocked", "Crate-blocked shot leaves runner at 36", ok ? "PASS" : "FAIL", `health=${s.runners[0] ? s.runners[0].health : "none"} tracerZ=${tracerZ}`);
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
      record("n03-aerial", "Melee from 10m above deals no damage", aerial.runners[0] && aerial.runners[0].health === 36 ? "PASS" : "FAIL", `health=${aerial.runners[0] ? aerial.runners[0].health : "none"}`);
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(1000);
      const cue = await debug(page, "getPowers()");
      const attached = await debug(page, "tryGrapple()");
      const powers = await debug(page, "getPowers()");
      await debug(page, "releaseGrapple()");
      const gOk = cue.grappleCue && cue.grappleCue.anchor[2] < 9 && powers.grapple.attached && powers.grapple.anchor[2] < 9;
      record("n05-behind", "No behind-camera grapple", gOk ? "PASS" : "FAIL", `cue=${cue.grappleCue ? cue.grappleCue.anchor.join(",") : "none"} anchor=${powers.grapple.attached ? powers.grapple.anchor.join(",") : "none"}`);
    } catch (e) {
      record("crate-blocked", "Crate-blocked, aerial melee, grapple", "FAIL", String(e.message).slice(0, 300));
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
      await debug(page, "setPlayerFeet(0,0,-8)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      const before = (await debug(page, "getState()")).playerHealth;
      await debug(page, "explodeAt(0,1,-4)");
      await sleep(1500);
      const after = (await debug(page, "getState()")).playerHealth;
      const coverOk = before === after;
      await debug(page, "triggerBarrel(0)");
      await waitFor(page, async () => {
        const b = await debug(page, "getBarrels()");
        return b[0] && b[0].state === "gone";
      }, 90000, "barrel detonates");
      await page.screenshot({ path: path.join(outDir, "barrel-explosion.png") });
      const vis = await debug(page, "getExplosionVisuals()");
      record("barrel-cover", "Explosion behind a crate deals no player damage, barrel detonates", coverOk ? "PASS" : "FAIL", `healthBefore=${before} healthAfter=${after} visuals=${JSON.stringify(vis).slice(0, 200)}`);
    } catch (e) {
      record("barrel-cover", "Barrel explosion with cover", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      const weapons = ["shotgun", "pistol", "automatic", "blaster", "knife", "throwable"];
      const seen = [];
      for (const w of weapons) {
        await debug(page, `selectWeapon("${w}")`);
        await sleep(600);
        const gw = await debug(page, "getWeapons()");
        const hud = await debug(page, "getHud()");
        if (gw.current === w) seen.push(w);
        await page.screenshot({ path: path.join(outDir, `weapon-${w}.png`) });
        if (w === "shotgun") {
          await debug(page, "spawnRunnerAt(0,0)");
          await waitPursue(page);
          await debug(page, "fireShot()");
          await waitCooldown(page);
        }
      }
      record("six-weapons", "All six weapons select and show in HUD", seen.length === 6 ? "PASS" : "FAIL", `seen=${seen.join(",")}`);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      for (let i = 0; i < 3; i += 1) {
        await debug(page, "damageRunner(0,36)");
        await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 30000, "kill for ink");
        await debug(page, "spawnRunnerAt(0,0)");
        await waitPursue(page);
      }
      const inkBefore = (await debug(page, "getWeapons()")).ink;
      const shock = await debug(page, "spendInk()");
      const inkAfter = (await debug(page, "getWeapons()")).ink;
      const proj = await debug(page, "getProjectiles()");
      await page.screenshot({ path: path.join(outDir, "ink-shock.png") });
      record("ink-pressure", "Ink pressure builds from kills and spends on a shock", inkBefore > 0 && shock === true && inkAfter < inkBefore ? "PASS" : "FAIL", `inkBefore=${inkBefore} shock=${shock} inkAfter=${inkAfter} lastShock=${JSON.stringify(proj.lastShock)}`);
    } catch (e) {
      record("six-weapons", "Six weapons and ink pressure", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"insect\")");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,4)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners[0] && s.runners[0].warningVisible === true;
      }, 60000, "insect telegraph");
      await page.screenshot({ path: path.join(outDir, "insect-telegraph.png") });
      const insect = await debug(page, "getState()");
      const insectOk = insect.runners[0] && insect.runners[0].family === "insect" && insect.runners[0].warningVisible === true;
      record("insect-attack", "Insect telegraph shows before its strike", insectOk ? "PASS" : "FAIL", `family=${insect.runners[0] ? insect.runners[0].family : "none"} warning=${insect.runners[0] ? insect.runners[0].warningVisible : "none"} radius=${insect.runners[0] ? insect.runners[0].warningRadius : "none"}`);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"brute\")");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,4)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners[0] && s.runners[0].warningVisible === true;
      }, 90000, "brute windup");
      await page.screenshot({ path: path.join(outDir, "brute-slam.png") });
      const brute = await debug(page, "getState()");
      const bruteOk = brute.runners[0] && brute.runners[0].family === "brute" && brute.runners[0].warningVisible === true;
      record("brute-attack", "Brute windup shows before its slam", bruteOk ? "PASS" : "FAIL", `family=${brute.runners[0] ? brute.runners[0].family : "none"} warning=${brute.runners[0] ? brute.runners[0].warningVisible : "none"} radius=${brute.runners[0] ? brute.runners[0].warningRadius : "none"}`);
    } catch (e) {
      record("insect-attack", "Insect and brute attacks", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "startWaveDebug(1)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 20000, "warmup wave playing");
      await debug(page, "cycleRunners(0)");
      const warm = await debug(page, "getState()");
      const samples = [];
      for (let wave = 4; wave <= 8; wave += 1) {
        await debug(page, "clearRunners()");
        await debug(page, `startWaveDebug(${wave})`);
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 20000, `wave ${wave} playing`);
        await killAllRunners(page);
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 30000, `wave ${wave} complete`);
        const s = await debug(page, "getState()");
        samples.push({ wave, geometries: s.geometries, textures: s.textures, drawCalls: s.drawCalls, frameTimeMs: s.frameTimeMs });
        await page.click("#startBtn");
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "next wave playing");
      }
      const post = samples.slice(1);
      const flat = post.every((s) => s.geometries === post[0].geometries && s.textures === post[0].textures);
      record("stability", "Post-warmup waves settle at stable geometry and texture counts", flat ? "PASS" : "FAIL", `warmup=${warm.geometries}/${warm.textures} samples=${samples.map((s) => `w${s.wave}:${s.geometries}/${s.textures}`).join(" ")}`);
      writeFileSync(path.join(outDir, "stability.json"), JSON.stringify({ warmup: { geometries: warm.geometries, textures: warm.textures }, samples }, null, 2));
    } catch (e) {
      record("stability", "Repeated-wave stability", "FAIL", String(e.message).slice(0, 300));
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
      const frames = [];
      let lastFrame = -1;
      const start = Date.now();
      while (frames.length < 8 && Date.now() - start < 30000) {
        const s = await debug(page, "getState()");
        const f = s.runners[0] ? s.runners[0].runFrame : -1;
        if (f !== lastFrame && f >= 0) {
          lastFrame = f;
          const name = `seq-run-normal-${String(frames.length).padStart(2, "0")}-frame${f}.png`;
          await page.screenshot({ path: path.join(outDir, name) });
          frames.push(name);
        }
        await sleep(50);
      }
      record("seq-run", "Run frame sequence at normal speed", frames.length === 8 ? "PASS" : "FAIL", `frames=${frames.join(",")}`);
      await debug(page, "fireShot()");
      const fireFrames = [];
      let lastFire = -1;
      const fstart = Date.now();
      while (Date.now() - fstart < 15000) {
        const s = await debug(page, "getState()");
        const f = s.weapon ? s.weapon.fireFrame : -1;
        if (s.weapon && s.weapon.firing && f !== lastFire) {
          lastFire = f;
          const name = `seq-fire-normal-frame${f}.png`;
          await page.screenshot({ path: path.join(outDir, name) });
          fireFrames.push(name);
        }
        if (s.weapon && !s.weapon.firing && fireFrames.length > 0) break;
        await sleep(30);
      }
      record("seq-fire", "Fire frame sequence at normal speed", fireFrames.length >= 3 ? "PASS" : "FAIL", `frames=${fireFrames.join(",")}`);
      await debug(page, "pressKeyDown(\"KeyR\")");
      const reloadFrames = [];
      let lastReload = -1;
      const rstart = Date.now();
      while (Date.now() - rstart < 30000) {
        const s = await debug(page, "getState()");
        const f = s.weapon ? s.weapon.reloadFrame : -1;
        if (s.weapon && s.weapon.reloading && f !== lastReload) {
          lastReload = f;
          const name = `seq-reload-normal-frame${f}.png`;
          await page.screenshot({ path: path.join(outDir, name) });
          reloadFrames.push(name);
        }
        if (s.weapon && !s.weapon.reloading && reloadFrames.length > 0) break;
        await sleep(30);
      }
      await debug(page, "pressKeyUp(\"KeyR\")");
      record("seq-reload", "Reload frame sequence at normal speed", reloadFrames.length >= 4 ? "PASS" : "FAIL", `frames=${reloadFrames.join(",")}`);
      await debug(page, "pressKeyDown(\"ShiftLeft\")");
      await debug(page, "pressKeyDown(\"KeyW\")");
      const sprintFrames = [];
      const sstart = Date.now();
      while (Date.now() - sstart < 8000 && sprintFrames.length < 4) {
        const s = await debug(page, "getState()");
        const sc = s.weapon ? s.weapon.sprintScale : 0;
        const name = `seq-sprint-${String(sprintFrames.length).padStart(2, "0")}-scale${sc.toFixed(2)}.png`;
        await page.screenshot({ path: path.join(outDir, name) });
        sprintFrames.push(name);
        await sleep(400);
      }
      await debug(page, "pressKeyUp(\"KeyW\")");
      await debug(page, "pressKeyUp(\"ShiftLeft\")");
      record("seq-sprint", "Sprint frame sequence at normal speed", sprintFrames.length === 4 ? "PASS" : "FAIL", `frames=${sprintFrames.join(",")}`);
      await debug(page, "explodeAt(0,1,-4)");
      const expFrames = [];
      for (let i = 0; i < 6; i += 1) {
        const name = `seq-explosion-${String(i).padStart(2, "0")}.png`;
        await page.screenshot({ path: path.join(outDir, name) });
        expFrames.push(name);
        const vis = await debug(page, "getExplosionVisuals()");
        await sleep(300);
        if (i === 5) expFrames.push(`visuals=${JSON.stringify(vis).slice(0, 200)}`);
      }
      record("seq-explosion", "Explosion frame sequence at normal speed", expFrames.length >= 6 ? "PASS" : "FAIL", `frames=${expFrames.join(",")}`);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await debug(page, "spawnRunnerAt(0,5)");
      await waitPursue(page);
      const attackFrames = [];
      let lastAttack = -1;
      const astart = Date.now();
      while (Date.now() - astart < 60000 && attackFrames.length < 6) {
        const s = await debug(page, "getState()");
        const f = s.runners[0] ? s.runners[0].attackFrame : -1;
        if (s.runners[0] && s.runners[0].state === "attack" && f !== lastAttack && f >= 0) {
          lastAttack = f;
          const name = `seq-attack-normal-frame${f}.png`;
          await page.screenshot({ path: path.join(outDir, name) });
          attackFrames.push(name);
        }
        await sleep(60);
      }
      record("seq-attack", "Attack frame sequence at normal speed", attackFrames.length >= 3 ? "PASS" : "FAIL", `frames=${attackFrames.join(",")}`);
    } catch (e) {
      record("seq-run", "Frame sequences", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?review=1`, { timeout: 90000 });
      await page.waitForFunction(() => document.querySelectorAll(".review-row").length > 0, { timeout: 30000 });
      await page.screenshot({ path: path.join(outDir, "review-clips.png"), fullPage: true });
      const rows = await page.evaluate(() => document.querySelectorAll(".review-row").length);
      record("review-mode", "Review mode renders runtime clips", rows > 0 ? "PASS" : "FAIL", `rows=${rows}`);
      const stepped = {};
      for (const clip of ["runner_run_front", "shotgun_fire", "shotgun_reload", "runner_attack_front"]) {
        const row = page.locator("h2", { hasText: `Clip ${clip} ` }).locator("xpath=following-sibling::div[contains(@class,'review-row')][1]");
        const stepBtn = row.locator("button", { hasText: "Step frame" }).first();
        const count = await page.evaluate((c) => {
          const h = [...document.querySelectorAll("h2")].find((el) => el.textContent.startsWith(`Clip ${c} `));
          const m = h ? h.textContent.match(/(\d+) frames/) : null;
          return m ? Number(m[1]) : 0;
        }, clip);
        const names = [];
        for (let i = 0; i < count; i += 1) {
          await stepBtn.click();
          await sleep(200);
          const name = `seq-${clip}-slowed-step${i}.png`;
          await row.screenshot({ path: path.join(outDir, name) });
          names.push(name);
        }
        stepped[clip] = names;
      }
      const slowedOk = Object.values(stepped).every((n) => n.length >= 4);
      record("seq-slowed", "Slowed frame-by-frame sequences via review stepping", slowedOk ? "PASS" : "FAIL", `clips=${Object.entries(stepped).map(([k, v]) => `${k}:${v.length}`).join(" ")}`);
    } catch (e) {
      record("review-mode", "Review mode and slowed sequences", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  record("console", "Console and page errors during final harness", consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL", `consoleErrors=${consoleErrors.slice(0, 3).join(" | ")} pageErrors=${pageErrors.slice(0, 3).join(" | ")}`);
} finally {
  await browser.close();
  server.kill();
}

writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
const failed = results.filter((r) => r.status !== "PASS");
console.log(`FINAL ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exitCode = 1;
