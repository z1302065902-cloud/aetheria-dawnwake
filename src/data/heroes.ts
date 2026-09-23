import type { HeroDef, SkillDef } from './types';

export const SKILLS: Record<string, SkillDef> = {
  // ── Knight Commander (tank) ──
  shieldCharge: {
    id: 'shieldCharge', name: '盾牌冲锋', enName: 'Shield Charge', key: 'Q',
    manaCost: 15, cooldown: 9, range: 260, radius: 46,
    damage: 55, damageType: 'physical', kind: 'charge', duration: 0.35, levelRequired: 1,
    desc: '向目标方向冲锋，撞开沿途敌人并造成伤害。',
    icon: { glyph: '⛊', color: 0x6fa8ff },
  },
  warCry: {
    id: 'warCry', name: '战吼', enName: 'War Cry', key: 'W',
    manaCost: 20, cooldown: 18, range: 260, radius: 260,
    damage: 0, damageType: 'physical', kind: 'buff', duration: 9, levelRequired: 1,
    desc: '提升周围友军 35% 攻击与 20% 移动速度，持续 9 秒。',
    icon: { glyph: '◈', color: 0xffc861 },
  },
  whirlwind: {
    id: 'whirlwind', name: '旋风斩', enName: 'Whirlwind', key: 'E',
    manaCost: 25, cooldown: 14, range: 0, radius: 88,
    damage: 110, damageType: 'physical', kind: 'spin', duration: 3.0, levelRequired: 1,
    desc: '持续 3 秒旋转斩击，对周围敌人反复造成伤害。',
    icon: { glyph: '✷', color: 0xff9a4a },
  },
  divineGuard: {
    id: 'divineGuard', name: '神圣守护', enName: 'Divine Guard', key: 'R',
    manaCost: 40, cooldown: 30, range: 0, radius: 0,
    damage: 0, damageType: 'magic', kind: 'guard', duration: 6, levelRequired: 3,
    desc: '6 秒内护甲大幅提升、免疫控制，并持续回复生命。',
    icon: { glyph: '❖', color: 0xfff0a0 },
  },

  // ── Arcane Mage ──
  fireball: {
    id: 'fireball', name: '火球术', enName: 'Fireball', key: 'Q',
    manaCost: 18, cooldown: 5, range: 380, radius: 70,
    damage: 95, damageType: 'magic', kind: 'projectile-storm', duration: 0, levelRequired: 1,
    desc: '掷出火球，命中后爆炸并点燃范围内敌人。',
    icon: { glyph: '❂', color: 0xff7a3a },
  },
  arcaneStorm: {
    id: 'arcaneStorm', name: '奥术风暴', enName: 'Arcane Storm', key: 'W',
    manaCost: 30, cooldown: 16, range: 340, radius: 130,
    damage: 130, damageType: 'magic', kind: 'meteor', duration: 2.4, levelRequired: 1,
    desc: '在目标区域召唤奥术风暴，持续造成伤害。',
    icon: { glyph: '✺', color: 0x9f7fff },
  },
  meteor: {
    id: 'meteor', name: '陨石', enName: 'Meteor', key: 'E',
    manaCost: 45, cooldown: 26, range: 420, radius: 150,
    damage: 260, damageType: 'magic', kind: 'meteor', duration: 1.8, levelRequired: 1,
    desc: '召唤陨石轰击目标区域，造成巨额范围伤害。',
    icon: { glyph: '☄', color: 0xff5a3a },
  },
  teleport: {
    id: 'teleport', name: '闪现', enName: 'Teleport', key: 'R',
    manaCost: 22, cooldown: 20, range: 380, radius: 0,
    damage: 0, damageType: 'magic', kind: 'teleport', duration: 0, levelRequired: 3,
    desc: '瞬间传送到目标位置，脱离危险或抢占高地。',
    icon: { glyph: '⟡', color: 0x7fd8ff },
  },

  // ── Ranger ──
  multiShot: {
    id: 'multiShot', name: '多重射击', enName: 'Multi Shot', key: 'Q',
    manaCost: 16, cooldown: 8, range: 300, radius: 0,
    damage: 70, damageType: 'physical', kind: 'arrow-rain', duration: 0, levelRequired: 1,
    desc: '一次射出多支箭矢，覆盖扇形区域。',
    icon: { glyph: '⋙', color: 0x9ff0a0 },
  },
  snare: {
    id: 'snare', name: '陷阱', enName: 'Snare Trap', key: 'W',
    manaCost: 18, cooldown: 14, range: 300, radius: 60,
    damage: 40, damageType: 'physical', kind: 'summon-trap', duration: 12, levelRequired: 1,
    desc: '布置陷阱，触发时减速并造成伤害。',
    icon: { glyph: '⌗', color: 0xc9a45a },
  },
  arrowRain: {
    id: 'arrowRain', name: '箭雨', enName: 'Rain of Arrows', key: 'E',
    manaCost: 32, cooldown: 22, range: 380, radius: 140,
    damage: 210, damageType: 'physical', kind: 'arrow-rain', duration: 3.5, levelRequired: 1,
    desc: '在目标区域降下持续箭雨。',
    icon: { glyph: '⤓', color: 0xd9ffa0 },
  },
  eagleEye: {
    id: 'eagleEye', name: '鹰眼', enName: 'Eagle Eye', key: 'R',
    manaCost: 20, cooldown: 24, range: 0, radius: 0,
    damage: 0, damageType: 'physical', kind: 'vision', duration: 14, levelRequired: 3,
    desc: '14 秒内大幅提升自身射程、暴击与视野。',
    icon: { glyph: '◎', color: 0xfff0b0 },
  },
};

