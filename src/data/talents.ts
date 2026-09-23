import type { MatchModifiers } from '../systems/Relics';

export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  branch: 'war' | 'arcane' | 'kingdom';
  maxRank: number;
  /** bonus added to the matching MatchModifiers key per rank */
  perRank: number;
  key: keyof MatchModifiers;
}

/**
 * Talent tree: the permanent point sink. Every talent maps onto the same
 * MatchModifiers that relics feed, so both progression systems land in one place.
 */
export const TALENTS: TalentDef[] = [
  { id: 'ironWill', name: '钢铁意志', desc: '近战单位生命 +6% / 级', branch: 'war', maxRank: 2, perRank: 0.06, key: 'meleeHp' },
  { id: 'heroicMight', name: '英雄之力', desc: '英雄伤害 +8% / 级', branch: 'war', maxRank: 2, perRank: 0.08, key: 'heroDamage' },
  { id: 'flameMastery', name: '烈焰精研', desc: '魔法伤害 +6% / 级', branch: 'arcane', maxRank: 2, perRank: 0.06, key: 'fireDamage' },
  { id: 'bounty', name: '丰饶', desc: '采集速度 +8% / 级', branch: 'kingdom', maxRank: 2, perRank: 0.08, key: 'harvestRate' },
  { id: 'warBanner', name: '战旗', desc: '部队移动速度 +4% / 级', branch: 'kingdom', maxRank: 2, perRank: 0.04, key: 'unitSpeed' },
  { id: 'masonry', name: '石工', desc: '建筑生命 +8% / 级', branch: 'kingdom', maxRank: 2, perRank: 0.08, key: 'buildingHp' },
];

export const TALENT_BRANCH_LABEL: Record<TalentDef['branch'], string> = {
  war: '战阵',
  arcane: '秘法',
  kingdom: '王国',
};

export function talentById(id: string): TalentDef | undefined {
  return TALENTS.find((t) => t.id === id);
}

export function totalTalentRanks(talents: Record<string, number>): number {
  return Object.values(talents).reduce((a, c) => a + c, 0);
}
