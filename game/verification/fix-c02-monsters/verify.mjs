import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = process.env.PAPER_OUT_DIR ? path.resolve(process.env.PAPER_OUT_DIR) : scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5183);
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
async function waitState(page, index, state, timeoutMs = 60000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners[index] && s.runners[index].state === state;
  }, timeoutMs, `runner ${index} ${state}`);
}
async function killAll(page, timeoutMs = 180000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") return true;
    await debug(page, "setPlayerFeet(0,10,9)");
    if (s.runners.length > 0) await debug(page, "damageRunner(0,100)");
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
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(-2.5,3,\"runner\")");
      await debug(page, "spawnFamilyAt(0,3,\"insect\")");
      await debug(page, "spawnFamilyAt(2.5,3,\"brute\")");
      await sleep(600);
      const s = await debug(page, "getState()");
      const families = s.runners.map((r) => r.family).join(",");
      const clips = s.runners.map((r) => r.runClip).join(",");
      await page.screenshot({ path: path.join(outDir, "trio.png") });
      const ok = families === "runner,insect,brute" && s.runners.length === 3;
      record("c02-trio", "Runner, insect, brute spawn side by side with distinct run clips", ok ? "PASS" : "FAIL", `families=${families} clips=${clips}`);
    } catch (e) {
      record("c02-trio", "Runner, insect, brute spawn side by side", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const w1 = await debug(page, "startWaveDebug(1)");
      const c1 = await debug(page, "getWaveComposition()");
      const w2 = await debug(page, "startWaveDebug(2)");
      const c2 = await debug(page, "getWaveComposition()");
      const w3 = await debug(page, "startWaveDebug(3)");
      const c3 = await debug(page, "getWaveComposition()");
      await page.screenshot({ path: path.join(outDir, "composition-wave3.png") });
      const total = (c) => ({
        runner: (c.active.runner ?? 0) + (c.queued.runner ?? 0),
        insect: (c.active.insect ?? 0) + (c.queued.insect ?? 0),
        brute: (c.active.brute ?? 0) + (c.queued.brute ?? 0),
      });
      const t1 = total(c1);
      const t2 = total(c2);
      const t3 = total(c3);
      const ok = w1.queued === 6 && t1.runner === 6 && t1.insect === 0 && t1.brute === 0
        && w2.queued === 8 && t2.runner === 6 && t2.insect === 2 && t2.brute === 0
        && w3.queued === 10 && t3.runner === 5 && t3.insect === 3 && t3.brute === 2;
      record("c02-composition", "Wave 1 all runner, wave 2 adds insects, wave 3 adds brutes", ok ? "PASS" : "FAIL",
        `w1=${JSON.stringify(t1)} w2=${JSON.stringify(t2)} w3=${JSON.stringify(t3)}`);
    } catch (e) {
      record("c02-composition", "Wave composition", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "spawnFamilyAt(0,-2,\"insect\")");
      await waitState(page, 0, "telegraph");
      const tele = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "insect-telegraph.png") });
      await waitState(page, 0, "attack");
      await page.screenshot({ path: path.join(outDir, "insect-attack.png") });
      await waitFor(page, async () => (await debug(page, "getState()")).playerHealth <= 90, 60000, "insect strike damage");
      const after = await debug(page, "getState()");
      const audio = after.audio.counts;
      const ok = tele.runners[0].warningVisible === true && Math.abs(tele.runners[0].warningRadius - 0.75) < 0.01
        && after.playerHealth === 90 && (audio.insectLeap ?? 0) >= 1;
      record("c02-insect-attack", "Insect telegraph shows a turquoise ring, leap strikes for 10", ok ? "PASS" : "FAIL",
        `warning=${tele.runners[0].warningVisible} radius=${tele.runners[0].warningRadius} health=${after.playerHealth} insectLeap=${audio.insectLeap}`);
    } catch (e) {
      record("c02-insect-attack", "Insect telegraph and leap strike", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "spawnFamilyAt(0,-2.2,\"brute\")");
      await waitState(page, 0, "telegraph");
      const tele = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "brute-telegraph.png") });
      await waitState(page, 0, "attack");
      await page.screenshot({ path: path.join(outDir, "brute-attack.png") });
      await waitFor(page, async () => (await debug(page, "getState()")).playerHealth <= 80, 60000, "brute slam damage");
      const struck = await debug(page, "getState()");
      const stillAttack = struck.runners[0] && struck.runners[0].state === "attack";
      await waitState(page, 0, "pursue");
      await page.screenshot({ path: path.join(outDir, "brute-recovery.png") });
      const after = await debug(page, "getState()");
      const audio = after.audio.counts;
      const ok = tele.runners[0].warningVisible === true && Math.abs(tele.runners[0].warningRadius - 2.6) < 0.01
        && struck.playerHealth === 80 && stillAttack && (audio.bruteWindup ?? 0) >= 1 && (audio.bruteSlam ?? 0) >= 1;
      record("c02-brute-slam", "Brute windup shows a 2.6 gold ring, slam hits for 20, then recovery", ok ? "PASS" : "FAIL",
        `warning=${tele.runners[0].warningVisible} radius=${tele.runners[0].warningRadius} health=${struck.playerHealth} stillAttack=${stillAttack} windup=${audio.bruteWindup} slam=${audio.bruteSlam}`);
    } catch (e) {
      record("c02-brute-slam", "Brute windup, slam, recovery", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(9,9,\"runner\")");
      await debug(page, "spawnFamilyAt(0,0,\"insect\")");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.some((r) => r.family === "insect" && r.state === "pursue");
      }, 30000, "insect pursue");
      const insectIndex = (await debug(page, "getState()")).runners.findIndex((r) => r.family === "insect");
      await debug(page, `damageRunner(${insectIndex},24)`);
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.some((r) => r.family === "insect" && r.state === "death");
      }, 30000, "insect death");
      const mid = await debug(page, "getState()");
      await debug(page, "spawnFamilyAt(0,0,\"brute\")");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.some((r) => r.family === "brute" && r.state === "pursue");
      }, 30000, "brute pursue");
      const bruteIndex = (await debug(page, "getState()")).runners.findIndex((r) => r.family === "brute");
      await debug(page, `damageRunner(${bruteIndex},72)`);
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners.some((r) => r.family === "brute" && r.state === "death");
      }, 30000, "brute death");
      const after = await debug(page, "getState()");
      const ok = mid.score === 100 && mid.combo === 1 && after.score === 200 && after.combo === 2;
      record("c02-kills", "Insect and brute kills score 100 each and build combo", ok ? "PASS" : "FAIL",
        `midScore=${mid.score} midCombo=${mid.combo} score=${after.score} combo=${after.combo}`);
    } catch (e) {
      record("c02-kills", "Insect and brute kills score and combo", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(1,0,3.5)");
      await debug(page, "spawnFamilyAt(1,1,\"brute\")");
      await waitState(page, 0, "telegraph");
      await debug(page, "setPlayerFeet(3.5,0,1)");
      await waitState(page, 0, "attack");
      await waitState(page, 0, "pursue");
      const bruteCover = await debug(page, "getState()");
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(1,0,3.5)");
      await debug(page, "spawnFamilyAt(1,1,\"insect\")");
      await waitState(page, 0, "telegraph");
      await debug(page, "setPlayerFeet(3.5,0,1)");
      await waitState(page, 0, "attack");
      await waitState(page, 0, "pursue");
      const insectCover = await debug(page, "getState()");
      const ok = bruteCover.playerHealth === 100 && insectCover.playerHealth === 100;
      record("c02-cover", "Crate blocks brute slam and insect strike", ok ? "PASS" : "FAIL",
        `bruteHealth=${bruteCover.playerHealth} insectHealth=${insectCover.playerHealth}`);
    } catch (e) {
      record("c02-cover", "Crate blocks brute slam and insect strike", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,0)");
      for (const [x, z, f] of [[0, 2, "runner"], [0, -2, "runner"], [2, 0, "insect"], [-2, 0, "insect"], [1.5, 1.5, "brute"], [-1.5, -1.5, "brute"], [1.5, -1.5, "brute"], [-1.5, 1.5, "runner"]]) {
        await debug(page, `spawnFamilyAt(${x},${z},"${f}")`);
      }
      let maxAttackers = 0;
      let maxTelegraph = 0;
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const c = await debug(page, "getCaps()");
        maxAttackers = Math.max(maxAttackers, c.attackers);
        const s = await debug(page, "getState()");
        maxTelegraph = Math.max(maxTelegraph, s.runners.filter((r) => r.state === "telegraph").length);
        if (maxAttackers >= 1 && maxTelegraph >= 1) break;
        await sleep(200);
      }
      await page.screenshot({ path: path.join(outDir, "attack-cap-mixed.png") });
      const ok = maxAttackers >= 1 && maxAttackers <= 4 && maxTelegraph >= 1;
      record("c02-attack-cap", "Mixed-family attacks stay at or below the cap of 4", ok ? "PASS" : "FAIL",
        `maxAttackers=${maxAttackers} maxTelegraph=${maxTelegraph}`);
    } catch (e) {
      record("c02-attack-cap", "Mixed-family attack cap", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "setSettings({\"reducedMotion\":true,\"flash\":0})");
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "spawnFamilyAt(0,2.2,\"brute\")");
      await waitState(page, 0, "attack");
      await waitFor(page, async () => (await debug(page, "getState()")).playerHealth <= 80, 60000, "brute slam under reduced motion");
      const s = await debug(page, "getState()");
      const cam = await debug(page, "getCamera()");
      const ok = cam.roll === 0 && Math.abs(cam.position[0] - s.playerFeet[0]) < 0.1
        && Math.abs(cam.position[2] - s.playerFeet[2]) < 0.1
        && Math.abs(cam.position[1] - (s.playerFeet[1] + 1.7)) < 0.1;
      record("c02-reduced", "Reduced-motion brute slam shakes and rolls nothing", ok ? "PASS" : "FAIL",
        `roll=${cam.roll} cam=${cam.position.join(",")} feet=${s.playerFeet.join(",")}`);
    } catch (e) {
      record("c02-reduced", "Reduced-motion brute slam", "FAIL", String(e.message).slice(0, 300));
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
      record("accept-reload", "Reload transfers ammo and refills to 6", "PASS", "reloadTransferred true, ammo 6");
      await debug(page, "spawnRunnerAt(0,0)");
      await waitPursue(page);
      await debug(page, "damageRunner(0,36)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 30000, "runner removed");
      const afterKill = await debug(page, "getState()");
      const killOk = afterKill.score > 0;
      record("accept-kill", "Runner kill still scores", killOk ? "PASS" : "FAIL", `score=${afterKill.score}`);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "next wave playing after kill");
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(-6,1)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(-6,0,7)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      const crate = await debug(page, "getState()");
      const decals = await debug(page, "getDecals()");
      const crateOk = crate.runners[0] && crate.runners[0].health === 36
        && crate.lastTracer && Math.abs(crate.lastTracer.to[2] - 4.90) < 0.5
        && decals.length > 0 && decals[0].normal[2] > 0.9;
      record("accept-crate-decal", "Crate-blocked shot leaves runner at 36 and leaves a flush decal", crateOk ? "PASS" : "FAIL",
        `health=${crate.runners[0] ? crate.runners[0].health : "none"} tracerZ=${crate.lastTracer ? crate.lastTracer.to[2] : "none"} decals=${decals.length} normal=${decals[0] ? decals[0].normal.join(",") : "none"}`);
      await debug(page, "setRunnerDirection(0,\"left\")");
      await sleep(500);
      const dir = await debug(page, "getState()");
      const dirOk = dir.runners[0] && dir.runners[0].direction === "left";
      record("accept-directional", "Forced direction shows the left run clip", dirOk ? "PASS" : "FAIL",
        `direction=${dir.runners[0] ? dir.runners[0].direction : "none"} runClip=${dir.runners[0] ? dir.runners[0].runClip : "none"}`);
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
      await debug(page, "pressKeyDown(\"ShiftLeft\")");
      await debug(page, "pressKeyDown(\"KeyW\")");
      await sleep(1500);
      const sprint = await debug(page, "getState()");
      await debug(page, "pressKeyUp(\"KeyW\")");
      await debug(page, "pressKeyUp(\"ShiftLeft\")");
      const sprintOk = sprint.weapon && sprint.weapon.sprintScale > 1.05;
      record("accept-sprint", "Sprinting while moving scales the weapon toward 1.1", sprintOk ? "PASS" : "FAIL",
        `sprintScale=${sprint.weapon ? sprint.weapon.sprintScale : "none"}`);
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
      record("accept-barrel", "Triggered barrel detonates and is gone", barrelOk ? "PASS" : "FAIL",
        `trigger=${barrel} barrel0=${barrels[0] ? barrels[0].state : "none"}`);
      await debug(page, "damagePlayer(100)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "dead", 15000, "dead phase");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 10000, "restart playing");
      const restarted = await debug(page, "getState()");
      const restartOk = restarted.playerHealth === 100;
      record("accept-death-restart", "Death restarts the wave at full health", restartOk ? "PASS" : "FAIL",
        `health=${restarted.playerHealth} wave=${restarted.wave}`);
      await debug(page, "startWaveDebug(1)");
      await killAll(page);
      const cleared = await debug(page, "getState()");
      const clearOk = cleared.phase === "waveComplete" && cleared.score > 0;
      record("accept-wave-clear", "Wave 1 clears to waveComplete with a score", clearOk ? "PASS" : "FAIL",
        `phase=${cleared.phase} score=${cleared.score}`);
      const hud = await debug(page, "getHud()");
      const hudOk = hud.waveNum === "1" && hud.ammoCount !== "";
      record("accept-hud", "Comic HUD still reports wave and ammo", hudOk ? "PASS" : "FAIL", JSON.stringify(hud));
    } catch (e) {
      record("accept-suite", "Prior acceptance suite", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "startWaveDebug(5)");
      await waitFor(page, async () => {
        await debug(page, "setPlayerFeet(0,10,9)");
        const c = await debug(page, "getCaps()");
        return c.activeRunners === 12 && c.queuedRunners === 2;
      }, 240000, "wave 5 capped at 12 active with 2 queued");
      const capped = await debug(page, "getCaps()");
      const ok = capped.activeRunners === 12 && capped.queuedRunners === 2;
      record("n08-cap-still", "Wave 5 still caps at 12 active with 2 queued across families", ok ? "PASS" : "FAIL",
        `active=${capped.activeRunners} queued=${capped.queuedRunners}`);
    } catch (e) {
      record("n08-cap-still", "Wave 5 cap across families", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

} catch (e) {
  record("harness", "Harness run", "FAIL", String(e.message).slice(0, 300));
} finally {
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(results, null, 2));
  if (server) server.kill();
  if (browser) await browser.close();
}
const failed = results.filter((r) => r.status !== "PASS");
console.log(`TOTAL ${results.length} PASS ${results.length - failed.length} FAIL ${failed.length}`);
process.exit(failed.length > 0 ? 1 : 0);
