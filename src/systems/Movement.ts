import { CFG, TILE } from '../config/Constants';
import { worldToTile } from '../world/MapGen';
import type { GameCtx } from './GameCtx';
import type { Unit } from '../world/Unit';

export interface Point {
  x: number;
  y: number;
}

/**
 * Movement + collision. Units follow A* waypoints, slide along blocked tiles, keep
 * clear of each other (position-based relaxation) and get pushed out of building
 * footprints when they end up deep inside one.
 * Everything is O(n · neighbours) through the spatial hash — no physics engine.
 */
export class MovementSystem {
  constructor(private ctx: GameCtx) {}

  update(dt: number): void {
    const { world } = this.ctx;
    const units = world.units;
    // Order matters:
    //   1. overlap recovery FIRST (deep overlaps only, and it must not fight movement)
    //   2. movement (path following)
    //   3. separation accumulate + apply (after movement so it corrects what moved)
    for (const u of units) {
      if (u.dead) continue;
      this.resolveBlockers(u);
    }
    for (const u of units) {
      if (u.dead) continue;
      u.stuckTimer = u.stuckTimer ?? 0;
      this.stepUnit(u, dt);
    }
    // separation is accumulated for everyone first (a pair may touch a unit that was
    // already processed, so the per-unit accumulator must be cleared in its own pass)
    for (const u of units) {
      if (u.dead) continue;
      u.pushX = 0;
      u.pushY = 0;
    }
    for (const u of units) {
      if (u.dead) continue;
      this.accumulateSeparation(u);
    }
    for (const u of units) {
      if (u.dead) continue;
      this.applySeparation(u);
    }
  }

  // ────────────────────────── path following ──────────────────────────

