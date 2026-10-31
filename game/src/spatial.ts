import * as THREE from "three";

export type SpatialItem = {
  position: THREE.Vector3;
};

export class SpatialGrid<T extends SpatialItem> {
  private readonly cellSize: number;
  private readonly buckets = new Map<string, T[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  rebuild(items: T[]): void {
    this.buckets.clear();
    for (const item of items) {
      const key = this.key(item.position);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(item);
      else this.buckets.set(key, [item]);
    }
  }

  neighbors(position: THREE.Vector3): T[] {
    const cx = Math.floor(position.x / this.cellSize);
    const cz = Math.floor(position.z / this.cellSize);
    const out: T[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = this.buckets.get(`${cx + dx},${cz + dz}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  private key(position: THREE.Vector3): string {
    return `${Math.floor(position.x / this.cellSize)},${Math.floor(position.z / this.cellSize)}`;
  }
}
