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
const base = "http://127.0.0.1:5175";
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
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function waitRunnerReady(page) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    const r = s.runners[0];
    return r && r.state !== "spawn" && r.state !== "death";
  }, 10000, "runner ready");
}
async function waitFireReady(page) {
  await waitFor(page, async () => {
    const inp = await debug(page, "getInputState()");
    const s = await debug(page, "getState()");
    return inp.fireCooldownMs <= 0 && s.reloading === false;
  }, 30000, "fire ready");
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
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5175", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  // P2-1: run clip advances, footsteps increase
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "spawnRunnerAt(0,-8)");
      await waitRunnerReady(page);
      await sleep(500);
      const frames = new Set();
      let steps0 = 0;
      let steps1 = 0;
      for (let i = 0; i < 12; i += 1) {
        const s = await debug(page, "getState()");
        frames.add(s.runners[0]?.runFrame);
        if (i === 0) steps0 = s.runners[0]?.footstepCount ?? 0;
        steps1 = s.runners[0]?.footstepCount ?? 0;
        await sleep(200);
      }
      await page.screenshot({ path: path.join(outDir, "p2-run.png") });
      const ok = frames.size >= 3 && steps1 > steps0;
      record("p2-run", "Run clip advances with footsteps", ok ? "PASS" : "FAIL", `distinct run frames=${[...frames].join(",")} footsteps ${steps0}->${steps1}`);
    } catch (e) { record("p2-run", "Run clip advances", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // P2-2: two runners at different phases side by side
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?view=2&debug=1`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
      await sleep(800);
      const s = await debug(page, "getState()");
      const a = s.runners[0];
      const b = s.runners[1];
      const phaseDiff = Math.abs(((a.runPhase - b.runPhase) % 1 + 1) % 1 - 0.5) < 0.15;
      await page.screenshot({ path: path.join(outDir, "p2-view2.png") });
      record("p2-view2", "Two runners at different run phases", a && b && phaseDiff ? "PASS" : "FAIL", `left runFrame=${a?.runFrame} phase=${a?.runPhase?.toFixed(2)} right runFrame=${b?.runFrame} phase=${b?.runPhase?.toFixed(2)}`);
    } catch (e) { record("p2-view2", "Two runners phases", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // P2-3: attack damage once at strike
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "spawnRunnerAt(0,7)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state === "attack", 15000, "attack state");
      const before = await debug(page, "getState()");
      const healthBefore = before.playerHealth;
      const attackFrames = new Set();
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        attackFrames.add(s.runners[0]?.attackFrame);
        return (s.runners[0]?.attackFrame ?? 0) >= 4;
      }, 10000, "attack past strike");
      await debug(page, "setPlayerFeet(0,0,15)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        attackFrames.add(s.runners[0]?.attackFrame);
        return s.runners[0]?.state === "pursue";
      }, 10000, "attack completes");
      const after = await debug(page, "getState()");
      const damage = healthBefore - after.playerHealth;
      await page.screenshot({ path: path.join(outDir, "p2-attack.png") });
      record("p2-attack", "Attack damage once at strike", damage === 12 && attackFrames.has(3) ? "PASS" : "FAIL", `health ${healthBefore}->${after.playerHealth} damage=${damage} attackFrames=${[...attackFrames].join(",")}`);
    } catch (e) { record("p2-attack", "Attack damage once", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // P2-4: fire clip, flash fade and removal
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      const fireFrames = new Set();
      let flashOnAfter = null;
      for (let i = 0; i < 10; i += 1) {
        const s = await debug(page, "getState()");
        if (s.weapon?.firing) fireFrames.add(s.weapon.fireFrame);
        if (i >= 6) flashOnAfter = s.weapon?.flashOn;
        await sleep(60);
      }
      await page.screenshot({ path: path.join(outDir, "p2-fire.png") });
      const end = await debug(page, "getState()");
      const ok = fireFrames.size >= 3 && end.weapon?.firing === false && flashOnAfter === false;
      record("p2-fire", "Fire clip advances, flash fades and is removed", ok ? "PASS" : "FAIL", `fireFrames=${[...fireFrames].join(",")} firingEnd=${end.weapon?.firing} flashOnAfter=${flashOnAfter} flashFrameEnd=${end.weapon?.flashFrame}`);
    } catch (e) { record("p2-fire", "Fire and flash clip", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // P2-5: sprint enlarges only during actual running, returns without snap
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await page.keyboard.down("ShiftLeft");
      await sleep(600);
      const still = await debug(page, "getState()");
      const stillScale = still.weapon?.sprintScale ?? 1;
      await page.keyboard.down("KeyW");
      await sleep(800);
      const running = await debug(page, "getState()");
      const runScale = running.weapon?.sprintScale ?? 1;
      await page.screenshot({ path: path.join(outDir, "p2-sprint.png") });
      await page.keyboard.up("KeyW");
      await page.keyboard.up("ShiftLeft");
      await sleep(600);
      const idle = await debug(page, "getState()");
      const idleScale = idle.weapon?.sprintScale ?? 1;
      const ok = Math.abs(stillScale - 1) < 0.03 && runScale > 1.05 && Math.abs(idleScale - 1) < 0.03;
      record("p2-sprint", "Sprint enlarges only during actual running", ok ? "PASS" : "FAIL", `still=${stillScale.toFixed(3)} running=${runScale.toFixed(3)} idle=${idleScale.toFixed(3)}`);
    } catch (e) { record("p2-sprint", "Sprint behaviour", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // P2-6: review playback steps frames and plays slowed
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?review=1`);
      await sleep(1500);
      const info = await page.evaluate(() => {
        const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent);
        const clipHeading = [...document.querySelectorAll("h2")].find((h) => h.textContent.startsWith("Clip runner_run_front"));
        if (!clipHeading) return { headings, found: false };
        const row = clipHeading.nextElementSibling;
        const cell = row?.querySelector(".review-cell");
        const label = [...cell.querySelectorAll("div")].find((d) => /frame \d/.test(d.textContent));
        const before = label?.textContent ?? "";
        const stepBtn = [...cell.querySelectorAll("button")].find((b) => b.textContent === "Step frame");
        stepBtn?.click();
        return { headings, found: true, before };
      });
      await sleep(300);
      const after = await page.evaluate(() => {
        const clipHeading = [...document.querySelectorAll("h2")].find((h) => h.textContent.startsWith("Clip runner_run_front"));
        const row = clipHeading?.nextElementSibling;
        const cell = row?.querySelector(".review-cell");
        const label = [...cell.querySelectorAll("div")].find((d) => /frame \d/.test(d.textContent));
        return label?.textContent ?? "";
      });
      await page.screenshot({ path: path.join(outDir, "p2-review.png") });
      const beforeFrame = Number((info.before.match(/frame (\d+)/) ?? [])[1]);
      const afterFrame = Number((after.match(/frame (\d+)/) ?? [])[1]);
      const ok = info.found && afterFrame === (beforeFrame + 1) % 8;
      record("p2-review", "Review playback steps frames", ok ? "PASS" : "FAIL", `before=${info.before} after=${after} clips=${(info.headings ?? []).filter((h) => h.startsWith("Clip")).join(" | ")}`);
    } catch (e) { record("p2-review", "Review playback", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // Pass 1 regression: two shots, reload, kill, crate-blocked, wave clear, death/restart
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(-0.1)");
      await debug(page, "spawnRunnerAt(0,4)");
      await waitRunnerReady(page);
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await sleep(300);
      const s1 = await debug(page, "getState()");
      const killOk = s1.runners[0]?.state === "death" || s1.runners.length === 0;
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 8000, "kill removal");
      record("accept-kill", "Pass 1: kill and removal", killOk ? "PASS" : "FAIL", `kill=${killOk}`);
    } catch (e) { record("accept-kill", "Pass 1 kill", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(3.141592653589793)");
      await debug(page, "setPitch(0)");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await sleep(300);
      const s2 = await debug(page, "getState()");
      const twoShots = s2.ammo === 4;
      await page.keyboard.press("KeyR");
      await sleep(200);
      const sr = await debug(page, "getState()");
      const reloadOk = sr.reloading === true;
      await waitFor(page, async () => (await debug(page, "getState()")).reloading === false, 5000, "reload done");
      const sd = await debug(page, "getState()");
      const reloadDone = sd.ammo === 6;
      record("accept-shots", "Pass 1: two air shots and reload", twoShots && reloadOk && reloadDone ? "PASS" : "FAIL", `ammoAfter2AirShots=${s2.ammo} reloading=${reloadOk} ammoAfterReload=${sd.ammo}`);
    } catch (e) { record("accept-shots", "Pass 1 shots/reload/kill", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-6,0,1)");
      await debug(page, "setYaw(3.141592653589793)");
      await debug(page, "setPitch(-0.15)");
      await debug(page, "spawnRunnerAt(-6,7)");
      await waitRunnerReady(page);
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await sleep(300);
      const crate = await debug(page, "getState()");
      const ok = crate.runners[0]?.health === 36 && crate.lastTracer?.to[2] >= 3.0 && crate.lastTracer?.to[2] <= 3.2;
      record("accept-crate", "Pass 1: crate-blocked shot", ok ? "PASS" : "FAIL", `health=${crate.runners[0]?.health} tracerTo=${crate.lastTracer?.to.map((v) => v.toFixed(2)).join(",")}`);
    } catch (e) { record("accept-crate", "Pass 1 crate-blocked", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "spawnRunnerAt(0,7)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "dead", 120000, "death");
      await page.screenshot({ path: path.join(outDir, "accept-dead.png") });
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "restart playing");
      const rh = await debug(page, "getState()");
      record("accept-death", "Pass 1: death and restart", rh.playerHealth === 100 ? "PASS" : "FAIL", `health after restart=${rh.playerHealth}`);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(-0.1)");
      await debug(page, "spawnRunnerAt(0,-8)");
      for (let i = 0; i < 6; i += 1) {
        await waitFor(page, async () => {
          const s = await debug(page, "getState()");
          return s.runners.length >= 1 && s.runners[0].state !== "spawn" && s.runners[0].state !== "death";
        }, 30000, `wave runner ${i + 1} ready`);
        if (i < 5) await debug(page, "spawnRunnerAt(0,-8)");
        const targetCount = (await debug(page, "getState()")).runners.length;
        for (let shot = 0; shot < 12; shot += 1) {
          await waitFireReady(page);
          let s = await debug(page, "getState()");
          if (s.runners[0]?.state === "death") break;
          let target = s.runners[0];
          let px = s.playerFeet[0];
          let pz = s.playerFeet[2];
          let dx = target.x - px;
          let dz = target.z - pz;
          let dist = Math.hypot(dx, dz);
          if (dist < 4) {
            const nx = Math.max(-11, Math.min(11, px - (dx / dist) * 2.5));
            const nz = Math.max(-11, Math.min(11, pz - (dz / dist) * 2.5));
            await debug(page, `setPlayerFeet(${nx},0,${nz})`);
            px = nx; pz = nz; dx = target.x - px; dz = target.z - pz; dist = Math.hypot(dx, dz);
          }
          await debug(page, `setYaw(${Math.atan2(-dx, -dz)})`);
          await debug(page, `setPitch(${-Math.atan2(0.6, Math.max(1, dist))})`);
          await sleep(100);
          await debug(page, "fireShot()");
          await sleep(900);
          s = await debug(page, "getState()");
          if (s.runners.length < targetCount || s.runners[0]?.state === "death") break;
          await sleep(900);
        }
        await waitFor(page, async () => (await debug(page, "getState()")).runners.length === targetCount - 1, 30000, `wave runner ${i + 1} removal`);
      }
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 20000, "wave complete");
      await page.screenshot({ path: path.join(outDir, "accept-wave.png") });
      record("accept-wave", "Pass 1: full wave clear", "PASS", "6 runners killed sequentially with kiting, waveComplete menu shown");
    } catch (e) { record("accept-wave", "Pass 1 wave/death", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} catch (e) {
  console.error("harness error", e);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results, browser: "chromium cached 1248", base }, null, 2));
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`SUMMARY ${pass}/${results.length} PASS`);
}
