import type { ItemDef } from '../data/types';

export interface SaveData {
  version: number;
  campaign: {
    unlockedMissions: string[];
    completed: Record<string, { stars: number; bestTime: number; score: number }>;
  };
  hero: {
    id: string;
    level: number;
    xp: number;
    talentPoints: number;
    relics: string[];
    equipment: Partial<Record<'weapon' | 'armor' | 'ring' | 'amulet', string>>;
    inventory: string[];
    /** talent id -> ranks bought */
    talents: Record<string, number>;
  };
  settings: {
    music: number;
    sfx: number;
    muted: boolean;
    showHints: boolean;
  };
  stats: { matches: number; victories: number; playtimeMs: number };
}

const KEY = 'aetheria.dawnwake.save.v1';

function defaultSave(): SaveData {
  return {
    version: 1,
    campaign: { unlockedMissions: ['m01'], completed: {} },
    hero: { id: 'knightCommander', level: 1, xp: 0, talentPoints: 0, relics: [], equipment: {}, inventory: [], talents: {} },
    settings: { music: 0.42, sfx: 0.55, muted: false, showHints: true },
    stats: { matches: 0, victories: 0, playtimeMs: 0 },
  };
}

class SaveManagerImpl {
  private data: SaveData = defaultSave();
  private available = true;

  constructor() {
    this.load();
  }

  get current(): SaveData {
    return this.data;
  }

  /** Alias used by the scenes (shorter, same object). */
  get dataRef(): SaveData {
    return this.data;
  }

  load(): SaveData {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveData;
        const base = defaultSave();
        this.data = {
          ...base,
          ...parsed,
          settings: { ...base.settings, ...parsed.settings },
          hero: { ...base.hero, ...parsed.hero, talents: { ...(parsed.hero?.talents ?? {}) }, equipment: { ...(parsed.hero?.equipment ?? {}) } },
        };
      }
    } catch (err) {
      console.warn('[save] load failed, starting fresh', err);
      this.available = false;
    }
    return this.data;
  }

  save(): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[save] write failed', err);
      this.available = false;
    }
  }

  get storageAvailable(): boolean {
    return this.available;
  }

  reset(): void {
    this.data = defaultSave();
    this.save();
  }

  completeMission(id: string, stars: number, time: number, score: number): void {
    const rec = this.data.campaign.completed[id];
    if (!rec || score > rec.score) {
      this.data.campaign.completed[id] = { stars: Math.max(stars, rec?.stars ?? 0), bestTime: rec && rec.bestTime ? Math.min(rec.bestTime, time) : time, score };
    }
    const idx = Number(id.replace(/\D/g, ''));
    const next = `m${String(idx + 1).padStart(2, '0')}`;
    if (next && !this.data.campaign.unlockedMissions.includes(next)) this.data.campaign.unlockedMissions.push(next);
    this.save();
  }

  addRelic(id: string): void {
    if (!this.data.hero.relics.includes(id)) this.data.hero.relics.push(id);
    this.save();
  }

  addItem(item: ItemDef): void {
    if (!this.data.hero.inventory.includes(item.id)) this.data.hero.inventory.push(item.id);
    if (!this.data.hero.equipment[item.slot]) this.data.hero.equipment[item.slot] = item.id;
    this.save();
  }

  /** Spends one talent point on `talentId`; returns the new rank (0 = refused). */
  spendTalentPoint(talentId: string, maxRank: number): number {
    const ranks = this.data.hero.talents ?? {};
    const cur = ranks[talentId] ?? 0;
    if (this.data.hero.talentPoints <= 0 || cur >= maxRank) return cur;
    ranks[talentId] = cur + 1;
    this.data.hero.talents = ranks;
    this.data.hero.talentPoints -= 1;
    this.save();
    return cur + 1;
  }

  /** Refunds every talent point (used by the reset button). */
  respecTalents(): void {
    const ranks = this.data.hero.talents ?? {};
    let refund = 0;
    for (const v of Object.values(ranks)) refund += v;
    this.data.hero.talents = {};
    this.data.hero.talentPoints += refund;
    this.save();
  }

  addPlaytime(ms: number): void {
    this.data.stats.playtimeMs += ms;
    this.save();
  }
}

export const save = new SaveManagerImpl();
