import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.resolve(scriptDir, "../../");
const outDir = scriptDir;
const port = Number(process.env.PAPER_PORT ?? 5182);
const base = process.env.PAPER_BASE_URL ?? `http://127.0.0.1:${port}`;
mkdirSync(outDir, { recursive: true });

function discoverBrowser() {
  if (process.env.PAPER_BROWSER) return process.env.PAPER_BROWSER;
  const root = path.join(os.homedir(), ".cache/ms-playwright");
  for (const dir of readdirSync(root).sort().reverse()) {
    const full = path.join(root, dir, "chrome-linux64/chrome");
    if (existsSync(full)) return full;
    const shell = path.join(root, dir, "chrome-linux/chrome");
    if (existsSync(shell)) return shell;
  }
  throw new Error("no Chromium binary found in Playwright cache, set PAPER_BROWSER");
}

const manifest = JSON.parse(readFileSync(path.join(gameDir, "assets.json"), "utf8"));
const directionClips = {
  front: "runner_run_front",
  "front-right": "runner_run_front_right",
  right: "runner_run_right",
  "back-right": "runner_run_back_right",
  back: "runner_run_back",
  "back-left": "runner_run_back_left",
  left: "runner_run_left",
  "front-left": "runner_run_front_left",
};
const familyClips = {
  runner: { run: "runner_run_front", attack: "runner_attack_front", defeat: "runner_defeat_front" },
  insect: { run: "insect_run_front", attack: "insect_attack_front", defeat: "" },
  brute: { run: "brute_run_front", attack: "brute_attack_front", defeat: "" },
};
function frameAsset(runner) {
  if (!runner) return null;
  if (runner.visibleMesh === "attack") {
    const ids = manifest.clips[familyClips[runner.family].attack].assetIds;
    return ids[runner.attackFrame] ?? null;
  }
  if (runner.visibleMesh === "defeat" && familyClips[runner.family].defeat) {
    const ids = manifest.clips[familyClips[runner.family].defeat].assetIds;
    return ids[runner.defeatFrame] ?? null;
  }
  const clip = runner.family === "runner" ? directionClips[runner.direction] : familyClips[runner.family].run;
  const ids = manifest.clips[clip].assetIds;
  return ids[runner.runFrame] ?? null;
}

const require = createRequire(path.join(gameDir, "package.json"));
const { chromium } = require("playwright-core");
const exe = discoverBrowser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
function note(line) { log.push(line); console.log(line); }
async function debug(page, expr) { return page.evaluate(`window.__paperDebug.${expr}`); }
async function waitFor(page, fn, timeoutMs, label) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch (e) { last = String(e.message).slice(0, 200); }
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
async function pollFrames(page, seen, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const s = await debug(page, "getState()");
      for (const r of s.runners) { const a = frameAsset(r); if (a) seen.add(a); }
    } catch {}
    await sleep(250);
  }
}
async function waitFrameSet(page, wanted, timeoutMs, label) {
  const seen = new Set();
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    for (const r of s.runners) { const a = frameAsset(r); if (a && wanted.includes(a)) seen.add(a); }
    return wanted.every((a) => seen.has(a));
  }, timeoutMs, label);
  return seen;
}
async function killAll(page, timeoutMs = 240000) {
  await waitFor(page, async () => {
    const s = await debug(page, "getState()");
    if (s.phase === "waveComplete" || s.phase === "dead") return true;
    await debug(page, "setPlayerFeet(0,10,9)");
    if (s.runners.length > 0) await debug(page, "damageRunner(0,100)");
    return false;
  }, timeoutMs, "wave cleared by damageRunner");
}
function clipAssets(clip) { return manifest.clips[clip].assetIds; }

