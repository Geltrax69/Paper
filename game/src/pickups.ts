import * as THREE from "three";

export type PickupKind = "health" | "ammo";

export const PICKUP_RULES: Record<
  PickupKind,
  { amount: number; label: string; position: [number, number, number] }
> = {
  health: { amount: 40, label: "Health +40", position: [-9, 0, 5] },
  ammo: { amount: 3, label: "Ammo +3", position: [9, 0, 5] },
};

function drawTexture(kind: PickupKind): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for pickup sprite");
  ctx.fillStyle = "#f2ead8";
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1d1710";
  ctx.lineWidth = 6;
  ctx.stroke();
  if (kind === "health") {
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(52, 28, 24, 72);
    ctx.fillRect(28, 52, 72, 24);
  } else {
    ctx.fillStyle = "#d9a441";
    ctx.fillRect(34, 44, 18, 52);
    ctx.fillRect(55, 44, 18, 52);
    ctx.fillRect(76, 44, 18, 52);
    ctx.fillStyle = "#1d1710";
    ctx.fillRect(34, 32, 18, 12);
    ctx.fillRect(55, 32, 18, 12);
    ctx.fillRect(76, 32, 18, 12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Procedural paper sprites only. No bespoke pickup art exists, and none
// is claimed. The disc and its symbol are drawn on a canvas at runtime.
export class Pickup {
  readonly kind: PickupKind;
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  taken = false;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly ringMaterial: THREE.MeshBasicMaterial;

  constructor(kind: PickupKind, position: THREE.Vector3) {
    this.kind = kind;
    this.position = position.clone();
    this.geometry = new THREE.PlaneGeometry(0.9, 0.9);
    this.material = new THREE.MeshBasicMaterial({
      map: drawTexture(kind),
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.group.add(this.mesh);
    this.ringGeometry = new THREE.RingGeometry(0.55, 0.7, 32);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: kind === "health" ? 0xc0392b : 0xd9a441,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.55;
    this.group.add(ring);
    this.group.position.set(position.x, 0.6, position.z);
  }

  update(camera: THREE.Camera, timeMs: number): void {
    this.group.quaternion.copy(camera.quaternion);
    this.group.position.y = 0.6 + Math.sin(timeMs / 300) * 0.08;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
