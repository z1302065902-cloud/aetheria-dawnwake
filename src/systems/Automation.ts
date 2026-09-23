import { CFG, TILE } from '../config/Constants';
import { getUnit } from '../data/units';
import type { Unit } from '../world/Unit';
import type { GameCtx } from './GameCtx';
import type { OrderSystem } from './Orders';
import type { ProductionSystem } from './Production';

export type ResourceKind = 'gold' | 'wood' | 'mana';

/**
 * Single-player automation.
 *
 * The design goal is "the hero adventures, the army fights, the base grows" — the player
 * should never be a farmer babysitter. Everything in here is a *default-on convenience*
 * that the player can switch off; manual orders always win because automation only ever
 * touches units that are idle.
 */
export interface AutomationSettings {
  /** idle settlers are automatically sent to the resource mix below */
  autoWorker: boolean;
  /** production buildings keep training without being told */
  autoProduction: boolean;
  /** army groups engage enemies that come close on their own */
  autoAttack: boolean;
  /** newly trained units automatically join their army group */
  autoRally: boolean;
}

export interface WorkerMix {
  /** relative share of settlers per resource (normalised at use time) */
  gold: number;
  wood: number;
  mana: number;
}

export interface AutomationView {
  settings: AutomationSettings;
  mix: WorkerMix;
  /** settlers currently assigned to each resource */
  assigned: WorkerMix & { idle: number; building: number };
  total: number;
  /** live (non-depleted) nodes per resource — 0 means that type is exhausted */
  available: WorkerMix;
}

const RESOURCES: ResourceKind[] = ['gold', 'wood', 'mana'];

export class AutomationSystem {
  settings: AutomationSettings = {
    autoWorker: true,
    autoProduction: true,
    autoAttack: true,
    autoRally: true,
  };

  mix: WorkerMix = { gold: 0.55, wood: 0.35, mana: 0.1 };

  /** unit id -> the resource it was last assigned to (for the panel counters) */
  private assignment = new Map<number, ResourceKind>();
  private workerTimer = 0;
  private productionTimer = 0;
  private attackTimer = 0;
  /** unit id -> time until which automation must leave this unit alone (manual orders win) */
  private hold = new Map<number, number>();
  /** automation stops spending while the player is placing a building */
  private productionHoldUntil = 0;
  /** resources the automation will never spend: the player may be saving for a building */
  reserve: { gold: number; wood: number } = { gold: 220, wood: 140 };

  /** Production preference per building id (data-driven, defaults to the first entry). */
  productionOrder: Record<string, string> = {
    castle: 'settler',
    barracks: 'footman',
    archery: 'archer',
    magetower: 'cleric',
    workshop: 'catapult',
  };

  constructor(
    private ctx: GameCtx,
    private orders: OrderSystem,
    private production: ProductionSystem,
  ) {}

  get view(): AutomationView {
    const assigned = { gold: 0, wood: 0, mana: 0, idle: 0, building: 0 };
    let total = 0;
    for (const u of this.ctx.world.units) {
      if (u.dead || u.team !== 1 || u.def.role !== 'worker') continue;
      total++;
      if (u.state === 'build' || u.state === 'buildGo') {
        assigned.building++;
        continue;
      }
      const kind = this.assignment.get(u.id);
      if (kind && (u.state === 'gather' || u.state === 'gatherGo' || u.state === 'returnGo')) assigned[kind]++;
      else assigned.idle++;
    }
    const available: WorkerMix = { gold: 0, wood: 0, mana: 0 };
    for (const r of this.ctx.world.resources) {
      if (r.dead || r.depleted) continue;
      available[r.resourceKind]++;
    }
    return { settings: { ...this.settings }, mix: { ...this.mix }, assigned, total, available };
  }

  /** Manual orders win: automation will not touch these units until the hold expires. */
  holdUnits(units: Unit[], seconds = 8): void {
    const until = this.ctx.now + seconds;
    for (const u of units) this.hold.set(u.id, until);
  }

  /** Called when the player enters build-placement mode: stop auto-spending for a moment. */
  holdProduction(seconds = 10): void {
    this.productionHoldUntil = this.ctx.now + seconds;
  }

  private isHeld(u: Unit): boolean {
    const until = this.hold.get(u.id);
    if (until === undefined) return false;
    if (this.ctx.now >= until) {
      this.hold.delete(u.id);
      return false;
    }
    return true;
  }

  /** Player-facing controls (the worker panel in the HUD). */
  setMix(kind: ResourceKind, delta: number): void {
    const next = Math.max(0, Math.min(10, this.mix[kind] + delta));
    this.mix = { ...this.mix, [kind]: next };
    if (this.mix.gold + this.mix.wood + this.mix.mana <= 0) this.mix.gold = 1;
    // re-balance immediately so the change is visible
    this.rebalance();
  }

  toggle(key: keyof AutomationSettings): void {
    this.settings[key] = !this.settings[key];
  }

  setSetting(key: keyof AutomationSettings, value: boolean): void {
    this.settings[key] = value;
  }

