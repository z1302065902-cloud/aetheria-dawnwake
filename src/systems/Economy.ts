import { TILE } from '../config/Constants';
import type { Unit } from '../world/Unit';
import type { ResourceNode } from '../world/ResourceNode';
import type { GameCtx } from './GameCtx';
import type { OrderSystem } from './Orders';
import { audio } from '../audio/AudioBus';

const CARRY_CAP = 12;

/**
 * Harvesting loop: walk to node -> gather -> carry home -> deposit -> repeat.
 * Also owns passive income (captured mana shrines) and the capture mechanic.
 */
export class EconomySystem {
  private cullTimer = 0;

  constructor(
    private ctx: GameCtx,
    private orders: OrderSystem,
  ) {}

  update(dt: number): void {
    const { world } = this.ctx;
    // Relic: Harvest — gather speed bonus for this match
    this.harvestMul = 1 + world.mods.harvestRate;
    for (const u of world.units) {
      if (u.dead || u.def.role !== 'worker') continue;
      if (u.team !== 1 && u.aiState === 'idle') continue;
      this.tickWorker(u, dt);
    }
    this.tickShrines(dt);
    this.cullTimer += dt;
    if (this.cullTimer >= 1) {
      this.cullTimer = 0;
      world.cullDepleted();
    }
  }

