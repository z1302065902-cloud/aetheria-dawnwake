/**
 * Every colour used by Aetheria is defined here. The art is generated procedurally
 * at runtime (see SpriteFactory / TerrainPainter) — no third party textures are
 * shipped or downloaded, so the visual identity is 100% original.
 */
export const PAL = {
  // Dawn Kingdom
  dawnSteel: 0xb9c4d8,
  dawnBlue: 0x4b6cc1,
  dawnGold: 0xffd257,
  dawnCloth: 0xf0ead6,
  // Wildborn
  wildBrown: 0x8a5f3a,
  wildDark: 0x4f3520,
  wildGreen: 0x5a7a4a,
  wildBone: 0xd9c9a0,
  // Voidborn
  voidPurple: 0x6f4fbf,
  voidDark: 0x241a3d,
  voidCyan: 0x7fd8ff,
  // Nature
  grassA: 0x4a7a3e,
  grassB: 0x559042,
  grassC: 0x3d6b36,
  dirt: 0x8a7248,
  road: 0x9c8a62,
  water: 0x2f6f9f,
  waterDeep: 0x22567d,
  bridge: 0x8a6a42,
  stone: 0x8f8f96,
  // UI
  uiBg: 0x101728,
  uiPanel: 0x1a2440,
  uiPanelLight: 0x27355c,
  uiBorder: 0x4a5d8f,
  uiGold: 0xffd257,
  uiText: 0xe6ecff,
  uiDim: 0x8fa2c9,
  hp: 0x4ade80,
  hpLow: 0xef4444,
  hpAlly: 0x60d67a,
  hpEnemy: 0xef5350,
  mana: 0x4aa8ff,
  xp: 0xc084fc,
  building: 0xffd257,
};

/** Deterministic per-entity jitter so the same unit always looks the same. */
export function hash01(n: number): number {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  x = x - Math.floor(x);
  return x;
}

export function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

export function toCss(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
