/**
 * Campaign smoke: every mission must be able to run to Victory.
 * For each mission it starts the map, verifies the generated layout (player base, camps,
 * resources, boss wiring) and then forces the objective chain to completion.
 *
 * Usage: node tests/campaign.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MISSIONS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10'];

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });

for (const id of MISSIONS) {
  await page.evaluate((missionId) => {
    window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId, heroId: 'knightCommander' });
  }, id);
  await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
  await sleep(1400);
  const layout = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    const w = b.world;
    const castle = w.buildings.find((x) => x.team === 1 && x.def.id === 'castle');
    const camps = w.buildings.filter((x) => x.team === 2 && x.def.id === 'wb_camp');
    const walkable = (() => {
      let n = 0;
      for (let ty = 0; ty < b.map.h; ty++) for (let tx = 0; tx < b.map.w; tx++) if (b.path.isFree(tx, ty)) n++;
      return n;
    })();
    return {
      mission: b.mission.id,
      hasCastle: !!castle,
      workers: w.units.filter((u) => u.team === 1 && u.def.role === 'worker').length,
      hero: !!w.hero,
      camps: camps.length,
      tents: w.buildings.filter((x) => x.team === 2 && x.def.id === 'wb_tent').length,
      resources: w.resources.length,
      monsters: w.units.filter((u) => u.team === 3).length,
      searchPoints: b.map.searchPoints.length,
      objectives: b.missions.objectives.length,
      optional: b.missions.objectives.filter((o) => o.def.optional).length,
      walkablePct: Math.round((walkable / (b.map.w * b.map.h)) * 100),
      reachable: (() => {
        // the hero must be able to path to the first enemy camp (proves the map is connected)
        const camp = camps[0];
        if (!camp || !w.hero) return false;
        const p = b.path.findPath(Math.floor(w.hero.x / 40), Math.floor(w.hero.y / 40), Math.floor(camp.x / 40), Math.floor(camp.y / 40));
        return !!p && p.length > 0;
      })(),
      boss: b.mission.boss.unitId,
    };
  });
  check(
    `campaign[${id}]: map + base + camps + resources + hero`,
    layout.hasCastle && layout.workers >= 4 && layout.hero && layout.camps >= 1 && layout.resources >= 8 && layout.monsters >= 3,
    JSON.stringify(layout),
  );
  check(`campaign[${id}]: hero can path from the base to the enemy camp`, layout.reachable, `walkable ${layout.walkablePct}%`);
  check(`campaign[${id}]: has main + optional objectives`, layout.objectives >= 2, `${layout.objectives} objectives (${layout.optional} optional)`);

  // drive the mission to victory: force the counters AND play the gameplay objectives
  for (let step = 0; step < 6; step++) {
    await page.evaluate(() => {
      const b = window.__AETHERIA_BATTLE__;
      b.speed = 8;
      b.missions.goldDeposited = 9999;
      b.missions.producedCombatUnits = 99;
      b.missions.unitsKilledByPlayer = 99;
      for (const bd of b.world.buildings.filter((x) => x.team === 2)) {
        b.missions.buildingsDestroyed.set(bd.def.id, (b.missions.buildingsDestroyed.get(bd.def.id) ?? 0) + 1);
      }
      // escort: walk the caravan onto the goal
      const caravan = b.world.units.find((u) => !u.dead && u.def.id === 'caravan');
      if (caravan) {
        const goal = b.map.landings[b.map.landings.length - 1] ?? b.map.playerStart;
        caravan.x = goal.x;
        caravan.y = goal.y;
        b.orders.stop([caravan]);
      }
      // rescue: hero frees the prisoner, then the prisoner goes home
      const prisoner = b.world.units.find((u) => !u.dead && u.def.id === 'prisoner');
      if (prisoner && b.world.hero) {
        b.world.hero.x = prisoner.x + 20;
        b.world.hero.y = prisoner.y + 20;
      }
      if (prisoner && prisoner.team === 1) {
        const castle = b.world.buildings.find((x) => !x.dead && x.team === 1 && x.def.id === 'castle');
        const home = castle ?? b.map.playerStart;
        prisoner.x = home.x + 30;
        prisoner.y = home.y + 30;
      }
      // collect: stand on every shrine so it flips to the player
      for (const shrine of b.world.buildings.filter((x) => !x.dead && x.def.id === 'neutral_shrine')) {
        shrine.captured = true;
        shrine.captureTeam = 1;
        shrine.faction = 'dawn';
        shrine.team = 1;
      }
      // defend: count waves as survived
      b.missions.wavesSurvived = 9;
      // survive: push the match clock
      if (b.mission.objectives.some((o) => o.kind === 'survive' && !o.optional)) b.world.elapsed = Math.max(b.world.elapsed, 600);
      // boss
      if (!b.ai.bossSpawned) b.ai.spawnBoss(b.mission);
      b.missions.bossSpawned = true;
      if (b.ai.boss && !b.ai.boss.dead) b.world.killUnit(b.ai.boss, 1);
    });
    await sleep(700);
    const done = await page.evaluate(() => window.__AETHERIA_BATTLE__.isEnded);
    if (done) break;
  }
  try {
    await page.waitForFunction(() => window.__AETHERIA_BATTLE__.isEnded, null, { timeout: 6000 });
  } catch { /* asserted below */ }
  const end = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    return { ended: b.isEnded, victory: b.missions.victory, states: b.missions.objectives.map((o) => `${o.def.id}:${o.state}`) };
  });
  check(`campaign[${id}]: reaches Victory`, end.ended && end.victory, end.states.join(' '));
}

await page.screenshot({ path: `${OUT}40-campaign.png` });
check('campaign: no runtime errors across all ten missions', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${failures === 0 ? 'ALL CAMPAIGN CHECKS PASSED' : `${failures} CAMPAIGN CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
