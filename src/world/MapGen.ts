import { MAP_H, MAP_W, TILE, Tile } from '../config/Constants';
import { Rng } from '../core/Rng';

export interface CampSpec { x: number; y: number; kind: 'wildborn' | 'voidborn'; strength: number }
export interface NodeSpec { kind: 'gold' | 'wood' | 'mana'; x: number; y: number; amount: number }
export interface MonsterSpec { unitId: string; x: number; y: number }

export interface GeneratedMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  playerStart: { x: number; y: number };
  landings: Array<{ x: number; y: number }>;
  goldMines: NodeSpec[];
  woodGroves: NodeSpec[];
  manaShrines: NodeSpec[];
  camps: CampSpec[];
  monsters: MonsterSpec[];
  searchPoints: Array<{ x: number; y: number; name: string }>;
}

export function tileAt(map: GeneratedMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return Tile.ROCK;
  return map.tiles[ty * map.w + tx];
}

export function setTile(map: GeneratedMap, tx: number, ty: number, v: number): void {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
  map.tiles[ty * map.w + tx] = v;
}

export function isWalkable(map: GeneratedMap, tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty);
  return t !== Tile.TREE && t !== Tile.ROCK && t !== Tile.WATER;
}

export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

interface GenOptions {
  seed: number;
  biome: 'valley' | 'forest' | 'fortress';
  playerStart: { tx: number; ty: number };
  camps: CampSpec[];
  /** Optional hand-authored resource + monster layout, in tiles. */
  goldMines: Array<{ x: number; y: number; amount: number }>;
  groves: Array<{ x: number; y: number; amount: number }>;
  shrines: Array<{ x: number; y: number }>;
  monsters: MonsterSpec[];
  searchPoints: Array<{ x: number; y: number; name: string }>;
  riverX: number;
  bridgeYs: number[];
}

/**
 * Deterministic map builder. Layout rules are shared by all biomes; the biome only
 * changes density and palette so new maps stay cheap to author.
 */
