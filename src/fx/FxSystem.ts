import Phaser from 'phaser';
import { DEPTH } from '../config/Constants';
import { ELEMENT, SPECIAL, VFX } from '../art/VisualBible';
import { Pool } from '../core/Pool';
import { FloatingText } from '../world/Projectile';
import { metaOf } from '../art/SpriteFactory';

type ShakeTier = 'light' | 'heavy' | 'ultimate';

interface FxItem {
  img: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  gravity: number;
  scale0: number;
  scale1: number;
  alpha0: number;
  alpha1: number;
  rotSpeed: number;
  additive: boolean;
}

export interface FxSpawnOptions {
  texture: string;
  x: number;
  y: number;
  life?: number;
  vx?: number;
  vy?: number;
  gravity?: number;
  scale0?: number;
  scale1?: number;
  alpha0?: number;
  alpha1?: number;
  rotSpeed?: number;
  rotation?: number;
  depth?: number;
  additive?: boolean;
  tint?: number;
}

/**
 * Combat feedback layer.
 *
 * Everything here is pooled: one-shot effects come from a fixed pool of sprites that are
 * driven by a manual integrator (no tweens, no per-frame allocation), and floating text
 * comes from its own pool. That is what keeps a 60-unit brawl from turning into a GC storm.
 *
 * Camera shake runs through a priority budget: light shakes are rate-limited and never
 * override a heavier one, so the screen does not vibrate during a big fight.
 */
export class FxSystem {
  /**
   * Region impact palette (Visual Bible §4b): a forest hit must not leave the same grey dust as
   * a stone fortress. Set by the battle scene from LightingSystem.
   */
  regionTint: { smoke: number; residue: number; debris: number } | null = null;
  private scene: Phaser.Scene;
  private items: Pool<FxItem>;
  private texts: Pool<FloatingText>;
  private shakeTier: ShakeTier | null = null;
  private shakeUntil = 0;
  private lastLightShake = -1;
  private now = 0;
  /** counters for the perf tests */
  spawnCount = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.items = new Pool<FxItem>(
      () => {
        const img = scene.add.image(0, 0, 'fx_spark_warm').setDepth(DEPTH.FX).setVisible(false);
        return {
          img,
          life: 0,
          maxLife: 1,
          vx: 0,
          vy: 0,
          gravity: 0,
          scale0: 1,
          scale1: 0,
          alpha0: 1,
          alpha1: 0,
          rotSpeed: 0,
          additive: true,
        };
      },
      (it) => {
        it.img.setVisible(true).setActive(true);
      },
      (it) => {
        it.img.setVisible(false).setActive(false);
      },
      220,
    );

    this.texts = new Pool<FloatingText>(
      () => {
        const ft = new FloatingText();
        ft.label = scene.add
          .text(0, 0, '', { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '15px', color: '#fff', stroke: '#0b0f18', strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.FX + 5)
          .setVisible(false);
        return ft;
      },
      (ft) => {
        ft.label?.setVisible(true).setAlpha(1).setScale(1);
      },
      (ft) => {
        ft.active = false;
        ft.label?.setVisible(false);
      },
      48,
    );
  }

  // ────────────────────────── pool plumbing ──────────────────────────