export const HEROES: Record<string, HeroDef> = {
  knightCommander: {
    id: 'knightCommander', name: '骑士指挥官', enName: 'Knight Commander', title: '黎明之盾', faction: 'dawn', role: 'tank',
    base: { hp: 480, mana: 130, attack: 28, armor: 6, moveSpeed: 132, attackRange: 32, attackCooldown: 1.0, manaRegen: 3.2, hpRegen: 1.4 },
    growth: { hp: 68, mana: 12, attack: 5, armor: 1.2 },
    skills: ['shieldCharge', 'warCry', 'whirlwind', 'divineGuard'],
    art: { archetype: 'knight', shape: 'humanoid', body: 0x3f6fd0, trim: 0xeef2ff, accent: 0xffd257, scale: 1.35, weapon: 'sword', mount: false, banner: 0xffd257 },
    bio: '王国最后的骑士指挥官。他能扛住巨兽的正面冲击，也能用战吼把溃散的阵线重新凝聚起来。',
  },
  arcaneMage: {
    id: 'arcaneMage', name: '奥术法师', enName: 'Arcane Mage', title: '秘能之心', faction: 'dawn', role: 'mage',
    base: { hp: 300, mana: 220, attack: 34, armor: 2, moveSpeed: 122, attackRange: 195, attackCooldown: 1.35, manaRegen: 6.5, hpRegen: 0.6 },
    growth: { hp: 34, mana: 24, attack: 8, armor: 0.5 },
    skills: ['fireball', 'arcaneStorm', 'meteor', 'teleport'],
    art: { archetype: 'mage', shape: 'humanoid', body: 0x7f5fd0, trim: 0x3a2a6a, accent: 0x9ff0ff, scale: 1.22, weapon: 'staff', banner: 0x9f7fff },
    bio: '研究虚空潮汐本质的学者。她的爆炸法术能在一瞬间抹掉一整队劫掠者，前提是别让她被碰到。',
  },
  ranger: {
    id: 'ranger', name: '游侠', enName: 'Ranger', title: '林间之眼', faction: 'dawn', role: 'ranger',
    base: { hp: 340, mana: 160, attack: 31, armor: 3, moveSpeed: 142, attackRange: 215, attackCooldown: 0.9, manaRegen: 4.5, hpRegen: 0.9 },
    growth: { hp: 42, mana: 15, attack: 7, armor: 0.7 },
    skills: ['multiShot', 'snare', 'arrowRain', 'eagleEye'],
    art: { archetype: 'archer', shape: 'humanoid', body: 0x3f8f5a, trim: 0x2a4f34, accent: 0xd9ffa0, scale: 1.2, weapon: 'bow', banner: 0x9ff0a0 },
    bio: '格林谷地长大的猎人。她熟悉每一片林子，也熟悉怎么让巨兽在箭雨里流血至死。',
  },
};

export const HERO_ORDER = ['knightCommander', 'arcaneMage', 'ranger'];

export const HERO_XP_TABLE = [0, 120, 300, 560, 900, 1320, 1840, 2480, 3240, 4120];

export function getHero(id: string): HeroDef {
  const h = HEROES[id];
  if (!h) throw new Error(`[data] unknown hero: ${id}`);
  return h;
}
