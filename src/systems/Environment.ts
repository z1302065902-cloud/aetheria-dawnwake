import Phaser from 'phaser';
import { DEPTH, TILE } from '../config/Constants';
import { DEPTH_LAYERS, REGION } from '../art/VisualBible';
import { drawBackdropTexture } from '../art/SpriteFactory';
import { tileAt, type GeneratedMap } from '../world/MapGen';
import { Tile } from '../config/Constants';
import { shade } from '../art/Palette';
import { metaOf } from '../art/SpriteFactory';

/**
 * Animated battlefield decoration.
 *
 * Trees, rocks, ruins, torches and banners used to be baked into the terrain texture (one
 * draw call, but frozen). They are now individual sprites with a slow sway/flame cycle so
 * the battlefield breathes. The ground itself stays baked, so this only adds the objects
 * that must move.
 *
 * Everything is driven by one shared timer per family (not per-sprite tweens), and only
 * decoration inside the camera view is animated — off-screen decor is skipped entirely.
 */
export interface DecorStats {
  trees: number;
  rocks: number;
  ruins: number;
  torches: number;
  banners: number;
  glints: number;
  animatedThisFrame: number;
}

interface SwaySprite {
  img: Phaser.GameObjects.Image;
  phase: number;
  amp: number;
  baseScale: number;
}