export function generateMap(opt: GenOptions): GeneratedMap {
  const rng = new Rng(opt.seed);
  const map: GeneratedMap = {
    w: MAP_W,
    h: MAP_H,
    tiles: new Uint8Array(MAP_W * MAP_H).fill(Tile.GRASS),
    playerStart: tileToWorld(opt.playerStart.tx, opt.playerStart.ty),
    landings: [],
    goldMines: opt.goldMines.map((g) => ({ kind: 'gold' as const, ...tileToWorld(g.x, g.y), amount: g.amount })),
    woodGroves: opt.groves.map((g) => ({ kind: 'wood' as const, ...tileToWorld(g.x, g.y), amount: g.amount })),
    manaShrines: opt.shrines.map((s) => ({ kind: 'mana' as const, ...tileToWorld(s.x, s.y), amount: 0 })),
    camps: opt.camps,
    monsters: opt.monsters.map((m) => ({ unitId: m.unitId, ...tileToWorld(m.x, m.y) })),
    searchPoints: opt.searchPoints,
  };

  const forestDensity = opt.biome === 'forest' ? 0.72 : opt.biome === 'valley' ? 0.55 : 0.42;

  // 1. organic terrain speckle so the ground is not a flat colour field
  const dirtPatches = opt.biome === 'fortress' ? 46 : 22;
  for (let i = 0; i < dirtPatches; i++) {
    const cx = rng.int(2, MAP_W - 3);
    const cy = rng.int(2, MAP_H - 3);
    const r = rng.range(1.6, 4.4);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && tileAt(map, x, y) === Tile.GRASS) {
          setTile(map, x, y, rng.chance(0.55) ? Tile.DIRT : Tile.GRASS);
        }
      }
    }
  }

  // 2. river + bridges (splits the map so crossings matter)
  const riverPts: Array<{ x: number; r: number }> = [];
  let rx = opt.riverX;
  for (let y = 0; y < MAP_H; y++) {
    rx += rng.range(-0.35, 0.35);
    riverPts.push({ x: Math.round(rx), r: y < 6 || y > MAP_H - 8 ? 2 : rng.range(1.2, 2.1) });
  }
  for (let y = 0; y < MAP_H; y++) {
    const p = riverPts[y];
    for (let dx = -Math.ceil(p.r); dx <= Math.ceil(p.r); dx++) {
      const x = p.x + dx;
      const d = Math.abs(dx) / (p.r + 0.35);
      if (d <= 1) setTile(map, x, y, Tile.WATER);
    }
  }
  for (const by of opt.bridgeYs) {
    const p = riverPts[by];
    for (let y = by - 1; y <= by + 1; y++) {
      const pp = riverPts[y] ?? p;
      for (let dx = -3; dx <= 3; dx++) {
        const x = pp.x + dx;
        if (tileAt(map, x, y) === Tile.WATER) setTile(map, x, y, Tile.BRIDGE);
      }
    }
    for (let y = by - 2; y <= by + 2; y++) {
      const pp = riverPts[y] ?? p;
      for (let dx = -4; dx <= 4; dx++) {
        const x = pp.x + dx;
        if (tileAt(map, x, y) === Tile.GRASS) setTile(map, x, y, Tile.ROAD);
      }
    }
    map.landings.push(tileToWorld(p.x - 5, by));
    map.landings.push(tileToWorld(p.x + 5, by));
  }

  // 3. forest clusters (blocked tiles) + rocky ridges
  const clusters = Math.round(30 * forestDensity);
  for (let i = 0; i < clusters; i++) {
    const cx = rng.int(2, MAP_W - 3);
    const cy = rng.int(2, MAP_H - 3);
    const r = rng.range(1.6, 3.8);
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        if (!isWalkable(map, x, y)) continue;
        if (rng.chance(1 - d / (r + 0.6))) setTile(map, x, y, Tile.TREE);
      }
    }
  }
  const ridges = opt.biome === 'fortress' ? 16 : 7;
  for (let i = 0; i < ridges; i++) {
    const cx = rng.int(2, MAP_W - 3);
    const cy = rng.int(2, MAP_H - 3);
    for (let k = 0; k < rng.int(3, 9); k++) {
      const x = cx + rng.int(-2, 2);
      const y = cy + rng.int(-3, 3);
      if (isWalkable(map, x, y)) setTile(map, x, y, Tile.ROCK);
    }
  }

  // 4. clear the playable pockets (base, camps, resource nodes, bridges, paths)
  const clear = (cx: number, cy: number, rx: number, ry: number, to: number) => {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (tileAt(map, x, y) === Tile.WATER) continue;
        setTile(map, x, y, to);
      }
    }
  };
  clear(opt.playerStart.tx, opt.playerStart.ty, 7, 7, Tile.GRASS);
  for (const c of opt.camps) clear(c.x, c.y, 6, 6, Tile.DIRT);
  for (const g of opt.goldMines) clear(g.x, g.y, 2, 2, Tile.DIRT);
  for (const g of opt.groves) {
    // groves keep trees around them, only the centre is walkable
    for (let y = g.y - 1; y <= g.y + 1; y++) {
      for (let x = g.x - 1; x <= g.x + 1; x++) {
        if (isWalkable(map, x, y)) setTile(map, x, y, Tile.GRASS);
      }
    }
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const x = Math.round(g.x + Math.cos(ang) * 3);
      const y = Math.round(g.y + Math.sin(ang) * 3);
      if (isWalkable(map, x, y) && rng.chance(0.75)) setTile(map, x, y, Tile.TREE);
    }
  }
  for (const s of opt.shrines) clear(s.x, s.y, 3, 3, Tile.GRASS);
  for (const sp of opt.searchPoints) clear(sp.x, sp.y, 3, 3, Tile.GRASS);

  // 5. carve dirt roads from the player base to every objective (readability + speed)
  const carveRoad = (from: { tx: number; ty: number }, to: { tx: number; ty: number }) => {
    let x = from.tx;
    let y = from.ty;
    let guard = 0;
    while ((Math.abs(x - to.tx) > 1 || Math.abs(y - to.ty) > 1) && guard++ < 400) {
      if (tileAt(map, x, y) === Tile.GRASS || tileAt(map, x, y) === Tile.DIRT) setTile(map, x, y, Tile.ROAD);
      const dx = Math.sign(to.tx - x);
      const dy = Math.sign(to.ty - y);
      if (Math.abs(to.tx - x) > Math.abs(to.ty - y)) x += dx;
      else y += dy;
      if (tileAt(map, x, y) === Tile.TREE || tileAt(map, x, y) === Tile.ROCK) setTile(map, x, y, Tile.GRASS);
      if (guard % 9 === 0) {
        if (Math.abs(to.tx - x) > Math.abs(to.ty - y)) y += rng.chance(0.5) ? 1 : -1;
        else x += rng.chance(0.5) ? 1 : -1;
      }
    }
  };
  carveRoad(opt.playerStart, { tx: opt.goldMines[0]?.x ?? 20, ty: opt.goldMines[0]?.y ?? 20 });
  for (const c of opt.camps) carveRoad(opt.playerStart, { tx: c.x, ty: c.y });
  for (const g of opt.groves) carveRoad(opt.playerStart, { tx: g.x, ty: g.y });

  // 6. never allow a fully walled-off pocket: re-open any isolated walkable tile next to a blocker
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (tileAt(map, x, y) !== Tile.TREE) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkable(map, x + dx, y + dy));
      if (!open && rng.chance(0.4)) setTile(map, x, y, Tile.GRASS);
    }
  }

  // 7. guarantee the start pocket has a walkable ring for placement
  clear(opt.playerStart.tx, opt.playerStart.ty, 8, 8, Tile.GRASS);
  for (let y = opt.playerStart.ty - 8; y <= opt.playerStart.ty + 8; y++) {
    for (let x = opt.playerStart.tx - 8; x <= opt.playerStart.tx + 8; x++) {
      if (tileAt(map, x, y) === Tile.WATER) setTile(map, x, y, Tile.GRASS);
    }
  }

  return map;
}

