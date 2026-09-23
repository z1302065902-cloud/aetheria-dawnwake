import Phaser from 'phaser';
import { TILE, Tile } from '../config/Constants';
import { PAL } from '../art/Palette';
import type { GeneratedMap } from '../world/MapGen';
import { tileAt } from '../world/MapGen';

function css(color: number, a = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/**
 * Bakes the whole tilemap into ONE canvas texture: the terrain is a single draw call
 * no matter how big the map is (this is the main reason the frame budget is stable).
 */
export function paintTerrain(scene: Phaser.Scene, map: GeneratedMap, key = 'terrain'): string {
  const w = map.w * TILE;
  const h = map.h * TILE;
  // reuse an existing texture of the same size (destroying it invalidates live frames)
  const existing = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  const canvasTex = existing && existing.source[0] && existing.source[0].width === w && existing.source[0].height === h
    ? existing
    : (() => {
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const t = scene.textures.createCanvas(key, w, h);
        if (!t) throw new Error('[terrain] failed to create canvas texture');
        return t;
      })();
  const c = canvasTex.getContext();

  // base fill
  c.fillStyle = css(PAL.grassA);
  c.fillRect(0, 0, w, h);

  // grass variation: per-tile tint + speckles (deterministic, no RNG needed)
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = tileAt(map, tx, ty);
      const x = tx * TILE;
      const y = ty * TILE;
      const noise = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      const n = (noise % 1000) / 1000;
      if (t === Tile.GRASS) {
        c.fillStyle = css(n > 0.62 ? PAL.grassB : n > 0.3 ? PAL.grassA : PAL.grassC);
        c.fillRect(x, y, TILE, TILE);
        if (n > 0.9) {
          c.fillStyle = css(0x6fae52, 0.55);
          c.fillRect(x + 5 + (noise % 9), y + 6 + ((noise >> 5) % 11), 3, 2);
          c.fillRect(x + 16 + ((noise >> 3) % 8), y + 19 + ((noise >> 7) % 6), 2, 3);
        }
      } else if (t === Tile.DIRT) {
        c.fillStyle = css(PAL.dirt);
        c.fillRect(x, y, TILE, TILE);
        c.fillStyle = css(0x7a6440, 0.6);
        c.fillRect(x + 4, y + 7, 4, 3);
        c.fillRect(x + 18, y + 20, 5, 3);
      } else if (t === Tile.ROAD) {
        c.fillStyle = css(PAL.road);
        c.fillRect(x, y, TILE, TILE);
        c.fillStyle = css(0x7d6c4a, 0.5);
        c.fillRect(x + 3, y + 9, 8, 3);
        c.fillRect(x + 14, y + 21, 9, 3);
      } else if (t === Tile.WATER) {
        const deep = n > 0.5;
        c.fillStyle = css(deep ? PAL.waterDeep : PAL.water);
        c.fillRect(x, y, TILE, TILE);
      } else if (t === Tile.BRIDGE) {
        c.fillStyle = css(PAL.bridge);
        c.fillRect(x, y, TILE, TILE);
        c.fillStyle = css(0x6f5230, 0.85);
        for (let i = 0; i < 4; i++) c.fillRect(x + 1, y + 3 + i * 8, TILE - 2, 3);
      } else if (t === Tile.TREE) {
        c.fillStyle = css(PAL.grassC);
        c.fillRect(x, y, TILE, TILE);
      } else if (t === Tile.ROCK) {
        c.fillStyle = css(0x6b6257);
        c.fillRect(x, y, TILE, TILE);
      }
    }
  }

  // water shading pass (shoreline + moving-looking highlights)
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (tileAt(map, tx, ty) !== Tile.WATER) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const shore =
        tileAt(map, tx + 1, ty) !== Tile.WATER ||
        tileAt(map, tx - 1, ty) !== Tile.WATER ||
        tileAt(map, tx, ty + 1) !== Tile.WATER ||
        tileAt(map, tx, ty - 1) !== Tile.WATER;
      if (shore) {
        c.fillStyle = 'rgba(140,200,225,0.22)';
        c.fillRect(x, y, TILE, TILE);
      }
      c.strokeStyle = 'rgba(190,235,255,0.16)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + 4, y + 12);
      c.quadraticCurveTo(x + 16, y + 8, x + 28, y + 13);
      c.stroke();
    }
  }

  // Trees/rocks are NO LONGER baked: they are sprites now so they can sway (EnvironmentSystem).
  canvasTex.refresh();
  return key;
}

/** Small version of the terrain for the minimap, painted once at boot. */
export function paintMinimapBase(scene: Phaser.Scene, map: GeneratedMap): string {
  const key = 'minimapBase';
  const scale = 3;
  const w = map.w * scale;
  const h = map.h * scale;
  const existing = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  const canvasTex = existing && existing.source[0] && existing.source[0].width === w && existing.source[0].height === h
    ? existing
    : (() => {
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const t = scene.textures.createCanvas(key, w, h);
        if (!t) throw new Error('[terrain] failed to create minimap texture');
        return t;
      })();
  const c = canvasTex.getContext();
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = tileAt(map, tx, ty);
      let col = PAL.grassA;
      if (t === Tile.WATER) col = PAL.water;
      else if (t === Tile.TREE) col = 0x2f4a28;
      else if (t === Tile.ROCK) col = 0x6b6257;
      else if (t === Tile.BRIDGE) col = PAL.bridge;
      else if (t === Tile.ROAD) col = PAL.road;
      else if (t === Tile.DIRT) col = PAL.dirt;
      c.fillStyle = css(col);
      c.fillRect(tx * scale, ty * scale, scale, scale);
    }
  }
  canvasTex.refresh();
  return key;
}
