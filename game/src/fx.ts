import * as THREE from "three";

export type FxSettings = {
  effectDensity: "full" | "reduced";
  flash: number;
  reducedMotion: boolean;
};

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for effect texture");
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function star(ctx: CanvasRenderingContext2D, points: number, outer: number, inner: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = 64 + Math.cos(angle) * radius;
    const y = 64 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function makeTextures(): Record<string, THREE.CanvasTexture> {
  return {
    flashAngular: canvasTexture(128, (ctx) => {
      ctx.fillStyle = "#ffc928";
      ctx.beginPath();
      const spikes = [62, 20, 58, 24, 60, 18, 56, 26, 62, 20, 54, 30, 60, 22];
      for (let i = 0; i < spikes.length; i += 1) {
        const angle = (i / spikes.length) * Math.PI * 2 - Math.PI / 2;
        const x = 64 + Math.cos(angle) * spikes[i];
        const y = 64 + Math.sin(angle) * spikes[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.arc(64, 64, 18, 0, Math.PI * 2);
      ctx.fill();
    }),
    flashStar4: canvasTexture(128, (ctx) => {
      star(ctx, 4, 62, 14, "#ffc928");
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.arc(64, 64, 16, 0, Math.PI * 2);
      ctx.fill();
    }),
    flashStar8: canvasTexture(128, (ctx) => {
      star(ctx, 8, 62, 22, "#ffc928");
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.arc(64, 64, 20, 0, Math.PI * 2);
      ctx.fill();
    }),
    fragment: canvasTexture(128, (ctx) => {
      ctx.fillStyle = "#f3e6c8";
      ctx.beginPath();
      ctx.moveTo(14, 96);
      ctx.lineTo(64, 18);
      ctx.lineTo(114, 84);
      ctx.lineTo(70, 110);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#12101b";
      ctx.lineWidth = 6;
      ctx.stroke();
    }),
    inkStar: canvasTexture(128, (ctx) => {
      star(ctx, 6, 60, 18, "#f52d39");
      ctx.strokeStyle = "#12101b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(64, 64, 12, 0, Math.PI * 2);
      ctx.stroke();
    }),
    smoke: canvasTexture(128, (ctx) => {
      const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      gradient.addColorStop(0, "rgba(80,70,90,0.55)");
      gradient.addColorStop(0.6, "rgba(80,70,90,0.28)");
      gradient.addColorStop(1, "rgba(80,70,90,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }),
    spark: canvasTexture(128, (ctx) => {
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath();
      ctx.ellipse(64, 64, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath();
      ctx.arc(64, 64, 12, 0, Math.PI * 2);
      ctx.fill();
    }),
  };
}

type SpriteSlot = {
  active: boolean;
  explosionOwned: boolean;
  lifeMs: number;
  maxLifeMs: number;
  opacity: number;
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
};

type RingSlot = {
  active: boolean;
  lifeMs: number;
  maxLifeMs: number;
  maxScale: number;
  mesh: THREE.Mesh;
  opacity: number;
};

type FragmentSlot = {
  active: boolean;
  explosionOwned: boolean;
  lifeMs: number;
  maxLifeMs: number;
  mesh: THREE.Mesh;
  spin: number;
  velocity: THREE.Vector3;
};

type Explosion = {
  active: boolean;
  bloom: THREE.Sprite;
  core: THREE.Sprite;
  fragments: FragmentSlot[];
  lifeMs: number;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  smoke: SpriteSlot[];
  sparks: SpriteSlot[];
};

export const FX_POOL_CAPS = {
  explosions: 4,
  flashes: 24,
  fragments: 48,
  inkStars: 24,
  rings: 16,
  smoke: 24,
  sparks: 96,
};

export class FxEmitter {
  readonly textures: Record<string, THREE.CanvasTexture>;
  private readonly scene: THREE.Scene;
  private readonly flashes: SpriteSlot[] = [];
  private readonly sparks: SpriteSlot[] = [];
  private readonly inkStars: SpriteSlot[] = [];
  private readonly smoke: SpriteSlot[] = [];
  private readonly rings: RingSlot[] = [];
  private readonly fragments: FragmentSlot[] = [];
  private readonly explosions: Explosion[] = [];
  private flashCursor = 0;
  private sparkCursor = 0;
  private inkCursor = 0;
  private smokeCursor = 0;
  private ringCursor = 0;
  private fragmentCursor = 0;
  private explosionCursor = 0;
  lastExplosion: { center: [number, number, number]; endedMs: number; startedMs: number } | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.textures = makeTextures();
    const spriteMaterial = (map: THREE.Texture, additive: boolean): THREE.SpriteMaterial =>
      new THREE.SpriteMaterial({
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
        map,
        transparent: true,
      });
    for (let i = 0; i < FX_POOL_CAPS.flashes; i += 1) {
      const sprite = new THREE.Sprite(spriteMaterial(this.textures.flashAngular, true));
      sprite.visible = false;
      scene.add(sprite);
      this.flashes.push({ active: false, lifeMs: 0, maxLifeMs: 1, opacity: 1, sprite, explosionOwned: false, velocity: new THREE.Vector3() });
    }
    for (let i = 0; i < FX_POOL_CAPS.sparks; i += 1) {
      const sprite = new THREE.Sprite(spriteMaterial(this.textures.spark, true));
      sprite.visible = false;
      scene.add(sprite);
      this.sparks.push({ active: false, lifeMs: 0, maxLifeMs: 1, opacity: 1, sprite, explosionOwned: false, velocity: new THREE.Vector3() });
    }
    for (let i = 0; i < FX_POOL_CAPS.inkStars; i += 1) {
      const sprite = new THREE.Sprite(spriteMaterial(this.textures.inkStar, false));
      sprite.visible = false;
      scene.add(sprite);
      this.inkStars.push({ active: false, lifeMs: 0, maxLifeMs: 1, opacity: 1, sprite, explosionOwned: false, velocity: new THREE.Vector3() });
    }
    for (let i = 0; i < FX_POOL_CAPS.smoke; i += 1) {
      const sprite = new THREE.Sprite(spriteMaterial(this.textures.smoke, false));
      sprite.visible = false;
      scene.add(sprite);
      this.smoke.push({ active: false, lifeMs: 0, maxLifeMs: 1, opacity: 1, sprite, explosionOwned: false, velocity: new THREE.Vector3() });
    }
    const ringGeometry = new THREE.RingGeometry(0.92, 1, 48);
    for (let i = 0; i < FX_POOL_CAPS.rings; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffc928,
        depthWrite: false,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      this.rings.push({ active: false, lifeMs: 0, maxLifeMs: 1, maxScale: 1, mesh, opacity: 1 });
    }
    const fragmentGeometry = new THREE.PlaneGeometry(0.18, 0.12);
    for (let i = 0; i < FX_POOL_CAPS.fragments; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        depthWrite: false,
        map: this.textures.fragment,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(fragmentGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.fragments.push({ active: false, lifeMs: 0, maxLifeMs: 1, mesh, explosionOwned: false, spin: 0, velocity: new THREE.Vector3() });
    }
    for (let i = 0; i < FX_POOL_CAPS.explosions; i += 1) {
      const core = new THREE.Sprite(spriteMaterial(this.textures.flashStar8, true));
      const bloom = new THREE.Sprite(spriteMaterial(this.textures.flashStar4, true));
      core.visible = false;
      bloom.visible = false;
      scene.add(core);
      scene.add(bloom);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffc928,
        depthWrite: false,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.visible = false;
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
      this.explosions.push({
        active: false,
        bloom,
        core,
        fragments: [],
        lifeMs: 0,
        ring,
        ringMaterial,
        smoke: [],
        sparks: [],
      });
    }
  }

  private nextFlash(map: THREE.Texture, point: THREE.Vector3, scale: number, lifeMs: number, opacity: number): void {
    const slot = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    (slot.sprite.material as THREE.SpriteMaterial).map = map;
    slot.sprite.position.copy(point);
    slot.sprite.scale.setScalar(scale);
    (slot.sprite.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    (slot.sprite.material as THREE.SpriteMaterial).opacity = opacity;
    slot.sprite.visible = opacity > 0;
    slot.active = true;
    slot.lifeMs = lifeMs;
    slot.maxLifeMs = lifeMs;
    slot.opacity = opacity;
  }

  private nextSpark(point: THREE.Vector3, velocity: THREE.Vector3, scale: number, lifeMs: number): void {
    const slot = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
    slot.sprite.position.copy(point);
    slot.sprite.scale.setScalar(scale);
    (slot.sprite.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    (slot.sprite.material as THREE.SpriteMaterial).opacity = 1;
    slot.sprite.visible = true;
    slot.active = true;
    slot.lifeMs = lifeMs;
    slot.maxLifeMs = lifeMs;
    slot.opacity = 1;
    slot.velocity.copy(velocity);
  }

  private nextInkStar(point: THREE.Vector3, scale: number, lifeMs: number): void {
    const slot = this.inkStars[this.inkCursor];
    this.inkCursor = (this.inkCursor + 1) % this.inkStars.length;
    slot.sprite.position.copy(point);
    slot.sprite.scale.setScalar(scale);
    (slot.sprite.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    (slot.sprite.material as THREE.SpriteMaterial).opacity = 1;
    slot.sprite.visible = true;
    slot.active = true;
    slot.lifeMs = lifeMs;
    slot.maxLifeMs = lifeMs;
    slot.opacity = 1;
  }

  private nextSmoke(point: THREE.Vector3, velocity: THREE.Vector3, scale: number, lifeMs: number): void {
    const slot = this.smoke[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % this.smoke.length;
    slot.sprite.position.copy(point);
    slot.sprite.scale.setScalar(scale);
    (slot.sprite.material as THREE.SpriteMaterial).opacity = 0.35;
    slot.sprite.visible = true;
    slot.active = true;
    slot.lifeMs = lifeMs;
    slot.maxLifeMs = lifeMs;
    slot.opacity = 0.35;
    slot.velocity.copy(velocity);
  }

  private nextRing(point: THREE.Vector3, maxScale: number, lifeMs: number, opacity: number): void {
    const slot = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    slot.mesh.position.set(point.x, Math.max(0.05, point.y), point.z);
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
    slot.mesh.visible = opacity > 0;
    slot.active = true;
    slot.lifeMs = lifeMs;
    slot.maxLifeMs = lifeMs;
    slot.maxScale = maxScale;
    slot.opacity = opacity;
  }

  private nextFragment(point: THREE.Vector3, velocity: THREE.Vector3, lifeMs: number): FragmentSlot {
    const slot = this.fragments[this.fragmentCursor];
    this.fragmentCursor = (this.fragmentCursor + 1) % this.fragments.length;
    slot.mesh.position.copy(point);
    slot.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    slot.mesh.visible = true;
    slot.active = true;
    slot.lifeMs = lifeMs;
    slot.maxLifeMs = lifeMs;
    slot.velocity.copy(velocity);
    slot.spin = (Math.random() - 0.5) * 12;
    return slot;
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, settings: FxSettings, heavy: boolean): void {
    const reduced = settings.effectDensity === "reduced";
    const flashOpacity = settings.flash;
    this.nextFlash(this.textures.flashAngular, point.clone().addScaledVector(normal, 0.05), heavy ? 1.1 : 0.7, heavy ? 140 : 90, flashOpacity);
    this.nextInkStar(point.clone().addScaledVector(normal, 0.08), heavy ? 0.9 : 0.55, heavy ? 320 : 220);
    const fragmentCount = reduced ? (heavy ? 2 : 1) : heavy ? 5 : 2;
    for (let i = 0; i < fragmentCount; i += 1) {
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      this.nextFragment(point, velocity, 650);
    }
    const sparkCount = reduced ? 2 : heavy ? 6 : 3;
    for (let i = 0; i < sparkCount; i += 1) {
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5);
      this.nextSpark(point, velocity, 0.22, 260);
    }
  }

  explosion(center: THREE.Vector3, settings: FxSettings): void {
    const slot = this.explosions[this.explosionCursor];
    this.explosionCursor = (this.explosionCursor + 1) % this.explosions.length;
    this.hideExplosion(slot);
    const reduced = settings.effectDensity === "reduced";
    const flashOpacity = settings.flash;
    slot.active = true;
    slot.lifeMs = 0;
    slot.core.position.copy(center).add(new THREE.Vector3(0, 0.3, 0));
    slot.core.visible = flashOpacity > 0;
    (slot.core.material as THREE.SpriteMaterial).opacity = flashOpacity;
    slot.bloom.position.copy(center).add(new THREE.Vector3(0, 0.3, 0));
    slot.bloom.visible = flashOpacity > 0;
    (slot.bloom.material as THREE.SpriteMaterial).opacity = flashOpacity;
    slot.ring.position.set(center.x, 0.06, center.z);
    slot.ring.visible = true;
    slot.ringMaterial.opacity = 0.9;
    slot.ring.scale.setScalar(0.3);
    slot.fragments = [];
    slot.sparks = [];
    slot.smoke = [];
    const fragmentCount = reduced ? 6 : 14;
    for (let i = 0; i < fragmentCount; i += 1) {
      const angle = (i / fragmentCount) * Math.PI * 2 + Math.random() * 0.4;
      const velocity = new THREE.Vector3(Math.cos(angle) * (3 + Math.random() * 3), 2 + Math.random() * 3, Math.sin(angle) * (3 + Math.random() * 3));
      const fragment = this.nextFragment(center.clone().add(new THREE.Vector3(0, 0.4, 0)), velocity, 800);
      fragment.explosionOwned = true;
      slot.fragments.push(fragment);
    }
    const sparkCount = reduced ? 8 : 20;
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = new THREE.Vector3(Math.cos(angle) * (4 + Math.random() * 4), 1 + Math.random() * 4, Math.sin(angle) * (4 + Math.random() * 4));
      const sparkSlot = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
      sparkSlot.sprite.position.copy(center).add(new THREE.Vector3(0, 0.4, 0));
      sparkSlot.sprite.scale.setScalar(0.28);
      (sparkSlot.sprite.material as THREE.SpriteMaterial).opacity = 1;
      sparkSlot.sprite.visible = true;
      sparkSlot.explosionOwned = true;
      sparkSlot.active = true;
      sparkSlot.lifeMs = 500;
      sparkSlot.maxLifeMs = 500;
      sparkSlot.opacity = 1;
      sparkSlot.velocity.copy(velocity);
      slot.sparks.push(sparkSlot);
    }
    const smokeCount = reduced ? 3 : 8;
    for (let i = 0; i < smokeCount; i += 1) {
      const smokeSlot = this.smoke[this.smokeCursor];
      this.smokeCursor = (this.smokeCursor + 1) % this.smoke.length;
      smokeSlot.sprite.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8));
      smokeSlot.sprite.scale.setScalar(0.8);
      (smokeSlot.sprite.material as THREE.SpriteMaterial).opacity = 0.35;
      smokeSlot.sprite.visible = true;
      smokeSlot.explosionOwned = true;
      smokeSlot.active = true;
      smokeSlot.lifeMs = 1100;
      smokeSlot.maxLifeMs = 1100;
      smokeSlot.opacity = 0.35;
      smokeSlot.velocity.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
      slot.smoke.push(smokeSlot);
    }
    this.lastExplosion = { center: [center.x, center.y, center.z], endedMs: 0, startedMs: performance.now() };
  }

  private hideExplosion(slot: Explosion): void {
    slot.active = false;
    slot.core.visible = false;
    slot.bloom.visible = false;
    slot.ring.visible = false;
    for (const fragment of slot.fragments) {
      fragment.active = false;
      fragment.explosionOwned = false;
      fragment.mesh.visible = false;
    }
    for (const spark of slot.sparks) {
      spark.active = false;
      spark.explosionOwned = false;
      spark.sprite.visible = false;
    }
    for (const puff of slot.smoke) {
      puff.active = false;
      puff.explosionOwned = false;
      puff.sprite.visible = false;
    }
    slot.fragments = [];
    slot.sparks = [];
    slot.smoke = [];
  }

  explosionVisuals(): { bloomVisible: boolean; coreVisible: boolean; ringVisible: boolean } | null {
    const slot = this.explosions.find((entry) => entry.active);
    if (!slot) return null;
    return { bloomVisible: slot.bloom.visible, coreVisible: slot.core.visible, ringVisible: slot.ring.visible };
  }

  getActiveExplosion(): { center: [number, number, number]; lifeMs: number } | null {
    const slot = this.explosions.find((entry) => entry.active);
    if (!slot || !this.lastExplosion) return null;
    return { center: this.lastExplosion.center, lifeMs: slot.lifeMs };
  }

  counts(): Record<string, number> {
    const active = (slots: { active: boolean }[]): number => slots.filter((slot) => slot.active).length;
    return {
      explosions: this.explosions.filter((slot) => slot.active).length,
      flashes: active(this.flashes),
      fragments: active(this.fragments),
      inkStars: active(this.inkStars),
      pooled: FX_POOL_CAPS.explosions + FX_POOL_CAPS.flashes + FX_POOL_CAPS.fragments + FX_POOL_CAPS.inkStars + FX_POOL_CAPS.rings + FX_POOL_CAPS.smoke + FX_POOL_CAPS.sparks,
      rings: active(this.rings),
      smoke: active(this.smoke),
      sparks: active(this.sparks),
      textures: Object.keys(this.textures).length,
    };
  }

  clear(): void {
    for (const slot of [...this.flashes, ...this.sparks, ...this.inkStars, ...this.smoke]) {
      slot.active = false;
      slot.sprite.visible = false;
    }
    for (const slot of this.rings) {
      slot.active = false;
      slot.mesh.visible = false;
    }
    for (const slot of this.fragments) {
      slot.active = false;
      slot.mesh.visible = false;
    }
    for (const slot of this.explosions) this.hideExplosion(slot);
  }

  update(dtMs: number, settings: FxSettings): void {
    const dt = dtMs / 1000;
    const advanceSprite = (slot: SpriteSlot, gravity: number): void => {
      if (!slot.active) return;
      slot.lifeMs -= dtMs;
      if (slot.lifeMs <= 0) {
        slot.active = false;
        slot.sprite.visible = false;
        return;
      }
      slot.sprite.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y -= gravity * dt;
      const remain = slot.lifeMs / slot.maxLifeMs;
      (slot.sprite.material as THREE.SpriteMaterial).opacity = slot.opacity * Math.min(1, remain * 2);
    };
    for (const slot of this.flashes) {
      if (!slot.active) continue;
      slot.lifeMs -= dtMs;
      if (slot.lifeMs <= 0) {
        slot.active = false;
        slot.sprite.visible = false;
        continue;
      }
      const remain = slot.lifeMs / slot.maxLifeMs;
      (slot.sprite.material as THREE.SpriteMaterial).opacity = slot.opacity * remain;
    }
    for (const slot of this.sparks) {
      if (slot.explosionOwned) continue;
      advanceSprite(slot, 6);
    }
    for (const slot of this.inkStars) {
      if (!slot.active) continue;
      slot.lifeMs -= dtMs;
      if (slot.lifeMs <= 0) {
        slot.active = false;
        slot.sprite.visible = false;
        continue;
      }
      const remain = slot.lifeMs / slot.maxLifeMs;
      (slot.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, remain * 2);
    }
    for (const slot of this.smoke) {
      if (!slot.active || slot.explosionOwned) continue;
      slot.lifeMs -= dtMs;
      if (slot.lifeMs <= 0) {
        slot.active = false;
        slot.sprite.visible = false;
        continue;
      }
      slot.sprite.position.addScaledVector(slot.velocity, dt);
      slot.sprite.scale.addScalar(dt * 1.2);
      const remain = slot.lifeMs / slot.maxLifeMs;
      (slot.sprite.material as THREE.SpriteMaterial).opacity = slot.opacity * remain;
    }
    for (const slot of this.rings) {
      if (!slot.active) continue;
      slot.lifeMs -= dtMs;
      if (slot.lifeMs <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      const progress = 1 - slot.lifeMs / slot.maxLifeMs;
      slot.mesh.scale.setScalar(0.3 + progress * (slot.maxScale - 0.3));
      (slot.mesh.material as THREE.MeshBasicMaterial).opacity = slot.opacity * (1 - progress);
    }
    for (const slot of this.fragments) {
      if (!slot.active || slot.explosionOwned) continue;
      slot.lifeMs -= dtMs;
      if (slot.lifeMs <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y -= 9 * dt;
      slot.mesh.rotation.z += slot.spin * dt;
      const remain = slot.lifeMs / slot.maxLifeMs;
      (slot.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, remain * 2);
    }
    for (const slot of this.explosions) {
      if (!slot.active) continue;
      slot.lifeMs += dtMs;
      const t = slot.lifeMs;
      if (t <= 80) {
        const progress = t / 80;
        slot.core.scale.setScalar(0.5 + progress * 1.2);
        (slot.core.material as THREE.SpriteMaterial).opacity = settings.flash;
        slot.core.visible = settings.flash > 0;
      } else if (t <= 220) {
        const progress = (t - 80) / 140;
        slot.core.scale.setScalar(1.7 + progress * 0.5);
        (slot.core.material as THREE.SpriteMaterial).opacity = settings.flash * (1 - progress);
        slot.core.visible = settings.flash > 0 && progress < 1;
        slot.bloom.scale.setScalar(0.8 + progress * 2.2);
        (slot.bloom.material as THREE.SpriteMaterial).opacity = settings.flash * (1 - progress * 0.5);
        slot.bloom.visible = settings.flash > 0;
      } else {
        slot.core.visible = false;
        slot.bloom.visible = false;
      }
      if (t <= 600) {
        const progress = t / 600;
        slot.ring.scale.setScalar(0.3 + progress * 2.9);
        slot.ringMaterial.opacity = 0.9 * (1 - progress);
        slot.ring.visible = true;
      } else {
        slot.ring.visible = false;
      }
      const advanceOwned = (owned: SpriteSlot[], gravity: number, grow: boolean): void => {
        for (const ownedSlot of owned) {
          if (!ownedSlot.active) continue;
          ownedSlot.lifeMs -= dtMs;
          if (ownedSlot.lifeMs <= 0) {
            ownedSlot.active = false;
            ownedSlot.sprite.visible = false;
            continue;
          }
          ownedSlot.sprite.position.addScaledVector(ownedSlot.velocity, dt);
          ownedSlot.velocity.y -= gravity * dt;
          if (grow) ownedSlot.sprite.scale.addScalar(dt * 1.2);
          const remain = ownedSlot.lifeMs / ownedSlot.maxLifeMs;
          (ownedSlot.sprite.material as THREE.SpriteMaterial).opacity = ownedSlot.opacity * Math.min(1, remain * 2);
        }
      };
      advanceOwned(slot.sparks, 6, false);
      advanceOwned(slot.smoke, 0, true);
      for (const ownedFragment of slot.fragments) {
        if (!ownedFragment.active) continue;
        ownedFragment.lifeMs -= dtMs;
        if (ownedFragment.lifeMs <= 0) {
          ownedFragment.active = false;
          ownedFragment.mesh.visible = false;
          continue;
        }
        ownedFragment.mesh.position.addScaledVector(ownedFragment.velocity, dt);
        ownedFragment.velocity.y -= 9 * dt;
        ownedFragment.mesh.rotation.z += ownedFragment.spin * dt;
        const remain = ownedFragment.lifeMs / ownedFragment.maxLifeMs;
        (ownedFragment.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, remain * 2);
      }
      if (t >= 1100) {
        this.hideExplosion(slot);
        if (this.lastExplosion) this.lastExplosion.endedMs = performance.now();
      }
    }
  }
}
