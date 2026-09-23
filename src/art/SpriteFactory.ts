import Phaser from 'phaser';
import { PAL, shade } from './Palette';
import { layoutFor, posesFor, renderUnitStrip, type UnitSheetLayout } from './UnitRenderer';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { HEROES, SKILLS } from '../data/heroes';
import type { ArtSpec } from '../data/types';

/**
 * Procedural sprite factory. Every texture in the game is painted here with canvas
 * primitives at SUPERSAMPLE resolution, then registered as a Phaser texture.
 * `texScale()` returns the display scale that maps the texture back to world size.
 */
const SS = 2;
/** unit sheets are big (15 frames each) so they use a lighter supersample */
const UNIT_SS = 1.6;

export const TEXTURE_SCALE: Record<string, number> = {};

/** Per-texture display metadata: uniform scale back to world units + pivot. */
export interface TexMeta { sx: number; sy: number }
export const TEX_META: Record<string, TexMeta> = {};

function setMeta(key: string, sx: number, sy: number): void {
  TEX_META[key] = { sx, sy };
}

export function metaOf(key: string): TexMeta {
  return TEX_META[key] ?? { sx: 1, sy: 0.5 };
}

const CANVAS_TEX = new Map<string, Phaser.Textures.CanvasTexture>();

function ctx2d(scene: Phaser.Scene, key: string, w: number, h: number): CanvasRenderingContext2D {
  const pw = Math.ceil(w * SS);
  const ph = Math.ceil(h * SS);
  let t = CANVAS_TEX.get(key);
  // Reuse the texture when the size matches. Removing + recreating a texture invalidates
  // its frames, and any object still holding one crashes later with a null drawImage.
  if (t && (!t.source[0] || t.source[0].width !== pw || t.source[0].height !== ph)) {
    scene.textures.remove(key);
    t = undefined;
  }
  if (!t || !scene.textures.exists(key)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    t = scene.textures.createCanvas(key, pw, ph) ?? undefined;
    if (!t) throw new Error(`[art] failed to create canvas texture ${key}`);
    CANVAS_TEX.set(key, t);
  }
  TEXTURE_SCALE[key] = 1 / SS;
  const c = t.getContext();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, pw, ph);
  c.save();
  c.scale(SS, SS);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  return c;
}

function finish(scene: Phaser.Scene, key: string, c: CanvasRenderingContext2D): void {
  c.restore();
  const t = CANVAS_TEX.get(key) ?? (scene.textures.get(key) as Phaser.Textures.CanvasTexture);
  t.refresh();
}

export function texScale(key: string): number {
  return TEXTURE_SCALE[key] ?? 1;
}

// ─────────────────────────── drawing helpers ───────────────────────────

