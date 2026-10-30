import * as THREE from "three";
import { asset, manifest } from "./assets";

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  ammo: number;
  reloadTimeMs = 0;
  private readonly weapon: THREE.Mesh;
  private readonly flash: THREE.Mesh;
  private readonly muzzleLocal: THREE.Vector2;
  private recoil = 0;
  private recoilVelocity = 0;
  private flashTimeMs = 0;
  private swayX = 0;
  private swayY = 0;
  private bobTime = 0;

  constructor(
    shotgunTexture: THREE.Texture,
    flashTexture: THREE.Texture,
    aspect: number,
  ) {
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.camera.position.z = 5;
    this.ammo = manifest.weapons.shotgun.ammo;
    const entry = asset("shotgun_idle");
    const muzzle = entry.attachments?.muzzle ?? [0.5, 0.5];
    const height = 1.15;
    const width = height * (entry.size[0] / entry.size[1]);
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    this.weapon = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        depthTest: false,
        map: shotgunTexture,
        transparent: true,
      }),
    );
    this.weapon.renderOrder = 10;
    this.scene.add(this.weapon);
    this.muzzleLocal = new THREE.Vector2(
      (muzzle[0] - entry.pivot[0]) * width,
      (1 - muzzle[1] - (1 - entry.pivot[1])) * height,
    );
    const flashSize = 0.62;
    const flashGeo = new THREE.PlaneGeometry(flashSize, flashSize);
    flashGeo.translate(0, 0, 0);
    this.flash = new THREE.Mesh(
      flashGeo,
      new THREE.MeshBasicMaterial({
        depthTest: false,
        map: flashTexture,
        transparent: true,
      }),
    );
    this.flash.renderOrder = 11;
    this.flash.visible = false;
    this.scene.add(this.flash);
  }

  get reloading(): boolean {
    return this.reloadTimeMs > 0;
  }

  get muzzlePosition(): THREE.Vector2 {
    return new THREE.Vector2(
      this.weapon.position.x + this.muzzleLocal.x,
      this.weapon.position.y + this.muzzleLocal.y,
    );
  }

  resize(aspect: number): void {
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
  }

  triggerFlash(): void {
    this.flashTimeMs = 60;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.recoilVelocity += 9;
  }

  startReload(): boolean {
    if (this.reloading || this.ammo === manifest.weapons.shotgun.ammo) return false;
    this.reloadTimeMs = 1400;
    return true;
  }

  update(dt: number, moving: boolean, mouseDelta: { x: number; y: number }): void {
    const springK = 90;
    const damping = 14;
    this.recoilVelocity += (-springK * this.recoil - damping * this.recoilVelocity) * dt;
    this.recoil += this.recoilVelocity * dt;
    if (this.flashTimeMs > 0) {
      this.flashTimeMs -= dt * 1000;
      if (this.flashTimeMs <= 0) this.flash.visible = false;
    }
    if (this.reloadTimeMs > 0) {
      this.reloadTimeMs -= dt * 1000;
      if (this.reloadTimeMs <= 0) {
        this.reloadTimeMs = 0;
        this.ammo = manifest.weapons.shotgun.ammo;
      }
    }
    this.swayX += (-mouseDelta.x * 0.0006 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (mouseDelta.y * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    if (moving) this.bobTime += dt * 9;
    const bob = moving ? Math.sin(this.bobTime) * 0.02 : 0;
    const reloadDip = this.reloading ? 0.25 * Math.sin((this.reloadTimeMs / 1400) * Math.PI) : 0;
    this.weapon.position.set(
      0.45 + this.swayX,
      -0.78 - this.recoil * 0.06 - reloadDip + bob,
      0,
    );
    this.weapon.rotation.z = -this.recoil * 0.06 + this.swayX * 0.4;
    const muzzle = this.muzzlePosition;
    this.flash.position.set(muzzle.x, muzzle.y, 0);
    const flashScale = 1 + this.recoil * 0.1;
    this.flash.scale.setScalar(flashScale);
  }
}
