import * as THREE from "three";
import {
  intervalsOverlap,
  rayHitSolid,
  resolveCircle,
  segmentBlockedByCrate,
  type PlayerBody,
} from "./arena";
import { manifest, type EnemySpec } from "./assets";
import { AnimationPlayer, clipFromManifest } from "./animation";
import { findRoute } from "./pathing";

export type EnemyState = "spawn" | "pursue" | "telegraph" | "attack" | "hit" | "death";

// Spawning runners are visible but invulnerable for their spawn period.
// takeDamage reports whether damage actually landed, so the shooter never
// shows hit feedback for a hit that did nothing.
export type DamageResult = "applied" | "killed" | "invulnerable" | "dead";

export type RunDirection =
  | "front"
  | "front-right"
  | "right"
  | "back-right"
  | "back"
  | "back-left"
  | "left"
  | "front-left";

// Sectors are ordered by relative heading angle, starting at front and
// stepping 45 degrees toward the camera's right. Top values are measured
// from the sliced frames, not guessed from canvas size. Ground lines are
// not stored here: they come from the manifest pivot of each clip's
// first asset, so the geometry and the manifest cannot drift apart.
export const RUN_DIRECTIONS: {
  clipId: string;
  name: RunDirection;
  topY: number;
}[] = [
  { clipId: "runner_run_front", name: "front", topY: 58 },
  { clipId: "runner_run_front_right", name: "front-right", topY: 51 },
  { clipId: "runner_run_right", name: "right", topY: 82 },
  { clipId: "runner_run_back_right", name: "back-right", topY: 32 },
  { clipId: "runner_run_back", name: "back", topY: 46 },
  { clipId: "runner_run_back_left", name: "back-left", topY: 35 },
  { clipId: "runner_run_left", name: "left", topY: 108 },
  { clipId: "runner_run_front_left", name: "front-left", topY: 113 },
];

export function manifestGroundY(clipId: string): number {
  const first = manifest.assets[manifest.clips[clipId].assetIds[0]];
  return first.pivot[1] * first.size[1];
}

export const RUN_DIRECTION_CLIPS: Record<RunDirection, string> = Object.fromEntries(
  RUN_DIRECTIONS.map((entry) => [entry.name, entry.clipId]),
) as Record<RunDirection, string>;

export function directionForHeading(
  heading: THREE.Vector3,
  camera: THREE.Camera,
  position: THREE.Vector3,
): RunDirection {
  const toCamera = Math.atan2(
    camera.position.x - position.x,
    camera.position.z - position.z,
  );
  const headingAngle = Math.atan2(heading.x, heading.z);
  let relative = headingAngle - toCamera;
  while (relative > Math.PI) relative -= Math.PI * 2;
  while (relative <= -Math.PI) relative += Math.PI * 2;
  const index =
    ((Math.round(relative / (Math.PI / 4)) % 8) + 8) % 8;
  return RUN_DIRECTIONS[index].name;
}

