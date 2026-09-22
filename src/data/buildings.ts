import type { BuildingDef } from './types';

const b = (d: BuildingDef): BuildingDef => d;

export const BUILDINGS: Record<string, BuildingDef> = {
  // ───────────── Dawn Kingdom ─────────────
  castle: b({
    id: 'castle', name: '黎明城堡', enName: 'Dawn Castle', faction: 'dawn',
    hp: 2600, armor: 9, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 4, h: 4 }, popProvided: 4,
    produces: ['settler'], depot: true, buildable: false, unlockedAt: 'm01',
    attack: { damage: 20, range: 210, cooldown: 1.7, damageType: 'physical', projectile: { speed: 520, texture: 'arrow' } },
    art: { shape: 'hall', body: 0xd7dbe6, trim: 0x4b6cc1, accent: 0xffd257, scale: 1, banner: 0x4b6cc1 },
    desc: '王国的心脏。生产拓荒者、复活英雄、存放资源。被摧毁即战败。',
  }),
  barracks: b({
    id: 'barracks', name: '兵营', enName: 'Barracks', faction: 'dawn',
    hp: 900, armor: 6, armorType: 'fortified',
    cost: { gold: 150, wood: 100 }, buildTime: 26, footprint: { w: 3, h: 3 }, popProvided: 0,
    produces: ['footman', 'squire'], buildable: true, unlockedAt: 'm01',
    art: { shape: 'tower', body: 0x9aa6bd, trim: 0x4b6cc1, accent: 0xd9e2f5, scale: 1, banner: 0xc94b4b },
    desc: '训练近战步兵。第一座兵营是任何战术的起点。',
  }),
  archery: b({
    id: 'archery', name: '射手营地', enName: 'Archery Range', faction: 'dawn',
    hp: 820, armor: 5, armorType: 'fortified',
    cost: { gold: 140, wood: 130 }, buildTime: 26, footprint: { w: 3, h: 3 }, popProvided: 0,
    produces: ['archer'], buildable: true, unlockedAt: 'm01',
    art: { shape: 'tent', body: 0x6f8f5a, trim: 0x3f5a34, accent: 0xd9f0a0, scale: 1.06, banner: 0x6f9f4a },
    desc: '训练弓箭手。远程火力是消灭萨满与巨兽的关键。',
  }),
  farm: b({
    id: 'farm', name: '农庄', enName: 'Farm', faction: 'dawn',
    hp: 420, armor: 4, armorType: 'fortified',
    cost: { wood: 90 }, buildTime: 18, footprint: { w: 2, h: 2 }, popProvided: 8,
    buildable: true, unlockedAt: 'm01',
    art: { shape: 'tent', body: 0xc9a45a, trim: 0x8a6a2a, accent: 0xffe9a0, scale: 1, banner: 0xd9b04a },
    desc: '每个农庄提供 8 点人口上限（上限 60）。',
  }),
  tower: b({
    id: 'tower', name: '守卫塔', enName: 'Guard Tower', faction: 'dawn',
    hp: 760, armor: 10, armorType: 'fortified',
    cost: { gold: 110, wood: 90 }, buildTime: 22, footprint: { w: 2, h: 2 }, popProvided: 0,
    buildable: true, unlockedAt: 'm01',
    attack: { damage: 19, range: 235, cooldown: 1.35, damageType: 'physical', projectile: { speed: 560, texture: 'arrow' } },
    art: { shape: 'tower', body: 0xb7bfd0, trim: 0x5a6b8f, accent: 0xffd257, scale: 0.92, banner: 0x4b6cc1 },
    desc: '自动攻击范围内敌人。沿路造塔能极大减轻防守压力。',
  }),
  magetower: b({
    id: 'magetower', name: '法师塔', enName: 'Mage Tower', faction: 'dawn',
    hp: 780, armor: 5, armorType: 'fortified',
    cost: { gold: 190, wood: 110, mana: 80 }, buildTime: 32, footprint: { w: 3, h: 3 }, popProvided: 0,
    produces: ['cleric'], buildable: true, unlockedAt: 'm02', requires: 'barracks',
    attack: { damage: 26, range: 250, cooldown: 2.1, damageType: 'magic', projectile: { speed: 420, texture: 'bolt', splash: 40 } },
    art: { shape: 'tower', body: 0x8f7fd0, trim: 0x4a3a8f, accent: 0x9ff0ff, scale: 1.15, banner: 0x6f4fbf },
    desc: '训练牧师，并用法术飞弹溅射敌人。需要魔法水晶。',
  }),
  workshop: b({
    id: 'workshop', name: '工坊', enName: 'Workshop', faction: 'dawn',
    hp: 860, armor: 7, armorType: 'fortified',
    cost: { gold: 200, wood: 180 }, buildTime: 34, footprint: { w: 3, h: 3 }, popProvided: 0,
    produces: ['catapult'], buildable: true, unlockedAt: 'm04', requires: 'barracks',
    art: { shape: 'hall', body: 0x9a8a6a, trim: 0x5f5240, accent: 0xd9b183, scale: 0.95, banner: 0x8a6a3a },
    desc: '制造投石车。攻城利器，但需要保护。',
  }),

  // ───────────── Wildborn Clans (enemy camps) ─────────────
  wb_tent: b({
    id: 'wb_tent', name: '氏族帐篷', enName: 'Clan Tent', faction: 'wildborn',
    hp: 900, armor: 4, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 3, h: 3 }, popProvided: 0,
    produces: ['raider', 'hunter'], buildable: false, unlockedAt: 'm01',
    art: { shape: 'tent', body: 0x8a5f3a, trim: 0x4f3520, accent: 0xffb066, scale: 1.15, banner: 0xc24a2a },
    desc: '荒野氏族的生产建筑，持续产出劫掠者。',
  }),
  wb_totem: b({
    id: 'wb_totem', name: '荒野图腾', enName: 'Wild Totem', faction: 'wildborn',
    hp: 700, armor: 3, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 2, h: 2 }, popProvided: 0,
    attack: { damage: 15, range: 190, cooldown: 1.9, damageType: 'magic', projectile: { speed: 360, texture: 'bolt', splash: 30 } },
    buildable: false, unlockedAt: 'm01',
    art: { shape: 'crystal', body: 0x6f8f5a, trim: 0x2f4028, accent: 0x9fffd0, scale: 1.1, banner: 0x2f8f6a },
    desc: '为附近氏族单位提供治疗光环，并会施放闪电。',
  }),
  wb_pen: b({
    id: 'wb_pen', name: '狼栏', enName: 'Wolf Pen', faction: 'wildborn',
    hp: 620, armor: 3, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 2, h: 2 }, popProvided: 0,
    produces: ['direwolf'], buildable: false, unlockedAt: 'm01',
    art: { shape: 'ring', body: 0x6c6257, trim: 0x3b352e, accent: 0xc9b183, scale: 1.0, banner: 0x8a5f3a },
    desc: '圈养荒野狼。摧毁它可以阻止狼群增援。',
  }),
  // ───────────── Voidborn ─────────────
  vb_altar: b({
    id: 'vb_altar', name: '虚空祭坛', enName: 'Void Altar', faction: 'voidborn',
    hp: 1400, armor: 7, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 3, h: 3 }, popProvided: 0,
    produces: ['shade'], buildable: false, unlockedAt: 'm02',
    attack: { damage: 24, range: 220, cooldown: 2.2, damageType: 'magic', projectile: { speed: 380, texture: 'bolt', splash: 44 } },
    art: { shape: 'shrine', body: 0x3b2c5e, trim: 0x1b1430, accent: 0xc39bff, scale: 1.2, banner: 0x6f4fbf },
    desc: '虚空族的核心建筑，不断召唤暗影战士。',
  }),
  wb_camp: b({
    id: 'wb_camp', name: '氏族营地', enName: 'Clan Camp', faction: 'wildborn',
    hp: 1800, armor: 6, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 4, h: 4 }, popProvided: 0,
    produces: ['raider'], buildable: false, unlockedAt: 'm01',
    attack: { damage: 18, range: 200, cooldown: 1.8, damageType: 'physical', projectile: { speed: 480, texture: 'arrow' } },
    art: { shape: 'hall', body: 0x7a4f30, trim: 0x3f2a18, accent: 0xffb066, scale: 1.05, banner: 0xc24a2a },
    desc: '荒野氏族营地本部。摧毁它，Boss 就会现身。',
  }),
  neutral_shrine: b({
    id: 'neutral_shrine', name: '魔法神龛', enName: 'Mana Shrine', faction: 'neutral',
    hp: 400, armor: 4, armorType: 'fortified',
    cost: {}, buildTime: 0, footprint: { w: 2, h: 2 }, popProvided: 0,
    buildable: false, unlockedAt: 'm01',
    art: { shape: 'shrine', body: 0x9fd6e6, trim: 0x3f6f8f, accent: 0xffffff, scale: 1.0, banner: 0x7fd8ff },
    desc: '占领后每秒提供魔法水晶。',
  }),
};

export const BUILD_ORDER: string[] = ['barracks', 'archery', 'farm', 'tower', 'magetower', 'workshop'];

export function getBuilding(id: string): BuildingDef {
  const d = BUILDINGS[id];
  if (!d) throw new Error(`[data] unknown building: ${id}`);
  return d;
}
