import { TILE } from '../config/Constants';
import type { Hero } from '../world/Hero';
import type { Unit } from '../world/Unit';
import type { GameCtx } from './GameCtx';
import type { CombatSystem } from './Combat';
import { SKILLS } from '../data/heroes';
import { audio } from '../audio/AudioBus';

interface ActiveZone {
  x: number;
  y: number;
  radius: number;
  damage: number;
  damageType: 'physical' | 'magic' | 'siege';
  team: number;
  ownerId: number;
  nextTick: number;
  ticksLeft: number;
  interval: number;
  delayMs?: number;
  slow?: number;
  slowUntil?: number;
  color: number;
  corridor?: { x1: number; y1: number; x2: number; y2: number; width: number };
  knockback?: number;
  slowDuration?: number;
}

/** Distance from a point to a line segment (used by the charge corridor). */
function segmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/**
 * Hero abilities (Q/W/E/R). Every skill routes its effects through CombatSystem so
 * the damage numbers / particles / sounds stay consistent with basic attacks.
 */
export class HeroAbilities {
  private zones: ActiveZone[] = [];

  constructor(
    private ctx: GameCtx,
    private combat: CombatSystem,
  ) {}

  canCast(hero: Hero, skillId: string): boolean {
    const skill = SKILLS[skillId];
    if (!skill) return false;
    if (hero.respawning || hero.dead) return false;
    if (hero.level < skill.levelRequired) return false;
    if (hero.mana < skill.manaCost) return false;
    return hero.isSkillReady(skillId);
  }

