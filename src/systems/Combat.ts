import { CFG, DEPTH } from '../config/Constants';
import { Pool } from '../core/Pool';
import { metaOf, texScale } from '../art/SpriteFactory';
import { Projectile } from '../world/Projectile';
import type { Building } from '../world/Building';
import type { Unit } from '../world/Unit';
import { Hero } from '../world/Hero';
import type { GameCtx, ProjectilePoolApi } from './GameCtx';
import { audio } from '../audio/AudioBus';

type Target = Unit | Building;

/**
 * Combat resolution: auto-attacks, projectiles, splash, turrets and every source of
 * area damage (hero skills, boss attacks). All feedback (spark / number / shake /
 * sound) is emitted here so "did I hit it?" is never ambiguous.
 */
export class CombatSystem implements ProjectilePoolApi {
  private pool: Pool<Projectile>;
  private scratch: Unit[] = [];

  constructor(private ctx: GameCtx) {
    const scene = ctx.world.scene;
    this.pool = new Pool<Projectile>(
      () => {
        const p = new Projectile();
        p.sprite = scene.add.image(0, 0, 'p_arrow').setDepth(DEPTH.PROJECTILE).setVisible(false);
        return p;
      },
      (p) => {
        p.active = true;
        p.sprite?.setVisible(true).setAlpha(1);
      },
      (p) => {
        p.active = false;
        p.sprite?.setVisible(false);
      },
      16,
    );
  }

  get activeProjectiles(): number {
    return this.pool.size;
  }

  update(dt: number): void {
    this.unitAttacks(dt);
    this.buildingAttacks(dt);
    this.updateProjectiles(dt);
  }

  // ────────────────────────── attacks ──────────────────────────

  private unitAttacks(dt: number): void {
    const { world } = this.ctx;
    for (const u of world.units) {
      if (u.dead) continue;
      if (u.cooldown > 0) u.cooldown -= dt;
      if (u.cooldown > 0) continue;
      if (u.targetId < 0) continue;
      const target = world.entityById(u.targetId) as Target | undefined;
      if (!target || target.dead) {
        u.targetId = -1;
        u.forcedTarget = false;
        continue;
      }
      const reach = u.rangeTotal + target.radius;
      const dx = target.x - u.x;
      const dy = target.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      this.performAttack(u, target);
    }
  }

  private buildingAttacks(dt: number): void {
    const { world } = this.ctx;
    for (const b of world.buildings) {
      if (b.dead || b.building || !b.def.attack) continue;
      if (b.cooldown > 0) {
        b.cooldown -= dt;
        continue;
      }
      const atk = b.def.attack;
      const target = world.nearestEnemy(b.x, b.y, atk.range, b.team, (e) => world.canSee(e.x, e.y, b.team));
      if (!target) continue;
      b.cooldown = atk.cooldown;
      const angle = Math.atan2(target.y - b.y, target.x - b.x);
      this.ctx.fx.muzzle(b.x + Math.cos(angle) * 22, b.y + Math.sin(angle) * 22 - 26, angle, true);
      this.fire({
        x: b.x + Math.cos(angle) * 18,
        y: b.y + Math.sin(angle) * 18 - 26,
        target,
        tx: target.x,
        ty: target.y,
        speed: atk.projectile.speed,
        damage: atk.damage,
        damageType: atk.damageType,
        splash: atk.projectile.splash ?? 0,
        texture: `p_${atk.projectile.texture}`,
        team: b.team,
        ownerId: b.id,
      });
      audio.sfx('arrow', 0.32);
    }
  }

  private performAttack(u: Unit, target: Target): void {
    const world = this.ctx.world;
    const def = u.def;
    u.cooldown = def.attackCooldown / Math.max(0.35, this.attackSpeedMulOf(u));
    // swing window drives the attack animation (windup -> strike -> recover)
    u.swing = 0.3;
    u.playAnim('attack', true);
    const angle = Math.atan2(target.y - u.y, target.x - u.x);
    u.facing = Math.cos(angle) >= 0 ? 1 : -1;

    let damage = u.def.attack;
    let crit = false;
    if (u instanceof Hero) {
      damage = u.attackTotal;
      // Relic: Hero — the commander's own damage output is amplified
      if (world.mods.heroDamage) damage *= 1 + world.mods.heroDamage;
      let critChance = u.critChance + u.equipment.crit / 100;
      for (const b of u.buffs) critChance += b.critAdd ?? 0;
      if (Math.random() < critChance) {
        crit = true;
        damage *= CFG.CRIT_MULT;
      }
    } else {
      damage *= u.attackMul;
    }

    if (def.projectile) {
      const muzzleX = u.x + Math.cos(angle) * 12;
      const muzzleY = u.y + Math.sin(angle) * 12 - 22;
      this.ctx.fx.muzzle(muzzleX, muzzleY, angle, def.damageType !== 'magic');
      this.fire({
        x: muzzleX,
        y: muzzleY,
        target,
        tx: target.x,
        ty: target.y,
        speed: def.projectile.speed,
        damage,
        damageType: def.damageType,
        splash: def.projectile.splash ?? 0,
        texture: `p_${def.projectile.texture}`,
        team: u.team,
        ownerId: u.id,
        arc: def.damageType === 'siege' ? 26 : 0,
      });
      audio.sfx(def.damageType === 'magic' ? 'magic' : 'arrow', 0.3);
    } else {
      const hx = u.x + Math.cos(angle) * (u.radius + 8);
      const hy = u.y + Math.sin(angle) * (u.radius + 8) - 14;
      this.ctx.fx.slash(hx, hy, angle, def.damageType === 'magic');
      this.applyDamage(target, damage, def.damageType, u.team, u.id, crit);
      this.ctx.fx.hit(hx, hy, def.damageType === 'siege' ? 'siege' : 'physical', def.attack > 20 ? 1.3 : 1);
      audio.sfx(def.attack > 20 ? 'swordHeavy' : 'sword', 0.34);
    }
    u.lastCombatAt = this.ctx.now;
  }

