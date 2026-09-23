import { CFG } from '../config/Constants';
import type { Unit } from '../world/Unit';
import type { Building } from '../world/Building';
import type { ResourceNode } from '../world/ResourceNode';
import type { GameCtx } from './GameCtx';
import type { MovementSystem } from './Movement';

export interface OrderApi {
  move(units: Unit[], x: number, y: number, attackMove: boolean): void;
  attack(units: Unit[], target: Unit | Building): void;
  gather(units: Unit[], node: ResourceNode, kind: 'gold' | 'wood' | 'mana'): void;
  build(units: Unit[], site: Building): void;
  stop(units: Unit[]): void;
  hold(units: Unit[]): void;
}

/**
 * Player-side unit behaviour. Each unit runs a small state machine; the order API is
 * what the input layer calls, so the queueing rules live in exactly one place.
 */
export class OrderSystem implements OrderApi {
  constructor(
    private ctx: GameCtx,
    private movement: MovementSystem,
  ) {}

  move(units: Unit[], x: number, y: number, attackMove: boolean): void {
    const movable = units.filter((u) => !u.dead);
    if (movable.length === 0) return;
    this.movement.moveGroup(movable, x, y, (u) => {
      u.targetId = -1;
      u.forcedTarget = false;
      u.resourceId = -1;
      u.buildId = -1;
      u.setState(attackMove ? 'attackMove' : 'move');
      if (!attackMove && u.isHero) u.aiState = 'idle';
    });
  }

  attack(units: Unit[], target: Unit | Building): void {
    for (const u of units) {
      if (u.dead) continue;
      u.targetId = target.id;
      u.forcedTarget = true;
      u.resourceId = -1;
      u.buildId = -1;
      u.setState('attack');
      u.queue.length = 0;
    }
  }

  gather(units: Unit[], node: ResourceNode, kind: 'gold' | 'wood' | 'mana'): void {
    for (const u of units) {
      if (u.dead || u.def.role !== 'worker') continue;
      u.resourceId = node.id;
      u.targetId = -1;
      u.forcedTarget = false;
      u.buildId = -1;
      u.carrying = u.carrying ?? null;
      u.setState(u.carrying ? 'returnGo' : 'gatherGo');
      u.gatherTimer = 0;
      this.prepareGather(u, node, kind);
    }
  }

  private prepareGather(u: Unit, node: ResourceNode, kind: 'gold' | 'wood' | 'mana'): void {
    node.gatherers++;
    const path = this.ctx.path.findPath(
      Math.floor(u.x / 32),
      Math.floor(u.y / 32),
      Math.floor(node.x / 32),
      Math.floor(node.y / 32),
    );
    if (path) {
      u.path = path;
      u.pathIndex = 0;
    }
    u.goalX = node.x;
    u.goalY = node.y;
    void kind;
  }

  build(units: Unit[], site: Building): void {
    for (const u of units) {
      if (u.dead || u.def.role !== 'worker') continue;
      u.buildId = site.id;
      u.targetId = -1;
      u.forcedTarget = false;
      u.resourceId = -1;
      u.setState('buildGo');
      const path = this.ctx.path.findPath(Math.floor(u.x / 32), Math.floor(u.y / 32), Math.floor(site.x / 32), Math.floor(site.y / 32));
      if (path) {
        u.path = path;
        u.pathIndex = 0;
      }
      u.goalX = site.x;
      u.goalY = site.y;
    }
  }

  stop(units: Unit[]): void {
    for (const u of units) {
      u.clearOrders();
      u.queue.length = 0;
      u.setState('idle');
    }
  }

  hold(units: Unit[]): void {
    for (const u of units) {
      u.clearOrders();
      u.queue.length = 0;
      u.setState('idle');
      u.aiState = 'idle';
      u.homeX = u.x;
      u.homeY = u.y;
    }
  }

  // ────────────────────────── per-frame state machine ──────────────────────────

  update(dt: number): void {
    const { world } = this.ctx;
    for (const u of world.units) {
      if (u.dead || u.team !== 1) continue;
      u.lastCombatAt = u.lastCombatAt || 0;
      this.tick(u, dt);
    }
  }

