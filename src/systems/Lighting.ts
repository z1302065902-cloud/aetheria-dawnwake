import Phaser from 'phaser';
import { DEPTH, TILE } from '../config/Constants';
import {
  LIGHT,
  REGION,
  REGION_VFX,
  WEATHER,
  BOSS_IDENTITY,
  toCss,
  type BossIdentity,
} from '../art/VisualBible';
import { metaOf } from '../art/SpriteFactory';

type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
type WeatherKey = 'clear' | 'mist' | 'ash' | 'rain' | 'snow' | 'magic';
type WeatherStyle = (typeof WEATHER)[WeatherKey];
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
  private weather: WeatherStyle | null = null;
  private weatherSprites: Phaser.GameObjects.Image[] = [];
  private mistSprites: Phaser.GameObjects.Image[] = [];
  /** boss override: while a boss is alive the arena takes on its colour identity */
  private bossOverride: BossIdentity | null = null;
  private baseAmbient = { color: 0, alpha: 0 };
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

    this.baseAmbient = { color: r.ambient, alpha: this.ambient.fillAlpha };
    this.buildMotes(worldW, worldH);
    this.setWeather(this.weatherForRegion(region, timeOfDay), worldW, worldH);
  }

  /** Which weather a region uses by default (Visual Bible §2d: must not hurt readability). */
  private weatherForRegion(region: RegionKey, tod: TimeOfDay): WeatherKey {
    if (region === 'arena') return 'ash';
    if (region === 'forest') return 'mist';
    if (region === 'fortress') return tod === 'night' ? 'ash' : 'rain';
    return 'clear';
  }

  /**
   * Weather layer. Deliberately thin: it must never compete with units for attention, so the
   * alphas stay low and the mist bands are the only large shapes.
   */
  setWeather(kind: WeatherKey, worldW: number, worldH: number): void {
    for (const sp of this.weatherSprites) sp.destroy();
    for (const sp of this.mistSprites) sp.destroy();
    this.weatherSprites = [];
    this.mistSprites = [];
    const w = WEATHER[kind];
    this.weather = w;
    if (w.kind === 'none' || w.count === 0) return;
    for (let i = 0; i < w.count; i++) {
      const sp = this.scene.add
        .image(Math.random() * worldW, Math.random() * worldH, 'fx_glow_warm')
        .setDisplaySize(w.size * 2.4, w.size * (w.kind === 'rain' ? 7 : 2.4))
        .setAlpha(w.alpha)
        .setTint(w.color)
        .setDepth(w.kind === 'rain' || w.kind === 'snow' ? DEPTH.FX - 1 : DEPTH.DECAL + 8);
      if (w.kind === 'magic' || w.kind === 'ash') sp.setBlendMode(Phaser.BlendModes.ADD);
      this.weatherSprites.push(sp);
    }
    if (w.mist > 0) {
      for (let i = 0; i < 7; i++) {
        this.mistSprites.push(
          this.scene.add
            .image(Math.random() * worldW, Math.random() * worldH, 'fx_glow_warm')
            .setDisplaySize(420 + Math.random() * 320, 150 + Math.random() * 90)
            .setAlpha(w.mist)
            .setTint(w.color)
            .setDepth(DEPTH.DECAL + 9),
        );
      }
    }
  }

  /**
   * Boss arrival: the whole arena re-lights in the boss's own colour identity (Visual Bible
   * §2b / §20). Pass null to go back to the region's ambient.
   */
  setBossIdentity(unitId: string | null): void {
    const id = unitId ? BOSS_IDENTITY[unitId] : null;
    this.bossOverride = id ?? null;
    if (!this.ambient) return;
    if (id) {
      this.ambient.setFillStyle(id.arena.ambient, Math.max(0.14, id.arena.alpha * 0.55));
    } else {
      this.ambient.setFillStyle(this.baseAmbient.color, this.baseAmbient.alpha);
    }
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
    this.updateWeather(dt, view);
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

  private updateWeather(dt: number, view?: { x: number; y: number; right: number; bottom: number }): void {
    const w = this.weather;
    if (!w || w.kind === 'none') return;
    for (const sp of this.weatherSprites) {
      sp.y += w.fall * dt;
      sp.x += w.drift * dt + Math.sin(this.pulseT + sp.x * 0.01) * 0.4 * dt;
      if (view) {
        if (sp.y > view.bottom + 40) {
          sp.y = view.y - 40;
          sp.x = view.x + Math.random() * (view.right - view.x);
        }
        if (sp.y < view.y - 40) {
          sp.y = view.bottom + 40;
          sp.x = view.x + Math.random() * (view.right - view.x);
        }
        if (sp.x > view.right + 60) sp.x = view.x - 60;
        if (sp.x < view.x - 60) sp.x = view.right + 60;
        sp.setVisible(sp.x > view.x - 80 && sp.x < view.right + 80 && sp.y > view.y - 80 && sp.y < view.bottom + 80);
      }
      if (w.kind === 'magic' || w.kind === 'ash') sp.setAlpha(w.alpha * (0.6 + 0.4 * Math.sin(this.pulseT * 2 + sp.y * 0.05)));
    }
    for (const m of this.mistSprites) {
      m.x += 6 * dt;
      if (view && m.x - m.displayWidth / 2 > view.right + 100) m.x = view.x - m.displayWidth / 2;
      m.setAlpha(w.mist * (0.75 + 0.25 * Math.sin(this.pulseT * 0.4 + m.y * 0.01)));
    }
  }

  /** Tint a hit's smoke/residue with the region so a forest impact does not look like a city one. */
  impactTint(kind: 'smoke' | 'residue' | 'debris'): number {
    return REGION_VFX[this.region].impact[kind];
  }

  get view(): {
    region: RegionKey;
    timeOfDay: TimeOfDay;
    motes: number;
    weather: string;
    weatherParticles: number;
    bossIdentity: string | null;
    ambientAlpha: number;
    ambientColor: number;
  } {
    return {
      region: this.region,
      timeOfDay: this.tod,
      motes: this.motes.length,
      weather: this.weather?.name ?? '无',
      weatherParticles: this.weatherSprites.length,
      bossIdentity: this.bossOverride?.name ?? null,
      // the wash is drawn with a FILL alpha: `.alpha` is the GameObject alpha and is always 1
      ambientAlpha: this.ambient ? this.ambient.fillAlpha : 0,
      ambientColor: this.ambient ? this.ambient.fillColor : 0,
    };
  }

  dispose(): void {
    this.ambient?.destroy();
    this.keyLight?.destroy();
    for (const m of this.motes) m.sprite.destroy();
    for (const sp of this.weatherSprites) sp.destroy();
    for (const sp of this.mistSprites) sp.destroy();
    this.weatherSprites = [];
    this.mistSprites = [];
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
