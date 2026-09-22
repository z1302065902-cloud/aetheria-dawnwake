/**
 * Generic object pool: projectiles, corpses, floating text and particles all come
 * from a pool so the GC never has to run mid-fight.
 */
export class Pool<T> {
  private free: T[] = [];
  private active = new Set<T>();

  constructor(
    private factory: () => T,
    private onAcquire: (item: T) => void,
    private onRelease: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.factory());
  }

  get size(): number {
    return this.active.size;
  }

  get capacity(): number {
    return this.active.size + this.free.length;
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.active.add(item);
    this.onAcquire(item);
    return item;
  }

  release(item: T): void {
    if (!this.active.has(item)) return;
    this.active.delete(item);
    this.onRelease(item);
    this.free.push(item);
  }

  forEach(fn: (item: T) => void): void {
    for (const item of this.active) fn(item);
  }

  releaseAll(): void {
    for (const item of Array.from(this.active)) this.release(item);
  }

  /** Iterate safely while items may be released inside the callback. */
  forEachSafe(fn: (item: T) => void): void {
    for (const item of Array.from(this.active)) {
      if (!this.active.has(item)) continue;
      fn(item);
    }
  }
}
