import { shade } from './Palette';
import type { ArtSpec } from '../data/types';

/**
 * Pose-driven unit renderer.
 *
 * Every unit is drawn as an articulated figure (hips -> torso -> shoulders -> elbows ->
 * knees) so the same code produces idle / walk / attack / death animation frames instead
 * of one static sprite. Shapes are layered — shadow, cape, back limbs, torso armour with
 * plate lines, tabard, pauldrons, helm with visor slit and crest, front arm + weapon,
 * shield, rim light — because flat silhouettes are what makes a prototype read as a
 * prototype.
 *
 * Output is a horizontal strip of frames registered as a Phaser spritesheet.
 */

export interface Pose {
  /** vertical body offset in px (breathing / step bounce) */
  bob: number;
  /** torso rotation, radians (positive = lean forward) */
  lean: number;
  headTilt: number;
  armUpperL: number;
  armLowerL: number;
  armUpperR: number;
  armLowerR: number;
  legUpperL: number;
  legLowerL: number;
  legUpperR: number;
  legLowerR: number;
  /** weapon rotation offset, radians */
  weaponSwing: number;
  /** 0..1 raise the shield */
  shieldUp: number;
  /** 0..1 whole-body collapse (death) */
  fall: number;
  /** extra vertical squash for the death impact frame */
  crouch: number;
  /** 0..1 lunge forward (beast attack) */
  lunge: number;
  /** 1 = draw the dedicated "lying on the ground" death pose */
  down: number;
}

const BASE: Pose = {
  bob: 0,
  lean: 0.04,
  headTilt: 0,
  armUpperL: 0.16,
  armLowerL: 0.5,
  armUpperR: -0.12,
  armLowerR: -0.45,
  legUpperL: 0.08,
  legLowerL: -0.06,
  legUpperR: -0.08,
  legLowerR: 0.06,
  weaponSwing: 0,
  shieldUp: 0,
  fall: 0,
  crouch: 0,
  lunge: 0,
  down: 0,
};

const p = (o: Partial<Pose>): Pose => ({ ...BASE, ...o });

/** Animation tables: 3 idle, 4 walk, 4 attack, 4 death for humanoids. */
export const HUMAN_ANIMS = {
  idle: [
    p({ bob: 0, lean: 0.03, armLowerL: 0.48, armLowerR: -0.44 }),
    p({ bob: -0.8, lean: 0.05, armLowerL: 0.55, armLowerR: -0.38, headTilt: 0.03 }),
    p({ bob: -0.2, lean: 0.02, armLowerL: 0.45, armLowerR: -0.5, headTilt: -0.02 }),
  ],
  walk: [
    p({ bob: -2.2, legUpperL: 0.62, legLowerL: -0.34, legUpperR: -0.5, legLowerR: 0.72, armUpperL: -0.5, armUpperR: 0.55, armLowerR: -0.75, lean: 0.1 }),
    p({ bob: 0.9, legUpperL: 0.26, legLowerL: -0.06, legUpperR: -0.14, legLowerR: 0.3, armUpperL: 0.12, armUpperR: -0.12, lean: 0.05 }),
    p({ bob: -2.2, legUpperL: -0.5, legLowerL: 0.72, legUpperR: 0.62, legLowerR: -0.34, armUpperL: 0.55, armUpperR: -0.5, armLowerR: -0.4, lean: 0.1 }),
    p({ bob: 0.9, legUpperL: -0.14, legLowerL: 0.3, legUpperR: 0.26, legLowerR: -0.06, armUpperL: 0.12, armUpperR: -0.12, lean: 0.05 }),
  ],
  attack: [
    // windup
    p({ bob: 0.6, lean: -0.12, armUpperR: -1.15, armLowerR: -0.5, weaponSwing: -0.6, legUpperR: -0.2, shieldUp: 0.7 }),
    // strike
    p({ bob: -1.4, lean: 0.34, armUpperR: 0.75, armLowerR: 0.2, weaponSwing: 1.5, legUpperL: 0.3, legLowerL: -0.15, shieldUp: 0.5 }),
    // follow through
    p({ bob: -0.4, lean: 0.22, armUpperR: 0.95, armLowerR: 0.55, weaponSwing: 1.1, shieldUp: 0.3 }),
    // recover
    p({ bob: 0.2, lean: 0.06, armUpperR: -0.3, armLowerR: -0.5, weaponSwing: -0.1 }),
  ],
  death: [
    p({ bob: 1.4, lean: -0.34, headTilt: -0.3, armUpperR: -1.0, armLowerR: -0.2, armUpperL: -0.8, fall: 0.14, crouch: 0.1 }),
    p({ bob: 2.8, lean: -0.1, armUpperR: -1.3, armUpperL: -1.2, legUpperL: 0.6, legUpperR: -0.4, fall: 0.5, crouch: 0.22 }),
    p({ bob: 4.0, lean: 0.28, armUpperR: -1.5, armUpperL: -1.4, legUpperL: 0.8, legUpperR: -0.6, fall: 0.85, crouch: 0.34 }),
    // final frame is a dedicated "on the ground" pose, not a tilted standing figure
    p({ fall: 1, down: 1, armUpperR: -1.6, armUpperL: -1.5, legUpperL: 0.9, legUpperR: -0.7 }),
  ],
};

export const BEAST_ANIMS = {
  idle: [
    p({ bob: 0, lean: 0.02, armUpperL: 0.3, armLowerL: 0.2, armUpperR: -0.3, armLowerR: -0.2 }),
    p({ bob: -1.1, lean: 0.04, armUpperL: 0.36, armLowerL: 0.24, armUpperR: -0.36, armLowerR: -0.24, headTilt: 0.04 }),
  ],
  walk: [
    p({ bob: -1.4, legUpperL: 0.5, legLowerL: -0.1, legUpperR: -0.42, legLowerR: 0.42, headTilt: -0.04 }),
    p({ bob: 0.5, legUpperL: 0.2, legLowerL: 0, legUpperR: -0.14, legLowerR: 0.1 }),
    p({ bob: -1.4, legUpperL: -0.42, legLowerL: 0.42, legUpperR: 0.5, legLowerR: -0.1, headTilt: 0.04 }),
    p({ bob: 0.5, legUpperL: -0.14, legLowerL: 0.1, legUpperR: 0.2, legLowerR: 0 }),
  ],
  attack: [
    p({ bob: 1.6, lean: -0.24, headTilt: -0.2, lunge: -0.1 }),
    p({ bob: -2.2, lean: 0.42, headTilt: 0.24, lunge: 0.55, armUpperL: 0.9, armUpperR: -0.9 }),
    p({ bob: -0.6, lean: 0.3, headTilt: 0.1, lunge: 0.3, armUpperL: 0.6, armUpperR: -0.6 }),
  ],
  death: [
    p({ bob: 1.8, lean: -0.38, headTilt: -0.32, fall: 0.22, crouch: 0.15 }),
    p({ bob: 3.2, lean: 0.12, fall: 0.6, crouch: 0.3, legUpperL: 0.6, legUpperR: -0.5 }),
    p({ bob: 4.6, lean: 0.32, fall: 0.88, crouch: 0.42, legUpperL: 0.8, legUpperR: -0.7 }),
    p({ fall: 1, down: 1, legUpperL: 0.9, legUpperR: -0.8 }),
  ],
};