  /** Returns false with a reason string when the cast is rejected. */
  cast(hero: Hero, skillId: string, tx: number, ty: number): { ok: boolean; reason?: string } {
    const skill = SKILLS[skillId];
    if (!skill) return { ok: false, reason: '未知技能' };
    if (hero.respawning || hero.dead) return { ok: false, reason: '英雄已阵亡' };
    if (hero.level < skill.levelRequired) return { ok: false, reason: `需要 ${skill.levelRequired} 级` };
    if (hero.mana < skill.manaCost) return { ok: false, reason: '法力不足' };
    if (!hero.isSkillReady(skillId)) return { ok: false, reason: `冷却 ${Math.ceil(hero.cooldowns[skillId] ?? 0)}s` };

    const dist = Math.hypot(tx - hero.x, ty - hero.y);
    if (skill.range > 0 && dist > skill.range) {
      // clamp to max range instead of rejecting (feels much better in an RTS)
      const ang = Math.atan2(ty - hero.y, tx - hero.x);
      tx = hero.x + Math.cos(ang) * skill.range;
      ty = hero.y + Math.sin(ang) * skill.range;
    }

    hero.mana -= skill.manaCost;
    hero.cooldowns[skillId] = skill.cooldown;
    // Relic: Hero — amplify every skill the hero casts
    const dmgMul = (1 + hero.equipment.skillDamage / 100) * hero.skillDamageMul * (1 + this.ctx.world.mods.heroDamage);
    const dmg = skill.damage * dmgMul;
    const now = this.ctx.now;
    audio.sfx('skill', 0.55);

    switch (skill.kind) {
      case 'charge': {
        const ang = Math.atan2(ty - hero.y, tx - hero.x);
        const dist2 = Math.min(skill.range, Math.max(60, Math.hypot(tx - hero.x, ty - hero.y)));
        const ex = hero.x + Math.cos(ang) * dist2;
        const ey = hero.y + Math.sin(ang) * dist2;
        hero.faceTowards(ex, ey);
        this.dash(hero, ex, ey, 0.24);
        this.zone({
          x: (hero.x + ex) / 2,
          y: (hero.y + ey) / 2,
          radius: skill.radius,
          damage: dmg,
          damageType: skill.damageType,
          team: hero.team,
          ownerId: hero.id,
          interval: 0.2,
          ticks: 1,
          delayMs: 190,
          color: skill.icon.color,
          corridor: { x1: hero.x, y1: hero.y, x2: ex, y2: ey, width: skill.radius },
          knockback: 46,
        });
        break;
      }
      case 'buff': {
        const allies = this.ctx.world.alliesNear(hero.x, hero.y, skill.radius, hero.team);
        for (const a of allies) {
          a.addBuff({ id: skill.id, until: now + skill.duration, attackMul: 1.35, speedMul: 1.2 });
        }
        this.ctx.fx.telegraph(hero.x, hero.y, skill.radius, 500, skill.icon.color);
        this.ctx.fx.shake(2.4, 0.14, 'heavy');
        this.ctx.fx.burst('fx_spark_warm', hero.x, hero.y, 18, 180, 0.7, 1.4, -60, 0xffc861);
        break;
      }
      case 'spin': {
        hero.channel = { skill, until: now + skill.duration, tickAt: now };
        this.castCircle(hero.x, hero.y, skill.radius, skill.icon.color, skill.duration);
        this.ctx.fx.shake(3, 0.16, 'heavy');
        break;
      }
      case 'guard': {
        hero.addBuff({ id: 'divineGuard', until: now + skill.duration, armorAdd: 14, speedMul: 1.1 });
        hero.channel = { skill, until: now + skill.duration, tickAt: now };
        this.ctx.fx.levelUp(hero.x, hero.y);
        break;
      }
      case 'projectile-storm': {
        const target = this.ctx.world.nearestEnemy(tx, ty, 90, hero.team);
        this.combat.fire({
          x: hero.x,
          y: hero.y - 18,
          target: target ?? null,
          tx,
          ty,
          speed: 430,
          damage: dmg,
          damageType: skill.damageType,
          splash: skill.radius,
          texture: 'p_fireball',
          team: hero.team,
          ownerId: hero.id,
          arc: 12,
        });
        break;
      }
      case 'meteor': {
        const radius = skill.radius;
        // sky sigil -> falling rock -> red ground warning -> explosion -> fire -> AOE
        this.ctx.fx.skySigil(tx, ty, 900, skill.icon.color);
        this.ctx.fx.fallingRock(tx, ty, 900, radius, skill.icon.color);
        this.ctx.fx.telegraph(tx, ty, radius, 900, 0xff5a4a);
        this.ctx.fx.shake(4, 0.18, 'heavy');
        this.zone({
          x: tx,
          y: ty,
          radius,
          damage: dmg,
          damageType: skill.damageType,
          team: hero.team,
          ownerId: hero.id,
          interval: 0.45,
          ticks: Math.max(1, Math.round(skill.duration / 0.45)),
          color: skill.icon.color,
        });
        break;
      }
      case 'arrow-rain': {
        this.ctx.fx.telegraph(tx, ty, skill.radius, 700, skill.icon.color);
        this.zone({
          x: tx,
          y: ty,
          radius: skill.radius,
          damage: dmg / 4,
          damageType: skill.damageType,
          team: hero.team,
          ownerId: hero.id,
          interval: 0.42,
          ticks: Math.max(1, Math.round(skill.duration / 0.42)),
          color: skill.icon.color,
        });
        break;
      }
      case 'summon-trap': {
        this.zone({
          x: tx,
          y: ty,
          radius: skill.radius,
          damage: dmg,
          damageType: skill.damageType,
          team: hero.team,
          ownerId: hero.id,
          interval: 1,
          ticks: 1,
          delayMs: 250,
          color: skill.icon.color,
          slow: 0.5,
          slowDuration: 3,
        });
        break;
      }
      case 'teleport': {
        this.ctx.fx.explosion(hero.x, hero.y, 60, true, true);
        const { tx: gx, ty: gy } = { tx: Math.floor(tx / TILE), ty: Math.floor(ty / TILE) };
        const free = this.ctx.path.nearestFree(gx, gy, 10);
        if (free) {
          hero.x = free.tx * TILE + TILE / 2;
          hero.y = free.ty * TILE + TILE / 2;
        }
        this.ctx.fx.explosion(hero.x, hero.y, 70, true, true);
        break;
      }
      case 'vision': {
        hero.addBuff({ id: 'eagleEye', until: now + skill.duration, rangeMul: 1.5, critAdd: 0.3 });
        hero.critChance += 0; // crit handled by buff-aware read below
        this.ctx.fx.levelUp(hero.x, hero.y);
        break;
      }
      default:
        break;
    }
    this.onCast?.(hero, skillId);
    return { ok: true };
  }

  onCast: ((hero: Hero, skillId: string) => void) | null = null;

