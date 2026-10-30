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
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 5000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "playing phase");
}
async function waitPursue(page, timeoutMs = 20000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners[0] && s.runners[0].state === "pursue";
  }, timeoutMs, "runner pursue");
}
async function waitGrounded(page, timeoutMs = 25000) {
  await waitFor(page, async () => (await debug(page, "getState()")).grounded === true, timeoutMs, "grounded");
}
function insideCrate(x, y, z) {
  const crates = [
    { half: 0.75, height: 1.5, x: -3, z: -2 },
    { half: 0.75, height: 1.5, x: 3, z: 1 },
    { half: 0.6, height: 1.2, x: 0, z: -6 },
    { half: 0.9, height: 1.8, x: -6, z: 4 },
    { half: 0.75, height: 1.5, x: 6, z: -5 },
  ];
  return crates.some((c) => Math.abs(x - c.x) < c.half && Math.abs(z - c.z) < c.half && y < c.height);
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
      await page.screenshot({ path: path.join(outDir, "n03-aerial.png") });
      const okAerial = aerial.runners[0] && aerial.runners[0].health === 36;
      record("n03-aerial", "Melee from 10m above deals no damage", okAerial ? "PASS" : "FAIL",
        `runnerHealth=${aerial.runners[0] ? aerial.runners[0].health : "none"} playerFeetAtCheck=${aerial.playerFeet.map((v) => v.toFixed(2)).join(",")}`);
    } catch (e) { record("n03-aerial", "Melee from 10m above deals no damage", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,2)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,0)");
      await debug(page, "setYaw(Math.PI)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      await debug(page, "startMelee()");
      await sleep(3000);
      const afterFirst = await debug(page, "getState()");
      await sleep(3000);
      const afterWait = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "n03-close.png") });
      const ok = afterFirst.runners[0] && afterFirst.runners[0].health === 18 && afterWait.runners[0] && afterWait.runners[0].health === 18;
      record("n03-close", "Valid close strike deals exactly 18 once", ok ? "PASS" : "FAIL",
        `afterFirst=${afterFirst.runners[0] ? afterFirst.runners[0].health : "none"} afterWait=${afterWait.runners[0] ? afterWait.runners[0].health : "none"}`);
    } catch (e) { record("n03-close", "Valid close strike deals exactly 18 once", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(-6,3)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(-6,0,5.5)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      await debug(page, "startMelee()");
      await sleep(3000);
      const s = await debug(page, "getState()");
      const ok = s.runners[0] && s.runners[0].health === 36;
      record("n03-blocked", "Crate-blocked melee deals no damage", ok ? "PASS" : "FAIL",
        `runnerHealth=${s.runners[0] ? s.runners[0].health : "none"} runnerAt=${s.runners[0] ? `${s.runners[0].x.toFixed(2)},${s.runners[0].z.toFixed(2)}` : "none"}`);
    } catch (e) { record("n03-blocked", "Crate-blocked melee deals no damage", "FAIL", String(e.message).slice(0, 300)); }
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
      const beforeInput = await debug(page, "getInputState()");
      const landBefore = before.audio.counts.land ?? 0;
      await debug(page, "pressKeyDown(\"KeyD\")");
      let offSample = null;
      let coyoteSamples = [];
      const start = Date.now();
      while (Date.now() - start < 10000) {
        const s = await debug(page, "getState()");
        const inp = await debug(page, "getInputState()");
        if (s.playerFeet[0] > 3.75 && !offSample) offSample = { feet: s.playerFeet, grounded: s.grounded, coyoteMs: inp.coyoteMs };
        if (offSample && s.playerFeet[1] > 0.1) coyoteSamples.push(inp.coyoteMs);
        if (offSample && s.grounded) break;
        await sleep(100);
      }
      await debug(page, "pressKeyUp(\"KeyD\")");
      await waitGrounded(page);
      await sleep(1500);
      const after = await debug(page, "getState()");
      const landAfter = after.audio.counts.land ?? 0;
      await page.screenshot({ path: path.join(outDir, "n04-ledge.png") });
      const coyoteExpired = coyoteSamples.length > 0 && coyoteSamples[coyoteSamples.length - 1] === 0;
      const coyoteDecreasing = coyoteSamples.length >= 2 && coyoteSamples[0] > coyoteSamples[coyoteSamples.length - 1];
      const ok = before.grounded === true && offSample && offSample.grounded === false &&
        (coyoteExpired || coyoteDecreasing) && after.grounded === true && after.airJumpsUsed === 0 &&
        landAfter === landBefore + 1;
      record("n04-ledge", "Stepping off crate clears grounded, coyote expires, landing once", ok ? "PASS" : "FAIL",
        `beforeGrounded=${before.grounded} onCrateCoyoteMs=${beforeInput.coyoteMs} offFeet=${offSample ? offSample.feet.map((v) => v.toFixed(2)).join(",") : "none"} offGrounded=${offSample ? offSample.grounded : "none"} coyoteFirst=${coyoteSamples[0] ?? "none"} coyoteLast=${coyoteSamples[coyoteSamples.length - 1] ?? "none"} landBefore=${landBefore} landAfter=${landAfter} airJumps=${after.airJumpsUsed}`);
    } catch (e) { record("n04-ledge", "Stepping off crate clears grounded, coyote expires, landing once", "FAIL", String(e.message).slice(0, 300)); }
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
      const cue = await debug(page, "getPowers()");
      const behindAttached = await debug(page, "tryGrapple()");
      const attached = await debug(page, "getPowers()");
      await debug(page, "releaseGrapple()");
      await sleep(500);
      await debug(page, "setYaw(Math.PI)");
      await sleep(1000);
      const cue2 = await debug(page, "getPowers()");
      const forwardAttached = await debug(page, "tryGrapple()");
      const attached2 = await debug(page, "getPowers()");
      await page.screenshot({ path: path.join(outDir, "n05-behind.png") });
      const cueAnchor = cue.grappleCue ? cue.grappleCue.anchor : null;
      const behindOk = cueAnchor && cueAnchor[2] < 9 && attached.grapple.attached && attached.grapple.anchor[2] < 9;
      const forwardOk = cue2.grappleCue && cue2.grappleCue.anchor[0] === 0 && cue2.grappleCue.anchor[2] === 11 &&
        attached2.grapple.attached && attached2.grapple.anchor[0] === 0 && attached2.grapple.anchor[2] === 11;
      record("n05-behind", "No behind-camera grapple, E uses indicated forward anchor", behindOk && forwardOk ? "PASS" : "FAIL",
        `cue=${cueAnchor ? cueAnchor.join(",") : "none"} attached=${attached.grapple.attached ? attached.grapple.anchor.join(",") : "none"} cue2=${cue2.grappleCue ? cue2.grappleCue.anchor.join(",") : "none"} attached2=${attached2.grapple.attached ? attached2.grapple.anchor.join(",") : "none"}`);
    } catch (e) { record("n05-behind", "No behind-camera grapple, E uses indicated forward anchor", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(Math.PI)");
      await sleep(800);
      const attached = await debug(page, "tryGrapple()");
      await debug(page, "pressKeyDown(\"KeyW\")");
      await sleep(1500);
      const beforeRelease = await debug(page, "getState()");
      const powersBefore = await debug(page, "getPowers()");
      await debug(page, "releaseGrapple()");
      const trajA = [];
      let tunneled = false;
      for (let i = 0; i < 5; i += 1) {
        const s = await debug(page, "getState()");
        trajA.push(s.playerFeet);
        if (insideCrate(s.playerFeet[0], s.playerFeet[1], s.playerFeet[2])) tunneled = true;
        if (Math.abs(s.playerFeet[0]) > 12 || Math.abs(s.playerFeet[2]) > 12) tunneled = true;
        await sleep(200);
      }
      await debug(page, "pressKeyUp(\"KeyW\")");
      const driftA = Math.hypot(trajA[trajA.length - 1][0] - beforeRelease.playerFeet[0], trajA[trajA.length - 1][2] - beforeRelease.playerFeet[2]);
      const maxYA = Math.max(...trajA.map((f) => f[1]));
      await debug(page, "setPlayerFeet(0,0,9)");
      await sleep(800);
      await debug(page, "tryGrapple()");
      await debug(page, "pressKeyDown(\"KeyD\")");
      await sleep(1500);
      const beforeReleaseB = await debug(page, "getState()");
      const powersBeforeB = await debug(page, "getPowers()");
      await debug(page, "releaseGrapple()");
      const trajB = [];
      for (let i = 0; i < 5; i += 1) {
        const s = await debug(page, "getState()");
        trajB.push(s.playerFeet);
        if (insideCrate(s.playerFeet[0], s.playerFeet[1], s.playerFeet[2])) tunneled = true;
        if (Math.abs(s.playerFeet[0]) > 12 || Math.abs(s.playerFeet[2]) > 12) tunneled = true;
        await sleep(200);
      }
      await debug(page, "pressKeyUp(\"KeyD\")");
      const driftB = Math.hypot(trajB[trajB.length - 1][0] - beforeReleaseB.playerFeet[0], trajB[trajB.length - 1][2] - beforeReleaseB.playerFeet[2]);
      const maxYB = Math.max(...trajB.map((f) => f[1]));
      await page.screenshot({ path: path.join(outDir, "n06-release.png") });
      const ok = !tunneled && driftA > 0.07 && driftB > 0.07;
      record("n06-release", "Two release phases drift usefully without tunneling", ok ? "PASS" : "FAIL",
        `velA=${powersBefore.playerVelocity.map((v) => v.toFixed(2)).join(",")} driftA=${driftA.toFixed(2)} maxYA=${maxYA.toFixed(2)} relY=${beforeRelease.playerFeet[1].toFixed(2)} velB=${powersBeforeB.playerVelocity.map((v) => v.toFixed(2)).join(",")} driftB=${driftB.toFixed(2)} maxYB=${maxYB.toFixed(2)} relYB=${beforeReleaseB.playerFeet[1].toFixed(2)} tunneled=${tunneled}`);
    } catch (e) { record("n06-release", "Two release phases drift usefully without tunneling", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,3)");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,5)");
      await debug(page, "setYaw(0)");
      await sleep(500);
      await debug(page, "setRunnerDirection(0,\"back\")");
      await sleep(500);
      let attackSample = null;
      const start = Date.now();
      while (Date.now() - start < 15000) {
        const s = await debug(page, "getState()");
        if (s.runners[0] && (s.runners[0].state === "telegraph" || s.runners[0].state === "attack")) {
          attackSample = s.runners[0];
          break;
        }
        await sleep(200);
      }
      await page.screenshot({ path: path.join(outDir, "n07-attack-back.png") });
      const attackOk = attackSample && attackSample.direction === "back" && attackSample.visibleMesh === "run" && attackSample.runClip === "runner_run_back";
      let hitSample = null;
      if (attackSample) {
        await debug(page, "damageRunner(0,18)");
        await sleep(1200);
        const s = await debug(page, "getState()");
        if (s.runners[0]) hitSample = s.runners[0];
      }
      const hitOk = hitSample && hitSample.state === "hit" && hitSample.visibleMesh === "run" && Math.abs(hitSample.runScale - 1) < 0.01;
      record("n07-back-attack-hit", "Back-facing attack and hit show run pose, not front face or idle pop", attackOk && hitOk ? "PASS" : "FAIL",
        `attack=${attackSample ? `${attackSample.state}/${attackSample.direction}/${attackSample.visibleMesh}/${attackSample.runClip}` : "none"} hit=${hitSample ? `${hitSample.state}/${hitSample.visibleMesh}/runScale=${hitSample.runScale.toFixed(2)}` : "none"}`);
    } catch (e) { record("n07-back-attack-hit", "Back-facing attack and hit show run pose, not front face or idle pop", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,5)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await sleep(800);
      let dirSeq = [];
      let phases = [];
      await debug(page, "spawnRunnerAt(0,-3)");
      await waitPursue(page);
      await debug(page, "pressKeyDown(\"KeyD\")");
      for (let i = 0; i < 25; i += 1) {
        const s = await debug(page, "getState()");
        if (s.runners[0]) {
          dirSeq.push(s.runners[0].direction);
          phases.push(s.runners[0].runPhase);
        }
        await sleep(200);
      }
      await debug(page, "pressKeyUp(\"KeyD\")");
      let flicker = false;
      for (let i = 2; i < dirSeq.length; i += 1) {
        if (dirSeq[i] === dirSeq[i - 2] && dirSeq[i] !== dirSeq[i - 1]) flicker = true;
      }
      let phaseReset = false;
      for (let i = 1; i < dirSeq.length; i += 1) {
        if (dirSeq[i] !== dirSeq[i - 1] && phases[i] < 0.05 && phases[i - 1] > 0.3) phaseReset = true;
      }
      const ok = !flicker && !phaseReset && dirSeq.length > 0;
      record("n07-hysteresis", "Runner crossing sectors does not flicker, phase preserved", ok ? "PASS" : "FAIL",
        `directions=${[...new Set(dirSeq)].join(",")} changes=${dirSeq.filter((d, i) => i > 0 && d !== dirSeq[i - 1]).length} flicker=${flicker} phaseReset=${phaseReset}`);
    } catch (e) { record("n07-hysteresis", "Runner crossing sectors does not flicker, phase preserved", "FAIL", String(e.message).slice(0, 300)); }
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
      await sleep(4000);
      const decals1 = await debug(page, "getDecals()");
      const crateDecal = decals1.find((d) => d.owner === "crate(3,1)");
      await debug(page, "setPlayerFeet(2,0,5)");
      await debug(page, "setYaw(0.5)");
      await sleep(1000);
      const decals2 = await debug(page, "getDecals()");
      const crateDecal2 = decals2.find((d) => d.owner === "crate(3,1)");
      await page.screenshot({ path: path.join(outDir, "n10-decal.png") });
      const same = crateDecal && crateDecal2 &&
        Math.abs(crateDecal.x - crateDecal2.x) < 0.01 && Math.abs(crateDecal.y - crateDecal2.y) < 0.01 &&
        Math.abs(crateDecal.z - crateDecal2.z) < 0.01 &&
        JSON.stringify(crateDecal.quaternion) === JSON.stringify(crateDecal2.quaternion);
      const normalOk = crateDecal && Math.abs(crateDecal.normal[2] - 1) < 0.01;
      record("n10-decal", "Crate decal stays flush to its surface when the camera moves", same && normalOk ? "PASS" : "FAIL",
        `decal1=${crateDecal ? `${crateDecal.owner} n=${crateDecal.normal.map((v) => v.toFixed(2)).join(",")} pos=${crateDecal.x.toFixed(2)},${crateDecal.y.toFixed(2)},${crateDecal.z.toFixed(2)} scale=${crateDecal.scale.toFixed(2)}` : "none"} same=${same}`);
    } catch (e) { record("n10-decal", "Crate decal stays flush to its surface when the camera moves", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "setSettings({\"reducedMotion\":true,\"flash\":0})");
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await sleep(800);
      const healthBefore = (await debug(page, "getState()")).playerHealth;
      await debug(page, "damagePlayer(10)");
      const camSamples = [];
      for (let i = 0; i < 8; i += 1) {
        const cam = await debug(page, "getCamera()");
        const s = await debug(page, "getState()");
        camSamples.push({ cam, feet: s.playerFeet });
        await sleep(200);
      }
      const shaken = camSamples.some((entry) =>
        Math.abs(entry.cam.position[0] - entry.feet[0]) > 0.01 ||
        Math.abs(entry.cam.position[1] - (entry.feet[1] + 1.7)) > 0.01);
      const rolled = camSamples.some((entry) => Math.abs(entry.cam.roll) > 0.001);
      const after = await debug(page, "getState()");
      const damageOpacity = await page.evaluate("document.getElementById(\"damage\").style.opacity");
      await page.screenshot({ path: path.join(outDir, "n12-reduced.png") });
      const ok = !shaken && !rolled && after.playerHealth === healthBefore - 10 && damageOpacity === "0";
      record("n12-reduced", "Reduced motion damage has no shake or roll, zero flash hides bright layer, health still drops", ok ? "PASS" : "FAIL",
        `shaken=${shaken} rolled=${rolled} health=${healthBefore}->${after.playerHealth} damageOpacity=${damageOpacity}`);
    } catch (e) { record("n12-reduced", "Reduced motion damage has no shake or roll, zero flash hides bright layer, health still drops", "FAIL", String(e.message).slice(0, 300)); }
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
      await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 20000, "fire cooldown");
      await debug(page, "fireShot()");
      await sleep(2000);
      const ammo2 = (await debug(page, "getState()")).ammo;
      const weapon = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "accept-shots.png") });
      const ok = ammo0 === 6 && ammo2 === 4;
      record("accept-shots", "Two shots use two ammo", ok ? "PASS" : "FAIL", `ammo ${ammo0}->${ammo2} weapon=${JSON.stringify(weapon.weapon)}`);
    } catch (e) { record("accept-shots", "Two shots use two ammo", "FAIL", String(e.message).slice(0, 300)); }
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
      await debug(page, "damageRunner(0,36)");
      let removed = false;
      try {
        await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 20000, "runner removal");
        removed = true;
      } catch {}
      const s = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "accept-kill.png") });
      const ok = removed && s.score >= 100;
      record("accept-kill", "Kill plays defeat and removes runner", ok ? "PASS" : "FAIL", `removed=${removed} runners=${s.runners.length} score=${s.score}`);
    } catch (e) { record("accept-kill", "Kill plays defeat and removes runner", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} catch (e) {
  console.error("harness error", e);
} finally {
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results }, null, 2));
  const fails = results.filter((r) => r.status !== "PASS").length;
  console.log(`done fails=${fails} total=${results.length}`);
  if (browser) await browser.close();
  if (server) server.kill();
}
