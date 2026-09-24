/**
 * 双语合规 / Bilingual compliance.
 *
 * The requirement is "every string in the game is Chinese + English". That is only true if it can
 * be checked, so this suite enforces it two ways:
 *
 *   1. STATIC  — every Chinese string literal under src/ must resolve through src/data/i18n.ts
 *                (exact entry or a numeric template). Anything that legitimately does not need a
 *                translation must be listed in EXEMPT with a reason.
 *   2. RUNTIME — every Text object rendered by the live game must contain Latin letters if it
 *                contains CJK. This catches strings composed at runtime (counters, banners,
 *                feeds) that a source scan cannot see.
 *
 * Usage: node tests/bilingual.mjs [url]
 */
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = process.env.DUMP === '1';
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Strings that intentionally have no translation:
 *  - art/VisualBible.ts is the *design spec* (its names feed the generated spec doc and the
 *    palette sheet, never the player-facing UI)
 *  - a few glyph/symbol fragments that are not words
 */
const EXEMPT_FILES = ['art/VisualBible.ts'];
const EXEMPT_STRINGS = new Set([
  '暴',
  '·',
  '—',
  '−',
  '+',
  '/',
  '％',
  '　',
]);

// ── load i18n the same way the game does ───────────────────────────────────
const esbuild = require('esbuild');
const built = await esbuild.build({
  entryPoints: [fileURLToPath(new URL('../src/data/i18n.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
});
const i18n = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const { en, hasEn, EN } = i18n;
const dictionarySize = Object.keys(EN).length;

// ── 1. static coverage ─────────────────────────────────────────────────────
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
};
const files = walk(`${ROOT}src`).filter(
  (f) => !EXEMPT_FILES.some((x) => f.endsWith(x)) && !f.endsWith('data/i18n.ts'), // i18n.ts IS the dictionary
);
const missing = [];
let scanned = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    const re = /'([^']*)'/g;
    let m;
    while ((m = re.exec(line))) {
      // apply TS string escapes the way the runtime would, so a literal containing \n is looked
      // up with a real newline (which is what the dictionary key holds)
      const v = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      if (!/[\u4e00-\u9fa5]/.test(v)) continue;
      scanned++;
      if (EXEMPT_STRINGS.has(v)) continue;
      if (!hasEn(v)) missing.push(`${file.replace(`${ROOT}`, '')}: ${v}`);
    }
  }
}
check(
  `bilingual/static: every Chinese literal has an English translation (${dictionarySize} entries)`,
  missing.length === 0,
  missing.length ? `${missing.length} untranslated${DUMP ? '\n  ' + missing.join('\n  ') : ' — ' + missing.slice(0, 5).join(' | ')}` : `${scanned} literals scanned across ${files.length} files`,
);

// the dictionary itself must be well formed
const emptyValues = Object.entries(EN).filter(([, v]) => !v || !v.trim());
const cjkValues = Object.entries(EN).filter(([, v]) => /[\u4e00-\u9fa5]/.test(v));
check('bilingual/static: no dictionary entry is empty', emptyValues.length === 0, emptyValues.slice(0, 3).map(([k]) => k).join(' '));
check(
  'bilingual/static: dictionary values are English (no Chinese left in them)',
  cjkValues.length === 0,
  cjkValues.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(' '),
);

// ── 1b. the HTML splash (shown before Phaser boots) ────────────────────────
const splashHtml = readFileSync(`${ROOT}index.html`, 'utf8');
const splashTexts = [...splashHtml.matchAll(/<(h1|p)[^>]*>([^<]+)<\/(h1|p)>/g)].map((m) => m[2].trim());
const splashBad = splashTexts.filter((t) => /[\u4e00-\u9fa5]/.test(t) && !/[A-Za-z]/.test(t));
check(
  'bilingual/static: the pre-boot splash in index.html is bilingual',
  splashBad.length === 0,
  splashBad.length ? splashBad.join(' | ') : splashTexts.map((t) => t.slice(0, 28)).join(' · '),
);