  /** Called every frame: channels + delayed zones. */
  update(dt: number): void {
    const now = this.ctx.now;
    const hero = this.ctx.world.hero;
    if (hero && hero.channel) {
      const ch = hero.channel;
      if (now >= ch.until) {
        hero.channel = null;
      } else if (now >= ch.tickAt) {
        ch.tickAt = now + (ch.skill.kind === 'spin' ? 0.38 : 0.5);
        if (ch.skill.kind === 'spin') {
          const dmg = ch.skill.damage * (1 + hero.equipment.skillDamage / 100) * hero.skillDamageMul * (1 + this.ctx.world.mods.heroDamage) / 4;
          this.combat.areaDamage(hero.x, hero.y, ch.skill.radius, dmg, ch.skill.damageType, hero.team, hero.id, 12);
          this.ctx.fx.burst('fx_slash', hero.x, hero.y, 1, 40, 0.2, 1.2);
          audio.sfx('swordHeavy', 0.22);
        } else if (ch.skill.kind === 'guard') {
          this.ctx.world.heal(hero, hero.maxHp * 0.06);
          this.ctx.fx.damageText(hero.x, hero.y - 26, Math.round(hero.maxHp * 0.06), 'heal');
        }
      }
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.delayMs !== undefined) {
        z.delayMs -= dt * 1000;
        if (z.delayMs > 0) continue;
        this.fireZone(z);
        this.zones.splice(i, 1);
        continue;
      }
      if (now >= z.nextTick) {
        z.nextTick = now + z.interval;
        this.fireZone(z);
        z.ticksLeft--;
        if (z.ticksLeft <= 0) this.zones.splice(i, 1);
      }
    }
  }

  private fireZone(z: ActiveZone): void {
    if (z.corridor) {
      const c = z.corridor;
      // One clean hit per enemy inside the charge corridor (no step stacking).
      const enemies = this.ctx.world.enemiesNear((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2, Math.hypot(c.x2 - c.x1, c.y2 - c.y1) / 2 + 90, z.team);
      for (const e of enemies) {
        if (segmentDistance(e.x, e.y, c.x1, c.y1, c.x2, c.y2) > c.width * 0.5 + e.radius) continue;
        this.combat.applyDamage(e, z.damage, z.damageType, z.team, z.ownerId, false);
        e.addBuff({ id: 'stagger', until: this.ctx.now + 0.6, speedMul: 0.6 });
        this.combat.knockback(e, c.x1, c.y1, z.knockback ?? 40);
      }
      const ang = Math.atan2(c.y2 - c.y1, c.x2 - c.x1);
      const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        this.ctx.fx.slash(c.x1 + (c.x2 - c.x1) * t, c.y1 + (c.y2 - c.y1) * t, ang, false);
      }
      this.ctx.fx.explosion((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2, Math.max(50, len * 0.4), true, true);
      audio.sfx('swordHeavy', 0.6);
      return;
    }
    const hits = this.combat.areaDamage(z.x, z.y, z.radius, z.damage, z.damageType, z.team, z.ownerId, 16);
    if (z.slow) {
      const enemies = this.ctx.world.enemiesNear(z.x, z.y, z.radius, z.team);
      for (const e of enemies) e.addBuff({ id: 'snare', until: this.ctx.now + (z.slowDuration ?? 3), speedMul: 1 - z.slow });
    }
    const magic = z.damageType === 'magic';
    if (hits > 0) {
      const ex = z.x + (Math.random() - 0.5) * z.radius;
      const ey = z.y + (Math.random() - 0.5) * z.radius;
      this.ctx.fx.explosion(ex, ey, Math.min(80, z.radius), magic, true);
      this.ctx.fx.scorch(ex, ey, z.radius * 0.9, magic);
    } else {
      this.ctx.fx.burst(magic ? 'fx_spark_arc' : 'fx_spark_leaf', z.x, z.y, 6, 90, 0.4, 1.1, 60, z.color);
    }
  }

  /** Glowing ring under the caster while a channelled skill runs. */
  private castCircle(x: number, y: number, radius: number, color: number, duration: number): void {
    this.ctx.fx.spawn({
      texture: 'fx_ring_warm',
      x,
      y,
      life: Math.max(0.4, duration),
      scale0: radius / 26,
      scale1: radius / 30,
      alpha0: 0.75,
      alpha1: 0.15,
      rotSpeed: 1.1,
      tint: color,
      depth: 12,
    });
    this.ctx.fx.spawn({
      texture: 'fx_glow_warm',
      x,
      y,
      life: Math.max(0.4, duration),
      scale0: radius / 34,
      scale1: radius / 40,
      alpha0: 0.35,
      alpha1: 0.08,
      tint: color,
      depth: 12,
    });
  }

  /** Adds a queued/instant area effect. */
  zone(opt: {
    x: number;
    y: number;
    radius: number;
    damage: number;
    damageType: 'physical' | 'magic' | 'siege';
    team: number;
    ownerId: number;
    interval: number;
    ticks: number;
    color: number;
    delayMs?: number;
    slow?: number;
    slowDuration?: number;
    corridor?: { x1: number; y1: number; x2: number; y2: number; width: number };
    knockback?: number;
  }): void {
    this.zones.push({
      x: opt.x,
      y: opt.y,
      radius: opt.radius,
      damage: opt.damage,
      damageType: opt.damageType,
      team: opt.team,
      ownerId: opt.ownerId,
      nextTick: this.ctx.now,
      ticksLeft: opt.ticks,
      interval: opt.interval,
      delayMs: opt.delayMs,
      color: opt.color,
      slow: opt.slow,
      slowDuration: opt.slowDuration,
      corridor: opt.corridor,
      knockback: opt.knockback,
    });
  }

  private dash(hero: Unit, x: number, y: number, duration: number): void {
    const sx = hero.x;
    const sy = hero.y;
    const t0 = this.ctx.now;
    const step = () => {
      const p = Math.min(1, (this.ctx.now - t0) / duration);
      hero.x = sx + (x - sx) * p;
      hero.y = sy + (y - sy) * p;
      if (p < 1) this.ctx.world.scene.time.delayedCall(16, step);
      else hero.path.length = 0;
    };
    step();
  }

  heroKilledAt: number | null = null;
}
