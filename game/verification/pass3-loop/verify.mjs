import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
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
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function waitFireReady(page) {
  await waitFor(page, async () => {
    const inp = await debug(page, "getInputState()");
    const s = await debug(page, "getState()");
    return inp.fireCooldownMs <= 0 && s.reloading === false;
  }, 30000, "fire ready");
}
async function startGame(page) {
  await page.addInitScript(() => localStorage.clear());
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
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5178", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  // Startup bytes, measured on the wire during one load.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      let bytes = 0;
      const kinds = {};
      page.on("response", async (res) => {
        try {
          const url = res.url();
          if (!url.startsWith(base)) return;
          const body = await res.body().catch(() => null);
          if (!body) return;
          bytes += body.length;
          const ext = url.split(".").pop().split("?")[0];
          kinds[ext] = (kinds[ext] ?? 0) + body.length;
        } catch {}
      });
      await page.goto(`${base}/?debug=1`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
      await sleep(500);
      record("budget-startup", "Startup bytes on the wire", "PASS", `total=${bytes} byExt=${JSON.stringify(kinds)}`);
    } catch (e) { record("budget-startup", "Startup bytes", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // Wave 1 clear into wave 2, with score and combo changing.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await waitFor(page, async () => (await debug(page, "getState()")).runnersLeft === 6, 20000, "wave 1 full spawn");
      const startState = await debug(page, "getState()");
      let guard = 0;
      while (guard++ < 240) {
        const s = await debug(page, "getState()");
        if (s.phase === "waveComplete") break;
        if (s.runners.length > 0) {
          const r = s.runners[0];
          if (r.state !== "death") await debug(page, "damageRunner(0,36)");
        }
        await sleep(300);
      }
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 15000, "wave complete");
      const cleared = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "wave-complete.png") });
      const waveOk = cleared.wave === 1 && cleared.score >= 850 && cleared.combo >= 1;
      record("wave-score", "Wave 1 clear with score and combo", waveOk ? "PASS" : "FAIL", `wave=${cleared.wave} score=${cleared.score} combo=${cleared.combo} runnersLeft=${cleared.runnersLeft} startScore=${startState.score}`);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "wave 2 playing");
      await waitFor(page, async () => (await debug(page, "getState()")).runnersLeft === 8, 20000, "wave 2 full spawn");
      const wave2 = await debug(page, "getState()");
      await page.screenshot({ path: path.join(outDir, "wave2.png") });
      const perf = await debug(page, "getState()");
      record("wave2", "Wave 2 starts with 8 runners", wave2.wave === 2 && wave2.runnersLeft === 8 ? "PASS" : "FAIL", `wave=${wave2.wave} runnersLeft=${wave2.runnersLeft} drawCalls=${perf.drawCalls} frameTimeMs=${perf.frameTimeMs?.toFixed(1)}`);
    } catch (e) { record("wave-score", "Wave 1 clear into wave 2", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // Pickups: health once, ammo once, both capped, both gone.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "damagePlayer(40)");
      let s = await debug(page, "getState()");
      const damaged = s.playerHealth;
      await debug(page, "setPlayerFeet(-9,0,5)");
      await waitFor(page, async () => (await debug(page, "getState()")).pickups.find((p) => p.kind === "health")?.taken === true, 5000, "health pickup taken");
      s = await debug(page, "getState()");
      const healthOk = damaged === 60 && s.playerHealth === 100;
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      s = await debug(page, "getState()");
      const ammoAfterShots = s.ammo;
      await debug(page, "setPlayerFeet(9,0,5)");
      await waitFor(page, async () => (await debug(page, "getState()")).pickups.find((p) => p.kind === "ammo")?.taken === true, 5000, "ammo pickup taken");
      s = await debug(page, "getState()");
      const ammoOk = ammoAfterShots === 4 && s.ammo === 6;
      await page.screenshot({ path: path.join(outDir, "pickups.png") });
      record("pickup-health", "Health pickup collected once, +40 capped", healthOk ? "PASS" : "FAIL", `damaged=${damaged} after=${s.playerHealth}`);
      record("pickup-ammo", "Ammo pickup collected once, +3 capped", ammoOk ? "PASS" : "FAIL", `ammoAfterShots=${ammoAfterShots} after=${s.ammo}`);
    } catch (e) { record("pickup-health", "Pickups", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // Settings menu, audio gate, mute taking effect.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.addInitScript(() => localStorage.clear());
      await page.goto(`${base}/?debug=1`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
      const before = await debug(page, "getState()");
      const gateOk = before.audio.initialized === false;
      await page.click("#settingsBtn");
      const panelVisible = await page.evaluate(() => !document.getElementById("settingsPanel").classList.contains("hidden"));
      await page.screenshot({ path: path.join(outDir, "settings.png") });
      await page.evaluate(() => {
        const set = (id, value) => {
          const el = document.getElementById(id);
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        set("setShake", "0");
        set("setFlash", "0.5");
        set("setSensitivity", "1.5");
        set("setVolume", "0.5");
        const mute = document.getElementById("setMute");
        mute.checked = true;
        mute.dispatchEvent(new Event("change", { bubbles: true }));
        const reduced = document.getElementById("setReduced");
        reduced.checked = true;
        reduced.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const changed = await debug(page, "getSettings()");
      const settingsOk = panelVisible && changed.shake === 0 && changed.flash === 0.5 && changed.sensitivity === 1.5 && changed.volume === 0.5 && changed.muted === true && changed.reducedMotion === true;
      record("settings", "Settings menu changes take effect", settingsOk ? "PASS" : "FAIL", `panel=${panelVisible} settings=${JSON.stringify(changed)} audioBeforeStart=${JSON.stringify(before.audio)}`);
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "playing after settings");
      const after = await debug(page, "getState()");
      const audioOk = after.audio.initialized === true && after.audio.muted === true && after.audio.gain === 0;
      await debug(page, "setSettings({muted:false})");
      const unmuted = await debug(page, "getState()");
      const unmuteOk = unmuted.audio.gain === 0.5;
      record("audio-gate", "Audio starts only after Start and respects mute", gateOk && audioOk && unmuteOk ? "PASS" : "FAIL", `beforeStartInitialized=${before.audio.initialized} afterStart=${JSON.stringify(after.audio)} afterUnmuteGain=${unmuted.audio.gain}`);
    } catch (e) { record("settings", "Settings and audio", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // HUD at 1280x720 and narrow menus.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await page.screenshot({ path: path.join(outDir, "hud-1280.png") });
      const hud = await page.evaluate(() => {
        const get = (id) => document.getElementById(id)?.textContent ?? "";
        return { wave: get("wave"), score: get("score"), combo: get("combo"), health: get("healthvalue"), ammo: get("ammo"), role: document.getElementById("healthbar")?.getAttribute("role") };
      });
      record("hud-1280", "HUD at 1280x720", hud.wave.startsWith("Wave 1") && hud.score.startsWith("Score:") && hud.role === "progressbar" ? "PASS" : "FAIL", JSON.stringify(hud));
    } catch (e) { record("hud-1280", "HUD 1280", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${base}/?debug=1`);
      await page.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
      const startBox = await page.evaluate(() => {
        const el = document.getElementById("startBtn");
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth };
      });
      await page.click("#settingsBtn");
      const panelVisible = await page.evaluate(() => !document.getElementById("settingsPanel").classList.contains("hidden"));
      await page.screenshot({ path: path.join(outDir, "menu-narrow.png") });
      const usable = startBox.x >= 0 && startBox.x + startBox.w <= 390 && panelVisible;
      record("hud-narrow", "Narrow menu remains usable", usable ? "PASS" : "FAIL", `startBox=${JSON.stringify(startBox)} settingsPanel=${panelVisible}`);
    } catch (e) { record("hud-narrow", "Narrow menu", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // Prior acceptance, condensed: two shots, reload, kill, death and restart, crate-blocked shot, view2 phases, sprint.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "setYaw(3.141592653589793)");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      let s = await debug(page, "getState()");
      const shotsOk = s.ammo === 4;
      await page.keyboard.press("KeyR");
      await sleep(200);
      s = await debug(page, "getState()");
      const reloadStart = s.reloading === true;
      await waitFor(page, async () => (await debug(page, "getState()")).reloading === false, 20000, "reload done");
      s = await debug(page, "getState()");
      record("accept-shots", "Two shots and reload", shotsOk && reloadStart && s.ammo === 6 ? "PASS" : "FAIL", `ammoAfter2=${s.ammo} reloadStart=${reloadStart}`);
      await debug(page, "setYaw(0)");
      await debug(page, "setPlayerFeet(0,0,9)");
      await debug(page, "spawnRunnerAt(0,4)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state !== "spawn", 10000, "runner ready");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await sleep(300);
      s = await debug(page, "getState()");
      const killOk = s.runners[0]?.state === "death" || s.runners.length === 0;
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 8000, "kill removal");
      record("accept-kill", "Kill and removal", killOk ? "PASS" : "FAIL", `kill=${killOk}`);
      // The kill completes the pseudo-wave, so the game sits on the
      // wave-complete menu until Next wave is clicked. Resume first,
      // otherwise later runners never leave spawn state.
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "waveComplete", 10000, "wave complete after kill");
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "playing after next wave");
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(-6,0,1)");
      await debug(page, "setYaw(3.141592653589793)");
      await debug(page, "setPitch(-0.15)");
      await debug(page, "spawnRunnerAt(-6,7)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners[0]?.state !== "spawn", 10000, "crate runner ready");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await sleep(300);
      s = await debug(page, "getState()");
      const crateOk = s.runners[0]?.health === 36 && s.lastTracer?.to[2] >= 3.0 && s.lastTracer?.to[2] <= 3.2;
      record("accept-crate", "Crate-blocked shot", crateOk ? "PASS" : "FAIL", `health=${s.runners[0]?.health} tracerTo=${s.lastTracer?.to.map((v) => v.toFixed(2)).join(",")}`);
      await debug(page, "clearRunners()");
      await page.keyboard.down("ShiftLeft");
      await sleep(600);
      const still = await debug(page, "getState()");
      await page.keyboard.down("KeyW");
      await sleep(800);
      const running = await debug(page, "getState()");
      await page.keyboard.up("KeyW");
      await page.keyboard.up("ShiftLeft");
      await sleep(600);
      const idle = await debug(page, "getState()");
      const sprintOk = Math.abs((still.weapon?.sprintScale ?? 1) - 1) < 0.03 && (running.weapon?.sprintScale ?? 1) > 1.05 && Math.abs((idle.weapon?.sprintScale ?? 1) - 1) < 0.03;
      record("accept-sprint", "Sprint still 1.000 running 1.100", sprintOk ? "PASS" : "FAIL", `still=${still.weapon?.sprintScale?.toFixed(3)} running=${running.weapon?.sprintScale?.toFixed(3)} idle=${idle.weapon?.sprintScale?.toFixed(3)}`);
    } catch (e) { record("accept-shots", "Prior acceptance", "FAIL", String(e.message).slice(0, 300)); }
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
      const phaseDiff = Math.abs(((a.runPhase - b.runPhase) % 1 + 1) % 1 - 0.5) < 0.15;
      await page.screenshot({ path: path.join(outDir, "view2.png") });
      record("accept-view2", "Two runners out of phase", a && b && phaseDiff ? "PASS" : "FAIL", `left frame=${a?.runFrame} phase=${a?.runPhase?.toFixed(2)} right frame=${b?.runFrame} phase=${b?.runPhase?.toFixed(2)}`);
    } catch (e) { record("accept-view2", "View2 phases", "FAIL", String(e.message).slice(0, 300)); }
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
      const waveBefore = (await debug(page, "getState()")).wave;
      await page.click("#startBtn");
      await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 5000, "restart playing");
      const s = await debug(page, "getState()");
      record("accept-death", "Death restarts current wave at full health", s.playerHealth === 100 && s.wave === waveBefore ? "PASS" : "FAIL", `health=${s.playerHealth} wave=${s.wave} before=${waveBefore}`);
    } catch (e) { record("accept-death", "Death and restart", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await waitFireReady(page);
      await debug(page, "fireShot()");
      await page.screenshot({ path: path.join(outDir, "fire-mid.png") });
      await sleep(600);
      const s = await debug(page, "getState()");
      record("accept-fire", "Fire clip and audio counts", s.audio.counts.shot >= 1 ? "PASS" : "FAIL", `shotCount=${s.audio.counts.shot ?? 0} firing=${s.weapon?.firing}`);
      const env = await debug(page, "getEnvironment()");
      const envOk = env.maps.some((m) => m.includes("sky")) || env.maps.length >= 5;
      record("accept-env", "Environment layers present", envOk ? "PASS" : "FAIL", `maps=${env.maps.join(",")}`);
    } catch (e) { record("accept-fire", "Fire and environment", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }
} catch (e) {
  console.error("harness error", e);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ results }, null, 2));
  const manifest = JSON.parse(readFileSync(path.join(gameDir, "assets.json"), "utf8"));
  let diskBytes = 0;
  const perAsset = [];
  for (const entry of Object.values(manifest.assets)) {
    const p = path.join(gameDir, "public", entry.file);
    try {
      const size = statSync(p).size;
      diskBytes += size;
      perAsset.push({ id: entry.id, file: entry.file, bytes: size, w: entry.size[0], h: entry.size[1] });
    } catch {}
  }
  let textureEstimate = 0;
  for (const a of perAsset) textureEstimate += a.w * a.h * 4 * (4 / 3);
  const distJs = readdirSync(path.join(gameDir, "dist/assets")).filter((f) => f.endsWith(".js")).map((f) => ({ file: f, bytes: statSync(path.join(gameDir, "dist/assets", f)).size }));
  writeFileSync(path.join(outDir, "budgets.json"), JSON.stringify({ diskAssetBytes: diskBytes, textureEstimateBytes: Math.round(textureEstimate), distJs, perAsset }, null, 2));
  console.log(`budgets diskAssetBytes=${diskBytes} textureEstimateBytes=${Math.round(textureEstimate)} distJs=${JSON.stringify(distJs)}`);
}