function angularDistance(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

export function directionForHeadingWithHysteresis(
  heading: THREE.Vector3,
  camera: THREE.Camera,
  position: THREE.Vector3,
  current: RunDirection,
): RunDirection {
  const nearest = directionForHeading(heading, camera, position);
  if (nearest === current) return current;
  const toCamera = Math.atan2(
    camera.position.x - position.x,
    camera.position.z - position.z,
  );
  const headingAngle = Math.atan2(heading.x, heading.z);
  let relative = headingAngle - toCamera;
  while (relative > Math.PI) relative -= Math.PI * 2;
  while (relative <= -Math.PI) relative += Math.PI * 2;
  const currentIndex = RUN_DIRECTIONS.findIndex((entry) => entry.name === current);
  let centre = currentIndex * (Math.PI / 4);
  if (centre > Math.PI) centre -= Math.PI * 2;
  const boundary = Math.PI / 8;
  const hysteresis = (10 * Math.PI) / 180;
  if (angularDistance(relative, centre) <= boundary + hysteresis) return current;
  return nearest;
}

export type RunnerClipTextures = {
  attack: THREE.Texture[];
  defeat: THREE.Texture[];
  run: THREE.Texture[];
  runDirections: Partial<Record<RunDirection, THREE.Texture[]>>;
  runStartPhase01?: number;
};

// Geometry for a clip whose ground line must sit at the group origin.
// The plane is scaled so the standing figure is spec height tall, then
// translated so the manifest pivot, not the plane bottom, is at zero.
// Flight frames therefore sit above the ground and contact frames touch it.
function clipGeometry(
  clipId: string,
  worldHeight: number,
  groundY: number,
  topY: number,
): THREE.PlaneGeometry {
  const first = manifest.assets[manifest.clips[clipId].assetIds[0]];
  const scale = worldHeight / (groundY - topY);
  const planeH = first.size[1] * scale;
  const planeW = first.size[0] * scale;
  const geometry = new THREE.PlaneGeometry(planeW, planeH);
  geometry.translate(0, (first.pivot[1] - 0.5) * planeH, 0);
  return geometry;
}

export class Runner {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  speedScale = 1;
  state: EnemyState = "spawn";
  stateTimeMs = 0;
  health: number;
  footstepCount = 0;
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly shadowGeometry: THREE.CircleGeometry;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly spec: EnemySpec;
  private route: THREE.Vector3[] = [];
  private routeTarget: THREE.Vector3 | null = null;
  private routeStallMs = 0;
  private routeDistance = Infinity;
  private runMesh: THREE.Mesh | null = null;
  private runGeometries = new Map<RunDirection, THREE.PlaneGeometry>();
  private runMaterial: THREE.MeshBasicMaterial | null = null;
  private attackMesh: THREE.Mesh | null = null;
  private attackGeometry: THREE.PlaneGeometry | null = null;
  private attackMaterial: THREE.MeshBasicMaterial | null = null;
  private defeatMesh: THREE.Mesh | null = null;
  private defeatGeometry: THREE.PlaneGeometry | null = null;
  private defeatMaterial: THREE.MeshBasicMaterial | null = null;
  private runPlayer: AnimationPlayer | null = null;
  private attackPlayer: AnimationPlayer | null = null;
  private defeatPlayer: AnimationPlayer | null = null;
  private runTimeMs = 0;
  private gaitRate = 1;
  private heading = new THREE.Vector3(0, 0, 1);
  private direction: RunDirection = "front";
  private directionOverride: RunDirection | null = null;
  private spawnRing: THREE.Mesh | null = null;
  private spawnRingMaterial: THREE.MeshBasicMaterial | null = null;
  private spawnRingGeometry: THREE.RingGeometry | null = null;

  constructor(
    texture: THREE.Texture,
    spawn: THREE.Vector3,
    spec: EnemySpec,
    clips?: RunnerClipTextures,
  ) {
    this.spec = spec;
    this.health = spec.health;
    this.position = spawn.clone();
    const width = spec.height;
    this.geometry = new THREE.PlaneGeometry(width, spec.height);
    this.geometry.translate(0, spec.height / 2, 0);
    this.material = new THREE.MeshBasicMaterial({
      alphaTest: 0.08,
      map: texture,
      side: THREE.FrontSide,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.group.add(this.mesh);
    this.shadowGeometry = new THREE.CircleGeometry(0.55, 24);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a140f,
      depthWrite: false,
      opacity: 0.35,
      transparent: true,
    });
    this.shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);
    this.group.position.copy(this.position);
    this.spawnRingGeometry = new THREE.RingGeometry(0.45, 0.62, 32);
    this.spawnRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b2118,
      depthWrite: false,
      opacity: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.spawnRing = new THREE.Mesh(this.spawnRingGeometry, this.spawnRingMaterial);
    this.spawnRing.rotation.x = -Math.PI / 2;
    this.spawnRing.position.y = 0.03;
    this.spawnRing.visible = true;
    this.group.add(this.spawnRing);
    if (clips && clips.run.length > 0 && clips.attack.length > 0) {
      for (const entry of RUN_DIRECTIONS) {
        const textures = clips.runDirections[entry.name];
        if (textures && textures.length > 0) {
          this.runGeometries.set(
            entry.name,
            clipGeometry(entry.clipId, spec.height, manifestGroundY(entry.clipId), entry.topY),
          );
        }
      }
      this.runMaterial = new THREE.MeshBasicMaterial({
        alphaTest: 0.08,
        map: clips.run[0],
        side: THREE.FrontSide,
        transparent: false,
      });
      this.runMesh = new THREE.Mesh(
        this.runGeometries.get("front") ?? this.geometry,
        this.runMaterial,
      );
      this.runMesh.visible = false;
      this.group.add(this.runMesh);
      this.attackGeometry = clipGeometry(spec.attackClip, spec.height, manifestGroundY(spec.attackClip), 31);
      this.attackMaterial = new THREE.MeshBasicMaterial({
        alphaTest: 0.08,
        map: clips.attack[0],
        side: THREE.FrontSide,
        transparent: false,
      });
      this.attackMesh = new THREE.Mesh(this.attackGeometry, this.attackMaterial);
      this.attackMesh.visible = false;
      this.group.add(this.attackMesh);
      if (clips.defeat.length > 0) {
        this.defeatGeometry = clipGeometry(spec.defeatClip, spec.height, manifestGroundY(spec.defeatClip), 144);
        this.defeatMaterial = new THREE.MeshBasicMaterial({
          alphaTest: 0.08,
          map: clips.defeat[0],
          side: THREE.FrontSide,
          transparent: false,
        });
        this.defeatMesh = new THREE.Mesh(this.defeatGeometry, this.defeatMaterial);
        this.defeatMesh.visible = false;
        this.group.add(this.defeatMesh);
        this.defeatPlayer = new AnimationPlayer(
          clipFromManifest(manifest.clips[spec.defeatClip]),
        );
      }
      this.runPlayer = new AnimationPlayer(
        clipFromManifest(manifest.clips[spec.runClip]),
      );
      this.runPlayer.play((clips.runStartPhase01 ?? 0) * this.runPlayer.totalMs);
      this.runTimeMs = this.runPlayer.timeMs;
      this.attackPlayer = new AnimationPlayer(
        clipFromManifest(manifest.clips[spec.attackClip]),
      );
      this.runTextures = clips.runDirections;
      this.attackTextures = clips.attack;
      this.defeatTextures = clips.defeat;
    }
  }

  private runTextures: Partial<Record<RunDirection, THREE.Texture[]>> = {};
  private attackTextures: THREE.Texture[] = [];
  private defeatTextures: THREE.Texture[] = [];

  get finished(): boolean {
    if (this.state !== "death") return false;
    return this.defeatPlayer ? this.defeatPlayer.finished : this.stateTimeMs >= 800;
  }

  get runDirection(): RunDirection {
    return this.direction;
  }

  get visibleMeshKind(): string {
    if (this.runMesh?.visible) return "run";
    if (this.attackMesh?.visible) return "attack";
    if (this.defeatMesh?.visible) return "defeat";
    return "idle";
  }

  get runMeshScale(): number {
    return this.runMesh ? this.runMesh.scale.x : this.mesh.scale.x;
  }

  get runClipId(): string {
    return RUN_DIRECTION_CLIPS[this.direction];
  }

  get defeatFrameIndex(): number {
    return this.defeatPlayer?.frameIndex ?? 0;
  }

  get spawnCueVisible(): boolean {
    return this.spawnRing?.visible ?? false;
  }

  setDirectionOverride(direction: RunDirection | null): void {
    this.directionOverride = direction;
    if (direction) this.applyDirection(direction);
  }

  private applyDirection(direction: RunDirection): void {
    this.direction = direction;
    const geometry = this.runGeometries.get(direction);
    if (this.runMesh && geometry) this.runMesh.geometry = geometry;
    this.syncRunTexture();
  }

  private updateDirection(camera: THREE.Camera): void {
    const next =
      this.directionOverride ??
      directionForHeadingWithHysteresis(this.heading, camera, this.position, this.direction);
    if (next !== this.direction) this.applyDirection(next);
  }

  private attackUsesFrontArt(): boolean {
    return this.direction === "front";
  }

  private attackMeshKind(): "attack" | "run" {
    return this.attackUsesFrontArt() ? "attack" : "run";
  }

  get runFrameIndex(): number {
    return this.runPlayer?.frameIndex ?? 0;
  }

  get attackFrameIndex(): number {
    return this.attackPlayer?.frameIndex ?? 0;
  }

  get runPhase01(): number {
    return this.runPlayer?.progress01 ?? 0;
  }

  setRunPhase01(fraction: number): void {
    if (!this.runPlayer) return;
    this.runPlayer.play(fraction * this.runPlayer.totalMs);
    this.runTimeMs = this.runPlayer.timeMs;
    this.syncRunTexture();
  }

  advanceRunAnimation(dtMs: number): void {
    if (!this.runPlayer || !this.runMesh) return;
    this.runPlayer.update(dtMs, 1);
    this.runTimeMs = this.runPlayer.timeMs;
    this.syncRunTexture();
    this.mesh.visible = false;
    this.runMesh.visible = true;
    if (this.attackMesh) this.attackMesh.visible = false;
  }

  private syncRunTexture(): void {
    if (!this.runMaterial || !this.runPlayer) return;
    const textures = this.runTextures[this.direction] ?? this.runTextures.front ?? [];
    const next = textures[this.runPlayer.frameIndex];
    if (next && this.runMaterial.map !== next) {
      this.runMaterial.map = next;
      this.runMaterial.needsUpdate = true;
    }
  }

  private syncDefeatTexture(): void {
    if (!this.defeatMaterial || this.defeatTextures.length === 0 || !this.defeatPlayer) {
      return;
    }
    const next = this.defeatTextures[this.defeatPlayer.frameIndex];
    if (next && this.defeatMaterial.map !== next) {
      this.defeatMaterial.map = next;
      this.defeatMaterial.needsUpdate = true;
    }
  }

  private syncAttackTexture(): void {
    if (!this.attackMaterial || this.attackTextures.length === 0 || !this.attackPlayer) {
      return;
    }
    const next = this.attackTextures[this.attackPlayer.frameIndex];
    if (this.attackMaterial.map !== next) {
      this.attackMaterial.map = next;
      this.attackMaterial.needsUpdate = true;
    }
  }

  private showMesh(kind: "idle" | "run" | "attack" | "defeat"): void {
    this.mesh.visible = kind === "idle" || (!this.runMesh && kind !== "defeat");
    if (this.runMesh) this.runMesh.visible = kind === "run";
    if (this.attackMesh) this.attackMesh.visible = kind === "attack";
    if (this.defeatMesh) this.defeatMesh.visible = kind === "defeat";
    if (kind === "run" && !this.runMesh) this.mesh.visible = true;
    if (kind === "attack" && !this.attackMesh) this.mesh.visible = true;
    if (kind === "defeat" && !this.defeatMesh) this.mesh.visible = true;
  }

  private resetVisuals(): void {
    this.material.color.setHex(0xffffff);
    this.mesh.scale.setScalar(1);
    this.material.transparent = false;
    this.material.opacity = 1;
    if (this.runMaterial) {
      this.runMaterial.color.setHex(0xffffff);
      this.runMaterial.opacity = 1;
      this.runMaterial.transparent = false;
    }
    if (this.runMesh) this.runMesh.scale.setScalar(1);
    if (this.attackMaterial) {
      this.attackMaterial.color.setHex(0xffffff);
      this.attackMaterial.opacity = 1;
      this.attackMaterial.transparent = false;
    }
    if (this.attackMesh) this.attackMesh.scale.setScalar(1);
    if (this.defeatMaterial) {
      this.defeatMaterial.color.setHex(0xffffff);
      this.defeatMaterial.opacity = 1;
      this.defeatMaterial.transparent = false;
    }
    if (this.defeatMesh) this.defeatMesh.scale.setScalar(1);
    this.shadowMaterial.opacity = 0.35;
  }

  private setState(next: EnemyState): void {
    if (this.state === "pursue" && this.runPlayer) {
      this.runTimeMs = this.runPlayer.timeMs;
    }
    this.resetVisuals();
    this.state = next;
    this.stateTimeMs = 0;
    if (this.spawnRing) this.spawnRing.visible = next === "spawn";
    if (next === "death" && this.defeatPlayer) {
      this.defeatPlayer.play(0);
      this.syncDefeatTexture();
    }
    if (next === "pursue" && this.runPlayer) {
      this.runPlayer.play(this.runTimeMs);
      this.syncRunTexture();
    }
    if (next === "attack" && this.attackPlayer) {
      this.attackPlayer.play(0);
      this.syncAttackTexture();
    }
    this.showMesh(
      next === "pursue" || next === "hit"
        ? "run"
        : next === "telegraph" || next === "attack"
          ? this.attackMeshKind()
          : next === "death"
            ? "defeat"
            : "idle",
    );
  }

  takeDamage(amount: number, from: THREE.Vector3): DamageResult {
    if (this.state === "spawn") return "invulnerable";
    if (this.state === "death") return "dead";
    this.health -= amount;
    if (this.health <= 0) {
      this.setState("death");
      return "killed";
    }
    const away = this.position.clone().sub(from);
    away.y = 0;
    if (away.lengthSq() > 0) {
      away.normalize().multiplyScalar(0.8);
      this.position.add(away);
      resolveCircle(this.position, this.spec.radius);
    }
    this.setState("hit");
    return "applied";
  }

  private replanIfNeeded(target: THREE.Vector3): void {
    const moved = !this.routeTarget || this.routeTarget.distanceTo(target) > 0.75;
    const stalled = this.routeStallMs >= 1000;
    if (this.route.length === 0 || moved || stalled) {
      this.route = findRoute(this.position, target, this.spec.radius);
      this.routeTarget = target.clone();
      this.routeStallMs = 0;
      this.routeDistance = this.position.distanceTo(target);
    }
  }

  update(
    dt: number,
    camera: THREE.Camera,
    player: PlayerBody,
    onPlayerDamage: (amount: number, source?: THREE.Vector3) => void,
    neighbors: Runner[] = [],
    options: { canAttack?: boolean } = {},
  ): void {
    const dtMs = dt * 1000;
    const previousTime = this.stateTimeMs;
    this.stateTimeMs += dtMs;
    const playerFeet = player.feet;
    const toPlayer = playerFeet.clone().sub(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const verticalOverlap = intervalsOverlap(
      this.position.y,
      this.position.y + this.spec.height,
      playerFeet.y,
      playerFeet.y + player.height,
    );

    if (this.state === "spawn") {
      const t = Math.min(1, this.stateTimeMs / 500);
      this.mesh.scale.setScalar(0.7 + 0.3 * t);
      if (this.spawnRing && this.spawnRingMaterial) {
        this.spawnRing.scale.setScalar(0.3 + 1.0 * t);
        this.spawnRingMaterial.opacity = 0.9 * (1 - t);
      }
      if (this.stateTimeMs >= 500) this.setState("pursue");
    } else if (this.state === "pursue") {
      this.showMesh("run");
      this.replanIfNeeded(playerFeet);
      const waypoint = this.route[0];
      if (waypoint && this.position.distanceTo(waypoint) < 0.4) {
        this.route.shift();
      }
      const target = this.route[0] ?? playerFeet;
      const dir = target.clone().sub(this.position);
      dir.y = 0;
      const before = this.position.clone();
      if (dir.lengthSq() > 0) {
        dir.normalize();
        this.heading.copy(dir);
        this.updateDirection(camera);
        this.position.addScaledVector(dir, this.spec.speed * this.speedScale * dt);
        resolveCircle(this.position, this.spec.radius);
      }
      for (const other of neighbors) {
        if (other === this || other.state === "death") continue;
        const push = this.position.clone().sub(other.position);
        push.y = 0;
        const gap = push.length();
        const minGap = this.spec.radius + other.spec.radius;
        if (gap > 0 && gap < minGap) {
          push.normalize().multiplyScalar((minGap - gap) * 0.5);
          this.position.add(push);
          resolveCircle(this.position, this.spec.radius);
        }
      }
      const actualSpeed = dt > 0 ? this.position.distanceTo(before) / dt : 0;
      this.gaitRate = Math.max(
        0,
        Math.min(1.5, actualSpeed / (this.spec.speed * this.speedScale)),
      );
      if (this.runPlayer) {
        const events = this.runPlayer.update(dtMs, this.gaitRate);
        this.footstepCount += events.filter((name) => name === "footstep").length;
        this.runTimeMs = this.runPlayer.timeMs;
        this.syncRunTexture();
      }
      const nowDistance = this.position.distanceTo(playerFeet);
      if (nowDistance < this.routeDistance - 0.05) {
        this.routeDistance = nowDistance;
        this.routeStallMs = 0;
      } else {
        this.routeStallMs += dtMs;
      }
      const blocker = segmentBlockedByCrate(this.position, playerFeet);
      if (distance <= this.spec.attackRange && !blocker && verticalOverlap) {
        this.setState("telegraph");
      }
    } else if (this.state === "telegraph") {
      this.showMesh(this.attackMeshKind());
      const pulse = 1 + 0.08 * Math.sin(this.stateTimeMs / 60);
      if (this.attackUsesFrontArt() && this.attackMesh) {
        this.attackMesh.scale.setScalar(pulse);
      } else if (this.runMesh) {
        this.runMesh.scale.setScalar(pulse);
      } else {
        this.mesh.scale.setScalar(pulse);
      }
      const tintMaterial =
        this.attackUsesFrontArt() && this.attackMaterial
          ? this.attackMaterial
          : this.runMaterial ?? this.material;
      tintMaterial.color.setHex(0xffd9c2);
      if (this.attackPlayer) {
        this.attackPlayer.play(0);
        if (this.attackUsesFrontArt()) this.syncAttackTexture();
      }
      if (this.stateTimeMs >= 400) {
        if (options.canAttack !== false) this.setState("attack");
      }
    } else if (this.state === "attack") {
      this.showMesh(this.attackMeshKind());
      if (this.attackPlayer) {
        const events = this.attackPlayer.update(dtMs, 1);
        if (this.attackUsesFrontArt()) this.syncAttackTexture();
        if (events.includes("strike")) {
          const enemyChest = this.position.clone();
          enemyChest.y = 1;
          const playerCenter = playerFeet.clone();
          playerCenter.y = playerFeet.y + player.height / 2;
          const toCenter = playerCenter.clone().sub(enemyChest);
          const reach = toCenter.length();
          const solid = rayHitSolid(enemyChest, toCenter.normalize(), reach);
          if (distance <= this.spec.attackRange + 0.4 && verticalOverlap && !solid) {
            onPlayerDamage(this.spec.attackDamage, this.position);
          }
        }
        if (this.attackPlayer.finished) this.setState("pursue");
      } else {
        if (previousTime < 100 && this.stateTimeMs >= 100) {
          const enemyChest = this.position.clone();
          enemyChest.y = 1;
          const playerCenter = playerFeet.clone();
          playerCenter.y = playerFeet.y + player.height / 2;
          const toCenter = playerCenter.clone().sub(enemyChest);
          const reach = toCenter.length();
          const solid = rayHitSolid(enemyChest, toCenter.normalize(), reach);
          if (distance <= this.spec.attackRange + 0.4 && verticalOverlap && !solid) {
            onPlayerDamage(this.spec.attackDamage, this.position);
          }
        }
        if (this.stateTimeMs >= 280) this.setState("pursue");
      }
    } else if (this.state === "hit") {
      this.showMesh("run");
      const tintMaterial = this.runMaterial ?? this.material;
      tintMaterial.color.setHex(0xff6a4d);
      if (this.stateTimeMs >= 250) {
        this.setState("pursue");
      }
    } else if (this.state === "death") {
      this.showMesh("defeat");
      if (this.defeatPlayer) {
        this.defeatPlayer.update(dtMs, 1);
        this.syncDefeatTexture();
      } else {
        const t = Math.min(1, this.stateTimeMs / 800);
        this.material.opacity = 1 - t;
        this.mesh.scale.setScalar(1 - 0.3 * t);
        this.shadowMaterial.opacity = 0.35 * (1 - t);
      }
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = Math.atan2(
      camera.position.x - this.position.x,
      camera.position.z - this.position.z,
    );
    this.shadow.scale.setScalar(1);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    for (const geometry of this.runGeometries.values()) geometry.dispose();
    this.runMaterial?.dispose();
    this.attackGeometry?.dispose();
    this.attackMaterial?.dispose();
    this.defeatGeometry?.dispose();
    this.defeatMaterial?.dispose();
    this.spawnRingGeometry?.dispose();
    this.spawnRingMaterial?.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
  }
}