  private stepUnit(u: Unit, dt: number): void {
    const speed = u.moveSpeed;
    if (u.path.length === 0) return;
    // Consume every waypoint we are already standing on, then move once. (Skipping a
    // waypoint must not burn the whole frame — otherwise units freeze when the
    // simulation is fast-forwarded.)
    while (u.pathIndex < u.path.length) {
      const wp = u.path[u.pathIndex];
      const dx = wp.x - u.x;
      const dy = wp.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) {
        u.pathIndex++;
        continue;
      }
      const step = Math.min(speed * dt, dist);
      this.moveWithSlide(u, (dx / dist) * step, (dy / dist) * step);
      if (Math.abs(dx) > 0.05) u.facing = dx > 0 ? 1 : -1;
      return;
    }
    u.path.length = 0;
    u.pathIndex = 0;
  }

  /** Axis-separated movement so units slide along trees/rocks instead of sticking. */
  private moveWithSlide(u: Unit, dx: number, dy: number): void {
    const { path } = this.ctx;
    const tryMove = (nx: number, ny: number) => {
      const { tx, ty } = worldToTile(nx, ny);
      if (!path.isFree(tx, ty)) return false;
      u.x = nx;
      u.y = ny;
      return true;
    };
    const beforeX = u.x;
    const beforeY = u.y;
    if (!tryMove(u.x + dx, u.y + dy)) {
      const okX = tryMove(u.x + dx, u.y);
      const okY = !okX && tryMove(u.x, u.y + dy);
      if (!okX && !okY) {
        // fully blocked: nudge perpendicular so the unit walks around the corner
        const side = ((u.id % 2) * 2 - 1) * 0.6;
        if (!tryMove(u.x, u.y + Math.abs(dx) * side)) tryMove(u.x + Math.abs(dy) * side, u.y);
      }
    }
    const moved = Math.hypot(u.x - beforeX, u.y - beforeY);
    if (moved < 0.35) {
      u.stuckTimer += 1;
      if (u.stuckTimer > 40 && u.path.length > 0) {
        u.stuckTimer = 0;
        u.path.length = 0;
        u.pathIndex = 0;
        u.repathAt = 0; // force the order systems to recompute next tick
      }
    } else {
      u.stuckTimer = 0;
    }
  }

  // ────────────────────────── local avoidance ──────────────────────────

  /**
   * Local avoidance, position based: every overlapping pair is relaxed exactly once per
   * frame (mass weighted, capped, never pushed into a blocked tile). A weak soft push is
   * not enough — 20 units funnelling through a bridge would otherwise end up stacked.
   */
  /**
   * True when the unit is in a narrow passage (blocked on both sides), in which case
   * sideways shoving is what jams a column — units must queue along the corridor instead.
   */
  private inCorridor(u: Unit): boolean {
    const { path } = this.ctx;
    const tx = Math.floor(u.x / TILE);
    const ty = Math.floor(u.y / TILE);
    const left = path.isFree(tx - 1, ty);
    const right = path.isFree(tx + 1, ty);
    const up = path.isFree(tx, ty - 1);
    const down = path.isFree(tx, ty + 1);
    return (!left && !right && (up || down)) || (!up && !down && (left || right));
  }

  private accumulateSeparation(u: Unit): void {
    const { world } = this.ctx;
    const narrow = this.inCorridor(u);
    const reach = u.radius + 46;
    world.hashUnits.forEachNear(u.x, u.y, reach, (o) => {
      if (o.dead || o === u || o.id < u.id) return; // each pair is relaxed once
      let dx = o.x - u.x;
      let dy = o.y - u.y;
      const minDist = (u.radius + o.radius) * 0.95;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist) return;
      let d = Math.sqrt(d2);
      if (d < 0.01) {
        // exactly stacked: deterministic direction from the id so the pair separates
        // instead of oscillating around the same pixel
        const ang = (u.id * 2.399963) % (Math.PI * 2);
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        d = 1;
      }
      const overlap = minDist - d;
      const nx = dx / d;
      const ny = dy / d;
      // heavier (bigger) units yield less ground: the boss shoves footmen, not vice versa
      const total = u.radius + o.radius;
      const uShare = o.radius / total;
      const oShare = u.radius / total;
      const corr = Math.min(overlap, 3) * 2;
      // In a corridor only allow correction ALONG the passage; pushing sideways is what
      // wedges a column into the walls. The unit that is further along keeps priority.
      if (narrow) {
        const ax = Math.abs(nx) > Math.abs(ny) ? 0 : nx; // lateral component only
        const ay = Math.abs(ny) >= Math.abs(nx) ? 0 : ny;
        u.pushX -= ax * corr * uShare * 0.5;
        u.pushY -= ay * corr * uShare * 0.5;
        o.pushX += ax * corr * oShare * 0.5;
        o.pushY += ay * corr * oShare * 0.5;
        // along-path squeeze: the trailing unit slows down instead of pushing forward
        const uAhead = u.pathIndex > o.pathIndex;
        const blocker = uAhead ? u : o;
        const follower = uAhead ? o : u;
        follower.pushX -= (follower.x - blocker.x) * 0.02;
        follower.pushY -= (follower.y - blocker.y) * 0.02;
        return;
      }
      u.pushX -= nx * corr * uShare;
      u.pushY -= ny * corr * uShare;
      o.pushX += nx * corr * oShare;
      o.pushY += ny * corr * oShare;
    });
  }

  /** Applies the accumulated separation with a per-frame cap and tile validation. */
  private applySeparation(u: Unit): void {
    const { path } = this.ctx;
    let px = u.pushX;
    let py = u.pushY;
    u.pushX = 0;
    u.pushY = 0;
    const mag = Math.hypot(px, py);
    if (mag < 0.05) return;
    const cap = 6;
    if (mag > cap) {
      px = (px / mag) * cap;
      py = (py / mag) * cap;
    }
    const nx = u.x + px;
    const ny = u.y + py;
    if (path.isFree(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      u.x = nx;
      u.y = ny;
    } else if (path.isFree(Math.floor(nx / TILE), Math.floor(u.y / TILE))) {
      u.x = nx;
    } else if (path.isFree(Math.floor(u.x / TILE), Math.floor(ny / TILE))) {
      u.y = ny;
    }
  }

  /**
   * Safety net for units that end up *inside* a building (spawn overlap, knockback).
   * Only deep penetration is corrected: A* already keeps walkable paths out of building
   * tiles, so grazing the expanded box must not fight normal movement.
   */
  private resolveBlockers(u: Unit): void {
    const { world, path } = this.ctx;
    const slack = u.radius * 0.5;
    world.hashBuildings.forEachNear(u.x, u.y, 90, (b) => {
      if (b.dead || !b.sprite) return;
      const hw = (b.def.footprint.w * TILE) / 2 + slack;
      const hh = (b.def.footprint.h * TILE) / 2 + slack;
      const dx = u.x - b.x;
      const dy = u.y - b.y;
      const ox = hw - Math.abs(dx);
      const oy = hh - Math.abs(dy);
      if (ox <= 0 || oy <= 0) return;
      if (ox < oy) {
        const nx = b.x + Math.sign(dx || 1) * hw;
        const { tx, ty } = worldToTile(nx, u.y);
        if (path.isFree(tx, ty)) u.x = nx;
      } else {
        const ny = b.y + Math.sign(dy || 1) * hh;
        const { tx, ty } = worldToTile(u.x, ny);
        if (path.isFree(tx, ty)) u.y = ny;
      }
    });
    u.x = Math.max(8, Math.min(world.map.w * TILE - 8, u.x));
    u.y = Math.max(8, Math.min(world.map.h * TILE - 8, u.y));
  }

  // ────────────────────────── group orders ──────────────────────────

  /** Grid formation slots (local space) for a group of `count` units. */
  private formationSlots(count: number, spacing = 34): Point[] {
    if (count <= 1) return [{ x: 0, y: 0 }];
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / cols);
    const slots: Point[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({
          x: (c - (cols - 1) / 2) * spacing,
          y: (r - (rows - 1) / 2) * spacing,
        });
      }
    }
    return slots;
  }

  /**
   * Shared path assignment for a group order: ONE A* search for the whole group, then
   * each unit gets a formation slot at the destination (assigned nearest-first so units
   * do not cross each other on the way there).
   */
  moveGroup(units: Unit[], targetX: number, targetY: number, onArriveEach: (u: Unit) => void): void {
    const { path } = this.ctx;
    if (units.length === 0) return;
    let cx = 0;
    let cy = 0;
    for (const u of units) {
      cx += u.x;
      cy += u.y;
    }
    cx /= units.length;
    cy /= units.length;

    const from = worldToTile(cx, cy);
    const to = worldToTile(targetX, targetY);
    const shared = path.findPath(from.tx, from.ty, to.tx, to.ty);

    const slots = this.formationSlots(units.length);
    const taken = new Set<number>();
    units.forEach((u) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (taken.has(i)) continue;
        const sx = targetX + slots[i].x;
        const sy = targetY + slots[i].y;
        const d = (u.x - sx) ** 2 + (u.y - sy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      taken.add(best);

      // the slot must land on walkable ground, otherwise fall back to the destination
      let gx = targetX + slots[best].x;
      let gy = targetY + slots[best].y;
      const t = worldToTile(gx, gy);
      const free = path.nearestFree(t.tx, t.ty, 3);
      if (free) {
        gx = free.tx * TILE + TILE / 2;
        gy = free.ty * TILE + TILE / 2;
      } else {
        gx = targetX;
        gy = targetY;
      }

      if (shared && shared.length > 0) {
        u.path = shared.map((p, idx) => (idx === shared.length - 1 ? { x: gx, y: gy } : { x: p.x, y: p.y }));
      } else {
        u.path = [{ x: gx, y: gy }];
      }
      u.pathIndex = 0;
      u.goalX = gx;
      u.goalY = gy;
      u.chaseGoalX = gx;
      u.chaseGoalY = gy;
      u.repathAt = this.ctx.now + CFG.REPATH_COOLDOWN / 1000;
      onArriveEach(u);
    });
  }
}