  private attackSpeedMulOf(u: Unit): number {
    let mul = 1;
    for (const b of u.buffs) mul *= b.attackMul ?? 1;
    // equipment attack speed (percent) is a real stat, not flavour text
    if (u instanceof Hero && u.equipment.attackSpeed) mul *= 1 + u.equipment.attackSpeed / 100;
    return mul > 1 ? Math.min(2.2, mul * 1.35) : 1;
  }

  // ────────────────────────── projectiles ──────────────────────────

  fire(config: Parameters<ProjectilePoolApi['fire']>[0]): void {
    const p = this.pool.acquire();
    p.x = config.x;
    p.y = config.y;
    p.startX = config.x;
    p.startY = config.y;
    p.targetId = config.target?.id ?? -1;
    p.targetX = config.tx;
    p.targetY = config.ty;
    p.speed = config.speed;
    p.damage = config.damage;
    p.damageType = config.damageType;
    p.splash = config.splash;
    p.team = config.team;
    p.ownerId = config.ownerId;
    p.life = 4;
    p.arc = config.arc ?? 0;
    p.texture = config.texture;
    if (p.sprite) {
      if (p.sprite.texture.key !== config.texture) p.sprite.setTexture(config.texture);
      p.sprite.setVisible(true).setAlpha(1).setScale(metaOf(config.texture).sx * 1.1);
    }
  }

