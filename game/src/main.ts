import * as THREE from "three";
import {
  ARENA_HALF,
  buildArena,
  decalFitScale,
  groundSupportY,
  rayHitSolid,
  rayHitSurface,
  resolveBody,
  type PlayerBody,
  type RayHit,
} from "./arena";
import { loadTextures, manifest, runnerSpec, weaponSpec } from "./assets";
import { AnimationPlayer, clipFromManifest } from "./animation";
import { RUN_DIRECTION_CLIPS, Runner, type RunDirection } from "./enemy";
import { applySky, buildEnvironment } from "./environment";
import { findRoute } from "./pathing";
import { WeaponView } from "./weapon";
import { GameAudio } from "./audio";
import { PICKUP_RULES, Pickup, type PickupKind } from "./pickups";

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
  const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
  const settingsPanel = document.getElementById("settingsPanel") as HTMLDivElement;
  const healthFill = document.getElementById("healthfill") as HTMLDivElement;
  const healthBar = document.getElementById("healthbar") as HTMLDivElement;
  const healthValue = document.getElementById("healthvalue") as HTMLDivElement;
  const ammoEl = document.getElementById("ammo") as HTMLDivElement;
  const ammoCountEl = document.getElementById("ammoCount") as HTMLDivElement;
  const ammoPipsEl = document.getElementById("ammoPips") as HTMLDivElement;
  const ammoStateEl = document.getElementById("ammoState") as HTMLDivElement;
  const waveEl = document.getElementById("wave") as HTMLDivElement;
  const waveNumEl = document.getElementById("waveNum") as HTMLDivElement;
  const waveBannerEl = document.getElementById("waveBanner") as HTMLDivElement;
  const scoreEl = document.getElementById("score") as HTMLDivElement;
  const comboEl = document.getElementById("combo") as HTMLDivElement;
  const comboCountEl = document.getElementById("comboCount") as HTMLDivElement;
  const comboDecayEl = document.getElementById("comboDecay") as HTMLDivElement;
  const powersEl = document.getElementById("powers") as HTMLDivElement;
  const comicWordsEl = document.getElementById("comicWords") as HTMLDivElement;
  const announceEl = document.getElementById("announce") as HTMLDivElement;
  const hitmarker = document.getElementById("hitmarker") as HTMLDivElement;
  const damageEl = document.getElementById("damage") as HTMLDivElement;
  const damageEdgeEl = document.getElementById("damageEdge") as HTMLDivElement;
  const crosshair = document.getElementById("crosshair") as HTMLDivElement;

  type Settings = {
    comicWords: boolean;
    effectDensity: "full" | "reduced";
    flash: number;
    muted: boolean;
    reducedMotion: boolean;
    sensitivity: number;
    shake: number;
    volume: number;
  };
  const defaultSettings: Settings = {
    comicWords: true,
    effectDensity: "full",
    flash: 1,
    muted: false,
    reducedMotion:
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    sensitivity: 1,
    shake: 1,
    volume: 0.8,
  };
  function loadSettings(): Settings {
    try {
      const raw = window.localStorage.getItem("paper-settings-v1");
      if (!raw) return { ...defaultSettings };
      return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      return { ...defaultSettings };
    }
  }
  const settings = loadSettings();
  const audio = new GameAudio();
  audio.volume = settings.volume;
  audio.muted = settings.muted;

  let startupState: StartupState = "loading";
  let attemptInFlight = false;
  let textures: Map<string, THREE.Texture> | null = null;
  let weaponView: WeaponView | null = null;
  let arenaBuilt = false;

  let phase: GamePhase = "menu";
  let waveActive = true;
  let playerHealth = 100;
  let wave = 1;
  let score = 0;
  let combo = 0;
  let comboTimerMs = 0;
  let pickups: Pickup[] = [];
  let shakeTimeMs = 0;
  let shakeAmp = 0;
  let lastDrawCalls = 0;
  let lastTriangles = 0;
  let frameTimeEmaMs = 0;
  let lastFootstepSoundMs = 0;
  const runnerFootsteps = new Map<Runner, number>();
  const runnerStates = new Map<Runner, string>();
  const lastHud = {
    ammo: "",
    ammoState: "",
    combo: "",
    comboDecay: "",
    crosshair: "",
    damage: "",
    damageEdge: "",
    health: "",
    healthValue: "",
    hitmarker: "",
    powers: "",
    score: "",
    wave: "",
  };
  let hitmarkerKind: "hit" | "kill" = "hit";
  let reticleExpandMs = 0;
  let damageEdgeSide: "left" | "right" | "" = "";
  let lastCombo = 0;
  let comicWordIndex = 0;
  let pendingWaveBanner: number | null = null;
  let waveBannerToken = 0;

  function comboMultiplier(): number {
    return combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
  }

  function announce(text: string): void {
    announceEl.textContent = text;
  }

  const COMIC_WORD_SPOTS: [string, string][] = [
    ["18%", "26%"],
    ["74%", "22%"],
    ["68%", "64%"],
    ["24%", "68%"],
  ];
  function comicWord(word: string): void {
    if (!settings.comicWords || settings.effectDensity === "reduced") return;
    while (comicWordsEl.children.length >= 3) comicWordsEl.firstChild?.remove();
    const stamp = document.createElement("div");
    stamp.className = "comic-word";
    const spot = COMIC_WORD_SPOTS[comicWordIndex % COMIC_WORD_SPOTS.length];
    comicWordIndex += 1;
    stamp.style.left = spot[0];
    stamp.style.top = spot[1];
    stamp.textContent = word;
    comicWordsEl.appendChild(stamp);
    window.setTimeout(() => stamp.remove(), 900);
  }

  function showWaveBanner(next: number): void {
    waveBannerToken += 1;
    const token = waveBannerToken;
    waveBannerEl.textContent = `WAVE ${next}`;
    waveBannerEl.classList.remove("show");
    void waveBannerEl.offsetWidth;
    waveBannerEl.classList.add("show");
    window.setTimeout(() => {
      if (waveBannerToken === token) waveBannerEl.classList.remove("show");
    }, 1600);
  }
  let yaw = 0;
  let pitch = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let coyoteMs = 0;
  let jumpBufferMs = 0;
  let jumpCount = 0;
  let airJumpsUsed = 0;
  let streakTimerMs = 0;
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
    const capped = settings.effectDensity === "reduced" ? Math.ceil(count / 2) : count;
    for (let i = 0; i < capped; i += 1) {
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

  const decalGeometry = new THREE.CircleGeometry(0.35, 20);
  type Decal = {
    hit: RayHit;
    lifeMs: number;
    material: THREE.MeshBasicMaterial;
    mesh: THREE.Mesh;
    scale: number;
  };
  const decals: Decal[] = [];
  function addDecal(hit: RayHit): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0x241d18,
      depthWrite: false,
      opacity: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      transparent: true,
    });
    const mesh = new THREE.Mesh(decalGeometry, material);
    const scale = decalFitScale(hit, 0.35);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal.clone().normalize());
    mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.02);
    mesh.scale.setScalar(scale);
    scene.add(mesh);
    decals.push({ hit, lifeMs: 4000, material, mesh, scale });
    while (decals.length > 12) {
      const old = decals.shift();
      if (old) {
        scene.remove(old.mesh);
        old.material.dispose();
      }
    }
  }
  function updateDecals(dtMs: number): void {
    for (const entry of [...decals]) {
      entry.lifeMs -= dtMs;
      if (entry.lifeMs <= 1000) {
        entry.material.opacity = Math.max(0, entry.lifeMs / 1000) * 0.55;
      }
      if (entry.lifeMs <= 0) {
        scene.remove(entry.mesh);
        entry.material.dispose();
        decals.splice(decals.indexOf(entry), 1);
      }
    }
  }
  function disposeDecals(): void {
    for (const entry of decals) {
      scene.remove(entry.mesh);
      entry.material.dispose();
    }
    decals.length = 0;
  }

  // Powers are one small state shape each, not scattered booleans.
  // Grapple anchors are fixed world points, never invented per frame.
  const GRAPPLE_RANGE = 14;
  const GRAPPLE_ANCHORS: THREE.Vector3[] = [
    new THREE.Vector3(-11, 2.8, -11),
    new THREE.Vector3(11, 2.8, -11),
    new THREE.Vector3(-11, 2.8, 11),
    new THREE.Vector3(11, 2.8, 11),
    new THREE.Vector3(0, 2.8, -11),
    new THREE.Vector3(0, 2.8, 11),
    new THREE.Vector3(-11, 2.8, 0),
    new THREE.Vector3(11, 2.8, 0),
    new THREE.Vector3(-3, 1.5, -2),
    new THREE.Vector3(3, 1.5, 1),
    new THREE.Vector3(0, 1.2, -6),
    new THREE.Vector3(-6, 1.8, 4),
    new THREE.Vector3(6, 1.5, -5),
  ];
  type GrappleState =
    | { kind: "detached" }
    | { kind: "attached"; anchor: THREE.Vector3; ropeLength: number };
  let grapple: GrappleState = { kind: "detached" };
  let grappleMomentum = new THREE.Vector3();
  let grappleMomentumMs = 0;
  let playerVelocity = new THREE.Vector3();
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1, 8),
    new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.95 }),
  );
  rope.visible = false;
  rope.frustumCulled = false;
  scene.add(rope);
  const anchorCue = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18),
    new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.9 }),
  );
  anchorCue.visible = false;
  scene.add(anchorCue);

  type GrappleSelection = {
    anchor: THREE.Vector3;
    angleDeg: number;
    distance: number;
    valid: boolean;
  };
  const GRAPPLE_CONE_COS = Math.cos((35 * Math.PI) / 180);
  let lastGrappleSelection: GrappleSelection | null = null;
  let lastCueAnchor: THREE.Vector3 | null = null;
  function selectGrappleAnchor(
    eye: THREE.Vector3,
    forward: THREE.Vector3,
  ): GrappleSelection | null {
    let bestValid: GrappleSelection | null = null;
    let bestBlocked: GrappleSelection | null = null;
    for (const anchor of GRAPPLE_ANCHORS) {
      const toAnchor = anchor.clone().sub(eye);
      const distance = toAnchor.length();
      if (distance > GRAPPLE_RANGE || distance === 0) continue;
      const dir = toAnchor.clone().normalize();
      const cos = dir.dot(forward);
      if (cos < GRAPPLE_CONE_COS) continue;
      const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      const hit = rayHitSolid(eye, dir, distance);
      const blocked = hit !== null && hit.distance < distance - 0.05;
      const candidate = { anchor: anchor.clone(), angleDeg, distance, valid: !blocked };
      const rank = (entry: GrappleSelection | null) =>
        entry === null || angleDeg < entry.angleDeg - 0.01 ||
        (Math.abs(angleDeg - entry.angleDeg) <= 0.01 && distance < entry.distance);
      if (blocked) {
        if (rank(bestBlocked)) bestBlocked = candidate;
      } else if (rank(bestValid)) {
        bestValid = candidate;
      }
    }
    if (bestValid && lastCueAnchor) {
      const kept = GRAPPLE_ANCHORS.find((anchor) => anchor.equals(lastCueAnchor as THREE.Vector3));
      if (kept) {
        const toKept = kept.clone().sub(eye);
        const keptDistance = toKept.length();
        if (keptDistance <= GRAPPLE_RANGE) {
          const keptDir = toKept.clone().normalize();
          const keptCos = keptDir.dot(forward);
          const keptHit = rayHitSolid(eye, keptDir, keptDistance);
          if (
            keptCos >= GRAPPLE_CONE_COS &&
            !(keptHit !== null && keptHit.distance < keptDistance - 0.05) &&
            Math.acos(Math.max(-1, Math.min(1, keptCos))) * 180 / Math.PI <= bestValid.angleDeg + 5
          ) {
            bestValid = {
              anchor: kept.clone(),
              angleDeg: (Math.acos(Math.max(-1, Math.min(1, keptCos))) * 180) / Math.PI,
              distance: keptDistance,
              valid: true,
            };
          }
        }
      }
    }
    const selected = bestValid ?? bestBlocked;
    if (selected) lastCueAnchor = selected.anchor.clone();
    lastGrappleSelection = selected;
    return selected;
  }

  function tryAttachGrapple(): boolean {
    if (grapple.kind === "attached") return true;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const found = selectGrappleAnchor(camera.position, forward);
    if (!found || !found.valid) return false;
    grapple = {
      kind: "attached",
      anchor: found.anchor.clone(),
      ropeLength: playerFeet.distanceTo(found.anchor),
    };
    rope.visible = true;
    anchorCue.visible = false;
    audio.grapple();
    return true;
  }

  function detachGrapple(withMomentum: boolean): void {
    if (grapple.kind === "detached") return;
    grapple = { kind: "detached" };
    rope.visible = false;
    if (withMomentum) {
      grappleMomentum.set(playerVelocity.x, 0, playerVelocity.z);
      if (grappleMomentum.length() > 12) grappleMomentum.setLength(12);
      verticalVelocity = Math.max(-15, Math.min(12, playerVelocity.y));
      grappleMomentumMs = 1000;
    } else {
      grappleMomentum.set(0, 0, 0);
      grappleMomentumMs = 0;
    }
  }

  const jumpRingGeometry = new THREE.RingGeometry(0.45, 0.62, 32);
  type JumpRing = { lifeMs: number; material: THREE.MeshBasicMaterial; mesh: THREE.Mesh };
  const jumpRings: JumpRing[] = [];
  for (let i = 0; i < 4; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x2b2118,
      depthWrite: false,
      opacity: 0,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const mesh = new THREE.Mesh(jumpRingGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    jumpRings.push({ lifeMs: 0, material, mesh });
  }
  function spawnJumpRing(at: THREE.Vector3): void {
    const ring = jumpRings.find((entry) => entry.lifeMs <= 0);
    if (!ring) return;
    ring.lifeMs = 300;
    ring.mesh.position.set(at.x, at.y + 0.03, at.z);
    ring.mesh.scale.setScalar(0.3);
    ring.mesh.visible = true;
    ring.material.opacity = 0.9;
  }
  function updateJumpRings(dtMs: number): void {
    for (const ring of jumpRings) {
      if (ring.lifeMs <= 0) continue;
      ring.lifeMs -= dtMs;
      const t = 1 - Math.max(0, ring.lifeMs) / 300;
      ring.mesh.scale.setScalar(0.3 + 1.0 * t);
      ring.material.opacity = 0.9 * (1 - t);
      if (ring.lifeMs <= 0) ring.mesh.visible = false;
    }
  }

  const MELEE_RANGE = 2.8;
  const MELEE_DAMAGE = 18;
  const MELEE_SWING_MS = 300;
  const MELEE_EVENT_MS = 120;
  const MELEE_COOLDOWN_MS = 500;
  let meleeTimeMs = 0;
  let meleeCooldownMs = 0;
  let meleeHitDone = false;
  const meleeHitRunners = new Set<Runner>();
  const slashCanvas = document.createElement("canvas");
  slashCanvas.width = 256;
  slashCanvas.height = 256;
  {
    const ctx = slashCanvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "#f5e9c8";
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(128, 150, 78, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(128, 150, 78, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
  }
  const slashMaterial = new THREE.MeshBasicMaterial({
    depthTest: false,
    map: new THREE.CanvasTexture(slashCanvas),
    transparent: true,
  });
  const slashMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), slashMaterial);
  slashMesh.visible = false;
  slashMesh.renderOrder = 10;
  scene.add(slashMesh);
  function startMelee(): boolean {
    if (meleeCooldownMs > 0 || meleeTimeMs > 0) return false;
    meleeTimeMs = MELEE_SWING_MS;
    meleeCooldownMs = MELEE_COOLDOWN_MS;
    meleeHitDone = false;
    meleeHitRunners.clear();
    slashMesh.visible = true;
    audio.melee();
    return true;
  }
  function segmentSegmentDistance(
    a0: THREE.Vector3,
    a1: THREE.Vector3,
    b0: THREE.Vector3,
    b1: THREE.Vector3,
  ): number {
    const d1 = a1.clone().sub(a0);
    const d2 = b1.clone().sub(b0);
    const r = a0.clone().sub(b0);
    const a = d1.dot(d1);
    const e = d2.dot(d2);
    const f = d2.dot(r);
    let s = 0;
    let t = 0;
    if (a > 1e-9 && e > 1e-9) {
      const c = d1.dot(r);
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
    const closestA = a0.clone().addScaledVector(d1, s);
    const closestB = b0.clone().addScaledVector(d2, t);
    return closestA.distanceTo(closestB);
  }
  function meleeEvent(): void {
    if (meleeHitDone) return;
    meleeHitDone = true;
    const eye = camera.position.clone();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const playerTop = playerFeet.clone();
    playerTop.y += PLAYER_HEIGHT;
    let meleeAnyHit = false;
    for (const runner of runners) {
      if (runner.state === "death" || runner.state === "spawn") continue;
      if (meleeHitRunners.has(runner)) continue;
      const runnerTop = runner.position.clone();
      runnerTop.y += 2.0;
      const reach = segmentSegmentDistance(playerFeet, playerTop, runner.position, runnerTop);
      if (reach > MELEE_RANGE) continue;
      const center = runner.position.clone();
      center.y = 1.1;
      const toCenter = center.clone().sub(eye);
      if (toCenter.clone().normalize().dot(forward) <= 0.5) continue;
      const blocked = rayHitSolid(eye, toCenter.clone().normalize(), toCenter.length());
      if (blocked && blocked.distance < toCenter.length() - 0.05) continue;
      meleeHitRunners.add(runner);
      const result = runner.takeDamage(MELEE_DAMAGE, playerFeet);
      if (result === "applied" || result === "killed") {
        hitmarkerMs = 150;
        hitmarkerKind = result === "killed" ? "kill" : "hit";
        meleeAnyHit = true;
        if (result === "killed") comicWord("INKED!");
      }
    }
    if (meleeAnyHit) comicWord("CRACK!");
  }


  let spawnCounter = 0;
  function runnerClipTextures(): {
    attack: THREE.Texture[];
    defeat: THREE.Texture[];
    run: THREE.Texture[];
    runDirections: Partial<Record<RunDirection, THREE.Texture[]>>;
    runStartPhase01: number;
  } {
    const run = manifest.clips[runnerSpec().runClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const attack = manifest.clips[runnerSpec().attackClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const defeat = manifest.clips[runnerSpec().defeatClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const runDirections = Object.fromEntries(
      (Object.keys(RUN_DIRECTION_CLIPS) as RunDirection[]).map((direction) => [
        direction,
        manifest.clips[RUN_DIRECTION_CLIPS[direction]].assetIds.map(
          (id) => textures?.get(id) as THREE.Texture,
        ),
      ]),
    ) as Partial<Record<RunDirection, THREE.Texture[]>>;
    const phase = (spawnCounter % 4) / 4;
    spawnCounter += 1;
    return { attack, defeat, run, runDirections, runStartPhase01: phase };
  }

  function spawnRunner(at: THREE.Vector3, speedScale = 1): Runner {
    const runner = new Runner(
      textures?.get("runner_front") as THREE.Texture,
      at,
      runnerSpec(),
      runnerClipTextures(),
    );
    runner.speedScale = speedScale;
    scene.add(runner.group);
    runners.push(runner);
    waveActive = true;
    return runner;
  }

  function clearPickups(): void {
    for (const pickup of pickups) pickup.dispose();
    pickups = [];
  }

  function spawnPickups(): void {
    for (const kind of Object.keys(PICKUP_RULES) as PickupKind[]) {
      if (pickups.some((pickup) => pickup.kind === kind && !pickup.taken)) continue;
      const rule = PICKUP_RULES[kind];
      const pickup = new Pickup(kind, new THREE.Vector3(...rule.position));
      scene.add(pickup.group);
      pickups.push(pickup);
    }
  }

  function startWave(next: number): void {
    wave = next;
    pendingWaveBanner = next;
    const count = 6 + 2 * (wave - 1);
    const speedScale = Math.min(1.5, 1 + 0.05 * (wave - 1));
    spawnQueue = [];
    for (let i = 0; i < count; i += 1) {
      spawnQueue.push(spawnPoints[i % spawnPoints.length].clone());
    }
    waveActive = true;
    spawnTimerMs = 0;
    spawnPickups();
    announce(`Wave ${wave} started`);
  }

  function clearInputTransient(): void {
    keys.clear();
    mouseDelta.x = 0;
    mouseDelta.y = 0;
    jumpBufferMs = 0;
    coyoteMs = 0;
    detachGrapple(false);
    anchorCue.visible = false;
  }

  function clearActionState(): void {
    dashTimeMs = 0;
    dashCooldownMs = 0;
    dashDirection.set(0, 0, -1);
    fireCooldownMs = 0;
    hitmarkerMs = 0;
    damageFlashMs = 0;
    meleeTimeMs = 0;
    meleeCooldownMs = 0;
    meleeHitDone = false;
    meleeHitRunners.clear();
    slashMesh.visible = false;
    airJumpsUsed = 0;
    streakTimerMs = 0;
    detachGrapple(false);
    anchorCue.visible = false;
    clearParticles();
    disposeTracers();
    disposeDecals();
    weaponView?.reset();
  }

  function resetGame(full = true): void {
    for (const runner of runners) runner.dispose();
    runners = [];
    runnerFootsteps.clear();
    runnerStates.clear();
    clearPickups();
    if (full) {
      wave = 1;
      score = 0;
    }
    combo = 0;
    comboTimerMs = 0;
    playerHealth = 100;
    playerFeet.set(0, 0, 9);
    verticalVelocity = 0;
    grounded = true;
    yaw = 0;
    pitch = 0;
    clearInputTransient();
    clearActionState();
    startWave(wave);
  }

  function applySettings(): void {
    try {
      window.localStorage.setItem("paper-settings-v1", JSON.stringify(settings));
    } catch {
      // Settings still apply for this session when storage is unavailable.
    }
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
    weaponView?.setReducedMotion(settings.reducedMotion);
    weaponView?.setFlashStrength(settings.flash);
    const shake = document.getElementById("setShake") as HTMLInputElement | null;
    const flash = document.getElementById("setFlash") as HTMLInputElement | null;
    const sensitivity = document.getElementById("setSensitivity") as HTMLInputElement | null;
    const volume = document.getElementById("setVolume") as HTMLInputElement | null;
    const mute = document.getElementById("setMute") as HTMLInputElement | null;
    const reduced = document.getElementById("setReduced") as HTMLInputElement | null;
    const comic = document.getElementById("setComic") as HTMLInputElement | null;
    const density = document.getElementById("setDensity") as HTMLSelectElement | null;
    if (shake) shake.value = String(settings.shake);
    if (flash) flash.value = String(settings.flash);
    if (sensitivity) sensitivity.value = String(settings.sensitivity);
    if (volume) volume.value = String(settings.volume);
    if (mute) mute.checked = settings.muted;
    if (reduced) reduced.checked = settings.reducedMotion;
    if (comic) comic.checked = settings.comicWords;
    if (density) density.value = settings.effectDensity;
  }

  function setSettings(partial: Partial<Settings>): void {
    Object.assign(settings, partial);
    applySettings();
  }

  function showMenu(text: string, button: string): void {
    menuText.textContent = text;
    startBtn.textContent = button;
    menu.classList.remove("hidden");
  }

  function hideMenu(): void {
    menu.classList.add("hidden");
  }

  function onPlayerDamage(amount: number, source?: THREE.Vector3): void {
    if (phase !== "playing" || playerHealth <= 0) return;
    playerHealth -= amount;
    damageFlashMs = 400;
    if (source) {
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const toSource = source.clone().sub(playerFeet);
      damageEdgeSide = toSource.dot(right) >= 0 ? "right" : "left";
    }
    if (settings.reducedMotion) {
      shakeTimeMs = 0;
      shakeAmp = 0;
    } else {
      shakeTimeMs = 300;
      shakeAmp = 0.25 * settings.shake;
    }
    audio.playerDamage();
    if (playerHealth <= 0) {
      playerHealth = 0;
      combo = 0;
      comboTimerMs = 0;
      phase = "dead";
      clearInputTransient();
      document.exitPointerLock?.();
      announce("Defeated");
      showMenu("You were defeated. Restart the wave.", "Restart");
    }
  }

  function addScoreForKill(): { combo: number; multiplier: number; points: number } {
    combo += 1;
    comboTimerMs = 4000;
    const multiplier = comboMultiplier();
    const points = 100 * multiplier;
    score += points;
    return { combo, multiplier, points };
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
    if (weaponView.reloading) weaponView.cancelReload();
    if (fireCooldownMs > 0) return;
    if (weaponView.ammo <= 0) {
      if (weaponView.startReload()) audio.reload();
      return;
    }
    weaponView.ammo -= 1;
    fireCooldownMs = spec.fireIntervalMs;
    reticleExpandMs = 120;
    weaponView.triggerFire();
    audio.shot();
    let anyImpact = false;
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
      const blocked = rayHitSurface(muzzle, muzzleDir, aimLen);
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
      if (blocked) {
        addDecal(blocked);
      } else if (aimPoint && !aimRunner) {
        const eyeSurface = rayHitSurface(eye, dir, aimDistance);
        if (eyeSurface) addDecal(eyeSurface);
      }
      if (end.distanceTo(muzzle) > 0.05) burst(end, 6);
      if (blocked || aimPoint) anyImpact = true;
      if (hitRunner) {
        const result = hitRunner.takeDamage(spec.damage, playerFeet);
        if (result === "applied" || result === "killed") {
          hitmarkerMs = 150;
          hitmarkerKind = result === "killed" ? "kill" : "hit";
          if (result === "killed") comicWord("INKED!");
        }
      }
    }
    if (anyImpact) audio.impact();
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
      getEnvironment: () => {
        const maps: string[] = [];
        const collect = (root: THREE.Object3D) => {
          root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            const material = mesh.material as THREE.MeshBasicMaterial | undefined;
            const src = (material?.map?.image as { src?: string } | undefined)?.src;
            if (mesh.isMesh && src) maps.push(src.split("/").pop() ?? src);
          });
        };
        collect(scene);
        if (weaponView) collect(weaponView.scene);
        return { background: scene.background !== null, maps: [...new Set(maps)].sort() };
      },
      getSceneMeshes: () => {
        const out: { position: number[]; quaternion: number[]; scale: number[]; visible: boolean }[] = [];
        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            out.push({
              position: obj.position.toArray(),
              quaternion: obj.quaternion.toArray(),
              scale: obj.scale.toArray(),
              visible: obj.visible,
            });
          }
        });
        return out;
      },
      getPowers: () => ({
        airJumpsUsed,
        anchors: GRAPPLE_ANCHORS.map((anchor) => [anchor.x, anchor.y, anchor.z]),
        anchorCueVisible: anchorCue.visible,
        anchorCue: [anchorCue.position.x, anchorCue.position.y, anchorCue.position.z],
        grappleCue: lastGrappleSelection
          ? {
              anchor: [lastGrappleSelection.anchor.x, lastGrappleSelection.anchor.y, lastGrappleSelection.anchor.z],
              angleDeg: lastGrappleSelection.angleDeg,
              distance: lastGrappleSelection.distance,
              valid: lastGrappleSelection.valid,
            }
          : null,
        grappleMomentumMs,
        playerVelocity: [playerVelocity.x, playerVelocity.y, playerVelocity.z],
        grapple:
          grapple.kind === "attached"
            ? {
                anchor: [grapple.anchor.x, grapple.anchor.y, grapple.anchor.z],
                attached: true,
                ropeLength: grapple.ropeLength,
              }
            : { attached: false },
        grappleRange: GRAPPLE_RANGE,
        meleeCooldownMs,
        meleeDamage: MELEE_DAMAGE,
        meleeHitDone,
        meleeRange: MELEE_RANGE,
        meleeSwinging: meleeTimeMs > 0,
        meleeTimeMs,
        ropeVisible: rope.visible,
        slashVisible: slashMesh.visible,
      }),
      tryGrapple: () => tryAttachGrapple(),
      releaseGrapple: () => detachGrapple(true),
      startMelee: () => startMelee(),
      pressJump: () => {
        jumpBufferMs = 120;
      },
      pressKeyDown: (code: string) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      },
      pressKeyUp: (code: string) => {
        window.dispatchEvent(new KeyboardEvent("keyup", { code }));
      },
      getState: () => ({
        phase,
        startupState,
        jumpCount,
        airJumpsUsed,
        playerFeet: [playerFeet.x, playerFeet.y, playerFeet.z],
        grounded,
        playerHealth,
        wave,
        score,
        combo,
        comboMultiplier: comboMultiplier(),
        comboTimerMs,
        spawnQueueLength: spawnQueue.length,
        runnersLeft: runners.length + spawnQueue.length,
        drawCalls: lastDrawCalls,
        triangles: lastTriangles,
        frameTimeMs: frameTimeEmaMs,
        audio: audio.state(),
        settings: { ...settings },
        pickups: pickups.map((pickup) => ({
          kind: pickup.kind,
          taken: pickup.taken,
          x: pickup.position.x,
          z: pickup.position.z,
        })),
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
            defeatFrame: runner.defeatFrameIndex,
            direction: runner.runDirection,
            footstepCount: runner.footstepCount,
            health: runner.health,
            runClip: runner.runClipId,
            runFrame: runner.runFrameIndex,
            runPhase: runner.runPhase01,
            runScale: runner.runMeshScale,
            scale: anyRunner.mesh.scale.x,
            visibleMesh: runner.visibleMeshKind,
            spawnCue: runner.spawnCueVisible,
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
              recoil: weaponView.recoilValue,
              reloadFrame: weaponView.reloadFrameIndex,
              reloadProgress01: weaponView.reloadProgress01,
              reloadTransferred: weaponView.reloadTransferredFlag,
              reloading: weaponView.reloading,
              sprintScale: weaponView.sprintScale,
            }
          : null,
      }),
      getCamera: () => ({
        position: [camera.position.x, camera.position.y, camera.position.z],
        roll: camera.rotation.z,
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
      setRunnerDirection: (index: number, direction: string) => {
        const runner = runners[index];
        const names = Object.keys(RUN_DIRECTION_CLIPS) as RunDirection[];
        if (!runner || !names.includes(direction as RunDirection)) return null;
        runner.setDirectionOverride(direction as RunDirection);
        return runner.runDirection;
      },
      getDecals: () =>
        decals.map((entry) => ({
          lifeMs: entry.lifeMs,
          normal: [entry.hit.normal.x, entry.hit.normal.y, entry.hit.normal.z],
          owner: entry.hit.owner,
          quaternion: entry.mesh.quaternion.toArray(),
          scale: entry.scale,
          x: entry.mesh.position.x,
          y: entry.mesh.position.y,
          z: entry.mesh.position.z,
        })),
      clearRunners: () => {
        for (const runner of runners) runner.dispose();
        runners = [];
        spawnQueue = [];
        waveActive = false;
      },
      resetGame,
      damagePlayer: (amount: number) => onPlayerDamage(amount),
      setSettings: (partial: Partial<Settings>) => setSettings(partial),
      getSettings: () => ({ ...settings }),
      fireShot,
      setHitmarkerMs: (ms: number) => {
        hitmarkerMs = ms;
      },
      getHud: () => ({
        ammoCount: ammoCountEl.textContent,
        ammoState: ammoStateEl.textContent,
        comboCount: comboCountEl.textContent,
        comicWords: comicWordsEl.children.length,
        hitmarker: hitmarker.textContent,
        powers: powersEl.textContent,
        waveBanner: waveBannerEl.textContent,
        waveBannerVisible: waveBannerEl.classList.contains("show"),
        waveNum: waveNumEl.textContent,
      }),
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
        scene.add(buildArena(textures, manifest.environment));
        scene.add(buildEnvironment(textures, manifest.environment));
        applySky(scene, textures.get(manifest.environment.sky.asset));
        arenaBuilt = true;
      }
      if (!weaponView) {
        const fireClip = manifest.clips[weaponSpec().fireClip];
        const flashClip = manifest.clips[weaponSpec().flashClip];
        const loaded = textures;
        if (!loaded) throw new Error("Textures not loaded");
        const reloadClip = manifest.clips[weaponSpec().reloadClip];
        weaponView = new WeaponView(
          {
            fire: fireClip.assetIds.map((id) => loaded.get(id) as THREE.Texture),
            flash: flashClip.assetIds.map((id) => loaded.get(id) as THREE.Texture),
            idle: loaded.get("punchy_shotgun_idle") as THREE.Texture,
            reload: reloadClip.assetIds.map((id) => loaded.get(id) as THREE.Texture),
          },
          window.innerWidth / window.innerHeight,
        );
        weaponView.setReducedMotion(settings.reducedMotion);
        weaponView.setFlashStrength(settings.flash);
      }
      startupState = "ready";
      showMenu("Paper. One shotgun. One runner type. Waves, score, and pickups.", "Play");
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

  settingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });
  const howBtn = document.getElementById("howBtn") as HTMLButtonElement;
  const howPanel = document.getElementById("howPanel") as HTMLDivElement;
  howBtn.addEventListener("click", () => {
    howPanel.classList.toggle("hidden");
  });
  const bindSetting = (
    id: string,
    apply: (element: HTMLInputElement) => void,
  ): void => {
    const element = document.getElementById(id) as HTMLInputElement | null;
    if (!element) return;
    element.addEventListener("input", () => apply(element));
    element.addEventListener("change", () => apply(element));
  };
  bindSetting("setShake", (el) => setSettings({ shake: Number(el.value) }));
  bindSetting("setFlash", (el) => setSettings({ flash: Number(el.value) }));
  bindSetting("setSensitivity", (el) => setSettings({ sensitivity: Number(el.value) }));
  bindSetting("setVolume", (el) => setSettings({ volume: Number(el.value) }));
  bindSetting("setMute", (el) => setSettings({ muted: el.checked }));
  bindSetting("setReduced", (el) => setSettings({ reducedMotion: el.checked }));
  bindSetting("setComic", (el) => setSettings({ comicWords: el.checked }));
  bindSetting("setDensity", (el) =>
    setSettings({ effectDensity: el.value as "full" | "reduced" }),
  );
  applySettings();

  startBtn.addEventListener("click", () => {
    if (startupState === "loading") return;
    if (startupState === "error") {
      void attemptLoad();
      return;
    }
    if (phase === "menu" || phase === "paused" || phase === "dead" || phase === "waveComplete") {
      audio.init();
      if (phase === "menu") resetGame(true);
      else if (phase === "dead") resetGame(false);
      else if (phase === "waveComplete") {
        weaponView?.reset();
        startWave(wave + 1);
      } else clearInputTransient();
      try {
        const result = renderer.domElement.requestPointerLock() as unknown;
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {
            showMenu("Pointer lock was denied or is unavailable. Click Play to try again.", "Play");
          });
        }
      } catch {
        showMenu("Pointer lock is not supported in this browser. Click Play to try again.", "Play");
      }
    }
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement) {
      phase = "playing";
      hideMenu();
      if (pendingWaveBanner !== null) {
        showWaveBanner(pendingWaveBanner);
        pendingWaveBanner = null;
      }
    } else if (phase === "playing") {
      phase = "paused";
      clearInputTransient();
      showMenu("Paused. Click Resume to keep playing.", "Resume");
    }
  });

  document.addEventListener("pointerlockerror", () => {
    if (phase === "menu" || phase === "paused") {
      showMenu("Pointer lock was denied or is unavailable. Click Play to try again.", "Play");
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
      yaw -= event.movementX * 0.0022 * settings.sensitivity;
      pitch -= event.movementY * 0.0022 * settings.sensitivity;
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
    "KeyE",
    "KeyF",
    "ShiftLeft",
    "ShiftRight",
  ]);
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (phase === "playing" && document.pointerLockElement && gameKeys.has(event.code)) {
      event.preventDefault();
    }
    if (event.code === "Space" && phase === "playing" && !event.repeat) jumpBufferMs = 120;
    if (event.code === "KeyE" && phase === "playing" && !event.repeat) tryAttachGrapple();
    if (event.code === "KeyF" && phase === "playing" && !event.repeat) startMelee();
    if (event.code === "KeyR" && phase === "playing" && weaponView) {
      if (weaponView.startReload()) audio.reload();
    }
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
  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
    if (event.code === "KeyE" && grapple.kind === "attached") detachGrapple(true);
  });

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
      updateDecals(dtMs);
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
      updateDecals(dtMs);
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
      reticleExpandMs = Math.max(0, reticleExpandMs - dtMs);
      damageFlashMs = Math.max(0, damageFlashMs - dtMs);
      dashCooldownMs = Math.max(0, dashCooldownMs - dtMs);
      coyoteMs = Math.max(0, coyoteMs - dtMs);
      jumpBufferMs = Math.max(0, jumpBufferMs - dtMs);
      if (combo > 0) {
        comboTimerMs -= dtMs;
        if (comboTimerMs <= 0) {
          combo = 0;
          comboTimerMs = 0;
        }
      }

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
      if (grapple.kind === "attached") {
        if (jumpBufferMs > 0) {
          detachGrapple(true);
          verticalVelocity = 8;
          jumpBufferMs = 0;
          grounded = false;
          audio.jump();
          spawnJumpRing(playerFeet);
        }
      }
      if (grapple.kind === "attached") {
        const anchor = grapple.anchor;
        const beforeGrapple = playerFeet.clone();
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(4 * dt);
          playerFeet.add(move);
        }
        verticalVelocity -= 22 * dt;
        playerFeet.y += verticalVelocity * dt;
        const toPlayer = playerFeet.clone().sub(anchor);
        const ropeLen = toPlayer.length();
        if (ropeLen > grapple.ropeLength) {
          playerFeet.copy(anchor).addScaledVector(toPlayer, grapple.ropeLength / ropeLen);
        }
        resolveBody(playerFeet, 0.4, PLAYER_HEIGHT);
        if (dt > 0) {
          verticalVelocity = Math.max(-15, Math.min(12, (playerFeet.y - beforeGrapple.y) / dt));
        }
        const eye = new THREE.Vector3(playerFeet.x, playerFeet.y + PLAYER_HEIGHT, playerFeet.z);
        const toAnchor = anchor.clone().sub(eye);
        const anchorDist = toAnchor.length();
        const blocked = rayHitSolid(eye, toAnchor.normalize(), anchorDist);
        if (blocked && blocked.distance < anchorDist - 0.05) {
          detachGrapple(true);
        } else {
          const support = groundSupportY(playerFeet.x, playerFeet.z, 0.4);
          if (playerFeet.y <= support + 0.001) {
            playerFeet.y = support;
            verticalVelocity = 0;
            grounded = true;
          } else {
            grounded = false;
          }
        }
      } else if (dashTimeMs > 0) {
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
      if (grappleMomentumMs > 0 && grapple.kind === "detached") {
        grappleMomentumMs -= dtMs;
        const momentumDistance = grappleMomentum.length() * dt;
        const steps = Math.max(1, Math.min(8, Math.ceil(momentumDistance / 0.25)));
        for (let i = 0; i < steps; i += 1) {
          playerFeet.addScaledVector(grappleMomentum, dt / steps);
          resolveBody(playerFeet, 0.4, PLAYER_HEIGHT);
        }
        grappleMomentum.multiplyScalar(Math.max(0, 1 - 1.0 * dt));
        if (grappleMomentumMs <= 0) grappleMomentum.set(0, 0, 0);
      }
      if (dt > 0) {
        playerVelocity.set(
          (playerFeet.x - prevFeet.x) / dt,
          (playerFeet.y - prevFeet.y) / dt,
          (playerFeet.z - prevFeet.z) / dt,
        );
      }
      const horizontalSpeed =
        dt > 0
          ? Math.hypot(
              playerFeet.x - prevFeet.x,
              playerFeet.z - prevFeet.z,
            ) / dt
          : 0;

      const wasGrounded = grounded;
      if (grapple.kind === "detached") {
        if (jumpBufferMs > 0 && coyoteMs > 0) {
          verticalVelocity = 8;
          playerFeet.y += 0.01;
          jumpBufferMs = 0;
          coyoteMs = 0;
          grounded = false;
          airJumpsUsed = 0;
          jumpCount += 1;
          audio.jump();
          spawnJumpRing(playerFeet);
        } else if (jumpBufferMs > 0 && !grounded && airJumpsUsed === 0) {
          verticalVelocity = 8;
          jumpBufferMs = 0;
          airJumpsUsed += 1;
          jumpCount += 1;
          audio.jump();
          spawnJumpRing(playerFeet);
        }
        verticalVelocity -= 22 * dt;
        playerFeet.y += verticalVelocity * dt;
        const support = groundSupportY(playerFeet.x, playerFeet.z, 0.4);
        if (playerFeet.y <= support + 0.001) {
          const landed = !wasGrounded && verticalVelocity <= 0;
          playerFeet.y = support;
          verticalVelocity = 0;
          grounded = true;
          airJumpsUsed = 0;
          if (landed) {
            audio.land();
            burst(playerFeet.clone(), 10);
          }
        } else {
          grounded = false;
        }
        if (grounded) coyoteMs = 100;
      }

      if (!grounded && !settings.reducedMotion) {
        streakTimerMs -= dtMs;
        if (streakTimerMs <= 0) {
          burst(playerFeet.clone().setY(playerFeet.y + 0.4), 2);
          streakTimerMs = 120;
        }
      }
      updateJumpRings(dtMs);
      if (grapple.kind === "attached") {
        const eye = new THREE.Vector3(playerFeet.x, playerFeet.y + PLAYER_HEIGHT, playerFeet.z);
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        const start = eye.clone().addScaledVector(forward, 0.8).addScaledVector(right, 0.25).addScaledVector(up, -0.3);
        const dir = grapple.anchor.clone().sub(start);
        const len = dir.length();
        rope.position.copy(start).addScaledVector(dir, 0.5);
        rope.scale.set(1, Math.max(0.01, len), 1);
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        anchorCue.position.copy(grapple.anchor);
        anchorCue.visible = true;
      } else if (phase === "playing") {
        const eye = new THREE.Vector3(playerFeet.x, playerFeet.y + PLAYER_HEIGHT, playerFeet.z);
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const found = selectGrappleAnchor(eye, forward);
        if (found) {
          anchorCue.position.copy(found.anchor);
          anchorCue.visible = true;
          (anchorCue.material as THREE.MeshBasicMaterial).color.setHex(
            found.valid ? 0xf5c542 : 0xc0392b,
          );
        } else {
          anchorCue.visible = false;
        }
      }
      if (meleeCooldownMs > 0) meleeCooldownMs -= dtMs;
      if (meleeTimeMs > 0) {
        meleeTimeMs -= dtMs;
        const elapsed = MELEE_SWING_MS - meleeTimeMs;
        if (elapsed >= MELEE_EVENT_MS && !meleeHitDone) meleeEvent();
        const eye = camera.position.clone();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        slashMesh.position
          .copy(eye)
          .addScaledVector(forward, 0.9)
          .addScaledVector(right, 0.15);
        slashMesh.quaternion.copy(camera.quaternion);
        const t = elapsed / MELEE_SWING_MS;
        slashMesh.scale.setScalar(0.8 + 0.4 * t);
        slashMaterial.opacity = 1 - t;
        if (meleeTimeMs <= 0) slashMesh.visible = false;
      }

      camera.position.set(playerFeet.x, playerFeet.y + PLAYER_HEIGHT, playerFeet.z);
      if (shakeTimeMs > 0) {
        shakeTimeMs -= dtMs;
        const amp = shakeAmp * Math.max(0, shakeTimeMs / 300);
        camera.position.x += (Math.random() - 0.5) * amp;
        camera.position.y += (Math.random() - 0.5) * amp;
      }
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
        const prevSteps = runnerFootsteps.get(runner) ?? 0;
        if (runner.footstepCount > prevSteps) {
          const nowMs = performance.now();
          if (nowMs - lastFootstepSoundMs >= 120) {
            audio.footstep();
            lastFootstepSoundMs = nowMs;
          }
          runnerFootsteps.set(runner, runner.footstepCount);
        }
        const prevState = runnerStates.get(runner);
        if (runner.state === "attack" && prevState !== "attack") audio.monsterAttack();
        // Score at the death transition itself, not in the shot path, so
        // every kill scores exactly once no matter which damage source
        // caused it, and a shot that only wounds scores nothing.
        if (runner.state === "death" && prevState !== undefined && prevState !== "death") {
          addScoreForKill();
        }
        runnerStates.set(runner, runner.state);
        if (runner.finished) {
          runner.dispose();
          runnerFootsteps.delete(runner);
          runnerStates.delete(runner);
          runners = runners.filter((entry) => entry !== runner);
        }
      }
      for (const pickup of pickups) {
        if (pickup.taken) continue;
        pickup.update(camera, now);
        const dx = playerFeet.x - pickup.position.x;
        const dz = playerFeet.z - pickup.position.z;
        if (Math.hypot(dx, dz) < 1.0 && playerFeet.y <= 1.2) {
          pickup.taken = true;
          const rule = PICKUP_RULES[pickup.kind];
          if (pickup.kind === "health") {
            playerHealth = Math.min(100, playerHealth + rule.amount);
          } else if (weaponView) {
            weaponView.ammo = Math.min(6, weaponView.ammo + rule.amount);
          }
          scene.remove(pickup.group);
          burst(pickup.position.clone().setY(0.6), 12);
          audio.pickup();
        }
      }
      if (waveActive && spawnQueue.length === 0 && runners.length === 0 && phase === "playing") {
        waveActive = false;
        const bonus = 250 * wave;
        score += bonus;
        phase = "waveComplete";
        clearInputTransient();
        document.exitPointerLock?.();
        audio.waveComplete();
        announce(`Wave ${wave} complete`);
        const nextCount = 6 + 2 * wave;
        const nextSpeed = (3.4 * Math.min(1.5, 1 + 0.05 * wave)).toFixed(1);
        showMenu(
          `Wave ${wave} complete. Bonus ${bonus}. Score ${score}. ` +
            `Next wave has ${nextCount} runners at speed ${nextSpeed}. ` +
            "Health carries over, ammo refills.",
          "Next wave",
        );
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
      updateDecals(dtMs);
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

    frameTimeEmaMs = frameTimeEmaMs === 0 ? dtMs : frameTimeEmaMs * 0.9 + dtMs * 0.1;
    const hudHealth = `${playerHealth}`;
    if (lastHud.health !== hudHealth) {
      lastHud.health = hudHealth;
      healthFill.style.width = `${playerHealth}%`;
      healthBar.setAttribute("aria-valuenow", hudHealth);
    }
    const hudHealthValue = `${playerHealth} / 100`;
    if (lastHud.healthValue !== hudHealthValue) {
      const prevHealth = Number(lastHud.healthValue.split(" ")[0] || 100);
      lastHud.healthValue = hudHealthValue;
      healthValue.textContent = hudHealthValue;
      if (playerHealth < prevHealth && !settings.reducedMotion) {
        healthValue.classList.remove("compressed");
        void healthValue.offsetWidth;
        healthValue.classList.add("compressed");
        window.setTimeout(() => healthValue.classList.remove("compressed"), 180);
      }
    }
    const hudAmmo = weaponView ? `${weaponView.ammo} / 6` : "Loading…";
    if (lastHud.ammo !== hudAmmo) {
      lastHud.ammo = hudAmmo;
      ammoCountEl.textContent = hudAmmo;
    }
    if (weaponView) {
      const wv = weaponView;
      const pips = Array.from(ammoPipsEl.children);
      pips.forEach((pip, index) => {
        const filled = index < wv.ammo;
        pip.classList.toggle("spent", !filled);
      });
    }
    const hudAmmoState = !weaponView
      ? "Loading…"
      : weaponView.reloading
        ? `Reloading ${Math.round(weaponView.reloadProgress01 * 100)}%`
        : weaponView.ammo <= 0
          ? "RELOAD"
          : "";
    if (lastHud.ammoState !== hudAmmoState) {
      lastHud.ammoState = hudAmmoState;
      ammoStateEl.textContent = hudAmmoState;
      ammoStateEl.classList.toggle("empty", hudAmmoState === "RELOAD");
    }
    const hudWave = `Wave ${wave} — Runners left: ${runners.length + spawnQueue.length}`;
    if (lastHud.wave !== hudWave) {
      lastHud.wave = hudWave;
      waveEl.textContent = hudWave;
      waveNumEl.textContent = String(wave);
    }
    const hudScore = `Score: ${score}`;
    if (lastHud.score !== hudScore) {
      lastHud.score = hudScore;
      scoreEl.textContent = hudScore;
    }
    const hudCombo = combo > 0 ? String(combo) : "–";
    if (lastHud.combo !== hudCombo) {
      lastHud.combo = hudCombo;
      comboCountEl.textContent = hudCombo;
      if (combo > lastCombo && !settings.reducedMotion) {
        comboCountEl.classList.remove("bump");
        void comboCountEl.offsetWidth;
        comboCountEl.classList.add("bump");
      }
      lastCombo = combo;
    }
    const hudComboDecay = combo > 0 ? String(Math.round((comboTimerMs / 4000) * 100)) : "0";
    if (lastHud.comboDecay !== hudComboDecay) {
      lastHud.comboDecay = hudComboDecay;
      comboDecayEl.style.width = `${hudComboDecay}%`;
    }
    const grappleState = lastGrappleSelection
      ? lastGrappleSelection.valid
        ? "Grapple: valid"
        : "Grapple: blocked"
      : "Grapple: —";
    const hudPowers =
      `Dash: ${dashCooldownMs > 0 ? `${Math.ceil(dashCooldownMs / 1000)}s` : "ready"} · ` +
      `Air jump: ${airJumpsUsed === 0 ? "ready" : "used"} · ` +
      `${grappleState} · ` +
      `Melee: ${meleeCooldownMs > 0 ? `${Math.ceil(meleeCooldownMs / 1000)}s` : "ready"}`;
    if (lastHud.powers !== hudPowers) {
      lastHud.powers = hudPowers;
      powersEl.textContent = hudPowers;
    }
    const hudHitmarker = hitmarkerMs > 0 ? "1" : "0";
    if (lastHud.hitmarker !== hudHitmarker) {
      lastHud.hitmarker = hudHitmarker;
      hitmarker.style.opacity = hudHitmarker;
      hitmarker.textContent = hitmarkerKind === "kill" ? "✕" : "×";
      hitmarker.classList.toggle("kill", hitmarkerKind === "kill");
    }
    const hudDamage =
      damageFlashMs > 0 ? String((damageFlashMs / 400) * settings.flash) : "0";
    if (lastHud.damage !== hudDamage) {
      lastHud.damage = hudDamage;
      damageEl.style.opacity = hudDamage;
    }
    const hudDamageEdge = damageFlashMs > 0 ? damageEdgeSide : "";
    if (lastHud.damageEdge !== hudDamageEdge) {
      lastHud.damageEdge = hudDamageEdge;
      damageEdgeEl.style.opacity = hudDamageEdge ? String(settings.flash) : "0";
      damageEdgeEl.style.boxShadow =
        hudDamageEdge === "left"
          ? "inset 24px 0 40px rgba(192,57,43,0.8)"
          : hudDamageEdge === "right"
            ? "inset -24px 0 40px rgba(192,57,43,0.8)"
            : "none";
    }
    const hudCrosshair = phase === "playing" ? "block" : "none";
    if (lastHud.crosshair !== hudCrosshair) {
      lastHud.crosshair = hudCrosshair;
      crosshair.style.display = hudCrosshair;
    }
    crosshair.classList.toggle("firing", reticleExpandMs > 0);

    renderer.clear();
    renderer.render(scene, camera);
    const worldCalls = renderer.info.render.calls;
    const worldTriangles = renderer.info.render.triangles;
    if (weaponView) {
      renderer.clearDepth();
      renderer.render(weaponView.scene, weaponView.camera);
      lastDrawCalls = worldCalls + renderer.info.render.calls;
      lastTriangles = worldTriangles + renderer.info.render.triangles;
    } else {
      lastDrawCalls = worldCalls;
      lastTriangles = worldTriangles;
    }
  }
  requestAnimationFrame(loop);
}
