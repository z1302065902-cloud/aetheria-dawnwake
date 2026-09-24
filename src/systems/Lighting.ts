import Phaser from 'phaser';
import { DEPTH, TILE } from '../config/Constants';
import { LIGHT, REGION, shade, toCss } from '../art/VisualBible';

/**
 * Region lighting (Visual Bible §6).
 *
 * The single cheapest thing that turns a flat top-down map into a game: an ambient tint over
 * the world, a rim/key highlight pass, and a contact shadow under everything. This system owns
 * the ambient layer; the per-entity AO and rim light are baked into each sprite at generation
 * time (see UnitRenderer/SpriteFactory) because doing it per frame costs too much.
 *
 * Depth: above the terrain and decals, below entities, so it tints the ground but not the
 * units standing on it — which is what keeps silhouettes readable.
 */
export class LightingSystem {
  private ambient: Phaser.GameObjects.Rectangle | null = null;
  private keyLight: Phaser.GameObjects.Rectangle | null = null;
  private pulseT = 0;

  constructor(private scene: Phaser.Scene) {}

  /** Paints the region's ambient wash over the whole map. Called once per match. */
  build(region: keyof typeof REGION, worldW: number, worldH: number): void {
    const r = REGION[region] ?? REGION.valley;
    const tod = LIGHT.timeOfDay.day;
    // ambient wash: MULTIPLY so it darkens/tints the terrain instead of greying it out
    this.ambient = this.scene.add
      .rectangle(0, 0, worldW, worldH, r.ambient, r.ambientAlpha * 0.7)
      .setOrigin(0, 0)
      .setDepth(DEPTH.DECAL + 6)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    // key light: a very soft additive wash from the top-left, which is where the baked rim
    // light and contact shadows already agree the sun is. Kept at ~3% on purpose: any more
    // washes the region's own ground colour out and the bible's region palette stops reading.
    this.keyLight = this.scene.add
      .rectangle(0, 0, worldW, worldH, LIGHT.key.color, LIGHT.key.strength * 0.3)
      .setOrigin(0, 0)
      .setDepth(DEPTH.DECAL + 7)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Slow breathing so the light does not look like a static filter. */
  update(dt: number): void {
    if (!this.ambient) return;
    this.pulseT += dt;
    this.keyLight?.setAlpha(1 - Math.abs(Math.sin(this.pulseT * 0.25)) * 0.12);
  }

  dispose(): void {
    this.ambient?.destroy();
    this.keyLight?.destroy();
    this.ambient = null;
    this.keyLight = null;
  }

  /** Where the key light comes from — used by the sprite baker so AO agrees with it. */
  static get keyDirection(): { x: number; y: number } {
    return { x: LIGHT.key.dirX, y: LIGHT.key.dirY };
  }

  /** Contact shadow geometry for a given footprint (shared by units and buildings). */
  static contactShadow(radius: number, kind: 'unit' | 'building' | 'decor' = 'unit'): {
    rx: number;
    ry: number;
    alpha: number;
    color: string;
  } {
    const ao = LIGHT.ao;
    return {
      rx: radius * 1.05,
      ry: radius * ao.squash,
      alpha: ao.alpha[kind],
      color: toCss(ao.color),
    };
  }

  /** Faction-tinted rim light colour for gold/hero highlights. */
  static rimColor(signal: number, boost: number, base = 0xfff0d0): number {
    return shade(Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(base),
      Phaser.Display.Color.IntegerToColor(signal),
      100,
      Math.round(boost * 100),
    ).color ?? signal, 0);
  }

  static readonly TILE = TILE;
}
