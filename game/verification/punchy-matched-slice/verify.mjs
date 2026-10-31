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
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function startGame(page) {
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 20000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 8000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 8000, "playing phase");
}
async function waitReloading(page, want, timeoutMs = 30000) {
  await waitFor(page, async () => (await debug(page, "getState()")).weapon.reloading === want, timeoutMs, `reloading=${want}`);
}
async function waitCooldown(page, timeoutMs = 30000) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs <= 0, timeoutMs, "fire cooldown");
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
      const hud0 = await debug(page, "getHud()");
      await page.screenshot({ path: path.join(outDir, "hud-banner.png") });
      record("hud-banner", "Wave banner shows on wave start", hud0.waveBannerVisible ? "PASS" : "FAIL", `banner=${hud0.waveBanner} visible=${hud0.waveBannerVisible} waveNum=${hud0.waveNum}`);
      const env = await debug(page, "getEnvironment()");
      const hasFloor = env.maps.some((m) => m.includes("punchy_floor_dark_ink"));
      const hasIdle = env.maps.some((m) => m.includes("punchy_shotgun_idle"));
      record("env", "Dark floor, canonical idle loaded, sky background present", hasFloor && hasIdle && env.background ? "PASS" : "FAIL", `background=${env.background} maps=${env.maps.join(",")}`);
      await page.screenshot({ path: path.join(outDir, "gameplay-1280.png") });

      await debug(page, "clearRunners()");
      const runner = await debug(page, "spawnRunnerAt(0, 2)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "pursue", 30000, "runner pursue");
      await debug(page, "setRunnerDirection(0, 'front')");
      await sleep(800);
      const st = await debug(page, "getState()");
      record("front-run", "Front run clip is the punchy replacement", st.runners[0].runClip === "runner_run_front" ? "PASS" : "FAIL", `runClip=${st.runners[0].runClip} runFrame=${st.runners[0].runFrame} direction=${st.runners[0].direction}`);
      await page.screenshot({ path: path.join(outDir, "monster-run.png") });

      await debug(page, "setRunnerDirection(0, 'back')");
      await sleep(500);
      const stBack = await debug(page, "getState()");
      record("directional", "Other directions still use the older set", stBack.runners[0].runClip === "runner_run_back" ? "PASS" : "FAIL", `runClip=${stBack.runners[0].runClip}`);

      await debug(page, "clearRunners()");
      await debug(page, "fireShot()");
      const sawFiring = await waitFor(page, async () => (await debug(page, "getState()")).weapon.firing === true, 10000, "firing");
      await page.screenshot({ path: path.join(outDir, "fire-peak.png") });
      const stFire = await debug(page, "getState()");
      record("fire", "Shot fires with existing diagonal clip", sawFiring && stFire.ammo === 5 ? "PASS" : "FAIL", `sawFiring=${sawFiring} fireFrame=${stFire.weapon.fireFrame} ammo=${stFire.ammo}`);

      await waitCooldown(page);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      let stAmmo = await debug(page, "getState()");
      record("two-shots", "Two shots spend ammo", stAmmo.ammo === 4 ? "PASS" : "FAIL", `ammo=${stAmmo.ammo}`);

      await debug(page, "pressKeyDown('KeyR')");
      await waitReloading(page, true);
      await waitFor(page, async () => (await debug(page, "getState()")).weapon.reloadProgress01 >= 0.48, 30000, "reload transfer point");
      const stReloadMid = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "reload-transfer.png") });
      record("reload-transfer", "Ammo transfers at the loading frame", stReloadMid.weapon.reloadTransferred === true && stReloadMid.ammo === 6 && stReloadMid.weapon.reloadFrame === 4 ? "PASS" : "FAIL", `frame=${stReloadMid.weapon.reloadFrame} transferred=${stReloadMid.weapon.reloadTransferred} ammo=${stReloadMid.ammo} progress=${stReloadMid.weapon.reloadProgress01}`);
      await waitReloading(page, false);
      const stReloadDone = await debug(page, "getState()");
      record("reload-done", "Reload finishes at 6 with idle recovered", stReloadDone.ammo === 6 && stReloadDone.weapon.reloading === false ? "PASS" : "FAIL", `ammo=${stReloadDone.ammo}`);

      await debug(page, "fireShot()");
      await waitCooldown(page);
      await debug(page, "pressKeyDown('KeyR')");
      await waitReloading(page, true);
      await debug(page, "fireShot()");
      await sleep(600);
      const stCancelBefore = await debug(page, "getState()");
      record("reload-cancel-before", "Cancel before transfer keeps old ammo", stCancelBefore.weapon.reloading === false && stCancelBefore.weapon.reloadTransferred === false && stCancelBefore.ammo === 4 ? "PASS" : "FAIL", `ammo=${stCancelBefore.ammo} transferred=${stCancelBefore.weapon.reloadTransferred} reloading=${stCancelBefore.weapon.reloading}`);

      await waitCooldown(page);
      await debug(page, "pressKeyDown('KeyR')");
      await waitReloading(page, true);
      await waitFor(page, async () => (await debug(page, "getState()")).weapon.reloadTransferred === true, 30000, "transfer before cancel");
      await debug(page, "fireShot()");
      await sleep(600);
      const stCancelAfter = await debug(page, "getState()");
      record("reload-cancel-after", "Cancel after transfer keeps transferred ammo minus the shot", stCancelAfter.weapon.reloading === false && stCancelAfter.weapon.reloadTransferred === true && stCancelAfter.ammo === 5 ? "PASS" : "FAIL", `ammo=${stCancelAfter.ammo} transferred=${stCancelAfter.weapon.reloadTransferred}`);

      await debug(page, "pressKeyDown('ShiftLeft')");
      await debug(page, "pressKeyDown('KeyW')");
      await sleep(2500);
      const stSprint = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "sprint.png") });
      record("sprint", "Sprint scale rises while actually travelling", stSprint.weapon.sprintScale > 1.0 ? "PASS" : "FAIL", `sprintScale=${stSprint.weapon.sprintScale}`);
      await debug(page, "pressKeyUp('KeyW')");
      await debug(page, "pressKeyUp('ShiftLeft')");

      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0, 5)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "attack", 60000, "runner attack");
      await page.screenshot({ path: path.join(outDir, "monster-attack.png") });
      const stAttack = await debug(page, "getState()");
      record("monster-attack", "Runner reaches attack state", stAttack.runners[0]?.state === "attack" ? "PASS" : "FAIL", `state=${stAttack.runners[0]?.state} attackFrame=${stAttack.runners[0]?.attackFrame}`);

      await debug(page, "setPlayerFeet(0, 0, 9)");
      await debug(page, "setYaw(0)");
      await debug(page, "clearRunners()");
      await waitCooldown(page);
      const scoreBeforeKill = (await debug(page, "getState()")).score;
      await debug(page, "spawnRunnerAt(0, 2)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "pursue", 30000, "runner pursue for kill");
      await debug(page, "fireShot()");
      try {
        await waitFor(page, async () => (await debug(page, "getState()")).score > scoreBeforeKill, 8000, "kill score first shot");
      } catch {
        await waitCooldown(page);
        await debug(page, "fireShot()");
        await waitFor(page, async () => (await debug(page, "getState()")).score > scoreBeforeKill, 30000, "kill score second shot");
      }
      const hudKill = await debug(page, "getHud()");
      const stKill = await debug(page, "getState()");
      record("kill-hud", "Kill shows kill hitmarker and a comic word", hudKill.hitmarker === "✕" && hudKill.comicWords >= 1 ? "PASS" : "FAIL", `hitmarker=${hudKill.hitmarker} comicWords=${hudKill.comicWords} score=${stKill.score} before=${scoreBeforeKill} combo=${stKill.combo}`);
      await page.screenshot({ path: path.join(outDir, "hud-kill.png") });
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 30000, "wave complete after kill");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "playing after wave advance");
      const hudCombo = await debug(page, "getHud()");
      record("combo-card", "Combo card shows a live count", hudCombo.comboCount === String(stKill.combo) && stKill.combo >= 1 ? "PASS" : "FAIL", `comboCount=${hudCombo.comboCount} combo=${stKill.combo}`);

      await debug(page, "clearRunners()");
      const healthBefore = (await debug(page, "getState()")).playerHealth;
      await debug(page, "damagePlayer(20)");
      await sleep(500);
      const stHealth = await debug(page, "getState()");
      const edge = await page.evaluate("document.getElementById('damageEdge').style.opacity");
      await page.screenshot({ path: path.join(outDir, "hud-health.png") });
      record("health", "Health number drops live with an edge mark", stHealth.playerHealth === healthBefore - 20 && Number(edge) > 0 ? "PASS" : "FAIL", `health=${stHealth.playerHealth} before=${healthBefore} edgeOpacity=${edge}`);

      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0, 3)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "attack", 60000, "runner attack for melee");
      await debug(page, "startMelee()");
      await waitFor(page, async () => (await debug(page, "getHitmarkerMs()")) > 0, 30000, "melee hitmarker");
      const hudHit = await debug(page, "getHud()");
      record("reticle-hit", "Non-killing hit shows the hit shape", hudHit.hitmarker === "×" ? "PASS" : "FAIL", `hitmarker=${hudHit.hitmarker}`);
      const scoreBeforeKill2 = (await debug(page, "getState()")).score;
      await waitCooldown(page);
      await debug(page, "fireShot()");
      await waitFor(page, async () => (await debug(page, "getState()")).score > scoreBeforeKill2, 30000, "kill score 2");
      const hudKill2 = await debug(page, "getHud()");
      record("reticle-kill", "Killing hit shows the different kill shape", hudKill2.hitmarker === "✕" ? "PASS" : "FAIL", `hitmarker=${hudKill2.hitmarker}`);
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 30000, "wave complete after reticle kill");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "playing after wave advance 2");
      await debug(page, "resetGame(true)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "playing after reset");

      await debug(page, "clearRunners()");
      await debug(page, "pressKeyDown('KeyR')");
      await waitReloading(page, false, 30000);
      for (let i = 0; i < 6; i += 1) {
        await debug(page, "clearRunners()");
        await debug(page, "fireShot()");
        await waitCooldown(page);
      }
      await sleep(500);
      const hudEmpty = await debug(page, "getHud()");
      const stEmpty = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "hud-reload-state.png") });
      record("ammo-empty", "Empty ammo shows RELOAD and spent pips", hudEmpty.ammoState === "RELOAD" && stEmpty.ammo === 0 ? "PASS" : "FAIL", `ammoState=${hudEmpty.ammoState} ammo=${stEmpty.ammo} count=${hudEmpty.ammoCount}`);
      await debug(page, "pressKeyDown('KeyR')");
      await waitReloading(page, false, 30000);
      const stRefilled = await debug(page, "getState()");
      record("reload-to-6", "Reload returns ammo to 6", stRefilled.ammo === 6 ? "PASS" : "FAIL", `ammo=${stRefilled.ammo}`);

      const hudPowers = await debug(page, "getHud()");
      record("powers", "Power strip shows real states", hudPowers.powers.includes("Dash") && hudPowers.powers.includes("Air jump") && hudPowers.powers.includes("Grapple") && hudPowers.powers.includes("Melee") ? "PASS" : "FAIL", `powers=${hudPowers.powers}`);

      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0, 3)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "pursue", 30000, "runner pursue for defeat");
      await debug(page, "damageRunner(0, 36)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 30000, "defeat removal");
      record("defeat", "Defeat clip removes the runner", "PASS", "runner removed after defeat");
    } finally {
      await page.close();
    }
  }

  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await startGame(page);
      await sleep(1000);
      await page.screenshot({ path: path.join(outDir, "gameplay-1920.png") });
      const st1920 = await debug(page, "getState()");
      record("1920", "Game plays at 1920x1080", st1920.phase === "playing" ? "PASS" : "FAIL", `phase=${st1920.phase}`);

      await debug(page, "setPlayerFeet(-6, 0, 7)");
      await debug(page, "setYaw(0)");
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(-6, 1)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "pursue", 30000, "crate runner pursue");
      await debug(page, "fireShot()");
      await sleep(800);
      const decals = await debug(page, "getDecals()");
      const crateDecal = decals.find((d) => Math.abs(d.z - 4.9) < 0.3);
      record("crate-blocked", "Crate blocks a shot with a surface decal", crateDecal ? "PASS" : "FAIL", `decals=${JSON.stringify(decals.slice(0, 3))}`);
      if (crateDecal) {
        const q = crateDecal.quaternion;
        const nx = crateDecal.normal[0]; const ny = crateDecal.normal[1]; const nz = crateDecal.normal[2];
        const fx = 2 * (q[0] * q[2] + q[3] * q[1]);
        const fy = 2 * (q[1] * q[2] - q[3] * q[0]);
        const fz = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
        const dot = Math.abs(fx * nx + fy * ny + fz * nz);
        record("decal-flush", "Decal faces along its surface normal, not the camera", dot > 0.9 ? "PASS" : "FAIL", `normal=${crateDecal.normal} facingDot=${dot.toFixed(3)}`);
      }

      await debug(page, "setPlayerFeet(0, 0, 9)");
      await debug(page, "setYaw(0)");
      const grapple = await debug(page, "tryGrapple()");
      const powers = await debug(page, "getPowers()");
      const behind = powers.grappleCue && powers.grappleCue.anchor[2] > 9;
      record("grapple-front", "No grapple anchor behind the camera", !behind ? "PASS" : "FAIL", `cue=${JSON.stringify(powers.grappleCue)} attached=${grapple}`);
      if (powers.grapple.attached) await debug(page, "releaseGrapple()");

      await debug(page, "pressJump()");
      await sleep(300);
      await debug(page, "pressJump()");
      await sleep(2500);
      const stJump = await debug(page, "getState()");
      record("double-jump", "Double jump uses one air jump", stJump.airJumpsUsed === 1 ? "PASS" : "FAIL", `airJumpsUsed=${stJump.airJumpsUsed} feetY=${stJump.playerFeet[1]}`);

      await debug(page, "setPlayerFeet(0, 10, 1.5)");
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0, 1)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "pursue", 30000, "aerial runner pursue");
      await debug(page, "startMelee()");
      await sleep(1500);
      const stAerial = await debug(page, "getState()");
      record("aerial-melee", "Aerial melee deals no damage to a ground runner", stAerial.runners[0]?.health === 36 ? "PASS" : "FAIL", `health=${stAerial.runners[0]?.health}`);

      await debug(page, "setPlayerFeet(3, 1.5, 1)");
      await debug(page, "pressKeyDown('KeyD')");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.playerFeet[0] > 4.5 && s.grounded === false;
      }, 30000, "ledge grounding false");
      record("ledge", "Stepping off a crate clears grounding", "PASS", "grounded false past the crate edge");
      await debug(page, "pressKeyUp('KeyD')");

      await debug(page, "damagePlayer(100)");
      await sleep(500);
      const stDead = await debug(page, "getState()");
      record("death", "Player death reaches dead phase", stDead.phase === "dead" && stDead.playerHealth === 0 ? "PASS" : "FAIL", `phase=${stDead.phase} health=${stDead.playerHealth}`);
      await debug(page, "resetGame(false)");
      await sleep(500);
      const stRestart = await debug(page, "getState()");
      record("restart", "Restart returns health to 100", stRestart.playerHealth === 100 ? "PASS" : "FAIL", `health=${stRestart.playerHealth}`);
    } finally {
      await page.close();
    }
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const start = Date.now();
      while (Date.now() - start < 120000) {
        const s = await debug(page, "getState()");
        if (s.phase === "waveComplete") break;
        if (s.runners.length > 0) await debug(page, "damageRunner(0, 36)");
        await sleep(500);
      }
      const s = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "wave-complete.png") });
      record("wave-clear", "Full wave clears to wave complete", s.phase === "waveComplete" ? "PASS" : "FAIL", `phase=${s.phase} wave=${s.wave} score=${s.score}`);
    } finally {
      await page.close();
    }
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?review=1`);
      await page.waitForFunction(() => document.body.textContent.includes("Clip shotgun_reload"), { timeout: 30000 });
      await page.screenshot({ path: path.join(outDir, "review-reload.png") });
      const hasReload = await page.evaluate("document.body.textContent.includes('Clip shotgun_reload 8 frames')");
      record("review-reload", "Review shows the reload clip with 8 frames", hasReload ? "PASS" : "FAIL", "review page lists shotgun_reload");
    } finally {
      await page.close();
    }
  }
} catch (e) {
  record("harness", "Harness error", "FAIL", String(e && e.message ? e.message : e).slice(0, 500));
  console.error(e);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  const summary = { results, fails: results.filter((r) => r.status === "FAIL").length };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(summary, null, 2));
  console.log(`DONE fails=${summary.fails} total=${results.length}`);
}
