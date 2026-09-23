/**
 * Global constants. Everything balance-related that is *not* per-entity data lives here.
 * Per-entity data lives in src/data/*.ts (data driven, no hardcoded stats in logic).
 */

export const TILE = 40;               // world pixels per tile
export const MAP_W = 72;              // tiles
export const MAP_H = 72;              // tiles
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const CFG = {
  /** Hard unit cap so the frame budget stays predictable (design: 20-60 units). */
  MAX_UNITS: 90,
  /** Pathfinding: max A* searches started per frame (keeps spikes out of the frame time). */
  PATH_BUDGET_PER_FRAME: 10,
  /** Re-path throttle: a unit will not re-issue an identical search faster than this (ms). */
  REPATH_COOLDOWN: 400,
  /** Local avoidance: neighbour query radius in tiles. */
  SEPARATION_RADIUS: 24,
  /** Spatial hash cell size (world px). */
  HASH_CELL: 64,
  /** Rendering. */
  BASE_ZOOM: 1.0,
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 1.9,
  /** Match pacing (seconds). */
  MATCH_SOFT_CAP: 22 * 60,
  /** Economy. */
  START_GOLD: 420,
  START_WOOD: 320,
  START_MANA: 80,
  POP_BASE: 20,
  POP_MAX: 60,
  /** Hero. */
  HERO_RESPAWN_MS: 30_000,
  HERO_XP_SHARE_RADIUS: 420,
  /** Damage / combat feel. */
  CRIT_MULT: 1.8,
  ARMOR_CONST: 22,       // damage reduction = armor / (armor + K)
  /** Floating combat text + particles. */
  MAX_DAMAGE_NUMBERS: 40,
};

export const DEPTH = {
  TERRAIN: 0,
  DECAL: 10,
  CORPSE: 20,
  SELECT_RING: 90,
  /** Entity sprites use ENTITY + y * 0.01 so units/buildings sort by screen depth. */
  ENTITY: 100,
  HEALTHBAR: 160,
  PROJECTILE: 180,
  /** fog sits above entities/bars so nothing leaks through it, below FX/UI */
  FOG: 190,
  FX: 200,
  DRAG: 300,
};

export const FACTION = {
  PLAYER: 'dawn',
  WILDBORN: 'wildborn',
  VOIDBORN: 'voidborn',
  NEUTRAL: 'neutral',
} as const;

export type FactionId = (typeof FACTION)[keyof typeof FACTION];

export const TEAM_OF: Record<string, number> = {
  dawn: 1,
  wildborn: 2,
  voidborn: 2,
  neutral: 3,
};

export type ResourceId = 'gold' | 'wood' | 'mana';

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  gold: '金币',
  wood: '木材',
  mana: '魔法水晶',
};

export const RESOURCE_COLOR: Record<ResourceId, number> = {
  gold: 0xffd257,
  wood: 0x9ec46a,
  mana: 0x7fd8ff,
};

/** Terrain tile kinds. Values are used as indices into the terrain cost table. */
export enum Tile {
  GRASS = 0,
  ROAD = 1,
  TREE = 2,
  ROCK = 3,
  WATER = 4,
  BRIDGE = 5,
  DIRT = 6,
  SHRINE = 7,
}

/** Movement cost multiplier per terrain. -1 = impassable. */
export const TILE_COST: number[] = [
  1.0,   // GRASS
  0.82,  // ROAD
  -1,    // TREE
  -1,    // ROCK
  -1,    // WATER
  1.0,   // BRIDGE
  0.95,  // DIRT
  0.95,  // SHRINE
];

export const BUILDABLE_TILE: boolean[] = [
  true,  // GRASS
  true,  // ROAD
  false, // TREE
  false, // ROCK
  false, // WATER
  false, // BRIDGE
  true,  // DIRT
  false, // SHRINE
];
