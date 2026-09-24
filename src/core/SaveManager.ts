import type { ItemDef } from '../data/types';

export interface SaveData {
  version: number;
  campaign: {
    unlockedMissions: string[];
    completed: Record<string, { stars: number; bestTime: number; score: number }>;
  };
  /**
   * The ACTIVE hero record. It is the same object as `heroes[hero.id]`, so every existing
   * `save.current.hero.x` read/write keeps working while each hero keeps their own progression —
   * which is what makes a three-hero roster a real roster instead of three skins for one save.
   */
  hero: HeroRecord;
  /** every hero's own level / equipment / talents / relics, keyed by hero id */
  heroes?: Record<string, HeroRecord>;
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

/** One hero's progression. */
export interface HeroRecord {
  id: string;
  level: number;
  xp: number;
  talentPoints: number;
  relics: string[];
  equipment: Partial<Record<'weapon' | 'armor' | 'ring' | 'amulet', string>>;
  inventory: string[];
  /** talent id -> ranks bought */
  talents: Record<string, number>;
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
        // per-hero progression: migrate a legacy single-hero save, then re-link `hero` to the
        // record it belongs to so writes to save.current.hero land on the right hero
        const heroes = { ...(parsed.heroes ?? {}) };
        for (const [id, rec] of Object.entries(heroes)) {
          heroes[id] = { ...base.hero, ...rec, id, talents: { ...(rec?.talents ?? {}) }, equipment: { ...(rec?.equipment ?? {}) } };
        }
        heroes[this.data.hero.id] = this.data.hero;
        this.data.heroes = heroes;
      }
    } catch (err) {
      console.warn('[save] load failed, starting fresh', err);
      this.available = false;
    }
    if (!this.data.heroes) this.data.heroes = { [this.data.hero.id]: this.data.hero };
    return this.data;
  }

  /** Switches the hero being played, creating their own progression record the first time. */
  setActiveHero(id: string): void {
    if (!this.data.heroes) this.data.heroes = { [this.data.hero.id]: this.data.hero };
    if (!this.data.heroes[id]) {
      const base = defaultSave().hero;
      this.data.heroes[id] = { ...base, id, relics: [], equipment: {}, inventory: [], talents: {} };
    }
    this.data.hero = this.data.heroes[id];
    this.save();
  }

  /** Alias used by UI code that wants a hero's record without caring about the active one. */
  getRecordFor(id: string): HeroRecord {
    return this.heroRecord(id);
  }

  /** Progression of a hero who is not currently active (for the roster screen). */
  heroRecord(id: string): HeroRecord {
    if (this.data.hero.id === id) return this.data.hero;
    if (!this.data.heroes) this.data.heroes = { [this.data.hero.id]: this.data.hero };
    if (!this.data.heroes[id]) {
      const base = defaultSave().hero;
      this.data.heroes[id] = { ...base, id, relics: [], equipment: {}, inventory: [], talents: {} };
    }
    return this.data.heroes[id];
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
