import Phaser from 'phaser';
import { DEPTH } from '../config/Constants';
import { Pool } from '../core/Pool';
import { FloatingText } from '../world/Projectile';
import { metaOf } from '../art/SpriteFactory';

/**
 * Combat feedback layer. Every attack in the game routes through here so the player
 * always gets: hit spark + damage number + flash + sound hook + optional shake.
 */
export class FxSystem {
  private scene: Phaser.Scene;
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private texts: Pool<FloatingText>;
  private shakeT = 0;
  private shakeAmp = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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
      40,
    );
  }

  private emitter(key: string, texture: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): Phaser.GameObjects.Particles.ParticleEmitter {
    let em = this.emitters.get(key);
    if (!em) {
      em = this.scene.add.particles(0, 0, texture, { ...config, emitting: false }).setDepth(DEPTH.FX);
      this.emitters.set(key, em);
    }
    return em;
  }

  burst(texture: string, x: number, y: number, count: number, speed: number, life: number, scale: number, gravity = 0, tint?: number): void {
    const key = `b_${texture}_${count}_${speed}_${life}_${scale}_${gravity}_${tint ?? 0}`;
    const em = this.emitter(key, texture, {
      speed: { min: speed * 0.35, max: speed },
      lifespan: { min: life * 0.5, max: life },
      scale: { start: scale, end: 0 },
      quantity: count,
      blendMode: 'ADD',
      gravityY: gravity,
      tint,
    });
    em.explode(count, x, y);
  }

  /** Melee / ranged impact. */
  hit(x: number, y: number, kind: 'physical' | 'magic' | 'siege' | 'blood' = 'physical', power = 1): void {
    if (kind === 'magic') {
      this.burst('fx_spark_arc', x, y, 7, 130, 0.32, 1.1 * power, 0, 0x9ff0ff);
      this.burst('fx_glow_cool', x, y, 1, 12, 0.26, 1.5 * power);
    } else if (kind === 'siege') {
      this.burst('fx_smoke', x, y, 8, 100, 0.6, 1.5 * power, -20, 0x8a8478);
      this.burst('fx_spark_warm', x, y, 12, 180, 0.38, 1.3 * power, 220, 0xffc861);
    } else if (kind === 'blood') {
      this.burst('fx_spark_blood', x, y, 6, 110, 0.4, 1 * power, 260, 0xd94a4a);
    } else {
      this.burst('fx_spark_warm', x, y, 6, 150, 0.22, 1 * power, 120, 0xffe2a0);
      this.burst('fx_glow_warm', x, y, 1, 10, 0.16, 1.1 * power);
    }
  }

  slash(x: number, y: number, angle: number, dark = false): void {
    const img = this.scene.add
      .image(x, y, dark ? 'fx_slash_dark' : 'fx_slash')
      .setDepth(DEPTH.FX)
      .setRotation(angle)
      .setScale(metaOf('fx_slash').sx * 1.1);
    this.scene.tweens.add({ targets: img, alpha: 0, scaleX: img.scaleX * 1.5, scaleY: img.scaleY * 1.5, duration: 180, onComplete: () => img.destroy() });
  }

  muzzle(x: number, y: number, angle: number, warm = true): void {
    const img = this.scene.add
      .image(x, y, warm ? 'fx_glow_warm' : 'fx_glow_cool')
      .setDepth(DEPTH.FX)
      .setScale(metaOf('fx_glow_warm').sx * 0.7)
      .setRotation(angle);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 120, onComplete: () => img.destroy() });
  }

  explosion(x: number, y: number, radius: number, magic = false, small = false): void {
    const ringTex = magic ? 'fx_ring_cool' : 'fx_ring_warm';
    const ring = this.scene.add.image(x, y, ringTex).setDepth(DEPTH.FX).setScale(0.2);
    const target = (radius / 26) * metaOf(ringTex).sx * (small ? 0.7 : 1);
    this.scene.tweens.add({ targets: ring, scaleX: target, scaleY: target, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    const glow = this.scene.add
      .image(x, y, magic ? 'fx_glow_void' : 'fx_glow_warm')
      .setDepth(DEPTH.FX)
      .setScale(metaOf('fx_glow_warm').sx * (radius / 24));
    this.scene.tweens.add({ targets: glow, alpha: 0, scaleX: glow.scaleX * 1.5, scaleY: glow.scaleY * 1.5, duration: 340, onComplete: () => glow.destroy() });
    this.burst(magic ? 'fx_spark_arc' : 'fx_spark_warm', x, y, magic ? 14 : 18, magic ? 220 : 260, 0.5, 1.6, 160, magic ? 0x9ff0ff : 0xffb04a);
    this.burst('fx_smoke', x, y, small ? 4 : 9, 90, 0.7, 1.8, -30, 0x6f6a62);
    this.shake(small ? 3 : Math.min(11, radius / 12), small ? 0.12 : 0.24);
  }

  /** Ground telegraph under an incoming AoE (boss slams, meteor). */
  telegraph(x: number, y: number, radius: number, durationMs: number, color = 0xff5a4a): Phaser.GameObjects.Image {
    const ring = this.scene.add.image(x, y, 'fx_ring_danger').setDepth(DEPTH.DECAL + 1).setScale((radius / 34) * metaOf('fx_ring_danger').sx);
    ring.setTint(color);
    ring.setAlpha(0.85);
    this.scene.tweens.add({ targets: ring, alpha: 0.25, duration: Math.max(80, durationMs / 6), yoyo: true, repeat: -1 });
    this.scene.time.delayedCall(durationMs, () => {
      this.scene.tweens.killTweensOf(ring);
      ring.destroy();
    });
    return ring;
  }

  levelUp(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 130, () => {
        const ring = this.scene.add.image(x, y, 'fx_ring_warm').setDepth(DEPTH.FX).setScale(0.2);
        this.scene.tweens.add({ targets: ring, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 620, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      });
    }
    this.burst('fx_spark_warm', x, y, 22, 160, 1.0, 1.5, -120, 0xffd257);
  }

  death(x: number, y: number, texture: string, scale: number): void {
    const spr = this.scene.add.image(x, y, texture).setDepth(DEPTH.CORPSE).setScale(scale).setAlpha(0.9).setTint(0x6a5a5a);
    const meta = metaOf(texture);
    spr.setOrigin(0.5, meta.sy);
    this.scene.tweens.add({ targets: spr, alpha: 0, y: y + 4, duration: 3200, delay: 900, onComplete: () => spr.destroy() });
    this.burst('fx_smoke', x, y, 5, 60, 0.8, 1.2, -28, 0x555055);
  }

  damageText(x: number, y: number, amount: number, kind: 'damage' | 'crit' | 'heal' | 'mana' | 'xp' = 'damage'): void {
    const ft = this.texts.acquire();
    if (!ft.label) return;
    ft.active = true;
    ft.x = x + Phaser.Math.Between(-8, 8);
    ft.y = y - 12;
    ft.life = kind === 'crit' ? 1.05 : 0.85;
    ft.maxLife = ft.life;
    const label = kind === 'crit' ? `${Math.round(amount)}!` : kind === 'heal' ? `+${Math.round(amount)}` : kind === 'xp' ? `+${Math.round(amount)} XP` : `${Math.round(amount)}`;
    ft.label.setText(label);
    ft.label.setColor(kind === 'crit' ? '#ffd257' : kind === 'heal' ? '#7dff9b' : kind === 'mana' ? '#7fd8ff' : kind === 'xp' ? '#c084fc' : '#ffffff');
    ft.label.setFontSize(kind === 'crit' ? 20 : kind === 'xp' ? 14 : 15);
    ft.label.setPosition(ft.x, ft.y);
    ft.label.setDepth(DEPTH.FX + 5);
  }

  update(dt: number): void {
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
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) {
        this.scene.cameras.main.setScroll(this.scene.cameras.main.scrollX, this.scene.cameras.main.scrollY);
      }
    }
  }

  shake(amp: number, duration: number): void {
    if (amp <= this.shakeAmp && this.shakeT > 0) return;
    this.shakeAmp = amp;
    this.shakeT = duration;
    this.scene.cameras.main.shake(duration * 1000, amp / 1000, false);
  }

  clear(): void {
    for (const em of this.emitters.values()) em.destroy();
    this.emitters.clear();
    this.texts.releaseAll();
  }
}