  spawn(o: FxSpawnOptions): void {
    const it = this.items.acquire();
    this.spawnCount++;
    const meta = metaOf(o.texture);
    it.img
      .setTexture(o.texture)
      .setPosition(o.x, o.y)
      .setDepth(o.depth ?? DEPTH.FX)
      .setRotation(o.rotation ?? 0)
      .setBlendMode(o.additive === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setAlpha(o.alpha0 ?? 1);
    if (o.tint !== undefined) it.img.setTint(o.tint);
    else it.img.clearTint();
    const s0 = (o.scale0 ?? 1) * meta.sx;
    const s1 = (o.scale1 ?? 0) * meta.sx;
    it.img.setScale(s0);
    it.life = o.life ?? 0.4;
    it.maxLife = it.life;
    it.vx = o.vx ?? 0;
    it.vy = o.vy ?? 0;
    it.gravity = o.gravity ?? 0;
    it.scale0 = s0;
    it.scale1 = s1;
    it.alpha0 = o.alpha0 ?? 1;
    it.alpha1 = o.alpha1 ?? 0;
    it.rotSpeed = o.rotSpeed ?? 0;
    it.additive = o.additive !== false;
  }

  private sparkBurst(x: number, y: number, count: number, texture: string, opts: { speed: number; life: number; scale: number; gravity?: number; biasX?: number; biasY?: number; tint?: number; depth?: number }): void {
    const biasX = opts.biasX ?? 0;
    const biasY = opts.biasY ?? 0;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = opts.speed * (0.35 + Math.random() * 0.75);
      this.spawn({
        texture,
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(a) * sp + biasX,
        vy: Math.sin(a) * sp * 0.7 + biasY - opts.speed * 0.15,
        gravity: opts.gravity ?? 160,
        life: opts.life * (0.6 + Math.random() * 0.6),
        scale0: opts.scale * (0.7 + Math.random() * 0.6),
        scale1: 0,
        rotSpeed: (Math.random() - 0.5) * 8,
        tint: opts.tint,
        depth: opts.depth,
      });
    }
  }

  // ────────────────────────── combat feedback ──────────────────────────

  /** Impact at a hit point. `dirX/dirY` biases the spray along the hit direction. */
  hit(x: number, y: number, kind: 'physical' | 'magic' | 'siege' | 'blood' = 'physical', power = 1, dirX = 0, dirY = 0): void {
    const bias = { biasX: dirX * 90, biasY: dirY * 50 };
    if (kind === 'magic') {
      this.sparkBurst(x, y, 8, 'fx_spark_arc', { speed: 150, life: 0.34, scale: 1.1 * power, tint: ELEMENT.frost.core, ...bias });
      this.spawn({ texture: 'fx_glow_cool', x, y, life: 0.26, scale0: 1.4 * power, scale1: 2.4 * power });
    } else if (kind === 'siege') {
      this.sparkBurst(x, y, 12, 'fx_spark_warm', { speed: 200, life: 0.4, scale: 1.3 * power, gravity: 320, tint: ELEMENT.holy.core, ...bias });
      this.sparkBurst(x, y, 6, 'fx_smoke', { speed: 70, life: 0.7, scale: 1.5, gravity: -30, tint: this.regionTint?.smoke ?? 0x8a8478, depth: DEPTH.FX - 1 });
    } else if (kind === 'blood') {
      this.sparkBurst(x, y, 7, 'fx_spark_blood', { speed: 130, life: 0.42, scale: 1 * power, gravity: 300, tint: 0xd94a4a, ...bias });
    } else {
      this.sparkBurst(x, y, 7, 'fx_spark_warm', { speed: 170, life: 0.24, scale: 1 * power, gravity: 140, tint: 0xffe2a0, ...bias });
      this.spawn({ texture: 'fx_glow_warm', x, y, life: 0.18, scale0: 0.9 * power, scale1: 1.5 * power });
    }
  }

  /** Bigger, gold, unmistakable critical hit. */
  critBurst(x: number, y: number, dirX = 0, dirY = 0): void {
    this.sparkBurst(x, y, 16, 'fx_spark_warm', { speed: 260, life: 0.5, scale: 1.7, gravity: 240, tint: SPECIAL.crit, biasX: dirX * 120, biasY: dirY * 70 });
    this.spawn({ texture: 'fx_ring_warm', x, y, life: 0.3, scale0: 0.3, scale1: 2.2, alpha0: 0.95 });
    this.spawn({ texture: 'fx_glow_warm', x, y, life: 0.32, scale0: 1.6, scale1: 3.2 });
    this.shake(3, 0.12, 'light');
  }