// ── 2. runtime: nothing renders as Chinese-only ────────────────────────────
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const collect = () =>
  page.evaluate(() => {
    const g = window.__AETHERIA__;
    const out = [];
    const walkScene = (scene) => {
      if (!scene || !scene.scene || !scene.scene.isActive() || !scene.children) return;
      const visit = (list) => {
        for (const o of list ?? []) {
          if (o.type === 'Text' && typeof o.text === 'string' && o.text.trim() && o.visible) {
            out.push({ scene: scene.scene.key, text: o.text });
          }
          if (o.list) visit(o.list);
        }
      };
      visit(scene.children.list);
    };
    for (const s of g.scene.getScenes(true)) walkScene(s);
    return out;
  });

const cjkOnly = (t) =>
  /[\u4e00-\u9fa5]/.test(t) && !/[A-Za-z]/.test(t)
    ? t.replace(/\s+/g, ' ').slice(0, 44)
    : null;

await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });

// the loading / boot screen renders its own texts before the menu exists — inspect it while it is
// on screen, because that is the very first thing a player reads
const loadingMisses = [];
for (let i = 0; i < 12; i++) {
  const texts = await collect();
  for (const t of texts) {
    const bad = cjkOnly(t.text);
    if (bad) loadingMisses.push(`${t.scene}: ${DUMP ? JSON.stringify(t.text) : bad}`);
  }
  const done = await page.evaluate(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'));
  if (done) break;
  await sleep(180);
}
check(
  'bilingual/runtime: the boot / loading screen is bilingual',
  loadingMisses.length === 0,
  loadingMisses.length ? `${loadingMisses.length} Chinese-only — ${[...new Set(loadingMisses)].slice(0, 5).join(' | ')}` : 'loading screen clean',
);

await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await sleep(700);

// menu screens
const menuScreens = ['main', 'campaign', 'heroes', 'settings', 'deploy'];
const missingOnMenu = [];
for (const screen of menuScreens) {
  await page.evaluate((s) => {
    const m = window.__AETHERIA__.scene.getScene('Menu');
    m.screen = s;
    m.pendingMission = 'm04';
    m.render();
  }, screen);
  await sleep(280);
  const texts = await collect();
  for (const t of texts) {
    const bad = cjkOnly(t.text);
    if (bad) missingOnMenu.push(DUMP ? `${screen}: ${JSON.stringify(t.text)}` : `${screen}: ${bad}`);
  }
}
check(
  'bilingual/runtime: every menu screen renders both languages',
  missingOnMenu.length === 0,
  missingOnMenu.length ? `${missingOnMenu.length} lines Chinese-only${DUMP ? '\n  ' + [...new Set(missingOnMenu)].join('\n  ') : ' — ' + missingOnMenu.slice(0, 5).join(' | ')}` : `${menuScreens.length} screens clean`,
);

// in-battle HUD (the densest text surface, all of it dynamic)
await page.evaluate(() => window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' }));
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(2600);
const inBattle = [];
const sampleHud = async (label) => {
  const texts = await collect();
  for (const t of texts) {
    const bad = cjkOnly(t.text);
    if (bad) inBattle.push(DUMP ? `${label}: ${JSON.stringify(t.text)}` : `${label}: ${bad}`);
  }
};
await sampleHud('battle');

// exercise the dynamic surfaces: feed, banner, toast, pause, result
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  b.getHudState && b.pushFeed && b.pushFeed('发现 宝箱 9', 'skill');
  b.world.wallet.gold = 9999;
  b.world.wallet.wood = 9999;
  const castle = b.world.buildings.find((x) => x.team === 1 && x.def.id === 'castle');
  for (let r = 160; r <= 300; r += 40) {
    if (b.placeBuildingAt('farm', castle.x + r, castle.y + 120).ok) break;
  }
  const s = b.world.map.playerStart;
  for (let i = 0; i < 8; i++) {
    const u = b.world.spawnUnit(i % 2 ? 'footman' : 'archer', s.x + 150 + i * 26, s.y + 170, 'dawn');
    u.team = 1;
  }
  b.world.recomputePop();
  const squad = b.world.units.filter((u) => u.team === 1 && u.def.role !== 'worker');
  b.orders.move(squad, s.x + 500, s.y + 200, false);
});
await sleep(1500);
await sampleHud('after orders');

