import * as THREE from "three";
import { resolveCircle, segmentBlockedByCrate } from "./arena";
import type { EnemySpec } from "./assets";

export type EnemyState = "spawn" | "pursue" | "telegraph" | "attack" | "hit" | "death";

export class Runner {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  state: EnemyState = "spawn";
  stateTimeMs = 0;
  health: number;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly spec: EnemySpec;
  private waypoint: THREE.Vector3 | null = null;

  constructor(texture: THREE.Texture, spawn: THREE.Vector3, spec: EnemySpec) {
    this.spec = spec;
    this.health = spec.health;
    this.position = spawn.clone();
    const width = spec.height;
    const geometry = new THREE.PlaneGeometry(width, spec.height);
    geometry.translate(0, spec.height / 2, 0);
    this.material = new THREE.MeshBasicMaterial({
      alphaTest: 0.08,
      map: texture,
      side: THREE.FrontSide,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.group.add(this.mesh);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({
        color: 0x1a140f,
        depthWrite: false,
        opacity: 0.35,
        transparent: true,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);
    this.group.position.copy(this.position);
  }

  get finished(): boolean {
    return this.state === "death" && this.stateTimeMs >= 800;
  }

  private setState(next: EnemyState): void {
    this.state = next;
    this.stateTimeMs = 0;
  }

  takeDamage(amount: number, from: THREE.Vector3): void {
    if (this.state === "spawn" || this.state === "death") return;
    this.health -= amount;
    if (this.health <= 0) {
      this.setState("death");
      return;
    }
    const away = this.position.clone().sub(from);
    away.y = 0;
    if (away.lengthSq() > 0) {
      away.normalize().multiplyScalar(0.8);
      this.position.add(away);
      resolveCircle(this.position, this.spec.radius);
    }
    this.setState("hit");
  }

  update(
    dt: number,
    camera: THREE.Camera,
    playerPos: THREE.Vector3,
    onPlayerDamage: (amount: number) => void,
  ): void {
    const dtMs = dt * 1000;
    const previousTime = this.stateTimeMs;
    this.stateTimeMs += dtMs;
    const toPlayer = playerPos.clone().sub(this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();

    if (this.state === "spawn") {
      const t = Math.min(1, this.stateTimeMs / 500);
      this.mesh.scale.setScalar(0.7 + 0.3 * t);
      if (this.stateTimeMs >= 500) this.setState("pursue");
    } else if (this.state === "pursue") {
      let target = playerPos;
      const blocker = segmentBlockedByCrate(this.position, playerPos);
      if (blocker) {
        if (!this.waypoint) {
          const corners = [
            new THREE.Vector3(blocker.x - blocker.half - 1, 0, blocker.z - blocker.half - 1),
            new THREE.Vector3(blocker.x + blocker.half + 1, 0, blocker.z - blocker.half - 1),
            new THREE.Vector3(blocker.x - blocker.half - 1, 0, blocker.z + blocker.half + 1),
            new THREE.Vector3(blocker.x + blocker.half + 1, 0, blocker.z + blocker.half + 1),
          ];
          corners.sort(
            (a, b) =>
              a.distanceToSquared(this.position) - b.distanceToSquared(this.position),
          );
          this.waypoint = corners[0];
        }
        target = this.waypoint;
        if (this.position.distanceTo(this.waypoint) < 0.4) this.waypoint = null;
      } else {
        this.waypoint = null;
      }
      const dir = target.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0) {
        dir.normalize();
        this.position.addScaledVector(dir, this.spec.speed * dt);
        resolveCircle(this.position, this.spec.radius);
      }
      if (distance <= this.spec.attackRange && !blocker) this.setState("telegraph");
    } else if (this.state === "telegraph") {
      const pulse = 1 + 0.08 * Math.sin(this.stateTimeMs / 60);
      this.mesh.scale.setScalar(pulse);
      this.material.color.setHex(0xffd9c2);
      if (this.stateTimeMs >= 500) {
        this.material.color.setHex(0xffffff);
        this.mesh.scale.setScalar(1);
        this.setState("attack");
      }
    } else if (this.state === "attack") {
      if (previousTime < 100 && this.stateTimeMs >= 100) {
        const clear = !segmentBlockedByCrate(this.position, playerPos);
        if (distance <= this.spec.attackRange + 0.4 && clear) {
          onPlayerDamage(this.spec.attackDamage);
        }
      }
      if (this.stateTimeMs >= 280) this.setState("pursue");
    } else if (this.state === "hit") {
      this.material.color.setHex(0xff6a4d);
      if (this.stateTimeMs >= 250) {
        this.material.color.setHex(0xffffff);
        this.setState("pursue");
      }
    } else if (this.state === "death") {
      const t = Math.min(1, this.stateTimeMs / 800);
      this.material.transparent = true;
      this.material.opacity = 1 - t;
      this.mesh.scale.setScalar(1 - 0.3 * t);
      const shadowMaterial = this.shadow.material as THREE.MeshBasicMaterial;
      shadowMaterial.opacity = 0.35 * (1 - t);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = Math.atan2(
      camera.position.x - this.position.x,
      camera.position.z - this.position.z,
    );
    const shadowScale = 1;
    this.shadow.scale.setScalar(shadowScale);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
  }
}
