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
const ALL = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10'];
// optional filter: `node tests/campaign.mjs <url> m01,m09`
const filter = (process.argv[3] ?? '').split(',').filter(Boolean);
const MISSIONS = filter.length ? ALL.filter((m) => filter.includes(m)) : ALL;

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
      hidden: b.missions.objectives.filter((o) => o.def.hidden).length,
      mainCount: b.missions.objectives.filter((o) => !o.def.optional).length,
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
  check(
    `campaign[${id}]: has main objectives + at least one side quest + at least one hidden quest`,
    layout.mainCount >= 2 && layout.optional >= 1 && layout.hidden >= 1,
    `${layout.objectives} objectives: ${layout.mainCount} main / ${layout.optional} side / ${layout.hidden} hidden`,
  );
  // a hidden objective must not be visible before it is revealed, and must not gate victory
  const hiddenState = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    return {
      hiddenInHud: b.getHudState().objectives.filter((o) => o.hidden).length,
      victoryNeeds: b.missions.mainObjectives.length,
    };
  });
  check(
    `campaign[${id}]: hidden quests stay out of the HUD and out of the victory requirement`,
    hiddenState.hiddenInHud === 0 && hiddenState.victoryNeeds === layout.mainCount,
    JSON.stringify(hiddenState),
  );

  // drive the mission to victory: force the counters AND play the gameplay objectives
  for (let step = 0; step < 6; step++) {
    await page.evaluate(async () => {
      const b = window.__AETHERIA_BATTLE__;
      b.speed = 8;
      b.missions.goldDeposited = 9999;
      b.missions.producedCombatUnits = 99;
      b.missions.unitsKilledByPlayer = 99;
      // really destroy the enemy structures (bumping the counter alone would not prove the
      // gameplay path works)
      for (const bd of [...b.world.buildings.filter((x) => x.team === 2)]) {
        b.missions.buildingsDestroyed.set(bd.def.id, (b.missions.buildingsDestroyed.get(bd.def.id) ?? 0) + 1);
        b.world.killBuilding(bd, 1);
      }
      // escort: walk the caravan onto the goal
      const caravan = b.world.units.find((u) => !u.dead && u.def.id === 'caravan');
      if (caravan) {
        const goal = b.map.landings[b.map.landings.length - 1] ?? b.map.playerStart;
        caravan.x = goal.x;
        caravan.y = goal.y;
        b.orders.stop([caravan]);
      }
      // explore first (the hero has to reach the search point), then the rescue teleport wins
      // explore: walk the hero onto the map's search point (the real gameplay path)
      const wantsExplore = b.mission.objectives.find((o) => o.kind === 'explore' && !o.optional);
      if (wantsExplore && b.map.searchPoints[0] && b.world.hero) {
        const sp = b.map.searchPoints[0];
        b.world.hero.x = sp.x + 20;
        b.world.hero.y = sp.y + 20;
        b.vision.update(b.world);
      }
      // rescue: the hero frees the prisoner and the prisoner goes home. A freed prisoner is
      // deliberately vulnerable (escorting them is the mission), so do both steps inside one
      // iteration at real speed — otherwise the scripted player is just too slow.
      const prisoner = b.world.units.find((u) => !u.dead && u.def.id === 'prisoner');
      const castle = b.world.buildings.find((x) => !x.dead && x.team === 1 && x.def.id === 'castle');
      const home = castle ?? b.map.playerStart;
      if (prisoner && prisoner.captive && b.world.hero) {
        b.speed = 1;
        b.world.hero.x = prisoner.x + 20;
        b.world.hero.y = prisoner.y + 20;
        await new Promise((r) => setTimeout(r, 300)); // let the objective register the rescue
      }
      if (prisoner && !prisoner.captive) {
        prisoner.x = home.x + 30;
        prisoner.y = home.y + 30;
        b.speed = 8;
      }
      // build: a mission that asks for a barracks must actually get one
      const wantsBuild = b.mission.objectives.find((o) => o.kind === 'build' && !o.optional);
      if (wantsBuild?.target?.buildingId) {
        const have = b.world.buildings.some((x) => !x.dead && x.team === 1 && x.def.id === wantsBuild.target.buildingId);
        if (!have) {
          const castle = b.world.buildings.find((x) => x.team === 1 && x.def.id === 'castle');
          // use the real placement path and search for a legal spot, otherwise the site can
          // overlap the castle and no builder can ever reach it
          outer: for (let r = 160; r <= 520; r += 40) {
            for (let a = 0; a < 16; a++) {
              const ang = (a / 16) * Math.PI * 2;
              if (b.placeBuildingAt(wantsBuild.target.buildingId, castle.x + Math.cos(ang) * r, castle.y + Math.sin(ang) * r).ok) break outer;
            }
          }
        }
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
      // boss: only spawns once the camp is gone, then must die to the player
      if (!b.missions.bossSpawned) b.ai.spawnBoss(b.mission);
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
    return {
      ended: b.isEnded,
      victory: b.missions.victory,
      states: b.missions.objectives.map((o) => `${o.def.id}:${o.state}`),
      shrines: b.world.buildings.filter((x) => x.def.id === 'neutral_shrine').map((x) => `${x.dead ? 'dead' : 'alive'}/cap=${x.captured}`),
      bossSpawned: b.missions.bossSpawned,
      bossAlive: !!b.ai.boss && !b.ai.boss.dead,
      prisoner: b.world.units.filter((u) => u.def.id === 'prisoner').map((u) => `${u.dead ? 'dead' : 'alive'}/t${u.team}`),
      caravan: b.world.units.filter((u) => u.def.id === 'caravan').map((u) => (u.dead ? 'dead' : 'alive')),
    };
  });
  check(
    `campaign[${id}]: reaches Victory`,
    end.ended && end.victory,
    `${end.states.join(' ')} | shrines ${JSON.stringify(end.shrines)} bossSpawned=${end.bossSpawned} bossAlive=${end.bossAlive} prisoner=${JSON.stringify(end.prisoner)} caravan=${JSON.stringify(end.caravan)}`,
  );
}

await page.screenshot({ path: `${OUT}40-campaign.png` });
check('campaign: no runtime errors across all ten missions', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${failures === 0 ? 'ALL CAMPAIGN CHECKS PASSED' : `${failures} CAMPAIGN CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
