import { DEPTH, TILE } from '../config/Constants';
import { metaOf } from '../art/SpriteFactory';
import { Rng } from '../core/Rng';
import { audio } from '../audio/AudioBus';
import type { GameCtx } from './GameCtx';
import type { AdventureSystem } from './Adventure';
import type { CombatSystem } from './Combat';

export type MapEventKind = 'merchant' | 'meteor' | 'migration';

export interface MapEventView {
  kind: MapEventKind;
  name: string;
  at: number;
  fired: boolean;
}

const EVENTS: Record<MapEventKind, { name: string; warn: string; blurb: string }> = {
  merchant: {
    name: '流浪商人',
    warn: '一名流浪商人出现在地图上',
    blurb: '让英雄去找他——他会给一件装备',
  },
  meteor: {
    name: '天降陨石',
    warn: '陨石正在坠落，避开落点！',
    blurb: '落点会留下魔力水晶',
  },
  migration: {
    name: '兽群迁徙',
    warn: '兽群正在向你的基地迁徙',
    blurb: '它们会沿路攻击一切',
  },
};

/**
 * Map-level random events.
 *
 * These exist so a map is not just "build army -> push base": something happens TO the player
 * on a timer, and the hero has a reason to be out in the world when it does. Everything is
 * seeded per match, warns the player first, and never invalidates the main objectives.
 */
export class MapEventsSystem {
  schedule: Array<{ at: number; kind: MapEventKind; fired: boolean }> = [];
  /** fired events, for the result screen */
  history: MapEventView[] = [];
  onWarn: ((text: string, sub: string) => void) | null = null;
  onFired: ((kind: MapEventKind, name: string) => void) | null = null;

  private rng: Rng;
  private pending: Array<{ kind: MapEventKind; at: number; x: number; y: number }> = [];
  private nextRoll = 0;

  constructor(
    private ctx: GameCtx,
    private adventure: AdventureSystem,
    private combat: CombatSystem,
    seed: number,
  ) {
    this.rng = new Rng(seed ^ 0x5eed);
  }

  /** Schedules this match's events. Times are in game seconds. */
  build(count = 3, firstAt = 150, spacing = 130): void {
    for (let i = 0; i < count; i++) {
      this.schedule.push({ at: firstAt + i * spacing, kind: this.pickKind(i), fired: false });
    }
  }

  private pickKind(i: number): MapEventKind {
    const pool: MapEventKind[] = i % 3 === 0 ? ['merchant', 'meteor'] : i % 3 === 1 ? ['meteor', 'migration'] : ['migration', 'merchant'];
    return pool[this.rng.int(0, pool.length - 1)];
  }

