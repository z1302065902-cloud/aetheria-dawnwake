import { CFG, TILE } from '../config/Constants';
import { worldToTile } from '../world/MapGen';
import type { GameCtx } from './GameCtx';
import type { Unit } from '../world/Unit';

/**
 * Movement + collision. Units follow A* waypoints, slide along blocked tiles, push
 * each other apart (local avoidance) and get pushed out of building footprints.
 * Everything is O(n · neighbours) through the spatial hash — no physics engine.
 */
export class MovementSystem {
  private neighbours: Unit[] = [];

  constructor(private ctx: GameCtx) {}

  update(dt: number): void {
    const { world } = this.ctx;
    const units = world.units;
    // Order matters: overlap recovery runs FIRST (deep overlaps only), then movement,
    // then local avoidance. Running the recovery last would silently cancel the
    // movement of every unit standing near a building edge.
    for (const u of units) {
      if (u.dead) continue;
      this.resolveBlockers(u);
    }
    for (const u of units) {
      if (u.dead) continue;
      u.stuckTimer = u.stuckTimer ?? 0;
      this.stepUnit(u, dt);
    }
    for (const u of units) {
      if (u.dead) continue;
      this.separate(u);
    }
  }

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
    const before = { x: u.x, y: u.y };
    if (!tryMove(u.x + dx, u.y + dy)) {
      const okX = tryMove(u.x + dx, u.y);
      const okY = !okX && tryMove(u.x, u.y + dy);
      if (!okX && !okY) {
        // fully blocked: nudge perpendicular so the unit walks around the corner
        const side = ((u.id % 2) * 2 - 1) * 0.6;
        if (!tryMove(u.x, u.y + Math.abs(dx) * side)) tryMove(u.x + Math.abs(dy) * side, u.y);
      }
    }
    const moved = Math.hypot(u.x - before.x, u.y - before.y);
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

  private separate(u: Unit): void {
    const { world } = this.ctx;
    const out = this.neighbours;
    world.hashUnits.query(u.x, u.y, CFG.SEPARATION_RADIUS, out);
    if (out.length <= 1) return;
    let px = 0;
    let py = 0;
    let count = 0;
    for (const o of out) {
      if (o === u || o.dead) continue;
      const dx = u.x - o.x;
      const dy = u.y - o.y;
      const minDist = u.radius + o.radius - 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (minDist - d) / minDist;
      const weight = o.kind === 'unit' ? 1 : 1;
      px += (dx / d) * push * weight;
      py += (dy / d) * push * weight;
      count++;
      if (count > 8) break;
    }
    if (count === 0) return;
    const strength = 28 * Math.min(1, count / 4);
    u.x += px * strength * (1 / 60);
    u.y += py * strength * (1 / 60);
  }

  /**
   * Safety net for units that end up *inside* a building (spawn overlap, knockback).
   * Only deep penetration is corrected: A* already keeps walkable paths out of
   * building tiles, so grazing the expanded box must not fight normal movement.
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
      // centre is inside the (slack-expanded) footprint: move it to the nearest edge
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

  /** Shared path assignment for a group order (single A* per order, spread destinations). */
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

    units.forEach((u, i) => {
      // ring offsets so 20 units do not stack on the same pixel
      const ring = Math.floor(i / 6);
      const ang = (i % 6) * (Math.PI / 3) + ring * 0.5;
      const spread = ring === 0 ? 0 : 16 + ring * 12;
      const ox = Math.cos(ang) * spread;
      const oy = Math.sin(ang) * spread;
      u.path = shared ? shared.map((p, idx) => (idx === shared.length - 1 ? { x: p.x + ox, y: p.y + oy } : { x: p.x, y: p.y })) : [{ x: targetX + ox, y: targetY + oy }];
      u.pathIndex = 0;
      u.goalX = targetX + ox;
      u.goalY = targetY + oy;
      u.repathAt = this.ctx.now + CFG.REPATH_COOLDOWN / 1000;
      onArriveEach(u);
    });
  }
}
