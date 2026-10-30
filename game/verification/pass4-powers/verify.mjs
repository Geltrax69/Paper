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
const base = "http://127.0.0.1:5177";
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
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 5000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "playing phase");
}
async function sampleMaxY(page, ms) {
  let max = -Infinity;
  const start = Date.now();
  while (Date.now() - start < ms) {
    const s = await debug(page, "getState()");
    max = Math.max(max, s.playerFeet[1]);
    await sleep(150);
  }
  return max;
}
async function waitGrounded(page, timeoutMs = 20000) {
  await waitFor(page, async () => (await debug(page, "getState()")).grounded === true, timeoutMs, "grounded");
}
async function waitPursue(page, timeoutMs = 20000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners[0] && s.runners[0].state === "pursue";
  }, timeoutMs, "runner pursue");
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
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5177", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
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
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "pressJump()");
      const singleApex = await sampleMaxY(page, 4000);
      await waitGrounded(page);
      const landed = await debug(page, "getState()");
      await debug(page, "pressJump()");
      await waitFor(page, async () => (await debug(page, "getState()")).playerFeet[1] > 0.5, 8000, "airborne");
      await debug(page, "pressJump()");
      const doubleApex = await sampleMaxY(page, 5000);
      const mid = await debug(page, "getPowers()");
      await debug(page, "pressJump()");
      const afterThird = await sampleMaxY(page, 3000);
      await waitGrounded(page);
      const powersAfter = await debug(page, "getPowers()");
      await page.screenshot({ path: path.join(outDir, "jump-land.png") });
      const ok = singleApex > 1.0 && singleApex < 1.8 && doubleApex > singleApex + 0.8 &&
        mid.airJumpsUsed === 1 && afterThird <= doubleApex + 0.15 &&
        landed.grounded === true && powersAfter.airJumpsUsed === 0;
      record("double-jump", "Double jump apex, one air jump, reset on landing", ok ? "PASS" : "FAIL",
        `singleApex=${singleApex.toFixed(2)} doubleApex=${doubleApex.toFixed(2)} afterThird=${afterThird.toFixed(2)} airUsed=${mid.airJumpsUsed} afterLand=${powersAfter.airJumpsUsed}`);
    } catch (e) { record("double-jump", "Double jump", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      const attached = await debug(page, "tryGrapple()");
      const p1 = await debug(page, "getPowers()");
      await sleep(1500);
      const swung = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "grapple.png") });
      await debug(page, "pressKeyDown(\"KeyW\")");
      const zs = [];
      for (let i = 0; i < 20; i += 1) {
        const s = await debug(page, "getState()");
        zs.push(s.playerFeet[2]);
        await sleep(150);
      }
      await debug(page, "pressKeyUp(\"KeyW\")");
      const pumpRange = Math.max(...zs) - Math.min(...zs);
      const p2 = await debug(page, "getPowers()");
      const stillAttached = p2.grapple.attached;
      await debug(page, "releaseGrapple()");
      const p3 = await debug(page, "getPowers()");
      const after = [];
      for (let i = 0; i < 10; i += 1) {
        const s = await debug(page, "getState()");
        after.push([s.playerFeet[0], s.playerFeet[2]]);
        await sleep(150);
      }
      const drift = Math.hypot(after[after.length - 1][0] - after[0][0], after[after.length - 1][1] - after[0][1]);
      const ok = attached === true && p1.grapple.attached === true && p1.ropeVisible === true &&
        Math.abs(p1.grapple.anchor[0] - 0) < 0.01 && Math.abs(p1.grapple.anchor[2] - 11) < 0.01 &&
        Math.abs(p1.grapple.ropeLength - 3.44) < 0.05 && stillAttached === true &&
        pumpRange > 0.2 && p3.grappleMomentumMs > 0 && drift > 0.05;
      record("grapple", "Grapple attach, swing, pump, release momentum", ok ? "PASS" : "FAIL",
        `attached=${attached} anchor=${JSON.stringify(p1.grapple.anchor)} rope=${p1.grapple.ropeLength?.toFixed(2)} stillAttached=${stillAttached} pumpRange=${pumpRange.toFixed(2)} momentumMs=${p3.grappleMomentumMs} drift=${drift.toFixed(2)} feetAfterSwing=${JSON.stringify(swung.playerFeet.map((v) => v.toFixed(2)))}`);
    } catch (e) { record("grapple", "Grapple", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-6,0,8)");
      await sleep(800);
      const cue = await debug(page, "getPowers()");
      const blockedAnchor = cue.anchorCue[0] === -6 && cue.anchorCue[2] === 4;
      const attached = await debug(page, "tryGrapple()");
      const p = await debug(page, "getPowers()");
      const attachedToBlocked = p.grapple.attached && p.grapple.anchor[0] === -6 && p.grapple.anchor[2] === 4;
      await page.screenshot({ path: path.join(outDir, "grapple-blocked.png") });
      const ok = !blockedAnchor && !attachedToBlocked;
      record("grapple-blocked", "Grapple line of sight blocks the tall crate top", ok ? "PASS" : "FAIL",
        `cue=${JSON.stringify(cue.anchorCue)} cueVisible=${cue.anchorCueVisible} attached=${attached} attachedAnchor=${p.grapple.attached ? JSON.stringify(p.grapple.anchor) : "none"}`);
    } catch (e) { record("grapple-blocked", "Grapple blocked", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,1.5)");
      await debug(page, "setYaw(0)");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      const before = await debug(page, "getState()");
      await debug(page, "startMelee()");
      await sleep(1500);
      const mid = await debug(page, "getState()");
      await sleep(1500);
      const after = await debug(page, "getState()");
      await waitFor(page, async () => (await debug(page, "getPowers()")).meleeCooldownMs <= 0, 10000, "melee cooldown");
      await debug(page, "startMelee()");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.length === 0 || s.runners[0].state === "death";
      }, 15000, "runner death");
      const killed = await debug(page, "getState()");
      const ok = before.runners[0].health === 36 && mid.runners[0].health === 18 && after.runners[0].health === 18 &&
        (killed.runners.length === 0 || killed.runners[0].state === "death");
      record("melee", "Melee damages once per swing, twice kills", ok ? "PASS" : "FAIL",
        `before=${before.runners[0].health} mid=${mid.runners[0].health} after=${after.runners[0].health} runnersLeft=${killed.runners.length} score=${killed.score}`);
    } catch (e) { record("melee", "Melee", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(-6,2.5)");
      await debug(page, "setPlayerFeet(-6,0,5.3)");
      await debug(page, "setYaw(0)");
      await waitPursue(page);
      const before = await debug(page, "getState()");
      await debug(page, "startMelee()");
      await sleep(1500);
      const after = await debug(page, "getState()");
      const ok = before.runners[0].health === 36 && after.runners[0] && after.runners[0].health === 36;
      record("melee-blocked", "Melee blocked by crate", ok ? "PASS" : "FAIL",
        `before=${before.runners[0].health} after=${after.runners[0] ? after.runners[0].health : "gone"} runnerAt=${JSON.stringify(after.runners[0] ? [after.runners[0].x.toFixed(2), after.runners[0].z.toFixed(2)] : null)}`);
    } catch (e) { record("melee-blocked", "Melee blocked", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-5.05,1.8,4)");
      await debug(page, "spawnRunnerAt(-4,4)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.some((r) => r.state === "attack");
      }, 25000, "runner attack");
      await debug(page, "pressJump()");
      await waitFor(page, async () => (await debug(page, "getState()")).playerFeet[1] > 2.2, 8000, "airborne");
      await debug(page, "pressJump()");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.every((r) => r.state === "pursue" || r.state === "death");
      }, 20000, "attack resolved");
      const hp = await debug(page, "getState()");
      record("airborne-immune", "Ground melee does not damage an airborne player", hp.playerHealth === 100 ? "PASS" : "FAIL",
        `health=${hp.playerHealth}`);
    } catch (e) { record("airborne-immune", "Airborne immunity", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "fireShot()");
      await sleep(600);
      const s1 = await debug(page, "getState()");
      await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs <= 0, 10000, "fire cooldown");
      await debug(page, "fireShot()");
      await sleep(600);
      const s2 = await debug(page, "getState()");
      await debug(page, "pressKeyDown(\"KeyR\")");
      await waitFor(page, async () => (await debug(page, "getState()")).ammo === 6, 15000, "reload done");
      await debug(page, "pressKeyUp(\"KeyR\")");
      const sReload = await debug(page, "getState()");
      await debug(page, "pressKeyDown(\"ShiftLeft\")");
      await debug(page, "pressKeyDown(\"KeyW\")");
      await sleep(1200);
      const s3 = await debug(page, "getState()");
      await debug(page, "pressKeyUp(\"KeyW\")");
      await debug(page, "pressKeyUp(\"ShiftLeft\")");
      await sleep(400);
      const s4 = await debug(page, "getState()");
      await debug(page, "spawnRunnerAt(-1,4)");
      await waitPursue(page);
      await debug(page, "setRunnerDirection(0,\"back\")");
      const s5 = await debug(page, "getState()");
      await debug(page, "damageRunner(0,36)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 20000, "wave complete");
      const s6 = await debug(page, "getState()");
      const env = await debug(page, "getEnvironment()");
      await page.screenshot({ path: path.join(outDir, "fire-mid.png") });
      const ok = s1.ammo === 5 && s2.ammo === 4 && sReload.ammo === 6 &&
        s3.weapon && Math.abs(s3.weapon.sprintScale - 1.1) < 0.01 &&
        s4.weapon && Math.abs(s4.weapon.sprintScale - 1.0) < 0.01 &&
        s5.runners[0].runClip === "runner_run_back" &&
        s6.phase === "waveComplete" && env.maps.includes("far_skyline.png");
      record("acceptance", "Prior acceptance: shots, reload, sprint, direction, kill, wave, environment", ok ? "PASS" : "FAIL",
        `ammo=${s1.ammo},${s2.ammo},${sReload.ammo} sprint=${s3.weapon?.sprintScale},${s4.weapon?.sprintScale} clip=${s5.runners[0].runClip} phase=${s6.phase} score=${s6.score}`);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 8000, "next wave playing");
      await debug(page, "damagePlayer(100)");
      await sleep(800);
      const dead = await debug(page, "getState()");
      await debug(page, "resetGame()");
      await sleep(800);
      const restarted = await debug(page, "getState()");
      const ok2 = dead.phase === "dead" && dead.playerHealth === 0 && restarted.playerHealth === 100;
      record("accept-death", "Death and restart", ok2 ? "PASS" : "FAIL",
        `deadPhase=${dead.phase} deadHealth=${dead.playerHealth} restartedHealth=${restarted.playerHealth}`);
    } catch (e) { record("acceptance", "Prior acceptance", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} finally {
  const fails = results.filter((r) => r.status === "FAIL").length;
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results, fails }, null, 2));
  console.log(`done fails=${fails}`);
  if (browser) await browser.close();
  if (server) server.kill();
  process.exit(fails > 0 ? 1 : 0);
}