export type AnimCategory = 'human' | 'beast' | 'boss';

export interface UnitSheetLayout {
  cell: number;
  originY: number;
  category: AnimCategory;
  frames: { idle: number[]; walk: number[]; attack: number[]; death: number[] };
  count: number;
}

/** Decides the strip layout (cell size + which frame indices belong to which state). */
export function layoutFor(spec: ArtSpec): UnitSheetLayout {
  const category: AnimCategory = spec.shape === 'beast' ? (spec.scale >= 1.8 ? 'boss' : 'beast') : 'human';
  const cell = Math.round((category === 'boss' ? 58 : 52) * spec.scale) + 30;
  const originY = 0.8;
  if (category === 'boss') {
    return { cell, originY, category, count: 11, frames: { idle: [0, 1], walk: [2, 3, 4], attack: [5, 6, 7], death: [8, 9, 10] } };
  }
  if (category === 'beast') {
    return { cell, originY, category, count: 13, frames: { idle: [0, 1], walk: [2, 3, 4, 5], attack: [6, 7, 8], death: [9, 10, 11, 12] } };
  }
  return { cell, originY, category, count: 15, frames: { idle: [0, 1, 2], walk: [3, 4, 5, 6], attack: [7, 8, 9, 10], death: [11, 12, 13, 14] } };
}

export function posesFor(layout: UnitSheetLayout): Pose[] {
  const src = layout.category === 'human' ? HUMAN_ANIMS : BEAST_ANIMS;
  const out: Pose[] = [];
  /**
   * `indices` are ABSOLUTE strip frame numbers; the pose table is indexed by the position
   * inside the group. Bosses get fewer, chunkier frames so their table is sampled evenly.
   */
  const push = (list: Pose[], indices: number[]) => {
    const sample = layout.category === 'boss' && list.length > indices.length;
    indices.forEach((_abs, k) => {
      const at = sample ? Math.round((k / Math.max(1, indices.length - 1)) * (list.length - 1)) : k % list.length;
      out.push(list[Math.max(0, Math.min(list.length - 1, at))] ?? BASE);
    });
  };
  push(src.idle, layout.frames.idle);
  push(src.walk, layout.frames.walk);
  push(src.attack, layout.frames.attack);
  push(src.death, layout.frames.death);
  // last line of defence: a missing pose must never break the whole boot
  while (out.length < layout.count) out.push(BASE);
  return out;
}

// ─────────────────────────── drawing primitives ───────────────────────────

const css = (color: number, a = 1): string => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

const OUTLINE = 'rgba(10,10,16,0.92)';

function stroke(ctx: CanvasRenderingContext2D, w = 1.6): void {
  ctx.lineWidth = w;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** Tapered limb segment: a quad with rounded joint caps. */
function tapered(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
  color: number,
  alpha = 1,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x1 + (nx * w1) / 2, y1 + (ny * w1) / 2);
  ctx.lineTo(x2 + (nx * w2) / 2, y2 + (ny * w2) / 2);
  ctx.quadraticCurveTo(x2 + (nx * w2) / 2 + dx * 0.04, y2 + (ny * w2) / 2 + dy * 0.04, x2 - (nx * w2) / 2, y2 - (ny * w2) / 2);
  ctx.lineTo(x1 - (nx * w1) / 2, y1 - (ny * w1) / 2);
  ctx.closePath();
  ctx.fillStyle = css(color);
  ctx.fill();
  stroke(ctx, 1.5);
  ctx.restore();
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, color: number, alpha = 1, line = 1.5): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = css(color);
  ctx.fill();
  if (line > 0) stroke(ctx, line);
  ctx.restore();
}

/** Metal-ish vertical gradient used for blades and plate. */
function metal(ctx: CanvasRenderingContext2D, color: number, x: number, y: number, w: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, css(shade(color, 0.28)));
  g.addColorStop(0.45, css(color));
  g.addColorStop(1, css(shade(color, -0.26)));
  return g;
}

// ─────────────────────────── humanoid ───────────────────────────

/** Per-archetype look: what covers the head, how the torso reads, whether a cape exists. */
interface Style {
  head: 'helm' | 'hood' | 'hat' | 'bare' | 'shade';
  torso: 'plate' | 'robe' | 'leather' | 'fur' | 'cloth';
  cape: boolean;
  shield: boolean;
  crest: boolean;
  tusks: boolean;
}

function styleFor(spec: ArtSpec): Style {
  switch (spec.archetype) {
    case 'knight':
      return { head: 'helm', torso: 'plate', cape: true, shield: true, crest: true, tusks: false };
    case 'soldier':
      return { head: 'helm', torso: 'plate', cape: false, shield: true, crest: true, tusks: false };
    case 'archer':
      return { head: 'hood', torso: 'leather', cape: false, shield: false, crest: false, tusks: false };
    case 'mage':
      return { head: 'hat', torso: 'robe', cape: false, shield: false, crest: false, tusks: false };
    case 'worker':
      return { head: 'bare', torso: 'cloth', cape: false, shield: false, crest: false, tusks: false };
    case 'orc':
      return { head: 'bare', torso: 'fur', cape: false, shield: false, crest: false, tusks: true };
    case 'shade':
      return { head: 'shade', torso: 'robe', cape: true, shield: false, crest: false, tusks: false };
    default:
      return { head: 'bare', torso: 'cloth', cape: false, shield: false, crest: false, tusks: false };
  }
}