function css(color: number, a = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

function outline(c: CanvasRenderingContext2D, w = 2): void {
  c.save();
  c.lineWidth = w;
  c.strokeStyle = 'rgba(12,14,22,0.85)';
  c.stroke();
  c.restore();
}

// ─────────────────────────── units ───────────────────────────

function drawHumanoid(c: CanvasRenderingContext2D, cx: number, by: number, spec: ArtSpec, seed: number): void {
  const s = spec.scale;
  const bodyW = 13 * s;
  const bodyH = 16 * s;
  const headR = 5.4 * s;
  const b = spec.body;
  const t = spec.trim;
  const a = spec.accent;

  // ground shadow
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(cx, by - 1, bodyW * 0.78, bodyW * 0.42, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // mount (beast under the rider)
  if (spec.mount) {
    c.save();
    c.fillStyle = css(shade(t, -0.05));
    c.beginPath();
    c.ellipse(cx, by - 8 * s, 15 * s, 9.5 * s, 0, 0, Math.PI * 2);
    c.fill();
    outline(c, 1.6);
    c.restore();
    // legs
    c.save();
    c.strokeStyle = css(shade(t, -0.2));
    c.lineWidth = 2.4 * s;
    for (const dx of [-9, -4, 4, 9]) {
      c.beginPath();
      c.moveTo(cx + dx * s * 0.8, by - 8 * s);
      c.lineTo(cx + dx * s * 0.95, by + 3);
      c.stroke();
    }
    c.restore();
    // head
    c.save();
    c.fillStyle = css(shade(t, 0.06));
    c.beginPath();
    c.ellipse(cx + 13 * s, by - 13 * s, 5.4 * s, 4.2 * s, -0.25, 0, Math.PI * 2);
    c.fill();
    outline(c, 1.4);
    c.restore();
  }

  const lift = spec.mount ? 12 * s : 0;

  // legs
  c.save();
  c.strokeStyle = css(shade(b, -0.22));
  c.lineWidth = 3.4 * s;
  c.beginPath();
  c.moveTo(cx - 3.4 * s, by - lift - bodyH * 0.45);
  c.lineTo(cx - 4.4 * s, by - lift + 1);
  c.moveTo(cx + 3.4 * s, by - lift - bodyH * 0.45);
  c.lineTo(cx + 4.4 * s, by - lift + 1);
  c.stroke();
  c.restore();

  // torso
  c.save();
  const torsoY = by - lift - bodyH - 4 * s;
  c.fillStyle = css(b);
  c.beginPath();
  c.moveTo(cx - bodyW * 0.5, torsoY + bodyH);
  c.lineTo(cx - bodyW * 0.58, torsoY + bodyH * 0.34);
  c.quadraticCurveTo(cx, torsoY - bodyH * 0.06, cx + bodyW * 0.58, torsoY + bodyH * 0.34);
  c.lineTo(cx + bodyW * 0.5, torsoY + bodyH);
  c.closePath();
  c.fill();
  outline(c, 1.6);
  c.restore();

  // belt / chest trim
  c.save();
  c.fillStyle = css(t);
  c.fillRect(cx - bodyW * 0.5, torsoY + bodyH * 0.62, bodyW, 3.2 * s);
  c.restore();

  // shoulder pads
  c.save();
  c.fillStyle = css(shade(b, 0.14));
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + dir * bodyW * 0.52, torsoY + bodyH * 0.28, 4.1 * s, 3.2 * s, 0, 0, Math.PI * 2);
    c.fill();
    outline(c, 1.2);
  }
  c.restore();

  // head + helmet
  const headY = torsoY + 2 * s;
  c.save();
  c.fillStyle = css(shade(b, -0.3));
  c.beginPath();
  c.arc(cx, headY, headR * 0.78, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.fillStyle = css(t);
  c.beginPath();
  c.arc(cx, headY, headR, Math.PI, Math.PI * 2);
  c.closePath();
  c.fill();
  outline(c, 1.4);
  c.restore();
  c.save();
  c.fillStyle = css(a);
  c.beginPath();
  c.moveTo(cx, headY - headR - 3.4 * s);
  c.lineTo(cx + 2.6 * s, headY - headR + 1.5 * s);
  c.lineTo(cx - 2.6 * s, headY - headR + 1.5 * s);
  c.closePath();
  c.fill();
  c.restore();

  // weapon
  const wy = torsoY + bodyH * 0.45;
  c.save();
  c.strokeStyle = css(shade(t, -0.35));
  c.lineWidth = 2.6 * s;
  switch (spec.weapon) {
    case 'sword': {
      c.strokeStyle = css(PAL.dawnSteel);
      c.lineWidth = 3 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.62, wy + 6 * s);
      c.lineTo(cx + bodyW * 0.62 + 12 * s, wy - 14 * s);
      c.stroke();
      c.strokeStyle = css(a);
      c.lineWidth = 3.4 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.52, wy + 7 * s);
      c.lineTo(cx + bodyW * 0.72, wy + 2 * s);
      c.stroke();
      break;
    }
    case 'axe': {
      c.strokeStyle = css(shade(t, -0.25));
      c.lineWidth = 3 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.6, wy + 7 * s);
      c.lineTo(cx + bodyW * 0.6 + 8 * s, wy - 15 * s);
      c.stroke();
      c.fillStyle = css(PAL.dawnSteel);
      c.beginPath();
      c.moveTo(cx + bodyW * 0.6 + 8 * s, wy - 15 * s);
      c.lineTo(cx + bodyW * 0.6 + 17 * s, wy - 20 * s);
      c.lineTo(cx + bodyW * 0.6 + 15 * s, wy - 9 * s);
      c.closePath();
      c.fill();
      outline(c, 1.2);
      break;
    }
    case 'hammer': {
      c.strokeStyle = css(shade(t, -0.25));
      c.lineWidth = 3.2 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.6, wy + 7 * s);
      c.lineTo(cx + bodyW * 0.6 + 7 * s, wy - 14 * s);
      c.stroke();
      c.fillStyle = css(PAL.stone);
      c.fillRect(cx + bodyW * 0.6 + 1 * s, wy - 21 * s, 13 * s, 9 * s);
      outline(c, 1.2);
      break;
    }
    case 'bow': {
      c.strokeStyle = css(spec.trim);
      c.lineWidth = 2.6 * s;
      c.beginPath();
      c.arc(cx + bodyW * 0.72, wy - 2 * s, 10 * s, -1.15, 1.15);
      c.stroke();
      c.strokeStyle = css(PAL.dawnCloth, 0.85);
      c.lineWidth = 1.1 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.72 + 4 * s, wy - 11.4 * s);
      c.lineTo(cx + bodyW * 0.72 + 4 * s, wy + 7.4 * s);
      c.stroke();
      // quiver
      c.fillStyle = css(shade(t, -0.1));
      c.fillRect(cx - bodyW * 0.75, wy - 8 * s, 4 * s, 12 * s);
      break;
    }
    case 'staff': {
      c.strokeStyle = css(shade(t, -0.2));
      c.lineWidth = 2.8 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.58, wy + 8 * s);
      c.lineTo(cx + bodyW * 0.58 + 4 * s, wy - 22 * s);
      c.stroke();
      c.fillStyle = css(a, 0.95);
      c.beginPath();
      c.arc(cx + bodyW * 0.58 + 4 * s, wy - 24 * s, 4.4 * s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = css(a, 0.28);
      c.beginPath();
      c.arc(cx + bodyW * 0.58 + 4 * s, wy - 24 * s, 8 * s, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'pick': {
      c.strokeStyle = css(shade(t, -0.15));
      c.lineWidth = 2.6 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.6, wy + 7 * s);
      c.lineTo(cx + bodyW * 0.6 + 7 * s, wy - 12 * s);
      c.stroke();
      c.strokeStyle = css(PAL.stone);
      c.lineWidth = 2.4 * s;
      c.beginPath();
      c.moveTo(cx + bodyW * 0.6 + 2 * s, wy - 12 * s);
      c.lineTo(cx + bodyW * 0.6 + 13 * s, wy - 16 * s);
      c.stroke();
      break;
    }
    case 'claw': {
      c.strokeStyle = css(a);
      c.lineWidth = 2.4 * s;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(cx + bodyW * 0.6, wy + i * 3 * s - 2 * s);
        c.lineTo(cx + bodyW * 0.6 + 11 * s, wy + i * 4 * s - 6 * s);
        c.stroke();
      }
      break;
    }
    case 'banner': {
      c.strokeStyle = css(shade(t, -0.3));
      c.lineWidth = 2.4 * s;
      c.beginPath();
      c.moveTo(cx - bodyW * 0.7, wy + 8 * s);
      c.lineTo(cx - bodyW * 0.7, wy - 26 * s);
      c.stroke();
      c.fillStyle = css(spec.banner ?? a);
      c.beginPath();
      c.moveTo(cx - bodyW * 0.7, wy - 26 * s);
      c.lineTo(cx - bodyW * 0.7 - 14 * s, wy - 22 * s);
      c.lineTo(cx - bodyW * 0.7, wy - 14 * s);
      c.closePath();
      c.fill();
      break;
    }
    default:
      break;
  }
  c.restore();

  // subtle top light
  c.save();
  c.fillStyle = 'rgba(255,255,255,0.09)';
  c.beginPath();
  c.ellipse(cx - bodyW * 0.1, torsoY + bodyH * 0.3, bodyW * 0.4, bodyH * 0.26, -0.2, 0, Math.PI * 2);
  c.fill();
  c.restore();
  void seed;
}

