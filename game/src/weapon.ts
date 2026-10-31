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
  reload: THREE.Texture[];
};

export function proceduralWeaponTexture(kind: "pistol" | "automatic"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for procedural weapon view");
  ctx.clearRect(0, 0, 512, 640);
  const poly = (points: [number, number][], fill: string, width = 9) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  const hatch = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.strokeStyle = "#35234f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  if (kind === "pistol") {
    poly([[290, 640], [470, 640], [430, 430], [320, 450]], "#f3e6c8");
    hatch(330, 640, 410, 480);
    hatch(360, 640, 435, 500);
    hatch(390, 640, 455, 530);
    poly([[116, 102], [351, 237], [319, 293], [84, 158]], "#f3e6c8");
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(96, 128);
    ctx.lineTo(122, 172);
    ctx.stroke();
    ctx.fillStyle = "#24c9d6";
    ctx.beginPath();
    ctx.moveTo(150, 118);
    ctx.lineTo(190, 140);
    ctx.lineTo(178, 162);
    ctx.lineTo(138, 140);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffc928";
    ctx.beginPath();
    ctx.arc(205, 152, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(96, 128);
    ctx.lineTo(110, 154);
    ctx.stroke();
    ctx.strokeStyle = "#35234f";
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i += 1) {
      const t = 260 + i * 18;
      ctx.beginPath();
      ctx.moveTo(t - 12, 205 + i * 10);
      ctx.lineTo(t + 6, 238 + i * 10);
      ctx.stroke();
    }
    poly([[310, 290], [365, 265], [445, 475], [375, 495]], "#f3e6c8");
    hatch(350, 340, 410, 360);
    hatch(365, 390, 425, 410);
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.roundRect(282, 300, 72, 68, 14);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(318, 306);
    ctx.lineTo(318, 344);
    ctx.stroke();
    ctx.fillStyle = "#f3e6c8";
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(330, 268, 82, 96, 12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#35234f";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(338, 296 + i * 20);
      ctx.lineTo(404, 296 + i * 20);
      ctx.stroke();
    }
  } else {
    poly([[170, 640], [330, 640], [300, 380], [220, 400]], "#f3e6c8");
    hatch(210, 640, 270, 430);
    hatch(240, 640, 295, 450);
    poly([[74, 62], [404, 252], [366, 318], [36, 128]], "#f3e6c8");
    poly([[150, 180], [262, 240], [240, 286], [128, 226]], "#35234f", 8);
    ctx.fillStyle = "#24c9d6";
    ctx.beginPath();
    ctx.moveTo(120, 96);
    ctx.lineTo(180, 128);
    ctx.lineTo(168, 150);
    ctx.lineTo(108, 118);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffc928";
    ctx.beginPath();
    ctx.arc(200, 148, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3e6c8";
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(200, 290);
    ctx.quadraticCurveTo(305, 355, 272, 475);
    ctx.lineTo(212, 488);
    ctx.quadraticCurveTo(182, 385, 182, 290);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#35234f";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(200, 330 + i * 32);
      ctx.lineTo(252, 345 + i * 32);
      ctx.stroke();
    }
    poly([[360, 300], [410, 275], [470, 480], [400, 500]], "#f3e6c8");
    ctx.fillStyle = "#f3e6c8";
    ctx.strokeStyle = "#12101b";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(355, 282, 78, 92, 12);
    ctx.fill();
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class WeaponView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  ammo: number;
  ammoMax = 6;
  reloadTimeMs = 0;
  reloadTotalMs = 1400;
  sprintScale = 1;
  private readonly weapon: THREE.Mesh;
  private readonly fireWeapon: THREE.Mesh;
  private readonly reloadWeapon: THREE.Mesh;
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
  private reloadPlayer: AnimationPlayer;
  private reloadTransferred = false;
  private fireActive = false;
  private flashActive = false;
  private flashHold = false;
  private reducedMotion = false;
  private flashStrength = 1;
  private flashScale = 1;
  private genericReload = false;
  private reloadElapsedMs = 0;
  private reloadTransferMs = 675;

  constructor(textures: WeaponTextures, aspect: number) {
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.camera.position.z = 5;
    this.ammo = manifest.weapons.shotgun.ammo;
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const idleEntry = asset("punchy_shotgun_idle");
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
    this.reloadTextures = textures.reload;
    this.reloadPlayer = new AnimationPlayer(
      clipFromManifest(manifest.clips[manifest.weapons.shotgun.reloadClip]),
    );
    const reloadHeight = 1.15;
    const reloadWidth = reloadHeight * (342 / 912);
    const reloadGeometry = new THREE.PlaneGeometry(reloadWidth, reloadHeight);
    reloadGeometry.translate(0, reloadHeight / 2, 0);
    this.reloadWeapon = new THREE.Mesh(
      reloadGeometry,
      new THREE.MeshBasicMaterial({
        depthTest: false,
        map: textures.reload[0],
        transparent: true,
      }),
    );
    this.reloadWeapon.renderOrder = 10;
    this.reloadWeapon.visible = false;
    this.scene.add(this.reloadWeapon);

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
  private reloadTextures: THREE.Texture[];

  get reloading(): boolean {
    return this.reloadTimeMs > 0;
  }

  get firing(): boolean {
    return this.fireActive;
  }

  get reloadFrameIndex(): number {
    return this.reloadPlayer.frameIndex;
  }

  get reloadProgress01(): number {
    if (!this.reloading) return 0;
    return Math.max(0, Math.min(1, 1 - this.reloadTimeMs / this.reloadTotalMs));
  }

  setAmmoMax(value: number): void {
    this.ammoMax = value;
  }

  setFlashScale(value: number): void {
    this.flashScale = value;
  }

  setIdle(
    texture: THREE.Texture,
    muzzle: [number, number],
    width: number,
    height: number,
  ): void {
    const material = this.weapon.material as THREE.MeshBasicMaterial;
    material.map = texture;
    material.needsUpdate = true;
    this.weapon.geometry.dispose();
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    this.weapon.geometry = geometry;
    this.muzzleNode.position.set((muzzle[0] - 0.5) * width, (1 - muzzle[1]) * height, 0);
    this.fireWeapon.visible = false;
    this.reloadWeapon.visible = false;
    this.weapon.visible = true;
  }

  get reloadTransferredFlag(): boolean {
    return this.reloadTransferred;
  }

  get flashOn(): boolean {
    return this.flashActive || this.flashHold;
  }

  get fireFrameIndex(): number {
    return this.firePlayer.frameIndex;
  }

  get recoilValue(): number {
    return this.recoil;
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

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  setFlashStrength(value: number): void {
    this.flashStrength = Math.max(0, Math.min(1, value));
  }

  resize(aspect: number): void {
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
  }

  reset(): void {
    this.ammo = manifest.weapons.shotgun.ammo;
    this.ammoMax = manifest.weapons.shotgun.ammo;
    this.reloadTimeMs = 0;
    this.reloadTotalMs = 1400;
    this.genericReload = false;
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
    this.reloadTransferred = false;
    this.firePlayer.stop();
    this.flashPlayer.stop();
    this.reloadPlayer.stop();
    this.fireWeapon.visible = false;
    this.reloadWeapon.visible = false;
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
    if (!this.reducedMotion) this.recoilVelocity += 9;
    this.syncFireFrame();
  }

  triggerKick(): void {
    if (this.reloading || this.fireActive) return;
    this.flashActive = true;
    this.flashHold = false;
    this.flashPlayer.play(0);
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    if (!this.reducedMotion) this.recoilVelocity += 6;
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
    if (this.reloading || this.ammo === this.ammoMax) return false;
    this.reloadTimeMs = 1400;
    this.reloadTotalMs = 1400;
    this.reloadTransferMs = 675;
    this.reloadElapsedMs = 0;
    this.genericReload = false;
    this.reloadTransferred = false;
    this.reloadPlayer.play(0);
    this.reloadWeapon.visible = true;
    this.weapon.visible = false;
    this.fireWeapon.visible = false;
    return true;
  }

  startReloadGeneric(totalMs: number): boolean {
    if (this.reloading || this.ammo === this.ammoMax) return false;
    this.reloadTimeMs = totalMs;
    this.reloadTotalMs = totalMs;
    this.reloadTransferMs = Math.round(totalMs * 0.6);
    this.reloadElapsedMs = 0;
    this.genericReload = true;
    this.reloadTransferred = false;
    return true;
  }

  cancelReload(): boolean {
    if (!this.reloading) return false;
    this.reloadTimeMs = 0;
    this.genericReload = false;
    this.reloadPlayer.stop();
    this.reloadWeapon.visible = false;
    this.weapon.visible = true;
    this.fireWeapon.visible = false;
    return true;
  }

  private syncReloadFrame(): void {
    const material = this.reloadWeapon.material as THREE.MeshBasicMaterial;
    const next = this.reloadTextures[this.reloadPlayer.frameIndex];
    if (material.map !== next) {
      material.map = next;
      material.needsUpdate = true;
    }
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
    if (this.reducedMotion) {
      this.recoil = 0;
      this.recoilVelocity = 0;
      this.swayX = 0;
      this.swayY = 0;
      this.bobAmp = 0;
    }
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
      this.reloadElapsedMs += dt * 1000;
      if (this.genericReload) {
        if (!this.reloadTransferred && this.reloadElapsedMs >= this.reloadTransferMs) {
          this.ammo = this.ammoMax;
          this.reloadTransferred = true;
        }
        if (this.reloadTimeMs <= 0) {
          this.reloadTimeMs = 0;
          this.genericReload = false;
        }
      } else {
        const events = this.reloadPlayer.update(dt * 1000, 1);
        if (events.includes("ammo")) {
          this.ammo = this.ammoMax;
          this.reloadTransferred = true;
        }
        this.syncReloadFrame();
        if (this.reloadPlayer.finished) {
          this.reloadTimeMs = 0;
          this.reloadWeapon.visible = false;
          this.weapon.visible = true;
        }
      }
    }
    this.swayX += (-opts.mouseDelta.x * 0.0006 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (opts.mouseDelta.y * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    if (this.reducedMotion) {
      this.swayX = 0;
      this.swayY = 0;
    }
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
    const posX = 0.45 + this.swayX;
    const posY = -0.78 - this.recoil * 0.06 + bob;
    const rotation = -this.recoil * 0.06 + this.swayX * 0.4 - (this.sprintScale - 1) * 0.5;
    this.weapon.position.set(posX, posY, 0);
    this.weapon.rotation.z = rotation;
    this.weapon.scale.setScalar(this.sprintScale);
    this.reloadWeapon.position.set(posX, posY, 0);
    this.reloadWeapon.rotation.z = rotation;
    this.reloadWeapon.scale.setScalar(this.sprintScale);
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
      this.flash.scale.setScalar(this.flashScale * (1 + this.recoil * 0.1));
      (this.flash.material as THREE.MeshBasicMaterial).opacity = this.flashStrength;
    }
  }
}
