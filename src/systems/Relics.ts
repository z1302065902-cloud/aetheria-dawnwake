import { RELICS } from '../data/items';
import { TALENTS } from '../data/talents';
import type { RelicDef } from '../data/types';

/**
 * Match modifiers built from the player's permanent relics (Roguelite progression).
 * The relic *data* has always existed — this is the piece that actually applies the
 * numbers to combat / economy / production so "永久成长" is real and not cosmetic.
 */
export interface MatchModifiers {
  /** extra multiplier on magic damage dealt by the player team (0.1 = +10%) */
  fireDamage: number;
  /** extra max HP for player melee units */
  meleeHp: number;
  /** extra max HP for player buildings */
  buildingHp: number;
  /** extra resource per deposit */
  goldGain: number;
  /** extra damage on the hero's attacks and skills */
  heroDamage: number;
  /** extra move speed for player units */
  unitSpeed: number;
  /** extra gather rate for settlers */
  harvestRate: number;
  /** multiplier on hero skill cooldowns (0.9 = 10% faster) — set by run blessings */
  cooldownMul: number;
}

export function emptyModifiers(): MatchModifiers {
  return {
    fireDamage: 0,
    meleeHp: 0,
    buildingHp: 0,
    goldGain: 0,
    heroDamage: 0,
    unitSpeed: 0,
    harvestRate: 0,
    cooldownMul: 1,
  };
}

/**
 * Sums every owned relic AND every bought talent rank into one modifier set.
 * Called once per match start — this is the single place where permanent progression
 * becomes gameplay numbers.
 */
export function buildModifiers(relicIds: string[], talents: Record<string, number> = {}): MatchModifiers {
  const mods = emptyModifiers();
  for (const id of relicIds) {
    const relic = RELICS.find((r) => r.id === id);
    if (!relic) continue;
    const { key, value } = relic.effect;
    if (key in mods) mods[key as keyof MatchModifiers] += value;
  }
  for (const talent of TALENTS) {
    const rank = talents[talent.id] ?? 0;
    if (rank <= 0) continue;
    mods[talent.key] += talent.perRank * rank;
  }
  return mods;
}

export interface ActiveRelicView {
  id: string;
  name: string;
  desc: string;
  equipped: boolean;
}

export function relicViews(relicIds: string[]): ActiveRelicView[] {
  return RELICS.map((r: RelicDef) => ({
    id: r.id,
    name: r.name,
    desc: r.desc,
    equipped: relicIds.includes(r.id),
  }));
}

/** Human readable list of the bonuses that are live in the current match. */
export function describeModifiers(mods: MatchModifiers): string[] {
  const out: string[] = [];
  if (mods.fireDamage) out.push(`魔法伤害 +${Math.round(mods.fireDamage * 100)}%`);
  if (mods.meleeHp) out.push(`近战单位生命 +${Math.round(mods.meleeHp * 100)}%`);
  if (mods.buildingHp) out.push(`建筑生命 +${Math.round(mods.buildingHp * 100)}%`);
  if (mods.goldGain) out.push(`资源收益 +${Math.round(mods.goldGain * 100)}%`);
  if (mods.heroDamage) out.push(`英雄伤害 +${Math.round(mods.heroDamage * 100)}%`);
  if (mods.unitSpeed) out.push(`部队移动速度 +${Math.round(mods.unitSpeed * 100)}%`);
  if (mods.harvestRate) out.push(`采集速度 +${Math.round(mods.harvestRate * 100)}%`);
  if (mods.cooldownMul !== 1) out.push(`技能冷却 ${Math.round((mods.cooldownMul - 1) * 100)}%`);
  return out;
}