let server = null;
let browser = null;
const result = { segments: [], waves: [], identity: null };
try {
  execSync("npm run build", { cwd: gameDir, stdio: "pipe", timeout: 180000 });
  note("build PASS");
  server = spawn(path.join(gameDir, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: gameDir, stdio: "ignore" });
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${base}/`); if (r.ok) break; } catch {}
    await sleep(200);
  }
  browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      await debug(page, "clearRunners()");
      await debug(page, "setPlayerFeet(6,10,9)");
      await sleep(500);
      let s = await debug(page, "getState()");
      note(`baseline after clear textures=${s.textures} geometries=${s.geometries}`);
      result.segments.push({ name: "baseline-after-clear", textures: s.textures, geometries: s.geometries });

      await debug(page, "spawnFamilyAt(0,0,\"runner\")");
      await debug(page, "setRunnerDirection(0,\"front\")");
      const frontAssets = clipAssets("runner_run_front");
      await waitFrameSet(page, frontAssets, 120000, "runner front run frames");
      s = await debug(page, "getState()");
      note(`after runner front run textures=${s.textures} geometries=${s.geometries} newFrontFrames=${frontAssets.join(",")}`);
      result.segments.push({ name: "runner-front-run", textures: s.textures, geometries: s.geometries, frames: frontAssets });

      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"runner\")");
      await debug(page, "setRunnerDirection(0,\"left\")");
      await debug(page, "setPlayerFeet(8,10,8)");
      const beforeLeft = (await debug(page, "getState()")).textures;
      const leftAssets = clipAssets("runner_run_left");
      const transitions = [];
      {
        let lastCount = beforeLeft;
        let lastKey = "";
        const seenLeft = new Set();
        await waitFor(page, async () => {
          const st = await debug(page, "getState()");
          const r = st.runners[0];
          if (!r) return false;
          const key = `${r.direction}|${r.runFrame}|${r.state}|${r.visibleMesh}`;
          if (st.textures !== lastCount) {
            transitions.push({ count: st.textures, frame: frameAsset(r), key });
            lastCount = st.textures;
          }
          lastKey = key;
          const a = frameAsset(r);
          if (a && leftAssets.includes(a)) seenLeft.add(a);
          return leftAssets.every((x) => seenLeft.has(x));
        }, 120000, "runner left run frames with transitions");
      }
      const afterLeft = (await debug(page, "getState()")).textures;
      note(`runner left fresh spawn: before=${beforeLeft} after=${afterLeft} delta=${afterLeft - beforeLeft} frames=${leftAssets.join(",")} transitions=${JSON.stringify(transitions)}`);
      result.segments.push({ name: "runner-left-run", textures: afterLeft, beforeLeft, frames: leftAssets, transitions });

      const seenBeforeRepeat = (await debug(page, "getState()")).textures;
      await waitFrameSet(page, leftAssets, 120000, "runner left run repeat");
      const afterRepeat = (await debug(page, "getState()")).textures;
      note(`repeat same frames: before=${seenBeforeRepeat} after=${afterRepeat} delta=${afterRepeat - seenBeforeRepeat}`);
      result.segments.push({ name: "runner-left-repeat", textures: afterRepeat, delta: afterRepeat - seenBeforeRepeat });

      for (const dir of ["front-right", "right", "back-right", "back", "back-left", "front-left"]) {
        const assets = clipAssets(directionClips[dir]);
        await debug(page, "clearRunners()");
        await debug(page, "spawnFamilyAt(0,0,\"runner\")");
        await debug(page, `setRunnerDirection(0,"${dir}")`);
        await debug(page, "setPlayerFeet(8,10,8)");
        const before = (await debug(page, "getState()")).textures;
        await waitFrameSet(page, assets, 120000, `runner ${dir} run frames`);
        const after = (await debug(page, "getState()")).textures;
        note(`runner direction ${dir} fresh spawn: before=${before} after=${after} delta=${after - before} frames=${assets.join(",")}`);
        result.segments.push({ name: `runner-direction-${dir}`, textures: after, delta: after - before, frames: assets });
      }

      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"runner\")");
      await debug(page, "setPlayerFeet(0,0,2)");
      const attackSeen = new Set();
      await waitFor(page, async () => {
        const st = await debug(page, "getState()");
        const r = st.runners[0];
        if (r && r.visibleMesh === "attack") attackSeen.add(frameAsset(r));
        if (r && r.state === "attack") {
          await debug(page, "setPlayerFeet(6,10,9)");
          return attackSeen.size >= 1;
        }
        return false;
      }, 120000, "runner attack start");
      await waitFrameSet(page, clipAssets("runner_attack_front"), 120000, "runner attack frames");
      s = await debug(page, "getState()");
      note(`runner attack frames=${clipAssets("runner_attack_front").join(",")} textures=${s.textures}`);
      result.segments.push({ name: "runner-attack", textures: s.textures, frames: clipAssets("runner_attack_front") });

      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"runner\")");
      await debug(page, "setPlayerFeet(6,10,9)");
      await sleep(1000);
      await debug(page, "damageRunner(0,1)");
      await sleep(1500);
      s = await debug(page, "getState()");
      note(`runner hit: state=${s.runners[0] ? s.runners[0].state : "none"} textures=${s.textures} visible=${s.runners[0] ? s.runners[0].visibleMesh : "none"}`);
      result.segments.push({ name: "runner-hit", textures: s.textures, state: s.runners[0] ? s.runners[0].state : null });
      const defeatSeen = new Set();
      await debug(page, "damageRunner(0,100)");
      await waitFor(page, async () => {
        const st = await debug(page, "getState()");
        for (const r of st.runners) if (r.visibleMesh === "defeat") defeatSeen.add(frameAsset(r));
        return st.runners.length === 0;
      }, 120000, "runner defeat removal");
      s = await debug(page, "getState()");
      note(`runner defeat frames=${[...defeatSeen].join(",")} textures=${s.textures}`);
      result.segments.push({ name: "runner-defeat", textures: s.textures, frames: [...defeatSeen] });

      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"insect\")");
      await debug(page, "setPlayerFeet(6,10,9)");
      await waitFrameSet(page, clipAssets("insect_run_front"), 120000, "insect A run frames");
      const insectABefore = (await debug(page, "getState()")).textures;
      await debug(page, "spawnFamilyAt(2,0,\"insect\")");
      await waitFrameSet(page, clipAssets("insect_run_front"), 120000, "insect B run frames");
      const insectBAfter = (await debug(page, "getState()")).textures;
      note(`identity two insects: afterA=${insectABefore} afterB=${insectBAfter} delta=${insectBAfter - insectABefore} sharedFrames=${clipAssets("insect_run_front").join(",")}`);
      result.identity = { afterFirstInsect: insectABefore, afterSecondInsect: insectBAfter, delta: insectBAfter - insectABefore, frames: clipAssets("insect_run_front") };
      result.segments.push({ name: "insect-run-identity", textures: insectBAfter, frames: clipAssets("insect_run_front") });

      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"insect\")");
      await debug(page, "setPlayerFeet(0,0,2)");
      await waitFor(page, async () => {
        const st = await debug(page, "getState()");
        const r = st.runners[0];
        if (r && r.state === "attack") { await debug(page, "setPlayerFeet(6,10,9)"); return true; }
        return false;
      }, 120000, "insect attack start");
      await waitFrameSet(page, clipAssets("insect_attack_front"), 120000, "insect attack frames");
      s = await debug(page, "getState()");
      note(`insect attack frames=${clipAssets("insect_attack_front").join(",")} textures=${s.textures}`);
      result.segments.push({ name: "insect-attack", textures: s.textures, frames: clipAssets("insect_attack_front") });
      await debug(page, "damageRunner(0,100)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 120000, "insect removal");
      s = await debug(page, "getState()");
      note(`insect defeat fade (run pose, no defeat clip) textures=${s.textures}`);
      result.segments.push({ name: "insect-defeat-fade", textures: s.textures });

      await debug(page, "clearRunners()");
      await debug(page, "spawnFamilyAt(0,0,\"brute\")");
      await debug(page, "setPlayerFeet(6,10,9)");
      await waitFrameSet(page, clipAssets("brute_run_front"), 120000, "brute run frames");
      s = await debug(page, "getState()");
      note(`brute run frames=${clipAssets("brute_run_front").join(",")} textures=${s.textures}`);
      result.segments.push({ name: "brute-run", textures: s.textures, frames: clipAssets("brute_run_front") });
      await debug(page, "setPlayerFeet(0,0,2)");
      await waitFor(page, async () => {
        const st = await debug(page, "getState()");
        const r = st.runners[0];
        if (r && r.state === "attack") { await debug(page, "setPlayerFeet(6,10,9)"); return true; }
        return false;
      }, 120000, "brute attack start");
      await waitFrameSet(page, clipAssets("brute_attack_front"), 120000, "brute attack frames");
      s = await debug(page, "getState()");
      note(`brute attack frames=${clipAssets("brute_attack_front").join(",")} textures=${s.textures}`);
      result.segments.push({ name: "brute-attack", textures: s.textures, frames: clipAssets("brute_attack_front") });
      await debug(page, "damageRunner(0,100)");
      await waitFor(page, async () => (await debug(page, "getState()")).runners.length === 0, 120000, "brute removal");
      s = await debug(page, "getState()");
      const warmupEnd = s.textures;
      note(`warmup complete textures=${warmupEnd} geometries=${s.geometries}`);
      result.segments.push({ name: "warmup-complete", textures: warmupEnd, geometries: s.geometries });

      for (const w of [4, 5, 6]) {
        await debug(page, `startWaveDebug(${w})`);
        await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, `wave ${w} playing`);
        await killAll(page);
        s = await debug(page, "getState()");
        note(`post-warmup wave ${w} clear textures=${s.textures} geometries=${s.geometries} phase=${s.phase}`);
        result.waves.push({ wave: w, textures: s.textures, geometries: s.geometries, phase: s.phase, postWarmup: true });
      }
      await page.screenshot({ path: path.join(outDir, "probe-post-warmup.png") });
    } catch (e) {
      note(`page1 FAILED: ${String(e.message).slice(0, 500)}`);
      result.page1Error = String(e.message).slice(0, 500);
    }
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await startGame(page);
      for (const w of [1, 2, 3]) {
        const seen = new Set();
        const poll = (async () => {
          let playing = false;
          while (true) {
            try {
              const s = await debug(page, "getState()");
              if (s.phase === "playing") playing = true;
              if (playing && s.phase === "waveComplete") break;
              if (playing) for (const r of s.runners) { const a = frameAsset(r); if (a) seen.add(a); }
            } catch { break; }
            await sleep(250);
          }
        })();
        if (w > 1) {
          await page.click("#startBtn");
          await waitFor(page, async () => (await debug(page, "getState()")).phase === "playing", 30000, `wave ${w} playing`);
        }
        await killAll(page);
        await poll;
        const s = await debug(page, "getState()");
        note(`original sequence wave ${w} clear textures=${s.textures} geometries=${s.geometries} framesSeen=${[...seen].join(",")}`);
        result.waves.push({ wave: w, textures: s.textures, geometries: s.geometries, framesSeen: [...seen], postWarmup: false });
      }
      await page.screenshot({ path: path.join(outDir, "probe-original-sequence.png") });
    } catch (e) {
      note(`page2 FAILED: ${String(e.message).slice(0, 500)}`);
      result.page2Error = String(e.message).slice(0, 500);
    }
    await page.close();
  }
} catch (e) {
  note(`probe FAILED: ${String(e.message).slice(0, 500)}`);
  result.fatal = String(e.message).slice(0, 500);
} finally {
  writeFileSync(path.join(outDir, "probe.json"), JSON.stringify(result, null, 2));
  writeFileSync(path.join(outDir, "probe.log"), log.join("\n") + "\n");
  if (browser) await browser.close();
  if (server) server.kill();
}
note("probe done");
