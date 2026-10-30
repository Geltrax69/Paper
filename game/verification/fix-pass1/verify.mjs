import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const outDir = dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(outDir, "../../");
const base = "http://127.0.0.1:5174";
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
    try {
      if (await fn()) return true;
    } catch {}
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
  await page.waitForFunction(
    () => !document.getElementById("startBtn").disabled,
    { timeout: 15000 },
  );
  await page.click("#startBtn");
  await waitFor(
    page,
    async () => (await page.evaluate("!!document.pointerLockElement")) === true,
    5000,
    "pointer lock",
  );
  await waitFor(
    page,
    async () => (await debug(page, "getState()")).phase === "playing",
    5000,
    "playing phase",
  );
}
function segmentHitsRect(ax, az, bx, bz, cx, cz, half) {
  const minX = cx - half, maxX = cx + half, minZ = cz - half, maxZ = cz + half;
  let tMin = 0, tMax = 1;
  for (const [o, d, lo, hi] of [[ax, bx - ax, minX, maxX], [az, bz - az, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1); tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return tMax > 0 && tMin < 1;
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
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`${base}/`);
      if (r.ok) break;
    } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  // A: two shots and reload
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await page.mouse.click(640, 360);
      await waitFor(page, async () => (await page.textContent("#ammo")).trim() === "5 / 6", 10000, "ammo 5");
      const a1 = await page.textContent("#ammo");
      await waitFireReady(page);
      await page.mouse.click(640, 360);
      await waitFor(page, async () => (await page.textContent("#ammo")).trim() === "4 / 6", 10000, "ammo 4");
      const a2 = await page.textContent("#ammo");
      await page.keyboard.press("KeyR");
      await waitFor(page, async () => (await page.textContent("#ammo")).trim() === "Reloading...", 10000, "reloading");
      const rel = await page.textContent("#ammo");
      await waitFor(page, async () => (await page.textContent("#ammo")).trim() === "6 / 6", 10000, "ammo 6 after reload");
      const a3 = await page.textContent("#ammo");
      const ok = a1.trim() === "5 / 6" && a2.trim() === "4 / 6" && rel.trim() === "Reloading..." && a3.trim() === "6 / 6";
      record("accept-shots", "Two shots and reload", ok ? "PASS" : "FAIL", `after1=${a1} after2=${a2} reload=${rel} afterReload=${a3}`);
    } catch (e) { record("accept-shots", "Two shots and reload", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
  }

  // F01 route graph + movement
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      const crates = [[-3, -2, 0.75], [3, 1, 0.75], [0, -6, 0.6], [-6, 4, 0.9], [6, -5, 0.75]];
      let bad = [];
      for (const [cx, cz, half] of crates) {
        for (const [fx, fz, tx, tz] of [[cx, cz - 3, cx, cz + 3], [cx - 3, cz, cx + 3, cz]]) {
          const route = await debug(page2, `findRoutePlain([${fx},${fz}],[${tx},${tz}])`);
          const last = route[route.length - 1];
          if (Math.hypot(last[0] - tx, last[1] - tz) > 0.01) bad.push(`no-goal ${fx},${fz}->${tx},${tz}`);
          for (let i = 0; i + 1 < route.length; i += 1) {
            if (segmentHitsRect(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1], cx, cz, half)) {
              bad.push(`through-crate ${fx},${fz}->${tx},${tz} seg ${i}`);
            }
          }
        }
      }
      record("f01-graph", "F01 route graph for all crates both sides", bad.length === 0 ? "PASS" : "FAIL", bad.length === 0 ? "10/10 routes reach goal without crossing a crate" : bad.join("; "));
      await debug(page2, "setPlayerFeet(-6,0,7)");
      await debug(page2, "spawnRunnerAt(-6,1)");
      let final = null;
      await waitFor(page2, async () => {
        const s = await debug(page2, "getState()");
        final = s;
        if (s.runners.length === 0) return false;
        const r = s.runners[0];
        return Math.hypot(r.x + 6, r.z - 7) <= 2.7 || r.state === "telegraph" || r.state === "attack" || s.playerHealth < 100;
      }, 20000, "reproduced route");
      const r = final.runners[0];
      record("f01-route", "F01 reproduced route (-6,1) to (-6,7)", "PASS", `final runner ${r.x.toFixed(2)},${r.z.toFixed(2)} state=${r.state} distance=${Math.hypot(r.x + 6, r.z - 7).toFixed(2)} health=${final.playerHealth}`);
    } catch (e) { record("f01-route", "F01 reproduced route", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F02 airborne, landing, height collision
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(0,0,9)");
      await debug(page2, "spawnRunnerAt(0,7)");
      await waitFor(page2, async () => (await debug(page2, "getState()")).runners[0]?.state === "telegraph", 10000, "telegraph");
      const before = (await debug(page2, "getState()")).playerHealth;
      await debug(page2, "setPlayerFeet(0,10,9)");
      await sleep(2500);
      const after = (await debug(page2, "getState()")).playerHealth;
      record("f02-airborne", "F02 airborne player takes no ground melee", after === before ? "PASS" : "FAIL", `health before=${before} after=${after}`);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(-6,3,4)");
      await sleep(2000);
      const land = await debug(page2, "getState()");
      const okLand = Math.abs(land.playerFeet[1] - 1.8) < 0.06 && land.grounded === true;
      record("f02-landing", "F02 landing on low crate top", okLand ? "PASS" : "FAIL", `feetY=${land.playerFeet[1].toFixed(2)} grounded=${land.grounded}`);
      await debug(page2, "setPlayerFeet(2,10,1)");
      await page2.keyboard.down("KeyD");
      await sleep(1200);
      await page2.keyboard.up("KeyD");
      await sleep(2000);
      const high = await debug(page2, "getState()");
      record("f02-height", "F02 high movement is not pushed by crates", high.playerFeet[0] > 5 ? "PASS" : "FAIL", `final x=${high.playerFeet[0].toFixed(2)} y=${high.playerFeet[1].toFixed(2)}`);
    } catch (e) { record("f02", "F02 height", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F03 reset and blur
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await page2.keyboard.down("KeyW");
      await page2.keyboard.press("KeyQ");
      await sleep(200);
      await debug(page2, "resetGame()");
      await debug(page2, "clearRunners()");
      await sleep(1000);
      const s = await debug(page2, "getState()");
      const inp = await debug(page2, "getInputState()");
      const ok = inp.keys.length === 0 && inp.dashTimeMs === 0 && inp.dashCooldownMs === 0 && inp.fireCooldownMs === 0 && s.ammo === 6 && s.reloading === false && Math.abs(s.playerFeet[0]) < 0.01 && Math.abs(s.playerFeet[2] - 9) < 0.01;
      record("f03-reset", "F03 fresh run after reset", ok ? "PASS" : "FAIL", `keys=${JSON.stringify(inp.keys)} dash=${inp.dashTimeMs}/${inp.dashCooldownMs} fire=${inp.fireCooldownMs} ammo=${s.ammo} feet=${s.playerFeet.map((v) => v.toFixed(2)).join(",")}`);
      await page2.keyboard.down("KeyW");
      await sleep(200);
      await page2.evaluate("window.dispatchEvent(new Event('blur'))");
      const inp2 = await debug(page2, "getInputState()");
      record("f03-blur", "F03 blur clears held keys", inp2.keys.length === 0 ? "PASS" : "FAIL", `keys=${JSON.stringify(inp2.keys)}`);
    } catch (e) { record("f03", "F03 reset", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F04 missing asset and retry
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page2 = await ctx.newPage();
    try {
      await page2.route("**/assets/scenery/crate_face.png", (route) => route.abort());
      await page2.goto(`${base}/?debug=1`);
      await page2.waitForFunction(() => document.getElementById("menuText").textContent.includes("Failed to load"), { timeout: 15000 });
      const errText = await page2.textContent("#menuText");
      const btnText = await page2.textContent("#startBtn");
      const btnEnabled = await page2.evaluate("!document.getElementById('startBtn').disabled");
      await page2.screenshot({ path: path.join(outDir, "f04-error.png") });
      await page2.unroute("**/assets/scenery/crate_face.png");
      await page2.click("#startBtn");
      await page2.waitForFunction(() => !document.getElementById("startBtn").disabled && document.getElementById("startBtn").textContent === "Start", { timeout: 15000 });
      await page2.screenshot({ path: path.join(outDir, "f04-ready.png") });
      record("f04", "F04 missing asset error and retry", errText.includes("crate_face") && btnText === "Retry" && btnEnabled ? "PASS" : "FAIL", `error=${errText} button=${btnText} enabled=${btnEnabled}`);
    } catch (e) { record("f04", "F04 missing asset", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close(); await ctx.close();
  }

  // F07 muzzle
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      await debug(page2, "fireShot()");
      const check = await debug(page2, "checkMuzzle()");
      await debug(page2, "holdFlash()");
      await sleep(100);
      await page2.screenshot({ path: path.join(outDir, "f07-flash.png") });
      record("f07", "F07 muzzle marker through recoil", check && check.error < 0.001 ? "PASS" : "FAIL", `reported=${check?.reported?.map((v) => v.toFixed(4)).join(",")} expected=${check?.expected?.map((v) => v.toFixed(4)).join(",")} error=${check?.error}`);
    } catch (e) { record("f07", "F07 muzzle", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F08 wall and crate blocked shots
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(0,0,11)");
      await debug(page2, "setYaw(3.141592653589793)");
      await debug(page2, "setPitch(0)");
      await sleep(300);
      await waitFireReady(page2);
      await debug(page2, "fireShot()");
      await sleep(200);
      const wall = await debug(page2, "getState()");
      const lt = wall.lastTracer;
      const wallOk = lt && Math.abs(lt.from[0] + 0.28) < 0.15 && lt.from[2] > 11.3 && lt.to[2] >= 11.9 && lt.to[2] <= 12.6;
      record("f08-wall", "F08 wall-blocked shot from world muzzle", wallOk ? "PASS" : "FAIL", `tracer from=${lt?.from.map((v) => v.toFixed(2)).join(",")} to=${lt?.to.map((v) => v.toFixed(2)).join(",")} (eye would be 0,1.70,11.00)`);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(-6,0,1)");
      await debug(page2, "setYaw(3.141592653589793)");
      await debug(page2, "setPitch(-0.15)");
      await debug(page2, "spawnRunnerAt(-6,7)");
      await waitRunnerReady(page2);
      await waitFireReady(page2);
      await debug(page2, "fireShot()");
      await sleep(300);
      const crate = await debug(page2, "getState()");
      const runnerHealth = crate.runners[0]?.health;
      const ct = crate.lastTracer;
      const crateOk = runnerHealth === 36 && ct && ct.to[2] >= 3.0 && ct.to[2] <= 3.2;
      record("f08-crate", "F08 crate-blocked shot", crateOk ? "PASS" : "FAIL", `runner health=${runnerHealth} tracer to=${ct?.to.map((v) => v.toFixed(2)).join(",")} (crate at (-6,4) height 1.8, front face z=3.10)`);
      await page2.screenshot({ path: path.join(outDir, "f08-crate.png") });
    } catch (e) { record("f08", "F08 shot origin", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F09 spawn policy
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(0,0,9)");
      await debug(page2, "setYaw(0)");
      await debug(page2, "setPitch(-0.1)");
      await debug(page2, "spawnRunnerAt(0,4)");
      await debug(page2, "fireShot()");
      await sleep(200);
      const s1 = await debug(page2, "getState()");
      const hm1 = await page2.evaluate("document.getElementById('hitmarker').style.opacity");
      await waitRunnerReady(page2);
      await waitFireReady(page2);
      await debug(page2, "fireShot()");
      await sleep(300);
      const s2 = await debug(page2, "getState()");
      record("f09", "F09 spawn shot gives no hit feedback, later shot damages", s1.runners[0]?.health === 36 && hm1 === "0" && (s2.runners[0]?.health ?? 36) < 36 ? "PASS" : "FAIL", `spawn health=${s1.runners[0]?.health} hitmarker=${hm1} later health=${s2.runners[0]?.health}`);
    } catch (e) { record("f09", "F09 spawn", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F10 telegraph interrupt and pause freeze
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(0,0,9)");
      await debug(page2, "setYaw(0)");
      await debug(page2, "setPitch(-0.1)");
      await debug(page2, "spawnRunnerAt(0,7)");
      await waitFor(page2, async () => (await debug(page2, "getState()")).runners[0]?.state === "telegraph", 10000, "telegraph");
      const dmg = await debug(page2, "damageRunner(0,12)");
      await waitFor(page2, async () => (await debug(page2, "getState()")).runners[0]?.state === "pursue", 5000, "back to pursue");
      const s = await debug(page2, "getState()");
      const r = s.runners[0];
      const neutral = r && Math.abs(r.scale - 1) < 0.02 && r.color === 16777215;
      record("f10-interrupt", "F10 interrupted telegraph returns to neutral", dmg === "applied" && neutral ? "PASS" : "FAIL", `damage=${dmg} state=${r?.state} scale=${r?.scale} color=${r?.color}`);
      await debug(page2, "clearRunners()");
      await debug(page2, "setHitmarkerMs(1000)");
      await waitFor(page2, async () => (await page2.evaluate("document.getElementById('hitmarker').style.opacity")) === "1", 5000, "hitmarker on");
      const hmBefore = await page2.evaluate("document.getElementById('hitmarker').style.opacity");
      await page2.evaluate(() => document.exitPointerLock());
      try {
        await waitFor(page2, async () => (await debug(page2, "getState()")).phase === "paused", 10000, "paused");
      } catch { throw new Error("pause did not engage after pointer lock loss"); }
      await page2.waitForFunction(() => { const b = document.getElementById("startBtn"); return b && b.offsetParent !== null; }, { timeout: 10000 });
      const hmPaused = await page2.evaluate("document.getElementById('hitmarker').style.opacity");
      await page2.click("#startBtn");
      await waitFor(page2, async () => (await page2.evaluate("document.getElementById('hitmarker').style.opacity")) === "0", 10000, "hitmarker clears after resume");
      const hmAfter = await page2.evaluate("document.getElementById('hitmarker').style.opacity");
      record("f10-pause", "F10 pause freezes feedback, resume clears it", hmBefore === "1" && hmPaused === "1" && hmAfter === "0" ? "PASS" : "FAIL", `before=${hmBefore} paused=${hmPaused} afterResume=${hmAfter}`);
    } catch (e) { record("f10", "F10 state interruption", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F11 held space and menu space
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await page.keyboard.down("Space");
      await page.evaluate(() => {
        for (let i = 0; i < 5; i += 1) window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", repeat: true }));
      });
      await sleep(2000);
      await page.keyboard.up("Space");
      await sleep(500);
      const s = await debug(page, "getState()");
      record("f11-held", "F11 held Space gives no repeat jumps", s.jumpCount <= 1 && Math.abs(s.playerFeet[1]) < 0.05 ? "PASS" : "FAIL", `jumpCount=${s.jumpCount} feetY=${s.playerFeet[1].toFixed(2)}`);
    } catch (e) { record("f11-held", "F11 held Space", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page2.goto(`${base}/?debug=1`);
      await page2.waitForFunction(() => !document.getElementById("startBtn").disabled, { timeout: 15000 });
      await page2.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", repeat: false })));
      await page2.click("#startBtn");
      await sleep(500);
      const s = await debug(page2, "getState()");
      record("f11-menu", "F11 menu Space does not buffer a jump", s.jumpCount === 0 ? "PASS" : "FAIL", `jumpCount=${s.jumpCount}`);
    } catch (e) { record("f11-menu", "F11 menu Space", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F12 review layout
  {
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page2.goto(`${base}/?review=1`);
      await sleep(1000);
      const m = await page2.evaluate(() => {
        const rows = [...document.querySelectorAll(".review-row")].map((row) => ({ scroll: row.scrollWidth, client: row.clientWidth }));
        const cells = [...document.querySelectorAll(".review-cell")].map((c) => { const r = c.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; });
        let overlap = false;
        const byTop = {};
        for (const c of cells) { const k = Math.round(c.top); (byTop[k] = byTop[k] || []).push(c); }
        for (const list of Object.values(byTop)) { list.sort((a, b) => a.left - b.left); for (let i = 1; i < list.length; i += 1) if (list[i].left < list[i - 1].right - 1) overlap = true; }
        return { rows, overlap };
      });
      await page2.screenshot({ path: path.join(outDir, "f12-review-1280.png") });
      const ok = m.rows.every((r) => r.scroll <= r.client + 1) && !m.overlap;
      record("f12-1280", "F12 review rows at 1280 width", ok ? "PASS" : "FAIL", `rows=${JSON.stringify(m.rows)} overlap=${m.overlap}`);
      await page2.setViewportSize({ width: 390, height: 844 });
      await sleep(500);
      const m2 = await page2.evaluate(() => {
        const row = document.querySelector(".review-row");
        return row ? { scroll: row.scrollWidth, client: row.clientWidth } : null;
      });
      await page2.screenshot({ path: path.join(outDir, "f12-review-390.png") });
      record("f12-390", "F12 review columns collapse at 390 width", m2 && m2.scroll <= m2.client + 1 ? "PASS" : "FAIL", `row=${JSON.stringify(m2)}`);
    } catch (e) { record("f12", "F12 review layout", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // Acceptance: kill, death/restart, full wave
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
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 8000, "kill removal");
      record("accept-kill", "Kill and removal", "PASS", "runner removed after death");
    } catch (e) { record("accept-kill", "Kill and removal", "FAIL", String(e.message).slice(0, 300)); }
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page2);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(0,0,9)");
      await debug(page2, "setYaw(0)");
      await debug(page2, "spawnRunnerAt(0,7)");
      await waitFor(page2, async () => (await debug(page2, "getState()")).phase === "dead", 90000, "death");
      await page2.screenshot({ path: path.join(outDir, "accept-dead.png") });
      await page2.click("#startBtn");
      await waitFor(page2, async () => (await debug(page2, "getState()")).phase === "playing", 5000, "restart playing");
      const rh = await debug(page2, "getState()");
      record("accept-death", "Death and restart", rh.playerHealth === 100 ? "PASS" : "FAIL", `health after restart=${rh.playerHealth}`);
      await debug(page2, "clearRunners()");
      await debug(page2, "setPlayerFeet(0,0,9)");
      await debug(page2, "setYaw(0)");
      await debug(page2, "setPitch(-0.1)");
      await debug(page2, "spawnRunnerAt(0,-8)");
      for (let i = 0; i < 6; i += 1) {
        await waitFor(page2, async () => {
          const s = await debug(page2, "getState()");
          return s.runners.length >= 1 && s.runners[0].state !== "spawn" && s.runners[0].state !== "death";
        }, 30000, `wave runner ${i + 1} ready`);
        if (i < 5) await debug(page2, "spawnRunnerAt(0,-8)");
        const targetCount = (await debug(page2, "getState()")).runners.length;
        for (let shot = 0; shot < 8; shot += 1) {
          let s = await debug(page2, "getState()");
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
            await debug(page2, `setPlayerFeet(${nx},0,${nz})`);
            px = nx;
            pz = nz;
            dx = target.x - px;
            dz = target.z - pz;
            dist = Math.hypot(dx, dz);
          }
          await debug(page2, `setYaw(${Math.atan2(-dx, -dz)})`);
          await debug(page2, `setPitch(${-Math.atan2(0.6, Math.max(1, dist))})`);
          await sleep(300);
          await waitFireReady(page2);
          await debug(page2, "fireShot()");
          await sleep(900);
          s = await debug(page2, "getState()");
          if (s.runners.length < targetCount || s.runners[0]?.state === "death") break;
          await sleep(900);
        }
        await waitFor(page2, async () => (await debug(page2, "getState()")).runners.length === targetCount - 1, 30000, `wave runner ${i + 1} removal`);
      }
      await waitFor(page2, async () => (await debug(page2, "getState()")).phase === "waveComplete", 20000, "wave complete");
      await page2.screenshot({ path: path.join(outDir, "accept-wave.png") });
      record("accept-wave", "One full wave clear through browser", "PASS", "6 runners killed sequentially with kiting, waveComplete menu shown");
    } catch (e) { record("accept-wave", "Full wave / death acceptance", "FAIL", String(e.message).slice(0, 300)); }
    await page2.close();
  }

  // F06 resource disposal
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      const c = await debug(page, "cycleRunners(10)");
      record("f06", "F06 resource disposal settles", c.after === c.before ? "PASS" : "FAIL", `geometries before=${c.before} during=${c.mid} after=${c.after}`);
    } catch (e) { record("f06", "F06 disposal", "FAIL", String(e.message).slice(0, 300)); }
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
