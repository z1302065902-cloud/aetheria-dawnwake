import { TILE } from '../config/Constants';
import type { Unit } from '../world/Unit';
import type { Building } from '../world/Building';
import type { GameCtx } from './GameCtx';
import type { MovementSystem } from './Movement';

export type Stance = 'followHero' | 'guardBase' | 'autoAttack' | 'holdPoint';

export interface ArmyGroup {
  id: number;
  name: string;
  stance: Stance;
  /** live unit ids; dead ones are pruned every tick */
  members: number[];
  /** where the group should sit (recomputed from the stance) */
  anchor: { x: number; y: number } | null;
  /** last time we re-issued a move so we do not spam pathfinding */
  lastOrderAt: number;
}

export const STANCE_LABEL: Record<Stance, string> = {
  followHero: '跟随英雄',
  guardBase: '守卫基地',
  autoAttack: '自动进攻',
  holdPoint: '驻守此处',
};

/**
 * Army groups: the "army" pillar of the design. Three named groups (main / ranged / escort)
 * each carry a stance, so the player sets intent once and the army behaves instead of
 * needing a click per unit.
 */
export class ArmyGroupSystem {
  groups: ArmyGroup[] = [
    { id: 1, name: '主力军', stance: 'autoAttack', members: [], anchor: null, lastOrderAt: 0 },
    { id: 2, name: '远程军', stance: 'followHero', members: [], anchor: null, lastOrderAt: 0 },
    { id: 3, name: '英雄护卫', stance: 'followHero', members: [], anchor: null, lastOrderAt: 0 },
  ];

  constructor(
    private ctx: GameCtx,
    private movement: MovementSystem,
  ) {}

  group(id: number): ArmyGroup {
    return this.groups[Math.min(this.groups.length - 1, Math.max(0, id - 1))];
  }

  /** Assigns units to a group (they are removed from every other group first). */
  assign(id: number, units: Unit[]): void {
    const target = this.group(id);
    for (const g of this.groups) {
      if (g === target) continue;
      const ids = new Set(units.map((u) => u.id));
      g.members = g.members.filter((m) => !ids.has(m));
    }
    const set = new Set(target.members);
    // workers belong to the economy: dragging them into a group made the group system
    // re-task them, which silently cancelled their build/gather jobs
    for (const u of units) if (!u.dead && !u.isHero && u.def.role !== 'worker') set.add(u.id);
    target.members = Array.from(set);
  }

  setStance(id: number, stance: Stance): void {
    const g = this.group(id);
    g.stance = stance;
    if (stance === 'holdPoint') {
      const anchor = this.groupCentroid(g);
      g.anchor = anchor ?? g.anchor;
    }
    g.lastOrderAt = 0; // apply immediately
  }

  /** Live members (dead units are dropped). */
  membersOf(id: number): Unit[] {
    const g = this.group(id);
    const world = this.ctx.world;
    const out: Unit[] = [];
    g.members = g.members.filter((mid) => {
      const u = world.entityById(mid) as Unit | undefined;
      if (!u || u.dead || u.isHero) return false;
      out.push(u);
      return true;
    });
    return out;
  }

  private groupCentroid(g: ArmyGroup): { x: number; y: number } | null {
    const live = this.membersOf(g.id);
    if (live.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const u of live) {
      x += u.x;
      y += u.y;
    }
    return { x: x / live.length, y: y / live.length };
  }

  anchorOf(u: Unit): { x: number; y: number } | null {
    for (const g of this.groups) {
      if (g.members.includes(u.id) && g.anchor) return g.anchor;
    }
    return null;
  }

  /** Home position for a stance (hero / castle / nearest enemy camp). */
  private desiredAnchor(g: ArmyGroup): { x: number; y: number } | null {
    const world = this.ctx.world;
    if (g.stance === 'followHero') {
      const hero = world.hero;
      return hero && !hero.dead ? { x: hero.x, y: hero.y } : world.map.playerStart;
    }
    if (g.stance === 'guardBase') {
      const castle = world.buildings.find((b) => !b.dead && b.team === 1 && b.def.id === 'castle');
      return castle ? { x: castle.x, y: castle.y } : world.map.playerStart;
    }
    if (g.stance === 'autoAttack') {
      const camp = world.buildings.find((b) => !b.dead && b.team === 2);
      return camp ? { x: camp.x, y: camp.y } : null;
    }
    return g.anchor;
  }

  update(dt: number): void {
    const now = this.ctx.now;
    for (const g of this.groups) {
      const live = this.membersOf(g.id);
      if (live.length === 0) {
        g.anchor = null;
        continue;
      }
      const want = this.desiredAnchor(g);
      if (!want) continue;
      g.anchor = want;
      // holdPoint keeps its anchor; other stances re-anchor continuously but only re-order
      // when the group has drifted far enough to matter
      if (g.stance === 'holdPoint') continue;
      if (now - g.lastOrderAt < 3) continue;
      const centre = this.groupCentroid(g);
      if (!centre) continue;
      const drift = Math.hypot(centre.x - want.x, centre.y - want.y);
      const leash = g.stance === 'autoAttack' ? 220 : 180;
      if (drift <= leash) continue;
      g.lastOrderAt = now;
      // spread the group around the anchor instead of stacking on one pixel
      const movable = live.filter((u) => u.def.role !== 'worker' && (u.state !== 'attack' || u.path.length === 0));
      if (movable.length === 0) continue;
      this.movement.moveGroup(movable, want.x, want.y, (u) => u.setState('move'));
      for (const u of movable) u.targetId = -1;
      void dt;
    }
  }

  /** Called when a unit finishes training: join the group whose stance matches its role. */
  assignNewUnit(u: Unit): void {
    if (u.def.role === 'worker') return; // never auto-rally settlers into the army
    const isRanged = u.def.projectile !== undefined;
    const target = isRanged ? this.group(2) : this.group(1);
    this.assign(target.id, [u]);
    // escort group: keep the hero company with a couple of melee units
    const escort = this.group(3);
    if (!isRanged && escort.members.length < 3) this.assign(3, [u]);
    const anchor = target.anchor ?? this.desiredAnchor(target);
    if (anchor) {
      this.movement.moveGroup([u], anchor.x + (Math.random() - 0.5) * 120, anchor.y + (Math.random() - 0.5) * 120, () => u.setState('move'));
    }
  }

  /** Debug/test view. */
  get view(): Array<{ id: number; name: string; stance: Stance; count: number; anchor: { x: number; y: number } | null }> {
    return this.groups.map((g) => ({
      id: g.id,
      name: g.name,
      stance: g.stance,
      count: this.membersOf(g.id).length,
      anchor: g.anchor ? { x: Math.round(g.anchor.x), y: Math.round(g.anchor.y) } : null,
    }));
  }

  /** Rally point for a production building: where the group wants to be. */
  rallyFor(_b: Building): { x: number; y: number } | null {
    const main = this.group(1);
    return this.desiredAnchor(main) ?? null;
  }

  static readonly TILE = TILE;
}
