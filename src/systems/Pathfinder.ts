import { CFG, TILE, TILE_COST, Tile } from '../config/Constants';
import { isWalkable, tileAt, type GeneratedMap } from '../world/MapGen';

export interface PathPoint { x: number; y: number }

interface Request {
  sx: number; sy: number; gx: number; gy: number;
  cb: (path: PathPoint[] | null) => void;
}

/**
 * Grid A* with a per-frame search budget. Searches are queued so a 40-unit group
 * order never turns into a 40-pathframe spike; requests are also deduplicated so
 * units sharing a destination share the computed path.
 */
export class Pathfinder {
  private w: number;
  private h: number;
  private walkable: Uint8Array;
  // reusable A* buffers
  private gScore: Float32Array;
  private fScore: Float32Array;
  private cameFrom: Int32Array;
  private closed: Uint8Array;
  private openHeap: number[] = [];
  private heapF: number[] = [];
  private queue: Request[] = [];
  private cache = new Map<number, { path: PathPoint[]; time: number }>();
  private now = 0;

  searchesThisFrame = 0;
  lastSearchMs = 0;

  constructor(private map: GeneratedMap) {
    this.w = map.w;
    this.h = map.h;
    const n = this.w * this.h;
    this.gScore = new Float32Array(n);
    this.fScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.walkable = new Uint8Array(n);
    this.rebuild();
  }

