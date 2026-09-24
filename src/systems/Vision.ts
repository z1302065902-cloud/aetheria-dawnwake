import Phaser from 'phaser';
import { TILE } from '../config/Constants';
import type { World } from '../world/World';

/**
 * Fog of war.
 *
 * Three states per tile:
 *   0 = never seen (black)      1 = explored / remembered (dim)      2 = currently visible
 *
 * The fog is rasterised into ONE tile-resolution canvas texture (72x72 for a 72x72 map)
 * that is shared by two images: the world overlay and the minimap overlay. That keeps the
 * whole fog system at 1 draw call and 1 tiny texture upload per change, instead of
 * thousands of rectangles per frame.
 */
export const FOG_TEX = 'fog';

const ALPHA_UNEXPLORED = 0.88;
const ALPHA_EXPLORED = 0.42;

export class VisionGrid {
  /**
   * Colour of the unexplored wash (Visual Bible §4). Set from the region palette by the battle
   * scene: the darkness over a ruined fortress is not the darkness over a green valley.
   */
  fogColor = 0x060912;
  readonly w: number;
  readonly h: number;
  /** 1 = currently visible */
  private visible: Uint8Array;
  /** 1 = seen at least once (remembered) */
  private explored: Uint8Array;
  private canvasTex: Phaser.Textures.CanvasTexture | null = null;
  private imageData: ImageData | null = null;
  /** Bumped whenever the visible set changes, so callers can skip work. */
  version = 0;
  private paintedVersion = -1;

  constructor(
    private scene: Phaser.Scene,
    w: number,
    h: number,
  ) {
    this.w = w;
    this.h = h;
    this.visible = new Uint8Array(w * h);
    this.explored = new Uint8Array(w * h);
    this.ensureTexture();
  }

  private ensureTexture(): void {
    const existing = this.scene.textures.exists(FOG_TEX) ? (this.scene.textures.get(FOG_TEX) as Phaser.Textures.CanvasTexture) : null;
    const fits = !!existing && !!existing.source[0] && existing.source[0].width === this.w && existing.source[0].height === this.h;
    const tex = fits ? existing! : (() => {
      if (this.scene.textures.exists(FOG_TEX)) this.scene.textures.remove(FOG_TEX);
      const t = this.scene.textures.createCanvas(FOG_TEX, this.w, this.h);
      if (!t) throw new Error('[vision] failed to create fog texture');
      return t;
    })();
    // LINEAR so the tile-resolution mask reads as soft fog instead of hard squares
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.canvasTex = tex;
    const ctx = tex.getContext();
    this.imageData = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.w * this.h; i++) {
      const p = i * 4;
      // the unexplored wash is tinted by the region (Visual Bible §4): a fortress night is not
      // the same colour of darkness as a green valley afternoon
      this.imageData.data[p] = (this.fogColor >> 16) & 0xff;
      this.imageData.data[p + 1] = (this.fogColor >> 8) & 0xff;
      this.imageData.data[p + 2] = this.fogColor & 0xff;
      this.imageData.data[p + 3] = 255 * ALPHA_UNEXPLORED;
    }
    this.paintedVersion = -1;
  }

  // ────────────────────────── queries ──────────────────────────

  isVisibleTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.visible[ty * this.w + tx] === 1;
  }

  isExploredTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.explored[ty * this.w + tx] === 1;
  }

  isVisibleWorld(x: number, y: number): boolean {
    return this.isVisibleTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  isExploredWorld(x: number, y: number): boolean {
    return this.isExploredTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  get exploredTiles(): number {
    let n = 0;
    for (let i = 0; i < this.explored.length; i++) if (this.explored[i]) n++;
    return n;
  }

  get visibleTiles(): number {
    let n = 0;
    for (let i = 0; i < this.visible.length; i++) if (this.visible[i]) n++;
    return n;
  }

  // ────────────────────────── update ──────────────────────────

  /** Recomputes the visible set from every friendly unit/building. */
  update(world: World): void {
    this.visible.fill(0);
    let changed = false;
    const reveal = (x: number, y: number, radius: number) => {
      const r = Math.ceil(radius / TILE);
      const ctx = Math.floor(x / TILE);
      const cty = Math.floor(y / TILE);
      const r2 = radius * radius;
      const y0 = Math.max(0, cty - r);
      const y1 = Math.min(this.h - 1, cty + r);
      const x0 = Math.max(0, ctx - r);
      const x1 = Math.min(this.w - 1, ctx + r);
      for (let ty = y0; ty <= y1; ty++) {
        const wy = ty * TILE + TILE / 2 - y;
        const dy2 = wy * wy;
        for (let tx = x0; tx <= x1; tx++) {
          const wx = tx * TILE + TILE / 2 - x;
          if (wx * wx + dy2 > r2) continue;
          const i = ty * this.w + tx;
          if (this.visible[i] !== 1) {
            this.visible[i] = 1;
            changed = true;
          }
          if (this.explored[i] !== 1) {
            this.explored[i] = 1;
            changed = true;
          }
        }
      }
    };

    for (const u of world.units) {
      if (u.dead || u.team !== 1) continue;
      reveal(u.x, u.y, u.def.sightRange);
    }
    for (const b of world.buildings) {
      if (b.dead || b.team !== 1) continue;
      // buildings watch their own footprint plus a margin
      const radius = Math.max(b.def.footprint.w, b.def.footprint.h) * TILE * 0.5 + 200;
      reveal(b.x, b.y, radius);
    }

    if (changed) this.version++;
  }

  /** Permanently reveals an area (NPC hints, scripted discoveries). */
  revealArea(x: number, y: number, radius: number): void {
    const r = Math.ceil(radius / TILE);
    const ctx = Math.floor(x / TILE);
    const cty = Math.floor(y / TILE);
    const r2 = radius * radius;
    let changed = false;
    for (let ty = Math.max(0, cty - r); ty <= Math.min(this.h - 1, cty + r); ty++) {
      const dy = ty * TILE + TILE / 2 - y;
      for (let tx = Math.max(0, ctx - r); tx <= Math.min(this.w - 1, ctx + r); tx++) {
        const dx = tx * TILE + TILE / 2 - x;
        if (dx * dx + dy * dy > r2) continue;
        const i = ty * this.w + tx;
        if (this.explored[i] !== 1) {
          this.explored[i] = 1;
          changed = true;
        }
      }
    }
    if (changed) this.version++;
  }

  /** Writes the current mask into the shared canvas texture (only when it changed). */
  paint(): void {
    if (!this.canvasTex || !this.imageData || this.paintedVersion === this.version) return;
    this.paintedVersion = this.version;
    const data = this.imageData.data;
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const i = ty * this.w + tx;
        const p = i * 4;
        const a = this.visible[i] === 1 ? 0 : this.explored[i] === 1 ? ALPHA_EXPLORED : ALPHA_UNEXPLORED;
        data[p + 3] = a * 255;
      }
    }
    const ctx = this.canvasTex.getContext();
    ctx.putImageData(this.imageData, 0, 0);
    this.canvasTex.refresh();
  }

  /** Debug hook for tests / the console. */
  debugAt(x: number, y: number): { tx: number; ty: number; visible: boolean; explored: boolean } {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    return { tx, ty, visible: this.isVisibleTile(tx, ty), explored: this.isExploredTile(tx, ty) };
  }
}
