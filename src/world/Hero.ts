import { Unit } from './Unit';
import type { HeroDef, SkillDef } from '../data/types';
import { SKILLS } from '../data/heroes';

export interface EquipmentStats {
  attack: number;
  armor: number;
  hp: number;
  mana: number;
  crit: number;
  attackSpeed: number;
  skillDamage: number;
}

export class Hero extends Unit {
  heroDef: HeroDef;
  level = 1;
  xp = 0;
  mana = 0;
  maxMana = 0;
  critChance = 0.05;
  skillDamageMul = 1;
  equipment: EquipmentStats = { attack: 0, armor: 0, hp: 0, mana: 0, crit: 0, attackSpeed: 0, skillDamage: 0 };

  /** seconds remaining per skill id */
  cooldowns: Record<string, number> = {};
  respawnTimer = 0;
  respawning = false;
  /** Skill currently channelled (whirlwind / guard) with remaining duration. */
  channel: { skill: SkillDef; until: number; tickAt: number; dir?: { x: number; y: number } } | null = null;

  constructor(x: number, y: number, def: HeroDef) {
    super(x, y, {
      id: def.id,
      name: def.name,
      enName: def.enName,
      faction: def.faction,
      role: def.role === 'tank' ? 'melee' : def.role === 'mage' ? 'caster' : 'ranged',
      hp: def.base.hp,
      attack: def.base.attack,
      armor: def.base.armor,
      damageType: def.role === 'mage' ? 'magic' : 'physical',
      armorType: 'medium',
      moveSpeed: def.base.moveSpeed,
      attackRange: def.base.attackRange,
      aggroRange: 340,
      attackCooldown: def.base.attackCooldown,
      cost: {},
      pop: 0,
      buildTime: 0,
      radius: 15,
      sightRange: 420,
      projectile: def.role === 'mage' ? { speed: 460, texture: 'fireball', splash: 40 } : def.role === 'ranger' ? { speed: 620, texture: 'arrow' } : undefined,
      xp: 0,
      art: def.art,
      desc: def.bio,
    } as any);
    this.heroDef = def;
    this.isHero = true;
    this.maxMana = def.base.mana;
    this.mana = def.base.mana;
    for (const s of def.skills) this.cooldowns[s] = 0;
  }

  get skillList(): SkillDef[] {
    return this.heroDef.skills.map((id) => SKILLS[id]);
  }

  /** Applies level-up growth. Called by the XP system. */
  addLevel(): void {
    this.level = Math.min(10, this.level + 1);
    const g = this.heroDef.growth;
    this.maxHp += g.hp;
    this.hp += g.hp;
    this.maxMana += g.mana;
    this.mana = this.maxMana;
    this.def = { ...this.def, attack: this.def.attack + g.attack };
    this.armor += g.armor;
    this.speed += 1.5;
  }

  get attackTotal(): number {
    return Math.round((this.def.attack + this.equipment.attack) * this.attackMul);
  }

  override get armorTotal(): number {
    return super.armorTotal + this.equipment.armor;
  }

  get armorTotalHero(): number {
    return this.armorTotal;
  }

  tickCooldowns(dt: number): void {
    for (const k of Object.keys(this.cooldowns)) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
  }

  tickRegen(dt: number, now: number): void {
    if (this.dead || this.respawning) return;
    const guard = this.hasBuff('divineGuard', now);
    const hpRegen = this.heroDef.base.hpRegen * (guard ? 6 : 1);
    const manaMul = guard ? 2.4 : 1;
    this.hp = Math.min(this.maxHp, this.hp + hpRegen * dt);
    this.mana = Math.min(this.maxMana, this.mana + this.heroDef.base.manaRegen * manaMul * dt);
  }

  isSkillReady(id: string): boolean {
    return (this.cooldowns[id] ?? 0) <= 0;
  }

  canCast(id: string): boolean {
    const s = SKILLS[id];
    if (!s) return false;
    return this.level >= s.levelRequired && this.mana >= s.manaCost && this.isSkillReady(id);
  }
}