/** Body lying on the ground: the dedicated last death frame. */
function drawLying(ctx: CanvasRenderingContext2D, cx: number, by: number, spec: ArtSpec, pose: Pose, facing: number): void {
  const s = spec.scale;
  const body = spec.body;
  const trim = spec.trim;
  const style = styleFor(spec);
  const gy = by - 4 * s;
  // shadow pool
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(cx, gy + 2 * s, 20 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // torso lying sideways
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, gy, 12 * s, 5.4 * s, 0.12 * facing, 0, Math.PI * 2);
  ctx.fillStyle = css(shade(body, -0.1));
  ctx.fill();
  stroke(ctx, 1.7);
  ctx.restore();
  // legs
  tapered(ctx, cx - 9 * s * facing, gy + 1 * s, cx - 21 * s * facing, gy + 4 * s, 6 * s, 4 * s, shade(body, -0.24));
  tapered(ctx, cx - 9 * s * facing, gy - 1 * s, cx - 20 * s * facing, gy - 4 * s, 5.4 * s, 3.6 * s, shade(body, -0.18));
  // arms
  tapered(ctx, cx + 3 * s * facing, gy - 2 * s, cx + 13 * s * facing, gy - 7 * s, 5 * s, 3.4 * s, shade(body, -0.06));
  tapered(ctx, cx + 2 * s * facing, gy + 2 * s, cx + 12 * s * facing, gy + 7 * s, 5 * s, 3.4 * s, shade(body, 0.02));
  // head
  blob(ctx, cx + 15 * s * facing, gy - 3 * s, 6.4 * s, 6 * s, 0.4, shade(body, 0.04), 1, 1.5);
  if (style.head === 'helm') {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + 15 * s * facing, gy - 3.6 * s, 6.6 * s, 5.6 * s, 0.4, Math.PI * 0.9, Math.PI * 2.1);
    ctx.closePath();
    ctx.fillStyle = css(shade(body, 0.16));
    ctx.fill();
    stroke(ctx, 1.4);
    ctx.restore();
  }
  // dropped weapon next to the body
  ctx.save();
  ctx.translate(cx - 6 * s * facing, gy + 9 * s);
  ctx.rotate(0.25 * facing);
  tapered(ctx, 0, 0, 16 * s * facing, 0, 2.4 * s, 1.6 * s, 0xd6dbe6);
  ctx.restore();
  // blood pool
  ctx.save();
  ctx.fillStyle = 'rgba(120,26,26,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx + 4 * s * facing, gy + 3 * s, 13 * s, 5 * s, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void pose;
  void trim;
}

