import type { Building } from '../world/Building';
import type { Unit } from '../world/Unit';
import type { World } from '../world/World';
import { audio } from '../audio/AudioBus';

/**
 * Selection state + rectangle picking. Owns the "what is selected" question so the
 * HUD, the order system and the input layer all read from one place.
 */
export class SelectionSystem {
  units: Unit[] = [];
  building: Building | null = null;
  onChanged: (() => void) | null = null;

  constructor(private world: World) {}

  get primary(): Unit | null {
    return this.units.find((u) => u.isHero) ?? this.units[0] ?? null;
  }

  get count(): number {
    return this.units.length;
  }

  clear(): void {
    if (this.units.length === 0 && !this.building) return;
    this.units.length = 0;
    this.building = null;
    this.notify();
  }

  setUnits(units: Unit[], silent = false): void {
    this.units = units.filter((u) => !u.dead);
    this.building = null;
    if (!silent) this.notify();
  }

  setBuilding(b: Building | null, silent = false): void {
    this.building = b;
    this.units.length = 0;
    if (!silent) this.notify();
  }

  addUnits(units: Unit[]): void {
    const set = new Set(this.units);
    for (const u of units) if (!u.dead) set.add(u);
    this.units = Array.from(set);
    this.building = null;
    this.notify();
  }

  /** Left click: pick a single unit / building that belongs to the player. */
  pickAt(x: number, y: number, team = 1): boolean {
    let bestUnit: Unit | null = null;
    let bestD = Infinity;
    this.world.hashUnits.forEachNear(x, y, 40, (u) => {
      if (u.dead || u.team !== team) return;
      const d = Math.hypot(u.x - x, u.y - (y - 8));
      if (d < bestD && d < u.radius + 16) {
        bestD = d;
        bestUnit = u;
      }
    });
    if (bestUnit) {
      this.setUnits([bestUnit]);
      audio.sfx('select', 0.35);
      return true;
    }
    const b = this.world.buildings.find((bb) => {
      if (bb.dead || bb.team !== team) return false;
      const hw = (bb.def.footprint.w * 32) / 2;
      const hh = (bb.def.footprint.h * 32) / 2;
      return Math.abs(bb.x - x) <= hw && Math.abs(bb.y - y) <= hh + 20;
    });
    if (b) {
      this.setBuilding(b);
      audio.sfx('select', 0.35);
      return true;
    }
    this.clear();
    return false;
  }

  /** Drag box: select every player unit inside the rectangle. */
  pickInRect(x1: number, y1: number, x2: number, y2: number, team = 1, additive = false): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const found: Unit[] = [];
    for (const u of this.world.units) {
      if (u.dead || u.team !== team) continue;
      if (u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY) found.push(u);
    }
    // Everything inside the box is selected, workers included (classic RTS behaviour).
    if (additive) this.addUnits(found);
    else this.setUnits(found);
    if (found.length > 0) audio.sfx('select', 0.4);
  }

  /** Used by control groups. */
  groupSnapshot(): Unit[] {
    return this.units.slice();
  }

  refresh(): void {
    this.units = this.units.filter((u) => !u.dead);
    if (this.building?.dead) this.building = null;
  }

  private notify(): void {
    this.onChanged?.();
  }
}