export class EnvironmentSystem {
  /** Fog of war: decor in unexplored ground must not be visible. */
  vision: { isExploredWorld(x: number, y: number): boolean } | null = null;
  private trees: SwaySprite[] = [];
  private rocks: Phaser.GameObjects.Image[] = [];
  private ruins: Phaser.GameObjects.Image[] = [];
  private torches: SwaySprite[] = [];
  private banners: SwaySprite[] = [];
  private smokeAccum = 0;
  private t = 0;
  private glints: SwaySprite[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private backdrop: Phaser.GameObjects.Image[] = [];
  stats: DecorStats = { trees: 0, rocks: 0, ruins: 0, torches: 0, banners: 0, glints: 0, animatedThisFrame: 0 };

  constructor(
    private scene: Phaser.Scene,
    private map: GeneratedMap,
  ) {}

  /** Places decoration from the tile map plus hand-authored points (torches, banners). */
  /**
   * Background band (Visual Bible §2e): layered hill silhouettes pinned behind everything, hazed
   * toward the region fog so the map gets a horizon instead of ending in a hard edge.
   */
  buildBackdrop(region: keyof typeof REGION, worldW: number, worldH: number, seed: number): void {
    const R = REGION[region] ?? REGION.valley;
    for (let band = 0; band < DEPTH_LAYERS.background.bandHeights.length; band++) {
      const key = `backdrop_${region}_${band}`;
      if (!this.scene.textures.exists(key)) drawBackdropTexture(this.scene, key, R.ground, R.fog, seed + band * 7, band);
      const bandH = worldH * (1 - DEPTH_LAYERS.background.bandHeights[band]);
      const img = this.scene.add
        .image(0, worldH * DEPTH_LAYERS.background.bandHeights[band], key)
        .setOrigin(0, 0)
        .setDisplaySize(worldW, Math.max(120, bandH))
        .setDepth(DEPTH.BACKDROP + band * 0.01)
        .setAlpha(0.55 + band * 0.12)
        .setScrollFactor(1 - DEPTH_LAYERS.background.parallax * (3 - band));
      this.backdrop.push(img);
    }
  }

  build(extra: { torches: Array<{ x: number; y: number }>; banners: Array<{ x: number; y: number; color: number }>; ruins: Array<{ x: number; y: number }> }): void {
    const rng = (n: number) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    let n = 1;
    for (let ty = 0; ty < this.map.h; ty++) {
      for (let tx = 0; tx < this.map.w; tx++) {
        const t = tileAt(this.map, tx, ty);
        const x = tx * TILE + TILE / 2;
        const y = ty * TILE + TILE;
        if (t === Tile.TREE) {
          const v = (tx * 7 + ty * 13) % 3;
          const img = this.scene.add
            .image(x, y, `terrain_tree_${v}`)
            .setOrigin(0.5, 0.9)
            .setScale(metaOf(`terrain_tree_${v}`).sx * (0.92 + rng(n++) * 0.22))
            .setDepth(DEPTH.ENTITY + y * 0.01);
          this.trees.push({ img, phase: rng(n++) * Math.PI * 2, amp: 0.012 + rng(n++) * 0.014, baseScale: img.scaleX });
        } else if (t === Tile.ROCK) {
          const img = this.scene.add
            .image(x, y, 'terrain_rock')
            .setOrigin(0.5, 0.92)
            .setScale(metaOf('terrain_rock').sx * (0.9 + rng(n++) * 0.25))
            .setDepth(DEPTH.ENTITY + y * 0.01);
          this.rocks.push(img);
        }
      }
    }
    for (const r of extra.ruins) {
      const img = this.scene.add
        .image(r.x, r.y, 'decor_ruin')
        .setOrigin(0.5, 0.86)
        .setScale(metaOf('decor_ruin').sx)
        .setDepth(DEPTH.ENTITY + r.y * 0.01);
      this.ruins.push(img);
    }
    for (const tor of extra.torches) {
      const img = this.scene.add
        .image(tor.x, tor.y, 'decor_torch')
        .setOrigin(0.5, 0.88)
        .setScale(metaOf('decor_torch').sx)
        .setDepth(DEPTH.ENTITY + tor.y * 0.01);
      this.torches.push({ img, phase: rng(n++) * Math.PI * 2, amp: 0.1, baseScale: img.scaleX });
      // warm light pool on the ground (tracked so it hides with the torch)
      const glow = this.scene.add
        .image(tor.x, tor.y + 4, 'fx_glow_warm')
        .setScale(metaOf('fx_glow_warm').sx * 2.2)
        .setAlpha(0.22)
        .setDepth(DEPTH.DECAL + 4);
      this.glows.push(glow);
    }
    for (const b of extra.banners) {
      const img = this.scene.add
        .image(b.x, b.y, 'decor_banner')
        .setOrigin(0.5, 0.94)
        .setTint(b.color)
        .setScale(metaOf('decor_banner').sx)
        .setDepth(DEPTH.ENTITY + b.y * 0.01);
      this.banners.push({ img, phase: rng(n++) * Math.PI * 2, amp: 0.045, baseScale: img.scaleX });
    }
    this.stats = {
      trees: this.trees.length,
      rocks: this.rocks.length,
      ruins: this.ruins.length,
      torches: this.torches.length,
      banners: this.banners.length,
      glints: 0,
      animatedThisFrame: 0,
    };
  }

  /**
   * Water shimmer: a small pool of glints placed on water tiles that slowly fade in and
   * out. (Deliberately NOT a TileSprite: TileSprite calls `frame.setSize()` on the shared
   * source frame, which corrupts that texture for every other user of it.)
   */
  attachWaterShimmer(_worldW: number, _worldH: number): void {
    const water: Array<{ x: number; y: number }> = [];
    for (let ty = 0; ty < this.map.h; ty++) {
      for (let tx = 0; tx < this.map.w; tx++) {
        if (tileAt(this.map, tx, ty) !== Tile.WATER) continue;
        if ((tx * 7 + ty * 11) % 3 !== 0) continue;
        water.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
      }
    }
    const count = Math.min(water.length, 140);
    for (let i = 0; i < count; i++) {
      const spot = water[Math.floor((i / count) * water.length)];
      const img = this.scene.add
        .image(spot.x, spot.y, 'water_shimmer')
        .setScale(metaOf('water_shimmer').sx * 0.9)
        .setAlpha(0.12)
        .setDepth(DEPTH.DECAL + 5)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.glints.push({ img, phase: (i * 1.7) % (Math.PI * 2), amp: 0.16, baseScale: img.scaleX });
    }
    this.stats.glints = this.glints.length;
  }

  update(dt: number): void {
    this.t += dt;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const pad = 120;
    let animated = 0;

    const v = this.vision;
    // fog first: hide everything standing on unexplored ground, then only animate what is
    // both on screen and known to the player
    const fogged = (img: Phaser.GameObjects.Image): boolean => {
      if (!v) return false;
      const hidden = !v.isExploredWorld(img.x, img.y);
      if (img.visible === hidden) img.setVisible(!hidden);
      return hidden;
    };
    const inView = (img: Phaser.GameObjects.Image) => {
      if (fogged(img)) return false;
      return img.x > view.x - pad && img.x < view.right + pad && img.y > view.y - pad && img.y < view.bottom + pad;
    };
    for (const r of this.rocks) fogged(r);
    for (const r of this.ruins) fogged(r);
    for (const g of this.glows) fogged(g);

    // trees + banners sway; torches flicker. Off-screen decor is left untouched.
    for (const s of this.trees) {
      if (!inView(s.img)) continue;
      animated++;
      const a = Math.sin(this.t * 1.1 + s.phase) * s.amp + Math.sin(this.t * 2.7 + s.phase * 1.7) * s.amp * 0.35;
      s.img.setRotation(a);
      s.img.setScale(s.baseScale * (1 + Math.sin(this.t * 1.1 + s.phase) * 0.012), s.baseScale);
    }
    for (const s of this.banners) {
      if (!inView(s.img)) continue;
      animated++;
      const a = Math.sin(this.t * 2.2 + s.phase) * s.amp + Math.sin(this.t * 4.1 + s.phase) * s.amp * 0.4;
      s.img.setRotation(a);
      s.img.setScale(s.baseScale * (1 + Math.sin(this.t * 2.2 + s.phase) * 0.03), s.baseScale);
    }
    for (const s of this.torches) {
      if (!inView(s.img)) continue;
      animated++;
      const f = 0.92 + Math.sin(this.t * 9 + s.phase) * 0.06 + Math.sin(this.t * 17 + s.phase * 2) * 0.03;
      s.img.setScale(s.baseScale * f, s.baseScale * (2 - f) * 0.55 + s.baseScale * 0.45);
      s.img.setAlpha(0.9 + Math.sin(this.t * 11 + s.phase) * 0.1);
    }
    this.stats.animatedThisFrame = animated;

    // smoke rising from torches (cheap: a few puffs per second, only for visible torches)
    this.smokeAccum += dt;
    if (this.smokeAccum > 0.18) {
      this.smokeAccum = 0;
      for (const s of this.torches) {
        if (!inView(s.img)) continue;
        if (Math.random() > 0.5) continue;
        this.smokePuff?.(s.img.x + (Math.random() - 0.5) * 3, s.img.y - 14);
      }
    }

    for (const g of this.glints) {
      if (!inView(g.img)) continue;
      animated++;
      const a = 0.06 + (Math.sin(this.t * 1.6 + g.phase) * 0.5 + 0.5) * 0.2;
      g.img.setAlpha(a);
      g.img.setScale(g.baseScale * (0.8 + Math.sin(this.t * 1.6 + g.phase) * 0.25), g.baseScale * 0.55);
    }
  }

  /** Injected by the battle scene so torch smoke uses the pooled FX system. */
  smokePuff: ((x: number, y: number) => void) | null = null;

  /** Torch positions derived from a building footprint (corners of the entrance). */
  static torchesForBuilding(x: number, y: number, wTiles: number, hTiles: number, color: number): Array<{ x: number; y: number }> {
    const hw = (wTiles * TILE) / 2;
    const hh = (hTiles * TILE) / 2;
    void color;
    return [
      { x: x - hw + 6, y: y + hh - 6 },
      { x: x + hw - 6, y: y + hh - 6 },
    ];
  }

  dispose(): void {
    for (const s of this.trees) s.img.destroy();
    for (const r of this.rocks) r.destroy();
    for (const r of this.ruins) r.destroy();
    for (const s of this.torches) s.img.destroy();
    for (const s of this.banners) s.img.destroy();
    for (const g of this.glints) g.img.destroy();
    for (const g of this.glows) g.destroy();
    this.glows.length = 0;
    this.glints.length = 0;
    this.trees.length = 0;
    this.rocks.length = 0;
    this.ruins.length = 0;
    this.torches.length = 0;
    this.banners.length = 0;
  }

  static shade = shade;
}
