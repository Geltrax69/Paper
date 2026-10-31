import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = process.env.PAPER_OUT_DIR ? path.resolve(process.env.PAPER_OUT_DIR) : scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5188);
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
async function ensurePlaying(page) {
  const s = await debug(page, "getState()");
  if (s.phase === "waveComplete" || s.phase === "dead" || s.phase === "paused") {
    await page.click("#startBtn");
    await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, "playing after resume");
  }
}
async function waitRunnerState(page, wanted, timeoutMs = 180000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    return s.runners.length > 0 && s.runners[0].state === wanted;
  }, timeoutMs, `runner ${wanted}`);
}
async function waitCooldown(page) {
  await waitFor(page, async () => (await debug(page, "getInputState()")).fireCooldownMs === 0, 60000, "fire cooldown");
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
      await debug(page, "spawnRunnerAt(0,0)");
      await waitRunnerState(page, "pursue");
      const first = await debug(page, "getState()");
      record("short-spawn", "Spawned runner reaches pursue via runners state", "PASS", `state=${first.runners[0].state} family=${first.runners[0].family} pos=${first.runners[0].x},${first.runners[0].z}`);
      for (let i = 0; i < 3; i += 1) {
        await debug(page, "damageRunner(0,36)");
        await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 120000, "kill for ink");
        if (i < 2) {
          await debug(page, "spawnRunnerAt(0,0)");
          await waitRunnerState(page, "pursue");
        }
      }
      const inkBefore = (await debug(page, "getWeapons()")).ink;
      const shock = await debug(page, "spendInk()");
      const inkAfter = (await debug(page, "getWeapons()")).ink;
      const proj = await debug(page, "getProjectiles()");
      await page.screenshot({ path: path.join(outDir, "ink-shock.png") });
      record("short-ink", "Ink pressure builds from kills and spends on a shock", inkBefore > 0 && shock === true && inkAfter < inkBefore ? "PASS" : "FAIL", `inkBefore=${inkBefore} shock=${shock} inkAfter=${inkAfter} lastShock=${JSON.stringify(proj.lastShock)}`);
    } catch (e) {
      record("short-ink", "Ink pressure short run", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"insect\")");
      await waitRunnerState(page, "pursue");
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
      record("short-insect", "Insect telegraph shows before its strike", insectOk ? "PASS" : "FAIL", `family=${insect.runners[0] ? insect.runners[0].family : "none"} warning=${insect.runners[0] ? insect.runners[0].warningVisible : "none"} radius=${insect.runners[0] ? insect.runners[0].warningRadius : "none"}`);
      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"brute\")");
      await waitRunnerState(page, "pursue");
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
      record("short-brute", "Brute windup shows before its slam", bruteOk ? "PASS" : "FAIL", `family=${brute.runners[0] ? brute.runners[0].family : "none"} warning=${brute.runners[0] ? brute.runners[0].warningVisible : "none"} radius=${brute.runners[0] ? brute.runners[0].warningRadius : "none"}`);
    } catch (e) {
      record("short-insect", "Insect and brute short run", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "spawnRunnerAt(0,3)");
      await waitRunnerState(page, "pursue");
      await debug(page, "setYaw(Math.PI)");
      await debug(page, "setPitch(0)");
      await sleep(500);
      await debug(page, "fireShot()");
      await waitCooldown(page);
      const ammoAfterShot = (await debug(page, "getState()")).ammo;
      await ensurePlaying(page);
      await debug(page, "pressKeyDown(\"KeyR\")");
      const reloadSeq = [];
      const rstart = Date.now();
      while (Date.now() - rstart < 120000) {
        const s = await debug(page, "getState()");
        if (s.weapon && s.weapon.reloading) {
          const f = s.weapon.reloadFrame;
          if (reloadSeq.length === 0 || reloadSeq[reloadSeq.length - 1] !== f) reloadSeq.push(f);
        } else if (reloadSeq.length > 0) break;
        await sleep(50);
      }
      await debug(page, "pressKeyUp(\"KeyR\")");
      await page.screenshot({ path: path.join(outDir, "seq-reload-short.png") });
      record("short-reload", "Reload frames advance in order with phase guarded", reloadSeq.length >= 4 ? "PASS" : "FAIL", `ammoAfterShot=${ammoAfterShot} frames=${reloadSeq.join(",")}`);
      await ensurePlaying(page);
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
      record("short-sprint", "Sprint scale rises toward 1.1 with phase guarded", sprintSeq.length > 0 && sprintSeq[sprintSeq.length - 1] >= 1.05 ? "PASS" : "FAIL", `scales=${sprintSeq.join(",")}`);
      await debug(page, "clearRunners()");
      await ensurePlaying(page);
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(0)");
      await debug(page, "setPitch(0)");
      await debug(page, "spawnRunnerAt(0,5)");
      await waitRunnerState(page, "pursue");
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
      await page.screenshot({ path: path.join(outDir, "seq-attack-short.png") });
      record("short-attack", "Attack frames advance with phase guarded", attackSeq.length >= 3 ? "PASS" : "FAIL", `frames=${attackSeq.join(",")}`);
    } catch (e) {
      record("short-reload", "Reload, sprint, attack short run", "FAIL", String(e.message).slice(0, 300));
    }
    await page.close();
  }

  record("console-short", "Console and page errors during short run", consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL", `consoleErrors=${consoleErrors.slice(0, 3).join(" | ")} pageErrors=${pageErrors.slice(0, 3).join(" | ")}`);
} finally {
  await browser.close();
  server.kill();
}

writeFileSync(path.join(outDir, "report-short.json"), JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
const failed = results.filter((r) => r.status !== "PASS");
console.log(`SHORT ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exitCode = 1;
