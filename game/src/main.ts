import * as THREE from "three";
import {
  ARENA_HALF,
  buildArena,
  groundSupportY,
  rayHitSolid,
  resolveBody,
  type PlayerBody,
} from "./arena";
import { loadTextures, manifest, runnerSpec, weaponSpec } from "./assets";
import { AnimationPlayer, clipFromManifest } from "./animation";
import { Runner } from "./enemy";
import { findRoute } from "./pathing";
import { WeaponView } from "./weapon";

export type GamePhase = "menu" | "playing" | "paused" | "dead" | "waveComplete";
export type StartupState = "loading" | "ready" | "error";

const params = new URLSearchParams(window.location.search);

function buildReview(): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "review";
  const title = document.createElement("h1");
  title.textContent = "Paper runtime asset review";
  root.appendChild(title);
  const note = document.createElement("p");
  note.textContent =
    "Red marker is the manifest pivot. Gold marker is the shotgun muzzle attachment. " +
    "Each cell keeps the image aspect ratio, so marker percentages match normalized coordinates. " +
    "Crate is opaque, so it has no alpha pivot to check.";
  root.appendChild(note);
  const backgrounds: [string, string][] = [
    ["light", "light"],
    ["dark", "dark"],
    ["checker", "checker"],
  ];
  for (const entry of Object.values(manifest.assets)) {
    const heading = document.createElement("h2");
    heading.textContent = `${entry.id} ${entry.size[0]}x${entry.size[1]} alpha=${entry.alpha} pivot=[${entry.pivot.join(", ")}]`;
    root.appendChild(heading);
    const row = document.createElement("div");
    row.className = "review-row";
    for (const [label, cls] of backgrounds) {
      const cell = document.createElement("div");
      cell.className = `review-cell ${cls}`;
      const wrapper = document.createElement("div");
      wrapper.className = "review-image";
      wrapper.style.aspectRatio = `${entry.size[0]} / ${entry.size[1]}`;
      const caption = document.createElement("div");
      caption.textContent = label;
      caption.style.cssText = "position:absolute;top:4px;left:6px;z-index:2;background:#fff;padding:2px 6px;";
      wrapper.appendChild(caption);
      const img = document.createElement("img");
      img.src = `/${entry.file}`;
      img.alt = entry.id;
      wrapper.appendChild(img);
      const pivot = document.createElement("div");
      pivot.className = "marker pivot";
      pivot.style.left = `${entry.pivot[0] * 100}%`;
      pivot.style.top = `${entry.pivot[1] * 100}%`;
      wrapper.appendChild(pivot);
      const muzzle = entry.attachments?.muzzle;
      if (muzzle) {
        const mark = document.createElement("div");
        mark.className = "marker muzzle";
        mark.style.left = `${muzzle[0] * 100}%`;
        mark.style.top = `${muzzle[1] * 100}%`;
        wrapper.appendChild(mark);
      }
      cell.appendChild(wrapper);
      row.appendChild(cell);
    }
    root.appendChild(row);
  }
  for (const [clipId, clip] of Object.entries(manifest.clips)) {
    if (!clip.frames || clip.frames.length === 0) continue;
    const heading = document.createElement("h2");
    heading.textContent = `Clip ${clipId} ${clip.frames.length} frames loop=${clip.loop} events=${(clip.events ?? []).map((e) => `${e.name}@${e.timeMs}ms`).join(", ") || "none"}`;
    root.appendChild(heading);
    const row = document.createElement("div");
    row.className = "review-row";
    for (const [label, cls] of backgrounds) {
      const cell = document.createElement("div");
      cell.className = `review-cell ${cls}`;
      const wrapper = document.createElement("div");
      wrapper.className = "review-image";
      const first = clip.frames[0];
      const firstAsset = manifest.assets[first.id];
      wrapper.style.aspectRatio = `${firstAsset.size[0]} / ${firstAsset.size[1]}`;
      const img = document.createElement("img");
      img.src = `/${firstAsset.file}`;
      img.alt = `${clipId} frame 0`;
      wrapper.appendChild(img);
      const pivot = document.createElement("div");
      pivot.className = "marker pivot";
      wrapper.appendChild(pivot);
      const muzzle = document.createElement("div");
      muzzle.className = "marker muzzle";
      wrapper.appendChild(muzzle);
      const labelEl = document.createElement("div");
      labelEl.textContent = `${label} frame 0 / ${clip.frames.length}`;
      labelEl.style.cssText = "position:absolute;top:4px;left:6px;z-index:2;background:#fff;padding:2px 6px;";
      wrapper.appendChild(labelEl);
      cell.appendChild(wrapper);
      row.appendChild(cell);
      const player = new AnimationPlayer(clipFromManifest(clip));
      player.play(0);
      const showFrame = () => {
        const frame = player.currentFrame;
        const entry = manifest.assets[frame.id];
        img.src = `/${entry.file}`;
        img.alt = `${clipId} frame ${player.frameIndex}`;
        pivot.style.left = `${entry.pivot[0] * 100}%`;
        pivot.style.top = `${entry.pivot[1] * 100}%`;
        const mz = frame.attachments?.muzzle ?? entry.attachments?.muzzle;
        if (mz) {
          muzzle.style.display = "block";
          muzzle.style.left = `${mz[0] * 100}%`;
          muzzle.style.top = `${mz[1] * 100}%`;
        } else {
          muzzle.style.display = "none";
        }
        labelEl.textContent = `${label} frame ${player.frameIndex} / ${(clip.frames ?? []).length} ${frame.durationMs}ms`;
      };
      showFrame();
      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;gap:6px;margin-top:6px;";
      const playBtn = document.createElement("button");
      playBtn.textContent = "Pause";
      playBtn.addEventListener("click", () => {
        if (player.paused) {
          if (player.finished) player.play(0);
          player.resume();
          playBtn.textContent = "Pause";
        } else {
          player.pause();
          playBtn.textContent = "Play";
        }
      });
      const stepBtn = document.createElement("button");
      stepBtn.textContent = "Step frame";
      stepBtn.addEventListener("click", () => {
        player.pause();
        playBtn.textContent = "Play";
        if (player.finished) {
          player.play(0);
          showFrame();
          return;
        }
        player.stepFrame();
        showFrame();
      });
      const speed = document.createElement("select");
      for (const value of ["1", "0.5", "0.25"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${value}x`;
        speed.appendChild(option);
      }
      controls.append(playBtn, stepBtn, speed);
      cell.appendChild(controls);
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(100, now - last);
        last = now;
        if (!player.paused) {
          player.update(dt * Number(speed.value), 1);
          showFrame();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    root.appendChild(row);
  }
  document.body.appendChild(root);
}

if (params.get("review") === "1") {
  buildReview();
} else {
  void startGame();
}

async function startGame(): Promise<void> {
  const viewOnly = params.get("view") === "1";
  const viewTwo = params.get("view") === "2";
  const debugMode = params.get("debug") === "1";
  const container = document.getElementById("game") as HTMLDivElement;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefe6d0);
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.7, 9);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(5, 10, 3);
  scene.add(sun);

  const menu = document.getElementById("menu") as HTMLDivElement;
  const menuText = document.getElementById("menuText") as HTMLParagraphElement;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const healthFill = document.getElementById("healthfill") as HTMLDivElement;
  const ammoEl = document.getElementById("ammo") as HTMLDivElement;
  const waveEl = document.getElementById("wave") as HTMLDivElement;
  const hitmarker = document.getElementById("hitmarker") as HTMLDivElement;
  const damageEl = document.getElementById("damage") as HTMLDivElement;
  const crosshair = document.getElementById("crosshair") as HTMLDivElement;

  let startupState: StartupState = "loading";
  let attemptInFlight = false;
  let textures: Map<string, THREE.Texture> | null = null;
  let weaponView: WeaponView | null = null;
  let arenaBuilt = false;

  let phase: GamePhase = "menu";
  let waveActive = true;
  let playerHealth = 100;
  let yaw = 0;
  let pitch = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let coyoteMs = 0;
  let jumpBufferMs = 0;
  let jumpCount = 0;
  let dashTimeMs = 0;
  let dashCooldownMs = 0;
  let dashDirection = new THREE.Vector3(0, 0, -1);
  let fireCooldownMs = 0;
  let hitmarkerMs = 0;
  let damageFlashMs = 0;
  let spawnTimerMs = 0;

  const PLAYER_HEIGHT = 1.7;
  const playerFeet = new THREE.Vector3(0, 0, 9);
  const playerBody: PlayerBody = { feet: playerFeet, height: PLAYER_HEIGHT };
  const keys = new Set<string>();
  const mouseDelta = { x: 0, y: 0 };
  let runners: Runner[] = [];
  const spawnPoints = [
    new THREE.Vector3(-9, 0, -9),
    new THREE.Vector3(9, 0, -9),
    new THREE.Vector3(-9, 0, 9),
    new THREE.Vector3(9, 0, 9),
    new THREE.Vector3(0, 0, -10),
    new THREE.Vector3(-10, 0, 0),
  ];
  let spawnQueue: THREE.Vector3[] = [...spawnPoints];

  const particleCount = 300;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleVelocities: THREE.Vector3[] = [];
  const particleLife: number[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    particlePositions[i * 3 + 1] = -999;
    particleVelocities.push(new THREE.Vector3());
    particleLife.push(0);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({ color: 0xd9a441, size: 0.09, transparent: true }),
  );
  particles.frustumCulled = false;
  scene.add(particles);
  let particleCursor = 0;

  function burst(point: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const index = particleCursor;
      particleCursor = (particleCursor + 1) % particleCount;
      particlePositions[index * 3] = point.x;
      particlePositions[index * 3 + 1] = point.y;
      particlePositions[index * 3 + 2] = point.z;
      particleVelocities[index].set(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4,
      );
      particleLife[index] = 500;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  function clearParticles(): void {
    for (let i = 0; i < particleCount; i += 1) {
      particleLife[i] = 0;
      particlePositions[i * 3 + 1] = -999;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  const tracers: { lifeMs: number; line: THREE.Line }[] = [];
  let lastTracer: { from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  function tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.9 }),
    );
    scene.add(line);
    tracers.push({ lifeMs: 60, line });
    lastTracer = { from: from.clone(), to: to.clone() };
  }

  function disposeTracers(): void {
    for (const entry of tracers) {
      scene.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
    }
    tracers.length = 0;
  }

  let spawnCounter = 0;
  function runnerClipTextures(): {
    attack: THREE.Texture[];
    run: THREE.Texture[];
    runStartPhase01: number;
  } {
    const run = manifest.clips[runnerSpec().runClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const attack = manifest.clips[runnerSpec().attackClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const phase = (spawnCounter % 4) / 4;
    spawnCounter += 1;
    return { attack, run, runStartPhase01: phase };
  }

  function spawnRunner(at: THREE.Vector3): Runner {
    const runner = new Runner(
      textures?.get("runner_front") as THREE.Texture,
      at,
      runnerSpec(),
      runnerClipTextures(),
    );
    scene.add(runner.group);
    runners.push(runner);
    waveActive = true;
    return runner;
  }

  function clearInputTransient(): void {
    keys.clear();
    mouseDelta.x = 0;
    mouseDelta.y = 0;
    jumpBufferMs = 0;
    coyoteMs = 0;
  }

  function clearActionState(): void {
    dashTimeMs = 0;
    dashCooldownMs = 0;
    dashDirection.set(0, 0, -1);
    fireCooldownMs = 0;
    hitmarkerMs = 0;
    damageFlashMs = 0;
    clearParticles();
    disposeTracers();
    weaponView?.reset();
  }

  function resetGame(): void {
    for (const runner of runners) runner.dispose();
    runners = [];
    spawnQueue = [...spawnPoints];
    waveActive = true;
    spawnTimerMs = 0;
    playerHealth = 100;
    playerFeet.set(0, 0, 9);
    verticalVelocity = 0;
    grounded = true;
    yaw = 0;
    pitch = 0;
    clearInputTransient();
    clearActionState();
  }

  function showMenu(text: string, button: string): void {
    menuText.textContent = text;
    startBtn.textContent = button;
    menu.classList.remove("hidden");
  }

  function hideMenu(): void {
    menu.classList.add("hidden");
  }

  function onPlayerDamage(amount: number): void {
    if (phase !== "playing" || playerHealth <= 0) return;
    playerHealth -= amount;
    damageFlashMs = 400;
    if (playerHealth <= 0) {
      playerHealth = 0;
      phase = "dead";
      clearInputTransient();
      document.exitPointerLock?.();
      showMenu("You were defeated. Restart the wave.", "Restart");
    }
  }

  // The first-person overlay has no world transform, so the gameplay muzzle
  // is a fixed offset from the eye: 0.55 forward, 0.28 right, 0.22 down.
  // This point, not the eye, validates shots and starts cosmetic tracers.
  function worldMuzzle(
    eye: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
  ): THREE.Vector3 {
    return eye
      .clone()
      .addScaledVector(forward, 0.55)
      .addScaledVector(right, 0.28)
      .addScaledVector(up, -0.22);
  }

  function fireShot(): void {
    if (!weaponView) return;
    const spec = weaponSpec();
    if (fireCooldownMs > 0 || weaponView.reloading) return;
    if (weaponView.ammo <= 0) {
      weaponView.startReload();
      return;
    }
    weaponView.ammo -= 1;
    fireCooldownMs = spec.fireIntervalMs;
    weaponView.triggerFire();
    const eye = camera.position.clone();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const muzzle = worldMuzzle(eye, forward, right, up);
    for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
      const dir = forward
        .clone()
        .addScaledVector(right, (Math.random() - 0.5) * 2 * spec.spread)
        .addScaledVector(up, (Math.random() - 0.5) * 2 * spec.spread)
        .normalize();
      let aimDistance = 30;
      let aimPoint: THREE.Vector3 | null = null;
      let aimRunner: Runner | null = null;
      const solid = rayHitSolid(eye, dir, 30);
      if (solid) {
        aimDistance = solid.distance;
        aimPoint = solid.point;
      }
      for (const runner of runners) {
        if (runner.state === "death" || runner.state === "spawn") continue;
        const center = runner.position.clone();
        center.y = 1.1;
        const toCenter = center.clone().sub(eye);
        const along = toCenter.dot(dir);
        if (along < 0 || along > aimDistance) continue;
        const closest = eye.clone().addScaledVector(dir, along);
        if (closest.distanceTo(center) <= 0.75) {
          aimDistance = along;
          aimPoint = closest;
          aimRunner = runner;
        }
      }
      if (dir.y < 0) {
        const floorT = -eye.y / dir.y;
        if (floorT > 0 && floorT < aimDistance) {
          const point = eye.clone().addScaledVector(dir, floorT);
          if (Math.abs(point.x) <= ARENA_HALF && Math.abs(point.z) <= ARENA_HALF) {
            aimDistance = floorT;
            aimPoint = point;
            aimRunner = null;
          }
        }
      }
      const aim = aimPoint ?? eye.clone().addScaledVector(dir, 30);
      const toAim = aim.clone().sub(muzzle);
      const aimLen = toAim.length();
      const muzzleDir = aimLen > 0 ? toAim.normalize() : dir.clone();
      const blocked = rayHitSolid(muzzle, muzzleDir, aimLen);
      let end: THREE.Vector3;
      let hitRunner: Runner | null = null;
      if (blocked) {
        end = blocked.point;
      } else {
        end = aim;
        if (aimRunner) {
          const center = aimRunner.position.clone();
          center.y = 1.1;
          const toCenter = center.clone().sub(muzzle);
          const along = toCenter.dot(muzzleDir);
          const closest = muzzle.clone().addScaledVector(muzzleDir, along);
          if (along >= 0 && along <= aimLen + 0.1 && closest.distanceTo(center) <= 0.75) {
            hitRunner = aimRunner;
          }
        }
      }
      tracer(muzzle, end);
      if (end.distanceTo(muzzle) > 0.05) burst(end, 6);
      if (hitRunner) {
        const result = hitRunner.takeDamage(spec.damage, playerFeet);
        if (result === "applied" || result === "killed") hitmarkerMs = 150;
      }
    }
  }

  function setupViewOnly(): void {
    menu.classList.add("hidden");
    crosshair.classList.add("hidden");
    const caption = document.createElement("div");
    caption.className = "menu";
    caption.style.cssText =
      "position:fixed;top:12px;left:12px;right:auto;bottom:auto;z-index:20;background:rgba(239,230,208,0.9);padding:8px 12px;display:block;text-align:left;";
    caption.innerHTML =
      "<strong>View mode ?view=1</strong><br/>Fixed camera. No pointer lock. Arena, shotgun overlay, one runner.";
    document.body.appendChild(caption);
    playerFeet.set(0, 0, 7.5);
    camera.position.set(0, 1.8, 7.5);
    camera.lookAt(0, 1.2, -1);
    spawnRunner(new THREE.Vector3(0, 0, -3.5));
    runners[0].state = "pursue";
  }

  function setupViewTwo(): void {
    menu.classList.add("hidden");
    crosshair.classList.add("hidden");
    const caption = document.createElement("div");
    caption.className = "menu";
    caption.style.cssText =
      "position:fixed;top:12px;right:12px;left:auto;bottom:auto;z-index:20;background:rgba(239,230,208,0.9);padding:8px 12px;display:block;text-align:left;";
    caption.innerHTML =
      "<strong>View mode ?view=2</strong><br/>Fixed camera. No pointer lock. Two runners at different run phases, animated in place.";
    document.body.appendChild(caption);
    playerFeet.set(0, 0, 7.5);
    camera.position.set(0, 1.8, 7.5);
    camera.lookAt(0, 1.2, -1);
    const left = spawnRunner(new THREE.Vector3(-1.2, 0, -3.5));
    const right = spawnRunner(new THREE.Vector3(1.2, 0, -3.5));
    left.state = "pursue";
    right.state = "pursue";
    left.setRunPhase01(0);
    right.setRunPhase01(0.5);
  }

  function setupDebug(): void {
    const api = {
      renderer,
      findRoute,
      findRoutePlain: (from: [number, number], to: [number, number]) => {
        const route = findRoute(
          new THREE.Vector3(from[0], 0, from[1]),
          new THREE.Vector3(to[0], 0, to[1]),
          0.55,
        );
        return route.map((point) => [point.x, point.z]);
      },
      checkMuzzle: () => {
        if (!weaponView) return null;
        const anyWeapon = weaponView as unknown as {
          weapon: THREE.Mesh;
          muzzleNode: THREE.Object3D;
        };
        const local = anyWeapon.muzzleNode.position;
        const rotation = anyWeapon.weapon.rotation.z;
        const expected = {
          x:
            anyWeapon.weapon.position.x +
            Math.cos(rotation) * local.x -
            Math.sin(rotation) * local.y,
          y:
            anyWeapon.weapon.position.y +
            Math.sin(rotation) * local.x +
            Math.cos(rotation) * local.y,
        };
        const reported = weaponView.muzzlePosition;
        return {
          reported: [reported.x, reported.y],
          expected: [expected.x, expected.y],
          error: Math.hypot(reported.x - expected.x, reported.y - expected.y),
        };
      },
      holdFlash: () => {
        weaponView?.forceFlashVisible();
      },
      getState: () => ({
        phase,
        startupState,
        jumpCount,
        playerFeet: [playerFeet.x, playerFeet.y, playerFeet.z],
        grounded,
        playerHealth,
        ammo: weaponView?.ammo ?? null,
        reloading: weaponView?.reloading ?? null,
        muzzlePosition: weaponView ? [weaponView.muzzlePosition.x, weaponView.muzzlePosition.y] : null,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        tracerCount: tracers.length,
        lastTracer: lastTracer
          ? { from: lastTracer.from.toArray(), to: lastTracer.to.toArray() }
          : null,
        runners: runners.map((runner) => {
          const anyRunner = runner as unknown as {
            mesh: THREE.Mesh;
            material: THREE.MeshBasicMaterial;
          };
          return {
            attackFrame: runner.attackFrameIndex,
            color: anyRunner.material.color.getHex(),
            footstepCount: runner.footstepCount,
            health: runner.health,
            runFrame: runner.runFrameIndex,
            runPhase: runner.runPhase01,
            scale: anyRunner.mesh.scale.x,
            state: runner.state,
            x: runner.position.x,
            y: runner.position.y,
            z: runner.position.z,
          };
        }),
        weapon: weaponView
          ? {
              fireFrame: weaponView.fireFrameIndex,
              firing: weaponView.firing,
              flashFrame: weaponView.flashFrameIndex,
              flashOn: weaponView.flashOn,
              sprintScale: weaponView.sprintScale,
            }
          : null,
      }),
      getInputState: () => ({
        keys: [...keys],
        dashTimeMs,
        dashCooldownMs,
        fireCooldownMs,
        jumpBufferMs,
        coyoteMs,
        mouseDelta: { ...mouseDelta },
      }),
      setPlayerFeet: (x: number, y: number, z: number) => {
        playerFeet.set(x, y, z);
        verticalVelocity = 0;
      },
      setYaw: (value: number) => {
        yaw = value;
      },
      setPitch: (value: number) => {
        pitch = value;
      },
      spawnRunnerAt: (x: number, z: number) => {
        spawnQueue = [];
        return spawnRunner(new THREE.Vector3(x, 0, z));
      },
      damageRunner: (index: number, amount: number) => {
        const runner = runners[index];
        if (!runner) return null;
        return runner.takeDamage(amount, playerFeet);
      },
      clearRunners: () => {
        for (const runner of runners) runner.dispose();
        runners = [];
        spawnQueue = [];
        waveActive = false;
      },
      resetGame,
      fireShot,
      setHitmarkerMs: (ms: number) => {
        hitmarkerMs = ms;
      },
      getHitmarkerMs: () => hitmarkerMs,
      cycleRunners: (count: number) => {
        const texture = textures?.get("runner_front") as THREE.Texture;
        renderer.render(scene, camera);
        const before = renderer.info.memory.geometries;
        const temp: Runner[] = [];
        for (let i = 0; i < count; i += 1) {
          const runner = new Runner(texture, new THREE.Vector3(0, 0, -5), runnerSpec());
          scene.add(runner.group);
          temp.push(runner);
        }
        renderer.render(scene, camera);
        const mid = renderer.info.memory.geometries;
        for (const runner of temp) runner.dispose();
        renderer.render(scene, camera);
        const after = renderer.info.memory.geometries;
        return { before, mid, after };
      },
    };
    (window as unknown as { __paperDebug: unknown }).__paperDebug = api;
  }

  async function attemptLoad(): Promise<void> {
    if (attemptInFlight) return;
    attemptInFlight = true;
    startupState = "loading";
    startBtn.disabled = true;
    menuText.textContent = "Loading assets…";
    try {
      textures = await loadTextures((done, total, id) => {
        menuText.textContent = `Loading assets ${done}/${total}: ${id}…`;
      });
      if (!arenaBuilt) {
        scene.add(buildArena(textures.get("crate_face") as THREE.Texture));
        arenaBuilt = true;
      }
      if (!weaponView) {
        const fireClip = manifest.clips[weaponSpec().fireClip];
        const flashClip = manifest.clips[weaponSpec().flashClip];
        const loaded = textures;
        if (!loaded) throw new Error("Textures not loaded");
        weaponView = new WeaponView(
          {
            fire: fireClip.assetIds.map((id) => loaded.get(id) as THREE.Texture),
            flash: flashClip.assetIds.map((id) => loaded.get(id) as THREE.Texture),
            idle: loaded.get("shotgun_idle") as THREE.Texture,
          },
          window.innerWidth / window.innerHeight,
        );
      }
      startupState = "ready";
      showMenu("Vertical slice. One shotgun. One runner. One wave.", "Start");
      startBtn.disabled = false;
      if (viewOnly) setupViewOnly();
      if (viewTwo) setupViewTwo();
      if (debugMode) setupDebug();
    } catch (error) {
      startupState = "error";
      const message = error instanceof Error ? error.message : String(error);
      menuText.textContent = `Failed to load: ${message}. Click Retry.`;
      startBtn.textContent = "Retry";
      startBtn.disabled = false;
      menu.classList.remove("hidden");
    } finally {
      attemptInFlight = false;
    }
  }

  startBtn.addEventListener("click", () => {
    if (startupState === "loading") return;
    if (startupState === "error") {
      void attemptLoad();
      return;
    }
    if (phase === "menu" || phase === "paused" || phase === "dead" || phase === "waveComplete") {
      if (phase !== "paused") resetGame();
      else clearInputTransient();
      try {
        const result = renderer.domElement.requestPointerLock() as unknown;
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {
            showMenu("Pointer lock was denied or is unavailable. Click Start to try again.", "Start");
          });
        }
      } catch {
        showMenu("Pointer lock is not supported in this browser. Click Start to try again.", "Start");
      }
    }
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement) {
      phase = "playing";
      hideMenu();
    } else if (phase === "playing") {
      phase = "paused";
      clearInputTransient();
      showMenu("Paused. Click Resume to keep playing.", "Resume");
    }
  });

  document.addEventListener("pointerlockerror", () => {
    if (phase === "menu" || phase === "paused") {
      showMenu("Pointer lock was denied or is unavailable. Click Start to try again.", "Start");
    }
  });

  window.addEventListener("blur", () => clearInputTransient());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInputTransient();
  });

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement && phase === "playing") {
      mouseDelta.x += event.movementX;
      mouseDelta.y += event.movementY;
      yaw -= event.movementX * 0.0022;
      pitch -= event.movementY * 0.0022;
      pitch = Math.max(-1.4, Math.min(1.4, pitch));
    }
  });

  const gameKeys = new Set([
    "Space",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyQ",
    "KeyR",
    "ShiftLeft",
    "ShiftRight",
  ]);
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (phase === "playing" && document.pointerLockElement && gameKeys.has(event.code)) {
      event.preventDefault();
    }
    if (event.code === "Space" && phase === "playing" && !event.repeat) jumpBufferMs = 120;
    if (event.code === "KeyR" && phase === "playing" && weaponView) weaponView.startReload();
    if (event.code === "KeyQ" && phase === "playing" && dashCooldownMs <= 0 && dashTimeMs <= 0) {
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const move = new THREE.Vector3();
      if (keys.has("KeyW")) move.add(forward);
      if (keys.has("KeyS")) move.sub(forward);
      if (keys.has("KeyD")) move.add(right);
      if (keys.has("KeyA")) move.sub(right);
      dashDirection = move.lengthSq() > 0 ? move.normalize() : forward;
      dashTimeMs = 180;
      dashCooldownMs = 1200;
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));

  renderer.domElement.addEventListener("mousedown", (event) => {
    if (phase !== "playing" || event.button !== 0) return;
    fireShot();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    weaponView?.resize(camera.aspect);
  });

  void attemptLoad();

  let lastTime = performance.now();
  function loop(now: number): void {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const dtMs = dt * 1000;

    if (viewOnly && weaponView) {
      runners[0]?.update(0, camera, playerBody, () => undefined, runners);
      weaponView.update(0, {
        grounded: true,
        horizontalSpeed: 0,
        mouseDelta: { x: 0, y: 0 },
        moving: false,
        sprinting: false,
      });
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(weaponView.scene, weaponView.camera);
      return;
    }

    if (viewTwo && weaponView) {
      for (const runner of runners) runner.advanceRunAnimation(dtMs);
      weaponView.update(dt, {
        grounded: true,
        horizontalSpeed: 0,
        mouseDelta: { x: 0, y: 0 },
        moving: false,
        sprinting: false,
      });
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(weaponView.scene, weaponView.camera);
      return;
    }

    if (phase === "playing") {
      fireCooldownMs = Math.max(0, fireCooldownMs - dtMs);
      hitmarkerMs = Math.max(0, hitmarkerMs - dtMs);
      damageFlashMs = Math.max(0, damageFlashMs - dtMs);
      dashCooldownMs = Math.max(0, dashCooldownMs - dtMs);
      coyoteMs = Math.max(0, coyoteMs - dtMs);
      jumpBufferMs = Math.max(0, jumpBufferMs - dtMs);

      if (spawnQueue.length > 0) {
        spawnTimerMs -= dtMs;
        if (spawnTimerMs <= 0) {
          const next = spawnQueue.shift();
          if (next) spawnRunner(next);
          spawnTimerMs = 1200;
        }
      }

      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const move = new THREE.Vector3();
      if (keys.has("KeyW")) move.add(forward);
      if (keys.has("KeyS")) move.sub(forward);
      if (keys.has("KeyD")) move.add(right);
      if (keys.has("KeyA")) move.sub(right);
      const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = sprinting ? 7.5 : 5;
      const prevFeet = playerFeet.clone();
      if (dashTimeMs > 0) {
        dashTimeMs -= dtMs;
        const steps = 6;
        for (let i = 0; i < steps; i += 1) {
          playerFeet.addScaledVector(dashDirection, (18 * dt) / steps);
          resolveBody(playerFeet, 0.4, PLAYER_HEIGHT);
        }
      } else if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        playerFeet.add(move);
        resolveBody(playerFeet, 0.4, PLAYER_HEIGHT);
      }
      const horizontalSpeed =
        dt > 0
          ? Math.hypot(
              playerFeet.x - prevFeet.x,
              playerFeet.z - prevFeet.z,
            ) / dt
          : 0;

      const support = groundSupportY(playerFeet.x, playerFeet.z, 0.4);
      if (playerFeet.y <= support + 0.001) grounded = true;
      if (grounded) coyoteMs = 100;
      if (jumpBufferMs > 0 && coyoteMs > 0) {
        verticalVelocity = 8;
        playerFeet.y += 0.01;
        jumpBufferMs = 0;
        coyoteMs = 0;
        grounded = false;
        jumpCount += 1;
      }
      verticalVelocity -= 22 * dt;
      const prevY = playerFeet.y;
      playerFeet.y += verticalVelocity * dt;
      if (verticalVelocity <= 0) {
        const landingSupport = groundSupportY(playerFeet.x, playerFeet.z, 0.4);
        if (prevY >= landingSupport && playerFeet.y <= landingSupport) {
          playerFeet.y = landingSupport;
          verticalVelocity = 0;
          grounded = true;
        } else if (playerFeet.y < 0) {
          playerFeet.y = 0;
          verticalVelocity = 0;
          grounded = true;
        }
      }

      camera.position.set(playerFeet.x, playerFeet.y + PLAYER_HEIGHT, playerFeet.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.rotation.z = 0;

      const moving = move.lengthSq() > 0;
      weaponView?.update(dt, {
        grounded,
        horizontalSpeed,
        mouseDelta,
        moving,
        sprinting,
      });
      mouseDelta.x = 0;
      mouseDelta.y = 0;

      for (const runner of [...runners]) {
        runner.update(dt, camera, playerBody, onPlayerDamage, runners);
        if (runner.finished) {
          runner.dispose();
          runners = runners.filter((entry) => entry !== runner);
        }
      }
      if (waveActive && spawnQueue.length === 0 && runners.length === 0 && phase === "playing") {
        waveActive = false;
        phase = "waveComplete";
        clearInputTransient();
        document.exitPointerLock?.();
        showMenu("Wave complete. One shotgun, one runner type, one wave cleared.", "Play again");
      }

      for (let i = 0; i < particleCount; i += 1) {
        if (particleLife[i] <= 0) continue;
        particleLife[i] -= dtMs;
        particleVelocities[i].y -= 9 * dt;
        particlePositions[i * 3] += particleVelocities[i].x * dt;
        particlePositions[i * 3 + 1] += particleVelocities[i].y * dt;
        particlePositions[i * 3 + 2] += particleVelocities[i].z * dt;
        if (particleLife[i] <= 0) particlePositions[i * 3 + 1] = -999;
      }
      particleGeo.attributes.position.needsUpdate = true;
      for (const entry of [...tracers]) {
        entry.lifeMs -= dtMs;
        const material = entry.line.material as THREE.LineBasicMaterial;
        material.opacity = Math.max(0, entry.lifeMs / 60) * 0.9;
        if (entry.lifeMs <= 0) {
          scene.remove(entry.line);
          entry.line.geometry.dispose();
          (entry.line.material as THREE.Material).dispose();
          tracers.splice(tracers.indexOf(entry), 1);
        }
      }
    }

    healthFill.style.width = `${playerHealth}%`;
    ammoEl.textContent = weaponView
      ? weaponView.reloading
        ? "Reloading..."
        : `${weaponView.ammo} / 6`
      : "Loading…";
    waveEl.textContent = `Wave 1 — Runners left: ${runners.length + spawnQueue.length}`;
    hitmarker.style.opacity = hitmarkerMs > 0 ? "1" : "0";
    damageEl.style.opacity = damageFlashMs > 0 ? String(damageFlashMs / 400) : "0";
    crosshair.style.display = phase === "playing" ? "block" : "none";

    renderer.clear();
    renderer.render(scene, camera);
    if (weaponView) {
      renderer.clearDepth();
      renderer.render(weaponView.scene, weaponView.camera);
    }
  }
  requestAnimationFrame(loop);
}
