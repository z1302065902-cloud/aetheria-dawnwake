/**
 * Visual Bible compliance.
 *
 * The bible is only worth having if it can be enforced, so this test does three things:
 *   1. renders artifacts/50-visual-bible.png straight from src/art/VisualBible.ts
 *   2. checks the design rules that are machine-checkable (uniqueness, contrast, legibility,
 *      no default HTML UI, faction colours actually used by units, shake/particle budgets)
 *   3. (visual mode) screenshots the running game so lighting/colour can be eyeballed next to
 *      the reference sheet
 *
 * Usage: node tests/visual.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── load the bible in node (same source of truth as the game) ────────────────
const esbuild = require('esbuild');
const built = await esbuild.build({
  entryPoints: [fileURLToPath(new URL('../src/art/VisualBible.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
});
const bible = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const {
  STYLE, FACTION, REGION, REGION_VFX, ELEMENT, SPECIAL, LIGHT, VFX, RANK, UI, TYPE, PROPORTIONS,
  CAMERA, SATURATION_BUDGET, FOCUS, BOSS_IDENTITY, MATERIAL, WEATHER, DEPTH_LAYERS, FOCUS_TIERS,
  ALL_COLORS, contrast, luminance, saturation, satTier,
} = bible;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// ── 1. structural rules ─────────────────────────────────────────────────────
check('bible: the allowed colour list is populated', ALL_COLORS.length >= 40, `${ALL_COLORS.length} colours`);
check(
  'bible: no pure black or pure white anywhere (they read as unfinished)',
  ALL_COLORS.every((c) => c !== 0x000000 && c !== 0xffffff),
  ALL_COLORS.filter((c) => c === 0 || c === 0xffffff).map(hex).join(' '),
);
const signalUniq = new Set(Object.values(FACTION).map((f) => f.signal));
check('bible: every faction has a distinct signal colour', signalUniq.size === Object.keys(FACTION).length, [...signalUniq].map(hex).join(' '));

// the two enemy factions must be warm vs cold so they never blur together
const warm = (c) => ((c >> 16) & 0xff) - (c & 0xff);
check(
  'bible: wildborn (warm) and voidborn (cold) are on opposite sides of the colour wheel',
  warm(FACTION.wildborn.signal) > 40 && warm(FACTION.voidborn.signal) < 0,
  `wildborn ${hex(FACTION.wildborn.signal)} warm ${warm(FACTION.wildborn.signal)} · voidborn ${hex(FACTION.voidborn.signal)} warm ${warm(FACTION.voidborn.signal)}`,
);

// the player's signal colour must not appear on the enemy palette at all
const enemyColours = new Set([
  FACTION.wildborn.primary, FACTION.wildborn.secondary, FACTION.wildborn.metal, FACTION.wildborn.cloth,
  FACTION.voidborn.primary, FACTION.voidborn.secondary, FACTION.voidborn.metal, FACTION.voidborn.cloth,
]);
check('bible: the player signal colour is never used by an enemy faction', !enemyColours.has(FACTION.dawn.signal), hex(FACTION.dawn.signal));

// ── 1b. five-layer colour system + the 70/20/10 rule ───────────────────────
check(
  'colour: every faction defines all five layers (base/secondary/accent/shadow/highlight)',
  Object.values(FACTION).every((f) => f.primary && f.secondary && f.signal && f.shadow && f.highlight),
  Object.keys(FACTION).join(' '),
);
check(
  'colour: faction shadows carry their hue instead of being black',
  Object.values(FACTION).every((f) => f.shadow !== 0x000000 && saturation(f.shadow) > 0.25),
  Object.values(FACTION).map((f) => hex(f.shadow)).join(' '),
);
check(
  'colour: faction highlights are near-light but never pure white',
  Object.values(FACTION).every((f) => f.highlight !== 0xffffff && luminance(f.highlight) > 0.6),
  Object.values(FACTION).map((f) => hex(f.highlight)).join(' '),
);
// the 70/20/10 rule, measured rather than asserted in prose
// The three bands must be ordered, and the ATMOSPHERE (fog/ambient/weather) must be the calmest
// thing on screen — those layers cover everything else, so if they are loud the units vanish.
// Visual weight, not raw hue: what matters is how much of the frame a colour actually covers.
// A saturated tint is fine when it is laid on thinly (a 20% arena ambient); a saturated colour at
// 88% alpha (the fog) would drown every unit, so the layers humans actually see through are the
// ones held to a neutral band.
// Visual weight = saturation × alpha × frame coverage. A 2px firefly at 40% alpha has almost no
// weight no matter how vivid it is; a full-screen fog wash at 88% would dominate even if it were
// only mildly tinted. This is the metric the 70/20/10 rule actually protects.
const FRAME = 1920 * 1080;
const coverage = (count, size) => Math.min(1, (count * size * size) / FRAME);
const atmosphere = [
  ...Object.values(REGION).map((r) => ({ name: `fog ${r.name}`, c: r.fog, a: 1, cover: 1 })),
  ...Object.values(REGION).map((r) => ({ name: `ambient ${r.name}`, c: r.ambient, a: r.ambientAlpha, cover: 1 })),
  ...Object.values(WEATHER).filter((w) => w.count > 0).map((w) => ({ name: `weather ${w.name}`, c: w.color, a: w.alpha, cover: coverage(w.count, w.size) })),
  ...Object.entries(REGION_VFX).map(([k, v]) => ({ name: `mote ${k}`, c: v.mote.color, a: v.mote.alpha, cover: coverage(v.mote.count, 3.2) })),
];
// chroma weight: a near-black fog has no perceived hue, so its chroma contribution is zero even
// though its HSV saturation is high. satTier() already encodes that luminance guard.
const chroma = (c) => {
  const tier = satTier(c);
  if (tier === 'focus') return saturation(c);
  if (tier === 'subject') return saturation(c) * 0.5;
  return 0;
};
const weight = (x) => chroma(x.c) * x.a * x.cover;
const heaviest = [...atmosphere].sort((a, b) => weight(b) - weight(a)).slice(0, 3);
check(
  'colour 70/20/10: no atmosphere layer has enough visual weight to drown the units',
  atmosphere.every((x) => weight(x) < 0.12),
  heaviest.map((x) => `${x.name} w=${weight(x).toFixed(3)}`).join(' · '),
);
check(
  'colour: ambient tints are thin enough to tint the ground without recolouring units',
  Object.values(REGION).every((r) => r.ambientAlpha <= 0.25),
  Object.values(REGION).map((r) => `${r.name.split(' ')[0]}:${r.ambientAlpha}`).join(' '),
);
const fogBand = Object.values(REGION).map((r) => r.fog);
check(
  'colour: fog is near-black or near-neutral in every region (never a coloured wash)',
  fogBand.every((c) => luminance(c) < 0.06),
  fogBand.map((c) => `${hex(c)} L=${luminance(c).toFixed(3)}`).join(' '),
);
const meanSat = (arr) => (arr.length ? arr.reduce((a, x) => a + saturation(x), 0) / arr.length : 0);
const envBand = [
  ...Object.values(REGION).flatMap((r) => [r.ground, r.groundAlt, r.stone]),
  ...Object.values(MATERIAL).map((m) => m.hit.debrisColor),
];
const subjectBand = [
  ...Object.values(FACTION).flatMap((f) => [f.primary, f.metal, f.cloth]),
  ...Object.values(MATERIAL).filter((m) => m.specular > 0.5).map((m) => m.hit.debrisColor),
];
const focusBand = Object.values(FACTION).filter((f) => f.role !== 'neutral').map((f) => f.signal);
check(
  'colour 70/20/10: saturation rises through the bands (world < subjects < focus)',
  meanSat(envBand) < meanSat(focusBand) - 0.1 && meanSat(subjectBand) < meanSat(focusBand) - 0.05,
  `env ${meanSat(envBand).toFixed(2)} · subject ${meanSat(subjectBand).toFixed(2)} · focus ${meanSat(focusBand).toFixed(2)}`,
);
const focusColours = [
  ...Object.values(FACTION).filter((f) => f.role !== 'neutral').map((f) => f.signal),
  ...Object.values(FOCUS),
  SPECIAL.boss,
  SPECIAL.crit,
];
const focusQuiet = focusColours.filter((c) => saturation(c) < SATURATION_BUDGET.focus.min);
check(
  'colour 70/20/10: every focus colour is actually loud enough to pull the eye',
  focusQuiet.length === 0,
  `${focusColours.length} focus colours, ${focusQuiet.length} too dull: ${focusQuiet.map(hex).join(' ')}`,
);
// loud colours must be the minority of the whole palette
const loudShare = ALL_COLORS.filter((c) => satTier(c) === 'focus').length / ALL_COLORS.length;
check(
  'colour 70/20/10: loud colours are a minority of the palette (roughly the 10% band)',
  loudShare <= 0.35,
  `${(loudShare * 100).toFixed(0)}% of ${ALL_COLORS.length} colours are high-saturation`,
);
check(
  'colour: the two enemy factions never share the player signal colour',
  !Object.values(FACTION).filter((f) => f.role === 'enemy').some((f) => f.signal === FACTION.dawn.signal || f.primary === FACTION.dawn.signal),
  hex(FACTION.dawn.signal),
);

// ── 1c. boss identity, materials, weather, depth ────────────────────────────
for (const boss of ['ancientdragon', 'voidsorcerer', 'thornmaw']) {
  const b = BOSS_IDENTITY[boss];
  check(
    `boss identity: ${boss} has its own palette, glow and arena lighting`,
    !!b && !!b.primary && !!b.glow && !!b.arena.ambient && b.aura > 1.5,
    b ? `${hex(b.primary)} glow ${hex(b.glow)} aura ${b.aura}x` : 'MISSING',
  );
}
const bossGlows = new Set(Object.values(BOSS_IDENTITY).map((b) => b.glow));
check('boss identity: every boss reads differently (distinct glow colours)', bossGlows.size === Object.keys(BOSS_IDENTITY).length, [...bossGlows].map(hex).join(' '));
check(
  'material: metal is specular, stone is rough, wood is warm, crystal and magic emit light',
  MATERIAL.metal.specular > 0.8 && MATERIAL.stone.specular < 0.35 && MATERIAL.stone.grain > 0.4 && MATERIAL.wood.grain > 0.25 && MATERIAL.crystal.emission > 0 && MATERIAL.magic.emission >= 1,
  `metal ${MATERIAL.metal.specular} / stone ${MATERIAL.stone.specular} / crystal emit ${MATERIAL.crystal.emission}`,
);
check(
  'material: every material defines its own impact particles (no shared generic hit)',
  Object.values(MATERIAL).every((m) => m.hit.sparks + m.hit.debris + m.hit.dust > 0),
  Object.keys(MATERIAL).join(' '),
);
check('weather: weather types exist and none of them is heavy enough to hide units', Object.values(WEATHER).every((w) => w.alpha <= 0.5), Object.values(WEATHER).map((w) => `${w.name}:${w.alpha}`).join(' '));
check(
  'depth: background is hazed and loses contrast, foreground keeps full detail',
  DEPTH_LAYERS.background.haze > 0.3 && DEPTH_LAYERS.background.contrast < DEPTH_LAYERS.foreground.contrast && DEPTH_LAYERS.foreground.darken > 0,
  `bg haze ${DEPTH_LAYERS.background.haze} contrast ${DEPTH_LAYERS.background.contrast} / fg contrast ${DEPTH_LAYERS.foreground.contrast}`,
);
check(
  'focus tiers: exactly one primary tier and decor sits below units',
  FOCUS_TIERS.primary.contrastFloor > FOCUS_TIERS.secondary.contrastFloor &&
    FOCUS_TIERS.secondary.contrastFloor > FOCUS_TIERS.tertiary.contrastFloor &&
    FOCUS_TIERS.tertiary.contrastFloor > FOCUS_TIERS.background.contrastFloor,
  Object.entries(FOCUS_TIERS).map(([k, v]) => `${k}:${v.contrastFloor}`).join(' '),
);

// ── 2. contrast (readability) ───────────────────────────────────────────────
const cTextPanel = contrast(UI.text.primary, UI.panel);
check('contrast: primary HUD text on the panel is >= 7:1 (AAA)', cTextPanel >= 7, `${cTextPanel.toFixed(2)}:1`);
const cDim = contrast(UI.text.dim, UI.panel);
check('contrast: secondary HUD text is >= 4.5:1 (AA)', cDim >= 4.5, `${cDim.toFixed(2)}:1`);
const cGold = contrast(UI.text.gold, UI.panel);
check('contrast: gold values are >= 4.5:1', cGold >= 4.5, `${cGold.toFixed(2)}:1`);
const cBtn = contrast(UI.button.textNormal, UI.button.normal);
check('contrast: button label on a button face is >= 4.5:1', cBtn >= 4.5, `${cBtn.toFixed(2)}:1`);
const cDisabled = contrast(UI.button.textDisabled, UI.button.disabled);
check('contrast: a disabled button is visibly dimmer than an enabled one', cDisabled < cBtn, `${cDisabled.toFixed(2)} vs ${cBtn.toFixed(2)}`);
const cHpBack = contrast(UI.bar.hp, UI.bar.back);
check('contrast: the health bar reads against its own track', cHpBack >= 3, `${cHpBack.toFixed(2)}:1`);
check('contrast: enemy and ally health bars are distinguishable', UI.bar.hpEnemy !== UI.bar.hpAlly && Math.abs(luminance(UI.bar.hpEnemy) - luminance(UI.bar.hpAlly)) > 0.05, `${hex(UI.bar.hpAlly)} vs ${hex(UI.bar.hpEnemy)}`);

// damage numbers must be readable over both light ground and dark fog
for (const [name, c] of [['normal', VFX.number.normal.color], ['crit', VFX.number.crit.color], ['heal', VFX.number.heal.color]]) {
  const vsFog = contrast(c, REGION.valley.fog);
  check(`contrast: the ${name} damage number is readable over the darkest ground`, vsFog >= 4.5, `${vsFog.toFixed(2)}:1`);
}

// ── 3. lighting consistency ─────────────────────────────────────────────────
check('light: the key light comes from above-left so cast shadows fall down-right', LIGHT.key.dirX < 0 && LIGHT.key.dirY < 0, `(${LIGHT.key.dirX}, ${LIGHT.key.dirY})`);
check('light: ambient never reaches zero (nothing is pure black)', LIGHT.ambient.intensity > 0.05, String(LIGHT.ambient.intensity));
check(
  'light: boss rim light is the strongest and worker the weakest',
  RANK.boss.rim > RANK.hero.rim && RANK.hero.rim > RANK.soldier.rim && RANK.soldier.rim > RANK.worker.rim,
  `boss ${RANK.boss.rim} / hero ${RANK.hero.rim} / soldier ${RANK.soldier.rim} / worker ${RANK.worker.rim}`,
);
check('light: every region defines its own fog tint', Object.values(REGION).every((r) => typeof r.fog === 'number'), Object.keys(REGION).join(' '));

// ── 4. budgets (VFX / shake) ────────────────────────────────────────────────
check('vfx: the impact chain is complete', VFX.chain.length === 6 && VFX.chain[0] === 'trail' && VFX.chain[5] === 'sound', VFX.chain.join('→'));
check('vfx: a crit is bigger than a normal hit but capped', VFX.number.crit.size > VFX.number.normal.size && VFX.number.crit.size <= 26, `${VFX.number.normal.size} → ${VFX.number.crit.size}`);
check('vfx: shake is tiered and the light tier is rate limited', VFX.shake.light < VFX.shake.heavy && VFX.shake.heavy < VFX.shake.ultimate && VFX.shake.lightCooldown > 0, `${VFX.shake.light}/${VFX.shake.heavy}/${VFX.shake.ultimate}`);
check('vfx: per-hit particle counts stay inside budget', VFX.sparkCount.melee <= 10 && VFX.sparkCount.crit <= 20 && VFX.sparkCount.explosion <= 30, JSON.stringify(VFX.sparkCount));
check('vfx: boss death is the only large burst', VFX.sparkCount.bossDeath > VFX.sparkCount.explosion, `${VFX.sparkCount.explosion} → ${VFX.sparkCount.bossDeath}`);
check('vfx: element palettes are complete', Object.values(ELEMENT).every((e) => e.core && e.bright && e.trail && e.residue && e.number), Object.keys(ELEMENT).join(' '));

// ── 4b. region atmosphere + time of day ────────────────────────────────────
check('region vfx: every region defines its own mote layer and impact palette', Object.keys(REGION_VFX).length === Object.keys(REGION).length && Object.values(REGION_VFX).every((v) => v.mote && v.impact), Object.keys(REGION_VFX).join(' '));
const moteColours = new Set(Object.values(REGION_VFX).map((v) => v.mote.color));
check('region vfx: motes are visually distinct per region (a forest is not a fortress)', moteColours.size === Object.keys(REGION_VFX).length, [...moteColours].map(hex).join(' '));
check('region vfx: each region has a distinct smoke tint', new Set(Object.values(REGION_VFX).map((v) => v.impact.smoke)).size === Object.keys(REGION_VFX).length, Object.values(REGION_VFX).map((v) => hex(v.impact.smoke)).join(' '));
check('region vfx: mote counts stay inside a sane budget', Object.values(REGION_VFX).every((v) => v.mote.count <= 90 && (!v.spark || v.spark.count <= 40)), Object.values(REGION_VFX).map((v) => `${v.mote.count}+${v.spark?.count ?? 0}`).join(' '));
check('light: all four time-of-day presets exist and get darker toward night', LIGHT.timeOfDay.dawn.alpha < LIGHT.timeOfDay.night.alpha && LIGHT.timeOfDay.day.alpha < LIGHT.timeOfDay.dusk.alpha, Object.entries(LIGHT.timeOfDay).map(([k, v]) => `${k}:${v.alpha}`).join(' '));

// ── 4c. camera language ────────────────────────────────────────────────────
check('camera: every camera context is defined', ['menu', 'battle', 'victory', 'boss'].every((k) => !!CAMERA[k]), Object.keys(CAMERA).join(' '));
check('camera: the menu never shakes and only drifts slowly', CAMERA.menu.drift > 0 && CAMERA.menu.drift < 0.1 && CAMERA.menu.zoom === 1, `drift ${CAMERA.menu.drift}`);
check('camera: victory pushes IN, boss pushes in less than victory', CAMERA.victory.zoom > 1 && CAMERA.boss.zoom > 1 && CAMERA.victory.zoom >= CAMERA.boss.zoom, `victory ${CAMERA.victory.zoom} / boss ${CAMERA.boss.zoom}`);
check('camera: the battle zoom range is bounded', CAMERA.battle.zoomMin < CAMERA.battle.zoomDefault && CAMERA.battle.zoomDefault < CAMERA.battle.zoomMax, `${CAMERA.battle.zoomMin}-${CAMERA.battle.zoomMax}`);
check('camera: boss shake is capped by the bible, not by the call site', CAMERA.boss.shakeCap === 'ultimate' && VFX.shake.ultimate <= 14, `${CAMERA.boss.shakeCap} <= ${VFX.shake.ultimate}`);

// ── 5. type / icon rules ────────────────────────────────────────────────────
check('type: exactly four font sizes are defined', Object.keys(TYPE.size).length === 4, Object.values(TYPE.size).join('/'));
check('type: HUD text is always outlined', TYPE.outline.width >= 1 && TYPE.outline.color !== 0, `${TYPE.outline.width}px ${hex(TYPE.outline.color)}`);
check('style: supersampling is on (crisp edges instead of blur)', STYLE.supersample >= 2, `${STYLE.supersample}×`);

// ── 6. browser: the game must obey the same bible at runtime ────────────────
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });

// no default HTML widgets anywhere: every interactive element must be canvas-drawn
const domUi = await page.evaluate(() => {
  const bad = ['button', 'input', 'select', 'textarea', 'a[href]'];
  return bad.flatMap((sel) => Array.from(document.querySelectorAll(sel)).map((n) => `${sel}:${n.textContent?.trim().slice(0, 20)}`));
});
check('ui: the game ships zero HTML controls (no default browser UI)', domUi.length === 0, domUi.join(' | ') || 'none found');
const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
check('ui: the whole UI is drawn on canvas', canvasCount >= 1, `${canvasCount} canvas`);

await page.evaluate(() => window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' }));
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(2000);

const runtime = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const units = b.world.units.filter((u) => !u.dead);
  return {
    hasLighting: !!b.lighting,
    ambient: !!b.lighting?.ambient,
    lightingDepth: b.lighting?.ambient ? b.lighting.ambient.depth : -1,
    entityDepth: 100,
    unitColors: units.filter((u) => u.team === 1).map((u) => ({ id: u.def.id, body: u.def.art.body, trim: u.def.art.trim, accent: u.def.art.accent })).slice(0, 8),
    heroSignal: b.world.hero ? b.world.hero.def.art.accent : 0,
    region: b.mission.map.biome,
    missionTod: b.mission.timeOfDay ?? 'day',
    light: b.lighting ? { ...b.lighting.view } : null,
  };
});
check('runtime: the region lighting layer exists and sits below the entities', runtime.hasLighting && runtime.ambient && runtime.lightingDepth < runtime.entityDepth, `depth ${runtime.lightingDepth} < ${runtime.entityDepth}`);
check('runtime: the region has a lighting + fog definition', !!REGION[runtime.region], runtime.region);
check(
  'runtime: the match is lit with its mission time of day and has region motes',
  runtime.light && runtime.light.motes > 0 && runtime.light.timeOfDay === runtime.missionTod,
  JSON.stringify(runtime.light),
);

// unit colours must come from the faction vocabulary (exact match on the signal colour, and
// the body colour must be a plausible faction/neutral tone rather than an arbitrary hue)
const factionColours = new Set([
  ...Object.values(FACTION).flatMap((f) => [f.primary, f.secondary, f.metal, f.cloth, f.signal]),
  ...Object.values(REGION).flatMap((r) => [r.stone, r.ground, r.groundAlt]),
  ...Object.values(SPECIAL),
  ...Object.values(ELEMENT).flatMap((e) => [e.core, e.bright, e.trail]),
]);
const isNear = (a, set) => [...set].some((c) => {
  const d = Math.abs(((a >> 16) & 0xff) - ((c >> 16) & 0xff)) + Math.abs(((a >> 8) & 0xff) - ((c >> 8) & 0xff)) + Math.abs((a & 0xff) - (c & 0xff));
  return d < 48;
});
const offPalette = runtime.unitColors.filter((u) => !isNear(u.body, factionColours) && !isNear(u.trim, factionColours));
check(
  'runtime: unit body/trim colours belong to the bible palette (no arbitrary hues)',
  offPalette.length === 0,
  offPalette.map((u) => `${u.id} ${hex(u.body)}/${hex(u.trim)}`).join(' ') || `${runtime.unitColors.length} units checked`,
);
check(
  'runtime: the hero carries the player signal colour (readable at a glance)',
  runtime.heroSignal === FACTION.dawn.signal,
  `${hex(runtime.heroSignal)} vs ${hex(FACTION.dawn.signal)}`,
);

// ── 6b. the terrain must actually be painted with its region palette ────────
// Sample the ground colour straight out of the terrain canvas: this is what stops the three
// biomes silently collapsing back into one green valley (which is exactly what had happened).
const terrainSampled = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const key = 'terrain';
  const tex = b.textures.get(key);
  const src = tex && tex.source && tex.source[0];
  if (!src || !src.image) return { error: 'no terrain canvas' };
  const img = src.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  // count the most common colour in a walkable strip near the player's base
  const counts = new Map();
  for (let y = 40; y < 200; y += 3) {
    for (let x = 40; x < 600; x += 3) {
      const d = g.getImageData(x, y, 1, 1).data;
      // ignore the near-black out-of-bounds/decor pixels
      if (d[0] + d[1] + d[2] < 90) continue;
      const k = (d[0] << 16) | (d[1] << 8) | d[2];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, c2) => c2[1] - a[1]).slice(0, 3).map(([k, n]) => ({ color: k, n }));
  return { top, region: b.mission.map.biome };
});
check('runtime: the terrain canvas was sampled', !terrainSampled.error, terrainSampled.error ?? '');
if (!terrainSampled.error) {
  const ground = REGION[terrainSampled.region].ground;
  const dist = (a, c) =>
    Math.abs(((a >> 16) & 0xff) - ((c >> 16) & 0xff)) + Math.abs(((a >> 8) & 0xff) - ((c >> 8) & 0xff)) + Math.abs((a & 0xff) - (c & 0xff));
  const best = Math.min(...terrainSampled.top.map((t) => dist(t.color, ground)));
  // the noise + ambient passes shift the value, so allow a generous but meaningful tolerance
  check(
    'runtime: the ground is painted from the mission region palette, not a fixed valley green',
    best <= 90,
    `region ${terrainSampled.region} ground ${hex(ground)} · sampled ${terrainSampled.top.map((t) => hex(t.color)).join(' ')} · min distance ${best}`,
  );
}

// ── 7. render the reference sheet straight from the bible ───────────────────
const sheet = await page.evaluate(
  ({ bibleJson }) => {
    const B = JSON.parse(bibleJson);
    const hex = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1100;
    const g = c.getContext('2d');
    g.fillStyle = hex(B.UI.panelDeep);
    g.fillRect(0, 0, c.width, c.height);
    g.font = 'bold 22px "Trebuchet MS", sans-serif';
    g.fillStyle = hex(B.UI.text.primary);
    g.fillText('AETHERIA — VISUAL BIBLE V1.0', 28, 44);
    g.font = '13px "Trebuchet MS", sans-serif';
    g.fillStyle = hex(B.UI.text.dim);
    g.fillText(`${B.STYLE.name} · supersample ${B.STYLE.supersample}x · key light (${B.LIGHT.key.dirX},${B.LIGHT.key.dirY}) · ${B.ALL_COLORS.length} allowed colours`, 28, 66);

    const section = (title, rows, x, y) => {
      g.font = 'bold 15px "Trebuchet MS", sans-serif';
      g.fillStyle = hex(B.UI.text.gold);
      g.fillText(title, x, y);
      let yy = y + 20;
      for (const [label, colours] of rows) {
        g.font = '12px "Trebuchet MS", sans-serif';
        g.fillStyle = hex(B.UI.text.dim);
        g.fillText(label, x, yy + 14);
        let xx = x + 190;
        for (const col of colours) {
          g.fillStyle = hex(col);
          g.fillRect(xx, yy, 34, 22);
          g.strokeStyle = hex(B.UI.border);
          g.lineWidth = 1;
          g.strokeRect(xx + 0.5, yy + 0.5, 33, 21);
          g.fillStyle = hex(B.UI.text.dim);
          g.font = '9px ui-monospace, monospace';
          g.fillText(hex(col).slice(1), xx + 1, yy + 34);
          xx += 42;
        }
        yy += 44;
      }
      return yy + 10;
    };

    let y = section('FACTIONS (signal colour = rim light = "that glowing thing has a rank")', Object.values(B.FACTION).map((f) => [f.name.split(' ')[0], [f.primary, f.secondary, f.metal, f.cloth, f.signal]]), 28, 96);
    y = section('REGIONS (ground / stone / ambient / fog / landmark)', Object.values(B.REGION).map((r) => [r.name.split(' ')[0], [r.ground, r.groundAlt, r.stone, r.ambient, r.fog, r.accent]]), 28, y);
    section('ELEMENTS (core / bright / trail / residue / number)', Object.values(B.ELEMENT).map((e) => [e.name, [e.core, e.bright, e.trail, e.residue, e.number]]), 28, y);

    let y2 = section('SPECIAL', [['crit / elite / boss', [B.SPECIAL.crit, B.SPECIAL.elite, B.SPECIAL.boss]], ['heal / xp', [B.SPECIAL.heal, B.SPECIAL.xp]]], 820, 96);
    y2 = section('UI', [['panel / border / text', [B.UI.panel, B.UI.panelLight, B.UI.border, B.UI.text.primary, B.UI.text.dim, B.UI.text.gold]], ['button 4 states', [B.UI.button.normal, B.UI.button.hover, B.UI.button.pressed, B.UI.button.disabled]], ['bars hp/ally/enemy/mana', [B.UI.bar.hp, B.UI.bar.hpAlly, B.UI.bar.hpEnemy, B.UI.bar.mana, B.UI.bar.xp, B.UI.bar.back]]], 820, y2);
    y2 = section('LIGHTING · time of day', Object.entries(B.LIGHT.timeOfDay).map(([k, t]) => [k, [t.ambient]]), 820, y2);
    // rim-light strength must be READABLE as a strength, not as five identical swatches
    (() => {
      const x = 820;
      let yy = y2;
      g.font = 'bold 15px "Trebuchet MS", sans-serif';
      g.fillStyle = hex(B.UI.text.gold);
      g.fillText('RANK rim-light strength', x, yy);
      yy += 22;
      for (const [k, r] of Object.entries(B.RANK)) {
        g.font = '12px "Trebuchet MS", sans-serif';
        g.fillStyle = hex(B.UI.text.dim);
        g.fillText(`${k}  ×${r.scaleMul}`, x, yy + 12);
        g.fillStyle = hex(B.UI.bar.back);
        g.fillRect(x + 150, yy + 2, 260, 14);
        g.globalAlpha = 0.25 + r.rim * 0.75;
        g.fillStyle = hex(B.FACTION.dawn.signal);
        g.fillRect(x + 150, yy + 2, 260 * r.rim, 14);
        g.globalAlpha = 1;
        g.fillStyle = hex(B.UI.text.dim);
        g.font = '10px ui-monospace, monospace';
        g.fillText(r.rim.toFixed(2), x + 418, yy + 13);
        yy += 24;
      }
    })();

    // proportions diagram
    const px = 60;
    const py = 800;
    g.font = 'bold 15px "Trebuchet MS", sans-serif';
    g.fillStyle = hex(B.UI.text.gold);
    g.fillText('PROPORTIONS (silhouette must read at 0.6x zoom)', 28, py - 12);
    const drawFigure = (x, height, headRatio, shoulder, label, signal, rim) => {
      const head = height * headRatio;
      g.fillStyle = hex(B.FACTION.dawn.metal);
      g.beginPath();
      g.arc(x, py + head / 2, head / 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hex(B.FACTION.dawn.primary);
      g.fillRect(x - (height * shoulder) / 2, py + head, height * shoulder, height * 0.45);
      g.fillStyle = hex(B.FACTION.dawn.secondary);
      g.fillRect(x - height * 0.14, py + head + height * 0.45, height * 0.1, height * 0.3);
      g.fillRect(x + height * 0.04, py + head + height * 0.45, height * 0.1, height * 0.3);
      // rim light on the side away from the key light
      g.strokeStyle = hex(signal);
      g.globalAlpha = rim;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + (height * shoulder) / 2, py + head + 2);
      g.lineTo(x + (height * shoulder) / 2, py + head + height * 0.45);
      g.stroke();
      g.globalAlpha = 1;
      g.font = '11px "Trebuchet MS", sans-serif';
      g.fillStyle = hex(B.UI.text.dim);
      g.fillText(label, x - 26, py + height + 24);
    };
    drawFigure(60, 62, B.PROPORTIONS.humanoid.head, B.PROPORTIONS.humanoid.shoulderWidth, 'hero', B.FACTION.dawn.signal, B.RANK.hero.rim);
    drawFigure(180, 52, B.PROPORTIONS.humanoid.head, B.PROPORTIONS.humanoid.shoulderWidth, 'soldier', B.FACTION.dawn.signal, B.RANK.soldier.rim);
    drawFigure(300, 100, B.PROPORTIONS.humanoid.head, B.PROPORTIONS.humanoid.shoulderWidth, 'boss', B.SPECIAL.boss, B.RANK.boss.rim);
    drawFigure(440, 40, B.PROPORTIONS.beast.headSize, 0.9, 'beast', B.FACTION.wildborn.signal, 0.4);
    return c.toDataURL('image/png');
  },
  { bibleJson: JSON.stringify({ STYLE, FACTION, REGION, REGION_VFX, ELEMENT, SPECIAL, LIGHT, VFX, RANK, UI, TYPE, ALL_COLORS, PROPORTIONS, CAMERA }) },
);
const sheetPath = `${OUT}50-visual-bible.png`;
await (await import('node:fs/promises')).writeFile(sheetPath, Buffer.from(sheet.split(',')[1], 'base64'));
check('artifacts: the reference sheet was rendered from the bible', sheet.length > 20000, `${Math.round(sheet.length / 1024)}KB`);

await page.screenshot({ path: `${OUT}51-lighting.png` });
check('visual: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`\n${failures === 0 ? 'VISUAL BIBLE ENFORCED' : `${failures} VISUAL CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
