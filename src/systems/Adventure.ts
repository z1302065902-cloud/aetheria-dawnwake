import Phaser from 'phaser';
import { DEPTH, TILE } from '../config/Constants';
import { metaOf } from '../art/SpriteFactory';
import { Rng } from '../core/Rng';
import { ITEMS, RELICS, rollLoot } from '../data/items';
import type { GameCtx } from './GameCtx';
import type { Unit } from '../world/Unit';
import { audio } from '../audio/AudioBus';

export type AdventureKind = 'chest' | 'npc' | 'cache' | 'rift' | 'relic';

export interface AdventureSpot {
  id: number;
  kind: AdventureKind;
  x: number;
  y: number;
  name: string;
  sprite: Phaser.GameObjects.Sprite | null;
  used: boolean;
  /** how much XP a discovery is worth */
  xp: number;
  gold: number;
  itemId?: string;
  relicId?: string;
  /** rifts spawn enemies when triggered */
  spawn?: string;
  spawnCount?: number;
  revealed: boolean;
  bob: number;
}

export interface AdventureReward {
  kind: AdventureKind;
  name: string;
  gold: number;
  xp: number;
  item?: string;
  relic?: string;
}

/**
 * The "hero adventures" pillar: things on the map that are worth walking to.
 *
 * Treasure chests, quest-giving NPCs, supply caches, void rifts and relic vaults. All of
 * them are proximity-triggered by the hero (the army does not loot), they respect fog of war
 * (an unexplored spot is invisible), and they hand out gold / XP / equipment / relics.
 */
export class AdventureSystem {
  spots: AdventureSpot[] = [];
  /** rewards collected this match (shown in the result panel) */
  collected: AdventureReward[] = [];
  onReward: ((r: AdventureReward) => void) | null = null;
  onRift: ((x: number, y: number, unitId: string, count: number) => void) | null = null;
  onReveal: ((spot: AdventureSpot) => void) | null = null;
  vision: {
    isExploredWorld(x: number, y: number): boolean;
    isVisibleWorld(x: number, y: number): boolean;
    revealArea?(x: number, y: number, radius: number): void;
  } | null = null;

  private nextId = 1;
  private rng: Rng;
  private cooldown = 0;