  rebuild(): void {
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        this.walkable[ty * this.w + tx] = isWalkable(this.map, tx, ty) ? 1 : 0;
      }
    }
  }

  /** Marks tiles blocked by buildings (called whenever a building is placed/destroyed). */
  setBlocked(tx: number, ty: number, blocked: boolean): void {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.walkable[ty * this.w + tx] = blocked ? 0 : isWalkable(this.map, tx, ty) ? 1 : 0;
    this.cache.clear();
  }

  isFree(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.walkable[ty * this.w + tx] === 1;
  }

  /** Nearest walkable tile to (tx,ty) using a spiral search. */
  nearestFree(tx: number, ty: number, maxR = 12): { tx: number; ty: number } | null {
    tx = Math.max(0, Math.min(this.w - 1, tx));
    ty = Math.max(0, Math.min(this.h - 1, ty));
    if (this.isFree(tx, ty)) return { tx, ty };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.isFree(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
        }
      }
    }
    return null;
  }

  /** Synchronous search — use for player-issued orders on small groups. */
  findPath(sx: number, sy: number, gx: number, gy: number): PathPoint[] | null {
    const started = performance.now();
    const result = this.search(sx, sy, gx, gy);
    this.lastSearchMs = performance.now() - started;
    return result;
  }

  /** Queued search — spreads cost across frames. */
  request(sx: number, sy: number, gx: number, gy: number, cb: (path: PathPoint[] | null) => void): void {
    const key = this.cacheKey(gx, gy);
    const hit = this.cache.get(key);
    if (hit && this.now - hit.time < 2000) {
      cb(hit.path.map((p) => ({ ...p })));
      return;
    }
    this.queue.push({ sx, sy, gx, gy, cb });
    if (this.queue.length > 64) this.queue.length = 64;
  }

  private cacheKey(gx: number, gy: number): number {
    return gx * 100003 + gy;
  }

  update(dt: number): void {
    this.now += dt * 1000;
    if (this.cache.size > 256) this.cache.clear();
    this.searchesThisFrame = 0;
    const budget = CFG.PATH_BUDGET_PER_FRAME;
    while (this.queue.length > 0 && this.searchesThisFrame < budget) {
      const req = this.queue.shift()!;
      const path = this.search(req.sx, req.sy, req.gx, req.gy);
      this.searchesThisFrame++;
      if (path) this.cache.set(this.cacheKey(req.gx, req.gy), { path, time: this.now });
      req.cb(path ? path.map((p) => ({ ...p })) : null);
    }
  }

  private search(sx: number, sy: number, gx: number, gy: number): PathPoint[] | null {
    const w = this.w;
    const h = this.h;
    const start = this.nearestFree(sx, sy, 14);
    const goal = this.nearestFree(gx, gy, 14);
    if (!start || !goal) return null;
    let sx2 = start.tx;
    let sy2 = start.ty;
    const gx2 = goal.tx;
    const gy2 = goal.ty;
    if (sx2 === gx2 && sy2 === gy2) {
      return [{ x: gx2 * TILE + TILE / 2, y: gy2 * TILE + TILE / 2 }];
    }

    const n = w * h;
    this.gScore.fill(Infinity, 0, n);
    this.closed.fill(0, 0, n);
    this.openHeap.length = 0;
    this.heapF.length = 0;

    const sIdx = sy2 * w + sx2;
    const gIdx = gy2 * w + gx2;
    this.gScore[sIdx] = 0;
    this.cameFrom[sIdx] = -1;
    this.heapPush(sIdx, this.heuristic(sx2, sy2, gx2, gy2));

    const DIRS = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    let iterations = 0;
    const maxIterations = Math.min(n, 6000);

    while (this.openHeap.length > 0 && iterations++ < maxIterations) {
      const cur = this.heapPop();
      if (cur < 0) break;
      if (this.closed[cur]) continue;
      this.closed[cur] = 1;
      if (cur === gIdx) break;
      const cx = cur % w;
      const cy = (cur - cx) / w;

      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (this.walkable[ni] !== 1 || this.closed[ni]) continue;
        // no corner cutting through blocked diagonals
        if (dx !== 0 && dy !== 0) {
          if (this.walkable[cy * w + nx] !== 1 || this.walkable[ny * w + cx] !== 1) continue;
        }
        const terr = TILE_COST[tileAt(this.map, nx, ny)] ?? 1;
        const step = cost * terr;
        const tentative = this.gScore[cur] + step;
        if (tentative < this.gScore[ni]) {
          this.gScore[ni] = tentative;
          this.cameFrom[ni] = cur;
          this.heapPush(ni, tentative + this.heuristic(nx, ny, gx2, gy2) * 1.08);
        }
      }
    }

    if (!this.closed[gIdx] && this.gScore[gIdx] === Infinity) return null;

    // reconstruct
    const raw: PathPoint[] = [];
    let node = gIdx;
    let guard = 0;
    while (node !== -1 && guard++ < 4000) {
      const x = node % w;
      const y = (node - x) / w;
      raw.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
      node = this.cameFrom[node];
    }
    raw.reverse();
    return this.smooth(raw);
  }

  /** Removes waypoints that are not needed (line of sight between consecutive nodes). */
  private smooth(path: PathPoint[]): PathPoint[] {
    if (path.length <= 2) return path;
    const out: PathPoint[] = [path[0]];
    let anchor = 0;
    for (let i = 2; i < path.length; i++) {
      if (!this.lineOfSight(path[anchor], path[i])) {
        out.push(path[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  private lineOfSight(a: PathPoint, b: PathPoint): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (!this.isFree(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }

  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  }

  private heapPush(idx: number, f: number): void {
    const heap = this.openHeap;
    const fs = this.heapF;
    heap.push(idx);
    fs.push(f);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[p] <= fs[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      [fs[p], fs[i]] = [fs[i], fs[p]];
      i = p;
    }
  }

  private heapPop(): number {
    const heap = this.openHeap;
    const fs = this.heapF;
    const n = heap.length;
    if (n === 0) return -1;
    const top = heap[0];
    const lastI = heap.pop()!;
    const lastF = fs.pop()!;
    if (n > 1) {
      heap[0] = lastI;
      fs[0] = lastF;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < fs.length && fs[l] < fs[m]) m = l;
        if (r < fs.length && fs[r] < fs[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [fs[m], fs[i]] = [fs[i], fs[m]];
        i = m;
      }
    }
    return top;
  }
}

export const UNREACHABLE = Tile.ROCK;
