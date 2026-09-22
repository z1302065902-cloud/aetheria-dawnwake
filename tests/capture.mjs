/**
 * Scene capture helper: starts a mission, stages a real fight and screenshots it.
 * Used for the milestone report / store page assets. `node tests/capture.mjs [url]`
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(TARGET, { waitUntil: 'load' });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'));
await sleep(700);
await page.screenshot({ path: `${OUT}10-title.png` });

await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__);
await sleep(1800);

// stage: a small army marching east with the hero, plus a fight at the camp
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1);
  b.world.wallet.gold = 4000;
  b.world.wallet.wood = 4000;
  for (let i = 0; i < 4; i++) b.world.spawnBuilding(i % 2 ? 'tower' : 'farm', castle.x - 120 + i * 130, castle.y + 210, 'dawn');
  const squad = [];
  for (let i = 0; i < 14; i++) {
    const u = b.world.spawnUnit(i % 3 === 0 ? 'archer' : 'footman', castle.x + 120 + (i % 5) * 34, castle.y + 60 + Math.floor(i / 5) * 34, 'dawn');
    u.team = 1;
    squad.push(u);
  }
  b.world.recomputePop();
  const camp = b.world.buildings.find((x) => x.team === 2 && x.def.id === 'wb_camp');
  b.orders.move([...squad, b.world.hero], camp.x - 260, camp.y - 120, true);
  b.cameras.main.centerOn(camp.x - 300, camp.y - 160);
  b.cameras.main.setZoom(0.95);
});
await sleep(9000);
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const camp = b.world.buildings.find((x) => x.team === 2 && x.def.id === 'wb_camp');
  b.cameras.main.centerOn(camp.x - 180, camp.y - 60);
});
await sleep(2500);
await page.screenshot({ path: `${OUT}11-battle.png` });

// boss close-up
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const boss = b.ai.spawnBoss(b.mission);
  b.cameras.main.setZoom(1.15);
  b.cameras.main.centerOn(boss.x, boss.y);
  const squad = b.world.units.filter((u) => u.team === 1);
  b.orders.attack(squad, boss);
});
await sleep(4000);
await page.screenshot({ path: `${OUT}12-boss.png` });

// abilities + HUD
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const h = b.world.hero;
  h.xp = 900;
  b.missions.updateHero();
  b.abilities.cast(h, 'warCry', h.x, h.y);
  b.abilities.cast(h, 'whirlwind', h.x, h.y);
  b.cameras.main.centerOn(h.x, h.y);
  b.cameras.main.setZoom(1.35);
});
await sleep(900);
await page.screenshot({ path: `${OUT}13-hero.png` });

console.log('captured 10-title / 11-battle / 12-boss / 13-hero into artifacts/');
await browser.close();