  constructor(
    private ctx: GameCtx,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  /** Places the adventure content for a mission. `density` scales with the mission index. */
  build(playerStart: { x: number; y: number }, searchPoints: Array<{ x: number; y: number; name: string }>, density: number): void {
    const w = this.ctx.world.map.w * TILE;
    const h = this.ctx.world.map.h * TILE;
    const pick = (minR: number, maxR: number): { x: number; y: number } | null => {
      for (let tries = 0; tries < 40; tries++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(minR, maxR);
        const x = playerStart.x + Math.cos(a) * r;
        const y = playerStart.y + Math.sin(a) * r;
        if (x < 120 || y < 120 || x > w - 120 || y > h - 120) continue;
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        if (!this.ctx.path.isFree(tx, ty)) continue;
        return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      }
      return null;
    };

    const add = (kind: AdventureKind, name: string, x: number, y: number, opts: Partial<AdventureSpot> = {}) => {
      const spot: AdventureSpot = {
        id: this.nextId++,
        kind,
        x,
        y,
        name,
        sprite: null,
        used: false,
        xp: opts.xp ?? 40,
        gold: opts.gold ?? 60,
        itemId: opts.itemId,
        relicId: opts.relicId,
        spawn: opts.spawn,
        spawnCount: opts.spawnCount,
        revealed: false,
        bob: this.rng.range(0, Math.PI * 2),
      };
      const key = kind === 'chest' ? 'adv_chest' : kind === 'npc' ? 'adv_npc' : kind === 'rift' ? 'adv_rift' : 'adv_cache';
      const meta = metaOf(key);
      spot.sprite = this.ctx.world.scene.add
        .sprite(x, y, key)
        .setOrigin(0.5, meta.sy)
        .setScale(meta.sx)
        .setDepth(DEPTH.ENTITY + y * 0.01);
      this.spots.push(spot);
      return spot;
    };

    // treasure chests: the classic "detour is worth it"
    const chests = 3 + Math.round(density);
    for (let i = 0; i < chests; i++) {
      const p = pick(420, 1500);
      if (p) add('chest', `宝箱 ${i + 1}`, p.x, p.y, { gold: 80 + this.rng.int(0, 90), xp: 50 + this.rng.int(0, 40) });
    }
    // supply caches near the middle (cheap, frequent)
    for (let i = 0; i < 2 + Math.round(density * 0.5); i++) {
      const p = pick(500, 1100);
      if (p) add('cache', '补给箱', p.x, p.y, { gold: 40 + this.rng.int(0, 40), xp: 25 });
    }
    // one quest NPC per map
    const npcSpot = pick(360, 700);
    if (npcSpot) add('npc', '流浪学者', npcSpot.x, npcSpot.y, { xp: 60, gold: 0 });
    // void rifts: fight for a reward
    if (density >= 2) {
      const p = pick(700, 1400);
      if (p) add('rift', '虚空裂隙', p.x, p.y, { xp: 120, gold: 120, spawn: 'shade', spawnCount: 3 });
    }
    // relic vault at each hand-authored search point (the "hidden area" reward)
    for (const sp of searchPoints) {
      const vault = add('relic', '遗物密室', sp.x, sp.y, { xp: 150, gold: 60, relicId: this.pickRelic() });
      vault.sprite?.setTint(0xd9c0ff);
    }
  }

  private pickRelic(): string {
    return RELICS[this.rng.int(0, RELICS.length - 1)].id;
  }

  /** Hero-driven looting: only the hero triggers spots, and only when they are visible. */
  update(dt: number): void {
    this.cooldown -= dt;
    const hero = this.ctx.world.hero;
    for (const spot of this.spots) {
      if (spot.used || !spot.sprite) continue;
      // fog: unrevealed content is hidden and inert
      const explored = this.vision ? this.vision.isExploredWorld(spot.x, spot.y) : true;
      const visible = this.vision ? this.vision.isVisibleWorld(spot.x, spot.y) : true;
      if (spot.sprite.visible !== explored) spot.sprite.setVisible(explored);
      if (!explored) continue;
      if (!spot.revealed) {
        spot.revealed = true;
        this.onReveal?.(spot);
      }
      // gentle idle animation so the map feels alive
      spot.bob += dt;
      spot.sprite.y = spot.y + Math.sin(spot.bob * 2) * 1.6;
      if (!visible || !hero || hero.dead || hero.respawning) continue;
      const d = Math.hypot(hero.x - spot.x, hero.y - spot.y);
      if (d > 42) continue;
      if (this.cooldown > 0) continue;
      this.trigger(spot, hero);
    }
  }

  private trigger(spot: AdventureSpot, hero: Unit): void {
    this.cooldown = 0.4;
    spot.used = true;
    this.ctx.fx.levelUp(spot.x, spot.y);
    this.ctx.fx.damageText(spot.x, spot.y - 26, spot.gold, 'mana');
    const reward: AdventureReward = { kind: spot.kind, name: spot.name, gold: spot.gold, xp: spot.xp };

    if (spot.kind === 'rift') {
      // a fight instead of a gift
      audio.sfx('bossRoar', 0.5);
      this.ctx.fx.explosion(spot.x, spot.y, 90, true);
      this.onRift?.(spot.x, spot.y, spot.spawn ?? 'shade', spot.spawnCount ?? 3);
      reward.gold = Math.round(spot.gold * 0.5);
    }
    if (spot.kind === 'chest' || spot.kind === 'cache') {
      // chests have a chance to contain equipment
      if (this.rng.chance(spot.kind === 'chest' ? 0.55 : 0.2)) {
        const item = rollLoot(this.rng, 1);
        reward.item = item.id;
        reward.name = `${spot.name}（${item.name}）`;
      }
    }
    if (spot.kind === 'relic' && spot.relicId) {
      reward.relic = spot.relicId;
      const relic = RELICS.find((r) => r.id === spot.relicId);
      if (relic) reward.name = `${spot.name}（${relic.name}）`;
    }
    if (spot.kind === 'npc') {
      reward.name = '流浪学者：他愿意为你指路（揭示附近区域）';
      // the NPC reveals a chunk of the map around them
      this.revealAround(spot.x, spot.y, 520);
    }
    this.ctx.world.addResource('gold', reward.gold);
    // XP goes to the hero (it is the only unit with an xp track)
    const heroUnit = hero as unknown as { xp?: number };
    heroUnit.xp = (heroUnit.xp ?? 0) + reward.xp;
    this.collected.push(reward);
    spot.sprite?.setVisible(false);
    spot.sprite?.destroy();
    spot.sprite = null;
    audio.sfx('deposit', 0.5);
    this.onReward?.(reward);
  }

  /** NPC hint: permanently reveals a chunk of the map, exposing hidden areas. */
  private revealAround(x: number, y: number, radius: number): void {
    this.vision?.revealArea?.(x, y, radius);
  }

  get remaining(): number {
    return this.spots.filter((s) => !s.used).length;
  }

  get view(): Array<{ id: number; kind: AdventureKind; name: string; x: number; y: number; used: boolean }> {
    return this.spots.map((s) => ({ id: s.id, kind: s.kind, name: s.name, x: Math.round(s.x), y: Math.round(s.y), used: s.used }));
  }

  static allItems(): number {
    return ITEMS.length;
  }
}
