import Phaser from 'phaser';
import { BUILDABLE_TILE, CFG, DEPTH, FACTION, TILE, Tile, type FactionId, type ResourceId } from '../config/Constants';
import { SpatialHash } from '../core/SpatialHash';
import { metaOf } from '../art/SpriteFactory';
import { Building } from './Building';
import { Hero } from './Hero';
import { ResourceNode } from './ResourceNode';
import { Unit } from './Unit';
import { getBuilding } from '../data/buildings';
import { getUnit, UNITS } from '../data/units';
import { HEROES, getHero } from '../data/heroes';
import type { BuildingDef, UnitDef } from '../data/types';
import { isWalkable, tileAt, worldToTile, type GeneratedMap } from './MapGen';
import { Pathfinder } from '../systems/Pathfinder';
import type { FxSystem } from '../fx/FxSystem';

const ARMOR_MATRIX: Record<string, Record<string, number>> = {
  physical: { light: 1.12, medium: 1.0, heavy: 0.82, fortified: 0.7 },
  magic: { light: 1.1, medium: 1.0, heavy: 1.1, fortified: 0.95 },
  siege: { light: 0.8, medium: 1.0, heavy: 1.2, fortified: 1.6 },
};

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
  tx: number;
  ty: number;
}

export class World {
  scene: Phaser.Scene;
  map: GeneratedMap;
  pathfinder: Pathfinder;
  fx: FxSystem;

  units: Unit[] = [];
  buildings: Building[] = [];
  resources: ResourceNode[] = [];

  hashUnits = new SpatialHash<Unit>();
  hashBuildings = new SpatialHash<Building>();
  private byId = new Map<number, Unit | Building | ResourceNode>();

  wallet: Record<ResourceId, number> = { gold: 0, wood: 0, mana: 0 };
  popUsed = 0;
  popMax = CFG.POP_BASE;
  elapsed = 0;
  hero: Hero | null = null;
  private unitSeq = 0;

  /** Cached list rebuilt each frame for combat / AI loops. */
  enemyUnitsCache: Unit[] = [];

  /** Wired by the battle scene: kill notifications (XP, objectives, audio). */
  onKilled: ((entity: Unit | Building, killerTeam: number) => void) | null = null;

  constructor(scene: Phaser.Scene, map: GeneratedMap, fx: FxSystem) {
    this.scene = scene;
    this.map = map;
    this.fx = fx;
    this.pathfinder = new Pathfinder(map);
  }

  // ────────────────────────── spawning ──────────────────────────

  private unitTextureKey(defId: string): string {
    return `u_${defId}`;
  }

  spawnUnit(defId: string, x: number, y: number, faction?: FactionId): Unit {
    const finalFaction = faction ?? (defId in HEROES ? FACTION.PLAYER : (getUnit(defId).faction as FactionId));
    let unit: Unit;
    if (defId in HEROES) {
      const h = new Hero(x, y, getHero(defId));
      h.faction = finalFaction as any;
      h.team = finalFaction === FACTION.PLAYER ? 1 : finalFaction === FACTION.NEUTRAL ? 3 : 2;
      this.hero = h;
      unit = h;
    } else {
      const def = getUnit(defId);
      unit = new Unit(x, y, def);
      unit.faction = finalFaction as any;
      unit.team = finalFaction === FACTION.PLAYER ? 1 : finalFaction === FACTION.NEUTRAL ? 3 : 2;
    }
    const key = this.unitTextureKey(defId);
    if (!this.scene.textures.exists(key)) {
      throw new Error(`[world] missing unit texture: ${key}`);
    }
    const meta = metaOf(key);
    unit.sprite = this.scene.add
      .image(x, y, key)
      .setOrigin(0.5, meta.sy)
      .setScale(meta.sx)
      .setDepth(DEPTH.ENTITY + y * 0.01);
    unit.homeX = x;
    unit.homeY = y;
    unit.facing = 1;
    this.units.push(unit);
    this.byId.set(unit.id, unit);
    this.unitSeq++;
    return unit;
  }

  spawnBuilding(defId: string, x: number, y: number, faction?: FactionId, complete = true): Building {
    const def = getBuilding(defId);
    const finalFaction = faction ?? (def.faction as FactionId);
    const b = new Building(x, y, def, finalFaction);
    b.construction = complete ? 1 : 0.02;
    b.building = !complete;
    const key = `b_${def.id}`;
    const meta = metaOf(key);
    b.sprite = this.scene.add
      .image(x, y, key)
      .setOrigin(0.5, meta.sy)
      .setScale(meta.sx)
      .setDepth(DEPTH.ENTITY + y * 0.01);
    b.rallyX = x + 70;
    b.rallyY = y + 50;
    this.buildings.push(b);
    this.byId.set(b.id, b);
    this.occupyFootprint(b, true);
    this.recomputePop();
    return b;
  }

