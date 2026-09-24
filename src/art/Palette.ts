import { FACTION, REGION, UI, ELEMENT, SPECIAL, LIGHT, STYLE, toCss, shade } from './VisualBible';

/**
 * Every colour used by Aetheria comes from the Visual Bible (see VisualBible.ts). The art is generated procedurally
 * at runtime (see SpriteFactory / TerrainPainter) — no third party textures are
 * shipped or downloaded, so the visual identity is 100% original.
 */
/**
 * The palette is now DERIVED from the Visual Bible — this file exists only so existing call
 * sites keep their short names. Add colours to `VisualBible.ts`, never here.
 */
export const PAL = {
  // Dawn Kingdom
  dawnSteel: FACTION.dawn.metal,
  dawnBlue: FACTION.dawn.primary,
  dawnGold: FACTION.dawn.signal,
  dawnCloth: FACTION.dawn.cloth,
  // Wildborn
  wildBrown: FACTION.wildborn.primary,
  wildDark: FACTION.wildborn.secondary,
  wildGreen: 0x5a7a4a,
  wildBone: FACTION.neutral.signal,
  // Voidborn
  voidPurple: FACTION.voidborn.primary,
  voidDark: FACTION.voidborn.secondary,
  voidCyan: FACTION.voidborn.signal,
  // Nature
  grassA: REGION.valley.ground,
  grassB: REGION.valley.groundAlt,
  grassC: shade(REGION.valley.ground, -0.04),
  dirt: 0x8a7248,
  road: 0x9c8a62,
  water: 0x2f6f9f,
  waterDeep: 0x22567d,
  bridge: 0x8a6a42,
  stone: REGION.valley.stone,
  // UI
  uiBg: UI.panelDeep,
  uiPanel: UI.panel,
  uiPanelLight: UI.panelLight,
  uiBorder: UI.border,
  uiGold: UI.text.gold,
  uiText: UI.text.primary,
  uiDim: UI.text.dim,
  hp: UI.bar.hp,
  hpLow: UI.bar.hpLow,
  hpAlly: UI.bar.hpAlly,
  hpEnemy: UI.bar.hpEnemy,
  mana: UI.bar.mana,
  xp: UI.bar.xp,
  building: UI.text.gold,
};

/** Deterministic per-entity jitter so the same unit always looks the same. */
export function hash01(n: number): number {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  x = x - Math.floor(x);
  return x;
}

export { toCss, shade, ELEMENT, SPECIAL, LIGHT, STYLE, FACTION, REGION, UI };