/** Phase-1 layout: Green Valley. */
export function buildGreenValley(): GeneratedMap {
  return generateMap({
    seed: 20260922,
    biome: 'valley',
    playerStart: { tx: 11, ty: 12 },
    camps: [
      { x: 54, y: 20, kind: 'wildborn', strength: 2 },
      { x: 50, y: 52, kind: 'wildborn', strength: 4 },
    ],
    goldMines: [
      { x: 17, y: 7, amount: 2600 },
      { x: 6, y: 22, amount: 2600 },
      { x: 46, y: 32, amount: 3200 },
      { x: 58, y: 44, amount: 3200 },
      { x: 56, y: 14, amount: 2600 },
    ],
    groves: [
      { x: 8, y: 6, amount: 2400 },
      { x: 20, y: 22, amount: 2400 },
      { x: 30, y: 8, amount: 2000 },
      { x: 44, y: 24, amount: 2200 },
      { x: 60, y: 30, amount: 2200 },
      { x: 30, y: 44, amount: 2200 },
      { x: 14, y: 40, amount: 2200 },
    ],
    shrines: [{ x: 34, y: 34 }],
    monsters: [
      { unitId: 'direwolf', x: 26, y: 30 },
      { unitId: 'direwolf', x: 28, y: 33 },
      { unitId: 'direwolf', x: 24, y: 34 },
      { unitId: 'direwolf', x: 44, y: 30 },
      { unitId: 'direwolf', x: 46, y: 27 },
      { unitId: 'shaman', x: 42, y: 40 },
      { unitId: 'raider', x: 43, y: 42 },
    ],
    searchPoints: [{ x: 20, y: 46, name: 'ancient-standing-stones' }],
    riverX: 36,
    bridgeYs: [18, 46],
  });
}
