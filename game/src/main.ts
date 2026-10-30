import * as THREE from "three";
import {
  ARENA_HALF,
  buildArena,
  rayHitSolid,
  resolveCircle,
} from "./arena";
import { asset, loadTextures, manifest, runnerSpec, weaponSpec } from "./assets";
import { Runner } from "./enemy";
import { WeaponView } from "./weapon";

export type GamePhase = "menu" | "playing" | "paused" | "dead" | "waveComplete";

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
      cell.style.aspectRatio = `${entry.size[0]} / ${entry.size[1]}`;
      const caption = document.createElement("div");
      caption.textContent = label;
      caption.style.cssText = "position:absolute;top:4px;left:6px;z-index:2;background:#fff;padding:2px 6px;";
      cell.appendChild(caption);
      const img = document.createElement("img");
      img.src = `/${entry.file}`;
      img.alt = entry.id;
      cell.appendChild(img);
      const pivot = document.createElement("div");
      pivot.className = "marker pivot";
      pivot.style.left = `${entry.pivot[0] * 100}%`;
      pivot.style.top = `${entry.pivot[1] * 100}%`;
      cell.appendChild(pivot);
      const muzzle = entry.attachments?.muzzle;
      if (muzzle) {
        const mark = document.createElement("div");
        mark.className = "marker muzzle";
        mark.style.left = `${muzzle[0] * 100}%`;
        mark.style.top = `${muzzle[1] * 100}%`;
        cell.appendChild(mark);
      }
      row.appendChild(cell);
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

  const textures = await loadTextures();
  scene.add(buildArena(textures.get("crate_face") as THREE.Texture));
  const weaponView = new WeaponView(
    textures.get("shotgun_idle") as THREE.Texture,
    textures.get("muzzle_flash_shotgun") as THREE.Texture,
    window.innerWidth / window.innerHeight,
  );

  const menu = document.getElementById("menu") as HTMLDivElement;
  const menuText = document.getElementById("menuText") as HTMLParagraphElement;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const healthFill = document.getElementById("healthfill") as HTMLDivElement;
  const ammoEl = document.getElementById("ammo") as HTMLDivElement;
  const waveEl = document.getElementById("wave") as HTMLDivElement;
  const hitmarker = document.getElementById("hitmarker") as HTMLDivElement;
  const damageEl = document.getElementById("damage") as HTMLDivElement;
  const crosshair = document.getElementById("crosshair") as HTMLDivElement;

  let phase: GamePhase = "menu";
  let playerHealth = 100;
  let yaw = 0;
  let pitch = 0;
  let verticalVelocity = 0;
  let coyoteMs = 0;
  let jumpBufferMs = 0;
  let dashTimeMs = 0;
  let dashCooldownMs = 0;
  let dashDirection = new THREE.Vector3(0, 0, -1);
  let fireCooldownMs = 0;
  let hitmarkerMs = 0;
  let damageFlashMs = 0;
  let spawnTimerMs = 0;
  let playerY = 0;

  const playerPos = new THREE.Vector3(0, 0, 9);
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

  const tracers: { lifeMs: number; line: THREE.Line }[] = [];
  function tracer(to: THREE.Vector3): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([camera.position.clone(), to]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.9 }),
    );
    scene.add(line);
    tracers.push({ lifeMs: 60, line });
  }

  function spawnRunner(at: THREE.Vector3): void {
    const runner = new Runner(
      textures.get("runner_front") as THREE.Texture,
      at,
      runnerSpec(),
    );
    scene.add(runner.group);
    runners.push(runner);
  }

  function resetGame(): void {
    for (const runner of runners) runner.dispose();
    runners = [];
    spawnQueue = [...spawnPoints];
    spawnTimerMs = 0;
    playerHealth = 100;
    playerPos.set(0, 0, 9);
    playerY = 0;
    verticalVelocity = 0;
    yaw = 0;
    pitch = 0;
    weaponView.ammo = weaponSpec().ammo;
    weaponView.reloadTimeMs = 0;
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
    playerHealth -= amount;
    damageFlashMs = 400;
    if (playerHealth <= 0) {
      playerHealth = 0;
      phase = "dead";
      document.exitPointerLock?.();
      showMenu("You were defeated. Restart the wave.", "Restart");
    }
  }

  startBtn.addEventListener("click", () => {
    if (phase === "menu" || phase === "paused" || phase === "dead" || phase === "waveComplete") {
      if (phase !== "paused") resetGame();
      renderer.domElement.requestPointerLock();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement) {
      phase = "playing";
      hideMenu();
    } else if (phase === "playing") {
      phase = "paused";
      showMenu("Paused. Click Resume to keep playing.", "Resume");
    }
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

  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space") jumpBufferMs = 120;
    if (event.code === "KeyR" && phase === "playing") weaponView.startReload();
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
    const spec = weaponSpec();
    if (fireCooldownMs > 0 || weaponView.reloading) return;
    if (weaponView.ammo <= 0) {
      weaponView.startReload();
      return;
    }
    weaponView.ammo -= 1;
    fireCooldownMs = spec.fireIntervalMs;
    weaponView.triggerFlash();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
      const dir = forward
        .clone()
        .addScaledVector(right, (Math.random() - 0.5) * 2 * spec.spread)
        .addScaledVector(up, (Math.random() - 0.5) * 2 * spec.spread)
        .normalize();
      const origin = camera.position.clone();
      let bestDistance = 30;
      let bestPoint: THREE.Vector3 | null = null;
      let bestRunner: Runner | null = null;
      const solid = rayHitSolid(origin, dir, 30);
      if (solid) {
        bestDistance = solid.distance;
        bestPoint = solid.point;
      }
      for (const runner of runners) {
        if (runner.state === "death") continue;
        const center = runner.position.clone();
        center.y = 1.1;
        const toCenter = center.clone().sub(origin);
        const along = toCenter.dot(dir);
        if (along < 0 || along > bestDistance) continue;
        const closest = origin.clone().addScaledVector(dir, along);
        if (closest.distanceTo(center) <= 0.75) {
          bestDistance = along;
          bestPoint = closest;
          bestRunner = runner;
        }
      }
      if (dir.y < 0) {
        const floorT = -origin.y / dir.y;
        if (floorT > 0 && floorT < bestDistance) {
          const point = origin.clone().addScaledVector(dir, floorT);
          if (Math.abs(point.x) <= ARENA_HALF && Math.abs(point.z) <= ARENA_HALF) {
            bestDistance = floorT;
            bestPoint = point;
            bestRunner = null;
          }
        }
      }
      const end = bestPoint ?? origin.clone().addScaledVector(dir, 30);
      tracer(end);
      if (bestPoint) burst(bestPoint, 6);
      if (bestRunner) {
        bestRunner.takeDamage(spec.damage, playerPos);
        hitmarkerMs = 150;
      }
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    weaponView.resize(camera.aspect);
  });

  if (viewOnly) {
    menu.classList.add("hidden");
    crosshair.classList.add("hidden");
    const caption = document.createElement("div");
    caption.className = "menu";
    caption.style.cssText =
      "position:fixed;top:12px;left:12px;right:auto;bottom:auto;z-index:20;background:rgba(239,230,208,0.9);padding:8px 12px;display:block;text-align:left;";
    caption.innerHTML =
      "<strong>View mode ?view=1</strong><br/>Fixed camera. No pointer lock. Arena, shotgun overlay, one runner.";
    document.body.appendChild(caption);
    camera.position.set(0, 1.8, 7.5);
    camera.lookAt(0, 1.2, -1);
    spawnRunner(new THREE.Vector3(0, 0, -3.5));
    runners[0].state = "pursue";
  }

  let lastTime = performance.now();
  function loop(now: number): void {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const dtMs = dt * 1000;

    if (viewOnly) {
      runners[0]?.update(0, camera, camera.position, () => undefined);
      weaponView.update(0, false, { x: 0, y: 0 });
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
      if (dashTimeMs > 0) {
        dashTimeMs -= dtMs;
        const steps = 6;
        for (let i = 0; i < steps; i += 1) {
          playerPos.addScaledVector(dashDirection, (18 * dt) / steps);
          resolveCircle(playerPos, 0.4);
        }
      } else if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        playerPos.add(move);
        resolveCircle(playerPos, 0.4);
      }

      if (playerY <= 0) coyoteMs = 100;
      if (jumpBufferMs > 0 && coyoteMs > 0) {
        verticalVelocity = 8;
        playerY = 0.01;
        jumpBufferMs = 0;
        coyoteMs = 0;
      }
      verticalVelocity -= 22 * dt;
      playerY += verticalVelocity * dt;
      if (playerY <= 0) {
        playerY = 0;
        verticalVelocity = 0;
      }

      camera.position.set(playerPos.x, 1.7 + playerY, playerPos.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.rotation.z = 0;

      const moving = move.lengthSq() > 0;
      weaponView.update(dt, moving, mouseDelta);
      mouseDelta.x = 0;
      mouseDelta.y = 0;

      for (const runner of [...runners]) {
        runner.update(dt, camera, playerPos, onPlayerDamage);
        if (runner.finished) {
          runner.dispose();
          runners = runners.filter((entry) => entry !== runner);
        }
      }
      if (spawnQueue.length === 0 && runners.length === 0 && phase === "playing") {
        phase = "waveComplete";
        document.exitPointerLock?.();
        showMenu("Wave complete. One shotgun, one runner type, one wave cleared.", "Play again");
      }
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
        tracers.splice(tracers.indexOf(entry), 1);
      }
    }

    healthFill.style.width = `${playerHealth}%`;
    ammoEl.textContent = weaponView.reloading ? "Reloading..." : `${weaponView.ammo} / 6`;
    waveEl.textContent = `Wave 1 — Runners left: ${runners.length + spawnQueue.length}`;
    hitmarker.style.opacity = hitmarkerMs > 0 ? "1" : "0";
    damageEl.style.opacity = damageFlashMs > 0 ? String(damageFlashMs / 400) : "0";
    crosshair.style.display = phase === "playing" ? "block" : "none";

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(weaponView.scene, weaponView.camera);
  }
  requestAnimationFrame(loop);
}
