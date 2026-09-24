/**
 * Product-form checks for the "hero lord" loop.
 *
 * These assert the things that make this a hero-led single-player fantasy RTS rather than a
 * skirmish demo: you choose your hero before a mission, each hero keeps their own progression,
 * the campaign is organised into acts, and the deployment screen shows the real loadout.
 *
 * Usage: node tests/product.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

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
await sleep(600);

// clear any previous save so progression assertions start from a known state
await page.evaluate(() => window.localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await sleep(600);

// ── 1. the roster is more than one hero, and each owns their progression ────
const roster = await page.evaluate(() => {
  const save = window.__AETHERIA__.__save ?? null;
  return save;
});
check('product: the save manager is reachable for verification', roster !== null, roster === null ? 'not exposed' : 'ok');

const progression = await page.evaluate(() => {
  const save = window.__AETHERIA__.__save;
  if (!save) return { error: 'no save' };
  // play as the knight, then switch to the mage: their records must be independent
  save.setActiveHero('knightCommander');
  save.current.hero.level = 7;
  save.current.hero.talents = { aegis: 2 };
  save.setActiveHero('arcaneMage');
  const mageLevel = save.current.hero.level;
  const knightRecord = save.heroRecord('knightCommander');
  return {
    mageLevel,
    knightLevel: knightRecord.level,
    knightTalents: knightRecord.talents,
    activeId: save.current.hero.id,
    distinct: knightRecord !== save.current.hero,
  };
});
check(
  'product: each hero keeps their own level (the mage starts fresh at 1 while the knight is 7)',
  progression.mageLevel === 1 && progression.knightLevel === 7,
  JSON.stringify(progression),
);
check(
  'product: talents and relics are per hero, not shared',
  progression.knightTalents && progression.knightTalents.aegis === 2 && progression.distinct,
  JSON.stringify(progression.knightTalents),
);
check('product: switching heroes actually switches the active record', progression.activeId === 'arcaneMage', progression.activeId);

// ── 2. campaign is organised into acts ──────────────────────────────────────
const campaign = await page.evaluate(() => {
  const m = window.__AETHERIA__.scene.getScene('Menu');
  m.screen = 'campaign';
  m.render();
  return { screen: m.screen, texts: m.children ? 0 : 0 };
});
void campaign;
// menu text lives inside a Container, so walk the display tree instead of the top-level list
const acts = await page.evaluate(() => {
  const menu = window.__AETHERIA__.scene.getScene('Menu');
  const out = [];
  const walk = (list) => {
    for (const o of list ?? []) {
      if (o.type === 'Text' && typeof o.text === 'string') out.push(o.text);
      if (o.list) walk(o.list);
    }
  };
  walk(menu.root?.list);
  walk(menu.children?.list);
  return out.filter((t) => t.includes('第') && t.includes('幕'));
});
check('product: the campaign is grouped into acts', acts.length >= 3, acts.join(' | '));
await page.screenshot({ path: `${OUT}62-campaign-acts.png` });

// ── 3. deployment screen: hero choice + real loadout + mission intel ────────
const deploy = await page.evaluate(() => {
  const menu = window.__AETHERIA__.scene.getScene('Menu');
  menu.pendingMission = 'm04';
  menu.selectedHero = 'ranger';
  menu.screen = 'deploy';
  menu.render();
  const texts = [];
  const walk = (list) => {
    for (const o of list ?? []) {
      if (o.type === 'Text' && typeof o.text === 'string') texts.push(o.text);
      if (o.list) walk(o.list);
    }
  };
  walk(menu.root?.list);
  walk(menu.children?.list);
  return { screen: menu.screen, hero: menu.selectedHero, texts };
});
check('product: the deployment screen opens for a mission', deploy.screen === 'deploy', deploy.screen);
check(
  'product: deployment shows mission intel (biome / time of day / par time / boss)',
  deploy.texts.some((t) => t.includes('战场')) && deploy.texts.some((t) => t.includes('最终 Boss')) && deploy.texts.some((t) => t.includes('目标时限')),
  deploy.texts.filter((t) => t.includes('战场') || t.includes('Boss')).join(' | '),
);
check(
  'product: deployment offers every hero in the roster',
  ['骑士指挥官', '奥术法师', '游侠'].every((name) => deploy.texts.some((t) => t.includes(name))),
  deploy.texts.filter((t) => t.includes('·')).slice(0, 4).join(' | '),
);
check(
  'product: deployment states the per-run blessing (the roguelite promise)',
  deploy.texts.some((t) => t.includes('随机祝福')),
  deploy.texts.find((t) => t.includes('祝福')) ?? '',
);
await page.screenshot({ path: `${OUT}63-deploy.png` });

// ── 4. the chosen hero is what actually enters the battle ───────────────────
await page.evaluate(() => {
  const menu = window.__AETHERIA__.scene.getScene('Menu');
  menu.selectedHero = 'arcaneMage';
  menu.pendingMission = 'm04';
  menu.startMission('m04');
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(2000);
const inBattle = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { hero: b.world.hero?.heroDef.id ?? null, mission: b.mission.id, active: window.__AETHERIA__.__save?.current.hero.id ?? null };
});
check(
  'product: the hero chosen on the deployment screen is the one that spawns',
  inBattle.hero === 'arcaneMage' && inBattle.mission === 'm04',
  JSON.stringify(inBattle),
);
check('product: the save follows the choice (per-hero progression stays aligned)', inBattle.active === 'arcaneMage', String(inBattle.active));

check('product: no runtime errors across the hero-lord loop', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`\n${failures === 0 ? 'HERO-LORD LOOP VERIFIED' : `${failures} PRODUCT CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
