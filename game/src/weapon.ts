import * as THREE from "three";
import { asset, manifest } from "./assets";

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  ammo: number;
  reloadTimeMs = 0;
  private readonly weapon: THREE.Mesh;
  private readonly flash: THREE.Mesh;
  private readonly muzzleNode: THREE.Object3D;
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
    const trimmedWidth = entry.rect[2];
    const trimmedHeight = entry.rect[3];
    const width = height * (trimmedWidth / trimmedHeight);
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
    const muzzleTrimmedX = muzzle[0] * entry.sourceSize[0] - entry.trimOffset[0];
    const muzzleTrimmedY = muzzle[1] * entry.sourceSize[1] - entry.trimOffset[1];
    this.muzzleNode = new THREE.Object3D();
    this.muzzleNode.position.set(
      (muzzleTrimmedX / trimmedWidth - 0.5) * width,
      (1 - muzzleTrimmedY / trimmedHeight) * height,
      0,
    );
    this.weapon.add(this.muzzleNode);
    const flashSize = 0.62;
    const flashGeo = new THREE.PlaneGeometry(flashSize, flashSize);
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
    this.muzzleNode.add(this.flash);
  }

  get reloading(): boolean {
    return this.reloadTimeMs > 0;
  }

  get muzzlePosition(): THREE.Vector2 {
    this.weapon.updateWorldMatrix(true, false);
    const world = new THREE.Vector3();
    this.muzzleNode.getWorldPosition(world);
    return new THREE.Vector2(world.x, world.y);
  }

  resize(aspect: number): void {
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
  }

  reset(): void {
    this.ammo = manifest.weapons.shotgun.ammo;
    this.reloadTimeMs = 0;
    this.recoil = 0;
    this.recoilVelocity = 0;
    this.flashTimeMs = 0;
    this.flash.visible = false;
    this.swayX = 0;
    this.swayY = 0;
    this.bobTime = 0;
    this.update(0, false, { x: 0, y: 0 });
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
    const flashScale = 1 + this.recoil * 0.1;
    this.flash.scale.setScalar(flashScale);
  }
}
