import type { Cost } from '../core/Rng';

export type DamageType = 'physical' | 'magic' | 'siege';
export type ArmorType = 'light' | 'medium' | 'heavy' | 'fortified';
export type UnitRole = 'worker' | 'melee' | 'ranged' | 'caster' | 'siege' | 'beast' | 'boss';

export interface UnitDef {
  id: string;
  name: string;
  enName: string;
  faction: string;
  role: UnitRole;
  hp: number;
  attack: number;
  armor: number;
  damageType: DamageType;
  armorType: ArmorType;
  moveSpeed: number;      // world px / second
  attackRange: number;    // world px
  aggroRange: number;
  attackCooldown: number; // seconds
  cost: Cost;
  pop: number;            // population used (0 for enemies)
  buildTime: number;      // seconds
  radius: number;         // collision / selection radius
  sightRange: number;
  /** Ranged units fire a projectile; melee hit instantly. */
  projectile?: { speed: number; texture: string; splash?: number };
  /** AI only. */
  ai?: { kind: 'camp' | 'patrol' | 'guard' | 'boss'; leash?: number };
  xp: number;             // xp granted to the hero on death
  art: ArtSpec;
  desc: string;
}

export interface BuildingDef {
  id: string;
  name: string;
  enName: string;
  faction: string;
  hp: number;
  armor: number;
  armorType: ArmorType;
  cost: Cost;
  buildTime: number;
  footprint: { w: number; h: number }; // in tiles
  popProvided: number;
  /** Production queue */
  produces?: string[];
  attack?: {
    damage: number;
    range: number;
    cooldown: number;
    damageType: DamageType;
    projectile: { speed: number; texture: string; splash?: number };
  };
  /** Drop-off point for harvested resources. */
  depot?: boolean;
  buildable: boolean;     // shows up in the player build menu
  unlockedAt: string;     // mission id
  requires?: string;      // prerequisite building id
  art: ArtSpec;
  desc: string;
}

/** Drawing instructions consumed by art/SpriteFactory. Fully original, generated at runtime. */
export type UnitArchetype = 'knight' | 'soldier' | 'archer' | 'mage' | 'worker' | 'orc' | 'shade' | 'beast' | 'siege';

export interface ArtSpec {
  shape: 'humanoid' | 'beast' | 'tower' | 'hall' | 'tent' | 'ring' | 'shrine' | 'crystal';
  /** drives head/body/cape styling so each unit family reads differently at a glance */
  archetype?: UnitArchetype;
  body: number;     // main colour
  trim: number;     // secondary colour
  accent: number;   // highlight colour
  scale: number;    // relative size multiplier
  weapon?: 'sword' | 'axe' | 'bow' | 'staff' | 'pick' | 'claw' | 'banner' | 'hammer' | 'lance' | 'engine' | 'none';
  mount?: boolean;  // rides a beast (bigger silhouette)
  banner?: number;  // banner colour for buildings
}

export interface SkillDef {
  id: string;
  name: string;
  enName: string;
  key: 'Q' | 'W' | 'E' | 'R';
  manaCost: number;
  cooldown: number;      // seconds
  range: number;
  radius: number;
  damage: number;
  damageType: DamageType;
  /** gameplay behaviour handled in systems/HeroAbilities.ts */
  kind: 'charge' | 'buff' | 'spin' | 'guard' | 'projectile-storm' | 'summon-trap' | 'arrow-rain' | 'vision' | 'teleport' | 'meteor' | 'nova';
  duration: number;
  levelRequired: number;
  desc: string;
  icon: { glyph: string; color: number };
}

export interface HeroDef {
  id: string;
  name: string;
  enName: string;
  title: string;
  faction: string;
  role: 'tank' | 'mage' | 'ranger';
  base: {
    hp: number;
    mana: number;
    attack: number;
    armor: number;
    moveSpeed: number;
    attackRange: number;
    attackCooldown: number;
    manaRegen: number;   // per second
    hpRegen: number;
  };
  growth: {
    hp: number;
    mana: number;
    attack: number;
    armor: number;
  };
  skills: string[];     // skill ids, Q W E R order
  art: ArtSpec;
  bio: string;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: 'weapon' | 'armor' | 'ring' | 'amulet';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  stats: Partial<{ attack: number; armor: number; hp: number; mana: number; crit: number; attackSpeed: number; skillDamage: number }>;
  desc: string;
}

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  /** key -> flat multiplier bonus applied at match start */
  effect: { key: 'fireDamage' | 'meleeHp' | 'buildingHp' | 'goldGain' | 'heroDamage' | 'unitSpeed' | 'harvestRate'; value: number };
  cost: number; // talent points
}

export interface ObjectiveDef {
  id: string;
  text: string;
  optional?: boolean;
  /** hidden objectives stay invisible until their trigger fires (exploration / discovery) */
  hidden?: boolean;
  /** for hidden objectives: reveal once this other objective is done */
  revealAfter?: string;
  kind:
    | 'build'
    | 'produce'
    | 'gather'
    | 'destroy'
    | 'defend'
    | 'escort'
    | 'collect'
    | 'explore'
    | 'rescue'
    | 'survive'
    | 'boss'
    /** hunt N neutral monsters — the hero's own content */
    | 'hunt'
    /** discover N adventure sites (chests, vaults, NPCs) — rewards exploring */
    | 'adventure';
  target?: { unitId?: string; buildingId?: string; tag?: string; count?: number; total?: number };
  reward?: { gold?: number; xp?: number; relic?: string; item?: string };
}

export interface MapDef {
  id: string;
  name: string;
  enName: string;
  seed: number;
  biome: 'valley' | 'forest' | 'fortress';
  night?: boolean;
  size: { w: number; h: number };
  brief: string;
}

export interface MissionDef {
  id: string;
  index: number;
  name: string;
  enName: string;
  map: MapDef;
  playerFaction: string;
  enemyFactions: string[];
  startResources: Cost;
  hero: string;
  objectives: ObjectiveDef[];
  waves: { firstAt: number; interval: number; growth: number; max: number; units: string[] };
  enemyCamps: Array<{ x: number; y: number; kind: 'wildborn' | 'voidborn'; strength: number }>;
  boss: { unitId: string; x: number; y: number; spawnOn: string };
  parTime: number;
  /** Visual Bible §6 — which time-of-day preset this mission is lit with */
  /** Visual Bible §6 — which time-of-day preset this mission is lit with */
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  brief: string;
}