  private updateProjectiles(dt: number): void {
    this.pool.forEachSafe((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(p);
        return;
      }
      const { world } = this.ctx;
      const target = p.targetId >= 0 ? (world.entityById(p.targetId) as Target | undefined) : undefined;
      if (target && !target.dead) {
        p.targetX = target.x;
        p.targetY = target.y;
      }
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step + 6) {
        this.impact(p, target);
        this.pool.release(p);
        return;
      }
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.trailTimer = (p.trailTimer ?? 0) - dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = 0.035;
        this.ctx.fx.trail(p.x, p.y, p.damageType === 'magic', p.splash > 0 ? 0.7 : 0.4);
      }
      if (p.sprite) {
        p.sprite.setPosition(p.x, p.y - (p.arc ? Math.sin(((4 - p.life) / 4) * Math.PI) * p.arc : 0));
        if (p.texture === 'p_arrow' || p.texture === 'p_boulder') p.sprite.setRotation(Math.atan2(dy, dx));
        else p.sprite.setRotation(p.life * 6);
      }
    });
  }

  private impact(p: Projectile, target: Target | undefined): void {
    const { world, fx } = this.ctx;
    if (p.splash > 0) {
      const magic = p.damageType === 'magic';
      fx.explosion(p.x, p.y, p.splash, magic, p.splash < 45);
      this.areaDamage(p.x, p.y, p.splash, p.damage * (target ? 1 : 0.8), p.damageType, p.team, p.ownerId);
      audio.sfx(magic ? 'magic' : 'explosion', 0.34);
      if (target && !target.dead) {
        const d = Math.hypot(target.x - p.x, target.y - p.y);
        if (d <= p.splash + target.radius) this.applyDamage(target, p.damage * 0.6, p.damageType, p.team, p.ownerId, false);
      }
      void world;
      return;
    }
    if (target && !target.dead) {
      this.applyDamage(target, p.damage, p.damageType, p.team, p.ownerId, false);
      fx.hit(p.x, p.y, p.damageType === 'magic' ? 'magic' : 'physical', 0.9);
      audio.sfx(p.damageType === 'magic' ? 'magic' : 'arrowHit', 0.3);
    } else {
      fx.hit(p.x, p.y, 'physical', 0.6);
    }
  }

  // ────────────────────────── damage helpers ──────────────────────────

  applyDamage(target: Target, amount: number, type: 'physical' | 'magic' | 'siege', team: number, ownerId: number, crit: boolean): number {
    const { world, fx } = this.ctx;
    if (target.dead) return 0;
    if (this.ctx.now < this.invulnUntil(target)) return 0;
    // Relic: Flame — magic damage dealt by the player team is amplified
    let finalAmount = amount;
    if (team === 1 && type === 'magic' && world.mods.fireDamage) {
      finalAmount = amount * (1 + world.mods.fireDamage);
    }
    const dealt = world.damage(target, finalAmount, type, team, crit);
    if (dealt <= 0) return 0;
    const isEnemyOfView = target.team !== 1;
    // hit direction: from the attacker towards the target (for spray + body recoil)
    const attacker = ownerId >= 0 ? world.entityById(ownerId) : undefined;
    let dirX = 0;
    let dirY = 0;
    if (attacker) {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const d = Math.hypot(dx, dy) || 1;
      dirX = dx / d;
      dirY = dy / d;
    }
    fx.damageText(target.x, target.y - target.radius * 0.9, dealt, crit ? 'crit' : 'damage');
    if (target.kind === 'building') {
      fx.hit(target.x + (Math.random() - 0.5) * 24, target.y - 18, type, 0.8, dirX, dirY);
    } else {
      const hitY = target.y - 14;
      if (crit) fx.critBurst(target.x, hitY, dirX, dirY);
      fx.hit(target.x, hitY, type === 'magic' ? 'magic' : 'physical', crit ? 1.4 : 0.8, dirX, dirY);
      // body recoil: pushed away from the attacker, purely visual
      (target as Unit).applyRecoil(target.x - dirX * 20, target.y - dirY * 20, crit ? 6 : 3.5);
      if (type === 'magic') fx.shake(1.2, 0.08, 'light');
      else if (crit) fx.shake(2.2, 0.1, 'light');
    }
    if (isEnemyOfView && target.team !== 3) {
      this.retaliate(target, ownerId);
    }
    return dealt;
  }

  /** Damaged player units fight back instead of standing still. */
  private retaliate(target: Target, ownerId: number): void {
    if (target.kind !== 'unit') return;
    const unit = target as Unit;
    if (unit.dead || unit.isHero) return;
    if (unit.targetId >= 0 && unit.forcedTarget) return;
    void ownerId;
  }

  private invulnUntil(target: Target): number {
    if (target.kind === 'unit') {
      const u = target as Unit;
      if (u.hasBuff('divineGuard', this.ctx.now)) return this.ctx.now + 0; // guard gives armor, not immunity
    }
    return -1;
  }

  /** Area damage used by hero skills, boss attacks and splash damage. */
  areaDamage(x: number, y: number, radius: number, damage: number, type: 'physical' | 'magic' | 'siege', team: number, ownerId: number, maxTargets = 24): number {
    const { world } = this.ctx;
    let hits = 0;
    this.scratch.length = 0;
    world.hashUnits.forEachNear(x, y, radius, (u) => {
      if (u.dead || u.team === team || u.team === 3) return;
      if (Math.hypot(u.x - x, u.y - y) > radius + u.radius) return;
      this.scratch.push(u);
    });
    for (const u of this.scratch) {
      if (hits >= maxTargets) break;
      this.applyDamage(u, damage, type, team, ownerId, false);
      hits++;
    }
    // buildings take half AoE damage (keeps AoE from replacing siege units)
    world.hashBuildings.forEachNear(x, y, radius, (b) => {
      if (b.dead || b.team === team || b.team === 3) return;
      if (Math.hypot(b.x - x, b.y - y) > radius + b.radius * 0.6) return;
      this.applyDamage(b, damage * 0.5, type, team, ownerId, false);
    });
    return hits;
  }

  healArea(x: number, y: number, radius: number, amount: number, team: number): number {
    const { world, fx } = this.ctx;
    let healed = 0;
    world.hashUnits.forEachNear(x, y, radius, (u) => {
      if (u.dead || u.team !== team || u.hp >= u.maxHp) return;
      world.heal(u, amount);
      fx.damageText(u.x, u.y - 20, amount, 'heal');
      healed++;
    });
    return healed;
  }

  knockback(target: Target, fromX: number, fromY: number, force: number): void {
    if (target.dead || target.kind !== 'unit') return;
    const u = target as Unit;
    if (u.isHero && (u as Hero).hasBuff('divineGuard', this.ctx.now)) return;
    const ang = Math.atan2(u.y - fromY, u.x - fromX);
    const nx = u.x + Math.cos(ang) * force;
    const ny = u.y + Math.sin(ang) * force;
    const { tx, ty } = { tx: Math.floor(nx / 32), ty: Math.floor(ny / 32) };
    if (this.ctx.path.isFree(tx, ty)) {
      u.x = nx;
      u.y = ny;
    }
  }

  dispose(): void {
    this.pool.forEach((p) => p.sprite?.destroy());
    this.pool.releaseAll();
  }

  static readonly TEX_SCALE = texScale;
}
