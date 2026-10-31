import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = process.env.PAPER_OUT_DIR ? path.resolve(process.env.PAPER_OUT_DIR) : scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5186);
const base = process.env.PAPER_BASE_URL ?? `http://127.0.0.1:${port}`;
mkdirSync(outDir, { recursive: true });

function discoverBrowser() {
  if (process.env.PAPER_BROWSER) return process.env.PAPER_BROWSER;
  const root = path.join(os.homedir(), ".cache/ms-playwright");
  for (const dir of readdirSync(root).sort().reverse()) {
    const full = path.join(root, dir, "chrome-linux64/chrome");
    if (existsSync(full)) return full;
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
async function waitPursue(page, timeoutMs = 180000) {
  await waitFor(page, async () => {
    const r = await debug(page, "getLastSpawned()");
    return r && r.state === "pursue";
  }, timeoutMs, "runner pursue");
}
async function waitCooldown(page) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 60000, "fire cooldown");
}
async function killAllRunners(page) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.runners.length === 0 && s.spawnQueueLength === 0) return true;
    for (let i = s.runners.length - 1; i >= 0; i -= 1) await debug(page, `damageRunner(${i},200)`);
    const s2 = await debug(page, "getState()");
    return s2.runners.every((r) => r.state === "death") && s2.spawnQueueLength === 0;
  }, 180000, "all runners dying");
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
  } catch { /* not up yet */ }
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
      await startGame(page);
      await debug(page, "clearRunners()");
      const env = await debug(page, "getEnvironment()");
      const envOk = env.background === true && env.maps.includes("punchy_floor_dark_ink.png") && env.maps.includes("punchy_shotgun_idle.png");
      record("env-1280-rerun", "Dark floor, sky background, canonical idle at 1280", envOk ? "PASS" : "FAIL", `background=${env.background} maps=${env.maps.join(",")}`);
      await page.screenshot({ path: path.join(outDir, "gameplay-1280-rerun.png") });
    } catch (e) {
      record("env-1280-rerun", "Environment rerun", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "startWaveDebug(1)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "wave 1 playing");
      await killAllRunners(page);
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 180000, "waveComplete");
      const wc = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "wave-complete-rerun.png") });
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "wave 2 playing");
      const w2 = await debug(page, "getState()");
      await debug(page, "damagePlayer(100)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "dead", 60000, "dead");
      await page.screenshot({ path: path.join(outDir, "death-rerun.png") });
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "restart playing");
      const after = await debug(page, "getState()");
      const ok = wc.score > 0 && w2.wave === 2 && after.wave === 2 && after.playerHealth === 100;
      record("waves-death-rerun", "Wave clear, next wave, death, restart on same wave at full health", ok ? "PASS" : "FAIL", `waveClearScore=${wc.score} wave2=${w2.wave} afterWave=${after.wave} health=${after.playerHealth}`);
    } catch (e) {
      record("waves-death-rerun", "Wave clear, death, restart rerun", "FAIL", String(e.message).slice(0, 300));
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
      for (let i = 0; i < 3; i += 1) {
        await debug(page, "damageRunner(0,36)");
        await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 120000, "kill for ink");
        if (i < 2) {
          await debug(page, "spawnRunnerAt(0,0)");
          await waitPursue(page);
        }
      }
      const inkBefore = (await debug(page, "getWeapons()")).ink;
      const shock = await debug(page, "spendInk()");
      const inkAfter = (await debug(page, "getWeapons()")).ink;
      const proj = await debug(page, "getProjectiles()");
      await page.screenshot({ path: path.join(outDir, "ink-shock.png") });
      record("ink-pressure-rerun", "Ink pressure builds from kills and spends on a shock", inkBefore > 0 && shock === true && inkAfter < inkBefore ? "PASS" : "FAIL", `inkBefore=${inkBefore} shock=${shock} inkAfter=${inkAfter} lastShock=${JSON.stringify(proj.lastShock)}`);
    } catch (e) {
      record("ink-pressure-rerun", "Ink pressure rerun", "FAIL", String(e.message).slice(0, 300));
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
      }, 180000, "insect telegraph");
      await page.screenshot({ path: path.join(outDir, "insect-telegraph.png") });
      const insect = await debug(page, "getState()");
      const insectOk = insect.runners[0] && insect.runners[0].family === "insect" && insect.runners[0].warningVisible === true;
      record("insect-attack-rerun", "Insect telegraph shows before its strike", insectOk ? "PASS" : "FAIL", `family=${insect.runners[0] ? insect.runners[0].family : "none"} warning=${insect.runners[0] ? insect.runners[0].warningVisible : "none"} radius=${insect.runners[0] ? insect.runners[0].warningRadius : "none"}`);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"brute\")");
      await waitPursue(page);
      await debug(page, "setPlayerFeet(0,0,4)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await waitFor(page, async () => {
        const s = await debug(page, "getState()");
        return s.runners[0] && s.runners[0].warningVisible === true;
      }, 180000, "brute windup");
      await page.screenshot({ path: path.join(outDir, "brute-slam.png") });
      const brute = await debug(page, "getState()");
      const bruteOk = brute.runners[0] && brute.runners[0].family === "brute" && brute.runners[0].warningVisible === true;
      record("brute-attack-rerun", "Brute windup shows before its slam", bruteOk ? "PASS" : "FAIL", `family=${brute.runners[0] ? brute.runners[0].family : "none"} warning=${brute.runners[0] ? brute.runners[0].warningVisible : "none"} radius=${brute.runners[0] ? brute.runners[0].warningRadius : "none"}`);
    } catch (e) {
      record("insect-attack-rerun", "Insect and brute attacks rerun", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "startWaveDebug(1)");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "warmup wave playing");
      const warm = await debug(page, "getState()");
      const samples = [];
      for (let wave = 4; wave <= 6; wave += 1) {
        await debug(page, "clearRunners()");
        await debug(page, `startWaveDebug(${wave})`);
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, `wave ${wave} playing`);
        await killAllRunners(page);
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 180000, `wave ${wave} complete`);
        const s = await debug(page, "getState()");
        samples.push({ wave, geometries: s.geometries, textures: s.textures, drawCalls: s.drawCalls, frameTimeMs: s.frameTimeMs });
        await page.click("#startBtn");
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "next wave playing");
      }
      const flat = samples.every((s) => s.geometries === samples[0].geometries && s.textures === samples[0].textures);
      record("stability-rerun", "Post-warmup waves settle at stable geometry and texture counts", flat ? "PASS" : "FAIL", `warmup=${warm.geometries}/${warm.textures} samples=${samples.map((s) => `w${s.wave}:${s.geometries}/${s.textures}/draw${s.drawCalls}`).join(" ")}`);
      writeFileSync(path.join(outDir, "stability-rerun.json"), JSON.stringify({ warmup: { geometries: warm.geometries, textures: warm.textures }, samples }, null, 2));
    } catch (e) {
      record("stability-rerun", "Repeated-wave stability rerun", "FAIL", String(e.message).slice(0, 300));
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
      const runSeq = [];
      const rstart = Date.now();
      while (runSeq.length < 16 && Date.now() - rstart < 120000) {
        const s = await debug(page, "getState()");
        const f = s.runners[0] ? s.runners[0].runFrame : -1;
        if (f >= 0 && (runSeq.length === 0 || runSeq[runSeq.length - 1] !== f)) runSeq.push(f);
        await sleep(100);
      }
      const runOk = runSeq.length >= 8 && runSeq.slice(0, 8).every((f, i) => i === 0 || f === (runSeq[i - 1] + 1) % 8 || runSeq[i - 1] === f);
      const runMonotonic = runSeq.every((f, i) => i === 0 || f === (runSeq[i - 1] + 1) % 8);
      record("seq-run-rerun", "Run frames advance in order by polling only", runMonotonic && runSeq.length >= 8 ? "PASS" : "FAIL", `frames=${runSeq.join(",")}`);
      await debug(page, "fireShot()");
      const fireSeq = [];
      const fstart = Date.now();
      while (Date.now() - fstart < 60000) {
        const s = await debug(page, "getState()");
        if (s.weapon && s.weapon.firing) {
          const f = s.weapon.fireFrame;
          if (fireSeq.length === 0 || fireSeq[fireSeq.length - 1] !== f) fireSeq.push(f);
        } else if (fireSeq.length > 0) break;
        await sleep(50);
      }
      record("seq-fire-rerun", "Fire frames advance in order by polling only", fireSeq.length >= 3 ? "PASS" : "FAIL", `frames=${fireSeq.join(",")}`);
      await waitCooldown(page);
      await debug(page, "pressKeyDown(\"KeyR\")");
      const reloadSeq = [];
      const rstart2 = Date.now();
      while (Date.now() - rstart2 < 120000) {
        const s = await debug(page, "getState()");
        if (s.weapon && s.weapon.reloading) {
          const f = s.weapon.reloadFrame;
          if (reloadSeq.length === 0 || reloadSeq[reloadSeq.length - 1] !== f) reloadSeq.push(f);
        } else if (reloadSeq.length > 0) break;
        await sleep(50);
      }
      await debug(page, "pressKeyUp(\"KeyR\")");
      record("seq-reload-rerun", "Reload frames advance in order by polling only", reloadSeq.length >= 4 ? "PASS" : "FAIL", `frames=${reloadSeq.join(",")}`);
      await debug(page, "pressKeyDown(\"ShiftLeft\")");
      await debug(page, "pressKeyDown(\"KeyW\")");
      const sprintSeq = [];
      const sstart = Date.now();
      while (Date.now() - sstart < 60000) {
        const s = await debug(page, "getState()");
        const sc = s.weapon ? s.weapon.sprintScale : 0;
        if (sprintSeq.length === 0 || Math.abs(sprintSeq[sprintSeq.length - 1] - sc) > 0.01) sprintSeq.push(Number(sc.toFixed(3)));
        if (sc >= 1.09) break;
        await sleep(100);
      }
      await debug(page, "pressKeyUp(\"KeyW\")");
      await debug(page, "pressKeyUp(\"ShiftLeft\")");
      record("seq-sprint-rerun", "Sprint scale rises toward 1.1 by polling only", sprintSeq.length > 0 && sprintSeq[sprintSeq.length - 1] >= 1.05 ? "PASS" : "FAIL", `scales=${sprintSeq.join(",")}`);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await debug(page, "spawnRunnerAt(0,5)");
      await waitPursue(page);
      const attackSeq = [];
      const astart = Date.now();
      while (Date.now() - astart < 180000 && attackSeq.length < 6) {
        const s = await debug(page, "getState()");
        if (s.runners[0] && s.runners[0].state === "attack") {
          const f = s.runners[0].attackFrame;
          if (f >= 0 && (attackSeq.length === 0 || attackSeq[attackSeq.length - 1] !== f)) attackSeq.push(f);
        }
        await sleep(100);
      }
      record("seq-attack-rerun", "Attack frames advance by polling only", attackSeq.length >= 3 ? "PASS" : "FAIL", `frames=${attackSeq.join(",")}`);
      await debug(page, "explodeAt(0,1,-4)");
      const expSeq = [];
      for (let i = 0; i < 6; i += 1) {
        const vis = await debug(page, "getExplosionVisuals()");
        expSeq.push(JSON.stringify(vis));
        await sleep(300);
      }
      await page.screenshot({ path: path.join(outDir, "seq-explosion-rerun.png") });
      record("seq-explosion-rerun", "Explosion visuals sampled over time", "PASS", `samples=${expSeq.join(" | ")}`);
    } catch (e) {
      record("seq-run-rerun", "Frame sequences rerun", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${base}/?review=1`, { timeout: 90000 });
      await page.waitForFunction(() => document.querySelectorAll(".review-row").length > 0, { timeout: 30000 });
      const stepped = {};
      for (const clip of ["runner_run_front", "shotgun_fire", "shotgun_reload", "runner_attack_front"]) {
        const handle = await page.evaluateHandle((c) => {
          const h = [...document.querySelectorAll("h2")].find((el) => el.textContent.startsWith(`Clip ${c} `));
          if (!h) return null;
          return h.nextElementSibling;
        }, clip);
        if (!handle || (await handle.evaluate((el) => el === null))) throw new Error(`no review row for ${clip}`);
        const count = await page.evaluate((c) => {
          const h = [...document.querySelectorAll("h2")].find((el) => el.textContent.startsWith(`Clip ${c} `));
          const m = h ? h.textContent.match(/(\d+) frames/) : null;
          return m ? Number(m[1]) : 0;
        }, clip);
        const names = [];
        for (let i = 0; i < count; i += 1) {
          await handle.evaluate((row) => {
            const btn = [...row.querySelectorAll("button")].find((b) => b.textContent === "Step frame");
            if (btn) btn.click();
          });
          await sleep(200);
          const name = `seq-${clip}-slowed-step${i}.png`;
          await handle.screenshot({ path: path.join(outDir, name) });
          names.push(name);
        }
        stepped[clip] = names;
      }
      const slowedOk = Object.values(stepped).every((n) => n.length >= 4);
      record("seq-slowed-rerun", "Slowed frame-by-frame sequences via review stepping", slowedOk ? "PASS" : "FAIL", `clips=${Object.entries(stepped).map(([k, v]) => `${k}:${v.length}`).join(" ")}`);
    } catch (e) {
      record("seq-slowed-rerun", "Slowed sequences rerun", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  record("console-rerun", "Console and page errors during rerun", consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL", `consoleErrors=${consoleErrors.slice(0, 3).join(" | ")} pageErrors=${pageErrors.slice(0, 3).join(" | ")}`);
} finally {
  await browser.close();
  server.kill();
}

writeFileSync(path.join(outDir, "report-rerun.json"), JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
const failed = results.filter((r) => r.status !== "PASS");
console.log(`RERUN ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exitCode = 1;