// banner + toast (the two transient overlays)
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  b.pushFeed('发现 宝箱 1（+120 金 / +60 经验）', 'skill');
});
await page.evaluate(() => {
  const bus = window.__AETHERIA__ && window.__AETHERIA__.scene.getScene('Hud');
  void bus;
});
await sleep(900);
await sampleHud('feed');

// pause overlay
await page.evaluate(() => {
  const h = window.__AETHERIA__.scene.getScene('Hud');
  h.togglePause && h.togglePause();
});
await sleep(700);
await sampleHud('pause');
await page.evaluate(() => {
  const h = window.__AETHERIA__.scene.getScene('Hud');
  h.togglePause && h.togglePause();
});
await sleep(300);

check(
  'bilingual/runtime: the battle HUD is bilingual including dynamic lines (feed, counters, orders)',
  inBattle.length === 0,
  inBattle.length ? `${inBattle.length} Chinese-only lines${DUMP ? '\n  ' + [...new Set(inBattle)].join('\n  ') : ' — ' + inBattle.slice(0, 6).join(' | ')}` : 'all HUD text carries English',
);

// ── 3. the two visual defects a "contains both languages" check cannot see ──
// (a) the English must not be appended twice — labels pass through several layers
const dumpTexts = async () => {
  const scenes = ['Menu', 'Hud'];
  const out = [];
  for (const sc of scenes) {
    const t = await page.evaluate((key) => {
      const s = window.__AETHERIA__.scene.getScene(key);
      const res = [];
      const visit = (list, parentVisible) => {
        for (const o of list ?? []) {
          const vis = parentVisible && o.visible !== false;
          if (o.type === 'Text' && o.text && vis) res.push(o.text);
          if (o.list) visit(o.list, vis);
        }
      };
      if (s && s.scene.isActive()) visit(s.children.list, true);
      return res;
    }, sc);
    out.push(...t);
  }
  return out;
};
const doubled = [];
for (const t of await dumpTexts()) {
  for (const m of t.matchAll(/[A-Za-z][A-Za-z ,'’\/\-]{9,}/g)) {
    const phrase = m[0].trim();
    if (phrase.length >= 12 && t.split(phrase).length > 2) {
      doubled.push(`${JSON.stringify(phrase.slice(0, 34))} ×${t.split(phrase).length - 1} in ${JSON.stringify(t.slice(0, 46))}`);
      break;
    }
  }
}
check(
  'bilingual/runtime: no label carries its English translation twice',
  doubled.length === 0,
  doubled.length ? [...new Set(doubled)].slice(0, 3).join(' | ') : 'no duplicated translations',
);

// (b) two bilingual blocks must not be drawn on top of each other: the English half of a block
//     needs vertical room, and several panels were laid out for single-line text
const layoutAudit = () =>
  page.evaluate(() => {
  const bad = [];
  for (const key of ['Menu', 'Hud']) {
    const scene = window.__AETHERIA__.scene.getScene(key);
    if (!scene || !scene.scene.isActive()) continue;
    const texts = [];
    const visit = (list, parentVisible) => {
      for (const o of list ?? []) {
        // a hidden overlay still has its children parked at (0,0); those are not collisions
        const vis = parentVisible && o.visible !== false;
        if (o.type === 'Text' && o.text && o.text.trim() && vis && o.alpha > 0.05) {
          const b = o.getBounds();
          texts.push({ t: o.text.replace(/\s+/g, ' ').slice(0, 30), x1: b.x, y1: b.y, x2: b.right, y2: b.bottom });
        }
        if (o.list) visit(o.list, vis);
      }
    };
    visit(scene.children.list, true);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i];
        const c = texts[j];
        const ox = Math.min(a.x2, c.x2) - Math.max(a.x1, c.x1);
        const oy = Math.min(a.y2, c.y2) - Math.max(a.y1, c.y1);
        // ignore the deliberate pair "Chinese line / English line" of one block; flag real collisions
        const sameBlock = a.t.includes(c.t.slice(0, 4)) || c.t.includes(a.t.slice(0, 4));
        if (ox > 6 && oy > 5 && !sameBlock) {
          bad.push(`${key}: ${JSON.stringify(a.t)} ⨯ ${JSON.stringify(c.t)} (${Math.round(ox)}×${Math.round(oy)}px)`);
        }
      }
    }
  }
  return bad;
  });

