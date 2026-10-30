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

export type RunnerClipTextures = {
  attack: THREE.Texture[];
  run: THREE.Texture[];
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
  private runGeometry: THREE.PlaneGeometry | null = null;
  private runMaterial: THREE.MeshBasicMaterial | null = null;
  private attackMesh: THREE.Mesh | null = null;
  private attackGeometry: THREE.PlaneGeometry | null = null;
  private attackMaterial: THREE.MeshBasicMaterial | null = null;
  private runPlayer: AnimationPlayer | null = null;
  private attackPlayer: AnimationPlayer | null = null;
  private runTimeMs = 0;
  private gaitRate = 1;

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
    if (clips && clips.run.length > 0 && clips.attack.length > 0) {
      this.runGeometry = clipGeometry(spec.runClip, spec.height, 832, 103);
      this.runMaterial = new THREE.MeshBasicMaterial({
        alphaTest: 0.08,
        map: clips.run[0],
        side: THREE.FrontSide,
        transparent: false,
      });
      this.runMesh = new THREE.Mesh(this.runGeometry, this.runMaterial);
      this.runMesh.visible = false;
      this.group.add(this.runMesh);
      this.attackGeometry = clipGeometry(spec.attackClip, spec.height, 885, 31);
      this.attackMaterial = new THREE.MeshBasicMaterial({
        alphaTest: 0.08,
        map: clips.attack[0],
        side: THREE.FrontSide,
        transparent: false,
      });
      this.attackMesh = new THREE.Mesh(this.attackGeometry, this.attackMaterial);
      this.attackMesh.visible = false;
      this.group.add(this.attackMesh);
      this.runPlayer = new AnimationPlayer(
        clipFromManifest(manifest.clips[spec.runClip]),
      );
      this.runPlayer.play((clips.runStartPhase01 ?? 0) * this.runPlayer.totalMs);
      this.runTimeMs = this.runPlayer.timeMs;
      this.attackPlayer = new AnimationPlayer(
        clipFromManifest(manifest.clips[spec.attackClip]),
      );
      this.runTextures = clips.run;
      this.attackTextures = clips.attack;
    }
  }

  private runTextures: THREE.Texture[] = [];
  private attackTextures: THREE.Texture[] = [];

  get finished(): boolean {
    return this.state === "death" && this.stateTimeMs >= 800;
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
    if (!this.runMaterial || this.runTextures.length === 0 || !this.runPlayer) return;
    const next = this.runTextures[this.runPlayer.frameIndex];
    if (this.runMaterial.map !== next) {
      this.runMaterial.map = next;
      this.runMaterial.needsUpdate = true;
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

  private showMesh(kind: "idle" | "run" | "attack"): void {
    this.mesh.visible = kind === "idle" || !this.runMesh;
    if (this.runMesh) this.runMesh.visible = kind === "run";
    if (this.attackMesh) this.attackMesh.visible = kind === "attack";
    if (kind === "run" && !this.runMesh) this.mesh.visible = true;
    if (kind === "attack" && !this.attackMesh) this.mesh.visible = true;
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
    this.shadowMaterial.opacity = 0.35;
  }

  private setState(next: EnemyState): void {
    if (this.state === "pursue" && this.runPlayer) {
      this.runTimeMs = this.runPlayer.timeMs;
    }
    this.resetVisuals();
    this.state = next;
    this.stateTimeMs = 0;
    if (next === "death") this.material.transparent = true;
    if (next === "pursue" && this.runPlayer) {
      this.runPlayer.play(this.runTimeMs);
      this.syncRunTexture();
    }
    if (next === "attack" && this.attackPlayer) {
      this.attackPlayer.play(0);
      this.syncAttackTexture();
    }
    this.showMesh(
      next === "pursue" ? "run" : next === "telegraph" || next === "attack" ? "attack" : "idle",
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
    onPlayerDamage: (amount: number) => void,
    neighbors: Runner[] = [],
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
      this.showMesh("attack");
      const pulse = 1 + 0.08 * Math.sin(this.stateTimeMs / 60);
      if (this.attackMesh) this.attackMesh.scale.setScalar(pulse);
      else this.mesh.scale.setScalar(pulse);
      const tintMaterial = this.attackMaterial ?? this.material;
      tintMaterial.color.setHex(0xffd9c2);
      if (this.attackPlayer) {
        this.attackPlayer.play(0);
        this.syncAttackTexture();
      }
      if (this.stateTimeMs >= 400) {
        this.setState("attack");
      }
    } else if (this.state === "attack") {
      this.showMesh("attack");
      if (this.attackPlayer) {
        const events = this.attackPlayer.update(dtMs, 1);
        this.syncAttackTexture();
        if (events.includes("strike")) {
          const enemyChest = this.position.clone();
          enemyChest.y = 1;
          const playerCenter = playerFeet.clone();
          playerCenter.y = playerFeet.y + player.height / 2;
          const toCenter = playerCenter.clone().sub(enemyChest);
          const reach = toCenter.length();
          const solid = rayHitSolid(enemyChest, toCenter.normalize(), reach);
          if (distance <= this.spec.attackRange + 0.4 && verticalOverlap && !solid) {
            onPlayerDamage(this.spec.attackDamage);
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
            onPlayerDamage(this.spec.attackDamage);
          }
        }
        if (this.stateTimeMs >= 280) this.setState("pursue");
      }
    } else if (this.state === "hit") {
      this.showMesh("idle");
      this.material.color.setHex(0xff6a4d);
      if (this.stateTimeMs >= 250) {
        this.setState("pursue");
      }
    } else if (this.state === "death") {
      this.showMesh("idle");
      const t = Math.min(1, this.stateTimeMs / 800);
      this.material.opacity = 1 - t;
      this.mesh.scale.setScalar(1 - 0.3 * t);
      this.shadowMaterial.opacity = 0.35 * (1 - t);
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
    this.runGeometry?.dispose();
    this.runMaterial?.dispose();
    this.attackGeometry?.dispose();
    this.attackMaterial?.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
  }
}
