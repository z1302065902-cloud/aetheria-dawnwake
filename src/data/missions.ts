import type { MapDef, MissionDef } from './types';

/** Phase-1 playable map. The other two biomes exist in data and are used by later missions. */
export const MAPS: Record<string, MapDef> = {
  greenValley: {
    id: 'greenValley', name: '翡翠谷地', enName: 'Green Valley', seed: 20260922, biome: 'valley',
    size: { w: 72, h: 72 },
    brief: '格林谷地是黎明王国最后的粮仓。荒野氏族在北侧扎营，虚空潮汐的痕迹已经出现在林地深处。',
  },
  darkForest: {
    id: 'darkForest', name: '暗影森林', enName: 'Dark Forest', seed: 771102, biome: 'forest', night: true,
    size: { w: 80, h: 80 },
    brief: '入夜后的森林里到处都是伏击。视野受限，荒野狼会在暗处扑上来。',
  },
  ruinedFortress: {
    id: 'ruinedFortress', name: '废墟要塞', enName: 'Ruined Fortress', seed: 31337, biome: 'fortress',
    size: { w: 84, h: 84 },
    brief: '虚空族把破碎的要塞改造成祭坛。 Ancient Dragon 在最高塔之上盘旋。',
  },
};

/** Phase 1: full campaign data, but only m01 is playable in this build. */
export const MISSIONS: MissionDef[] = [
  {
    id: 'm01', index: 1, name: '格林谷地', enName: 'Green Valley',
    map: MAPS.greenValley, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 420, wood: 320, mana: 80 },
    hero: 'knightCommander',
    objectives: [
      { id: 'o1', text: '采集 400 金币', kind: 'gather', target: { total: 400 } },
      { id: 'o2', text: '建造一座兵营', kind: 'build', target: { buildingId: 'barracks' } },
      { id: 'o3', text: '训练 4 名战斗单位', kind: 'produce', target: { count: 4 } },
      { id: 'o4', text: '摧毁荒野氏族营地', kind: 'destroy', target: { buildingId: 'wb_camp', count: 1 } },
      { id: 'o5', text: '击败棘齿巨兽', kind: 'boss', target: { unitId: 'thornmaw' } },
      { id: 'o6', text: '可选：指挥官全程未阵亡', kind: 'survive', optional: true, target: { count: 1 }, reward: { gold: 120, xp: 80 } },
      { id: 'o7', text: '可选：占领中央魔法神龛', kind: 'collect', optional: true, target: { tag: 'neutral_shrine', count: 1 }, reward: { gold: 90, relic: 'flameRelic' } },
      { id: 'o8', text: '可选：探索西南方的古老立石', kind: 'explore', optional: true, target: { tag: 'search' }, reward: { gold: 80, xp: 60 } },
          { id: 'o9', text: '隐藏：猎杀 3 只荒野野兽', kind: 'hunt', target: { count: 3 }, optional: true, hidden: true, revealAfter: 'o2', reward: { gold: 150, xp: 120 } },
],
    waves: { firstAt: 150, interval: 105, growth: 1.15, max: 9, units: ['raider', 'hunter', 'direwolf'] },
    enemyCamps: [
      { x: 54, y: 20, kind: 'wildborn', strength: 2 },
      { x: 50, y: 52, kind: 'wildborn', strength: 3 },
    ],
    boss: { unitId: 'thornmaw', x: 50, y: 52, spawnOn: 'o4' },
    timeOfDay: 'day',
    parTime: 20 * 60,
    brief: '建立前哨基地、训练部队、拔掉荒野氏族的据点。营地陷落时，这片谷地的主人会亲自现身。',
  },
  {
    id: 'm02', index: 2, name: '护卫商队', enName: 'Escort the Caravan',
    map: MAPS.greenValley, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 350, wood: 300, mana: 80 }, hero: 'ranger',
    objectives: [
      { id: 'o1', text: '护送补给车抵达南门', kind: 'escort', target: { count: 1 } },
      { id: 'o2', text: '消灭沿途伏击者', kind: 'destroy', target: { count: 12 } },
          { id: 'o3', text: '可选：发现 3 处冒险地点', kind: 'adventure', target: { count: 3 }, optional: true, reward: { gold: 120, xp: 90 } },
      { id: 'o4', text: '隐藏：猎杀 4 只荒野野兽', kind: 'hunt', target: { count: 4 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 160, xp: 140 } },
],
    waves: { firstAt: 120, interval: 95, growth: 1.2, max: 10, units: ['raider', 'hunter'] },
    enemyCamps: [{ x: 46, y: 30, kind: 'wildborn', strength: 3 }],
    boss: { unitId: 'thornmaw', x: 46, y: 30, spawnOn: 'o2' },
    timeOfDay: 'dawn',
    parTime: 18 * 60, brief: '通往南门的路上全是伏击。别让补给车停下。',
  },
  {
    id: 'm03', index: 3, name: '突袭敌营', enName: 'Raid the Camp',
    map: MAPS.greenValley, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 500, wood: 380, mana: 100 }, hero: 'knightCommander',
    objectives: [
      { id: 'o1', text: '摧毁三座氏族帐篷', kind: 'destroy', target: { buildingId: 'wb_tent', count: 3 } },
      { id: 'o2', text: '摧毁狼栏', kind: 'destroy', target: { buildingId: 'wb_pen', count: 1 } },
          { id: 'o3', text: '可选：猎杀 4 只荒野野兽', kind: 'hunt', target: { count: 4 }, optional: true, reward: { gold: 120, xp: 90 } },
      { id: 'o4', text: '隐藏：发现 3 处冒险地点', kind: 'adventure', target: { count: 3 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 160, xp: 140 } },
],
    waves: { firstAt: 100, interval: 90, growth: 1.22, max: 10, units: ['raider', 'wolfrider'] },
    enemyCamps: [{ x: 52, y: 46, kind: 'wildborn', strength: 5 }],
    boss: { unitId: 'thornmaw', x: 52, y: 46, spawnOn: 'o1' },
    timeOfDay: 'day',
    parTime: 18 * 60, brief: '主动出击。拆掉他们的生产建筑，狼群就没有增援。',
  },
  {
    id: 'm04', index: 4, name: '失踪的骑士', enName: 'The Lost Knight',
    map: MAPS.darkForest, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 420, wood: 340, mana: 120 }, hero: 'knightCommander',
    objectives: [
      { id: 'o1', text: '找到失踪骑士的营地', kind: 'explore', target: { tag: 'search' } },
      { id: 'o2', text: '营救骑士并护送回城堡', kind: 'rescue', target: { count: 1 } },
          { id: 'o3', text: '可选：占领一处魔法神龛', kind: 'collect', target: { tag: 'neutral_shrine', count: 1 }, optional: true, reward: { gold: 130, xp: 90 } },
      { id: 'o4', text: '隐藏：猎杀森林巨兽', kind: 'hunt', target: { count: 5 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 180, xp: 150 } },
],
    waves: { firstAt: 130, interval: 100, growth: 1.2, max: 10, units: ['raider', 'direwolf', 'shaman'] },
    enemyCamps: [{ x: 50, y: 44, kind: 'wildborn', strength: 4 }],
    boss: { unitId: 'thornmaw', x: 50, y: 44, spawnOn: 'o1' },
    timeOfDay: 'dusk',
    parTime: 20 * 60, brief: '在暗影森林里找到他——然后活着带他回来。',
  },
  {
    id: 'm05', index: 5, name: '城堡围城', enName: 'Siege of the Castle',
    map: MAPS.greenValley, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 600, wood: 500, mana: 150 }, hero: 'arcaneMage',
    objectives: [
      { id: 'o1', text: '坚守 8 分钟', kind: 'survive', target: { count: 1, total: 480 } },
      { id: 'o2', text: '城堡不能倒塌', kind: 'defend', target: { buildingId: 'castle' } },
          { id: 'o3', text: '可选：发现 3 处冒险地点', kind: 'adventure', target: { count: 3 }, optional: true, reward: { gold: 130, xp: 90 } },
      { id: 'o4', text: '隐藏：猎杀 5 只野兽', kind: 'hunt', target: { count: 5 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 170, xp: 140 } },
],
    waves: { firstAt: 60, interval: 55, growth: 1.25, max: 12, units: ['raider', 'hunter', 'wolfrider', 'shaman'] },
    enemyCamps: [{ x: 56, y: 18, kind: 'wildborn', strength: 5 }],
    boss: { unitId: 'thornmaw', x: 56, y: 18, spawnOn: 'time' },
    timeOfDay: 'day',
    parTime: 16 * 60, brief: '纯防守。把金币变成塔和墙，撑过八分钟。',
  },
  {
    id: 'm06', index: 6, name: '占领森林', enName: 'Claim the Forest',
    map: MAPS.darkForest, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 500, wood: 400, mana: 160 }, hero: 'ranger',
    objectives: [
      { id: 'o1', text: '占领两处魔法神龛', kind: 'collect', target: { tag: 'neutral_shrine', count: 2 } },
      { id: 'o2', text: '消灭林中伏兵', kind: 'destroy', target: { count: 20 } },
          { id: 'o3', text: '可选：猎杀 4 只林中野兽', kind: 'hunt', target: { count: 4 }, optional: true, reward: { gold: 130, xp: 90 } },
      { id: 'o4', text: '隐藏：发现 4 处冒险地点', kind: 'adventure', target: { count: 4 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 170, xp: 140 } },
],
    waves: { firstAt: 120, interval: 95, growth: 1.2, max: 11, units: ['raider', 'direwolf', 'hunter'] },
    enemyCamps: [{ x: 26, y: 22, kind: 'wildborn', strength: 4 }],
    boss: { unitId: 'thornmaw', x: 26, y: 22, spawnOn: 'o1' },
    timeOfDay: 'dusk',
    parTime: 20 * 60, brief: '森林会用伏击教你什么叫视野。',
  },
  {
    id: 'm07', index: 7, name: '摧毁矿场', enName: 'Break the Mines',
    map: MAPS.darkForest, playerFaction: 'dawn', enemyFactions: ['wildborn'],
    startResources: { gold: 560, wood: 420, mana: 180 }, hero: 'knightCommander',
    objectives: [
      { id: 'o1', text: '摧毁敌方金矿营地', kind: 'destroy', target: { buildingId: 'wb_camp', count: 1 } },
      { id: 'o2', text: '保有至少 3 座自己的金矿', kind: 'collect', target: { tag: 'goldmine', count: 3 } },
          { id: 'o3', text: '可选：发现 3 处冒险地点', kind: 'adventure', target: { count: 3 }, optional: true, reward: { gold: 130, xp: 90 } },
      { id: 'o4', text: '隐藏：猎杀 5 只野兽', kind: 'hunt', target: { count: 5 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 170, xp: 140 } },
],
    waves: { firstAt: 110, interval: 90, growth: 1.22, max: 11, units: ['raider', 'wolfrider', 'shaman'] },
    enemyCamps: [{ x: 48, y: 48, kind: 'wildborn', strength: 5 }],
    boss: { unitId: 'thornmaw', x: 48, y: 48, spawnOn: 'o1' },
    timeOfDay: 'day',
    parTime: 20 * 60, brief: '经济战。打断他们的收入，比堆兵更有效。',
  },
  {
    id: 'm08', index: 8, name: '营救英雄', enName: 'Rescue the Hero',
    map: MAPS.darkForest, playerFaction: 'dawn', enemyFactions: ['voidborn'],
    startResources: { gold: 620, wood: 460, mana: 220 }, hero: 'arcaneMage',
    objectives: [
      { id: 'o1', text: '突破虚空祭坛防线', kind: 'destroy', target: { buildingId: 'vb_altar', count: 1 } },
      { id: 'o2', text: '救出被囚禁的同伴', kind: 'rescue', target: { count: 1 } },
          { id: 'o3', text: '可选：猎杀 4 只虚空造物', kind: 'hunt', target: { count: 4 }, optional: true, reward: { gold: 140, xp: 100 } },
      { id: 'o4', text: '隐藏：发现 4 处冒险地点', kind: 'adventure', target: { count: 4 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 180, xp: 150 } },
],
    waves: { firstAt: 100, interval: 85, growth: 1.25, max: 12, units: ['shade', 'raider', 'shaman'] },
    enemyCamps: [{ x: 50, y: 50, kind: 'voidborn', strength: 5 }],
    boss: { unitId: 'voidsorcerer', x: 50, y: 50, spawnOn: 'o1' },
    timeOfDay: 'night',
    parTime: 22 * 60, brief: '虚空族第一次露面。他们的法术会溅射，散开队形。',
  },
  {
    id: 'm09', index: 9, name: '黑暗堡垒', enName: 'The Dark Fortress',
    map: MAPS.ruinedFortress, playerFaction: 'dawn', enemyFactions: ['voidborn'],
    startResources: { gold: 700, wood: 520, mana: 260 }, hero: 'ranger',
    objectives: [
      { id: 'o1', text: '摧毁两座虚空祭坛', kind: 'destroy', target: { buildingId: 'vb_altar', count: 2 } },
      { id: 'o2', text: '攻城器械必须存活', kind: 'defend', target: { unitId: 'catapult' } },
          { id: 'o3', text: '可选：占领一处魔法神龛', kind: 'collect', target: { tag: 'neutral_shrine', count: 1 }, optional: true, reward: { gold: 150, xp: 100 } },
      { id: 'o4', text: '隐藏：发现 4 处冒险地点', kind: 'adventure', target: { count: 4 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 190, xp: 150 } },
],
    waves: { firstAt: 95, interval: 80, growth: 1.28, max: 13, units: ['shade', 'raider', 'shaman'] },
    enemyCamps: [{ x: 52, y: 50, kind: 'voidborn', strength: 6 }],
    boss: { unitId: 'voidsorcerer', x: 52, y: 50, spawnOn: 'o1' },
    timeOfDay: 'night',
    parTime: 22 * 60, brief: '用投石车砸开祭坛。虚空巫妖会阻止你。',
  },
  {
    id: 'm10', index: 10, name: '虚空潮汐', enName: 'Tide of the Void',
    map: MAPS.ruinedFortress, playerFaction: 'dawn', enemyFactions: ['voidborn', 'wildborn'],
    startResources: { gold: 800, wood: 600, mana: 320 }, hero: 'knightCommander',
    objectives: [
      { id: 'o1', text: '抵挡虚空潮汐的三波冲击', kind: 'defend', target: { count: 3 } },
      { id: 'o2', text: '击败远古巨龙', kind: 'boss', target: { unitId: 'ancientdragon' } },
          { id: 'o3', text: '可选：发现 4 处冒险地点', kind: 'adventure', target: { count: 4 }, optional: true, reward: { gold: 150, xp: 100 } },
      { id: 'o4', text: '隐藏：猎杀 6 只虚空造物', kind: 'hunt', target: { count: 6 }, optional: true, hidden: true, revealAfter: 'o1', reward: { gold: 200, xp: 160 } },
],
    waves: { firstAt: 80, interval: 70, growth: 1.3, max: 15, units: ['shade', 'wolfrider', 'shaman', 'raider'] },
    enemyCamps: [{ x: 56, y: 54, kind: 'voidborn', strength: 7 }],
    boss: { unitId: 'ancientdragon', x: 56, y: 54, spawnOn: 'o1' },
    timeOfDay: 'night',
    parTime: 25 * 60, brief: '最后一战。巨龙不会被城墙挡住。',
  },
];

export const PLAYABLE_MISSIONS = new Set<string>(['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10']);

export function getMission(id: string): MissionDef {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) throw new Error(`[data] unknown mission: ${id}`);
  return m;
}
