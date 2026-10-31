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
const base = "http://127.0.0.1:5179";
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
    await sleep(200);
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
async function waitPursue(page, timeoutMs = 20000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners[0] && s.runners[0].state === "pursue";
  }, timeoutMs, "runner pursue");
}
async function waitAllPursue(page, count, timeoutMs = 30000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners.length === count && s.runners.every((r) => r.state === "pursue");
  }, timeoutMs, "all runners pursue");
}
async function pauseGame(page) {
  await page.evaluate("document.exitPointerLock()");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "paused", 5000, "paused phase");
}
async function waitCooldown(page) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 20000, "fire cooldown");
}

let server = null;
let browser = null;
try {
  try {
    execSync("npm run build", { cwd: gameDir, stdio: "pipe", timeout: 120000 });
    record("build", "npm run build", "PASS", "tsc and vite build succeeded");
  } catch (e) {
    record("build", "npm run build", "FAIL", String(e.message).slice(0, 300));
    throw e;
  }
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5179", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,6)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      await debug(page, "fireShot()");
      const fx = await debug(page, "getFx()");
      const last = await debug(page, "getLastShotFx()");
      const ok = last.runnerTargets === 1 && fx.inkStars <= 3;
      record("c01-grouped", "One shot on one runner gives one grouped impact for that target, not one per pellet", ok ? "PASS" : "FAIL",
        `runnerTargets=${last.runnerTargets} surfaceOwners=${last.surfaceOwners.join(",")} inkStars=${fx.inkStars} fragments=${fx.fragments} flashes=${fx.flashes} sparks=${fx.sparks} pooled=${fx.pooled} textures=${fx.textures}`);
    } catch (e) { record("c01-grouped", "One shot on one runner gives one ink star and one fragment set, not one per pellet", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,6)");
      await waitPursue(page);
      await debug(page, "damageRunner(0,24)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      await debug(page, "fireShot()");
      const fx = await debug(page, "getFx()");
      const last = await debug(page, "getLastShotFx()");
      await page.screenshot({ path: path.join(outDir, "impact-heavy.png") });
      const ok = last.runnerTargets === 1 && fx.fragments >= 5 && fx.inkStars >= 1;
      record("c01-heavy", "Killing shot gives one grouped heavy impact with at least five fragments", ok ? "PASS" : "FAIL",
        `runnerTargets=${last.runnerTargets} inkStars=${fx.inkStars} fragments=${fx.fragments} sparks=${fx.sparks} flashes=${fx.flashes}`);
    } catch (e) { record("c01-heavy", "Killing shot gives one heavy impact with five fragments", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-7,0,-1)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      await debug(page, "triggerBarrel(3)");
      const warned = await debug(page, "getBarrels()");
      const warningSeen = warned[3] && warned[3].state === "warning";
      await page.screenshot({ path: path.join(outDir, "explosion-warning.png") });
      await waitFor(page, async () => (await debug(page, "getBarrels()"))[3].state === "gone", 5000, "barrel gone");
      await sleep(120);
      await page.screenshot({ path: path.join(outDir, "explosion-bloom.png") });
      const bloomFx = await debug(page, "getFx()");
      await sleep(550);
      await page.screenshot({ path: path.join(outDir, "explosion-smoke.png") });
      await sleep(650);
      await page.screenshot({ path: path.join(outDir, "explosion-terminal.png") });
      const terminalFx = await debug(page, "getFx()");
      const terminalActive = await debug(page, "getActiveExplosion()");
      const ok = warningSeen && bloomFx.explosions === 1 && terminalFx.explosions === 0 && terminalActive === null;
      record("c01-explosion-seq", "Explosion runs warning, bloom, smoke, then a fading terminal phase with nothing lingering", ok ? "PASS" : "FAIL",
        `warningSeen=${warningSeen} bloomExplosions=${bloomFx.explosions} terminalExplosions=${terminalFx.explosions} terminalActive=${terminalActive}`);
    } catch (e) { record("c01-explosion-seq", "Explosion runs warning, bloom, smoke, then a fading terminal phase with nothing lingering", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-9,0,9)");
      await debug(page, "spawnRunnerAt(0.5,6)");
      await debug(page, "spawnRunnerAt(2,6)");
      await debug(page, "spawnRunnerAt(3.5,6)");
      await waitAllPursue(page, 3);
      await pauseGame(page);
      const frozen = (await debug(page, "getState()")).runners.map((r) => `${r.x.toFixed(2)},${r.z.toFixed(2)}`).join(" | ");
      const damage = await debug(page, "explodeAt(0,0.55,6)");
      const runnerHits = damage.hits.filter((h) => h.kind !== "player").sort((a, b) => a.distance - b.distance);
      const monotonic = runnerHits.length === 3 &&
        runnerHits[0].damage > runnerHits[1].damage && runnerHits[1].damage > runnerHits[2].damage;
      const formula = runnerHits.every((h) => Math.abs(h.damage - Math.round(60 * (1 - h.distance / 4.5))) <= 4);
      record("c01-falloff", "Explosion damage falls with distance by the stated linear rule", monotonic && formula ? "PASS" : "FAIL",
        `frozen=${frozen} hits=${runnerHits.map((h) => `d=${h.distance.toFixed(2)} dmg=${h.damage} blocked=${h.blocked}`).join(" | ")} monotonic=${monotonic} formula=${formula}`);
    } catch (e) { record("c01-falloff", "Explosion damage falls with distance by the stated linear rule", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,-8)");
      await debug(page, "spawnRunnerAt(3,-4)");
      await waitAllPursue(page, 2);
      await pauseGame(page);
      const frozen = (await debug(page, "getState()")).runners.map((r) => `${r.x.toFixed(2)},${r.z.toFixed(2)}`).join(" | ");
      const damage = await debug(page, "explodeAt(0,0.55,-4)");
      const blockedHits = damage.hits.filter((h) => h.blocked);
      const openHits = damage.hits.filter((h) => !h.blocked && h.damage > 0 && h.kind !== "player");
      const ok = blockedHits.length >= 1 && openHits.length >= 1;
      record("c01-cover", "A crate between explosion and runner blocks that runner's damage", ok ? "PASS" : "FAIL",
        `frozen=${frozen} hits=${damage.hits.map((h) => `${h.kind} d=${h.distance.toFixed(2)} dmg=${h.damage} blocked=${h.blocked}`).join(" | ")}`);
    } catch (e) { record("c01-cover", "A crate between explosion and runner blocks that runner's damage", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "triggerBarrel(0)");
      let chainWarningSeen = false;
      const start = Date.now();
      while (Date.now() - start < 10000) {
        const barrels = await debug(page, "getBarrels()");
        if (barrels[1] && barrels[1].state === "warning") {
          chainWarningSeen = true;
          await page.screenshot({ path: path.join(outDir, "chain-warning.png") });
          break;
        }
        if (barrels[0] && barrels[0].state === "gone" && barrels[1] && barrels[1].state === "idle") {
          await sleep(50);
          continue;
        }
        await sleep(50);
      }
      await waitFor(page, async () => {
        const barrels = await debug(page, "getBarrels()");
        return barrels[0].state === "gone" && barrels[1].state === "gone" && barrels[2].state === "gone";
      }, 10000, "chain complete");
      const barrels = await debug(page, "getBarrels()");
      const ok = chainWarningSeen && barrels[0].chainDepth === 0 && barrels[1].chainDepth === 1 && barrels[2].chainDepth === 2 && barrels[3].state === "idle";
      record("c01-chain", "Chain runs at most depth 2 with a warning before the second detonation, and the far barrel stays idle", ok ? "PASS" : "FAIL",
        `warningSeen=${chainWarningSeen} depths=${barrels.map((b) => b.chainDepth).join(",")} states=${barrels.map((b) => b.state).join(",")}`);
    } catch (e) { record("c01-chain", "Chain runs at most depth 2 with a warning before the second detonation, and the far barrel stays idle", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(3,0,5)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "fireShot()");
      await sleep(600);
      await page.screenshot({ path: path.join(outDir, "crate-shot.png") });
      const barrels = await debug(page, "getBarrels()");
      const fx = await debug(page, "getFx()");
      const damage = await debug(page, "getExplosionDamage()");
      const ok = barrels.every((b) => b.state === "idle") && fx.explosions === 0 && damage === null;
      record("c01-crate-never", "Shooting an ordinary crate never explodes anything", ok ? "PASS" : "FAIL",
        `barrels=${barrels.map((b) => b.state).join(",")} explosions=${fx.explosions} damage=${damage}`);
    } catch (e) { record("c01-crate-never", "Shooting an ordinary crate never explodes anything", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "setSettings({\"reducedMotion\":true})");
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await sleep(500);
      const healthBefore = (await debug(page, "getState()")).playerHealth;
      await debug(page, "explodeAt(0,0.55,7)");
      const samples = [];
      for (let i = 0; i < 6; i += 1) {
        const cam = await debug(page, "getCamera()");
        const s = await debug(page, "getState()");
        samples.push({ cam, feet: s.playerFeet });
        await sleep(60);
      }
      const shaken = samples.some((entry) =>
        Math.abs(entry.cam.position[0] - entry.feet[0]) > 0.01 ||
        Math.abs(entry.cam.position[1] - (entry.feet[1] + 1.7)) > 0.01 ||
        Math.abs(entry.cam.position[2] - entry.feet[2]) > 0.01);
      const rolled = samples.some((entry) => Math.abs(entry.cam.roll) > 0.001);
      const after = await debug(page, "getState()");
      const fx = await debug(page, "getFx()");
      await page.screenshot({ path: path.join(outDir, "reduced-explosion.png") });
      const ok = !shaken && !rolled && after.playerHealth < healthBefore && fx.explosions >= 1;
      record("c01-reduced", "Reduced-motion explosion has no camera shake or roll, but damage and visible effects still land", ok ? "PASS" : "FAIL",
        `shaken=${shaken} rolled=${rolled} health=${healthBefore}->${after.playerHealth} explosions=${fx.explosions}`);
    } catch (e) { record("c01-reduced", "Reduced-motion explosion has no camera shake or roll, but damage and visible effects still land", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "setSettings({\"flash\":0})");
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await sleep(500);
      await debug(page, "explodeAt(0,0.55,6)");
      await sleep(100);
      const visuals = await debug(page, "getExplosionVisuals()");
      const damage = await debug(page, "getExplosionDamage()");
      await page.screenshot({ path: path.join(outDir, "zero-flash.png") });
      const playerHit = damage.hits.find((h) => h.kind === "player");
      const ok = visuals && !visuals.coreVisible && !visuals.bloomVisible && visuals.ringVisible && playerHit && playerHit.damage > 0;
      record("c01-zero-flash", "Zero flash hides bright core and bloom but keeps the ring and the damage", ok ? "PASS" : "FAIL",
        `visuals=${JSON.stringify(visuals)} playerDamage=${playerHit ? playerHit.damage : "none"}`);
    } catch (e) { record("c01-zero-flash", "Zero flash hides bright core and bloom but keeps the ring and the damage", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,-3)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,5)");
      await debug(page, "setYaw(0)");
      await sleep(500);
      const ammo0 = (await debug(page, "getState()")).ammo;
      await debug(page, "fireShot()");
      await waitCooldown(page);
      await debug(page, "fireShot()");
      const ammo2 = (await debug(page, "getState()")).ammo;
      const ok = ammo0 === 6 && ammo2 === 4;
      record("accept-shots", "Two shots use two ammo", ok ? "PASS" : "FAIL", `ammo ${ammo0}->${ammo2}`);
    } catch (e) { record("accept-shots", "Two shots use two ammo", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      for (let i = 0; i < 6; i += 1) {
        await debug(page, "fireShot()");
        await waitCooldown(page);
      }
      const empty = (await debug(page, "getState()")).ammo;
      await debug(page, "fireShot()");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.weapon.reloadProgress01 >= 0.5;
      }, 30000, "reload past transfer point");
      const mid = await debug(page, "getState()");
      await waitFor(page, async () => (await debug(page, "getState()")).weapon.reloading === false, 30000, "reload finished");
      const done = await debug(page, "getState()");
      const ok = empty === 0 && mid.weapon.reloadTransferred === true && mid.ammo === 6 && done.weapon.reloading === false;
      record("accept-reload", "Reload transfers ammo at the loading pose and then recovers to idle", ok ? "PASS" : "FAIL",
        `empty=${empty} midTransferred=${mid.weapon.reloadTransferred} midAmmo=${mid.ammo} doneReloading=${done.weapon.reloading}`);
    } catch (e) { record("accept-reload", "Reload transfers ammo at the loading pose and then recovers to idle", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,6)");
      await waitPursue(page);
      const score0 = (await debug(page, "getState()")).score;
      await debug(page, "damageRunner(0,36)");
      await sleep(300);
      const dying = await debug(page, "getState()");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 10000, "runner removed");
      const score1 = (await debug(page, "getState()")).score;
      const ok = dying.runners[0] && dying.runners[0].state === "death" && score1 === score0 + 350;
      record("accept-kill", "Kill plays the defeat clip, removes the runner, and scores once plus the wave bonus", ok ? "PASS" : "FAIL",
        `dyingState=${dying.runners[0] ? dying.runners[0].state : "none"} score ${score0}->${score1}`);
    } catch (e) { record("accept-kill", "Kill plays the defeat clip, removes the runner, and scores once", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "damagePlayer(100)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "dead", 5000, "dead phase");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "restart playing");
      const s = await debug(page, "getState()");
      const ok = s.playerHealth === 100;
      record("accept-death", "Death restarts the wave at full health", ok ? "PASS" : "FAIL", `health=${s.playerHealth} phase=${s.phase}`);
    } catch (e) { record("accept-death", "Death restarts the wave at full health", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-6,0,8)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await debug(page, "spawnRunnerAt(-6,1)");
      await waitPursue(page);
      await pauseGame(page);
      const frozen = (await debug(page, "getState()")).runners.map((r) => `${r.x.toFixed(2)},${r.z.toFixed(2)}`).join(" | ");
      await debug(page, "fireShot()");
      await sleep(500);
      const s = await debug(page, "getState()");
      const decals = await debug(page, "getDecals()");
      const ok = s.runners[0] && s.runners[0].health === 36 && decals.some((d) => d.owner === "crate(-6,4)");
      record("accept-blocked", "Tall-crate-blocked shot deals no damage and leaves a crate decal", ok ? "PASS" : "FAIL",
        `frozen=${frozen} runnerHealth=${s.runners[0] ? s.runners[0].health : "none"} crateDecal=${decals.some((d) => d.owner === "crate(-6,4)")}`);
    } catch (e) { record("accept-blocked", "Crate-blocked shot deals no damage and leaves a crate decal", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,-3)");
      await waitPursue(page);
      await debug(page, "setRunnerDirection(0, \"back\")");
      const s = await debug(page, "getState()");
      const ok = s.runners[0] && s.runners[0].direction === "back";
      record("accept-directional", "Direction override switches the run clip to back", ok ? "PASS" : "FAIL",
        `direction=${s.runners[0] ? s.runners[0].direction : "none"}`);
    } catch (e) { record("accept-directional", "Direction override switches the run clip to back", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const start = Date.now();
      while (Date.now() - start < 90000) {
        const s = await debug(page, "getState()");
        if (s.phase === "waveComplete") break;
        if (s.runners.length > 0) {
          await debug(page, "damageRunner(0,36)");
          await sleep(900);
        } else {
          await sleep(500);
        }
      }
      const s = await debug(page, "getState()");
      const ok = s.phase === "waveComplete" && s.score >= 850;
      record("accept-wave", "Wave 1 clears with kills plus the wave bonus", ok ? "PASS" : "FAIL", `phase=${s.phase} score=${s.score}`);
    } catch (e) { record("accept-wave", "Wave 1 clears with kills plus the wave bonus", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "pressKeyDown(\"ShiftLeft\")");
      await debug(page, "pressKeyDown(\"KeyW\")");
      await sleep(600);
      const s = await debug(page, "getState()");
      await debug(page, "pressKeyUp(\"KeyW\")");
      await debug(page, "pressKeyUp(\"ShiftLeft\")");
      const ok = s.weapon.sprintScale > 1.05;
      record("accept-sprint", "Sprinting while moving scales the weapon toward 1.1", ok ? "PASS" : "FAIL", `sprintScale=${s.weapon.sprintScale}`);
    } catch (e) { record("accept-sprint", "Sprinting while moving scales the weapon toward 1.1", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "pressJump()");
      await sleep(300);
      await debug(page, "pressJump()");
      await sleep(300);
      const s = await debug(page, "getState()");
      const ok = s.jumpCount === 2 && s.airJumpsUsed === 1;
      record("accept-doublejump", "Second midair jump counts once as the air jump", ok ? "PASS" : "FAIL", `jumpCount=${s.jumpCount} airJumpsUsed=${s.airJumpsUsed}`);
    } catch (e) { record("accept-doublejump", "Second midair jump counts once as the air jump", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "setYaw(0)");
      await sleep(500);
      await debug(page, "tryGrapple()");
      const powers = await debug(page, "getPowers()");
      const ok = powers.grapple.attached && powers.grapple.anchor[0] === 0 && powers.grapple.anchor[2] === -6;
      record("accept-grapple", "Grapple attaches to the nearest forward anchor, the crate top", ok ? "PASS" : "FAIL",
        `attached=${powers.grapple.attached} anchor=${powers.grapple.attached ? powers.grapple.anchor.join(",") : "none"}`);
    } catch (e) { record("accept-grapple", "Grapple attaches to the forward wall-top anchor", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "setYaw(Math.PI)");
      await debug(page, "setPitch(0)");
      await debug(page, "spawnRunnerAt(0,2)");
      await waitPursue(page);
      await sleep(300);
      await debug(page, "startMelee()");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners[0] && s.runners[0].health === 18;
      }, 20000, "melee damage");
      const s = await debug(page, "getState()");
      const ok = s.runners[0] && s.runners[0].health === 18;
      record("accept-melee", "Close melee strike deals exactly 18", ok ? "PASS" : "FAIL", `runnerHealth=${s.runners[0] ? s.runners[0].health : "none"}`);
    } catch (e) { record("accept-melee", "Close melee strike deals exactly 18", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,2)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,10,1.5)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(-1)");
      await sleep(800);
      await debug(page, "startMelee()");
      await sleep(1500);
      const s = await debug(page, "getState()");
      const ok = s.runners[0] && s.runners[0].health === 36;
      record("n03-aerial", "Melee from far above deals no damage", ok ? "PASS" : "FAIL",
        `runnerHealth=${s.runners[0] ? s.runners[0].health : "none"} playerFeet=${s.playerFeet.map((v) => v.toFixed(2)).join(",")}`);
    } catch (e) { record("n03-aerial", "Melee from far above deals no damage", "FAIL", String(e.message).slice(0, 300)); }
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
      while (Date.now() - start < 10000) {
        const s = await debug(page, "getState()");
        if (s.playerFeet[0] > 4.2 && s.grounded === false && !offSample) offSample = { feet: s.playerFeet, grounded: s.grounded };
        if (offSample && s.grounded) break;
        await sleep(100);
      }
      await debug(page, "pressKeyUp(\"KeyD\")");
      await waitFor(page, async () => (await debug(page, "getState()")).grounded === true, 25000, "grounded");
      const ok = before.grounded === true && offSample && offSample.grounded === false;
      record("n04-ledge", "Stepping off a crate clears grounded in midair", ok ? "PASS" : "FAIL",
        `beforeGrounded=${before.grounded} offGrounded=${offSample ? offSample.grounded : "none"} offFeet=${offSample ? offSample.feet.map((v) => v.toFixed(2)).join(",") : "none"}`);
    } catch (e) { record("n04-ledge", "Stepping off a crate clears grounded in midair", "FAIL", String(e.message).slice(0, 300)); }
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
      await sleep(1000);
      await debug(page, "tryGrapple()");
      const attached = await debug(page, "getPowers()");
      const ok = attached.grapple.attached && attached.grapple.anchor[2] < 9;
      record("n05-behind", "Grapple never attaches to an anchor behind the camera", ok ? "PASS" : "FAIL",
        `attached=${attached.grapple.attached} anchor=${attached.grapple.attached ? attached.grapple.anchor.join(",") : "none"}`);
    } catch (e) { record("n05-behind", "Grapple never attaches to an anchor behind the camera", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(3,0,5)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "fireShot()");
      await sleep(500);
      const decals1 = await debug(page, "getDecals()");
      const crateDecal = decals1.find((d) => d.owner === "crate(3,1)");
      await debug(page, "setPlayerFeet(2,0,5)");
      await debug(page, "setYaw(0.5)");
      await sleep(1000);
      const decals2 = await debug(page, "getDecals()");
      const crateDecal2 = decals2.find((d) => d.owner === "crate(3,1)");
      const same = crateDecal && crateDecal2 &&
        Math.abs(crateDecal.x - crateDecal2.x) < 0.01 && Math.abs(crateDecal.y - crateDecal2.y) < 0.01 && Math.abs(crateDecal.z - crateDecal2.z) < 0.01 &&
        JSON.stringify(crateDecal.quaternion) === JSON.stringify(crateDecal2.quaternion);
      const ok = same && crateDecal && Math.abs(crateDecal.normal[2] - 1) < 0.01;
      record("n10-decal", "Crate decal stays flush to its surface when the camera moves", ok ? "PASS" : "FAIL",
        `same=${same} normal=${crateDecal ? crateDecal.normal.map((v) => v.toFixed(2)).join(",") : "none"}`);
    } catch (e) { record("n10-decal", "Crate decal stays flush to its surface when the camera moves", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const hud = await debug(page, "getHud()");
      const ok = hud.waveNum === "1" && hud.ammoCount.includes("6");
      record("accept-hud", "Comic HUD shows wave 1 and six ammo at start", ok ? "PASS" : "FAIL", `hud=${JSON.stringify(hud)}`);
    } catch (e) { record("accept-hud", "Comic HUD shows wave 1 and six ammo at start", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} catch (e) {
  record("harness", "Harness run", "FAIL", String(e.message).slice(0, 500));
} finally {
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results }, null, 2));
  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(`TOTAL ${passed}/${results.length} PASS`);
  if (browser) await browser.close();
  if (server) server.kill();
}
