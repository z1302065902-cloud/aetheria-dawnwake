import { CFG } from '../config/Constants';

export interface HasPos {
  x: number;
  y: number;
  dead?: boolean;
  radius?: number;
}

/**
 * Uniform-grid spatial hash. Unit queries (separation, aggro, splash) dominate the
 * CPU budget, so every "who is near me" question goes through this instead of O(n²).
 */
export class SpatialHash<T extends HasPos> {
  private cell = CFG.HASH_CELL;
  private map = new Map<number, T[]>();

  clear(): void {
    this.map.clear();
  }

  private key(cx: number, cy: number): number {
    // Cantor-ish packing; world is 72x72 tiles so coords stay small and positive.
    return cx * 4096 + cy;
  }

  insert(e: T): void {
    const cx = Math.floor(e.x / this.cell);
    const cy = Math.floor(e.y / this.cell);
    const k = this.key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) {
      arr = [];
      this.map.set(k, arr);
    }
    arr.push(e);
  }

  rebuild(items: T[]): void {
    this.clear();
    for (const it of items) {
      if (it.dead) continue;
      this.insert(it);
    }
  }

  query(x: number, y: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const c = this.cell;
    const minX = Math.floor((x - radius) / c);
    const maxX = Math.floor((x + radius) / c);
    const minY = Math.floor((y - radius) / c);
    const maxY = Math.floor((y + radius) / c);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (const it of arr) out.push(it);
      }
    }
    return out;
  }

  forEachNear(x: number, y: number, radius: number, fn: (e: T) => void): void {
    const c = this.cell;
    const minX = Math.floor((x - radius) / c);
    const maxX = Math.floor((x + radius) / c);
    const minY = Math.floor((y - radius) / c);
    const maxY = Math.floor((y + radius) / c);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (const it of arr) fn(it);
      }
    }
  }
}
