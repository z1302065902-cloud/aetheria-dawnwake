/**
 * Responsive HUD layout regression.
 *
 * The HUD is drawn from a 1600x900 design box scaled by
 * `clamp(min(W/1600, H/900), 0.3, 1.6)`, so a wrong constant silently produces panels
 * that overlap or slide off-screen on a smaller window. This asserts, per viewport, that
 *   a) every panel is fully inside the viewport, and
 *   b) on supported desktop sizes the four bottom panels never overlap each other.
 *
 * Usage: node tests/layout.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Desktop is the supported target (spec: min 1280x720). The two phone profiles are
// included as *containment only* checks — mobile is explicitly out of scope, but the
// HUD must still not spill outside the viewport.
const PROFILES = [
  { name: '1920x1080 (desktop)', w: 1920, h: 1080, dpr: 1, strict: true },
  { name: '1600x900 (reference)', w: 1600, h: 900, dpr: 1, strict: true },
  { name: '1280x720 (min spec)', w: 1280, h: 720, dpr: 1, strict: true },
  { name: '1200x1113 (tall/retina)', w: 1200, h: 1113, dpr: 2, strict: true },
  { name: '844x390 (phone landscape)', w: 844, h: 390, dpr: 2, strict: false },
  { name: '390x844 (phone portrait)', w: 390, h: 844, dpr: 3, strict: false },
];

const BOTTOM_PANELS = ['minimap', 'heroPanel', 'commandPanel', 'abilityPanel'];

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});

const rectsOverlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

for (const p of PROFILES) {
  const context = await browser.newContext({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: p.dpr });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
  // a) menu screens (main / campaign / heroes / settings) must not overflow.
  //    These are desktop-only screens: on the two phone profiles they are allowed to
  //    overflow (documented as out of scope) — only the HUD must survive any viewport.
  const menuEscapes = [];
  const menuScreens = p.strict ? ['main', 'campaign', 'heroes', 'settings'] : ['main'];
  for (const screen of menuScreens) {
    const escaped = await page.evaluate((name) => {
      const menu = window.__AETHERIA__.scene.getScene('Menu');
      menu.screen = name;
      menu.render();
      const out = [];
      const rec = (list) => {
        for (const o of list) {
          if (o.list) rec(o.list);
          if (!o.visible) continue;
          const w = o.width ?? 0;
          const h = o.height ?? 0;
          if (!w || !h) continue;
          const ox = o.originX ?? 0.5;
          const oy = o.originY ?? 0.5;
          const x = (o.x ?? 0) - ox * w;
          const y = (o.y ?? 0) - oy * h;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            out.push(`${o.type}:NaN`);
            continue;
          }
          if (x < -2 || y < -2 || x + w > window.innerWidth + 2 || y + h > window.innerHeight + 2) {
            out.push(`${o.type}(${x.toFixed(0)},${y.toFixed(0)},${w.toFixed(0)}x${h.toFixed(0)})`);
          }
        }
      };
      rec(menu.children.list);
      return out;
    }, screen);
    if (escaped.length > 0) menuEscapes.push(`${screen}: ${escaped.slice(0, 4).join(' ')}`);
  }
  check(
    `layout[${p.name}]: menu screens fit the viewport${p.strict ? ' (main/campaign/heroes/settings)' : ' (main only — phones are out of scope)'}`,
    menuEscapes.length === 0,
    menuEscapes.join(' | '),
  );

  await page.evaluate(() => {
    window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
  });
  await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__ && window.__AETHERIA__.scene.isActive('Hud'), null, { timeout: 30000 });
  await sleep(1200);

  const dbg = await page.evaluate(() => {
    const hud = window.__AETHERIA__.scene.getScene('Hud');
    return hud.getLayoutDebug();
  });
  const { viewport, rects } = dbg;
  const find = (n) => rects.find((r) => r.name === n);

  // a) containment
  const escaped = rects.filter((r) => r.x < -0.5 || r.y < -0.5 || r.x + r.w > viewport.w + 0.5 || r.y + r.h > viewport.h + 0.5);
  check(
    `layout[${p.name}]: every HUD panel is inside the viewport`,
    escaped.length === 0,
    escaped.length === 0
      ? `${rects.length} rects, scale ${viewport.scale.toFixed(2)}`
      : escaped.map((r) => `${r.name}(${r.x.toFixed(0)},${r.y.toFixed(0)},${r.w.toFixed(0)}x${r.h.toFixed(0)})`).join(' '),
  );

  // ability buttons must sit inside the ability panel (icon overflow check)
  const abPanel = find('abilityPanel');
  const btns = rects.filter((r) => r.name.startsWith('abilityBtn'));
  const btnsOutside = abPanel ? btns.filter((b) => b.x < abPanel.x - 0.5 || b.x + b.w > abPanel.x + abPanel.w + 0.5 || b.y < abPanel.y - 0.5 || b.y + b.h > abPanel.y + abPanel.h + 0.5) : btns;
  check(`layout[${p.name}]: 4 ability buttons fit inside the ability panel`, btns.length === 4 && btnsOutside.length === 0, `${btns.length} buttons, ${btnsOutside.length} outside`);

  // b) overlaps (desktop only)
  if (p.strict) {
    const panels = BOTTOM_PANELS.map(find).filter(Boolean);
    const overlaps = [];
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        if (rectsOverlap(panels[i], panels[j])) overlaps.push(`${panels[i].name}×${panels[j].name}`);
      }
    }
    const top = find('topStrip');
    const obj = find('objectives');
    if (top && obj && rectsOverlap(top, obj)) overlaps.push('topStrip×objectives');
    if (obj && abPanel && rectsOverlap(obj, abPanel)) overlaps.push('objectives×abilityPanel');
    check(`layout[${p.name}]: bottom panels do not overlap`, overlaps.length === 0, overlaps.join(' '));
  }

  check(`layout[${p.name}]: no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: `${OUT}layout-${p.w}x${p.h}.png` });
  await context.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL LAYOUT CHECKS PASSED' : `${failures} LAYOUT CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