  private tickWorker(u: Unit, dt: number): void {
    const { world, now } = this.ctx;
    switch (u.state) {
      case 'gatherGo': {
        const node = world.entityById(u.resourceId) as ResourceNode | undefined;
        if (!node || node.dead || node.depleted) {
          this.assignNewNode(u);
          break;
        }
        const dist = Math.hypot(node.x - u.x, node.y - u.y);
        // A resource node occupies a BLOCKED tile, so A* snaps the goal to an adjacent free
        // tile: the path legitimately ends ~1-1.5 tiles (40-60px) from the node centre. The
        // arrival threshold must allow for that, otherwise the worker stands next to the node
        // forever and re-paths once a second (this was the "workers never gather" bug).
        if (dist < node.radius + TILE * 1.6) {
          u.path.length = 0;
          u.setState('gather');
          u.gatherTimer = 0;
          break;
        }
        if (u.path.length === 0 && now >= u.repathAt) {
          u.repathAt = now + 1.0;
          this.orders.gather([u], node, node.resourceKind);
        }
        break;
      }
      case 'gather': {
        const node = world.entityById(u.resourceId) as ResourceNode | undefined;
        if (!node || node.dead || node.depleted) {
          this.assignNewNode(u);
          break;
        }
        const dist = Math.hypot(node.x - u.x, node.y - u.y);
        // must be comfortably larger than the arrival threshold above, or the worker
        // oscillates between 'gather' and 'gatherGo' at the boundary
        if (dist > node.radius + TILE * 2.6) {
          u.setState('gatherGo');
          break;
        }
        u.gatherTimer += dt;
        const rateMul = this.harvestMul;
        const gained = node.gatherRate * rateMul * dt;
        node.amount = Math.max(0, node.amount - gained);
        u.lastGatherKind = node.resourceKind;
        const carry = u.carrying ?? { kind: node.resourceKind, amount: 0 };
        carry.kind = node.resourceKind;
        carry.amount = Math.min(CARRY_CAP, carry.amount + gained);
        u.carrying = carry;
        if (u.gatherTimer > 0.55) {
          u.gatherTimer = 0;
          audio.sfx('harvest', 0.16);
          this.ctx.fx.hit(u.x + (node.x - u.x) * 0.4, u.y + (node.y - u.y) * 0.4 - 10, node.resourceKind === 'gold' ? 'physical' : 'blood', 0.5);
        }
        if (carry.amount >= CARRY_CAP - 0.01) {
          node.gatherers = Math.max(0, node.gatherers - 1);
          this.startReturn(u);
        }
        break;
      }
      case 'returnGo': {
        const depot = world.nearestDepot(u.x, u.y, u.team);
        if (!depot) {
          // no depot left: keep the load and wait
          u.path.length = 0;
          break;
        }
        const dist = Math.hypot(depot.x - u.x, depot.y - u.y);
        // Same trap as the resource nodes: a depot occupies blocked tiles, so the path can
        // only end on a tile NEXT to its footprint (~1.5 tiles / 100-120px from the centre
        // for a 3x3 castle). A tight threshold made loaded workers stand outside it forever.
        if (dist < depot.radius + TILE * 1.6) {
          const carry = u.carrying;
          if (carry && carry.amount > 0) {
            // Relic: Harvest — extra resources per trip
            const amount = carry.amount * (1 + world.mods.goldGain);
            world.addResource(carry.kind, amount);
            this.ctx.onResourceDeposited?.(carry.kind, amount);
            audio.sfx('deposit', 0.2);
            this.ctx.fx.damageText(u.x, u.y - 20, amount, 'mana');
          }
          u.carrying = null;
          const node = world.entityById(u.resourceId) as ResourceNode | undefined;
          if (node && !node.depleted) {
            this.orders.gather([u], node, node.resourceKind);
          } else {
            this.assignNewNode(u);
          }
          break;
        }
        if (u.path.length === 0 && now >= u.repathAt) {
          u.repathAt = now + 1.0;
          const path = this.ctx.path.findPath(Math.floor(u.x / TILE), Math.floor(u.y / TILE), Math.floor(depot.x / TILE), Math.floor(depot.y / TILE));
          if (path) {
            u.path = path;
            u.pathIndex = 0;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** A node is only worth walking to if it can actually be harvested. */
  private harvestable(n: ResourceNode): boolean {
    return !n.dead && !n.depleted && n.gatherRate > 0;
  }

  private assignNewNode(u: Unit): void {
    const { world } = this.ctx;
    const kind = u.carrying?.kind ?? u.lastGatherKind ?? 'gold';
    // skip the mana "nodes": those are the neutral shrines (gatherRate 0, blocked tile), and
    // sending a worker there parks it forever
    const pick = (k: 'gold' | 'wood' | 'mana') => {
      let best: ResourceNode | null = null;
      let bestD = Infinity;
      for (const r of world.resources) {
        if (r.resourceKind !== k || !this.harvestable(r)) continue;
        const d = (r.x - u.x) ** 2 + (r.y - u.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      return best;
    };
    const node = pick(kind) ?? pick('gold') ?? pick('wood');
    if (!node) {
      u.setState('idle');
      this.orders.finishOrder(u);
      return;
    }
    this.orders.gather([u], node, node.resourceKind);
  }

  private startReturn(u: Unit): void {
    const { world } = this.ctx;
    const depot = world.nearestDepot(u.x, u.y, u.team);
    if (!depot) {
      u.setState('idle');
      return;
    }
    u.state = 'returnGo';
    const path = this.ctx.path.findPath(Math.floor(u.x / TILE), Math.floor(u.y / TILE), Math.floor(depot.x / TILE), Math.floor(depot.y / TILE));
    if (path) {
      u.path = path;
      u.pathIndex = 0;
    }
    u.goalX = depot.x;
    u.goalY = depot.y;
  }

  private tickShrines(dt: number): void {
    const { world } = this.ctx;
    for (const b of world.buildings) {
      if (b.dead || b.def.id !== 'neutral_shrine') continue;
      let playerNear = false;
      world.hashUnits.forEachNear(b.x, b.y, 90, (u) => {
        if (!u.dead && u.team === 1) playerNear = true;
      });
      if (playerNear) {
        b.captureProgress = Math.min(1, b.captureProgress + dt / 1.6);
        if (b.captureProgress >= 1 && !b.captured) {
          b.captured = true;
          b.captureTeam = 1;
          b.faction = 'dawn' as any;
          b.team = 1;
          audio.sfx('buildDone', 0.5);
        }
      }
      if (b.captured && b.captureTeam === 1) {
        this.manaAccum += dt * 0.7;
        if (this.manaAccum >= 1) {
          const whole = Math.floor(this.manaAccum);
          this.manaAccum -= whole;
          world.addResource('mana', whole);
        }
      }
    }
  }

  private manaAccum = 0;
  harvestMul = 1;
}