  /** Sends settlers to the resource that is furthest below its target share. */
  rebalance(limit = 99): void {
    const world = this.ctx.world;
    const workers = world.units.filter((u) => !u.dead && u.team === 1 && u.def.role === 'worker');
    if (workers.length === 0) return;
    const totalWeight = this.mix.gold + this.mix.wood + this.mix.mana || 1;
    const target: Record<ResourceKind, number> = {
      gold: (this.mix.gold / totalWeight) * workers.length,
      wood: (this.mix.wood / totalWeight) * workers.length,
      mana: (this.mix.mana / totalWeight) * workers.length,
    };
    // count current assignments
    const current: Record<ResourceKind, number> = { gold: 0, wood: 0, mana: 0 };
    const pool: Unit[] = [];
    for (const u of workers) {
      // never pull a builder off a site, and never override a recent manual order
      if (u.state === 'build' || u.state === 'buildGo' || u.buildId >= 0) continue;
      if (this.isHeld(u)) continue;
      const kind = this.assignment.get(u.id);
      if (kind && (u.state === 'gather' || u.state === 'gatherGo' || u.state === 'returnGo')) current[kind]++;
      else pool.push(u);
    }
    let moved = 0;
    for (const kind of RESOURCES) {
      let deficit = Math.round(target[kind] - current[kind]);
      while (deficit > 0 && pool.length > 0 && moved < limit) {
        const u = pool.pop()!;
        if (this.sendTo(u, kind)) {
          deficit--;
          moved++;
        }
      }
    }
    // anything still unassigned goes to the largest remaining gap
    for (const u of pool) {
      if (moved >= limit) break;
      const kind = RESOURCES.reduce((a, b) => (target[a] - current[a] >= target[b] - current[b] ? a : b));
      if (this.sendTo(u, kind)) {
        current[kind]++;
        moved++;
      }
    }
  }

  private sendTo(u: Unit, kind: ResourceKind): boolean {
    const world = this.ctx.world;
    let node = world.nearestResource(kind, u.x, u.y);
    if (!node) node = world.nearestResource('gold', u.x, u.y);
    if (!node) return false;
    this.orders.gather([u], node, node.resourceKind);
    this.assignment.set(u.id, node.resourceKind);
    return true;
  }

  update(dt: number): void {
    // ── auto worker: top up idle settlers a few at a time so it never spikes ──
    if (this.settings.autoWorker) {
      this.workerTimer += dt;
      if (this.workerTimer >= 0.6) {
        this.workerTimer = 0;
        this.rebalance(3);
      }
    }
    // ── auto production: keep every production building busy ──
    if (this.settings.autoProduction) {
      this.productionTimer += dt;
      if (this.productionTimer >= 1.0) {
        this.productionTimer = 0;
        this.autoProduce();
      }
    }
    // ── auto attack: army groups engage what walks into their reach ──
    if (this.settings.autoAttack) {
      this.attackTimer += dt;
      if (this.attackTimer >= 0.5) {
        this.attackTimer = 0;
        this.autoEngage();
      }
    }
  }

  private autoProduce(): void {
    if (this.ctx.now < this.productionHoldUntil) return; // player is placing a building
    const world = this.ctx.world;
    // while the player's own building is under construction, every spare coin goes there
    if (world.buildings.some((b) => b.team === 1 && b.building)) return;
    for (const b of world.buildings) {
      if (b.dead || b.team !== 1 || b.building) continue;
      const wants = b.def.produces ?? [];
      if (wants.length === 0) continue;
      if (b.production.length >= 1) continue; // one unit at a time: no runaway spending
      const preferred = this.productionOrder[b.def.id] ?? wants[0];
      const unitId = wants.includes(preferred) ? preferred : wants[0];
      const def = getUnit(unitId);
      // keep a construction reserve so automation can never block the player's building
      if (world.wallet.gold - (def.cost.gold ?? 0) < this.reserve.gold) continue;
      if (world.wallet.wood - (def.cost.wood ?? 0) < this.reserve.wood) continue;
      if (this.production.enqueue(b, unitId) === 'ok') {
        this.onProduced?.(b, unitId);
      }
    }
  }

  onProduced: ((b: unknown, unitId: string) => void) | null = null;

  private autoEngage(): void {
    const world = this.ctx.world;
    const anchorOf = this.groupAnchorOf;
    for (const u of world.units) {
      if (u.dead || u.team !== 1 || u.def.role === 'worker' || u.isHero) continue;
      // already fighting or holding position? leave it alone
      if (u.targetId >= 0 || u.state === 'attack' || u.state === 'gather') continue;
      const enemy = world.nearestEnemy(u.x, u.y, u.def.aggroRange * 0.85, u.team, (e) => world.canSee(e.x, e.y, u.team));
      if (!enemy) continue;
      // only engage inside the group's leash so units do not chase across the map
      const anchor = anchorOf ? anchorOf(u) : null;
      if (anchor && Math.hypot(u.x - anchor.x, u.y - anchor.y) > 420) continue;
      this.orders.attack([u], enemy);
    }
  }

  /** Set by the army-group system so auto-engage respects each group's leash. */
  groupAnchorOf: ((u: Unit) => { x: number; y: number } | null) | null = null;

  /** Called when a unit is produced: auto-rally it to its army group. */
  rallyNewUnit(u: Unit): void {
    if (!this.settings.autoRally) return;
    this.onRally?.(u);
  }

  onRally: ((u: Unit) => void) | null = null;

  /** Convenience: is the player allowed to be left alone right now? */
  get fullyAutomated(): boolean {
    return this.settings.autoWorker && this.settings.autoProduction && this.settings.autoRally;
  }

  static readonly RESOURCES = RESOURCES;
  static readonly TILE = TILE;
  static readonly CFG = CFG;
}