  slash(x: number, y: number, angle: number, dark = false): void {
    this.spawn({
      texture: dark ? 'fx_slash_dark' : 'fx_slash',
      x,
      y,
      rotation: angle,
      life: 0.18,
      scale0: 1.1,
      scale1: 1.7,
      alpha0: 1,
    });
  }

  muzzle(x: number, y: number, angle: number, warm = true): void {
    this.spawn({
      texture: warm ? 'fx_glow_warm' : 'fx_glow_cool',
      x,
      y,
      rotation: angle,
      life: 0.12,
      scale0: 0.7,
      scale1: 0.4,
      alpha0: 0.9,
    });
  }

  /** Generic pooled burst (kept as a small API for hero abilities). */
  burst(texture: string, x: number, y: number, count: number, speed: number, life: number, scale: number, gravity = 0, tint?: number): void {
    this.sparkBurst(x, y, count, texture, { speed, life, scale, gravity, tint });
  }

  /** Short projectile trail puff. */
  trail(x: number, y: number, magic: boolean, size = 0.5): void {
    this.spawn({
      texture: magic ? 'fx_glow_cool' : 'fx_smoke',
      x,
      y,
      life: magic ? 0.22 : 0.34,
      scale0: size,
      scale1: 0.1,
      alpha0: magic ? 0.75 : 0.35,
      additive: magic,
      depth: DEPTH.PROJECTILE - 1,
      tint: magic ? undefined : 0x9a9488,
    });
  }

  explosion(x: number, y: number, radius: number, magic = false, small = false): void {
    const scale = radius / 26;
    this.spawn({
      texture: magic ? 'fx_ring_cool' : 'fx_ring_warm',
      x,
      y,
      life: small ? 0.28 : 0.38,
      scale0: 0.2,
      scale1: scale * (small ? 0.8 : 1.15),
      alpha0: 0.95,
    });
    this.spawn({
      texture: magic ? 'fx_glow_void' : 'fx_glow_warm',
      x,
      y,
      life: 0.34,
      scale0: scale * 0.9,
      scale1: scale * 1.7,
      alpha0: 0.9,
    });
    this.sparkBurst(x, y, small ? 10 : 18, magic ? 'fx_spark_arc' : 'fx_spark_warm', {
      speed: magic ? 230 : 270,
      life: 0.5,
      scale: 1.6,
      gravity: 170,
      tint: magic ? ELEMENT.frost.core : ELEMENT.fire.core,
    });
    this.sparkBurst(x, y, small ? 4 : 9, 'fx_smoke', { speed: 90, life: 0.8, scale: 1.9, gravity: -30, tint: this.regionTint?.smoke ?? 0x6f6a62, depth: DEPTH.FX - 1 });
    this.shake(small ? 2.5 : Math.min(8, radius / 14), small ? 0.12 : 0.24, 'heavy');
  }

  /** Burning ground left behind by fire/meteor — long-lived, fades out. */
  scorch(x: number, y: number, radius: number, magic = false): void {
    this.spawn({
      texture: magic ? 'fx_glow_void' : 'fx_glow_warm',
      x,
      y,
      life: 9,
      scale0: radius / 22,
      scale1: radius / 30,
      alpha0: 0.35,
      alpha1: 0,
      additive: false,
      depth: DEPTH.DECAL + 2,
      tint: magic ? ELEMENT.void.core : ELEMENT.fire.residue,
    });
  }

