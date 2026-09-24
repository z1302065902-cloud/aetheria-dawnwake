import Phaser from 'phaser';
import { TILE, Tile } from '../config/Constants';
import { PAL } from '../art/Palette';
import { REGION, shade, toCss } from '../art/VisualBible';
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
export function paintTerrain(
  scene: Phaser.Scene,
  map: GeneratedMap,
  key = 'terrain',
  region: keyof typeof REGION = 'valley',
): string {
  // Visual Bible §4: every map is painted with its own region palette. Without this all ten
  // missions looked like the same green valley no matter what the biome claimed to be.
  const R = REGION[region] ?? REGION.valley;
  const ground = R.ground;
  const groundAlt = R.groundAlt;
  const stone = R.stone;
  const canopy = shade(groundAlt, -0.14);
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
  c.fillStyle = css(ground);
  c.fillRect(0, 0, w, h);

  // ── ground: one base colour + a smooth noise field + scattered detail ──
  // The old version picked one of three grass shades per tile, which is exactly what made
  // the map read as a grid. Variation now comes from a low-frequency noise layer that does
  // not align with the tile grid, plus detail marks.
  const noiseCanvas = document.createElement('canvas');
  const NS = 48; // noise resolution (one sample per ~1.5 tiles)
  noiseCanvas.width = NS;
  noiseCanvas.height = NS;
  const nctx = noiseCanvas.getContext('2d');
  if (nctx) {
    const img = nctx.createImageData(NS, NS);
    for (let y = 0; y < NS; y++) {
      for (let x = 0; x < NS; x++) {
        // two octaves of value noise from a cheap hash
        const h = (ix: number, iy: number) => {
          const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
          return n - Math.floor(n);
        };
        const smooth = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
        const oct = (f: number) => {
          const fx = (x / NS) * f;
          const fy = (y / NS) * f;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          return smooth(smooth(h(x0, y0), h(x0 + 1, y0), tx), smooth(h(x0, y0 + 1), h(x0 + 1, y0 + 1), tx), ty);
        };
        const v = oct(4) * 0.6 + oct(9) * 0.4;
        const p = (y * NS + x) * 4;
        img.data[p] = 255;
        img.data[p + 1] = 255;
        img.data[p + 2] = 255;
        img.data[p + 3] = Math.round(v * 46); // subtle: max ~18% brightness shift
      }
    }
    nctx.putImageData(img, 0, 0);
    // paint terrain tiles first, then blend the noise over the walkable ground only
    c.save();
    c.globalCompositeOperation = 'soft-light';
    c.imageSmoothingEnabled = true;
    c.drawImage(noiseCanvas, 0, 0, w, h);
    c.restore();
  }

  // detail marks: grass tufts, small stones, flowers — deterministic, grid-free placement
  for (let i = 0; i < 2600; i++) {
    const h1 = Math.sin(i * 12.9898) * 43758.5453;
    const h2 = Math.sin(i * 78.233) * 43758.5453;
    const h3 = Math.sin(i * 39.425) * 43758.5453;
    const rx = h1 - Math.floor(h1);
    const ry = h2 - Math.floor(h2);
    const rz = h3 - Math.floor(h3);
    const px = Math.floor(rx * w);
    const py = Math.floor(ry * h);
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const tile = tileAt(map, tx, ty);
    if (tile !== Tile.GRASS && tile !== Tile.DIRT) continue;
    if (rz < 0.55) {
      // grass tuft
      c.save();
      c.strokeStyle =
        tile === Tile.GRASS
          ? toCss(shade(groundAlt, 0.18), 0.5)
          : toCss(shade(R.ground, 0.12), 0.45);
      c.lineWidth = 1.2;
      for (let k = -1; k <= 1; k++) {
        c.beginPath();
        c.moveTo(px + k * 1.8, py + 2);
        c.quadraticCurveTo(px + k * 2.6, py - 1, px + k * 3.2, py - 3.4);
        c.stroke();
      }
      c.restore();
    } else if (rz < 0.8) {
      // small stone
      c.save();
      c.fillStyle = toCss(shade(stone, -0.05), 0.5);
      c.beginPath();
      c.ellipse(px, py, 1.6 + rz * 2, 1.1 + rz, rz * 3, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (rz < 0.92 && tile === Tile.GRASS) {
      // tiny flower
      c.save();
      c.fillStyle = rz < 0.87 ? toCss(R.accent, 0.55) : toCss(shade(R.accent, 0.1), 0.5);
      c.beginPath();
      c.arc(px, py, 1.5, 0, Math.PI * 2);
      c.fill();
      c.restore();
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

/** Small version of the terrain for the minimap, painted once at boot (region-aware). */
export function paintMinimapBase(
  scene: Phaser.Scene,
  map: GeneratedMap,
  region: keyof typeof REGION = 'valley',
): string {
  const R = REGION[region] ?? REGION.valley;
  const ground = R.ground;
  const groundAlt = R.groundAlt;
  const stone = R.stone;
  const canopy = shade(groundAlt, -0.14);
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
      let col: number = ground;
      if (t === Tile.WATER) col = shade(PAL.water, (region === 'fortress' ? -0.06 : region === 'forest' ? -0.03 : 0));
      else if (t === Tile.TREE) col = canopy;
      else if (t === Tile.ROCK) col = stone;
      else if (t === Tile.BRIDGE) col = PAL.bridge;
      else if (t === Tile.ROAD) col = shade(R.groundAlt, 0.1);
      else if (t === Tile.DIRT) col = shade(R.ground, -0.12);
      c.fillStyle = css(col);
      c.fillRect(tx * scale, ty * scale, scale, scale);
    }
  }
  canvasTex.refresh();
  return key;
}
