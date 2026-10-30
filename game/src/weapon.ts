import * as THREE from "three";
import { asset, manifest } from "./assets";
import { AnimationPlayer, clipFromManifest } from "./animation";

export type WeaponUpdate = {
  grounded: boolean;
  horizontalSpeed: number;
  mouseDelta: { x: number; y: number };
  moving: boolean;
  sprinting: boolean;
};

export type WeaponTextures = {
  fire: THREE.Texture[];
  flash: THREE.Texture[];
  idle: THREE.Texture;
};

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  ammo: number;
  reloadTimeMs = 0;
  sprintScale = 1;
  private readonly weapon: THREE.Mesh;
  private readonly fireWeapon: THREE.Mesh;
  private readonly flash: THREE.Mesh;
  private readonly muzzleNode: THREE.Object3D;
  private readonly fireMuzzleNode: THREE.Object3D;
  private recoil = 0;
  private recoilVelocity = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private firePlayer: AnimationPlayer;
  private flashPlayer: AnimationPlayer;
  private fireActive = false;
  private flashActive = false;
  private flashHold = false;
  private reducedMotion = false;

  constructor(textures: WeaponTextures, aspect: number) {
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.camera.position.z = 5;
    this.ammo = manifest.weapons.shotgun.ammo;
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const idleEntry = asset("shotgun_idle");
    const idleMuzzle = idleEntry.attachments?.muzzle ?? [0.5, 0.5];
    const idleHeight = 1.15;
    const idleWidth = idleHeight * (idleEntry.rect[2] / idleEntry.rect[3]);
    const idleGeometry = new THREE.PlaneGeometry(idleWidth, idleHeight);
    idleGeometry.translate(0, idleHeight / 2, 0);
    this.weapon = new THREE.Mesh(
      idleGeometry,
      new THREE.MeshBasicMaterial({
        depthTest: false,
        map: textures.idle,
        transparent: true,
      }),
    );
    this.weapon.renderOrder = 10;
    this.scene.add(this.weapon);
    this.muzzleNode = new THREE.Object3D();
    this.muzzleNode.position.set(
      ((idleMuzzle[0] * idleEntry.sourceSize[0] - idleEntry.trimOffset[0]) /
        idleEntry.rect[2] -
        0.5) *
        idleWidth,
      (1 -
        (idleMuzzle[1] * idleEntry.sourceSize[1] - idleEntry.trimOffset[1]) /
          idleEntry.rect[3]) *
        idleHeight,
      0,
    );
    this.weapon.add(this.muzzleNode);

    const fireHeight = 1.6;
    const fireWidth = fireHeight * (640 / 912);
    const fireGeometry = new THREE.PlaneGeometry(fireWidth, fireHeight);
    fireGeometry.translate(0, fireHeight / 2, 0);
    this.fireWeapon = new THREE.Mesh(
      fireGeometry,
      new THREE.MeshBasicMaterial({
        depthTest: false,
        map: textures.fire[0],
        transparent: true,
      }),
    );
    this.fireWeapon.renderOrder = 10;
    this.fireWeapon.visible = false;
    this.scene.add(this.fireWeapon);
    this.fireMuzzleNode = new THREE.Object3D();
    this.fireWeapon.add(this.fireMuzzleNode);
    this.fireTextures = textures.fire;
    this.firePlayer = new AnimationPlayer(
      clipFromManifest(manifest.clips[manifest.weapons.shotgun.fireClip]),
    );
    this.flashPlayer = new AnimationPlayer(
      clipFromManifest(manifest.clips[manifest.weapons.shotgun.flashClip]),
    );
    this.flashTextures = textures.flash;

    const flashGeometry = new THREE.PlaneGeometry(0.31, 0.62);
    this.flash = new THREE.Mesh(
      flashGeometry,
      new THREE.MeshBasicMaterial({
        depthTest: false,
        map: textures.flash[0],
        transparent: true,
      }),
    );
    this.flash.renderOrder = 11;
    this.flash.visible = false;
    this.scene.add(this.flash);
  }

  private fireTextures: THREE.Texture[];
  private flashTextures: THREE.Texture[];

  get reloading(): boolean {
    return this.reloadTimeMs > 0;
  }

  get firing(): boolean {
    return this.fireActive;
  }

  get flashOn(): boolean {
    return this.flashActive || this.flashHold;
  }

  get fireFrameIndex(): number {
    return this.firePlayer.frameIndex;
  }

  get flashFrameIndex(): number {
    return this.flashPlayer.frameIndex;
  }

  get muzzlePosition(): THREE.Vector2 {
    const node = this.fireActive ? this.fireMuzzleNode : this.muzzleNode;
    const mesh = this.fireActive ? this.fireWeapon : this.weapon;
    mesh.updateWorldMatrix(true, false);
    const world = new THREE.Vector3();
    node.getWorldPosition(world);
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
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.sprintScale = 1;
    this.fireActive = false;
    this.flashActive = false;
    this.flashHold = false;
    this.firePlayer.stop();
    this.flashPlayer.stop();
    this.fireWeapon.visible = false;
    this.weapon.visible = true;
    this.flash.visible = false;
    this.update(0, {
      grounded: true,
      horizontalSpeed: 0,
      mouseDelta: { x: 0, y: 0 },
      moving: false,
      sprinting: false,
    });
  }

  // Starts the fire and flash clips. Damage itself is applied by the
  // shooter at this same instant, because the clip shot event is at 0 ms,
  // so the visual and the damage share one timeline without a second hit.
  triggerFire(): void {
    if (this.reloading || this.fireActive) return;
    this.fireActive = true;
    this.flashActive = true;
    this.flashHold = false;
    this.firePlayer.play(0);
    this.flashPlayer.play(0);
    this.fireWeapon.visible = true;
    this.weapon.visible = false;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.recoilVelocity += 9;
    this.syncFireFrame();
  }

  triggerFlash(): void {
    this.flashActive = true;
    this.flashPlayer.play(0);
    this.flash.visible = true;
  }

  forceFlashVisible(): void {
    this.flashHold = true;
    this.flash.visible = true;
  }

  startReload(): boolean {
    if (this.reloading || this.ammo === manifest.weapons.shotgun.ammo) return false;
    this.reloadTimeMs = 1400;
    return true;
  }

  private syncFireFrame(): void {
    const frame = this.firePlayer.currentFrame;
    const material = this.fireWeapon.material as THREE.MeshBasicMaterial;
    const next = this.fireTextures[this.firePlayer.frameIndex];
    if (material.map !== next) {
      material.map = next;
      material.needsUpdate = true;
    }
    const muzzle = frame.attachments?.muzzle ?? [0.5, 0.5];
    const width = 1.6 * (640 / 912);
    const height = 1.6;
    this.fireMuzzleNode.position.set(
      (muzzle[0] - 0.5) * width,
      (1 - muzzle[1]) * height,
      0,
    );
  }

  private syncFlashFrame(): void {
    const material = this.flash.material as THREE.MeshBasicMaterial;
    const next = this.flashTextures[this.flashPlayer.frameIndex];
    if (material.map !== next) {
      material.map = next;
      material.needsUpdate = true;
    }
  }

  update(dt: number, opts: WeaponUpdate): void {
    const springK = 90;
    const damping = 14;
    this.recoilVelocity += (-springK * this.recoil - damping * this.recoilVelocity) * dt;
    this.recoil += this.recoilVelocity * dt;
    if (this.fireActive) {
      this.firePlayer.update(dt * 1000, 1);
      this.syncFireFrame();
      if (this.firePlayer.finished) {
        this.fireActive = false;
        this.fireWeapon.visible = false;
        this.weapon.visible = true;
      }
    }
    if (this.flashActive && !this.flashHold) {
      this.flashPlayer.update(dt * 1000, 1);
      this.syncFlashFrame();
      if (this.flashPlayer.finished) {
        this.flashActive = false;
        this.flash.visible = false;
      }
    }
    if (this.reloadTimeMs > 0) {
      this.reloadTimeMs -= dt * 1000;
      if (this.reloadTimeMs <= 0) {
        this.reloadTimeMs = 0;
        this.ammo = manifest.weapons.shotgun.ammo;
      }
    }
    this.swayX += (-opts.mouseDelta.x * 0.0006 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (opts.mouseDelta.y * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    const acceptedSprint =
      opts.sprinting && opts.horizontalSpeed > 1.0 && !this.reloading;
    const sprintTarget = this.reducedMotion || !acceptedSprint ? 1 : 1.1;
    const blend = Math.min(1, dt / 0.05);
    this.sprintScale += (sprintTarget - this.sprintScale) * blend;
    if (opts.moving && opts.grounded && !this.reducedMotion) {
      this.bobPhase += opts.horizontalSpeed * dt * 2.8;
      this.bobAmp += (0.018 - this.bobAmp) * Math.min(1, dt * 10);
    } else {
      this.bobAmp += (0 - this.bobAmp) * Math.min(1, dt * 10);
    }
    const bob = Math.sin(this.bobPhase) * this.bobAmp;
    const reloadDip = this.reloading ? 0.25 * Math.sin((this.reloadTimeMs / 1400) * Math.PI) : 0;
    const posX = 0.45 + this.swayX;
    const posY = -0.78 - this.recoil * 0.06 - reloadDip + bob;
    const rotation = -this.recoil * 0.06 + this.swayX * 0.4 - (this.sprintScale - 1) * 0.5;
    this.weapon.position.set(posX, posY, 0);
    this.weapon.rotation.z = rotation;
    this.weapon.scale.setScalar(this.sprintScale);
    // The diagonal fire frames sit about 22 degrees steeper than idle, so
    // the fire mesh alone gets that rotation back, pivoted on the grip so
    // the grip stays where the idle grip was. The idle mesh is untouched.
    const fireRotation = rotation + 0.38;
    const fireWidth = 1.6 * (640 / 912);
    const fireHeight = 1.6;
    const gripX = (0.75 - 0.5) * fireWidth;
    const gripY = (1 - 0.77) * fireHeight;
    const s = this.sprintScale;
    const gripWorldX =
      posX + s * (gripX * Math.cos(rotation) - gripY * Math.sin(rotation));
    const gripWorldY =
      posY + s * (gripX * Math.sin(rotation) + gripY * Math.cos(rotation));
    this.fireWeapon.position.set(
      gripWorldX - s * (gripX * Math.cos(fireRotation) - gripY * Math.sin(fireRotation)),
      gripWorldY - s * (gripX * Math.sin(fireRotation) + gripY * Math.cos(fireRotation)),
      0,
    );
    this.fireWeapon.rotation.z = fireRotation;
    this.fireWeapon.scale.setScalar(this.sprintScale);
    if (this.fireActive) this.fireWeapon.visible = true;
    if (this.flash.visible) {
      const muzzle = this.muzzlePosition;
      this.flash.position.set(muzzle.x, muzzle.y, 0);
      this.flash.scale.setScalar(1 + this.recoil * 0.1);
    }
  }
}