  /** A rock falling from the sky onto a target point (meteor skills). */
  fallingRock(x: number, y: number, delayMs: number, radius: number, color: number = ELEMENT.fire.core): void {
    const life = Math.max(0.15, delayMs / 1000);
    this.spawn({
      texture: 'p_boulder',
      x,
      y: y - 260,
      life,
      vx: 0,
      vy: 260 / life,
      gravity: 320,
      scale0: 0.8 + radius / 90,
      scale1: 1.1 + radius / 70,
      alpha0: 1,
      alpha1: 1,
      rotSpeed: 3.2,
      additive: false,
      tint: 0x6b5a4a,
    });
    // burning trail behind it
    for (let i = 0; i < 10; i++) {
      this.spawn({
        texture: 'fx_glow_warm',
        x: x + (Math.random() - 0.5) * 14,
        y: y - 250 + i * 24,
        life: life * 0.9 + 0.2,
        scale0: 1.1,
        scale1: 0.1,
        alpha0: 0.55,
        alpha1: 0,
        tint: color,
      });
    }
  }

  /** Ground telegraph for an incoming AoE (boss slam, meteor, arrow rain). */
  telegraph(x: number, y: number, radius: number, durationMs: number, color: number = SPECIAL.boss): void {
    const life = Math.max(0.12, durationMs / 1000);
    this.spawn({
      texture: 'fx_ring_danger',
      x,
      y,
      life,
      scale0: (radius / 34) * 0.6,
      scale1: radius / 34,
      alpha0: 0.9,
      alpha1: 0.5,
      additive: false,
      tint: color,
      depth: DEPTH.DECAL + 3,
    });
    this.spawn({
      texture: 'fx_ring_danger',
      x,
      y,
      life,
      scale0: radius / 34,
      scale1: (radius / 34) * 1.04,
      alpha0: 0.55,
      alpha1: 0.15,
      additive: true,
      tint: color,
      depth: DEPTH.DECAL + 3,
    });
  }

