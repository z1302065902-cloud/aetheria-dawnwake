import type { ItemDef, RelicDef } from './types';

export const ITEMS: ItemDef[] = [
  { id: 'shortSword', name: '训练短剑', slot: 'weapon', rarity: 'common', stats: { attack: 6 }, desc: '新兵的第一把武器。' },
  { id: 'towerShield', name: '塔盾', slot: 'armor', rarity: 'common', stats: { armor: 4, hp: 30 }, desc: '厚重，但确实挡得住。' },
  { id: 'oakRing', name: '橡木指环', slot: 'ring', rarity: 'common', stats: { mana: 20 }, desc: '刻着谷地纹章的旧戒指。' },
  { id: 'emberBlade', name: '余烬之刃', slot: 'weapon', rarity: 'rare', stats: { attack: 14, crit: 6 }, desc: '剑刃上还留着不灭的余火。' },
  { id: 'wardenPlate', name: '守望板甲', slot: 'armor', rarity: 'rare', stats: { armor: 9, hp: 120 }, desc: '王国铸甲师的杰作。' },
  { id: 'stormAmulet', name: '风暴护符', slot: 'amulet', rarity: 'rare', stats: { skillDamage: 12, mana: 40 }, desc: '内部有微小的雷声。' },
  { id: 'thornCrown', name: '荆棘王冠', slot: 'amulet', rarity: 'epic', stats: { attack: 12, skillDamage: 20, hp: 80 }, desc: '从棘齿巨兽骨架上取下。' },
  { id: 'voidSigil', name: '虚空印记', slot: 'ring', rarity: 'epic', stats: { attackSpeed: 18, crit: 10 }, desc: '戴上它，时间会变得慢一点。' },
  { id: 'dawnRegalia', name: '黎明王权', slot: 'armor', rarity: 'legendary', stats: { armor: 16, hp: 320, attack: 16 }, desc: '黎明王国失落已久的王权甲。' },
  { id: 'tidePiercer', name: '破潮之矛', slot: 'weapon', rarity: 'legendary', stats: { attack: 34, crit: 14, skillDamage: 18 }, desc: '传说它曾刺穿虚空潮汐本身。' },
];

export const RELICS: RelicDef[] = [
  { id: 'flameRelic', name: '烈焰遗物', desc: '所有火焰与魔法技能伤害 +10%。', effect: { key: 'fireDamage', value: 0.1 }, cost: 1 },
  { id: 'warriorRelic', name: '战士遗物', desc: '所有近战单位生命 +8%。', effect: { key: 'meleeHp', value: 0.08 }, cost: 1 },
  { id: 'kingdomRelic', name: '王国遗物', desc: '所有建筑生命 +10%。', effect: { key: 'buildingHp', value: 0.1 }, cost: 2 },
  { id: 'harvestRelic', name: '丰饶遗物', desc: '采集速度 +12%。', effect: { key: 'harvestRate', value: 0.12 }, cost: 2 },
  { id: 'bannerRelic', name: '战旗遗物', desc: '部队移动速度 +6%。', effect: { key: 'unitSpeed', value: 0.06 }, cost: 2 },
  { id: 'heroRelic', name: '英魂遗物', desc: '英雄伤害 +12%。', effect: { key: 'heroDamage', value: 0.12 }, cost: 3 },
];

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function relicById(id: string): RelicDef | undefined {
  return RELICS.find((r) => r.id === id);
}

export function rollLoot(rng: { next: () => number }, tier: number): ItemDef {
  const table = ITEMS.filter((i) => {
    const r = i.rarity;
    if (tier <= 1) return r === 'common' || r === 'rare';
    if (tier === 2) return r === 'rare' || r === 'epic';
    return r === 'epic' || r === 'legendary';
  });
  return table[Math.floor(rng.next() * table.length)] ?? ITEMS[0];
}