  spawnResource(kind: 'gold' | 'wood' | 'mana', x: number, y: number, amount: number): ResourceNode {
    const rate = kind === 'gold' ? 0.85 : kind === 'wood' ? 1.05 : 0;
    const node = new ResourceNode(x, y, kind, amount, rate);
    const key = kind === 'gold' ? 'res_gold' : kind === 'wood' ? 'terrain_tree_1' : 'res_mana';
    const meta = metaOf(key);
    node.sprite = this.scene.add
      .image(x, y, key)
      .setOrigin(0.5, meta.sy)
      .setScale(meta.sx * (kind === 'wood' ? 1.15 : 1))
      .setDepth(DEPTH.ENTITY + y * 0.01);
    if (kind === 'wood') node.sprite.setTint(0xbfe08a);
    this.resources.push(node);
    this.byId.set(node.id, node);
    return node;
  }

  entityById(id: number): Unit | Building | ResourceNode | undefined {
    return this.byId.get(id);
  }

  // ────────────────────────── footprint / placement ──────────────────────────

  occupyFootprint(b: Building, blocked: boolean): void {
    const { tx, ty } = worldToTile(b.x, b.y);
    const fp = b.def.footprint;
    const x0 = tx - Math.floor(fp.w / 2);
    const y0 = ty - Math.floor(fp.h / 2);
    b.blocked.length = 0;
    for (let y = y0; y < y0 + fp.h; y++) {
      for (let x = x0; x < x0 + fp.w; x++) {
        b.blocked.push({ tx: x, ty: y });
        this.pathfinder.setBlocked(x, y, blocked);
      }
    }
  }

