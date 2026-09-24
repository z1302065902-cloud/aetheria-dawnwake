/**
 * AETHERIA — VISUAL BIBLE (single source of truth)
 * ================================================
 *
 * Every colour, proportion, lighting rule and UI token in the game comes from this file.
 * Nothing in `art/`, `ui/`, `scenes/` or `systems/` may hardcode a visual constant: if you
 * need a new colour, add it here and reference it.
 *
 * `tests/visual.mjs` enforces this (palette compliance, contrast, faction legibility) and
 * renders `artifacts/50-visual-bible.png` from the values below, so the spec can never drift
 * away from what the game actually draws.
 *
 * The five things that matter most, in the order they should be improved when time is short:
 *   1. LIGHT   — AO + cast shadow + rim light + ambient + skill glow
 *   2. COLOUR  — faction / region / element / boss, so the player reads the board instantly
 *   3. VFX     — the full chain: trail -> hit -> burst -> residue -> numbers -> sound
 *   4. SILHOUETTE — a hero must be recognisable at minimum zoom
 *   5. UI      — never default HTML widgets; everything is drawn in-engine
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. STYLE — 整体风格
// ─────────────────────────────────────────────────────────────────────────────

export const STYLE = {
  /** "Hand-painted chunky fantasy": readable at 100% zoom, no photo texture, no gradient mush. */
  name: 'hand-painted chunky fantasy',
  /** Every sprite is drawn at N× and downsampled: this is what makes edges crisp, not blurry. */
  supersample: 2,
  /** Dark ink outline around silhouettes, in screen pixels. */
  outline: { width: 1.6, color: 0x121420, softWidth: 2.6, softAlpha: 0.35 },
  /** Fixed isometric-ish top-down: units face left/right only, buildings are front-on. */
  orthographic: true,
  /** Nothing is anti-aliased away: no drop-shadow filters, no blur except the fog texture. */
  forbidden: ['bitmap photos', 'AI-mush gradients', 'pure white', 'pure black', 'default HTML UI'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. FACTIONS — 阵营色（一眼分清敌我）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five-layer colour system every faction, region and boss must define:
 *   base (dominant) · secondary · accent (the ONE attention colour) · shadow · highlight
 * `sat` is the saturation tier the colour is allowed to occupy, which is what makes the
 * 70/20/10 rule enforceable instead of aspirational: environments must stay low-saturation,
 * characters mid, and only the focus colour is allowed to be loud.
 */
export interface FactionStyle {
  name: string;
  /** dominant body/armour colour */
  primary: number;
  /** deeper shade used for the far-side limbs */
  secondary: number;
  /** metal / leather */
  metal: number;
  /** cloth, tabard, banner */
  cloth: number;
  /** the ONE colour that must be visible at minimum zoom (also the rim light) */
  signal: number;
  /** darkness layer: never pure black, always carrying the faction's hue */
  shadow: number;
  /** light layer: the top-lit edge, never pure white */
  highlight: number;
  /** validity: the player's own faction, the enemy, the neutral wildlife */
  role: 'player' | 'enemy' | 'neutral';
}

export const FACTION: Record<'dawn' | 'wildborn' | 'voidborn' | 'neutral', FactionStyle> = {
  // ── 黎明王国 Dawn Kingdom ── 光明 / 秩序 / 王国 / 希望 / 神圣
  // Royal Blue 主调 + Warm Gold 强调 + Ivory 布 + Emerald 点缀
  dawn: {
    name: '黎明王国 Dawn Kingdom',
    primary: 0x4b6cc1,   // Royal Blue
    secondary: 0x2c3f7d, // deep royal
    metal: 0xb9c4d8,     // polished steel
    cloth: 0xf0ead6,     // ivory
    signal: 0xffd257,    // warm gold — the single attention colour
    shadow: 0x1b2547,    // never black: carries the blue hue
    highlight: 0xdce8ff, // top-lit edge, never white
    role: 'player',
  },
  // ── 荒野氏族 Wildborn ── 危险 / 野蛮 / 火焰
  wildborn: {
    name: '荒野氏族 Wildborn Clans',
    primary: 0x8a5f3a,
    secondary: 0x4f3520,
    metal: 0x7a6a52,
    cloth: 0xc9a86a,
    signal: 0xff8a3a,
    shadow: 0x2a1a0e,
    highlight: 0xe8c79a,
    role: 'enemy',
  },
  // ── 虚空族 Voidborn ── 腐化 / 黑暗 / 邪恶（Toxic Green 作为腐化点缀）
  voidborn: {
    name: '虚空族 Voidborn',
    primary: 0x6f4fbf,
    secondary: 0x241a3d,
    metal: 0x5a4a8a,
    cloth: 0x2b2145,
    signal: 0x7fd8ff,    // electric blue — cold, opposed to the wildborn's warm
    shadow: 0x120c22,
    highlight: 0xded4ff,
    role: 'enemy',
  },
  // ── 中立野兽 Neutral Wildlife ── 低饱和，永不抢焦点
  neutral: {
    name: '中立野兽 Neutral Wildlife',
    primary: 0x6b6152,
    secondary: 0x3d362c,
    metal: 0x8a8272,
    cloth: 0x9a8f78,
    signal: 0xd9c9a0,
    shadow: 0x241f18,
    highlight: 0xd6cbb4,
    role: 'neutral',
  },
};

/**
 * 70 / 20 / 10 —— 最重要的规则。
 *   70% low-saturation environment, 20% character/building colour, 10% loud focus colour.
 * `SATURATION_BUDGET` makes it checkable: every colour in the bible is classified into a tier
 * by HSV saturation and the compliance test asserts the tiers keep their distance.
 */
export const SATURATION_BUDGET = {
  /**
   * 70% — the world. Ground/grass may keep stylised colour (a fantasy map with grey grass is
   * worse than a green one); what must stay near-neutral is the ATMOSPHERE: fog, ambient tint
   * and weather, because those are what would otherwise wash over the characters.
   */
  environment: { max: 0.34, target: 0.7 },
  /** absolute cap for fog / ambient / weather */
  atmosphere: { max: 0.34 },
  /** 20% — units, buildings, UI chrome. Mid saturation so silhouettes read. */
  subject: { min: 0.3, max: 0.72, target: 0.2 },
  /**
   * 10% — hero signal, skill cores, boss glow, objectives. The only loud colours allowed.
   * The floor is 0.45 rather than 0.55 because cool colours (cyan, electric blue) read as vivid
   * at a lower HSV saturation than warm ones: 0.55 would wrongly disqualify every ice/void hue.
   */
  focus: { min: 0.45, target: 0.1 },
} as const;

/** Colour that tells the player "this is where the eye should go". */
export const FOCUS = {
  hero: 0xffd257,
  objective: 0x3dffa0,
  importantResource: 0xffd257,
  danger: 0xff4a3a,
  boss: 0xff5a3a,
  interactable: 0xb585ff,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2b. BOSS IDENTITY — 每个 Boss 拥有独立色彩身份（进入战斗时环境光随之改变）
// ─────────────────────────────────────────────────────────────────────────────

export interface BossIdentity {
  name: string;
  /** body dominant */
  primary: number;
  /** deep/shadow side */
  secondary: number;
  /** glow, eyes, energy — this is what makes it read as a boss */
  glow: number;
  /** the metallic trophy colour on the armour/horns */
  gold: number;
  /** the ambient light the arena takes on while this boss is alive */
  arena: { ambient: number; alpha: number; fog: number };
  /** aura radius multiplier vs a soldier */
  aura: number;
}

export const BOSS_IDENTITY: Record<string, BossIdentity> = {
  // Ancient Dragon — Deep Crimson / Black / Gold
  ancientdragon: {
    name: '远古巨龙 Ancient Dragon',
    primary: 0x8f1f24,
    secondary: 0x1a0d10,
    glow: 0xff5a3a,
    gold: 0xffd257,
    arena: { ambient: 0xff6a4a, alpha: 0.26, fog: 0x1a0808 },
    aura: 2.6,
  },
  // Void Sorcerer — Purple / Black / Electric Blue
  voidsorcerer: {
    name: '虚空巫师 Void Sorcerer',
    primary: 0x6f4fbf,
    secondary: 0x140e24,
    glow: 0x7fd8ff,
    gold: 0xc8b8ff,
    arena: { ambient: 0x8f6fff, alpha: 0.24, fog: 0x0c0818 },
    aura: 2.2,
  },
  // Thornmaw — a corrupted forest beast: toxic green / bone / ember
  thornmaw: {
    name: '棘齿巨兽 Thornmaw',
    primary: 0x4a6b32,
    secondary: 0x1c2414,
    glow: 0x9fe07a,
    gold: 0xd9c9a0,
    arena: { ambient: 0xa8d070, alpha: 0.2, fog: 0x0e1408 },
    aura: 2.0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2c. MATERIALS — 材质：不同材料必须有不同高光/纹理/粒子（即使 2D 也要模拟）
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialStyle {
  name: string;
  /** how bright the top-lit edge is drawn (0 = matte, 1 = mirror) */
  specular: number;
  /** how much noise/grain the generator adds */
  grain: number;
  /** does light pass through it (crystal / magic) */
  translucent: boolean;
  /** emissive glow strength (magic, crystal, lava) */
  emission: number;
  /** particle behaviour when this material is hit or destroyed */
  hit: { sparks: number; debris: number; dust: number; debrisColor: number };
}

export const MATERIAL: Record<'metal' | 'stone' | 'wood' | 'cloth' | 'grass' | 'water' | 'crystal' | 'magic' | 'flesh' | 'scale', MaterialStyle> = {
  metal: { name: '金属', specular: 0.95, grain: 0.06, translucent: false, emission: 0, hit: { sparks: 9, debris: 2, dust: 1, debrisColor: 0xb9a884 } },
  stone: { name: '石材', specular: 0.22, grain: 0.5, translucent: false, emission: 0, hit: { sparks: 1, debris: 8, dust: 3, debrisColor: 0x8a8a92 } },
  wood: { name: '木材', specular: 0.3, grain: 0.34, translucent: false, emission: 0, hit: { sparks: 0, debris: 7, dust: 2, debrisColor: 0x8a5f3a } },
  cloth: { name: '布料', specular: 0.12, grain: 0.18, translucent: false, emission: 0, hit: { sparks: 0, debris: 3, dust: 2, debrisColor: 0xc9a86a } },
  grass: { name: '草地', specular: 0.1, grain: 0.42, translucent: false, emission: 0, hit: { sparks: 0, debris: 4, dust: 4, debrisColor: 0x559042 } },
  water: { name: '水面', specular: 1, grain: 0.02, translucent: true, emission: 0, hit: { sparks: 3, debris: 0, dust: 0, debrisColor: 0x7fd8ff } },
  crystal: { name: '水晶', specular: 0.8, grain: 0.05, translucent: true, emission: 0.5, hit: { sparks: 12, debris: 5, dust: 0, debrisColor: 0x9f7fff } },
  magic: { name: '魔法', specular: 0.6, grain: 0, translucent: true, emission: 1, hit: { sparks: 14, debris: 0, dust: 0, debrisColor: 0xc8a4ff } },
  flesh: { name: '皮肉', specular: 0.35, grain: 0.1, translucent: false, emission: 0, hit: { sparks: 0, debris: 2, dust: 1, debrisColor: 0xb03a3a } },
  scale: { name: '鳞甲', specular: 0.7, grain: 0.2, translucent: false, emission: 0, hit: { sparks: 5, debris: 4, dust: 1, debrisColor: 0x8f1f24 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2d. WEATHER — 天气（不能影响玩家判断；Boss 战轻灰、森林薄雾、魔法区浮粒）
// ─────────────────────────────────────────────────────────────────────────────

export interface WeatherStyle {
  name: string;
  kind: 'none' | 'mist' | 'rain' | 'snow' | 'ash' | 'magic';
  color: number;
  /** particles per screen */
  count: number;
  alpha: number;
  size: number;
  /** vertical speed (negative = falling) */
  fall: number;
  drift: number;
  /** opacity of the drifting mist band layer, 0 = none */
  mist: number;
}

export const WEATHER: Record<'clear' | 'mist' | 'ash' | 'rain' | 'snow' | 'magic', WeatherStyle> = {
  clear: { name: '晴', kind: 'none', color: 0xfff0c8, count: 0, alpha: 0, size: 1, fall: 0, drift: 0, mist: 0 },
  mist: { name: '薄雾', kind: 'mist', color: 0xdfe8e0, count: 26, alpha: 0.16, size: 2.6, fall: -2, drift: 16, mist: 0.1 },
  ash: { name: '灰烬', kind: 'ash', color: 0xb8b2ac, count: 46, alpha: 0.34, size: 1.8, fall: 9, drift: 7, mist: 0.06 },
  rain: { name: '雨', kind: 'rain', color: 0xa8c8e0, count: 70, alpha: 0.3, size: 1.4, fall: 190, drift: 26, mist: 0.08 },
  snow: { name: '雪', kind: 'snow', color: 0xe8f0ff, count: 52, alpha: 0.5, size: 2.0, fall: 26, drift: 12, mist: 0.12 },
  magic: { name: '魔法浮粒', kind: 'magic', color: 0xc8a4ff, count: 40, alpha: 0.42, size: 2.2, fall: -6, drift: 10, mist: 0.04 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. RANK — 视觉层级（英雄 > 精英 > 士兵 > 工人；Boss 单独一档）
// ─────────────────────────────────────────────────────────────────────────────

export const RANK = {
  /** the hero: biggest silhouette, brightest signal colour, always has a rim light */
  hero: { scaleMul: 1.12, rim: 0.85, outlineMul: 1.15, hasAura: true, signalBoost: 1.0 },
  /** named units / squires */
  elite: { scaleMul: 1.0, rim: 0.5, outlineMul: 1.0, hasAura: false, signalBoost: 0.8 },
  /** line infantry — the visual baseline everything else is measured against */
  soldier: { scaleMul: 0.94, rim: 0.3, outlineMul: 1.0, hasAura: false, signalBoost: 0.6 },
  /** workers: deliberately the dullest silhouette, no signal colour */
  worker: { scaleMul: 0.9, rim: 0.12, outlineMul: 0.95, hasAura: false, signalBoost: 0.0 },
  /** bosses: 1.7-2.0× a soldier, always glowing, always with an aura */
  boss: { scaleMul: 1.9, rim: 1.0, outlineMul: 1.3, hasAura: true, signalBoost: 1.0 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 4. REGIONS — 区域色（每张地图有不同环境光与地面基调）
// ─────────────────────────────────────────────────────────────────────────────

export interface RegionStyle {
  name: string;
  /** base ground colour (grass/ash/stone) */
  ground: number;
  groundAlt: number;
  /** rocks and cliff faces */
  stone: number;
  /** the ambient light tint laid over the whole map (multiply, low alpha) */
  ambient: number;
  ambientAlpha: number;
  /** fog of war tint */
  fog: number;
  /** accent used by landmarks in this region */
  accent: number;
}

export const REGION: Record<'valley' | 'forest' | 'fortress' | 'arena', RegionStyle> = {
  valley: {
    name: '绿谷 Green Valley',
    ground: 0x4a7a3e,
    groundAlt: 0x559042,
    stone: 0x8f8f96,
    ambient: 0xfff0c8,
    ambientAlpha: 0.1,
    fog: 0x0a1020,
    accent: 0xffd257,
  },
  forest: {
    name: '暗影森林 Dark Forest',
    ground: 0x3a6338,
    groundAlt: 0x487a44,
    stone: 0x6f7a72,
    ambient: 0xc8e0ff,
    ambientAlpha: 0.16,
    fog: 0x081018,
    accent: 0x9fe07a,
  },
  fortress: {
    name: '黑暗堡垒 Ruined Fortress',
    ground: 0x5a5f66,
    groundAlt: 0x6d6f74,
    stone: 0x8a8a92,
    ambient: 0xd8c0ff,
    ambientAlpha: 0.18,
    fog: 0x0c0a18,
    accent: 0x7fd8ff,
  },
  arena: {
    name: 'Boss 竞技场',
    ground: 0x4a4048,
    groundAlt: 0x5a4c54,
    stone: 0x7a6a72,
    ambient: 0xffb0a0,
    ambientAlpha: 0.22,
    fog: 0x1a0a12,
    accent: 0xff5a3a,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4b. REGION VFX — 每个区域的粒子/天气配色（森林飘叶萤火、堡垒飘灰烬、竞技场火星）
// ─────────────────────────────────────────────────────────────────────────────

export interface RegionVfx {
  name: string;
  /** ambient motes that drift across the map all match long */
  mote: { color: number; alpha: number; size: number; count: number; driftX: number; driftY: number; bob: number };
  /** second mote layer, usually rarer and brighter (fireflies, embers) */
  spark: { color: number; alpha: number; size: number; count: number; blink: number } | null;
  /** what a hit leaves behind here: smoke tint + ground residue + debris colour */
  impact: { smoke: number; residue: number; debris: number };
}

export const REGION_VFX: Record<'valley' | 'forest' | 'fortress' | 'arena', RegionVfx> = {
  valley: {
    name: '绿谷',
    mote: { color: 0xe8e0b0, alpha: 0.4, size: 1.6, count: 54, driftX: 9, driftY: -5, bob: 0.9 },
    spark: { color: 0xfff0a0, alpha: 0.5, size: 2.2, count: 10, blink: 0.55 },
    impact: { smoke: 0x8a8478, residue: 0x3a2a18, debris: 0xb9a884 },
  },
  forest: {
    name: '暗影森林',
    mote: { color: 0x9fe07a, alpha: 0.4, size: 1.8, count: 62, driftX: 12, driftY: -3, bob: 1.2 },
    spark: { color: 0xd8ff9a, alpha: 0.62, size: 2.4, count: 22, blink: 0.4 },
    impact: { smoke: 0x4a5a44, residue: 0x243018, debris: 0x7fa05a },
  },
  fortress: {
    name: '黑暗堡垒',
    mote: { color: 0x9a94a8, alpha: 0.34, size: 1.7, count: 70, driftX: 6, driftY: -9, bob: 0.7 },
    spark: { color: 0x7fd8ff, alpha: 0.5, size: 2.0, count: 16, blink: 0.5 },
    impact: { smoke: 0x6a6470, residue: 0x1a1424, debris: 0x8a8a92 },
  },
  arena: {
    name: 'Boss 竞技场',
    mote: { color: 0xff9a6a, alpha: 0.42, size: 1.9, count: 80, driftX: 4, driftY: -14, bob: 0.6 },
    spark: { color: 0xff5a3a, alpha: 0.58, size: 2.6, count: 30, blink: 0.28 },
    impact: { smoke: 0x5a4a48, residue: 0x2a1210, debris: 0xd9a08a },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. ELEMENTS — 技能/VFX 配色（火 冰 奥术 圣光 虚空 物理）
// ─────────────────────────────────────────────────────────────────────────────

export interface ElementStyle {
  name: string;
  /** the core colour (projectile body, glyph) */
  core: number;
  /** the bright centre / charge glow */
  bright: number;
  /** the throw-away colour of the trail and residue */
  trail: number;
  /** ground scorch / decal left behind */
  residue: number;
  /** damage number colour */
  number: number;
  /** additive glow, or normal blend for physical */
  glow: boolean;
}

export const ELEMENT: Record<'fire' | 'frost' | 'arcane' | 'holy' | 'void' | 'physical' | 'nature', ElementStyle> = {
  fire: { name: '火焰', core: 0xff7a3a, bright: 0xffd257, trail: 0xff9a4a, residue: 0x3a2018, number: 0xffb060, glow: true },
  frost: { name: '冰霜', core: 0x7fd8ff, bright: 0xd8f4ff, trail: 0x9fe8ff, residue: 0x243a4a, number: 0x9fe8ff, glow: true },
  arcane: { name: '奥术', core: 0x9f7fff, bright: 0xe0d0ff, trail: 0xb090ff, residue: 0x2a1a44, number: 0xc8a4ff, glow: true },
  // near-white, never #ffffff: pure white clips under ADD blending and looks like a bug
  holy: { name: '圣光', core: 0xfff0a0, bright: 0xfff8e2, trail: 0xffe2a0, residue: 0x4a4020, number: 0xfff0a0, glow: true },
  void: { name: '虚空', core: 0x6f4fbf, bright: 0x7fd8ff, trail: 0x8a5fd0, residue: 0x1a1030, number: 0x9fd8ff, glow: true },
  physical: { name: '物理', core: 0xd9c9a0, bright: 0xf0ead6, trail: 0xb9a884, residue: 0x2a2018, number: 0xffe2a0, glow: false },
  nature: { name: '自然', core: 0x7fc86a, bright: 0xc8f0a0, trail: 0x9fe07a, residue: 0x1a3018, number: 0x9fe07a, glow: false },
};

/** 暴击 / 精英 / Boss 的专用强调色（只允许这三种"特殊"色） */
export const SPECIAL = {
  crit: 0xffd257,
  elite: 0xff9a4a,
  boss: 0xff5a3a,
  heal: 0x4ade80,
  xp: 0xc084fc,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 6. LIGHT — 光照规则（AO / 投影 / 边缘光 / 环境光 / 技能辉光）
// ─────────────────────────────────────────────────────────────────────────────

export const LIGHT = {
  /** key light comes from the top-left, always. Shadows fall to the bottom-right. */
  key: { dirX: -0.55, dirY: -0.83, color: 0xfff0d0, strength: 0.1 },
  /** rim light: the faction signal colour, applied on the side facing away from the key */
  rim: { offsetX: -1, offsetY: -1, alpha: { hero: 0.85, elite: 0.5, soldier: 0.3, worker: 0.12, boss: 1 } },
  /** contact AO: a soft dark ellipse under every unit and building, never a hard black blob */
  ao: { color: 0x000000, alpha: { unit: 0.3, building: 0.34, decor: 0.28 }, yOffset: 1.5, squash: 0.44 },
  /** ambient fill so nothing is fully black */
  ambient: { floor: 0x1a2438, intensity: 0.14 },
  /** skill glow: additive bloom behind every ability cast, tinted by the element */
  skillGlow: { alpha: 0.35, scale: 1.4, blend: 'ADD' as const },
  /** time of day for the campaign; the missions pick one and it tints the whole map */
  timeOfDay: {
    dawn: { ambient: 0xffd8b0, alpha: 0.14, keyStrength: 0.12 },
    day: { ambient: 0xfff0c8, alpha: 0.08, keyStrength: 0.1 },
    dusk: { ambient: 0xff9a6a, alpha: 0.2, keyStrength: 0.16 },
    night: { ambient: 0x8090d0, alpha: 0.26, keyStrength: 0.06 },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 7. VFX — 粒子与打击反馈规则（完整链条 + 预算）
// ─────────────────────────────────────────────────────────────────────────────

export const VFX = {
  /** the chain every impact must follow, in order */
  chain: ['trail', 'hit', 'burst', 'residue', 'number', 'sound'] as const,
  /** particle budgets: a single hit must never exceed these */
  sparkCount: { melee: 7, ranged: 4, magic: 8, crit: 16, explosion: 22, bossDeath: 60 },
  life: { spark: 0.42, smoke: 0.8, glow: 0.35, trail: 0.24, residue: 6.0 },
  /** damage numbers: size by importance, never more than 3 sizes */
  number: {
    normal: { size: 14, color: ELEMENT.physical.number },
    magic: { size: 15, color: 0x9fe8ff },
    crit: { size: 23, color: SPECIAL.crit },
    heal: { size: 14, color: SPECIAL.heal },
    xp: { size: 12, color: SPECIAL.xp },
  },
  /** camera shake budget — the difference between "impactful" and "nauseating" */
  shake: { light: 2.2, heavy: 7, ultimate: 14, lightCooldown: 0.22 },
  /** total alive effects; the pool is prewarmed to this and never grows past it */
  pool: { effects: 220, floatingText: 48 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 8. SILHOUETTE — 角色比例（拉到最远也要认得出来）
// ─────────────────────────────────────────────────────────────────────────────

export const PROPORTIONS = {
  /** humanoid: chunky fantasy proportions — big head, wide shoulders, short legs */
  humanoid: {
    totalHeight: 42,
    head: 0.3,
    shoulderWidth: 0.62,
    hips: 0.36,
    legLength: 0.3,
    weaponReach: 1.35,
  },
  beast: { totalHeight: 34, bodyLength: 0.78, headSize: 0.34, legLength: 0.42 },
  siege: { totalHeight: 46, wheelRadius: 0.16, armLength: 0.9 },
  /** buildings are given a strong footprint-to-height ratio so the silhouette reads */
  building: { footprintToHeight: 0.62, roofOverhang: 1.18, doorHeight: 0.42 },
  /** the hero must be readable as "the big one with the glow" at 0.6 zoom */
  heroReadableZoom: 0.6,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 9. UI — 界面规范（绝不允许默认 HTML 控件）
// ─────────────────────────────────────────────────────────────────────────────

export const UI = {
  panel: 0x1a2440,
  panelDeep: 0x101728,
  panelLight: 0x27355c,
  panelAlpha: 0.9,
  border: 0x4a5d8f,
  borderWidth: 1.5,
  radius: 6,
  /** text: exactly three levels, no more */
  text: { primary: 0xe6ecff, dim: 0x8fa2c9, gold: 0xffd257 },
  /** semantic colours — the ONLY red/green the UI is allowed to use */
  state: { ok: 0x4ade80, warn: 0xffd257, danger: 0xef4444, info: 0x7fd8ff },
  /** buttons have exactly four states and never use a browser default */
  button: {
    normal: 0x27355c,
    hover: 0x35507f,
    pressed: 0x1a2440,
    disabled: 0x1c2130,
    borderNormal: 0x4a5d8f,
    borderHover: 0x7fa0e0,
    textNormal: 0xe6ecff,
    textDisabled: 0x5f6b85,
  },
  /** bars */
  bar: { hp: 0x4ade80, hpLow: 0xef4444, hpAlly: 0x60d67a, hpEnemy: 0xef5350, mana: 0x4aa8ff, xp: 0xc084fc, back: 0x0d1220 },
  /** spacing scale (px @1x) — every layout uses these, no arbitrary numbers */
  space: { xs: 4, sm: 8, md: 12, lg: 20, xl: 32 },
  /** focus/hover affordance for accessibility */
  focusRing: { color: 0xffd257, width: 2 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 10. TYPE — 字体
// ─────────────────────────────────────────────────────────────────────────────

export const TYPE = {
  /** system stacks only: no webfont download, no FOUT */
  family: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  numeric: 'ui-monospace, "SF Mono", Menlo, monospace',
  /** exactly four sizes */
  size: { caption: 11, body: 13, title: 20, hero: 34 },
  weight: { normal: '400', bold: '700' },
  /** HUD text is always drawn with a 1-2px dark outline so it survives any background */
  outline: { width: 2, color: 0x101728 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 11. ICON — 图标规范
// ─────────────────────────────────────────────────────────────────────────────

export const ICON = {
  /** drawn in-engine on a square grid, 1px stroke, no bitmap icons */
  grid: 32,
  stroke: 1.6,
  /** skill icons: element-tinted plate + white glyph, cooldown is a radial mask */
  skill: { glyphAlpha: 0.95, plateAlpha: 0.85, cooldownMask: 0x000000, cooldownAlpha: 0.62 },
  /** ability tiles are always the same size so the bar never reflows */
  tile: 46,
  /** resource icons must be readable at 16px */
  minSize: 16,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 12. CAMERA — 镜头语言
// ─────────────────────────────────────────────────────────────────────────────

export const CAMERA = {
  menu: { zoom: 1, drift: 0.04, description: '缓慢横移的全景，无震动' },
  battle: { zoomDefault: 1, zoomMin: 0.6, zoomMax: 1.6, follow: 0.12 },
  victory: { zoom: 1.25, panMs: 1800, holdMs: 1200 },
  /** boss entrance push-in; the shake is capped at `ultimate` and death runs at slowMotion */
  boss: { zoom: 1.15, panMs: 1400, holdMs: 900, shakeCap: 'ultimate' as const, slowMotion: 0.35 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — everything downstream uses these, never raw hex
// ─────────────────────────────────────────────────────────────────────────────

export function toCss(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Relative luminance, used by the contrast checks in tests/visual.mjs. */
export function luminance(color: number): number {
  const ch = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** HSV saturation (0..1) — the metric behind the 70/20/10 budget rule. */
export function saturation(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Which saturation tier a colour belongs to. The 70/20/10 rule is enforced by requiring every
 * colour to fall in its own tier: environment low, subjects mid, focus loud.
 */
export function satTier(color: number): 'environment' | 'subject' | 'focus' {
  const s = saturation(color);
  const l = luminance(color);
  // near-black and near-white carry no usable chroma: fog is "dark", not "loud". Judging them by
  // HSV saturation would call a near-black navy the loudest colour in the palette.
  if (l < 0.045 || l > 0.82) return 'environment';
  if (s <= SATURATION_BUDGET.environment.max) return 'environment';
  if (s >= SATURATION_BUDGET.focus.min) return 'focus';
  return 'subject';
}

/** Every colour the game is allowed to draw with — the compliance test walks this list. */
export const ALL_COLORS: number[] = Array.from(
  new Set<number>([
    STYLE.outline.color,
    ...Object.values(FACTION).flatMap((f) => [f.primary, f.secondary, f.metal, f.cloth, f.signal, f.shadow, f.highlight]),
    ...Object.values(BOSS_IDENTITY).flatMap((b) => [b.primary, b.secondary, b.glow, b.gold, b.arena.ambient, b.arena.fog]),
    ...Object.values(FOCUS),
    ...Object.values(WEATHER).map((w) => w.color),
    ...Object.values(MATERIAL).map((m) => m.hit.debrisColor),
    ...Object.values(REGION).flatMap((r) => [r.ground, r.groundAlt, r.stone, r.ambient, r.fog, r.accent]),
    ...Object.values(ELEMENT).flatMap((e) => [e.core, e.bright, e.trail, e.residue, e.number]),
    ...Object.values(REGION_VFX).flatMap((v) => [v.mote.color, v.spark?.color ?? v.mote.color, v.impact.smoke, v.impact.residue, v.impact.debris]),
    ...Object.values(SPECIAL),
    LIGHT.key.color,
    LIGHT.ambient.floor,
    UI.panel,
    UI.panelDeep,
    UI.panelLight,
    UI.border,
    UI.text.primary,
    UI.text.dim,
    UI.text.gold,
    ...Object.values(UI.state),
    ...Object.values(UI.button),
    ...Object.values(UI.bar),
    TYPE.outline.color,
  ]),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2e. DEPTH LAYERS — 地图层次 Foreground / Midground / Background + 大气透视
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three readable depth bands. The rule that makes them read: the further away something is,
 * the less contrast and saturation it keeps, and the closer it moves toward the fog colour.
 * This is "atmospheric perspective" and it is what stops a top-down map from looking like a
 * flat sticker sheet.
 */
export const DEPTH_LAYERS = {
  /** distant hills / mountains / castle silhouettes — drawn behind everything */
  background: {
    name: '远景',
    /** blended toward the region fog by this much */
    haze: 0.55,
    /** parallax factor against the camera (0 = pinned to the world) */
    parallax: 0.06,
    /** fraction of the original contrast kept */
    contrast: 0.45,
    bandHeights: [0.62, 0.5, 0.4],
  },
  /** units, roads, resources — full contrast, full saturation */
  midground: { name: '中景', haze: 0.08, parallax: 0, contrast: 0.95 },
  /** trees, rocks, grass tufts, buildings near the camera — most detail, slightly darker */
  foreground: { name: '近景', haze: 0, parallax: 0, contrast: 1, darken: 0.05 },
} as const;

/** How much a given visual element is allowed to compete for attention. */
export const FOCUS_TIERS = {
  /** exactly one per frame: the hero */
  primary: { contrastFloor: 0.55, outlineMul: 1.25, render: 'hero' },
  /** the boss, the current objective marker */
  secondary: { contrastFloor: 0.4, outlineMul: 1.1, render: 'boss' },
  /** units, buildings */
  tertiary: { contrastFloor: 0.25, outlineMul: 1, render: 'unit' },
  /** terrain, decor, weather — must stay under the tertiary floor */
  background: { contrastFloor: 0, outlineMul: 0.9, render: 'decor' },
} as const;