  private tick(u: Unit, dt: number): void {
    const { world, now } = this.ctx;

    // heroes respawn instead of dying
    if (u.isHero && u.dead) return;

    switch (u.state) {
      case 'idle': {
        const enemy = this.acquire(u, u.def.aggroRange);
        if (enemy) {
          u.targetId = enemy.id;
          u.setState('attack');
        }
        break;
      }
      case 'move':
      case 'attackMove': {
        if (u.state === 'attackMove') {
          const enemy = this.acquire(u, u.def.aggroRange);
          if (enemy) {
            u.targetId = enemy.id;
            u.setState('attack');
            break;
          }
        }
        if (u.path.length === 0) {
          if (u.queue.length > 0) this.runQueued(u);
          else u.setState('idle');
        }
        break;
      }
      case 'attack': {
        const target = world.entityById(u.targetId) as Unit | Building | undefined;
        if (!target || target.dead) {
          u.targetId = -1;
          u.forcedTarget = false;
          this.finishOrder(u);
          break;
        }
        const dist = Math.hypot(target.x - u.x, target.y - u.y);
        const reach = u.rangeTotal + target.radius + 6;
        if (dist > reach) {
          // Re-path only when we have no path, or when the target has moved away from
          // the goal we were chasing (otherwise a fast simulation re-paths every frame
          // and the unit never takes a step).
          const drifted = Math.hypot(target.x - u.chaseGoalX, target.y - u.chaseGoalY) > 56;
          if ((u.path.length === 0 || drifted) && now >= u.repathAt) {
            u.repathAt = now + CFG.REPATH_COOLDOWN / 1000;
            const gx = target.x + (Math.random() - 0.5) * 20;
            const gy = target.y + (Math.random() - 0.5) * 20;
            u.chaseGoalX = gx;
            u.chaseGoalY = gy;
            this.movement.moveGroup([u], gx, gy, () => {
              u.setState('attack');
            });
          }
        } else if (dist < reach * 0.55 && u.def.projectile && !u.isHero) {
          // ranged units back off a little to keep their distance
          const ang = Math.atan2(u.y - target.y, u.x - target.x);
          const nx = target.x + Math.cos(ang) * reach * 0.85;
          const ny = target.y + Math.sin(ang) * reach * 0.85;
          if (Math.hypot(u.x - nx, u.y - ny) > 14 && now >= u.repathAt) {
            u.repathAt = now + 1.2;
            this.movement.moveGroup([u], nx, ny, () => u.setState('attack'));
          }
        }
        break;
      }
      case 'gatherGo':
      case 'gather':
      case 'returnGo':
      case 'buildGo':
      case 'build':
        // handled by EconomySystem / BuildSystem
        break;
      case 'dead':
        break;
    }
    u.tickBuffs(now);
  }

  /** Called by the economy/build systems when a worker finishes a job. */
  finishOrder(u: Unit): void {
    if (u.queue.length > 0) {
      this.runQueued(u);
      return;
    }
    u.setState('idle');
  }

  private runQueued(u: Unit): void {
    const cmd = u.queuedStep();
    if (!cmd) {
      u.setState('idle');
      return;
    }
    switch (cmd.type) {
      case 'move':
        this.move([u], cmd.x ?? u.x, cmd.y ?? u.y, false);
        break;
      case 'attackMove':
        this.move([u], cmd.x ?? u.x, cmd.y ?? u.y, true);
        break;
      case 'attack': {
        const t = this.ctx.world.entityById(cmd.targetId ?? -1);
        if (t) this.attack([u], t as Unit | Building);
        break;
      }
      case 'stop':
        this.stop([u]);
        break;
      default:
        u.setState('idle');
        break;
    }
  }

  private acquire(u: Unit, radius: number): Unit | null {
    const { world } = this.ctx;
    if (u.def.role === 'worker') {
      // workers only fight back against things already hitting them
      return null;
    }
    // fog: the player cannot auto-attack something it cannot see
    return world.nearestEnemy(u.x, u.y, radius, u.team, (e) => world.canSee(e.x, e.y, u.team));
  }
}
