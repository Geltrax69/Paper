import * as THREE from "three";
import {
  intervalsOverlap,
  rayHitSolid,
  resolveCircle,
  segmentBlockedByCrate,
  type PlayerBody,
} from "./arena";
import type { EnemySpec } from "./assets";
import { findRoute } from "./pathing";

export type EnemyState = "spawn" | "pursue" | "telegraph" | "attack" | "hit" | "death";

// Spawning runners are visible but invulnerable for their spawn period.
// takeDamage reports whether damage actually landed, so the shooter never
// shows hit feedback for a hit that did nothing.
export type DamageResult = "applied" | "killed" | "invulnerable" | "dead";

export class Runner {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  state: EnemyState = "spawn";
  stateTimeMs = 0;
  health: number;
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

  constructor(texture: THREE.Texture, spawn: THREE.Vector3, spec: EnemySpec) {
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
  }

  get finished(): boolean {
    return this.state === "death" && this.stateTimeMs >= 800;
  }

  private resetVisuals(): void {
    this.material.color.setHex(0xffffff);
    this.mesh.scale.setScalar(1);
    this.material.transparent = false;
    this.material.opacity = 1;
    this.shadowMaterial.opacity = 0.35;
  }

  private setState(next: EnemyState): void {
    this.resetVisuals();
    this.state = next;
    this.stateTimeMs = 0;
    if (next === "death") this.material.transparent = true;
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
      this.replanIfNeeded(playerFeet);
      const waypoint = this.route[0];
      if (waypoint && this.position.distanceTo(waypoint) < 0.4) {
        this.route.shift();
      }
      const target = this.route[0] ?? playerFeet;
      const dir = target.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0) {
        dir.normalize();
        this.position.addScaledVector(dir, this.spec.speed * dt);
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
      const pulse = 1 + 0.08 * Math.sin(this.stateTimeMs / 60);
      this.mesh.scale.setScalar(pulse);
      this.material.color.setHex(0xffd9c2);
      if (this.stateTimeMs >= 500) {
        this.setState("attack");
      }
    } else if (this.state === "attack") {
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
    } else if (this.state === "hit") {
      this.material.color.setHex(0xff6a4d);
      if (this.stateTimeMs >= 250) {
        this.setState("pursue");
      }
    } else if (this.state === "death") {
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
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
  }
}