  canPlaceBuilding(def: BuildingDef, wx: number, wy: number, ignore?: Building): PlacementCheck {
    const { tx, ty } = worldToTile(wx, wy);
    const fp = def.footprint;
    const x0 = tx - Math.floor(fp.w / 2);
    const y0 = ty - Math.floor(fp.h / 2);
    for (let y = y0; y < y0 + fp.h; y++) {
      for (let x = x0; x < x0 + fp.w; x++) {
        if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return { ok: false, reason: '超出地图范围', tx, ty };
        const t = tileAt(this.map, x, y);
        if (!BUILDABLE_TILE[t]) return { ok: false, reason: '地面无法建造', tx, ty };
        // blocking entities (also checks the movement grid for other buildings)
        for (const b of this.buildings) {
          if (b === ignore || b.dead) continue;
          if (b.blocked.some((p) => p.tx === x && p.ty === y)) return { ok: false, reason: '与其他建筑重叠', tx, ty };
        }
        for (const r of this.resources) {
          if (r.dead) continue;
          const rt = worldToTile(r.x, r.y);
          if (Math.abs(rt.tx - x) <= 1 && Math.abs(rt.ty - y) <= 1) return { ok: false, reason: '离资源点太近', tx, ty };
        }
      }
    }
    // must be reachable from the castle side: check at least 4 passable neighbours
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < this.map.w && ny < this.map.h && isWalkable(this.map, nx, ny)) {
        if (!this.buildings.some((b) => !b.dead && b.blocked.some((p) => p.tx === nx && p.ty === ny))) open++;
      }
    }
    if (open === 0) return { ok: false, reason: '没有出入口', tx, ty };
    return { ok: true, tx, ty };
  }

  // ────────────────────────── economy ──────────────────────────

  addResource(kind: ResourceId, amount: number): void {
    this.wallet[kind] = Math.max(0, this.wallet[kind] + amount);
  }

  canAfford(cost: { gold?: number; wood?: number; mana?: number }): boolean {
    return (cost.gold ?? 0) <= this.wallet.gold && (cost.wood ?? 0) <= this.wallet.wood && (cost.mana ?? 0) <= this.wallet.mana;
  }

  spend(cost: { gold?: number; wood?: number; mana?: number }): void {
    this.wallet.gold -= cost.gold ?? 0;
    this.wallet.wood -= cost.wood ?? 0;
    this.wallet.mana -= cost.mana ?? 0;
  }

  recomputePop(): void {
    let max = CFG.POP_BASE;
    let used = 0;
    for (const b of this.buildings) {
      if (b.dead || b.team !== 1) continue;
      if (b.def.popProvided) max += b.def.popProvided;
    }
    for (const u of this.units) {
      if (u.dead || u.team !== 1 || u.isHero) continue;
      used += u.def.pop;
    }
    this.popMax = Math.min(CFG.POP_MAX, max);
    this.popUsed = used;
  }

  // ────────────────────────── queries ──────────────────────────

  enemiesNear(x: number, y: number, radius: number, team: number, out?: Unit[]): Unit[] {
    const res = out ?? [];
    if (!out) res.length = 0;
    else res.length = 0;
    this.hashUnits.forEachNear(x, y, radius, (u) => {
      if (u.dead || u.team === team || u.team === 3) return;
      if (Math.hypot(u.x - x, u.y - y) <= radius + u.radius) res.push(u);
    });
    return res;
  }

  alliesNear(x: number, y: number, radius: number, team: number, out?: Unit[]): Unit[] {
    const res = out ?? [];
    res.length = 0;
    this.hashUnits.forEachNear(x, y, radius, (u) => {
      if (u.dead || u.team !== team) return;
      if (Math.hypot(u.x - x, u.y - y) <= radius + u.radius) res.push(u);
    });
    return res;
  }

  buildingsNear(x: number, y: number, radius: number, team: number, out?: Building[]): Building[] {
    const res = out ?? [];
    res.length = 0;
    this.hashBuildings.forEachNear(x, y, radius, (b) => {
      if (b.dead || b.team === team || b.team === 3) return;
      if (Math.hypot(b.x - x, b.y - y) <= radius + b.radius) res.push(b);
    });
    return res;
  }

  nearestEnemy(x: number, y: number, radius: number, team: number, filter?: (u: Unit) => boolean): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    this.hashUnits.forEachNear(x, y, radius, (u) => {
      if (u.dead || u.team === team || u.team === 3) return;
      if (filter && !filter(u)) return;
      const d = (u.x - x) ** 2 + (u.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    });
    return best;
  }

  nearestEnemyBuilding(x: number, y: number, radius: number, team: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    this.hashBuildings.forEachNear(x, y, radius, (b) => {
      if (b.dead || b.team === team || b.team === 3) return;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    });
    return best;
  }

  nearestDepot(x: number, y: number, team: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.team !== team || !b.def.depot || b.building) continue;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  nearestResource(kind: 'gold' | 'wood' | 'mana', x: number, y: number): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestD = Infinity;
    for (const r of this.resources) {
      if (r.dead || r.depleted || r.resourceKind !== kind) continue;
      const d = (r.x - x) ** 2 + (r.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  nearestFriendlyBuilding(x: number, y: number, team: number, radius = 1e9): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.team !== team) continue;
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bestD && d <= radius * radius) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  // ────────────────────────── damage / death ──────────────────────────

  damage(target: Building | Unit, amount: number, type: 'physical' | 'magic' | 'siege', sourceTeam: number, crit = false): number {
    if (target.dead) return 0;
    const armor = target.kind === 'building' ? (target as Building).armor : (target as Unit).armorTotal;
    const armorType = target.kind === 'building' ? (target as Building).def.armorType : (target as Unit).def.armorType;
    const reduction = armor / (armor + CFG.ARMOR_CONST);
    const typeMul = ARMOR_MATRIX[type]?.[armorType] ?? 1;
    const dealt = Math.max(1, amount * (1 - reduction) * typeMul);
    target.hp -= dealt;
    target.flash = 0.09;
    if (target.kind === 'building') (target as Building).damageFlash = 0.09;
    if (target.hp <= 0) {
      target.hp = 0;
      if (target.kind === 'building') this.killBuilding(target as Building, sourceTeam);
      else this.killUnit(target as Unit, sourceTeam);
    }
    void crit;
    return dealt;
  }

  heal(target: Unit | Building, amount: number): void {
    if (target.dead) return;
    target.hp = Math.min(target.maxHp, target.hp + amount);
  }

  killUnit(unit: Unit, killerTeam: number): void {
    if (unit.dead) return;
    if (unit.isHero) {
      const hero = unit as Hero;
      hero.hp = 0;
      hero.respawning = true;
      hero.respawnTimer = CFG.HERO_RESPAWN_MS / 1000;
      hero.dead = true;
      hero.clearOrders();
      hero.sprite?.setVisible(false);
      hero.sprite?.setActive(false);
      this.fx.death(hero.x, hero.y, `u_${hero.heroDef.id}`, 1);
      this.onKilled?.(hero, killerTeam);
      return;
    }
    unit.dead = true;
    unit.setState('dead');
    this.fx.death(unit.x, unit.y, `u_${unit.def.id}`, metaOf(`u_${unit.def.id}`).sx * 1.05);
    unit.sprite?.destroy();
    unit.sprite = null;
    this.byId.delete(unit.id);
    const idx = this.units.indexOf(unit);
    if (idx >= 0) this.units.splice(idx, 1);
    this.recomputePop();
    this.onKilled?.(unit, killerTeam);
  }

  killBuilding(b: Building, killerTeam: number): void {
    if (b.dead) return;
    b.dead = true;
    this.occupyFootprint(b, false);
    this.fx.explosion(b.x, b.y, b.radius * 1.6, false);
    this.fx.death(b.x, b.y, `b_${b.def.id}`, metaOf(`b_${b.def.id}`).sx * 0.8);
    b.sprite?.destroy();
    b.sprite = null;
    this.byId.delete(b.id);
    const idx = this.buildings.indexOf(b);
    if (idx >= 0) this.buildings.splice(idx, 1);
    this.recomputePop();
    this.onKilled?.(b, killerTeam);
  }

  /** Hero XP: shared with the hero if it is close to the kill. */
  grantXp(amount: number, x: number, y: number): void {
    const hero = this.hero;
    if (!hero || hero.respawning || hero.dead) return;
    if (Math.hypot(hero.x - x, hero.y - y) > CFG.HERO_XP_SHARE_RADIUS) return;
    hero.xp += amount;
    this.fx.damageText(x, y - 8, amount, 'xp');
  }

  // ────────────────────────── frame ──────────────────────────

  update(dt: number): void {
    this.elapsed += dt;
    this.hashUnits.rebuild(this.units);
    this.hashBuildings.rebuild(this.buildings);
    for (const u of this.units) u.updateSprite(dt);
    for (const b of this.buildings) b.updateSprite(dt);
    for (const r of this.resources) r.updateSprite(0);
  }

  /** Removes depleted nodes. Called once per second (not per frame). */
  cullDepleted(): void {
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const r = this.resources[i];
      if (r.dead || r.depleted) {
        if (r.depleted && !r.dead) this.fx.death(r.x, r.y, r.resourceKind === 'wood' ? 'terrain_tree_1' : 'res_gold', 1);
        r.dead = true;
        r.sprite?.destroy();
        r.sprite = null;
        this.byId.delete(r.id);
        this.resources.splice(i, 1);
      }
    }
  }

  unitDefOf(unit: Unit): UnitDef {
    return unit.def;
  }

  countUnits(team: number, filter?: (u: Unit) => boolean): number {
    let n = 0;
    for (const u of this.units) {
      if (u.dead || u.team !== team) continue;
      if (filter && !filter(u)) continue;
      n++;
    }
    return n;
  }

  countBuildings(team: number, defId?: string): number {
    let n = 0;
    for (const b of this.buildings) {
      if (b.dead || b.team !== team) continue;
      if (defId && b.def.id !== defId) continue;
      n++;
    }
    return n;
  }

  get friendlyUnits(): Unit[] {
    return this.units.filter((u) => u.team === 1);
  }

  spawnEnemyUnit(defId: string, x: number, y: number, faction: FactionId = FACTION.WILDBORN): Unit {
    return this.spawnUnit(defId, x, y, faction);
  }

  isUnitDef(id: string): boolean {
    return id in UNITS;
  }

  /** Enemies the AI should consider "the threat" (player units + buildings). */
  get threatUnits(): Unit[] {
    this.enemyUnitsCache.length = 0;
    for (const u of this.units) if (u.team === 1) this.enemyUnitsCache.push(u);
    return this.enemyUnitsCache;
  }

  dispose(): void {
    for (const u of this.units) u.sprite?.destroy();
    for (const b of this.buildings) b.sprite?.destroy();
    for (const r of this.resources) r.sprite?.destroy();
    this.units.length = 0;
    this.buildings.length = 0;
    this.resources.length = 0;
    this.byId.clear();
    this.hashUnits.clear();
    this.hashBuildings.clear();
  }

  /** Terrain tile under a world position, used by the selection cursor. */
  tileUnder(x: number, y: number): number {
    const { tx, ty } = worldToTile(x, y);
    return tileAt(this.map, tx, ty);
  }

  get buildable(): (x: number, y: number) => boolean {
    return (x: number, y: number) => {
      const { tx, ty } = worldToTile(x, y);
      return BUILDABLE_TILE[tileAt(this.map, tx, ty)] && this.pathfinder.isFree(tx, ty);
    };
  }

  static readonly TILE = TILE;
}
