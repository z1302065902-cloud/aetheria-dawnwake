import { TILE, FACTION } from '../config/Constants';
import type { World } from './World';
import type { Building } from './Building';
import { tileToWorld } from './MapGen';
import type { MissionDef } from '../data/types';

export interface MatchSetupResult {
  castle: Building;
  shrine: Building | null;
  enemyBuildings: Building[];
}

/** Places the starting base, resources, neutral camps and the enemy encampments. */
export function setupMatch(world: World, mission: MissionDef): MatchSetupResult {
  // ── resources ──
  for (const g of world.map.goldMines) world.spawnResource('gold', g.x, g.y, g.amount);
  for (const w of world.map.woodGroves) world.spawnResource('wood', w.x, w.y, w.amount);
  for (const s of world.map.manaShrines) world.spawnResource('mana', s.x, s.y, 0);

  // ── mana shrine structure (capturable) ──
  const shrineWorld = world.map.manaShrines[0];
  const shrine = shrineWorld ? world.spawnBuilding('neutral_shrine', shrineWorld.x, shrineWorld.y, FACTION.NEUTRAL) : null;

  // ── player base ──
  const start = world.map.playerStart;
  const castle = world.spawnBuilding('castle', start.x, start.y, FACTION.PLAYER);
  const spawnAround = (defId: string, count: number, radius: number): void => {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + 0.6;
      const x = castle.x + Math.cos(ang) * radius;
      const y = castle.y + Math.sin(ang) * radius;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const free = world.pathfinder.nearestFree(tx, ty, 6);
      if (!free) continue;
      const p = tileToWorld(free.tx, free.ty);
      world.spawnUnit(defId, p.x, p.y, FACTION.PLAYER);
    }
  };
  spawnAround('settler', 4, 78);

  // ── neutral wildlife in the middle of the map ──
  for (const m of world.map.monsters) {
    const u = world.spawnUnit(m.unitId, m.x, m.y, FACTION.NEUTRAL);
    u.team = 3;
    u.aiState = 'patrol';
    u.patrolPoint = { x: m.x + (Math.random() - 0.5) * 200, y: m.y + (Math.random() - 0.5) * 200 };
  }

  // ── enemy encampments ──
  const enemyBuildings: Building[] = [];
  for (const camp of world.map.camps) {
    const cx = camp.x * TILE + TILE / 2;
    const cy = camp.y * TILE + TILE / 2;
    const faction = camp.kind as any;
    const main = world.spawnBuilding('wb_camp', cx, cy, faction);
    enemyBuildings.push(main);
    const layout: Array<[string, number, number]> = [
      ['wb_tent', -130, -80],
      ['wb_tent', 120, -95],
      ['wb_totem', -105, 100],
      ['wb_pen', 115, 105],
    ];
    for (const [def, ox, oy] of layout) {
      const tx = Math.floor((cx + ox) / TILE);
      const ty = Math.floor((cy + oy) / TILE);
      const free = world.pathfinder.nearestFree(tx, ty, 6);
      if (!free) continue;
      const p = tileToWorld(free.tx, free.ty);
      const b = world.spawnBuilding(def, p.x, p.y, faction);
      enemyBuildings.push(b);
    }
    if (camp.strength >= 5) {
      const b = world.spawnBuilding('vb_altar', cx - 190, cy + 40, FACTION.VOIDBORN as any);
      enemyBuildings.push(b);
    }
  }

  world.wallet.gold = mission.startResources.gold ?? 0;
  world.wallet.wood = mission.startResources.wood ?? 0;
  world.wallet.mana = mission.startResources.mana ?? 0;
  world.recomputePop();

  return { castle, shrine, enemyBuildings };
}
