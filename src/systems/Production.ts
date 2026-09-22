import { TILE } from '../config/Constants';
import type { Building } from '../world/Building';
import type { Unit } from '../world/Unit';
import type { GameCtx } from './GameCtx';
import type { OrderSystem } from './Orders';
import { getUnit } from '../data/units';
import { audio } from '../audio/AudioBus';

export type QueueResult = 'ok' | 'cost' | 'pop' | 'locked' | 'maxed';

/**
 * Production queues + hero respawn. Buildings tick their own queue; the population
 * cap is enforced at enqueue time so the player never loses resources silently.
 */
export class ProductionSystem {
  constructor(
    private ctx: GameCtx,
    private orders: OrderSystem,
  ) {}

  canQueue(b: Building, unitId: string): QueueResult {
    const def = getUnit(unitId);
    if (b.production.length >= 5) return 'maxed';
    if (!this.ctx.world.canAfford(def.cost)) return 'cost';
    if (isFinite(def.pop) && def.pop > 0) {
      const { world } = this.ctx;
      const queuedPop = b.production.reduce((acc, it) => acc + (getUnit(it.unitId).pop || 0), 0);
      if (world.popUsed + queuedPop + def.pop > world.popMax) return 'pop';
    }
    return 'ok';
  }

  enqueue(b: Building, unitId: string): QueueResult {
    const res = this.canQueue(b, unitId);
    if (res !== 'ok') {
      audio.sfx('error', 0.35);
      return res;
    }
    const def = getUnit(unitId);
    this.ctx.world.spend(def.cost);
    b.queueUnit(unitId, def.buildTime);
    audio.sfx('click', 0.3);
    return 'ok';
  }

  cancelLast(b: Building): void {
    const item = b.production.pop();
    if (!item) return;
    const def = getUnit(item.unitId);
    this.ctx.world.addResource('gold', def.cost.gold ?? 0);
    this.ctx.world.addResource('wood', def.cost.wood ?? 0);
    this.ctx.world.addResource('mana', def.cost.mana ?? 0);
    audio.sfx('click', 0.3);
  }

  update(dt: number): void {
    const { world } = this.ctx;
    for (const b of world.buildings) {
      if (b.dead || b.building || b.production.length === 0) continue;
      const head = b.production[0];
      const def = getUnit(head.unitId);
      if (b.team === 1) {
        if (def.pop > 0 && world.popUsed + def.pop > world.popMax) continue; // paused, not lost
      }
      head.timeLeft -= dt;
      if (head.timeLeft > 0) continue;
      b.production.shift();
      this.spawnFrom(b, head.unitId);
    }
    this.tickHeroRespawn(dt);
  }

  private spawnFrom(b: Building, unitId: string): void {
    const { world } = this.ctx;
    const folder = this.findSpawnSpot(b);
    const unit = world.spawnUnit(unitId, folder.x, folder.y, b.faction as any);
    if (b.team === 1) {
      const rally = { x: b.rallyX, y: b.rallyY };
      this.orders.move([unit], rally.x + (Math.random() - 0.5) * 30, rally.y + (Math.random() - 0.5) * 30, false);
      audio.sfx('unitReady', 0.34);
    } else {
      this.orders.move([unit], b.x + (Math.random() - 0.5) * 40, b.y + (Math.random() - 0.5) * 40, false);
    }
    world.recomputePop();
    this.ctx.onUnitProduced?.(unit);
  }

  private findSpawnSpot(b: Building): { x: number; y: number } {
    const { path } = this.ctx;
    const tiles = this.ctx.world.map;
    for (let r = 1; r <= 6; r++) {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const x = b.x + Math.cos(ang) * (b.def.footprint.w / 2 + 0.8 + r * 0.4) * TILE;
        const y = b.y + Math.sin(ang) * (b.def.footprint.h / 2 + 0.8 + r * 0.4) * TILE;
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        if (tx < 0 || ty < 0 || tx >= tiles.w || ty >= tiles.h) continue;
        if (path.isFree(tx, ty)) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      }
    }
    return { x: b.x, y: b.y + b.radius + 20 };
  }

  private tickHeroRespawn(dt: number): void {
    const hero = this.ctx.world.hero;
    if (!hero || !hero.respawning) return;
    hero.respawnTimer -= dt;
    if (hero.respawnTimer > 0) return;
    const castle = this.ctx.world.buildings.find((b) => b.team === 1 && b.def.id === 'castle' && !b.dead);
    const spot = castle ? this.findSpawnSpot(castle) : { x: this.ctx.world.map.playerStart.x, y: this.ctx.world.map.playerStart.y };
    hero.respawning = false;
    hero.dead = false;
    hero.hp = hero.maxHp;
    hero.mana = hero.maxMana;
    hero.x = spot.x;
    hero.y = spot.y;
    hero.clearOrders();
    hero.setState('idle');
    hero.sprite?.setVisible(true).setActive(true);
    this.ctx.fx.levelUp(hero.x, hero.y);
    audio.sfx('heroRevive', 0.6);
    this.ctx.onUnitProduced?.(hero);
  }

  get heroRespawnSeconds(): number {
    const hero = this.ctx.world.hero;
    return hero && hero.respawning ? Math.max(0, hero.respawnTimer) : 0;
  }

  hasUnitInQueue(b: Building, unitId: string): boolean {
    return b.production.some((p) => p.unitId === unitId);
  }

  unitAtRally(b: Building): Unit | null {
    return null;
  }
}
