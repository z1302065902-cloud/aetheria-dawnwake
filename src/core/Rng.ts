import type { FactionId, ResourceId } from '../config/Constants';

/** Minimal seeded PRNG (mulberry32) so maps are reproducible from a seed. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export interface Cost {
  gold?: number;
  wood?: number;
  mana?: number;
}

export function canAfford(wallet: Record<ResourceId, number>, cost: Cost): boolean {
  return (cost.gold ?? 0) <= wallet.gold && (cost.wood ?? 0) <= wallet.wood && (cost.mana ?? 0) <= wallet.mana;
}

export function costEntries(cost: Cost): Array<[ResourceId, number]> {
  const out: Array<[ResourceId, number]> = [];
  if (cost.gold) out.push(['gold', cost.gold]);
  if (cost.wood) out.push(['wood', cost.wood]);
  if (cost.mana) out.push(['mana', cost.mana]);
  return out;
}

export const TEAM: Record<string, number> = {
  dawn: 1,
  wildborn: 2,
  voidborn: 2,
  neutral: 3,
} as const;

export function areEnemies(a: FactionId, b: FactionId): boolean {
  return TEAM[a] !== TEAM[b] && TEAM[a] !== 3 && TEAM[b] !== 3;
}

export function isFriendly(a: FactionId, b: FactionId): boolean {
  return TEAM[a] === TEAM[b] && TEAM[a] !== 3;
}