function drawBeast(c: CanvasRenderingContext2D, cx: number, by: number, spec: ArtSpec): void {
  const s = spec.scale;
  const b = spec.body;
  const t = spec.trim;
  const a = spec.accent;
  const bodyR = 15 * s;
  const cy = by - 13 * s;

  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx, by - 1, bodyR * 1.05, bodyR * 0.44, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // legs
  c.save();
  c.strokeStyle = css(shade(b, -0.25));
  c.lineWidth = 5 * s;
  for (const [dx, dy] of [[-11, -6], [11, -6], [-9, 7], [10, 7]] as const) {
    c.beginPath();
    c.moveTo(cx + dx * s, cy + dy * s);
    c.lineTo(cx + dx * s * 1.1, by + 1);
    c.stroke();
  }
  c.restore();

  // tail
  c.save();
  c.strokeStyle = css(shade(b, -0.18));
  c.lineWidth = 4 * s;
  c.beginPath();
  c.moveTo(cx - bodyR * 0.9, cy);
  c.quadraticCurveTo(cx - bodyR * 1.7, cy - 4 * s, cx - bodyR * 1.9, cy - 12 * s);
  c.stroke();
  c.restore();

  // body
  c.save();
  c.fillStyle = css(b);
  c.beginPath();
  c.ellipse(cx, cy, bodyR, bodyR * 0.74, 0, 0, Math.PI * 2);
  c.fill();
  outline(c, 2);
  c.restore();

  // back spikes
  c.save();
  c.fillStyle = css(t);
  for (let i = -2; i <= 2; i++) {
    const px = cx + i * bodyR * 0.36;
    c.beginPath();
    c.moveTo(px - 3.4 * s, cy - bodyR * 0.5);
    c.lineTo(px, cy - bodyR * 0.98);
    c.lineTo(px + 3.4 * s, cy - bodyR * 0.5);
    c.closePath();
    c.fill();
  }
  c.restore();

  // head
  c.save();
  c.fillStyle = css(shade(b, 0.08));
  c.beginPath();
  c.ellipse(cx + bodyR * 1.0, cy - 2 * s, 9 * s, 8 * s, 0.1, 0, Math.PI * 2);
  c.fill();
  outline(c, 1.8);
  c.restore();

  // jaws / tusks
  c.save();
  c.fillStyle = css(PAL.wildBone);
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + bodyR * 1.3, cy + dir * 3 * s);
    c.lineTo(cx + bodyR * 1.7, cy + dir * 6 * s);
    c.lineTo(cx + bodyR * 1.34, cy + dir * 7 * s);
    c.closePath();
    c.fill();
  }
  c.restore();

  // glowing eyes
  c.save();
  c.fillStyle = css(a);
  c.shadowColor = css(a, 0.9);
  c.shadowBlur = 6 * s;
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.arc(cx + bodyR * 1.16, cy - 3 * s + dir * 3.2 * s, 1.9 * s, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/**
 * Builds a spritesheet with idle/walk/attack/death frames for one unit and registers the
 * matching Phaser animations. Replaces the old single static texture.
 */
function drawUnitSheet(scene: Phaser.Scene, key: string, spec: ArtSpec): UnitSheetLayout {
  const layout = layoutFor(spec);
  const poses = posesFor(layout);
  const W = layout.cell * layout.count;
  const H = layout.cell;
  if (scene.textures.exists(key)) return layout; // already built; frames are in use

  // draw the strip into an offscreen canvas, then hand it to Phaser as a spritesheet
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(W * UNIT_SS);
  canvas.height = Math.ceil(H * UNIT_SS);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('[art] 2d context unavailable');
  c.lineJoin = 'round';
  c.lineCap = 'round';
  renderUnitStrip(c, spec, layout, poses, UNIT_SS);

  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
    frameWidth: Math.ceil(layout.cell * UNIT_SS),
    frameHeight: Math.ceil(layout.cell * UNIT_SS),
  });
  setMeta(key, 1 / UNIT_SS, layout.originY);

  const anim = (state: 'idle' | 'walk' | 'attack' | 'death', frameRate: number, repeat: number) => {
    const animKey = `${key}_${state}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: layout.frames[state].map((i) => ({ key, frame: i })),
      frameRate,
      repeat,
    });
  };
  anim('idle', 4.5, -1);
  anim('walk', 9, -1);
  anim('attack', 14, 0);
  anim('death', 7, 0);
  return layout;
}

// ─────────────────────────── buildings ───────────────────────────

function drawBuildingTexture(scene: Phaser.Scene, key: string, spec: ArtSpec, fp: { w: number; h: number }): void {
  const tilePx = 30;
  const wWorld = fp.w * tilePx;
  const hWorld = fp.h * tilePx;
  const height = hWorld * 0.85;
  const W = wWorld + 22;
  const H = hWorld + height + 26;
  const c = ctx2d(scene, key, W, H);
  const cx = W / 2;
  const base = H - 12;
  const s = spec.scale;
  const bw = wWorld * s;
  const bh = hWorld * s;
  const hh = height * s;

  // shadow
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx + 4, base - 2, bw * 0.56, bh * 0.30, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  const left = cx - bw / 2;
  const top = base - bh;
  const body = spec.body;
  const trim = spec.trim;

  if (spec.shape === 'tent') {
    // conical tent with banner poles
    c.save();
    const roofTop = top - hh;
    c.fillStyle = css(body);
    c.beginPath();
    c.moveTo(cx, roofTop);
    c.lineTo(cx + bw * 0.62, base - 2);
    c.lineTo(cx - bw * 0.62, base - 2);
    c.closePath();
    c.fill();
    outline(c, 2.2);
    c.restore();
    c.save();
    c.fillStyle = css(trim, 0.85);
    c.beginPath();
    c.moveTo(cx, roofTop);
    c.lineTo(cx + bw * 0.22, base - 2);
    c.lineTo(cx - bw * 0.22, base - 2);
    c.closePath();
    c.fill();
    c.restore();
    // entrance
    c.save();
    c.fillStyle = css(shade(trim, -0.3));
    c.beginPath();
    c.moveTo(cx, base - bh * 0.42);
    c.lineTo(cx + bw * 0.15, base - 2);
    c.lineTo(cx - bw * 0.15, base - 2);
    c.closePath();
    c.fill();
    c.restore();
    // banner pole
    c.save();
    c.strokeStyle = css(shade(trim, -0.4));
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx + bw * 0.52, base - 2);
    c.lineTo(cx + bw * 0.52, roofTop + 8);
    c.stroke();
    c.fillStyle = css(spec.banner ?? spec.accent);
    c.beginPath();
    c.moveTo(cx + bw * 0.52, roofTop + 6);
    c.lineTo(cx + bw * 0.52 - 14, roofTop + 12);
    c.lineTo(cx + bw * 0.52, roofTop + 20);
    c.closePath();
    c.fill();
    c.restore();
  } else if (spec.shape === 'crystal' || spec.shape === 'shrine') {
    // stone plinth + floating crystal
    c.save();
    c.fillStyle = css(trim);
    c.beginPath();
    c.moveTo(left + bw * 0.1, base - 2);
    c.lineTo(left + bw * 0.2, base - bh * 0.5);
    c.lineTo(left + bw * 0.8, base - bh * 0.5);
    c.lineTo(left + bw * 0.9, base - 2);
    c.closePath();
    c.fill();
    outline(c, 2);
    c.restore();
    const cxx = cx;
    const cyy = base - bh * 0.5 - hh * 0.55;
    c.save();
    c.fillStyle = css(body);
    c.beginPath();
    c.moveTo(cxx, cyy - hh * 0.55);
    c.lineTo(cxx + bw * 0.26, cyy - hh * 0.05);
    c.lineTo(cxx, cyy + hh * 0.55);
    c.lineTo(cxx - bw * 0.26, cyy - hh * 0.05);
    c.closePath();
    c.fill();
    c.restore();
    c.save();
    c.fillStyle = css(spec.accent, 0.35);
    c.shadowColor = css(spec.accent, 0.8);
    c.shadowBlur = 18;
    c.beginPath();
    c.moveTo(cxx, cyy - hh * 0.55);
    c.lineTo(cxx + bw * 0.26, cyy - hh * 0.05);
    c.lineTo(cxx, cyy + hh * 0.55);
    c.lineTo(cxx - bw * 0.26, cyy - hh * 0.05);
    c.closePath();
    c.fill();
    c.restore();
    c.save();
    c.strokeStyle = css(spec.accent, 0.9);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cxx, cyy - hh * 0.55);
    c.lineTo(cxx, cyy + hh * 0.55);
    c.stroke();
    c.restore();
  } else if (spec.shape === 'ring') {
    // wolf pen: fence ring
    c.save();
    c.strokeStyle = css(trim);
    c.lineWidth = 6;
    c.beginPath();
    c.ellipse(cx, base - bh * 0.32, bw * 0.5, bh * 0.4, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    c.save();
    c.strokeStyle = css(shade(trim, 0.16));
    c.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const px = cx + Math.cos(ang) * bw * 0.5;
      const py = base - bh * 0.32 + Math.sin(ang) * bh * 0.4;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px, py - 12);
      c.stroke();
    }
    c.restore();
  } else if (spec.shape === 'tower') {
    // stone tower with battlements
    c.save();
    c.fillStyle = css(body);
    c.beginPath();
    c.moveTo(left + bw * 0.18, base - 2);
    c.lineTo(left + bw * 0.12, top - hh);
    c.lineTo(left + bw * 0.88, top - hh);
    c.lineTo(left + bw * 0.82, base - 2);
    c.closePath();
    c.fill();
    outline(c, 2);
    c.restore();
    // battlements
    c.save();
    c.fillStyle = css(shade(body, 0.1));
    const bwid = bw * 0.76;
    const btop = top - hh - 8;
    c.fillRect(left + bw * 0.12, btop, bwid, 9);
    c.fillStyle = css(trim);
    for (let i = 0; i < 4; i++) c.fillRect(left + bw * 0.12 + i * (bwid / 4) + 2, btop - 8, bwid / 8, 9);
    c.restore();
    // roof cone
    c.save();
    c.fillStyle = css(spec.banner ?? trim);
    c.beginPath();
    c.moveTo(cx, btop - hh * 0.5);
    c.lineTo(cx + bw * 0.4, btop + 1);
    c.lineTo(cx - bw * 0.4, btop + 1);
    c.closePath();
    c.fill();
    outline(c, 2);
    c.restore();
    // windows
    c.save();
    c.fillStyle = css(spec.accent, 0.9);
    for (const dy of [0.35, 0.62]) {
      c.beginPath();
      c.ellipse(cx, base - bh * dy - hh * 0.35, bw * 0.08, bh * 0.09, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  } else {
    // hall: keep + two wings
    c.save();
    c.fillStyle = css(body);
    c.fillRect(left + bw * 0.08, top - hh * 0.62, bw * 0.84, hh * 0.62 + bh);
    outline(c, 2.4);
    c.restore();
    // roof
    c.save();
    c.fillStyle = css(spec.banner ?? trim);
    c.beginPath();
    c.moveTo(cx, top - hh * 1.15);
    c.lineTo(left + bw * 0.96, top - hh * 0.58);
    c.lineTo(left + bw * 0.04, top - hh * 0.58);
    c.closePath();
    c.fill();
    outline(c, 2.2);
    c.restore();
    // gate
    c.save();
    c.fillStyle = css(shade(trim, -0.35));
    c.beginPath();
    c.moveTo(cx - bw * 0.16, base - 2);
    c.lineTo(cx - bw * 0.16, base - bh * 0.55);
    c.quadraticCurveTo(cx, base - bh * 0.82, cx + bw * 0.16, base - bh * 0.55);
    c.lineTo(cx + bw * 0.16, base - 2);
    c.closePath();
    c.fill();
    c.restore();
    // windows
    c.save();
    c.fillStyle = css(spec.accent, 0.92);
    for (const dx of [-0.3, 0.3]) {
      c.fillRect(cx + bw * dx - 5, base - bh * 0.95, 10, 14);
      c.fillRect(cx + bw * dx - 5, base - bh * 0.55, 10, 14);
    }
    c.restore();
    // banner
    c.save();
    c.strokeStyle = css(shade(trim, -0.4));
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx, top - hh * 1.15);
    c.lineTo(cx, top - hh * 1.5);
    c.stroke();
    c.fillStyle = css(spec.accent);
    c.beginPath();
    c.moveTo(cx, top - hh * 1.5);
    c.lineTo(cx - 18, top - hh * 1.42);
    c.lineTo(cx, top - hh * 1.28);
    c.closePath();
    c.fill();
    c.restore();
  }

  // ── volume pass: every building gets a lit side, a shadowed side, stone courses and
  //    warm window halos. Cheap, and it is what stops them reading as flat cut-outs. ──
  const bodyTop = base - bh - hh * 0.62;
  const bodyBottom = base;
  c.save();
  c.beginPath();
  c.rect(left - 4, Math.max(0, bodyTop), bw + 8, bodyBottom - Math.max(0, bodyTop));
  c.clip();
  const lit = c.createLinearGradient(left, 0, left + bw, 0);
  lit.addColorStop(0, 'rgba(255,246,214,0.16)');
  lit.addColorStop(0.42, 'rgba(255,255,255,0)');
  lit.addColorStop(1, 'rgba(8,10,20,0.34)');
  c.fillStyle = lit;
  c.fillRect(left - 4, Math.max(0, bodyTop), bw + 8, bodyBottom - Math.max(0, bodyTop));
  // stone courses
  c.strokeStyle = 'rgba(24,24,32,0.16)';
  c.lineWidth = 1;
  for (let y = bodyTop + 9; y < bodyBottom - 2; y += 9) {
    c.beginPath();
    c.moveTo(left - 2, y);
    c.lineTo(left + bw + 2, y);
    c.stroke();
  }
  c.restore();
  // warm light spilling out of the windows
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const [wx, wy] of [[cx, base - bh * 0.95], [cx, base - bh * 0.55], [cx - bw * 0.3, base - bh * 0.55], [cx + bw * 0.3, base - bh * 0.55]] as const) {
    const halo = c.createRadialGradient(wx, wy, 1, wx, wy, 13);
    halo.addColorStop(0, 'rgba(255,214,140,0.5)');
    halo.addColorStop(1, 'rgba(255,190,90,0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(wx, wy, 13, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  // ground contact shadow so the building sits on the tile instead of floating
  c.save();
  const contact = c.createLinearGradient(0, base - 10, 0, base + 4);
  contact.addColorStop(0, 'rgba(0,0,0,0)');
  contact.addColorStop(1, 'rgba(0,0,0,0.34)');
  c.fillStyle = contact;
  c.fillRect(left - 6, base - 10, bw + 12, 14);
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, base / H);
}

// ─────────────────────────── projectiles / fx / icons ───────────────────────────

function drawProjectile(scene: Phaser.Scene, key: string, kind: string): void {
  const size = 22;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const cy = size / 2;
  if (kind === 'arrow') {
    c.save();
    c.strokeStyle = css(PAL.wildBone);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx - 8, cy);
    c.lineTo(cx + 8, cy);
    c.stroke();
    c.fillStyle = css(PAL.dawnSteel);
    c.beginPath();
    c.moveTo(cx + 9, cy);
    c.lineTo(cx + 3, cy - 3);
    c.lineTo(cx + 3, cy + 3);
    c.closePath();
    c.fill();
    c.fillStyle = css(0xc94b4b);
    c.beginPath();
    c.moveTo(cx - 8, cy);
    c.lineTo(cx - 4, cy - 3);
    c.lineTo(cx - 4, cy + 3);
    c.closePath();
    c.fill();
    c.restore();
  } else if (kind === 'boulder') {
    c.save();
    c.fillStyle = css(PAL.stone);
    c.beginPath();
    c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fill();
    outline(c, 1.4);
    c.restore();
  } else if (kind === 'bolt') {
    c.save();
    c.fillStyle = css(PAL.voidCyan, 0.9);
    c.shadowColor = css(PAL.voidCyan, 1);
    c.shadowBlur = 10;
    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  } else {
    // fireball
    c.save();
    const g = c.createRadialGradient(cx, cy, 1, cx, cy, 8);
    g.addColorStop(0, 'rgba(255,246,200,1)');
    g.addColorStop(0.4, 'rgba(255,160,60,0.95)');
    g.addColorStop(1, 'rgba(200,60,20,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 8, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  finish(scene, key, c);
}

function drawSoftDisc(scene: Phaser.Scene, key: string, colorCss: string, radius: number): void {
  const size = radius * 2 + 4;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const g = c.createRadialGradient(cx, cx, 0, cx, cx, radius);
  g.addColorStop(0, colorCss.replace('A)', '1)'));
  g.addColorStop(0.55, colorCss.replace('A)', '0.5)'));
  g.addColorStop(1, colorCss.replace('A)', '0)'));
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cx, radius, 0, Math.PI * 2);
  c.fill();
  finish(scene, key, c);
}

function drawSpark(scene: Phaser.Scene, key: string, color: number): void {
  const size = 12;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const g = c.createRadialGradient(cx, cx, 0, cx, cx, 5.5);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, css(color, 0.9));
  g.addColorStop(1, css(color, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cx, 5.5, 0, Math.PI * 2);
  c.fill();
  finish(scene, key, c);
}

function drawRing(scene: Phaser.Scene, key: string, color: number, radius: number, width: number): void {
  const size = radius * 2 + 6;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  c.strokeStyle = css(color, 0.95);
  c.lineWidth = width;
  c.beginPath();
  c.arc(cx, cx, radius, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = css(0xffffff, 0.5);
  c.lineWidth = width * 0.35;
  c.beginPath();
  c.arc(cx, cx, radius, 0, Math.PI * 2);
  c.stroke();
  finish(scene, key, c);
}

function drawSlash(scene: Phaser.Scene, key: string, color: number): void {
  const size = 40;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  c.strokeStyle = css(color, 0.95);
  c.lineWidth = 4;
  c.beginPath();
  c.arc(cx, cx, 13, -0.9, 0.9);
  c.stroke();
  c.strokeStyle = css(0xffffff, 0.7);
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(cx, cx, 13, -0.8, 0.8);
  c.stroke();
  finish(scene, key, c);
}

function drawIcon(scene: Phaser.Scene, key: string, glyph: string, color: number): void {
  const size = 40;
  const c = ctx2d(scene, key, size, size);
  c.save();
  const g = c.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, css(shade(color, -0.15), 0.95));
  g.addColorStop(1, css(shade(color, -0.42), 0.95));
  c.fillStyle = g;
  c.beginPath();
  if (typeof (c as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect === 'function') {
    (c as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(2, 2, size - 4, size - 4, 7);
  } else {
    c.rect(2, 2, size - 4, size - 4);
  }
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.font = 'bold 22px "Trebuchet MS", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(glyph, size / 2, size / 2 + 1);
  c.restore();
  finish(scene, key, c);
}

function drawTree(scene: Phaser.Scene, key: string, variant: number): void {
  const size = 40;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 5;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(cx + 2, by, 12, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.fillStyle = css(0x5a4028);
  c.fillRect(cx - 2.4, by - 14, 5, 14);
  c.restore();
  const palette = variant === 0
    ? [0x2f5a2c, 0x3d7034, 0x4f8a3f]
    : variant === 1
      ? [0x2a4f3a, 0x37704a, 0x4a8a5a]
      : [0x4a5a28, 0x5f7a30, 0x7a9a40];
  for (let i = 0; i < 3; i++) {
    c.save();
    c.fillStyle = css(palette[i]);
    c.beginPath();
    c.arc(cx + (i - 1) * 6, by - 20 - i * 3.4, 10 - i * 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  c.save();
  c.strokeStyle = 'rgba(10,20,10,0.5)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(cx, by - 22, 14, Math.PI * 1.05, Math.PI * 1.9);
  c.stroke();
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 5) / size);
}

/** Treasure chest: banded wood with a gold lock and a glow. */
function drawChest(scene: Phaser.Scene, key: string): void {
  const size = 40;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 6;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx, by, 13, 4.5, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // body
  c.save();
  c.fillStyle = css(0x8a5f34);
  c.beginPath();
  c.moveTo(cx - 12, by - 11);
  c.lineTo(cx + 12, by - 11);
  c.lineTo(cx + 11, by);
  c.lineTo(cx - 11, by);
  c.closePath();
  c.fill();
  outline(c, 1.6);
  c.restore();
  // lid
  c.save();
  c.beginPath();
  c.moveTo(cx - 13, by - 11);
  c.quadraticCurveTo(cx, by - 22, cx + 13, by - 11);
  c.closePath();
  c.fillStyle = css(0x9c6d3c);
  c.fill();
  outline(c, 1.6);
  c.restore();
  // iron bands + lock
  c.save();
  c.fillStyle = css(0x4a4a52);
  c.fillRect(cx - 8, by - 20, 3, 20);
  c.fillRect(cx + 5, by - 20, 3, 20);
  c.fillStyle = css(0xffd257);
  c.fillRect(cx - 3, by - 13, 6, 7);
  outline(c, 1.2);
  c.restore();
  // sparkle
  c.save();
  c.fillStyle = 'rgba(255,235,150,0.85)';
  c.beginPath();
  c.arc(cx + 9, by - 18, 1.8, 0, Math.PI * 2);
  c.arc(cx - 11, by - 15, 1.3, 0, Math.PI * 2);
  c.fill();
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 6) / size);
}

/** Supply crate: smaller, plainer, no lock. */
function drawCache(scene: Phaser.Scene, key: string): void {
  const size = 32;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 6;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(cx, by, 10, 3.4, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.fillStyle = css(0x9a7b4a);
  c.fillRect(cx - 9, by - 13, 18, 13);
  outline(c, 1.5);
  c.restore();
  c.save();
  c.strokeStyle = css(0x6b5330);
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(cx - 9, by - 8);
  c.lineTo(cx + 9, by - 8);
  c.moveTo(cx, by - 13);
  c.lineTo(cx, by);
  c.stroke();
  c.restore();
  c.save();
  c.fillStyle = css(0x7fd8ff, 0.9);
  c.beginPath();
  c.arc(cx, by - 10, 2, 0, Math.PI * 2);
  c.fill();
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 6) / size);
}

/** Quest NPC: robed scholar with a staff and a question mark above. */
function drawNpc(scene: Phaser.Scene, key: string): void {
  const W = 34;
  const H = 46;
  const c = ctx2d(scene, key, W, H);
  const cx = W / 2;
  const by = H - 5;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(cx, by, 9, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // robe
  c.save();
  c.beginPath();
  c.moveTo(cx, by - 26);
  c.quadraticCurveTo(cx + 9, by - 14, cx + 8, by);
  c.lineTo(cx - 8, by);
  c.quadraticCurveTo(cx - 9, by - 14, cx, by - 26);
  c.closePath();
  c.fillStyle = css(0x6b5fa8);
  c.fill();
  outline(c, 1.5);
  c.restore();
  // hood
  c.save();
  c.beginPath();
  c.arc(cx, by - 29, 6, Math.PI, Math.PI * 2);
  c.closePath();
  c.fillStyle = css(0x584c92);
  c.fill();
  outline(c, 1.4);
  c.restore();
  // staff
  c.save();
  c.strokeStyle = css(0x6b5334);
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(cx + 8, by);
  c.lineTo(cx + 10, by - 32);
  c.stroke();
  c.fillStyle = css(0xffd257);
  c.beginPath();
  c.arc(cx + 10, by - 34, 3, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // quest marker
  c.save();
  c.fillStyle = 'rgba(255,214,90,0.95)';
  c.font = 'bold 15px "Trebuchet MS", sans-serif';
  c.textAlign = 'center';
  c.fillText('!', cx, by - 38);
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (by - 4) / H);
}

/** Void rift: a tear in the air with a glowing rim. */
function drawRift(scene: Phaser.Scene, key: string): void {
  const size = 44;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 8;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx, by, 12, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // tear
  c.save();
  const g = c.createLinearGradient(cx, by - 34, cx, by - 4);
  g.addColorStop(0, 'rgba(190,150,255,0.95)');
  g.addColorStop(0.5, 'rgba(90,40,150,0.95)');
  g.addColorStop(1, 'rgba(20,10,40,0.95)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(cx, by - 34);
  c.quadraticCurveTo(cx + 10, by - 20, cx + 5, by - 5);
  c.quadraticCurveTo(cx, by - 1, cx - 5, by - 5);
  c.quadraticCurveTo(cx - 10, by - 20, cx, by - 34);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(220,190,255,0.9)';
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
  // glow
  c.save();
  const glow = c.createRadialGradient(cx, by - 18, 2, cx, by - 18, 18);
  glow.addColorStop(0, 'rgba(170,120,255,0.5)');
  glow.addColorStop(1, 'rgba(120,80,220,0)');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(cx, by - 18, 18, 0, Math.PI * 2);
  c.fill();
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 8) / size);
}

/** Broken wall fragment — battlefield rubble that reads as "this place had a history". */
function drawRuin(scene: Phaser.Scene, key: string): void {
  const size = 52;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 5;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(cx, by, 16, 5.5, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // two crumbling wall stubs
  for (const [dx, h] of [[-9, 15], [4, 21]] as const) {
    c.save();
    c.fillStyle = css(0x8d8b86);
    c.beginPath();
    c.moveTo(cx + dx - 6, by);
    c.lineTo(cx + dx - 6, by - h);
    c.lineTo(cx + dx - 2, by - h - 3);
    c.lineTo(cx + dx + 4, by - h + 2);
    c.lineTo(cx + dx + 6, by);
    c.closePath();
    c.fill();
    outline(c, 1.5);
    c.restore();
    // stone courses
    c.save();
    c.strokeStyle = 'rgba(60,58,54,0.55)';
    c.lineWidth = 1;
    for (let i = 1; i < Math.floor(h / 6); i++) {
      c.beginPath();
      c.moveTo(cx + dx - 6, by - i * 6);
      c.lineTo(cx + dx + 6, by - i * 6);
      c.stroke();
    }
    c.restore();
  }
  // moss
  c.save();
  c.fillStyle = css(0x5f7a44, 0.55);
  c.fillRect(cx - 14, by - 5, 5, 4);
  c.fillRect(cx + 6, by - 9, 4, 3);
  c.restore();
  // broken pillar top lying on the ground
  c.save();
  c.fillStyle = css(0x7d7b76);
  c.fillRect(cx + 10, by - 4, 12, 4);
  outline(c, 1.3);
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 5) / size);
}

/** Wall torch: flame drawn tall and thin so a flicker scale looks alive. */
function drawTorch(scene: Phaser.Scene, key: string): void {
  const W = 20;
  const H = 44;
  const c = ctx2d(scene, key, W, H);
  const cx = W / 2;
  const by = H - 3;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx, by, 6, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // wooden post
  c.save();
  c.fillStyle = css(0x6b4f30);
  c.fillRect(cx - 1.8, by - 22, 3.6, 22);
  outline(c, 1.2);
  c.restore();
  // iron basket
  c.save();
  c.fillStyle = css(0x4a4a52);
  c.beginPath();
  c.moveTo(cx - 5, by - 22);
  c.lineTo(cx + 5, by - 22);
  c.lineTo(cx + 3.4, by - 27);
  c.lineTo(cx - 3.4, by - 27);
  c.closePath();
  c.fill();
  outline(c, 1.2);
  c.restore();
  // flame: layered teardrops
  const flame = (sc: number, color: string, dy: number) => {
    c.save();
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(cx, by - 27 - dy - 13 * sc);
    c.quadraticCurveTo(cx + 6 * sc, by - 27 - dy - 5 * sc, cx + 3.2 * sc, by - 27 - dy);
    c.quadraticCurveTo(cx, by - 27 - dy + 2 * sc, cx - 3.2 * sc, by - 27 - dy);
    c.quadraticCurveTo(cx - 6 * sc, by - 27 - dy - 5 * sc, cx, by - 27 - dy - 13 * sc);
    c.closePath();
    c.fill();
    c.restore();
  };
  flame(1, 'rgba(255,140,40,0.95)', 0);
  flame(0.68, 'rgba(255,206,120,0.98)', 1.5);
  flame(0.34, 'rgba(255,255,235,1)', 3);
  finish(scene, key, c);
  setMeta(key, 1 / SS, (by - 6) / H);
}

/** Hanging banner / war flag (tinted per faction at runtime). */
function drawBanner(scene: Phaser.Scene, key: string): void {
  const W = 26;
  const H = 46;
  const c = ctx2d(scene, key, W, H);
  const cx = W / 2;
  const by = H - 3;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.26)';
  c.beginPath();
  c.ellipse(cx, by, 7, 2.6, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // pole
  c.save();
  c.fillStyle = css(0x5b4630);
  c.fillRect(cx - 1.6, by - 40, 3.2, 40);
  outline(c, 1.2);
  c.restore();
  // cloth with a swallow tail
  c.save();
  c.fillStyle = css(0xd8d8d8);
  c.beginPath();
  c.moveTo(cx + 1.5, by - 40);
  c.lineTo(cx + 13, by - 36);
  c.lineTo(cx + 8, by - 30);
  c.lineTo(cx + 13, by - 24);
  c.lineTo(cx + 1.5, by - 21);
  c.closePath();
  c.fill();
  outline(c, 1.3);
  c.restore();
  // emblem
  c.save();
  c.fillStyle = 'rgba(30,30,40,0.75)';
  c.beginPath();
  c.arc(cx + 6, by - 30.5, 2.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (by - 4) / H);
}

/** Tileable water shimmer (used as a scrolling additive overlay). */
function drawWaterShimmer(scene: Phaser.Scene, key: string): void {
  const size = 64;
  const c = ctx2d(scene, key, size, size);
  c.clearRect(0, 0, size, size);
  c.strokeStyle = 'rgba(200,240,255,0.55)';
  c.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 16;
    c.beginPath();
    c.moveTo(0, y);
    c.quadraticCurveTo(size * 0.25, y - 4, size * 0.5, y);
    c.quadraticCurveTo(size * 0.75, y + 4, size, y);
    c.stroke();
  }
  finish(scene, key, c);
  setMeta(key, 1 / SS, 0.5);
}

function drawRock(scene: Phaser.Scene, key: string): void {
  const size = 36;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 6;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx, by, 12, 4.5, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.fillStyle = css(0x777d87);
  c.beginPath();
  c.moveTo(cx - 12, by);
  c.lineTo(cx - 7, by - 14);
  c.lineTo(cx + 2, by - 17);
  c.lineTo(cx + 11, by - 9);
  c.lineTo(cx + 12, by);
  c.closePath();
  c.fill();
  outline(c, 1.6);
  c.restore();
  c.save();
  c.fillStyle = css(0x9aa1ab, 0.7);
  c.beginPath();
  c.moveTo(cx - 7, by - 14);
  c.lineTo(cx + 2, by - 17);
  c.lineTo(cx + 1, by - 10);
  c.closePath();
  c.fill();
  c.restore();
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 6) / size);
}

function drawResource(scene: Phaser.Scene, key: string, kind: 'gold' | 'mana'): void {
  const size = 48;
  const c = ctx2d(scene, key, size, size);
  const cx = size / 2;
  const by = size - 8;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(cx, by, 17, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  if (kind === 'gold') {
    c.save();
    c.fillStyle = css(0x6b6257);
    c.beginPath();
    c.ellipse(cx, by - 2, 16, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    for (const [dx, dy, r] of [[-7, -8, 5.4], [2, -11, 6], [8, -6, 4.4], [-1, -4, 4.6]] as const) {
      c.save();
      c.fillStyle = css(0xffd257);
      c.beginPath();
      c.arc(cx + dx, by + dy, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = css(0xfff2b0, 0.8);
      c.beginPath();
      c.arc(cx + dx - r * 0.3, by + dy - r * 0.35, r * 0.42, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  } else {
    c.save();
    c.fillStyle = css(0x2f6f8f, 0.55);
    c.beginPath();
    c.ellipse(cx, by - 6, 11, 15, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.save();
    c.fillStyle = css(0x7fd8ff);
    c.beginPath();
    c.moveTo(cx, by - 26);
    c.lineTo(cx + 8, by - 8);
    c.lineTo(cx, by + 2);
    c.lineTo(cx - 8, by - 8);
    c.closePath();
    c.fill();
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = '#eaffff';
    c.beginPath();
    c.moveTo(cx, by - 26);
    c.lineTo(cx + 8, by - 8);
    c.lineTo(cx, by - 6);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();
  }
  finish(scene, key, c);
  setMeta(key, 1 / SS, (size - 8) / size);
}

// ─────────────────────────── public entry ───────────────────────────

let generated = false;

export function ensureTextures(scene: Phaser.Scene): void {
  if (generated) return;
  generated = true;

  for (const id of Object.keys(UNITS)) {
    drawUnitSheet(scene, `u_${id}`, UNITS[id].art);
  }
  for (const id of Object.keys(HEROES)) {
    drawUnitSheet(scene, `u_${id}`, HEROES[id].art);
  }
  for (const id of Object.keys(BUILDINGS)) {
    const b = BUILDINGS[id];
    drawBuildingTexture(scene, `b_${id}`, b.art, b.footprint);
  }
  for (const k of ['arrow', 'bolt', 'fireball', 'boulder']) drawProjectile(scene, `p_${k}`, k);

  drawSoftDisc(scene, 'fx_glow_warm', 'rgba(255,190,90,A)', 22);
  drawSoftDisc(scene, 'fx_glow_cool', 'rgba(130,200,255,A)', 22);
  drawSoftDisc(scene, 'fx_glow_void', 'rgba(170,120,255,A)', 22);
  drawSoftDisc(scene, 'fx_smoke', 'rgba(120,120,130,A)', 18);
  drawSpark(scene, 'fx_spark_warm', 0xffc861);
  drawSpark(scene, 'fx_spark_blood', 0xd94a4a);
  drawSpark(scene, 'fx_spark_arc', 0x9ff0ff);
  drawSpark(scene, 'fx_spark_leaf', 0x8fbf6a);
  drawRing(scene, 'fx_ring_warm', 0xffd257, 26, 3);
  drawRing(scene, 'fx_ring_cool', 0x7fd8ff, 26, 3);
  drawRing(scene, 'fx_ring_danger', 0xff5a4a, 34, 4);
  drawSlash(scene, 'fx_slash', 0xfff2c0);
  drawSlash(scene, 'fx_slash_dark', 0xff8a5a);

  drawChest(scene, 'adv_chest');
  drawCache(scene, 'adv_cache');
  drawNpc(scene, 'adv_npc');
  drawRift(scene, 'adv_rift');
  drawRuin(scene, 'decor_ruin');
  drawTorch(scene, 'decor_torch');
  drawBanner(scene, 'decor_banner');
  drawWaterShimmer(scene, 'water_shimmer');
  drawTree(scene, 'terrain_tree_0', 0);
  drawTree(scene, 'terrain_tree_1', 1);
  drawTree(scene, 'terrain_tree_2', 2);
  drawRock(scene, 'terrain_rock');
  drawResource(scene, 'res_gold', 'gold');
  drawResource(scene, 'res_mana', 'mana');

  for (const id of Object.keys(SKILLS)) {
    const s = SKILLS[id];
    drawIcon(scene, `icon_${id}`, s.icon.glyph, s.icon.color);
  }

  // 1x1 white pixel used by health bars / selection rings / panels
  const px = ctx2d(scene, 'px1', 1, 1);
  px.fillStyle = '#ffffff';
  px.fillRect(0, 0, 1, 1);
  finish(scene, 'px1', px);
}

export function resetTextureCache(): void {
  generated = false;
}