/** Siege engine (catapult): a wooden frame, wheels and a throwing arm — no humanoid body. */
function drawSiegeEngine(ctx: CanvasRenderingContext2D, cx: number, by: number, spec: ArtSpec, pose: Pose, facing: number): void {
  const s = spec.scale;
  const wood = spec.body;
  const dark = shade(wood, -0.3);
  const trim = spec.trim;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, by - 1, 22 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // wheels
  for (const dx of [-11, 11] as const) {
    const wobble = pose.bob * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + dx * s, by - 7 * s + wobble, 6.4 * s, 0, Math.PI * 2);
    ctx.fillStyle = css(shade(dark, -0.1));
    ctx.fill();
    stroke(ctx, 1.8);
    ctx.strokeStyle = css(shade(wood, 0.24));
    ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + wobble * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx + dx * s - Math.cos(a) * 5.4 * s, by - 7 * s + wobble - Math.sin(a) * 5.4 * s);
      ctx.lineTo(cx + dx * s + Math.cos(a) * 5.4 * s, by - 7 * s + wobble + Math.sin(a) * 5.4 * s);
      ctx.stroke();
    }
    ctx.restore();
  }
  // frame
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 15 * s, by - 10 * s);
  ctx.lineTo(cx + 13 * s, by - 12 * s);
  ctx.lineTo(cx + 10 * s, by - 20 * s);
  ctx.lineTo(cx - 12 * s, by - 18 * s);
  ctx.closePath();
  ctx.fillStyle = css(wood);
  ctx.fill();
  stroke(ctx, 1.8);
  ctx.restore();
  // throwing arm (swings during the attack frames)
  const armAngle = -0.9 + pose.weaponSwing * 0.55;
  ctx.save();
  ctx.translate(cx - 6 * s * facing, by - 19 * s);
  ctx.rotate(armAngle * facing);
  tapered(ctx, 0, 0, 20 * s * facing, -8 * s, 3.4 * s, 2.4 * s, shade(wood, 0.08));
  // bucket
  ctx.save();
  ctx.beginPath();
  ctx.arc(21 * s * facing, -8.5 * s, 4.2 * s, 0, Math.PI * 2);
  ctx.fillStyle = css(trim);
  ctx.fill();
  stroke(ctx, 1.4);
  ctx.restore();
  // counterweight
  tapered(ctx, 0, 0, -8 * s * facing, 5 * s, 4.4 * s, 3.4 * s, shade(dark, 0.05));
  ctx.restore();
  // rope
  ctx.save();
  ctx.strokeStyle = 'rgba(220,210,180,0.7)';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(cx + 12 * s, by - 16 * s);
  ctx.lineTo(cx - 6 * s * facing, by - 22 * s);
  ctx.stroke();
  ctx.restore();
  // banner
  ctx.save();
  ctx.strokeStyle = css(shade(dark, -0.2));
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(cx + 14 * s, by - 12 * s);
  ctx.lineTo(cx + 14 * s, by - 34 * s);
  ctx.stroke();
  ctx.fillStyle = css(spec.banner ?? spec.accent);
  ctx.beginPath();
  ctx.moveTo(cx + 14 * s, by - 34 * s);
  ctx.lineTo(cx + 2 * s, by - 30 * s);
  ctx.lineTo(cx + 14 * s, by - 25 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawHumanoid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  spec: ArtSpec,
  pose: Pose,
  facing: number,
): void {
  const style = styleFor(spec);
  if (spec.weapon === 'engine') {
    drawSiegeEngine(ctx, cx, by, spec, pose, facing);
    return;
  }
  if (pose.down >= 0.5) {
    drawLying(ctx, cx, by, spec, pose, facing);
    return;
  }
  const s = spec.scale;
  const body = spec.body;
  const trim = spec.trim;
  const accent = spec.accent;
  const dark = shade(body, -0.22);
  const mid = body;
  const light = shade(body, 0.18);
  const mounted = !!spec.mount;

  const hipY = by - 24 * s - pose.bob;
  const shoulderY = hipY - 17 * s;

  ctx.save();
  // whole-body death transform: rotate around the feet + sink
  if (pose.fall > 0) {
    const ang = pose.fall * 1.35 * facing;
    ctx.translate(cx, by);
    ctx.rotate(ang);
    ctx.translate(-cx, -by + pose.crouch * 4 * s);
    ctx.globalAlpha = 1 - Math.max(0, pose.fall - 0.75) * 1.6;
  }

  // ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, by - 1.5, (mounted ? 20 : 13) * s, (mounted ? 7 : 5) * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── mount (knight) ────────────────────────────────────────────────
  let mountY = by;
  if (mounted) {
    const mBody = shade(trim, -0.06);
    const legA = pose.legUpperL * 8 * s;
    const legB = pose.legUpperR * 8 * s;
    // far legs first
    tapered(ctx, cx - 13 * s, by - 15 * s, cx - 13 * s + legB, by - 1, 4.6 * s, 3 * s, shade(mBody, -0.34));
    tapered(ctx, cx + 11 * s, by - 15 * s, cx + 11 * s + legA, by - 1, 4.6 * s, 3 * s, shade(mBody, -0.28));
    // barrel (longer, less circular)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - 2 * s, by - 19 * s, 21 * s, 9.4 * s, 0.02, 0, Math.PI * 2);
    ctx.fillStyle = metal(ctx, mBody, cx - 23 * s, by - 28 * s, 42 * s, 19 * s);
    ctx.fill();
    stroke(ctx, 1.8);
    ctx.restore();
    // near legs
    tapered(ctx, cx - 9 * s, by - 15 * s, cx - 9 * s + legA, by - 1, 5.4 * s, 3.4 * s, shade(mBody, -0.1));
    tapered(ctx, cx + 14 * s, by - 15 * s, cx + 14 * s + legB, by - 1, 5.4 * s, 3.4 * s, shade(mBody, -0.04));
    // hooves
    for (const hx of [cx - 9 * s + legA, cx + 14 * s + legB, cx - 13 * s + legB, cx + 11 * s + legA]) {
      blob(ctx, hx, by - 1.4 * s, 3 * s, 1.7 * s, 0, shade(0x2b2b30, 0.1), 1, 1.1);
    }
    // neck (angled forward) + head
    tapered(ctx, cx + 14 * s, by - 24 * s, cx + 24 * s, by - 34 * s, 7.6 * s, 6 * s, shade(mBody, 0.04));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + 20 * s, by - 38 * s);
    ctx.quadraticCurveTo(cx + 32 * s, by - 40 * s, cx + 33 * s, by - 31 * s);
    ctx.quadraticCurveTo(cx + 28 * s, by - 29 * s, cx + 21 * s, by - 31 * s);
    ctx.closePath();
    ctx.fillStyle = css(shade(mBody, 0.12));
    ctx.fill();
    stroke(ctx, 1.7);
    ctx.restore();
    // ears + eye
    ctx.save();
    ctx.fillStyle = css(shade(mBody, -0.05));
    ctx.beginPath();
    ctx.moveTo(cx + 23 * s, by - 38 * s);
    ctx.lineTo(cx + 24 * s, by - 43 * s);
    ctx.lineTo(cx + 27 * s, by - 38 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#12131a';
    ctx.beginPath();
    ctx.arc(cx + 29 * s, by - 35 * s, 1.3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // mane
    ctx.save();
    ctx.fillStyle = css(shade(accent, -0.1));
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + (13 + i * 3) * s, by - 24 * s - i * 3 * s);
      ctx.lineTo(cx + (11 + i * 3) * s, by - 30 * s - i * 3 * s);
      ctx.lineTo(cx + (17 + i * 3) * s, by - 27 * s - i * 3 * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // tail
    ctx.save();
    ctx.strokeStyle = css(shade(accent, 0.05));
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 22 * s, by - 22 * s);
    ctx.quadraticCurveTo(cx - 30 * s, by - 30 * s + pose.bob * 0.4, cx - 26 * s, by - 38 * s);
    ctx.stroke();
    ctx.restore();
    // saddle blanket
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 12 * s, by - 25 * s);
    ctx.lineTo(cx + 8 * s, by - 25 * s);
    ctx.lineTo(cx + 6 * s, by - 15 * s);
    ctx.lineTo(cx - 10 * s, by - 15 * s);
    ctx.closePath();
    ctx.fillStyle = css(spec.banner ?? accent);
    ctx.fill();
    stroke(ctx, 1.3);
    ctx.restore();
    mountY = by - 28 * s;
  }

  const hipDraw = mounted ? mountY - 4 * s : hipY;
  const shDraw = mounted ? mountY - 18 * s : shoulderY;
  const leanX = Math.sin(pose.lean) * 6 * s * facing;

  // ── cape (behind) ─────────────────────────────────────────────────
  const capeCol = spec.banner ?? trim;
  if (style.cape) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 5 * s, shDraw - 2 * s);
  ctx.quadraticCurveTo(cx - 15 * s - leanX, shDraw + 12 * s, cx - 11 * s - leanX * 1.4 + pose.bob, hipDraw + 12 * s);
  ctx.lineTo(cx + 2 * s - leanX, hipDraw + 10 * s);
  ctx.quadraticCurveTo(cx + 3 * s, shDraw + 8 * s, cx + 5 * s, shDraw - 2 * s);
  ctx.closePath();
  ctx.fillStyle = css(shade(capeCol, -0.18), 0.95);
  ctx.fill();
  stroke(ctx, 1.4);
  ctx.restore();
  }

  // ── back leg ──────────────────────────────────────────────────────
  const hipL = { x: cx - 2.5 * s * facing, y: hipDraw };
  const kneeL = { x: hipL.x + Math.sin(pose.legUpperL) * 9 * s * facing, y: hipL.y + Math.cos(pose.legUpperL) * 10 * s };
  const footL = { x: kneeL.x + Math.sin(pose.legUpperL + pose.legLowerL) * 8 * s * facing, y: kneeL.y + Math.cos(pose.legUpperL + pose.legLowerL) * 9 * s };
  tapered(ctx, hipL.x, hipL.y, kneeL.x, kneeL.y, 7 * s, 6 * s, shade(dark, -0.08));
  tapered(ctx, kneeL.x, kneeL.y, footL.x, footL.y, 6 * s, 5 * s, shade(dark, -0.02));
  blob(ctx, footL.x, footL.y + 1 * s, 4 * s, 2.2 * s, 0, shade(trim, -0.25), 1, 1.3);

  // ── back arm (weapon arm for most, drawn before the torso) ────────
  const shoulderR = { x: cx + 6 * s * facing + leanX * 0.4, y: shDraw + 2 * s };
  const elbowR = {
    x: shoulderR.x + Math.sin(pose.armUpperR) * 8 * s * facing,
    y: shoulderR.y + Math.cos(pose.armUpperR) * 8 * s,
  };
  const handR = {
    x: elbowR.x + Math.sin(pose.armUpperR + pose.armLowerR) * 7.5 * s * facing,
    y: elbowR.y + Math.cos(pose.armUpperR + pose.armLowerR) * 7.5 * s,
  };

  // ── torso ─────────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  const shoulderHalf = (style.torso === 'robe' ? 10 : 11) * s;
  const hipHalf = (style.torso === 'robe' ? 8.5 : 6.8) * s;
  ctx.moveTo(cx - hipHalf + leanX * 0.5, hipDraw + 2 * s);
  ctx.quadraticCurveTo(cx - shoulderHalf - 1 * s + leanX, shDraw + 5 * s, cx - shoulderHalf + leanX, shDraw - 1 * s);
  ctx.quadraticCurveTo(cx + leanX, shDraw - 4 * s, cx + shoulderHalf + leanX, shDraw - 1 * s);
  ctx.quadraticCurveTo(cx + shoulderHalf + 1 * s + leanX, shDraw + 5 * s, cx + hipHalf + leanX * 0.5, hipDraw + 2 * s);
  ctx.closePath();
  ctx.fillStyle = style.torso === 'robe' ? css(mid) : metal(ctx, mid, cx - shoulderHalf, shDraw - 4 * s, shoulderHalf * 2, hipDraw - shDraw + 6 * s);
  ctx.fill();
  stroke(ctx, 1.7);
  ctx.restore();
  // chest emblem for robed casters
  if (style.torso === 'robe') {
    ctx.save();
    ctx.fillStyle = css(accent, 0.9);
    ctx.beginPath();
    const my = shDraw + (hipDraw - shDraw) * 0.35;
    ctx.arc(cx + leanX, my, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // fur trim for orcs
  if (style.torso === 'fur') {
    ctx.save();
    ctx.strokeStyle = css(shade(trim, 0.28), 0.9);
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderHalf + leanX, shDraw + 1 * s);
    ctx.quadraticCurveTo(cx + leanX, shDraw + 4 * s, cx + shoulderHalf + leanX, shDraw + 1 * s);
    ctx.stroke();
    ctx.restore();
  }

  // plate lines
  ctx.save();
  ctx.strokeStyle = css(shade(body, -0.34), 0.85);
  ctx.lineWidth = 1.1;
  for (let i = 1; i <= 2; i++) {
    const yy = shDraw + ((hipDraw - shDraw) * i) / 3;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderHalf * 0.9 + leanX, yy);
    ctx.quadraticCurveTo(cx + leanX, yy + 1.6 * s, cx + shoulderHalf * 0.9 + leanX, yy);
    ctx.stroke();
  }
  ctx.restore();

  // tabard with emblem
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 5 * s + leanX * 0.7, shDraw + 2 * s);
  ctx.lineTo(cx + 5 * s + leanX * 0.7, shDraw + 2 * s);
  ctx.lineTo(cx + 4 * s + leanX * 0.5, hipDraw + 5 * s);
  ctx.lineTo(cx - 4 * s + leanX * 0.5, hipDraw + 5 * s);
  ctx.closePath();
  ctx.fillStyle = css(trim);
  ctx.fill();
  stroke(ctx, 1.3);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = css(accent, 0.95);
  ctx.beginPath();
  const ey = shDraw + (hipDraw - shDraw) * 0.55;
  ctx.moveTo(cx + leanX * 0.6, ey - 3 * s);
  ctx.lineTo(cx + 3 * s + leanX * 0.6, ey);
  ctx.lineTo(cx + leanX * 0.6, ey + 3 * s);
  ctx.lineTo(cx - 3 * s + leanX * 0.6, ey);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // belt
  tapered(ctx, cx - hipHalf + leanX * 0.5, hipDraw - 1 * s, cx + hipHalf + leanX * 0.5, hipDraw - 1 * s, 3.4 * s, 3.4 * s, shade(trim, -0.35));

  // pauldrons
  for (const dir of [-1, 1] as const) {
    const sx = cx + dir * (shoulderHalf + 0.5 * s) + leanX;
    blob(ctx, sx, shDraw + 1.5 * s, 4.6 * s, 3.6 * s, dir * 0.25, shade(body, dir > 0 ? 0.1 : 0.02));
    blob(ctx, sx + dir * 0.8 * s, shDraw + 3.6 * s, 3.4 * s, 2.2 * s, dir * 0.3, shade(body, -0.12), 0.9, 1.1);
  }

  // ── head ──────────────────────────────────────────────────────────
  const headY = shDraw - 9 * s;
  const headX = cx + leanX * 1.15;
  const headR = 6.4 * s;
  // neck
  tapered(ctx, headX, shDraw - 1 * s, headX, headY + 2.5 * s, 5.4 * s, 4.8 * s, shade(dark, -0.1));

  if (style.head === 'helm') {
    // face in shadow
    blob(ctx, headX, headY + 0.6 * s, headR * 0.82, headR * 0.9, pose.headTilt, shade(body, -0.5), 1, 1.2);
    // dome + cheek guards
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(headX, headY - 0.6 * s, headR, headR * 0.96, pose.headTilt, Math.PI * 0.97, Math.PI * 2.03);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, shade(body, 0.14), headX - headR, headY - headR, headR * 2, headR * 1.6);
    ctx.fill();
    stroke(ctx, 1.6);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = css(shade(body, 0.02));
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.95, headY - 0.5 * s);
    ctx.lineTo(headX - headR * 0.6, headY + headR * 1.05);
    ctx.lineTo(headX - headR * 0.15, headY + headR * 0.2);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 1.2);
    ctx.restore();
    // visor slit + nose guard
    ctx.save();
    ctx.strokeStyle = css(0x14161f, 0.95);
    ctx.lineWidth = 1.9 * s;
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.7, headY + 0.2 * s);
    ctx.lineTo(headX + headR * 0.8 * facing, headY - 0.3 * s);
    ctx.stroke();
    ctx.restore();
    if (style.crest) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(headX - 1.2 * s, headY - headR * 1.02);
      ctx.quadraticCurveTo(headX + 1 * s - 5 * s * facing, headY - headR * 2.1, headX + 7 * s * facing, headY - headR * 1.6);
      ctx.quadraticCurveTo(headX + 2 * s, headY - headR * 1.1, headX + 1 * s, headY - headR * 0.9);
      ctx.closePath();
      ctx.fillStyle = css(accent, 0.95);
      ctx.fill();
      stroke(ctx, 1.2);
      ctx.restore();
    }
  } else if (style.head === 'hood') {
    // hooded archer: cowl with a dark opening
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(headX - headR * 1.15, headY + headR * 0.9);
    ctx.quadraticCurveTo(headX - headR * 1.3, headY - headR * 1.5, headX + headR * 0.2 * facing, headY - headR * 1.25);
    ctx.quadraticCurveTo(headX + headR * 1.25, headY - headR * 1.0, headX + headR * 1.0 * facing, headY + headR * 0.9);
    ctx.quadraticCurveTo(headX, headY + headR * 0.35, headX - headR * 1.15, headY + headR * 0.9);
    ctx.closePath();
    ctx.fillStyle = css(shade(body, 0.1));
    ctx.fill();
    stroke(ctx, 1.6);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = css(0x1a1620, 0.85);
    ctx.beginPath();
    ctx.ellipse(headX + headR * 0.15 * facing, headY + headR * 0.15, headR * 0.62, headR * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // feather
    ctx.save();
    ctx.strokeStyle = css(accent, 0.9);
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.9, headY - headR * 0.7);
    ctx.lineTo(headX - headR * 1.9, headY - headR * 1.7);
    ctx.stroke();
    ctx.restore();
  } else if (style.head === 'hat') {
    // mage: wide brim hat + glowing eyes
    blob(ctx, headX, headY + 0.8 * s, headR * 0.8, headR * 0.85, pose.headTilt, shade(body, -0.42), 1, 1.2);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(headX, headY - headR * 0.35, headR * 1.9, headR * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = css(shade(trim, 0.05));
    ctx.fill();
    stroke(ctx, 1.5);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.95, headY - headR * 0.5);
    ctx.quadraticCurveTo(headX - headR * 0.5, headY - headR * 1.6, headX + headR * 0.1 * facing, headY - headR * 2.3);
    ctx.quadraticCurveTo(headX + headR * 0.9, headY - headR * 1.5, headX + headR * 0.95, headY - headR * 0.5);
    ctx.closePath();
    ctx.fillStyle = css(shade(body, 0.16));
    ctx.fill();
    stroke(ctx, 1.5);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = css(accent, 0.95);
    for (const d of [-1, 1] as const) {
      ctx.beginPath();
      ctx.arc(headX + d * headR * 0.34, headY + 0.9 * s, 1.3 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (style.head === 'shade') {
    // voidborn: hood with nothing inside but glowing eyes
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(headX - headR * 1.2, headY + headR * 1.0);
    ctx.quadraticCurveTo(headX - headR * 1.4, headY - headR * 1.7, headX, headY - headR * 1.5);
    ctx.quadraticCurveTo(headX + headR * 1.4, headY - headR * 1.7, headX + headR * 1.2, headY + headR * 1.0);
    ctx.closePath();
    ctx.fillStyle = css(shade(body, -0.1));
    ctx.fill();
    stroke(ctx, 1.5);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = css(accent, 0.9);
    ctx.shadowBlur = 6 * s;
    ctx.fillStyle = css(accent);
    for (const d of [-1, 1] as const) {
      ctx.beginPath();
      ctx.arc(headX + d * headR * 0.36, headY + 0.2 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // bare (orcs / workers): visible face, optional tusks, optional headband
    blob(ctx, headX, headY + 0.4 * s, headR * 0.92, headR * 0.98, pose.headTilt, shade(body, -0.06), 1, 1.6);
    ctx.save();
    ctx.fillStyle = css(shade(body, -0.4));
    for (const d of [-1, 1] as const) {
      ctx.beginPath();
      ctx.arc(headX + d * headR * 0.36, headY + 0.1 * s, 1.15 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (style.tusks) {
      ctx.save();
      ctx.fillStyle = css(0xeee6cc);
      for (const d of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(headX + d * headR * 0.5, headY + headR * 0.55);
        ctx.lineTo(headX + d * headR * 0.72, headY + headR * 1.15);
        ctx.lineTo(headX + d * headR * 0.2, headY + headR * 0.72);
        ctx.closePath();
        ctx.fill();
        stroke(ctx, 1.1);
      }
      ctx.restore();
    }
    if (spec.archetype === 'worker') {
      // headband so settlers still read as a distinct family
      ctx.save();
      ctx.strokeStyle = css(accent, 0.9);
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath();
      ctx.moveTo(headX - headR * 0.9, headY - headR * 0.25);
      ctx.lineTo(headX + headR * 0.9, headY - headR * 0.35);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── front arm + weapon ────────────────────────────────────────────
  const shoulderL = { x: cx - 6 * s * facing + leanX * 0.4, y: shDraw + 2 * s };
  const elbowL = {
    x: shoulderL.x + Math.sin(pose.armUpperL) * 8 * s * facing,
    y: shoulderL.y + Math.cos(pose.armUpperL) * 8 * s,
  };
  const handL = {
    x: elbowL.x + Math.sin(pose.armUpperL + pose.armLowerL) * 7.5 * s * facing,
    y: elbowL.y + Math.cos(pose.armUpperL + pose.armLowerL) * 7.5 * s,
  };

  // weapon is held in the right hand, drawn in front so it reads clearly
  drawWeapon(ctx, spec, handR, pose, facing, s);

  // arms on top of the weapon grip
  tapered(ctx, shoulderR.x, shoulderR.y, elbowR.x, elbowR.y, 6 * s, 5 * s, shade(dark, 0.04));
  tapered(ctx, elbowR.x, elbowR.y, handR.x, handR.y, 5 * s, 4.2 * s, shade(body, 0.06));
  tapered(ctx, shoulderL.x, shoulderL.y, elbowL.x, elbowL.y, 6.4 * s, 5.2 * s, shade(body, 0.14));
  tapered(ctx, elbowL.x, elbowL.y, handL.x, handL.y, 5.2 * s, 4.4 * s, shade(body, 0.2));
  blob(ctx, handR.x, handR.y, 2.4 * s, 2.4 * s, 0, shade(trim, -0.15), 1, 1.1);
  blob(ctx, handL.x, handL.y, 2.4 * s, 2.4 * s, 0, shade(trim, -0.05), 1, 1.1);

  // shield (footman / squire) on the front arm
  if (style.shield) {
    // heater shield, held out to the front-left so it frames the body instead of covering it
    const shx = handL.x - 3.4 * s * facing;
    const shy = handL.y + pose.shieldUp * 3.5 * s;
    const w = 4.2 * s;
    const h = 6.4 * s;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(shx - w, shy - h * 0.75);
    ctx.lineTo(shx + w, shy - h * 0.75);
    ctx.quadraticCurveTo(shx + w * 1.02, shy + h * 0.35, shx, shy + h);
    ctx.quadraticCurveTo(shx - w * 1.02, shy + h * 0.35, shx - w, shy - h * 0.75);
    ctx.closePath();
    ctx.fillStyle = metal(ctx, shade(trim, 0.12), shx - w, shy - h, w * 2, h * 1.8);
    ctx.fill();
    stroke(ctx, 1.6);
    ctx.restore();
    // heraldry: accent cross
    ctx.save();
    ctx.strokeStyle = css(accent, 0.95);
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(shx, shy - h * 0.5);
    ctx.lineTo(shx, shy + h * 0.6);
    ctx.moveTo(shx - w * 0.62, shy - h * 0.1);
    ctx.lineTo(shx + w * 0.62, shy - h * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  // rim light along the top-left of the silhouette
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,246,214,0.20)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(cx - shoulderHalf + leanX + 1 * s, shDraw + 4 * s);
  ctx.quadraticCurveTo(cx - 1 * s + leanX, shDraw - 2.4 * s, cx + shoulderHalf + leanX - 1 * s, shDraw + 1 * s);
  ctx.stroke();
  ctx.restore();

  ctx.restore(); // death transform
  void mountY;
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  spec: ArtSpec,
  hand: { x: number; y: number },
  pose: Pose,
  facing: number,
  s: number,
): void {
  const ang = pose.weaponSwing * facing;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);
  const L = 17 * s;
  switch (spec.weapon) {
    case 'sword': {
      tapered(ctx, 0, 2 * s, 0, -L, 2.6 * s, 2.2 * s, 0x3b3f4a); // grip
      ctx.save();
      ctx.fillStyle = css(spec.accent);
      ctx.fillRect(-4.5 * s, -1.5 * s, 9 * s, 2.6 * s); // crossguard
      stroke(ctx, 1.2);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-1.9 * s, -2 * s);
      ctx.lineTo(1.9 * s, -2 * s);
      ctx.lineTo(1.3 * s, -L - 4 * s);
      ctx.lineTo(0, -L - 6.5 * s);
      ctx.lineTo(-1.3 * s, -L - 4 * s);
      ctx.closePath();
      ctx.fillStyle = metal(ctx, 0xd6dbe6, -2 * s, -L - 6 * s, 4 * s, L + 6 * s);
      ctx.fill();
      stroke(ctx, 1.3);
      ctx.restore();
      break;
    }
    case 'axe': {
      tapered(ctx, 0, 3 * s, 0, -L, 2.8 * s, 2.4 * s, 0x5b4630);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0.5 * s, -L + 1 * s);
      ctx.quadraticCurveTo(9 * s, -L - 2 * s, 11 * s, -L + 6 * s);
      ctx.quadraticCurveTo(6 * s, -L + 5 * s, 0.5 * s, -L + 7 * s);
      ctx.closePath();
      ctx.fillStyle = metal(ctx, 0xc9cfda, 0, -L - 4 * s, 12 * s, 12 * s);
      ctx.fill();
      stroke(ctx, 1.4);
      ctx.restore();
      break;
    }
    case 'bow': {
      ctx.save();
      ctx.strokeStyle = css(shade(spec.trim, 0.05));
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      ctx.arc(0, 0, 13 * s, -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,236,220,0.85)';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(Math.cos(-1.15) * 13 * s, Math.sin(-1.15) * 13 * s);
      ctx.lineTo(Math.cos(1.15) * 13 * s, Math.sin(1.15) * 13 * s);
      ctx.stroke();
      ctx.restore();
      if (pose.weaponSwing > 0.6) {
        // arrow nocked during the strike frames
        tapered(ctx, -2 * s, 0, 14 * s, 0, 1.6 * s, 1.2 * s, 0xd9c9a0);
      }
      break;
    }
    case 'staff': {
      tapered(ctx, 0, 6 * s, 0, -L - 6 * s, 2.6 * s, 2.2 * s, 0x5a4630);
      ctx.save();
      const glow = ctx.createRadialGradient(0, -L - 9 * s, 0.5 * s, 0, -L - 9 * s, 7 * s);
      glow.addColorStop(0, css(0xffffff, 0.95));
      glow.addColorStop(0.4, css(spec.accent, 0.85));
      glow.addColorStop(1, css(spec.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -L - 9 * s, 7 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(spec.accent);
      ctx.beginPath();
      ctx.arc(0, -L - 9 * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'pick': {
      tapered(ctx, 0, 4 * s, 0, -L + 2 * s, 2.4 * s, 2 * s, 0x6b5334);
      ctx.save();
      ctx.strokeStyle = css(0xb9c0cc);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(-5 * s, -L + 2 * s);
      ctx.quadraticCurveTo(0, -L - 3 * s, 6 * s, -L + 1 * s);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'claw': {
      ctx.save();
      ctx.strokeStyle = css(spec.accent);
      ctx.lineWidth = 2.2 * s;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (i - 1) * 3 * s);
        ctx.lineTo(10 * s, (i - 1) * 4 * s - 4 * s);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'lance': {
      tapered(ctx, -4 * s, 4 * s, 22 * s * facing, -8 * s, 3 * s, 1.8 * s, 0x6b5334);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(22 * s * facing, -8 * s);
      ctx.lineTo(29 * s * facing, -10 * s);
      ctx.lineTo(23 * s * facing, -5 * s);
      ctx.closePath();
      ctx.fillStyle = css(0xd6dbe6);
      ctx.fill();
      stroke(ctx, 1.1);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = css(spec.banner ?? spec.accent);
      ctx.beginPath();
      ctx.moveTo(6 * s, -4 * s);
      ctx.lineTo(6 * s - 6 * s * facing, 2 * s);
      ctx.lineTo(6 * s, 6 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'hammer': {
      tapered(ctx, 0, 3 * s, 0, -L, 3 * s, 2.6 * s, 0x5b4630);
      ctx.save();
      ctx.fillStyle = metal(ctx, 0x9aa2b0, -5 * s, -L - 6 * s, 11 * s, 9 * s);
      ctx.fillRect(-5 * s, -L - 6 * s, 11 * s, 8 * s);
      stroke(ctx, 1.4);
      ctx.restore();
      break;
    }
    case 'banner': {
      tapered(ctx, 0, 4 * s, 0, -L - 10 * s, 2.2 * s, 2 * s, 0x6b5334);
      ctx.save();
      ctx.fillStyle = css(spec.banner ?? spec.accent);
      ctx.beginPath();
      ctx.moveTo(0, -L - 10 * s);
      ctx.lineTo(-11 * s, -L - 6 * s);
      ctx.lineTo(0, -L - 1 * s);
      ctx.closePath();
      ctx.fill();
      stroke(ctx, 1.2);
      ctx.restore();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// ─────────────────────────── quadruped ───────────────────────────

export function drawQuadruped(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  spec: ArtSpec,
  pose: Pose,
  facing: number,
): void {
  const s = spec.scale;
  const body = spec.body;
  const trim = spec.trim;
  const accent = spec.accent;
  const bodyR = 15 * s;
  const cy = by - 15 * s - pose.bob;

  ctx.save();
  if (pose.fall > 0) {
    const ang = pose.fall * 1.25 * facing;
    ctx.translate(cx, by);
    ctx.rotate(ang);
    ctx.translate(-cx, -by + pose.crouch * 5 * s);
    ctx.globalAlpha = 1 - Math.max(0, pose.fall - 0.78) * 1.5;
  }

  // shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx, by - 1.5, bodyR * 1.05, bodyR * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const lunge = pose.lunge * 10 * s * facing;

  // far legs
  const legPairs: Array<[number, number, number]> = [
    [-bodyR * 0.7, pose.legUpperR, -0.24],
    [bodyR * 0.7, pose.legUpperL, -0.16],
    [-bodyR * 0.62, pose.legUpperL, 0.16],
    [bodyR * 0.62, pose.legUpperR, 0.24],
  ];
  legPairs.forEach(([dx, a, shadeAmt], i) => {
    const isFar = i < 2;
    const hx = cx + dx + lunge;
    const kneeX = hx + Math.sin(a) * 7 * s * facing;
    const kneeY = cy + bodyR * 0.5;
    const footX = kneeX + Math.sin(a * 0.4) * 5 * s * facing;
    tapered(ctx, hx, kneeY, footX, by - 2 * s, 5.4 * s, 3.6 * s, shade(body, isFar ? shadeAmt - 0.18 : shadeAmt));
    blob(ctx, footX, by - 2 * s, 3.2 * s, 1.8 * s, 0, shade(trim, -0.2), 1, 1.1);
  });

  // tail
  ctx.save();
  ctx.strokeStyle = css(shade(body, -0.14));
  ctx.lineWidth = 3.6 * s;
  ctx.beginPath();
  ctx.moveTo(cx - bodyR * 0.85, cy + 1 * s);
  ctx.quadraticCurveTo(cx - bodyR * 1.7, cy - 4 * s, cx - bodyR * 1.9 + pose.bob, cy - 13 * s);
  ctx.stroke();
  ctx.restore();

  // body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + lunge * 0.5, cy, bodyR, bodyR * 0.76, 0, 0, Math.PI * 2);
  ctx.fillStyle = metal(ctx, body, cx - bodyR, cy - bodyR, bodyR * 2, bodyR * 1.6);
  ctx.fill();
  stroke(ctx, 2);
  ctx.restore();

  // fur shading + ribs
  ctx.save();
  ctx.strokeStyle = css(shade(body, -0.3), 0.6);
  ctx.lineWidth = 1.2 * s;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * bodyR * 0.34 + lunge * 0.5, cy - bodyR * 0.5);
    ctx.quadraticCurveTo(cx + i * bodyR * 0.34 + 3 * s + lunge * 0.5, cy, cx + i * bodyR * 0.34 + lunge * 0.5, cy + bodyR * 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // spikes
  ctx.save();
  ctx.fillStyle = css(trim);
  for (let i = -2; i <= 2; i++) {
    const sx = cx + i * bodyR * 0.34 + lunge * 0.5;
    ctx.beginPath();
    ctx.moveTo(sx - 3.6 * s, cy - bodyR * 0.52);
    ctx.lineTo(sx, cy - bodyR * (0.95 + Math.abs(i) * 0.04));
    ctx.lineTo(sx + 3.6 * s, cy - bodyR * 0.52);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 1.2);
  }
  ctx.restore();

  // head (lunge pushes it forward)
  const headX = cx + bodyR * 1.0 + lunge * 1.5;
  const headY = cy - 3 * s + pose.headTilt * 6 * s;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(headX, headY, 9.4 * s, 8 * s, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metal(ctx, shade(body, 0.08), headX - 9 * s, headY - 8 * s, 18 * s, 16 * s);
  ctx.fill();
  stroke(ctx, 1.8);
  ctx.restore();
  // muzzle
  tapered(ctx, headX + 4 * s, headY + 2 * s, headX + 11 * s, headY + 4 * s, 7 * s, 5 * s, shade(body, -0.04));
  // tusks
  ctx.save();
  ctx.fillStyle = css(0xe8e2cc);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(headX + 8 * s, headY + 2 * s + dir * 3 * s);
    ctx.lineTo(headX + 14 * s, headY + 6 * s + dir * 4 * s);
    ctx.lineTo(headX + 8.6 * s, headY + 7 * s + dir * 4 * s);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 1.1);
  }
  ctx.restore();
  // ears
  ctx.save();
  ctx.fillStyle = css(shade(body, -0.1));
  ctx.beginPath();
  ctx.moveTo(headX - 5 * s, headY - 7 * s);
  ctx.lineTo(headX - 8 * s, headY - 14 * s);
  ctx.lineTo(headX - 1 * s, headY - 8.5 * s);
  ctx.closePath();
  ctx.fill();
  stroke(ctx, 1.2);
  ctx.restore();
  // glowing eyes
  ctx.save();
  ctx.shadowColor = css(accent, 0.9);
  ctx.shadowBlur = 6 * s;
  ctx.fillStyle = css(accent);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.arc(headX + 4 * s, headY - 3 * s + dir * 3 * s, 1.9 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

// ─────────────────────────── sheet assembly ───────────────────────────

export interface SheetResult {
  layout: UnitSheetLayout;
  /** world-space scale for the sprite (texture is supersampled) */
  texScale: number;
}

/** Draws every animation frame of one unit into a horizontal strip. */
export function renderUnitStrip(
  ctx: CanvasRenderingContext2D,
  spec: ArtSpec,
  layout: UnitSheetLayout,
  poses: Pose[],
  supersample: number,
): void {
  const cell = layout.cell;
  ctx.save();
  ctx.scale(supersample, supersample);
  for (let i = 0; i < poses.length; i++) {
    const ox = i * cell;
    ctx.save();
    ctx.translate(ox, 0);
    // keep each frame inside its own cell
    ctx.beginPath();
    ctx.rect(0, 0, cell, cell);
    ctx.clip();
    const cx = cell / 2;
    const by = cell * layout.originY;
    if (layout.category === 'human') drawHumanoid(ctx, cx, by, spec, poses[i], 1);
    else drawQuadruped(ctx, cx, by, spec, poses[i], 1);
    ctx.restore();
  }
  ctx.restore();
}

/** Feet-to-cell ratio, used as the sprite origin so units stand on their tile. */
export function originYFor(layout: UnitSheetLayout): number {
  return layout.originY;
}
