import type { ArtSpec, UnitDef } from './types';

/**
 * Unit roster. Phase 1 ships: Settler (worker) + Footman + Archer (+ hero) on the
 * player side, and the Wildborn/Yoidborn roster for the enemy. Everything else is
 * already data-complete but flagged phase 2 in the codex (see LOCKED_UNITS).
 */
const humanoid = (body: number, trim: number, accent: number, weapon: ArtSpec['weapon'], scale = 1, mount = false, banner?: number): ArtSpec => ({
  shape: 'humanoid', body, trim, accent, scale, weapon, mount, banner,
});

const beast = (body: number, trim: number, accent: number, scale = 1): ArtSpec => ({
  shape: 'beast', body, trim, accent, scale, weapon: 'claw',
});

function unit(u: Partial<UnitDef> & Pick<UnitDef, 'id' | 'name' | 'enName' | 'faction' | 'role' | 'hp' | 'attack' | 'armor' | 'moveSpeed' | 'attackRange' | 'attackCooldown' | 'art' | 'desc'>): UnitDef {
  return {
    damageType: 'physical',
    armorType: 'medium',
    aggroRange: Math.max(220, u.attackRange + 140),
    cost: {},
    pop: 0,
    buildTime: 0,
    radius: 11,
    sightRange: 320,
    xp: 12,
    ...u,
  } as UnitDef;
}

