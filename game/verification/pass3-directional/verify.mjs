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
const base = "http://127.0.0.1:5176";
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
async function waitRunnerReady(page, index = 0) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    const r = s.runners[index];
    return r && r.state !== "spawn" && r.state !== "death";
  }, 10000, "runner ready");
}
async function startGame(page) {
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
  await page.click("#startBtn");
  await waitFor(page, async () => (await page.evaluate("!!document.pointerLockElement")) === true, 5000, "pointer lock");
  await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "playing phase");
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
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5176", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  const directions = ["front", "front-right", "right", "back-right", "back", "back-left", "left", "front-left"];
  const expectedClip = {
    front: "runner_run_front",
    "front-right": "runner_run_front_right",
    right: "runner_run_right",
    "back-right": "runner_run_back_right",
    back: "runner_run_back",
    "back-left": "runner_run_back_left",
    left: "runner_run_left",
    "front-left": "runner_run_front_left",
  };

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      for (let i = 0; i < 8; i += 1) {
        await debug(page, `spawnRunnerAt(${-7 + i * 2},-2)`);
        await debug(page, `setRunnerDirection(${i},"${directions[i]}")`);
      }
      await sleep(900);
      const s = await debug(page, "getState()");
      const got = s.runners.map((r) => r.direction);
      const clipsOk = s.runners.every((r, i) => r.runClip === expectedClip[directions[i]]);
      await page.screenshot({ path: path.join(outDir, "dir-all.png") });
      const ok = JSON.stringify(got) === JSON.stringify(directions) && clipsOk;
      record("dir-all", "Eight forced directions map to eight clips", ok ? "PASS" : "FAIL", `directions=${got.join(",")} clipsOk=${clipsOk}`);
    } catch (e) { record("dir-all", "Eight forced directions", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "spawnRunnerAt(0,-8)");
      await waitRunnerReady(page);
      const samples = [];
      for (let i = 0; i < 30; i += 1) {
        const s = await debug(page, "getState()");
        const r = s.runners[0];
        if (r) samples.push({ direction: r.direction, phase: r.runPhase, frame: r.runFrame });
        await sleep(150);
      }
      await debug(page, "setPlayerFeet(9,0,0)");
      for (let i = 0; i < 40; i += 1) {
        const s = await debug(page, "getState()");
        const r = s.runners[0];
        if (r) samples.push({ direction: r.direction, phase: r.runPhase, frame: r.runFrame });
        await sleep(150);
      }
      await page.screenshot({ path: path.join(outDir, "dir-change.png") });
      let changeIndex = -1;
      for (let i = 1; i < samples.length; i += 1) {
        if (samples[i].direction !== samples[i - 1].direction) { changeIndex = i; break; }
      }
      let phaseOk = false;
      let detail = `no direction change in ${samples.length} samples, last=${JSON.stringify(samples[samples.length - 1])}`;
      if (changeIndex > 0) {
        const prev = samples[changeIndex - 1];
        const cur = samples[changeIndex];
        const advanced = cur.phase >= prev.phase || (prev.phase > 0.9 && cur.phase < 0.2);
        const notReset = !(cur.phase < 0.05 && cur.frame === 0 && prev.phase > 0.3);
        phaseOk = advanced && notReset;
        detail = `change ${prev.direction}->${cur.direction} phase ${prev.phase.toFixed(2)}->${cur.phase.toFixed(2)} frame ${prev.frame}->${cur.frame}`;
      }
      record("dir-change", "Natural direction change preserves run phase", changeIndex > 0 && phaseOk ? "PASS" : "FAIL", detail);
    } catch (e) { record("dir-change", "Natural direction change", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "spawnRunnerAt(0,2)");
      await waitRunnerReady(page);
      const before = await debug(page, "getState()");
      const score0 = before.score;
      const result = await debug(page, "damageRunner(0,36)");
      let defeatFrames = [];
      let removed = false;
      let deadResult = null;
      let shotTerminal = false;
      for (let i = 0; i < 200; i += 1) {
        const s = await debug(page, "getState()");
        const r = s.runners[0];
        if (!r) { removed = true; break; }
        defeatFrames.push(r.defeatFrame);
        if (r.state === "death" && deadResult === null) {
          deadResult = await debug(page, "damageRunner(0,12)");
        }
        if (r.defeatFrame >= 7 && !shotTerminal) {
          await page.screenshot({ path: path.join(outDir, "defeat.png") });
          shotTerminal = true;
        }
        await sleep(100);
      }
      const after = await debug(page, "getState()");
      const scoreGain = after.score - score0;
      const ok = result === "killed" && Math.max(...defeatFrames) >= 7 && removed && (scoreGain === 100 || scoreGain === 350) && deadResult === "dead";
      record("defeat", "Defeat clip plays, enemy removed, score once", ok ? "PASS" : "FAIL", `result=${result} maxDefeatFrame=${Math.max(...defeatFrames)} removed=${removed} scoreGain=${scoreGain} phase=${after.phase} deadResult=${deadResult}`);
    } catch (e) { record("defeat", "Defeat clip and scoring", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "spawnRunnerAt(0,3)");
      const during = await debug(page, "getState()");
      const cueDuring = during.runners[0]?.spawnCue === true && during.runners[0]?.state === "spawn";
      await page.screenshot({ path: path.join(outDir, "spawn.png") });
      await sleep(900);
      const after = await debug(page, "getState()");
      const cueAfter = after.runners[0]?.spawnCue === false && after.runners[0]?.state === "pursue";
      record("spawn", "Spawn cue visible before hittability, gone after", cueDuring && cueAfter ? "PASS" : "FAIL", `during cue=${during.runners[0]?.spawnCue} state=${during.runners[0]?.state} after cue=${after.runners[0]?.spawnCue} state=${after.runners[0]?.state}`);
    } catch (e) { record("spawn", "Spawn cue", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(-0.9)");
      await sleep(300);
      await debug(page, "fireShot()");
      await sleep(300);
      const decals = await debug(page, "getDecals()");
      await page.screenshot({ path: path.join(outDir, "impact.png") });
      let gone = decals;
      for (let i = 0; i < 80 && gone.length > 0; i += 1) {
        await sleep(500);
        gone = await debug(page, "getDecals()");
      }
      record("impact", "Impact decal appears then expires", decals.length > 0 && gone.length === 0 ? "PASS" : "FAIL", `decalsAfterShot=${decals.length} first=${JSON.stringify(decals[0])} decalsAtEnd=${gone.length}`);
    } catch (e) { record("impact", "Impact decal", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setPitch(0)");
      await debug(page, "fireShot()");
      await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs <= 0, 30000, "fire ready");
      await debug(page, "fireShot()");
      await page.screenshot({ path: path.join(outDir, "fire-mid.png") });
      const s1 = await debug(page, "getState()");
      const ammoAfter2 = s1.ammo;
      await page.keyboard.press("KeyR");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.reloading === false && s.ammo === 6;
      }, 30000, "reload done");
      const s2 = await debug(page, "getState()");
      record("accept-shots", "Two shots and reload", ammoAfter2 === 4 && s2.ammo === 6 ? "PASS" : "FAIL", `ammoAfter2=${ammoAfter2} ammoAfterReload=${s2.ammo}`);
      await page.keyboard.down("ShiftLeft");
      await page.keyboard.down("KeyW");
      let runScale = null;
      for (let i = 0; i < 20; i += 1) {
        await sleep(500);
        const s = await debug(page, "getState()");
        runScale = s.weapon?.sprintScale;
        if (Math.abs((runScale ?? 0) - 1.1) < 0.02) break;
      }
      await page.keyboard.up("KeyW");
      await page.keyboard.up("ShiftLeft");
      await sleep(1000);
      const sIdle = await debug(page, "getState()");
      const idleScale = sIdle.weapon?.sprintScale;
      record("accept-sprint", "Sprint scale running vs idle", Math.abs((runScale ?? 0) - 1.1) < 0.02 && Math.abs((idleScale ?? 0) - 1.0) < 0.02 ? "PASS" : "FAIL", `running=${runScale} idle=${idleScale}`);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs <= 0, 30000, "fire ready");
      await debug(page, "fireShot()");
      await sleep(500);
      const crateDecals = await debug(page, "getDecals()");
      const crateHit = crateDecals.some((d) => Math.abs(d.z - (-5.4)) < 0.6 && d.y > 0.25);
      record("accept-crate", "Crate-blocked shot", crateHit ? "PASS" : "FAIL", `decals=${JSON.stringify(crateDecals.map((d) => [d.x.toFixed(2), d.y.toFixed(2), d.z.toFixed(2)]))}`);
      await debug(page, "spawnRunnerAt(0,-3)");
      await waitRunnerReady(page);
      const kill = await debug(page, "damageRunner(0,36)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 30000, "kill removal");
      record("accept-kill", "Kill and removal", kill === "killed" ? "PASS" : "FAIL", `kill=${kill}`);
    } catch (e) { record("accept-sprint", "Acceptance shots and sprint", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?view=2&debug=1`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
      await sleep(800);
      const s = await debug(page, "getState()");
      const a = s.runners[0];
      const b = s.runners[1];
      await page.screenshot({ path: path.join(outDir, "view2.png") });
      const phaseDiff = a && b && Math.abs(((a.runPhase - b.runPhase) % 1 + 1) % 1 - 0.5) < 0.15;
      record("accept-view2", "Two runners out of phase", phaseDiff ? "PASS" : "FAIL", `left phase=${a?.runPhase?.toFixed(2)} right phase=${b?.runPhase?.toFixed(2)}`);
    } catch (e) { record("accept-view2", "Two runners out of phase", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,-3)");
      await waitRunnerReady(page);
      const env = await debug(page, "getEnvironment()");
      record("accept-env", "Environment layers present", env.maps.length > 0 ? "PASS" : "FAIL", `maps=${env.maps.join(",")}`);
      await debug(page, "damagePlayer(100)");
      await sleep(400);
      const dead = await debug(page, "getState()");
      record("accept-death", "Player death", dead.phase === "dead" && dead.playerHealth === 0 ? "PASS" : "FAIL", `phase=${dead.phase} health=${dead.playerHealth}`);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "restart playing");
      const restarted = await debug(page, "getState()");
      record("accept-restart", "Death and restart", restarted.playerHealth === 100 ? "PASS" : "FAIL", `health=${restarted.playerHealth} wave=${restarted.wave}`);
    } catch (e) { record("accept-restart", "Death and restart", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      let cleared = false;
      for (let i = 0; i < 360; i += 1) {
        const s = await debug(page, "getState()");
        if (s.phase === "waveComplete") { cleared = true; break; }
        if (s.runners.length > 0 && s.runners[0].state !== "spawn" && s.runners[0].state !== "death") {
          await debug(page, "damageRunner(0,36)");
        }
        await sleep(500);
      }
      await page.screenshot({ path: path.join(outDir, "wave-complete.png") });
      let wave2Ok = false;
      let pickupOk = false;
      if (cleared) {
        await page.click("#startBtn");
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "wave2 playing");
        await sleep(1500);
        const s = await debug(page, "getState()");
        wave2Ok = s.wave === 2;
        pickupOk = s.pickups.length > 0;
        await page.screenshot({ path: path.join(outDir, "wave2.png") });
      }
      record("accept-wave", "Full wave clear, wave 2, pickups", cleared && wave2Ok && pickupOk ? "PASS" : "FAIL", `cleared=${cleared} wave2=${wave2Ok} pickups=${pickupOk}`);
    } catch (e) { record("accept-wave", "Full wave clear", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?review=1`);
      await sleep(1500);
      const headings = await page.evaluate(() => [...document.querySelectorAll("h2")].map((h) => h.textContent));
      const wanted = ["runner_run_back", "runner_run_back_left", "runner_run_back_right", "runner_run_front_left", "runner_run_front_right", "runner_run_left", "runner_run_right", "runner_defeat_front"];
      const missing = wanted.filter((w) => !headings.some((h) => h.startsWith(`Clip ${w} `)));
      const defeatHeading = headings.find((h) => h.startsWith("Clip runner_defeat_front "));
      const el = await page.evaluate(() => {
        const hs = [...document.querySelectorAll("h2")];
        const h = hs.find((x) => x.textContent.startsWith("Clip runner_defeat_front "));
        if (h) h.scrollIntoView();
        return !!h;
      });
      await sleep(500);
      await page.screenshot({ path: path.join(outDir, "review-defeat.png") });
      record("review", "Review shows all new clips", missing.length === 0 && el ? "PASS" : "FAIL", `missing=${missing.join(",")} defeatHeading=${defeatHeading}`);
    } catch (e) { record("review", "Review clips", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results }, null, 2));
  const failed = results.filter((r) => r.status !== "PASS");
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) console.log(`FAILED: ${failed.map((r) => r.id).join(", ")}`);
}
