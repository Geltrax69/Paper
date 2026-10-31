import * as THREE from "three";
import {
  ARENA_HALF,
  BARREL_DEFS,
  BARRELS,
  buildArena,
  decalFitScale,
  groundSupportY,
  rayHitSolid,
  rayHitSurface,
  resolveBody,
  type Box,
  type PlayerBody,
  type RayHit,
} from "./arena";
import { alphaReport, enemySpec, loadTextures, manifest, runnerSpec, weaponOrder, weaponSpec } from "./assets";
import { SpatialGrid } from "./spatial";
import { AnimationPlayer, clipFromManifest } from "./animation";
import { RUN_DIRECTION_CLIPS, Runner, type RunDirection } from "./enemy";
import { applySky, buildEnvironment } from "./environment";
import { findRoute } from "./pathing";
import { WeaponView, proceduralWeaponTexture } from "./weapon";
import { GameAudio } from "./audio";
import { PICKUP_RULES, Pickup, type PickupKind } from "./pickups";
import { FxEmitter, type FxSettings } from "./fx";

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
      img.addEventListener("load", () => alphaReport(img, entry));
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
  const inkEl = document.getElementById("ink") as HTMLDivElement;
  const inkTextEl = document.getElementById("inkText") as HTMLDivElement;
  const inkFillEl = document.getElementById("inkFill") as HTMLDivElement;
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
  const fx = new FxEmitter(scene);
  function fxSettings(): FxSettings {
    return {
      effectDensity: settings.effectDensity,
      flash: settings.flash,
      reducedMotion: settings.reducedMotion,
    };
  }
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
    ink: "",
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
  let currentWeaponId = "shotgun";
  const weaponAmmo: Record<string, number> = {};
  for (const entry of weaponOrder()) weaponAmmo[entry.id] = entry.ammo;
  let autoHeld = false;
  let autoShotCount = 0;
  let knifeWindupActive = false;
  let knifeWindupMs = 0;
  let inkPressure = 0;
  let inkCooldownMs = 0;
  const INK_MAX = 100;
  const INK_PER_KILL = 20;
  const INK_COST = 50;
  const INK_RADIUS = 6;
  const INK_MAX_DAMAGE = 80;
  const INK_COOLDOWN_MS = 3000;
  const BOLT_SPEED = 40;
  const KNIFE_SPEED = 18;
  const GRENADE_FUSE_MS = 1600;
  type BoltState = { dir: THREE.Vector3; mesh: THREE.Mesh; pos: THREE.Vector3; travelled: number };
  type KnifeState = { mesh: THREE.Sprite; pos: THREE.Vector3; spinMs: number; vel: THREE.Vector3 };
  type GrenadeState = { fuseMs: number; mesh: THREE.Sprite; pos: THREE.Vector3; vel: THREE.Vector3 };
  let bolts: BoltState[] = [];
  let knives: KnifeState[] = [];
  let grenades: GrenadeState[] = [];
  let boltGeometry: THREE.BoxGeometry | null = null;
  let boltMaterial: THREE.MeshBasicMaterial | null = null;
  let lastBolt: { end: [number, number, number]; hit: string; start: [number, number, number] } | null = null;
  let lastKnife: { end: [number, number, number]; hit: string; start: [number, number, number] } | null = null;
  let lastGrenade: { center: [number, number, number]; fuseMs: number; hit: string } | null = null;
  let lastShock: { center: [number, number, number]; hits: { blocked: boolean; damage: number; distance: number; kind: string }[] } | null = null;
  let lastWeaponEvent: { action: string; weapon: string } | null = null;
  let weaponIdleTextures = new Map<string, THREE.Texture>();
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
  let spawnQueue: { at: THREE.Vector3; family: string }[] = spawnPoints.map((at) => ({
    at: at.clone(),
    family: "runner",
  }));
  const ACTIVE_RUNNER_CAP = 12;
  const MAX_ATTACKERS = 4;
  const neighborGrid = new SpatialGrid<Runner>(2.0);
  let lastNeighborCandidates = 0;

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


  const EXPLOSION_RADIUS = 4.5;
  const EXPLOSION_MAX_DAMAGE = 60;
  const EXPLOSION_CHAIN_RADIUS = 5;
  const EXPLOSION_CHAIN_DEPTH_MAX = 2;
  const EXPLOSION_CHAIN_TOTAL_MAX = 6;
  const BARREL_WARNING_MS = 350;
  const EXPLOSION_HITSTOP_MS = 35;
  type BarrelState = {
    box: Box;
    chainDepth: number;
    chainTotal: number;
    group: THREE.Group | null;
    material: THREE.MeshStandardMaterial | null;
    ring: THREE.Mesh | null;
    ringMaterial: THREE.MeshBasicMaterial | null;
    state: "idle" | "warning" | "gone";
    warningMs: number;
  };
  let barrels: BarrelState[] = [];
  let lastExplosionDamage: {
    center: [number, number, number];
    hits: { blocked: boolean; damage: number; distance: number; kind: string }[];
  } | null = null;
  const runnerHitStop = new Map<Runner, number>();
  let lastShotFx: { runnerTargets: number; surfaceOwners: string[] } = {
    runnerTargets: 0,
    surfaceOwners: [],
  };

  function drawBarrelTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable for barrel texture");
    ctx.fillStyle = "#a93226";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#ffc928";
    ctx.fillRect(0, 18, 256, 26);
    ctx.fillRect(0, 212, 256, 26);
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.lineTo(64, 70);
    ctx.lineTo(128, 120);
    ctx.lineTo(192, 70);
    ctx.lineTo(256, 120);
    ctx.lineTo(256, 170);
    ctx.lineTo(192, 120);
    ctx.lineTo(128, 170);
    ctx.lineTo(64, 120);
    ctx.lineTo(0, 170);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 246);
    ctx.fillStyle = "#f3e6c8";
    ctx.font = "900 120px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  let barrelTexture: THREE.CanvasTexture | null = null;

  function createBarrelGroup(box: Box): BarrelState {
    if (!barrelTexture) barrelTexture = drawBarrelTexture();
    const material = new THREE.MeshStandardMaterial({ map: barrelTexture });
    const geometry = new THREE.CylinderGeometry(box.half, box.half, box.height, 24);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = box.height / 2;
    const group = new THREE.Group();
    group.add(mesh);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc928,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.88, 32), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    group.add(ring);
    group.position.set(box.x, 0, box.z);
    scene.add(group);
    return {
      box,
      chainDepth: 0,
      chainTotal: 0,
      group,
      material,
      ring,
      ringMaterial,
      state: "idle",
      warningMs: 0,
    };
  }

  function spawnBarrels(): void {
    for (const def of BARREL_DEFS) {
      if (!BARRELS.some((box) => box.x === def.x && box.z === def.z)) {
        BARRELS.push({ ...def });
      }
      let entry = barrels.find((state) => state.box.x === def.x && state.box.z === def.z);
      if (!entry) {
        const box = BARRELS.find((candidate) => candidate.x === def.x && candidate.z === def.z);
        if (!box) continue;
        entry = createBarrelGroup(box);
        barrels.push(entry);
      } else if (entry.state === "gone") {
        const box = BARRELS.find((candidate) => candidate.x === def.x && candidate.z === def.z);
        if (!box) continue;
        const fresh = createBarrelGroup(box);
        entry.box = box;
        entry.group = fresh.group;
        entry.material = fresh.material;
        entry.ring = fresh.ring;
        entry.ringMaterial = fresh.ringMaterial;
        entry.state = "idle";
        entry.warningMs = 0;
      }
    }
  }

  function triggerBarrel(entry: BarrelState, chainDepth: number, chainTotal: number): void {
    if (entry.state !== "idle") return;
    entry.state = "warning";
    entry.warningMs = BARREL_WARNING_MS;
    entry.chainDepth = chainDepth;
    entry.chainTotal = chainTotal;
    if (entry.ring) entry.ring.visible = true;
  }

  function triggerBarrelFromOwner(owner: string): void {
    const match = owner.match(/barrel\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
    if (!match) return;
    const x = Number(match[1]);
    const z = Number(match[2]);
    const entry = barrels.find((state) => state.box.x === x && state.box.z === z);
    if (entry) triggerBarrel(entry, 0, 1);
  }

  function applyExplosionDamage(center: THREE.Vector3): void {
    const hits: { blocked: boolean; damage: number; distance: number; kind: string }[] = [];
    for (const runner of runners) {
      if (runner.state === "death" || runner.state === "spawn") continue;
      const target = runner.position.clone();
      target.y = 1.1;
      const toTarget = target.clone().sub(center);
      const distance = toTarget.length();
      if (distance > EXPLOSION_RADIUS) continue;
      const blocked = rayHitSolid(center, toTarget.normalize(), distance);
      if (blocked && blocked.distance < distance - 0.05) {
        hits.push({ blocked: true, damage: 0, distance, kind: "runner" });
        continue;
      }
      const damage = Math.round(EXPLOSION_MAX_DAMAGE * (1 - distance / EXPLOSION_RADIUS));
      if (damage <= 0) continue;
      const result = runner.takeDamage(damage, center);
      runnerHitStop.set(runner, EXPLOSION_HITSTOP_MS);
      hits.push({ blocked: false, damage, distance, kind: result });
    }
    const playerCenter = playerFeet.clone();
    playerCenter.y += PLAYER_HEIGHT / 2;
    const toPlayer = playerCenter.clone().sub(center);
    const playerDistance = toPlayer.length();
    if (playerDistance <= EXPLOSION_RADIUS) {
      const blocked = rayHitSolid(center, toPlayer.normalize(), playerDistance);
      if (!blocked || blocked.distance >= playerDistance - 0.05) {
        const damage = Math.round(EXPLOSION_MAX_DAMAGE * (1 - playerDistance / EXPLOSION_RADIUS));
        if (damage > 0) {
          hits.push({ blocked: false, damage, distance: playerDistance, kind: "player" });
          onPlayerDamage(damage, center);
        }
      } else {
        hits.push({ blocked: true, damage: 0, distance: playerDistance, kind: "player" });
      }
    }
    if (hits.some((hit) => hit.kind === "killed")) comicWord("KABAM!");
    lastExplosionDamage = {
      center: [center.x, center.y, center.z],
      hits,
    };
    if (settings.reducedMotion) {
      shakeTimeMs = 0;
      shakeAmp = 0;
    } else if (playerDistance <= EXPLOSION_RADIUS + 3) {
      shakeAmp = 0.35 * settings.shake * Math.max(0, 1 - playerDistance / (EXPLOSION_RADIUS + 3));
      shakeTimeMs = 350;
    }
  }

  function detonateBarrel(entry: BarrelState): void {
    if (entry.state === "gone") return;
    const center = new THREE.Vector3(entry.box.x, entry.box.height / 2, entry.box.z);
    entry.state = "gone";
    if (entry.group) {
      scene.remove(entry.group);
      entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      entry.material?.dispose();
    }
    entry.group = null;
    entry.ring = null;
    entry.ringMaterial = null;
    const boxIndex = BARRELS.findIndex((box) => box.x === entry.box.x && box.z === entry.box.z);
    if (boxIndex >= 0) BARRELS.splice(boxIndex, 1);
    fx.explosion(center, fxSettings());
    audio.explosion();
    applyExplosionDamage(center);
    let nextTotal = entry.chainTotal;
    for (const other of barrels) {
      if (other.state !== "idle") continue;
      const distance = Math.hypot(other.box.x - center.x, other.box.z - center.z);
      if (distance > EXPLOSION_CHAIN_RADIUS) continue;
      if (entry.chainDepth >= EXPLOSION_CHAIN_DEPTH_MAX) continue;
      if (nextTotal >= EXPLOSION_CHAIN_TOTAL_MAX) continue;
      nextTotal += 1;
      triggerBarrel(other, entry.chainDepth + 1, nextTotal);
    }
  }

  function updateBarrels(dtMs: number): void {
    for (const entry of barrels) {
      if (entry.state !== "warning") continue;
      entry.warningMs -= dtMs;
      const pulse = (Math.sin(performance.now() / 50) + 1) / 2;
      if (entry.material) {
        entry.material.emissive.setHex(0xffc928);
        entry.material.emissiveIntensity = 0.3 + pulse * 0.7;
      }
      if (entry.ringMaterial) entry.ringMaterial.opacity = 0.4 + pulse * 0.6;
      if (entry.ring) entry.ring.scale.setScalar(1 + pulse * 0.25);
      if (entry.warningMs <= 0) detonateBarrel(entry);
    }
  }

  function cancelBarrelWarnings(): void {
    for (const entry of barrels) {
      if (entry.state !== "warning") continue;
      entry.state = "idle";
      entry.warningMs = 0;
      if (entry.material) entry.material.emissiveIntensity = 0;
      if (entry.ring) entry.ring.visible = false;
    }
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
        const normal = eye.clone().sub(center).normalize();
        fx.impact(center, normal, fxSettings(), result === "killed");
      }
    }
    if (meleeAnyHit) comicWord("CRACK!");
  }


  let spawnCounter = 0;
  function enemyClipTextures(spec: import("./assets").EnemySpec): {
    attack: THREE.Texture[];
    attackTopY: number;
    defeat: THREE.Texture[];
    run: THREE.Texture[];
    runDirections: Partial<Record<RunDirection, THREE.Texture[]>>;
    runStartPhase01: number;
    runTopY: number;
  } {
    const run = manifest.clips[spec.runClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const attack = manifest.clips[spec.attackClip].assetIds.map(
      (id) => textures?.get(id) as THREE.Texture,
    );
    const defeatSpec = manifest.enemies[spec.id];
    const defeat =
      defeatSpec.defeatClip.length > 0
        ? manifest.clips[defeatSpec.defeatClip].assetIds.map(
            (id) => textures?.get(id) as THREE.Texture,
          )
        : [];
    const runDirections =
      spec.id === "runner"
        ? (Object.fromEntries(
            (Object.keys(RUN_DIRECTION_CLIPS) as RunDirection[]).map((direction) => [
              direction,
              manifest.clips[RUN_DIRECTION_CLIPS[direction]].assetIds.map(
                (id) => textures?.get(id) as THREE.Texture,
              ),
            ]),
          ) as Partial<Record<RunDirection, THREE.Texture[]>>)
        : { front: run };
    const phase = (spawnCounter % 4) / 4;
    spawnCounter += 1;
    const tops: Record<string, { attack: number; run: number }> = {
      runner: { attack: 31, run: 58 },
      insect: { attack: 51, run: 193 },
      brute: { attack: 62, run: 37 },
    };
    const top = tops[spec.id] ?? tops.runner;
    return { attack, attackTopY: top.attack, defeat, run, runDirections, runStartPhase01: phase, runTopY: top.run };
  }

  function spawnRunner(at: THREE.Vector3, family = "runner", speedScale = 1): Runner {
    const spec = enemySpec(family);
    const runner = new Runner(
      textures?.get(manifest.clips[spec.runClip].assetIds[0]) as THREE.Texture,
      at,
      spec,
      enemyClipTextures(spec),
    );
    runner.speedScale = speedScale;
    scene.add(runner.group);
    runners.push(runner);
    waveActive = true;
    return runner;
  }

  function buildSpawnQueue(next: number): { at: THREE.Vector3; family: string }[] {
    const total = 6 + 2 * (next - 1);
    const bruteCount =
      next >= 3 ? Math.min(2 + Math.floor((next - 3) / 2), Math.floor(total / 4)) : 0;
    const insectCount =
      next >= 2 ? Math.min(Math.floor(total * 0.3), total - bruteCount - 1) : 0;
    const runnerCount = total - bruteCount - insectCount;
    const remaining: Record<string, number> = {
      runner: runnerCount,
      insect: insectCount,
      brute: bruteCount,
    };
    const cycle = ["runner", "insect", "runner", "brute"];
    const queue: { at: THREE.Vector3; family: string }[] = [];
    let cycleIndex = 0;
    while (queue.length < total) {
      const family = cycle[cycleIndex % cycle.length];
      cycleIndex += 1;
      if (remaining[family] <= 0) continue;
      remaining[family] -= 1;
      queue.push({
        at: spawnPoints[queue.length % spawnPoints.length].clone(),
        family,
      });
    }
    return queue;
  }

  function clearPickups(): void {
    for (const pickup of pickups) pickup.dispose();
    pickups = [];
  }

  function spawnPickups(): void {
    for (const kind of Object.keys(PICKUP_RULES) as PickupKind[]) {
      pickups = pickups.filter((pickup) => {
        if (pickup.kind === kind && pickup.taken) {
          pickup.dispose();
          return false;
        }
        return true;
      });
      if (pickups.some((pickup) => pickup.kind === kind && !pickup.taken)) continue;
      const rule = PICKUP_RULES[kind];
      const pickup = new Pickup(kind, new THREE.Vector3(...rule.position));
      scene.add(pickup.group);
      pickups.push(pickup);
    }
  }

  function startWave(next: number): void {
    wave = next;
    for (const entry of weaponOrder()) weaponAmmo[entry.id] = entry.ammo;
    if (weaponView) weaponView.ammo = weaponAmmo[currentWeaponId];
    pendingWaveBanner = next;
    spawnQueue = buildSpawnQueue(next);
    waveActive = true;
    spawnTimerMs = 0;
    spawnPickups();
    spawnBarrels();
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
    clearProjectiles();
    knifeWindupActive = false;
    knifeWindupMs = 0;
    autoHeld = false;
    inkCooldownMs = 0;
    fx.clear();
    cancelBarrelWarnings();
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
    inkPressure = 0;
    currentWeaponId = "shotgun";
    for (const entry of weaponOrder()) weaponAmmo[entry.id] = entry.ammo;
    if (weaponView) {
      weaponView.ammo = weaponAmmo.shotgun;
      weaponView.setAmmoMax(weaponSpec("shotgun").ammo);
      const shotgunTexture = weaponIdleTextures.get("shotgun");
      if (shotgunTexture) {
        weaponView.setIdle(shotgunTexture, [0.095, 0.023], 1.725, 1.15);
        weaponView.setFlashScale(1);
      }
    }
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

  function clearProjectiles(): void {
    for (const bolt of bolts) scene.remove(bolt.mesh);
    for (const knife of knives) scene.remove(knife.mesh);
    for (const grenade of grenades) scene.remove(grenade.mesh);
    bolts = [];
    knives = [];
    grenades = [];
  }

  function applyRunnerHit(runner: Runner, damage: number, from: THREE.Vector3): void {
    const result = runner.takeDamage(damage, from);
    if (result === "applied" || result === "killed") {
      hitmarkerMs = 150;
      hitmarkerKind = result === "killed" ? "kill" : "hit";
      if (result === "killed") comicWord("INKED!");
      const center = runner.position.clone();
      center.y = 1.1;
      const normal = camera.position.clone().sub(center).normalize();
      fx.impact(center, normal, fxSettings(), result === "killed");
      if (result === "killed") runnerHitStop.set(runner, 30);
    }
  }

  function runnerAtPoint(point: THREE.Vector3): Runner | null {
    for (const runner of runners) {
      if (runner.state === "death" || runner.state === "spawn") continue;
      const center = runner.position.clone();
      center.y = 1.1;
      if (point.distanceTo(center) <= 0.85) return runner;
    }
    return null;
  }

  function selectWeapon(id: string): boolean {
    if (!weaponView || id === currentWeaponId) return id === currentWeaponId;
    const spec = weaponSpec(id);
    const texture = weaponIdleTextures.get(id);
    if (!texture) return false;
    weaponAmmo[currentWeaponId] = weaponView.ammo;
    if (weaponView.reloading) weaponView.cancelReload();
    knifeWindupActive = false;
    knifeWindupMs = 0;
    currentWeaponId = id;
    weaponView.ammo = weaponAmmo[id];
    weaponView.setAmmoMax(spec.ammo);
    const views: Record<string, { flash: number; h: number; muzzle: [number, number]; w: number }> = {
      shotgun: { flash: 1, h: 1.15, muzzle: [0.095, 0.023], w: 1.725 },
      pistol: { flash: 0.6, h: 1.15, muzzle: [0.195, 0.203], w: 0.92 },
      automatic: { flash: 0.8, h: 1.15, muzzle: [0.107, 0.148], w: 0.92 },
      blaster: { flash: 1, h: 1.15, muzzle: [0.088, 0.148], w: 1.725 },
      knife: { flash: 0.5, h: 0.55, muzzle: [0.95, 0.5], w: 1.65 },
      throwable: { flash: 0.5, h: 0.7, muzzle: [0.5, 0.5], w: 0.7 },
    };
    const view = views[id];
    weaponView.setIdle(texture, view.muzzle, view.w, view.h);
    weaponView.setFlashScale(view.flash);
    lastWeaponEvent = { action: "select", weapon: id };
    return true;
  }

  function aimVectors(): { eye: THREE.Vector3; forward: THREE.Vector3; muzzle: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
    const eye = camera.position.clone();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    return { eye, forward, muzzle: worldMuzzle(eye, forward, right, up), right, up };
  }

  function spawnBolt(): void {
    if (!boltGeometry) boltGeometry = new THREE.BoxGeometry(0.09, 0.09, 0.7);
    if (!boltMaterial) boltMaterial = new THREE.MeshBasicMaterial({ color: 0x24c9d6 });
    const { dir, muzzle } = (() => {
      const aim = aimVectors();
      return { dir: aim.forward, muzzle: aim.muzzle };
    })();
    const mesh = new THREE.Mesh(boltGeometry, boltMaterial);
    mesh.position.copy(muzzle);
    mesh.lookAt(muzzle.clone().add(dir));
    scene.add(mesh);
    bolts.push({ dir: dir.clone(), mesh, pos: muzzle.clone(), travelled: 0 });
    lastBolt = { end: [muzzle.x, muzzle.y, muzzle.z], hit: "flying", start: [muzzle.x, muzzle.y, muzzle.z] };
  }

  function spawnKnifeProjectile(): void {
    const texture = textures?.get("punchy_knife_world");
    if (!texture) return;
    const aim = aimVectors();
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Sprite(material);
    mesh.scale.set(0.7, 0.23, 1);
    mesh.position.copy(aim.muzzle);
    scene.add(mesh);
    knives.push({ mesh, pos: aim.muzzle.clone(), spinMs: 0, vel: aim.forward.clone().multiplyScalar(KNIFE_SPEED) });
    lastKnife = { end: [aim.muzzle.x, aim.muzzle.y, aim.muzzle.z], hit: "flying", start: [aim.muzzle.x, aim.muzzle.y, aim.muzzle.z] };
  }

  function detonateGrenade(entry: GrenadeState): void {
    scene.remove(entry.mesh);
    (entry.mesh.material as THREE.Material).dispose();
    grenades = grenades.filter((item) => item !== entry);
    const center = entry.pos.clone();
    fx.explosion(center, fxSettings());
    audio.explosion();
    applyExplosionDamage(center);
    lastGrenade = { center: [center.x, center.y, center.z], fuseMs: entry.fuseMs, hit: "detonated" };
    let nearest: BarrelState | null = null;
    let nearestDistance = EXPLOSION_CHAIN_RADIUS;
    for (const barrel of barrels) {
      if (barrel.state !== "idle") continue;
      const distance = Math.hypot(barrel.box.x - center.x, barrel.box.z - center.z);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearest = barrel;
      }
    }
    if (nearest) triggerBarrel(nearest, 0, 1);
  }

  function throwGrenade(): boolean {
    if (!weaponView) return false;
    if (fireCooldownMs > 0 || weaponAmmo.throwable <= 0) return false;
    const spec = weaponSpec("throwable");
    weaponAmmo.throwable -= 1;
    if (currentWeaponId === "throwable") weaponView.ammo = weaponAmmo.throwable;
    fireCooldownMs = spec.fireIntervalMs;
    reticleExpandMs = 120;
    weaponView.triggerKick();
    audio.grenadeThrow();
    const aim = aimVectors();
    const texture = textures?.get("punchy_grenade_world");
    if (!texture) return false;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Sprite(material);
    mesh.scale.set(0.5, 0.5, 1);
    mesh.position.copy(aim.muzzle);
    scene.add(mesh);
    const vel = aim.forward.clone().multiplyScalar(10);
    vel.y += 6;
    grenades.push({ fuseMs: GRENADE_FUSE_MS, mesh, pos: aim.muzzle.clone(), vel });
    lastWeaponEvent = { action: "grenade", weapon: "throwable" };
    return true;
  }

  function spendInk(): boolean {
    if (inkPressure < INK_COST || inkCooldownMs > 0) return false;
    inkPressure -= INK_COST;
    inkCooldownMs = INK_COOLDOWN_MS;
    const aim = aimVectors();
    const center = aim.eye.clone().addScaledVector(aim.forward, 3);
    center.y = Math.max(0.6, center.y - 0.5);
    const hits: { blocked: boolean; damage: number; distance: number; kind: string }[] = [];
    for (const runner of runners) {
      if (runner.state === "death" || runner.state === "spawn") continue;
      const target = runner.position.clone();
      target.y = 1.1;
      const toTarget = target.clone().sub(center);
      const distance = toTarget.length();
      if (distance > INK_RADIUS) continue;
      const blocked = rayHitSolid(center, toTarget.normalize(), distance);
      if (blocked && blocked.distance < distance - 0.05) {
        hits.push({ blocked: true, damage: 0, distance, kind: "runner" });
        continue;
      }
      const damage = Math.round(INK_MAX_DAMAGE * (1 - distance / INK_RADIUS));
      if (damage <= 0) continue;
      const result = runner.takeDamage(damage, center);
      runnerHitStop.set(runner, EXPLOSION_HITSTOP_MS);
      hits.push({ blocked: false, damage, distance, kind: result });
    }
    fx.explosion(center, fxSettings());
    audio.shock();
    if (hits.some((hit) => hit.kind === "killed")) comicWord("INKED!");
    lastShock = { center: [center.x, center.y, center.z], hits };
    lastWeaponEvent = { action: "shock", weapon: "ink" };
    if (!settings.reducedMotion) {
      shakeAmp = 0.35 * settings.shake;
      shakeTimeMs = 350;
    }
    return true;
  }

  function updateProjectiles(dt: number): void {
    const dtMs = dt * 1000;
    for (const bolt of [...bolts]) {
      const stepDistance = BOLT_SPEED * dt;
      const steps = Math.max(1, Math.ceil(stepDistance / 0.25));
      const step = bolt.dir.clone().multiplyScalar(stepDistance / steps);
      let removed = false;
      for (let i = 0; i < steps && !removed; i += 1) {
        const prev = bolt.pos.clone();
        bolt.pos.add(step);
        bolt.travelled += step.length();
        const surface = rayHitSurface(prev, bolt.dir, step.length() + 0.01);
        if (surface) {
          fx.impact(surface.point, surface.normal, fxSettings(), false);
          addDecal(surface);
          if (surface.owner.startsWith("barrel(")) triggerBarrelFromOwner(surface.owner);
          lastBolt = { end: [surface.point.x, surface.point.y, surface.point.z], hit: "solid", start: lastBolt?.start ?? [prev.x, prev.y, prev.z] };
          scene.remove(bolt.mesh);
          bolts = bolts.filter((item) => item !== bolt);
          removed = true;
          break;
        }
        if (bolt.pos.y <= 0) {
          fx.impact(bolt.pos.clone(), new THREE.Vector3(0, 1, 0), fxSettings(), false);
          lastBolt = { end: [bolt.pos.x, bolt.pos.y, bolt.pos.z], hit: "floor", start: lastBolt?.start ?? [prev.x, prev.y, prev.z] };
          scene.remove(bolt.mesh);
          bolts = bolts.filter((item) => item !== bolt);
          removed = true;
          break;
        }
        const runner = runnerAtPoint(bolt.pos);
        if (runner) {
          applyRunnerHit(runner, weaponSpec("blaster").damage, playerFeet);
          lastBolt = { end: [bolt.pos.x, bolt.pos.y, bolt.pos.z], hit: "runner", start: lastBolt?.start ?? [prev.x, prev.y, prev.z] };
          scene.remove(bolt.mesh);
          bolts = bolts.filter((item) => item !== bolt);
          removed = true;
          break;
        }
      }
      if (removed) continue;
      if (bolt.travelled >= weaponSpec("blaster").range) {
        scene.remove(bolt.mesh);
        bolts = bolts.filter((item) => item !== bolt);
        continue;
      }
      bolt.mesh.position.copy(bolt.pos);
      bolt.mesh.lookAt(bolt.pos.clone().add(bolt.dir));
      const pulse = 1 + Math.sin(performance.now() / 40) * 0.25;
      bolt.mesh.scale.set(pulse, pulse, 1);
    }
    for (const knife of [...knives]) {
      const stepDistance = KNIFE_SPEED * dt;
      const steps = Math.max(1, Math.ceil(stepDistance / 0.25));
      const step = knife.vel.clone().multiplyScalar(dt / steps);
      let removed = false;
      for (let i = 0; i < steps && !removed; i += 1) {
        const prev = knife.pos.clone();
        knife.pos.add(step);
        const surface = rayHitSurface(prev, knife.vel.clone().normalize(), step.length() + 0.01);
        if (surface) {
          fx.impact(surface.point, surface.normal, fxSettings(), false);
          addDecal(surface);
          lastKnife = { end: [surface.point.x, surface.point.y, surface.point.z], hit: "solid", start: lastKnife?.start ?? [prev.x, prev.y, prev.z] };
          scene.remove(knife.mesh);
          (knife.mesh.material as THREE.Material).dispose();
          knives = knives.filter((item) => item !== knife);
          removed = true;
          break;
        }
        if (knife.pos.y <= 0.1) {
          fx.impact(knife.pos.clone(), new THREE.Vector3(0, 1, 0), fxSettings(), false);
          lastKnife = { end: [knife.pos.x, knife.pos.y, knife.pos.z], hit: "floor", start: lastKnife?.start ?? [prev.x, prev.y, prev.z] };
          scene.remove(knife.mesh);
          (knife.mesh.material as THREE.Material).dispose();
          knives = knives.filter((item) => item !== knife);
          removed = true;
          break;
        }
        const runner = runnerAtPoint(knife.pos);
        if (runner) {
          applyRunnerHit(runner, weaponSpec("knife").damage, playerFeet);
          lastKnife = { end: [knife.pos.x, knife.pos.y, knife.pos.z], hit: "runner", start: lastKnife?.start ?? [prev.x, prev.y, prev.z] };
          scene.remove(knife.mesh);
          (knife.mesh.material as THREE.Material).dispose();
          knives = knives.filter((item) => item !== knife);
          removed = true;
          break;
        }
      }
      if (removed) continue;
      if (knife.pos.distanceTo(playerFeet) > weaponSpec("knife").range + 5) {
        scene.remove(knife.mesh);
        (knife.mesh.material as THREE.Material).dispose();
        knives = knives.filter((item) => item !== knife);
        continue;
      }
      knife.spinMs += dtMs;
      (knife.mesh.material as THREE.SpriteMaterial).rotation = knife.spinMs / 1000 * 12;
      if (knife.spinMs % 300 < dtMs) burst(knife.pos.clone(), 1);
      knife.mesh.position.copy(knife.pos);
    }
    for (const grenade of [...grenades]) {
      grenade.fuseMs -= dtMs;
      grenade.vel.y -= 18 * dt;
      grenade.pos.addScaledVector(grenade.vel, dt);
      if (grenade.pos.y <= 0.35) {
        grenade.pos.y = 0.35;
        grenade.vel.multiplyScalar(0.4);
        grenade.vel.y = 0;
      }
      if (grenade.pos.x < -ARENA_HALF) grenade.pos.x = -ARENA_HALF;
      if (grenade.pos.x > ARENA_HALF) grenade.pos.x = ARENA_HALF;
      if (grenade.pos.z < -ARENA_HALF) grenade.pos.z = -ARENA_HALF;
      if (grenade.pos.z > ARENA_HALF) grenade.pos.z = ARENA_HALF;
      grenade.mesh.position.copy(grenade.pos);
      (grenade.mesh.material as THREE.SpriteMaterial).rotation += dt * 4;
      const runner = runnerAtPoint(grenade.pos);
      if (runner || grenade.fuseMs <= 0) {
        detonateGrenade(grenade);
      }
    }
  }

  function fireShot(): void {
    if (!weaponView) return;
    if (weaponView.reloading) weaponView.cancelReload();
    if (fireCooldownMs > 0 || knifeWindupActive) return;
    const spec = weaponSpec(currentWeaponId);
    if (spec.kind === "knife") {
      if (weaponAmmo.knife <= 0) return;
      knifeWindupActive = true;
      knifeWindupMs = spec.windupMs ?? 180;
      lastWeaponEvent = { action: "knifeWindup", weapon: "knife" };
      return;
    }
    if (spec.kind === "grenade") {
      throwGrenade();
      return;
    }
    if (weaponView.ammo <= 0) {
      const started =
        spec.id === "shotgun" ? weaponView.startReload() : weaponView.startReloadGeneric(spec.reloadMs);
      if (started) audio.reload();
      return;
    }
    weaponView.ammo -= 1;
    weaponAmmo[currentWeaponId] = weaponView.ammo;
    fireCooldownMs = spec.fireIntervalMs;
    reticleExpandMs = 120;
    if (spec.kind === "bolt") {
      weaponView.triggerKick();
      audio.blaster();
      spawnBolt();
      lastWeaponEvent = { action: "bolt", weapon: "blaster" };
      return;
    }
    if (spec.id === "shotgun") {
      weaponView.triggerFire();
      audio.shot();
      fireHitscanShot(spec, true);
    } else if (spec.id === "pistol") {
      weaponView.triggerKick();
      audio.pistol();
      fireHitscanShot(spec, true);
    } else if (spec.id === "automatic") {
      weaponView.triggerKick();
      audio.automatic();
      autoShotCount += 1;
      fireHitscanShot(spec, autoShotCount % 3 === 0);
      const aim = aimVectors();
      burst(aim.muzzle.clone(), 2);
    }
    lastWeaponEvent = { action: "fire", weapon: spec.id };
  }

  function fireHitscanShot(spec: import("./assets").Weapon, drawTracers: boolean): void {
    let anyImpact = false;
    const runnerFxDone = new Set<Runner>();
    const surfaceFxKeys = new Set<string>();
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
      let aimDistance = spec.range;
      let aimPoint: THREE.Vector3 | null = null;
      let aimRunner: Runner | null = null;
      const solid = rayHitSolid(eye, dir, spec.range);
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
      const aim = aimPoint ?? eye.clone().addScaledVector(dir, spec.range);
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
      if (drawTracers) tracer(muzzle, end);
      if (blocked) {
        const key = blocked.owner;
        if (!surfaceFxKeys.has(key)) {
          surfaceFxKeys.add(key);
          addDecal(blocked);
          if (end.distanceTo(muzzle) > 0.05) fx.impact(end, blocked.normal, fxSettings(), false);
          if (blocked.owner.startsWith("barrel(")) triggerBarrelFromOwner(blocked.owner);
        }
      } else if (aimPoint && !aimRunner) {
        const eyeSurface = rayHitSurface(eye, dir, aimDistance);
        if (eyeSurface) {
          const key = eyeSurface.owner;
          if (!surfaceFxKeys.has(key)) {
            surfaceFxKeys.add(key);
            addDecal(eyeSurface);
            fx.impact(eyeSurface.point, eyeSurface.normal, fxSettings(), false);
          }
        }
      }
      if (blocked || aimPoint) anyImpact = true;
      if (hitRunner) {
        const result = hitRunner.takeDamage(spec.damage, playerFeet);
        if (result === "applied" || result === "killed") {
          hitmarkerMs = 150;
          hitmarkerKind = result === "killed" ? "kill" : "hit";
          if (result === "killed") comicWord("INKED!");
          if (!runnerFxDone.has(hitRunner)) {
            runnerFxDone.add(hitRunner);
            const center = hitRunner.position.clone();
            center.y = 1.1;
            const normal = camera.position.clone().sub(center).normalize();
            fx.impact(center, normal, fxSettings(), result === "killed");
            if (result === "killed") runnerHitStop.set(hitRunner, 30);
          }
        }
      }
    }
    if (anyImpact) audio.impact();
    lastShotFx = { runnerTargets: runnerFxDone.size, surfaceOwners: [...surfaceFxKeys] };
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
    let lastSpawnedRunner: Runner | null = null;
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
            family: runner.family,
            footstepCount: runner.footstepCount,
            health: runner.health,
            runClip: runner.runClipId,
            runFrame: runner.runFrameIndex,
            runPhase: runner.runPhase01,
            runScale: runner.runMeshScale,
            scale: anyRunner.mesh.scale.x,
            visibleMesh: runner.visibleMeshKind,
            spawnCue: runner.spawnCueVisible,
            warningRadius: runner.warningRadius,
            warningVisible: runner.warningVisible,
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
        lastSpawnedRunner = spawnRunner(new THREE.Vector3(x, 0, z));
        return lastSpawnedRunner.family;
      },
      getLastSpawned: () => {
        if (!lastSpawnedRunner) return null;
        return {
          health: lastSpawnedRunner.health,
          state: lastSpawnedRunner.state,
          x: lastSpawnedRunner.position.x,
          z: lastSpawnedRunner.position.z,
        };
      },
      spawnFamilyAt: (x: number, z: number, family: string) => {
        spawnQueue = [];
        const runner = spawnRunner(new THREE.Vector3(x, 0, z), family);
        runner.beginPursue();
        return runner.family;
      },
      getWaveComposition: () => {
        const count = (list: string[]): Record<string, number> => {
          const out: Record<string, number> = {};
          for (const family of list) out[family] = (out[family] ?? 0) + 1;
          return out;
        };
        return {
          active: count(runners.map((runner) => runner.family)),
          queued: count(spawnQueue.map((entry) => entry.family)),
          wave,
        };
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
      getCaps: () => ({
        activeEnemies: runners.length,
        activeRunnerCap: ACTIVE_RUNNER_CAP,
        activeRunners: runners.length,
        attackers: runners.filter((runner) => runner.state === "attack").length,
        fxPools: fx.counts(),
        lastNeighborCandidates: lastNeighborCandidates,
        maxAttackers: MAX_ATTACKERS,
        neighborBuckets: neighborGrid.bucketCount,
        queuedRunners: spawnQueue.length,
        totalRunners: runners.length,
      }),
      spatialProbe: () => {
        neighborGrid.rebuild(runners);
        const first = runners[0];
        return first
          ? {
              fullCount: runners.length,
              gridCandidates: neighborGrid.neighbors(first.position).length,
            }
          : { fullCount: 0, gridCandidates: 0 };
      },
      getFx: () => fx.counts(),
      getLastShotFx: () => lastShotFx,
      getBarrels: () =>
        barrels.map((entry) => ({
          chainDepth: entry.chainDepth,
          chainTotal: entry.chainTotal,
          state: entry.state,
          warningMs: entry.warningMs,
          x: entry.box.x,
          z: entry.box.z,
        })),
      getExplosionDamage: () => lastExplosionDamage,
      getActiveExplosion: () => fx.getActiveExplosion(),
      getExplosionVisuals: () => fx.explosionVisuals(),
      explodeAt: (x: number, y: number, z: number) => {
        const center = new THREE.Vector3(x, y, z);
        fx.explosion(center, fxSettings());
        audio.explosion();
        applyExplosionDamage(center);
        return lastExplosionDamage;
      },
      triggerBarrel: (index: number) => {
        const entry = barrels[index];
        if (!entry) return null;
        triggerBarrel(entry, 0, 1);
        return entry.state;
      },
      clearRunners: () => {
        for (const runner of runners) runner.dispose();
        runners = [];
        spawnQueue = [];
        waveActive = false;
      },
      startWaveDebug: (next: number) => {
        for (const runner of runners) runner.dispose();
        runners = [];
        spawnQueue = [];
        startWave(next);
        return { queued: spawnQueue.length, wave };
      },
      resetGame,
      damagePlayer: (amount: number) => onPlayerDamage(amount),
      setSettings: (partial: Partial<Settings>) => setSettings(partial),
      getSettings: () => ({ ...settings }),
      fireShot,
      selectWeapon,
      throwGrenade,
      spendInk,
      getWeapons: () => ({
        ammo: { ...weaponAmmo },
        current: currentWeaponId,
        ink: inkPressure,
        inkCooldownMs,
        knifeWindupActive,
        registry: weaponOrder().map((entry) => ({
          ammo: entry.ammo,
          damage: entry.damage,
          fireIntervalMs: entry.fireIntervalMs,
          id: entry.id,
          kind: entry.kind,
          name: entry.name,
          pellets: entry.pellets,
          range: entry.range,
          reloadMs: entry.reloadMs,
          spread: entry.spread,
        })),
      }),
      getProjectiles: () => ({
        bolts: bolts.map((entry) => ({ pos: [entry.pos.x, entry.pos.y, entry.pos.z], travelled: entry.travelled })),
        grenades: grenades.map((entry) => ({ fuseMs: entry.fuseMs, pos: [entry.pos.x, entry.pos.y, entry.pos.z] })),
        knives: knives.map((entry) => ({ pos: [entry.pos.x, entry.pos.y, entry.pos.z] })),
        lastBolt,
        lastGrenade,
        lastKnife,
        lastShock,
        lastWeaponEvent,
      }),
      setHitmarkerMs: (ms: number) => {
        hitmarkerMs = ms;
      },
      getHud: () => ({
        ammoCount: ammoCountEl.textContent,
        inkText: inkTextEl.textContent,
        weapon: currentWeaponId,
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
      textures = await loadTextures(
        (done, total, id) => {
          menuText.textContent = `Loading assets ${done}/${total}: ${id}…`;
        },
        { alphaDiagnostics: debugMode || params.get("review") === "1" },
      );
      if (!arenaBuilt) {
        scene.add(buildArena(textures, manifest.environment));
        spawnBarrels();
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
        weaponIdleTextures.set("shotgun", loaded.get("punchy_shotgun_idle") as THREE.Texture);
        weaponIdleTextures.set("pistol", proceduralWeaponTexture("pistol"));
        weaponIdleTextures.set("automatic", proceduralWeaponTexture("automatic"));
        weaponIdleTextures.set("blaster", loaded.get("punchy_blaster_idle") as THREE.Texture);
        weaponIdleTextures.set("knife", loaded.get("punchy_knife_world") as THREE.Texture);
        weaponIdleTextures.set("throwable", loaded.get("punchy_grenade_world") as THREE.Texture);
      }
      startupState = "ready";
      showMenu("Paper. Six weapons: shotgun, pistol, automatic, blaster, knife, grenade. Runner, insect, and brute waves, score, pickups, and ink pressure.", "Play");
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
    "KeyG",
    "KeyX",
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
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
    if (phase === "playing" && !event.repeat && event.code.startsWith("Digit")) {
      const order = weaponOrder();
      const index = Number(event.code.slice(5)) - 1;
      if (order[index]) selectWeapon(order[index].id);
    }
    if (event.code === "KeyG" && phase === "playing" && !event.repeat) throwGrenade();
    if (event.code === "KeyX" && phase === "playing" && !event.repeat) spendInk();
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
    autoHeld = true;
    fireShot();
  });
  renderer.domElement.addEventListener("mouseup", (event) => {
    if (event.button !== 0) return;
    autoHeld = false;
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
    fx.update(dtMs, fxSettings());
    updateBarrels(dtMs);

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

    fireCooldownMs = Math.max(0, fireCooldownMs - dtMs);
    inkCooldownMs = Math.max(0, inkCooldownMs - dtMs);
    if (phase === "playing") {
      if (knifeWindupActive) {
        knifeWindupMs -= dtMs;
        if (knifeWindupMs <= 0) {
          knifeWindupActive = false;
          weaponAmmo.knife -= 1;
          if (currentWeaponId === "knife" && weaponView) weaponView.ammo = weaponAmmo.knife;
          fireCooldownMs = weaponSpec("knife").fireIntervalMs;
          spawnKnifeProjectile();
          audio.knifeThrow();
          lastWeaponEvent = { action: "knifeRelease", weapon: "knife" };
        }
      }
      if (autoHeld && currentWeaponId === "automatic" && fireCooldownMs <= 0) fireShot();
      updateProjectiles(dt);
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

      if (spawnQueue.length > 0 && runners.length < ACTIVE_RUNNER_CAP) {
        spawnTimerMs -= dtMs;
        if (spawnTimerMs <= 0) {
          const next = spawnQueue.shift();
          if (next) spawnRunner(next.at, next.family, Math.min(1.5, 1 + 0.05 * (wave - 1)));
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

      neighborGrid.rebuild(runners);
      let attackers = runners.filter((runner) => runner.state === "attack").length;
      for (const runner of [...runners]) {
        const stop = runnerHitStop.get(runner) ?? 0;
        if (stop > 0) {
          runnerHitStop.set(runner, stop - dtMs);
        } else {
          runnerHitStop.delete(runner);
          const candidates = neighborGrid.neighbors(runner.position);
          lastNeighborCandidates = candidates.length;
          let canAttack = true;
          if (runner.state === "telegraph" && attackers >= MAX_ATTACKERS) canAttack = false;
          if (runner.state === "telegraph" && canAttack) attackers += 1;
          runner.update(dt, camera, playerBody, onPlayerDamage, candidates, {
            canAttack,
            onFamilyStrike: (enemy, kind) => {
              if (kind !== "slam") return;
              fx.impact(enemy.position.clone().setY(0.1), new THREE.Vector3(0, 1, 0), fxSettings(), true);
              audio.bruteSlam();
            },
          });
        }
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
        if (runner.state === "attack" && prevState !== "attack") {
          if (runner.family === "insect") audio.insectLeap();
          else if (runner.family === "brute") audio.bruteWindup();
          else audio.monsterAttack();
        }
        // Score at the death transition itself, not in the shot path, so
        // every kill scores exactly once no matter which damage source
        // caused it, and a shot that only wounds scores nothing.
        if (runner.state === "death" && prevState !== undefined && prevState !== "death") {
          addScoreForKill();
          inkPressure = Math.min(INK_MAX, inkPressure + INK_PER_KILL);
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
            const spec = weaponSpec(currentWeaponId);
            const add = spec.kind === "knife" || spec.kind === "grenade" ? 1 : rule.amount;
            weaponAmmo[currentWeaponId] = Math.min(spec.ammo, weaponAmmo[currentWeaponId] + add);
            weaponView.ammo = weaponAmmo[currentWeaponId];
          }
          scene.remove(pickup.group);
          pickup.dispose();
          burst(pickup.position.clone().setY(0.6), 12);
          audio.pickup();
        }
      }
      pickups = pickups.filter((pickup) => !pickup.taken);
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
            `Next wave has ${nextCount} enemies at speed ${nextSpeed}. ` +
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
    const hudAmmo = weaponView
      ? `${weaponSpec(currentWeaponId).name} ${weaponView.ammo} / ${weaponSpec(currentWeaponId).ammo}`
      : "Loading…";
    if (lastHud.ammo !== hudAmmo) {
      lastHud.ammo = hudAmmo;
      ammoCountEl.textContent = hudAmmo;
    }
    if (weaponView) {
      const wv = weaponView;
      const spec = weaponSpec(currentWeaponId);
      const needed = Math.min(spec.ammo, 12);
      while (ammoPipsEl.children.length < needed) {
        const span = document.createElement("span");
        ammoPipsEl.appendChild(span);
      }
      while (ammoPipsEl.children.length > needed) {
        ammoPipsEl.removeChild(ammoPipsEl.lastChild as ChildNode);
      }
      const pips = Array.from(ammoPipsEl.children);
      pips.forEach((pip, index) => {
        const filled = index < Math.round((wv.ammo / spec.ammo) * needed);
        pip.classList.toggle("spent", !filled);
      });
    }
    const hudAmmoState = !weaponView
      ? "Loading…"
      : knifeWindupActive
        ? "Winding up…"
        : weaponView.reloading
          ? `Reloading ${Math.round(weaponView.reloadProgress01 * 100)}%`
          : weaponView.ammo <= 0
            ? "RELOAD"
            : "";
    const hudInk =
      inkCooldownMs > 0
        ? `INK ${inkPressure} / 100 · Shock in ${Math.ceil(inkCooldownMs / 1000)}s`
        : inkPressure >= INK_COST
          ? `INK ${inkPressure} / 100 · X: SHOCK READY`
          : `INK ${inkPressure} / 100 · X needs 50`;
    if (lastHud.ink !== hudInk) {
      lastHud.ink = hudInk;
      inkTextEl.textContent = hudInk;
      inkFillEl.style.width = `${inkPressure}%`;
    }
    void inkEl;
    if (lastHud.ammoState !== hudAmmoState) {
      lastHud.ammoState = hudAmmoState;
      ammoStateEl.textContent = hudAmmoState;
      ammoStateEl.classList.toggle("empty", hudAmmoState === "RELOAD");
    }
    const hudWave = `Wave ${wave} — Enemies left: ${runners.length + spawnQueue.length}`;
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
