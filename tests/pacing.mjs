/**
 * Single-player pacing measurement for mission 1.
 *
 * The design target is: understand the game in 5 minutes, first hero level-up by 10,
 * first large battle by 15, mission complete by 20. This test plays the map with a scripted
 * player (automation handles the economy, the script only does what a person would do) and
 * reports the real in-game clock at each milestone.
 *
 * Usage: node tests/pacing.mjs [url] [missionId]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const MISSION = process.argv[3] ?? 'm01';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

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
await page.evaluate((m) => window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: m, heroId: 'knightCommander' }), MISSION);
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1200);

// instrument the milestones
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  window.__PACE__ = { levelUp: null, firstWave: null, bigBattle: null, win: null, builtAt: null, armyAt: null, peakArmy: 0 };
  const P = window.__PACE__;
  const prevLevel = b.missions.onHeroLevel;
  b.missions.onHeroLevel = (lvl) => {
    if (P.levelUp === null) P.levelUp = Math.round(b.world.elapsed);
    prevLevel?.(lvl);
  };
  const prevWave = b.ai.onWave;
  b.ai.onWave = (i, n) => {
    if (P.firstWave === null) P.firstWave = Math.round(b.world.elapsed);
    prevWave?.(i, n);
  };
  // "large battle" = at least 6 player units trading blows with at least 3 enemies
  b.events.on('update', () => {
    const w = b.world;
    const mine = w.units.filter((u) => !u.dead && u.team === 1 && u.def.role !== 'worker' && !u.isHero);
    if (mine.length > P.peakArmy) P.peakArmy = mine.length;
    if (P.armyAt === null && mine.length >= 6) P.armyAt = Math.round(w.elapsed);
    if (P.bigBattle !== null) return;
    const engaged = mine.filter((u) => u.targetId >= 0 || u.state === 'attack').length;
    const foes = w.units.filter((u) => !u.dead && (u.team === 2 || u.team === 3));
    const foesNear = foes.filter((f) => mine.some((m) => Math.hypot(m.x - f.x, m.y - f.y) < 200)).length;
    if (engaged >= 6 && foesNear >= 3) P.bigBattle = Math.round(w.elapsed);
  });
  b.speed = 10;
});

// scripted player: build production, hunt with the hero, then push the camp once an army exists
const script = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find((x) => x.team === 1 && x.def.id === 'castle');
  const built = [];
  for (const defId of ['barracks', 'archery']) {
    // search outward for a legal spot, exactly like a player would
    outer: for (let r = 160; r <= 520; r += 40) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2 + r * 0.01;
        const res = b.placeBuildingAt(defId, castle.x + Math.cos(ang) * r, castle.y + Math.sin(ang) * r);
        if (res.ok) {
          built.push(`${defId}@${r}`);
          break outer;
        }
      }
    }
  }
  return { built, at: Math.round(b.world.elapsed) };
});
console.log(`脚本玩家：开局造了 ${script.built.join(' + ')}（t=${mmss(script.at)}）`);

let pushed = false;
for (let step = 0; step < 260; step++) {
  const state = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    const w = b.world;
    const hero = w.hero;
    const army = w.units.filter((u) => !u.dead && u.team === 1 && u.def.role !== 'worker' && !u.isHero);
    // hero hunts the nearest neutral beast (the "adventure" loop)
    if (hero && !hero.dead && hero.targetId < 0 && (hero.state === 'idle' || hero.state === 'move')) {
      let best = null;
      let bd = 1e9;
      for (const u of w.units) {
        if (u.dead || u.team !== 3) continue;
        const d = Math.hypot(u.x - hero.x, u.y - hero.y);
        if (d < bd) { bd = d; best = u; }
      }
      if (best && bd < 1400) b.orders.attack([hero], best);
    }
    return { army: army.length, ended: b.isEnded, elapsed: Math.round(w.elapsed), pace: { ...window.__PACE__ } };
  });
  // once a real army exists, push the enemy camp (this is the "large battle")
  if (!pushed && state.army >= 6) {
    pushed = true;
    await page.evaluate(() => {
      const b = window.__AETHERIA_BATTLE__;
      const camp = b.world.buildings.find((x) => !x.dead && x.team === 2 && x.def.id === 'wb_camp')
        ?? b.world.buildings.find((x) => !x.dead && x.team === 2);
      const army = b.world.units.filter((u) => !u.dead && u.team === 1 && u.def.role !== 'worker' && !u.isHero);
      if (camp && army.length) b.orders.attackMove(army, camp.x, camp.y);
      window.__PUSHED_AT__ = Math.round(b.world.elapsed);
    });
  }
  if (state.ended) break;
  if (state.elapsed > 1500) break; // hard stop at 25 game-minutes
  await sleep(700);
}

const final = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return {
    pace: { ...window.__PACE__ },
    ended: b.isEnded,
    victory: b.missions.victory,
    elapsed: Math.round(b.world.elapsed),
    parTime: b.mission.parTime,
    level: b.world.hero?.level ?? 0,
    pushedAt: window.__PUSHED_AT__ ?? null,
    states: b.missions.objectives.map((o) => `${o.def.id}:${o.state}`),
  };
});
const p = final.pace;
console.log('\n=== 实测节奏（游戏内时间）===');
console.log(`首次英雄升级 : ${p.levelUp === null ? '未发生' : mmss(p.levelUp)}   (目标 ≤ 10:00)`);
console.log(`第一波进攻   : ${p.firstWave === null ? '未发生' : mmss(p.firstWave)}`);
console.log(`部队成型(6人): ${p.armyAt === null ? '未发生' : mmss(p.armyAt)}`);
console.log(`首场大会战   : ${p.bigBattle === null ? '未发生' : mmss(p.bigBattle)}   (目标 10:00–18:00)`);
console.log(`开始推进敌营 : ${final.pushedAt === null ? '未发生' : mmss(final.pushedAt)}`);
console.log(`通关         : ${final.victory ? mmss(final.elapsed) : '未通关'}   (目标 ≤ 20:00，parTime ${mmss(final.parTime)})`);
console.log(`英雄等级     : ${final.level}　峰值部队 ${p.peakArmy}`);
console.log(`目标状态     : ${final.states.join(' ')}\n`);

check('pacing: the hero levels up within the first 10 minutes', p.levelUp !== null && p.levelUp <= 600, p.levelUp === null ? 'never' : mmss(p.levelUp));
check('pacing: an army is standing by 12 minutes', p.armyAt !== null && p.armyAt <= 720, p.armyAt === null ? 'never' : mmss(p.armyAt));
check('pacing: a large battle happens between 8 and 18 minutes', p.bigBattle !== null && p.bigBattle >= 480 && p.bigBattle <= 1080, p.bigBattle === null ? 'never' : mmss(p.bigBattle));
check('pacing: the mission can be finished inside par time', final.ended && final.victory && final.elapsed <= final.parTime, `${final.ended ? (final.victory ? 'victory' : 'defeat') : 'unfinished'} at ${mmss(final.elapsed)}`);
check('pacing: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.screenshot({ path: `${OUT}42-pacing.png` });
await browser.close();
console.log(`${failures === 0 ? 'PACING WITHIN TARGET' : `${failures} PACING CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