  update(dt: number): void {
    const now = this.ctx.world.elapsed;
    for (const ev of this.schedule) {
      if (ev.fired || now < ev.at) continue;
      ev.fired = true;
      this.begin(ev.kind);
    }
    // resolve warnings that have finished counting down
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (now < p.at) continue;
      this.pending.splice(i, 1);
      if (p.kind === 'meteor') this.dropMeteor(p.x, p.y);
    }
    void dt;
    void this.nextRoll;
  }

  /** Announces the event and, for hazards, starts the warning countdown. */
  private begin(kind: MapEventKind): void {
    const meta = EVENTS[kind];
    this.history.push({ kind, name: meta.name, at: Math.round(this.ctx.world.elapsed), fired: true });
    this.onWarn?.(meta.warn, meta.blurb);
    this.onFired?.(kind, meta.name);
    audio.sfx('skill', 0.4);

    if (kind === 'merchant') {
      const spot = this.randomSpot(700, 1600);
      if (spot) {
        this.adventure.addSpot('npc', '流浪商人', spot.x, spot.y, {
          gold: 90 + this.rng.int(0, 60),
          xp: 60,
          itemChance: 0.9,
        });
      }
      return;
    }
    if (kind === 'meteor') {
      // Aim at the player's ARMY, never at the base: a random event must be a decision the
      // player can react to, not a coin flip that deletes their whole worker line.
      const target = this.playerCluster() ?? this.randomSpot(600, 1400) ?? this.ctx.world.map.playerStart;
      const warnMs = 6000; // long enough to walk out of the circle
      this.pending.push({ kind, at: this.ctx.world.elapsed + warnMs / 1000, x: target.x, y: target.y });
      this.ctx.fx.telegraph(target.x, target.y, 150, warnMs, 0xff6a3a);
      return;
    }
    // migration: a herd walks in from the map edge toward the player's base
    const base = this.ctx.world.map.playerStart;
    const side = this.rng.int(0, 3);
    const edge =
      side === 0
        ? { x: 80, y: base.y }
        : side === 1
          ? { x: this.ctx.world.map.w * TILE - 80, y: base.y }
          : side === 2
            ? { x: base.x, y: 80 }
            : { x: base.x, y: this.ctx.world.map.h * TILE - 80 };
    // scale the herd with the match clock: at 4 minutes it must be a fight the player can win
    // with the army they realistically have, not a wipe
    const herd = Math.min(8, 2 + Math.floor(this.ctx.world.elapsed / 180) + this.rng.int(0, 1));
    for (let i = 0; i < herd; i++) {
      const a = (i / herd) * Math.PI * 2;
      const u = this.ctx.world.spawnUnit(this.rng.chance(0.7) ? 'direwolf' : 'raider', edge.x + Math.cos(a) * 60, edge.y + Math.sin(a) * 60, 'neutral');
      u.team = 3;
      u.aiState = 'chase';
      u.homeX = edge.x;
      u.homeY = edge.y;
    }
  }

  /** Centre of the player's army (the meteor aims at what the player cares about). */
  private playerCluster(): { x: number; y: number } | null {
    const units = this.ctx.world.units.filter((u) => !u.dead && u.team === 1 && u.def.role !== 'worker');
    if (units.length < 3) return null;
    let x = 0;
    let y = 0;
    for (const u of units) {
      x += u.x;
      y += u.y;
    }
    return { x: x / units.length, y: y / units.length };
  }

  /** Meteor impact: hurts everything in the area and leaves mana crystals behind. */
  private dropMeteor(x: number, y: number): void {
    audio.sfx('explosion', 0.8);
    this.ctx.fx.shake(11, 0.5, 'ultimate');
    this.ctx.fx.fallingRock(x, y, 250, 140, 0xff7a3a);
    this.ctx.fx.explosion(x, y, 170, false);
    this.ctx.fx.scorch(x, y, 150, false);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.ctx.world.scene.time.delayedCall(i * 60, () => {
        this.ctx.fx.explosion(x + Math.cos(a) * 90, y + Math.sin(a) * 90, 70, false);
      });
    }
    // Hazard for combatants only: workers cannot dodge and losing the whole economy to a
    // random event is not a decision, it is a punishment.
    for (const u of [...this.ctx.world.units]) {
      if (u.dead || u.def.role === 'worker' || u.isHero) continue;
      if (Math.hypot(u.x - x, u.y - y) > 170) continue;
      this.combat.applyDamage(u, 130, 'magic', 0, -1, false);
    }
    // reward: crystal deposits
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + this.rng.range(0, 1);
      const rx = x + Math.cos(a) * (60 + this.rng.int(0, 40));
      const ry = y + Math.sin(a) * (60 + this.rng.int(0, 40));
      const tx = Math.max(2, Math.min(this.ctx.world.map.w - 3, Math.floor(rx / TILE)));
      const ty = Math.max(2, Math.min(this.ctx.world.map.h - 3, Math.floor(ry / TILE)));
      if (!this.ctx.path.isFree(tx, ty)) continue;
      this.ctx.world.spawnResource('mana', tx * TILE + TILE / 2, ty * TILE + TILE / 2, 1400);
    }
  }

  private randomSpot(minR: number, maxR: number): { x: number; y: number } | null {
    const start = this.ctx.world.map.playerStart;
    const w = this.ctx.world.map.w * TILE;
    const h = this.ctx.world.map.h * TILE;
    for (let i = 0; i < 40; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(minR, maxR);
      const x = start.x + Math.cos(a) * r;
      const y = start.y + Math.sin(a) * r;
      if (x < 100 || y < 100 || x > w - 100 || y > h - 100) continue;
      if (!this.ctx.path.isFree(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
      return { x, y };
    }
    return null;
  }

  get view(): MapEventView[] {
    return this.history;
  }

  static readonly DEPTH = DEPTH;
  static readonly metaOf = metaOf;
}