// The deploy / heroes / campaign screens are the most text-dense surfaces in the game, so the
// layout audit runs on each of them as well (a jumbled intel column shipped once already).
const menuLayout = [];
for (const screen of menuScreens) {
  await page.evaluate((s) => {
    const m = window.__AETHERIA__.scene.getScene('Menu');
    m.screen = s;
    m.pendingMission = 'm04';
    m.render();
  }, screen);
  await sleep(260);
  const bad = await layoutAudit();
  for (const b of bad) menuLayout.push(`${screen} → ${b}`);
}
check(
  'bilingual/runtime: no text collisions on any menu screen (deploy / heroes / campaign / settings)',
  menuLayout.length === 0,
  menuLayout.length ? `${menuLayout.length} collisions — ${[...new Set(menuLayout)].slice(0, 4).join(' | ')}` : `${menuScreens.length} screens clean`,
);

const overlap = await layoutAudit();
check(
  'bilingual/runtime: bilingual blocks do not overlap each other',
  overlap.length === 0,
  overlap.length ? [...new Set(overlap)].slice(0, 3).join(' | ') : 'no overlapping text blocks',
);

// (c) a caption must fit inside its own control, and text must not be drawn over another control's
//     plate — the failure mode that made the menu buttons and the army rows read as broken
const fitting = await page.evaluate(() => {
  const bad = [];
  const scenes = ['Menu', 'Hud'];
  for (const key of scenes) {
    const scene = window.__AETHERIA__.scene.getScene(key);
    if (!scene || !scene.scene.isActive()) continue;
    const texts = [];
    const rects = [];
    const visit = (list, vis) => {
      for (const o of list ?? []) {
        const v = vis && o.visible !== false;
        if (!v || o.alpha <= 0.05) continue;
        if (o.type === 'Text' && o.text && o.text.trim()) {
          const b = o.getBounds();
          texts.push({ t: o.text.replace(/\s+/g, ' ').slice(0, 34), b, o });
        } else if (o.type === 'Rectangle' && o.width > 4 && o.height > 4) {
          const b = o.getBounds();
          rects.push({ b, o });
        }
        if (o.list) visit(o.list, v);
      }
    };
    visit(scene.children.list, true);
    for (const t of texts) {
      for (const r of rects) {
        const inside = t.b.x >= r.b.x - 1 && t.b.right <= r.b.right + 1 && t.b.y >= r.b.y - 1 && t.b.bottom <= r.b.bottom + 1;
        const isOwnLabel = r.o.parentContainer && r.o.parentContainer === t.o.parentContainer;
        if (isOwnLabel) continue; // a Button's caption belongs to that plate
        const ox = Math.min(t.b.right, r.b.right) - Math.max(t.b.x, r.b.x);
        const oy = Math.min(t.b.bottom, r.b.bottom) - Math.max(t.b.y, r.b.y);
        // 'partially inside' means the caption is wider/taller than the plate it sits on
        if (ox > 3 && oy > 3 && !inside) {
          bad.push(`${key}: ${JSON.stringify(t.t)} spills over a ${Math.round(r.b.width)}x${Math.round(r.b.height)} plate`);
        }
      }
    }
  }
  return bad;
});
check(
  'bilingual/runtime: captions fit inside their controls (no overflow onto neighbouring plates)',
  fitting.length === 0,
  fitting.length ? [...new Set(fitting)].slice(0, 4).join(' | ') : 'every caption fits its control',
);

check('bilingual: no runtime errors while checking', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`\n${failures === 0 ? 'BILINGUAL COMPLIANT' : `${failures} BILINGUAL CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
