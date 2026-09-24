import Phaser from 'phaser';
import { DEPTH, TILE } from '../config/Constants';
import { LIGHT, REGION, REGION_VFX, toCss } from '../art/VisualBible';
import { metaOf } from '../art/SpriteFactory';

type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
type RegionKey = keyof typeof REGION;

interface Mote {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  phase: number;
  baseY: number;
  /** 0..1 blink phase for the firefly layer */
  blink: number;
  layer: 'mote' | 'spark';
}

/**
 * Region lighting + atmosphere (Visual Bible §4b / §6).
 *
 * Three layers, all of them cheap:
 *   1. ambient wash  — a MULTIPLY rectangle over the ground, tinted by the region and the
 *      mission's time of day. Sits BELOW entities so silhouettes stay crisp.
 *   2. key light     — a ~3% ADD wash from the upper-left, agreeing with every baked rim light
 *      and contact shadow.
 *   3. region motes  — drifting particles that make each biome feel like a place: pollen in the
 *      valley, leaves and fireflies in the forest, ash and void wisps in the fortress, embers in
 *      the boss arena. They drift in world space and are culled to the camera view.
 */
export class LightingSystem {
  /** exposed so tests and the HUD can report what the match is lit with */
  ambient: Phaser.GameObjects.Rectangle | null = null;
  private keyLight: Phaser.GameObjects.Rectangle | null = null;
  private motes: Mote[] = [];
  private region: RegionKey = 'valley';
  private tod: TimeOfDay = 'day';
  private pulseT = 0;

  constructor(private scene: Phaser.Scene) {}

  /** Paints the region's ambient wash and spawns its drifting motes. Once per match. */
  build(region: RegionKey, worldW: number, worldH: number, timeOfDay: TimeOfDay = 'day'): void {
    this.region = REGION[region] ? region : 'valley';
    this.tod = timeOfDay;
    const r = REGION[this.region];
    const tod = LIGHT.timeOfDay[timeOfDay] ?? LIGHT.timeOfDay.day;

    // 1. ambient wash — MULTIPLY so it tints/darkens the terrain instead of greying it out
    this.ambient = this.scene.add
      .rectangle(0, 0, worldW, worldH, r.ambient, r.ambientAlpha * 0.7 * (tod.alpha / 0.1))
      .setOrigin(0, 0)
      .setDepth(DEPTH.DECAL + 6)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    // 2. key light — a very soft additive wash from the top-left. Kept at ~3% on purpose: any
    // more washes the region's own ground colour out and the region palette stops reading.
    this.keyLight = this.scene.add
      .rectangle(0, 0, worldW, worldH, LIGHT.key.color, LIGHT.key.strength * tod.keyStrength)
      .setOrigin(0, 0)
      .setDepth(DEPTH.DECAL + 7)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.buildMotes(worldW, worldH);
  }

  /** 3. region motes: two layers, both preallocated (no per-frame allocation). */
  private buildMotes(worldW: number, worldH: number): void {
    for (const m of this.motes) m.sprite.destroy();
    this.motes = [];
    const vfx = REGION_VFX[this.region];
    for (const layer of ['mote', 'spark'] as const) {
      const cfg = layer === 'mote' ? vfx.mote : vfx.spark;
      if (!cfg) continue;
      // the firefly layer only comes out when it is dark enough to see it
      if (layer === 'spark' && this.tod === 'day') continue;
      for (let i = 0; i < cfg.count; i++) {
        const x = Math.random() * worldW;
        const y = Math.random() * worldH;
        const meta = metaOf('fx_glow_warm');
        const sprite = this.scene.add
          .image(x, y, 'fx_glow_warm')
          .setDisplaySize(cfg.size * 3.2, cfg.size * 3.2)
          .setAlpha(cfg.alpha)
          .setTint(cfg.color)
          .setDepth(DEPTH.DECAL + 8);
        sprite.setBlendMode(layer === 'spark' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        void meta;
        this.motes.push({
          sprite,
          vx: (Math.random() - 0.5) * vfx.mote.driftX,
          vy: vfx.mote.driftY * (0.5 + Math.random()),
          phase: Math.random() * Math.PI * 2,
          baseY: y,
          blink: Math.random(),
          layer,
        });
      }
    }
  }

  update(dt: number, view?: { x: number; y: number; right: number; bottom: number }): void {
    this.pulseT += dt;
    this.keyLight?.setAlpha(1 - Math.abs(Math.sin(this.pulseT * 0.25)) * 0.12);
    const vfx = REGION_VFX[this.region];
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    for (const m of this.motes) {
      m.phase += dt;
      m.sprite.x += m.vx * dt;
      m.sprite.y += m.vy * dt;
      // wrap in world space, relative to the view so density stays even
      if (view) {
        if (m.sprite.y < view.y - 40) m.sprite.y = view.bottom + 40;
        if (m.sprite.x < view.x - 40) m.sprite.x = view.right + 40;
        if (m.sprite.x > view.right + 40) m.sprite.x = view.x - 40;
        if (m.sprite.y > view.bottom + 40) m.sprite.y = view.y - 40;
        m.sprite.setVisible(m.sprite.x > view.x - 60 && m.sprite.x < view.right + 60 && m.sprite.y > view.y - 60 && m.sprite.y < view.bottom + 60);
      }
      if (m.layer === 'spark' && vfx.spark) {
        // fireflies blink — only visible when it is dark enough for them
        const b = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(m.phase * (2 / vfx.spark.blink)));
        m.sprite.setAlpha(vfx.spark.alpha * b);
      } else {
        m.sprite.setAlpha(vfx.mote.alpha * (0.7 + 0.3 * Math.sin(m.phase * vfx.mote.bob)));
      }
    }
    void w;
    void h;
  }

  /** Tint a hit's smoke/residue with the region so a forest impact does not look like a city one. */
  impactTint(kind: 'smoke' | 'residue' | 'debris'): number {
    return REGION_VFX[this.region].impact[kind];
  }

  get view(): { region: RegionKey; timeOfDay: TimeOfDay; motes: number; ambientAlpha: number } {
    return {
      region: this.region,
      timeOfDay: this.tod,
      motes: this.motes.length,
      // the wash is drawn with a FILL alpha: `.alpha` is the GameObject alpha and is always 1
      ambientAlpha: this.ambient ? this.ambient.fillAlpha : 0,
    };
  }

  dispose(): void {
    this.ambient?.destroy();
    this.keyLight?.destroy();
    for (const m of this.motes) m.sprite.destroy();
    this.motes = [];
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
    return { rx: radius * 1.05, ry: radius * ao.squash, alpha: ao.alpha[kind], color: toCss(ao.color) };
  }

  static readonly TILE = TILE;
}
