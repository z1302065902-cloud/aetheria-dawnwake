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
        if (dist < node.radius + 26) {
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
        if (dist > node.radius + 40) {
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
        if (dist < depot.radius + 22) {
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
          const path = this.ctx.path.findPath(Math.floor(u.x / 32), Math.floor(u.y / 32), Math.floor(depot.x / 32), Math.floor(depot.y / 32));
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

  private assignNewNode(u: Unit): void {
    const { world } = this.ctx;
    const kind = u.carrying?.kind ?? u.lastGatherKind ?? 'gold';
    const node = world.nearestResource(kind, u.x, u.y) ?? world.nearestResource('gold', u.x, u.y);
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
    const path = this.ctx.path.findPath(Math.floor(u.x / 32), Math.floor(u.y / 32), Math.floor(depot.x / 32), Math.floor(depot.y / 32));
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
