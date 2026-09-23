import { TILE } from '../config/Constants';
import type { Building } from '../world/Building';
import type { Unit } from '../world/Unit';
import type { GameCtx } from './GameCtx';
import type { OrderSystem } from './Orders';
import { audio } from '../audio/AudioBus';

/**
 * Construction: a placed site only progresses while a Settler is standing next to it.
 * That keeps the classic RTS worker loop intact without adding a second resource model.
 */
export class BuildSystem {
  constructor(
    private ctx: GameCtx,
    private orders: OrderSystem,
  ) {}

  /** Called by the input layer when the player confirms a placement. */
  startConstruction(site: Building, onAssigned?: (units: Unit[]) => void): void {
    const { world } = this.ctx;
    const workers = world.units.filter((u) => u.team === 1 && u.def.role === 'worker' && !u.dead);
    if (workers.length === 0) return;
    // Prefer idle workers, then workers that are free to move, then anyone closest
    // (a placed building must never sit at 0% forever — that reads as a broken game).
    const byDistance = workers.slice().sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y));
    const idle = byDistance.filter((u) => u.state === 'idle' || u.state === 'move' || u.state === 'attackMove');
    const chosen = (idle.length > 0 ? idle : byDistance).slice(0, 3);
    if (chosen.length > 0) {
      this.orders.build(chosen, site);
      onAssigned?.(chosen);
    }
  }

  update(dt: number): void {
    const { world } = this.ctx;
    const builders = new Map<number, number>();
    for (const u of world.units) {
      if (u.dead || u.def.role !== 'worker') continue;
      const target = u.buildId >= 0 ? (world.entityById(u.buildId) as Building | undefined) : undefined;
      if (!target || target.dead) {
        if (u.state === 'build' || u.state === 'buildGo') {
          u.buildId = -1;
          this.orders.finishOrder(u);
        }
        continue;
      }
      const dist = Math.hypot(target.x - u.x, target.y - u.y);
      // A* routes to the nearest *free* tile outside the footprint, which can be up to
      // ~1.5 tiles from the footprint centre — the arrival check must allow for that.
      const reach = target.radius + TILE * 0.9;
      if (u.state === 'buildGo') {
        if (dist < reach) {
          u.path.length = 0;
          u.setState('build');
        } else if (u.path.length === 0) {
          const path = this.ctx.path.findPath(Math.floor(u.x / TILE), Math.floor(u.y / TILE), Math.floor(target.x / TILE), Math.floor(target.y / TILE));
          if (path) {
            u.path = path;
            u.pathIndex = 0;
          }
        }
      } else if (u.state === 'build') {
        if (dist > reach + 34) {
          u.setState('buildGo');
        } else {
          builders.set(target.id, (builders.get(target.id) ?? 0) + 1);
          target.construction = Math.min(1, target.construction + (dt * 0.85) / Math.max(4, target.def.buildTime));
        }
      }
    }

    for (const b of world.buildings) {
      if (b.dead || !b.building) continue;
      const count = builders.get(b.id) ?? 0;
      if (count > 0 && Math.random() < dt * 3.5) {
        world.fx.hit(b.x + (Math.random() - 0.5) * 40, b.y + (Math.random() - 0.5) * 30, 'siege', 0.5);
        audio.sfx('build', 0.12);
      }
      if (b.construction >= 1) {
        b.building = false;
        b.construction = 1;
        audio.sfx('buildDone', 0.55);
        world.fx.levelUp(b.x, b.y - 20);
        // builders go back to whatever they were doing (usually harvesting)
        for (const u of world.units) {
          if (u.buildId !== b.id) continue;
          u.buildId = -1;
          const kind = u.lastGatherKind;
          const node = kind ? world.nearestResource(kind, u.x, u.y) : null;
          if (node && !u.carrying) this.orders.gather([u], node, kind!);
          else this.orders.finishOrder(u);
        }
      } else if (count === 0 && b.construction < 0.02) {
        b.construction = 0.02;
      }
    }
  }
}