  /** Dust + smoke puff when something dies (the sprite itself plays the collapse). */
  deathDust(x: number, y: number, radius: number): void {
    const count = Math.min(12, 5 + Math.round(radius * 0.25));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 22 + Math.random() * 34;
      this.spawn({
        texture: 'fx_smoke',
        x: x + Math.cos(a) * 4,
        y: y - 4 + Math.sin(a) * 3,
        vx: Math.cos(a) * sp,
        vy: -12 - Math.random() * 18,
        gravity: -6,
        life: 0.7 + Math.random() * 0.5,
        scale0: 0.7 + Math.random() * 0.5,
        scale1: 1.9 + Math.random() * 0.6,
        alpha0: 0.5,
        alpha1: 0,
        additive: false,
        tint: 0x8d867a,
        depth: DEPTH.CORPSE + 1,
      });
    }
    this.sparkBurst(x, y - 4, 4, 'fx_spark_blood', { speed: 90, life: 0.4, scale: 0.9, gravity: 280, tint: 0xb03a3a });
  }

  levelUp(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      this.spawn({
        texture: 'fx_ring_warm',
        x,
        y,
        life: 0.62,
        scale0: 0.2,
        scale1: 1.7 + i * 0.3,
        alpha0: 0.9,
        rotation: i * 0.4,
      });
    }
    this.sparkBurst(x, y, 22, 'fx_spark_warm', { speed: 170, life: 1, scale: 1.5, gravity: -120, tint: SPECIAL.crit });
  }

  /** Sky sigil for meteor-style spells (rotating magic circle above the target). */
  skySigil(x: number, y: number, durationMs: number, color: number = ELEMENT.fire.core): void {
    const life = Math.max(0.2, durationMs / 1000);
    this.spawn({
      texture: 'fx_ring_warm',
      x,
      y: y - 130,
      life,
      scale0: 0.4,
      scale1: 1.5,
      alpha0: 0.9,
      alpha1: 0.2,
      rotSpeed: 2.4,
      tint: color,
      depth: DEPTH.FX - 2,
    });
    this.spawn({
      texture: 'fx_ring_warm',
      x,
      y: y - 130,
      life,
      scale0: 1.1,
      scale1: 0.6,
      alpha0: 0.6,
      alpha1: 0.1,
      rotSpeed: -1.6,
      tint: color,
      depth: DEPTH.FX - 2,
    });
  }

  damageText(x: number, y: number, amount: number, kind: 'damage' | 'crit' | 'heal' | 'mana' | 'xp' = 'damage'): void {
    const ft = this.texts.acquire();
    if (!ft.label) return;
    ft.active = true;
    ft.x = x + Phaser.Math.Between(-8, 8);
    ft.y = y - 12;
    ft.life = kind === 'crit' ? 1.15 : 0.85;
    ft.maxLife = ft.life;
    ft.vy = kind === 'crit' ? -52 : -34;
    const label =
      kind === 'crit' ? `${Math.round(amount)}!` : kind === 'heal' ? `+${Math.round(amount)}` : kind === 'xp' ? `+${Math.round(amount)} XP` : `${Math.round(amount)}`;
    ft.label.setText(label);
    ft.label.setColor(kind === 'crit' ? '#ffd257' : kind === 'heal' ? '#7dff9b' : kind === 'mana' ? '#7fd8ff' : kind === 'xp' ? '#c084fc' : '#ffffff');
    ft.label.setFontSize(kind === 'crit' ? 23 : kind === 'xp' ? 14 : 15);
    ft.label.setPosition(ft.x, ft.y);
    ft.label.setDepth(DEPTH.FX + 5);
    if (kind === 'crit') {
      ft.label.setScale(1.35);
      this.scene.tweens.add({ targets: ft.label, scaleX: 1, scaleY: 1, duration: 160 });
    }
  }

  // ────────────────────────── camera shake budget ──────────────────────────

  /**
   * Priority shake: 'light' (normal hits) is rate limited and can never override a heavier
   * shake; 'ultimate' (boss death / meteor) always wins. Keeps a 60-unit brawl from
   * turning the screen into jelly.
   */
  shake(amp: number, duration: number, tier: ShakeTier = 'light'): void {
    const now = this.now;
    if (tier === 'light') {
      if (this.shakeTier === 'heavy' || this.shakeTier === 'ultimate') return;
      if (now - this.lastLightShake < 0.22) return;
      this.lastLightShake = now;
      amp = Math.min(amp, 2.2);
    } else if (tier === 'heavy') {
      if (this.shakeTier === 'ultimate' && now < this.shakeUntil) return;
      amp = Math.min(amp, 7);
    } else {
      amp = Math.min(amp, 14);
    }
    this.shakeTier = tier;
    this.shakeUntil = now + duration;
    this.scene.cameras.main.shake(duration * 1000, amp / 1000, false);
  }

  // ────────────────────────── frame ──────────────────────────

  update(dt: number): void {
    this.now += dt;
    if (this.shakeTier && this.now >= this.shakeUntil) this.shakeTier = null;

    this.items.forEachSafe((it) => {
      it.life -= dt;
      if (it.life <= 0) {
        this.items.release(it);
        return;
      }
      const t = 1 - it.life / it.maxLife;
      it.vy += it.gravity * dt;
      it.img.x += it.vx * dt;
      it.img.y += it.vy * dt;
      if (it.rotSpeed) it.img.rotation += it.rotSpeed * dt;
      it.img.setScale(it.scale0 + (it.scale1 - it.scale0) * t);
      it.img.setAlpha(Math.max(0, it.alpha0 + (it.alpha1 - it.alpha0) * t));
    });

    this.texts.forEachSafe((ft) => {
      ft.life -= dt;
      if (ft.life <= 0) {
        this.texts.release(ft);
        return;
      }
      ft.y += ft.vy * dt;
      ft.vy += 42 * dt;
      const t = ft.life / ft.maxLife;
      ft.label?.setPosition(ft.x, ft.y);
      ft.label?.setAlpha(Math.min(1, t * 1.6));
    });
  }

  get activeEffects(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.forEachSafe((it) => this.items.release(it));
    this.texts.forEachSafe((ft) => this.texts.release(ft));
  }
}