export const UNITS: Record<string, UnitDef> = {
  // ───────────────────────── Dawn Kingdom ─────────────────────────
  settler: unit({
    id: 'settler', name: '拓荒者', enName: 'Settler', faction: 'dawn', role: 'worker',
    hp: 70, attack: 5, armor: 1, armorType: 'light',
    moveSpeed: 108, attackRange: 24, attackCooldown: 1.3,
    cost: { gold: 55 }, pop: 1, buildTime: 12, radius: 10, sightRange: 300, xp: 6,
    art: humanoid(0xd9c79a, 0x8a6a3a, 0xffe9b0, 'pick', 0.92),
    desc: '采集金币与木材，并负责建造与修理建筑。',
  }),
  footman: unit({
    id: 'footman', name: '剑士', enName: 'Footman', faction: 'dawn', role: 'melee',
    hp: 150, attack: 13, armor: 4, armorType: 'medium',
    moveSpeed: 96, attackRange: 26, attackCooldown: 1.15,
    cost: { gold: 90 }, pop: 2, buildTime: 15, radius: 11, sightRange: 330, xp: 14,
    art: humanoid(0x4f7fd6, 0xc9d6ef, 0xfff0c0, 'sword'),
    desc: '可靠的前排近战单位，能扛住荒野氏族的冲锋。',
  }),
  archer: unit({
    id: 'archer', name: '弓箭手', enName: 'Archer', faction: 'dawn', role: 'ranged',
    damageType: 'physical',
    hp: 92, attack: 12, armor: 1, armorType: 'light',
    moveSpeed: 104, attackRange: 185, attackCooldown: 1.25,
    cost: { gold: 80, wood: 35 }, pop: 2, buildTime: 17, radius: 10, sightRange: 380, xp: 14,
    projectile: { speed: 560, texture: 'arrow', splash: 0 },
    art: humanoid(0x5aa06a, 0xe4d9b0, 0x9ff0c0, 'bow', 0.97),
    desc: '远程输出，脆但能在城墙后持续消耗敌人。',
  }),
  squire: unit({
    id: 'squire', name: '侍从骑士', enName: 'Squire', faction: 'dawn', role: 'melee',
    hp: 205, attack: 15, armor: 6, armorType: 'heavy',
    moveSpeed: 118, attackRange: 28, attackCooldown: 1.0,
    cost: { gold: 130, wood: 20 }, pop: 2, buildTime: 20, radius: 12, xp: 18,
    art: humanoid(0x6d86c9, 0xeff2fb, 0xffe08a, 'sword', 1.02, true),
    desc: '骑乘冲锋的骑士，移动快、护甲高。',
  }),
  cleric: unit({
    id: 'cleric', name: '牧师', enName: 'Cleric', faction: 'dawn', role: 'caster',
    damageType: 'magic',
    hp: 80, attack: 9, armor: 1, armorType: 'light',
    moveSpeed: 100, attackRange: 160, attackCooldown: 1.6,
    cost: { gold: 95, mana: 25 }, pop: 2, buildTime: 20, radius: 10, xp: 16,
    projectile: { speed: 420, texture: 'bolt', splash: 0 },
    special: undefined,
    art: humanoid(0xf0ead6, 0xffd98a, 0xfff6d0, 'staff'),
    desc: '治疗附近友军，并对亡灵造成额外伤害。',
  } as any),
  catapult: unit({
    id: 'catapult', name: '投石车', enName: 'Catapult', faction: 'dawn', role: 'siege',
    damageType: 'siege',
    hp: 180, attack: 46, armor: 3, armorType: 'fortified',
    moveSpeed: 62, attackRange: 255, attackCooldown: 3.2,
    cost: { gold: 160, wood: 130 }, pop: 3, buildTime: 26, radius: 14, xp: 24,
    projectile: { speed: 300, texture: 'boulder', splash: 62 },
    art: { shape: 'humanoid', body: 0x8a6f45, trim: 0x5d4a2c, accent: 0xc9b183, scale: 1.35, weapon: 'none' },
    desc: '攻城单位，对建筑造成巨额伤害，射速极慢。',
  }),

  // ───────────────────────── Wildborn Clans ─────────────────────────
  raider: unit({
    id: 'raider', name: '荒野劫掠者', enName: 'Wildborn Raider', faction: 'wildborn', role: 'melee',
    hp: 118, attack: 11, armor: 2, armorType: 'light',
    moveSpeed: 100, attackRange: 25, attackCooldown: 1.2,
    cost: { gold: 70 }, pop: 0, buildTime: 14, radius: 11, sightRange: 340, xp: 16,
    ai: { kind: 'camp', leash: 520 },
    art: humanoid(0x8a5a3a, 0x5f3c24, 0xffb066, 'axe'),
    desc: '荒野氏族的近战劫掠者，成群冲锋。',
  }),
  hunter: unit({
    id: 'hunter', name: '荒野猎手', enName: 'Wildborn Hunter', faction: 'wildborn', role: 'ranged',
    hp: 84, attack: 10, armor: 1, armorType: 'light',
    moveSpeed: 98, attackRange: 170, attackCooldown: 1.5,
    cost: { gold: 75 }, pop: 0, buildTime: 16, radius: 10, sightRange: 380, xp: 16,
    projectile: { speed: 500, texture: 'arrow', splash: 0 },
    ai: { kind: 'camp', leash: 520 },
    art: humanoid(0x9c6a3f, 0x3f6b4a, 0xd9ffa0, 'bow', 0.95),
    desc: '在远处放箭的荒野猎手，注意先手点掉。',
  }),
  wolfrider: unit({
    id: 'wolfrider', name: '狼骑兵', enName: 'Wolfrider', faction: 'wildborn', role: 'melee',
    hp: 165, attack: 16, armor: 3, armorType: 'medium',
    moveSpeed: 138, attackRange: 28, attackCooldown: 1.1,
    cost: { gold: 110 }, pop: 0, buildTime: 20, radius: 13, sightRange: 380, xp: 22,
    ai: { kind: 'camp', leash: 620 },
    art: humanoid(0x7a4a30, 0x2f2a26, 0xffcf7a, 'claw', 1.06, true),
    desc: '骑狼的快速突击单位，专咬后排。',
  }),
  direwolf: unit({
    id: 'direwolf', name: '荒野狼', enName: 'Wild Wolf', faction: 'wildborn', role: 'beast',
    hp: 96, attack: 12, armor: 2, armorType: 'light',
    moveSpeed: 132, attackRange: 24, attackCooldown: 0.95,
    cost: {}, pop: 0, buildTime: 0, radius: 11, sightRange: 360, xp: 12,
    ai: { kind: 'patrol', leash: 460 },
    art: beast(0x6c6257, 0x3b352e, 0xff9a4a, 1.0),
    desc: '游荡在森林里的野兽，扑击速度快。',
  }),
  shaman: unit({
    id: 'shaman', name: '荒野萨满', enName: 'Wildborn Shaman', faction: 'wildborn', role: 'caster',
    damageType: 'magic',
    hp: 92, attack: 14, armor: 1, armorType: 'light',
    moveSpeed: 92, attackRange: 165, attackCooldown: 1.9,
    cost: {}, pop: 0, buildTime: 22, radius: 10, sightRange: 380, xp: 24,
    projectile: { speed: 380, texture: 'bolt', splash: 34 },
    ai: { kind: 'camp', leash: 480 },
    art: humanoid(0x4a6f5a, 0x8a5a2a, 0x9fffd0, 'staff', 1.0, false, 0x2f8f6a),
    desc: '萨满的闪电会溅射，别让部队挤成一团。',
  }),

  // ───────────────────────── Voidborn ─────────────────────────
  shade: unit({
    id: 'shade', name: '虚空暗影', enName: 'Void Shade', faction: 'voidborn', role: 'melee',
    hp: 130, attack: 18, armor: 4, armorType: 'medium',
    moveSpeed: 108, attackRange: 26, attackCooldown: 1.15,
    cost: {}, pop: 0, buildTime: 18, radius: 11, sightRange: 400, xp: 26,
    damageType: 'magic',
    ai: { kind: 'guard', leash: 420 },
    art: humanoid(0x3b2c5e, 0x6f4fbf, 0xc39bff, 'claw'),
    desc: '虚空侵蚀产生的暗影战士，攻击带魔法伤害。',
  }),

  // ───────────────────────── Bosses ─────────────────────────
  thornmaw: unit({
    id: 'thornmaw', name: '棘齿巨兽', enName: 'Thornmaw, the Forest Beast', faction: 'wildborn', role: 'boss',
    hp: 2900, attack: 42, armor: 8, armorType: 'fortified',
    moveSpeed: 84, attackRange: 62, attackCooldown: 1.9,
    cost: {}, pop: 0, buildTime: 0, radius: 30, sightRange: 520, xp: 260,
    ai: { kind: 'boss', leash: 700 },
    art: beast(0x6d5a3a, 0x2f4028, 0xc8ff6a, 2.05),
    desc: '格林谷地的霸主。三个阶段：咆哮召唤狼群、践踏冲击波、狂暴冲刺。',
  }),
  voidsorcerer: unit({
    id: 'voidsorcerer', name: '虚空巫妖', enName: 'Void Sorcerer', faction: 'voidborn', role: 'boss',
    hp: 2400, attack: 34, armor: 5, armorType: 'medium',
    moveSpeed: 92, attackRange: 210, attackCooldown: 1.7,
    cost: {}, pop: 0, buildTime: 0, radius: 22, sightRange: 560, xp: 280,
    damageType: 'magic',
    projectile: { speed: 340, texture: 'bolt', splash: 46 },
    ai: { kind: 'boss', leash: 700 },
    art: humanoid(0x2b2044, 0x9a6bff, 0x7fd8ff, 'staff', 1.7, false, 0x6f4fbf),
    desc: '虚空潮汐的先知，会召唤护盾与暗影新星。',
  }),
  ancientdragon: unit({
    id: 'ancientdragon', name: '远古巨龙', enName: 'Ancient Dragon', faction: 'voidborn', role: 'boss',
    hp: 4200, attack: 55, armor: 11, armorType: 'fortified',
    moveSpeed: 96, attackRange: 150, attackCooldown: 2.0,
    cost: {}, pop: 0, buildTime: 0, radius: 38, sightRange: 620, xp: 420,
    damageType: 'magic',
    projectile: { speed: 420, texture: 'fireball', splash: 58 },
    ai: { kind: 'boss', leash: 900 },
    art: beast(0x7a2f4a, 0x3a1430, 0xffb04a, 2.6),
    desc: '虚空潮汐的源头之一，俯冲与龙息能瞬间清空一整条战线。',
  }),
};

/** Present in data, hidden in the Phase-1 build menu (per roadmap). */
export const LOCKED_UNITS = new Set<string>(['squire', 'cleric', 'catapult']);

export function getUnit(id: string): UnitDef {
  const u = UNITS[id];
  if (!u) throw new Error(`[data] unknown unit: ${id}`);
  return u;
}
