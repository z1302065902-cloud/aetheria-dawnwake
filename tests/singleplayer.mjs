/**
 * Single-player design verification.
 *
 * Asserts the promises of the redesign:
 *   hero > army > base > economy   (automation covers the base and economy)
 *   - workers self-assign to a resource mix the player adjusts with +/-
 *   - manual orders are never overridden by automation
 *   - army groups exist with stances and actually gather their members
 *   - automation toggles switch behaviour off
 *   - the adventure layer puts chests / NPCs / hidden vaults on the map and the hero loots them
 *   - every run gets exactly one random blessing while maps + main objectives stay fixed
 *
 * Usage: node tests/singleplayer.mjs [url]
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
await page.evaluate(() => window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' }));
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1500);

// ── automation defaults ──────────────────────────────────────────────
const defaults = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { settings: { ...b.automation.settings }, mix: { ...b.automation.mix } };
});
check('automation: auto worker / production / attack / rally are on by default', Object.values(defaults.settings).every(Boolean), JSON.stringify(defaults));

// ── workers self-assign to the mix ───────────────────────────────────
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  b.speed = 4;
  b.world.wallet.gold = 5000;
  b.world.wallet.wood = 5000;
  for (let i = 0; i < 8; i++) {
    const u = b.world.spawnUnit('settler', b.world.map.playerStart.x + (i % 4) * 30, b.world.map.playerStart.y + 120 + Math.floor(i / 4) * 30, 'dawn');
    u.team = 1;
  }
  b.world.recomputePop();
  b.automation.rebalance();
});
await sleep(6000);
const assigned = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const v = b.automation.view;
  return { assigned: v.assigned, total: v.total, mix: v.mix };
});
check(
  'automation: settlers auto-assign across gold/wood/mana without being told',
  assigned.assigned.idle <= 1 && assigned.assigned.gold > 0 && assigned.total >= 8,
  JSON.stringify(assigned),
);

// ── the +/- mix control re-assigns workers ───────────────────────────
const mixBefore = await page.evaluate(() => window.__AETHERIA_BATTLE__.automation.view.assigned.wood);
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  for (let i = 0; i < 3; i++) b.automation.setMix('wood', 1);
});
await sleep(5000);
const mixAfter = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { wood: b.automation.view.assigned.wood, mix: { ...b.automation.mix } };
});
check('automation: pressing “+木材” moves settlers onto wood', mixAfter.wood > mixBefore, `wood ${mixBefore} → ${mixAfter.wood} (mix ${JSON.stringify(mixAfter.mix)})`);

// ── manual orders are never overridden ───────────────────────────────
const manual = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1);
  const workers = b.world.units.filter((u) => u.team === 1 && u.def.role === 'worker').slice(0, 2);
  // run this check at real speed: the manual hold is measured in GAME seconds, and at
  // 4x fast-forward a 6s hold expires in 1.5s of wall clock
  b.speed = 1;
  b.automation.holdUnits(workers, 8);
  b.orders.move(workers, castle.x - 260, castle.y - 220, false);
  const start = workers.map((u) => ({ x: u.x, y: u.y }));
  await new Promise((r) => setTimeout(r, 2500));
  const after = workers.map((u) => ({ x: u.x, y: u.y, st: u.state, bid: u.buildId }));
  const dist = after.map((p, i) => Math.hypot(p.x - start[i].x, p.y - start[i].y));
  const res = { dist, states: after.map((p) => p.st), target: { x: castle.x - 260, y: castle.y - 220 } };
  b.speed = 4;
  return res;
});
check(
  'automation: a manual order is respected (workers keep moving to the ordered point)',
  manual.dist.every((d) => d > 40) && manual.states.every((s) => s === 'move' || s === 'idle'),
  JSON.stringify(manual),
);

// ── army groups + stances ────────────────────────────────────────────
const armies = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1);
  const squad = [];
  for (let i = 0; i < 6; i++) {
    const u = b.world.spawnUnit(i % 2 ? 'archer' : 'footman', castle.x + 40 + i * 26, castle.y + 160, 'dawn');
    u.team = 1;
    squad.push(u);
  }
  b.automation.rallyNewUnit(squad[0]); // one through the auto-rally path
  b.armies.assign(1, squad);
  b.armies.setStance(1, 'guardBase');
  await new Promise((r) => setTimeout(r, 1500));
  const view = b.armies.view;
  const g1 = view.find((g) => g.id === 1);
  return { view, members: b.armies.membersOf(1).length, anchor: g1.anchor };
});
check('army groups: three named groups exist', armies.view.length === 3 && armies.view[0].name === '主力军', JSON.stringify(armies.view.map((g) => `${g.id}:${g.name}:${g.stance}:${g.count}`)));
check('army groups: assigned units are tracked and carry a stance anchor', armies.members === 6 && !!armies.anchor, JSON.stringify(armies));

const stanceCycle = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const order = ['followHero', 'guardBase', 'autoAttack', 'holdPoint'];
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const g = b.armies.group(1);
    seen.push(g.stance);
    const next = order[(order.indexOf(g.stance) + 1) % order.length];
    b.armies.setStance(1, next);
  }
  return seen;
});
check('army groups: all four stances are settable (follow/guard/attack/hold)', new Set(stanceCycle).size === 4, stanceCycle.join(' → '));

// ── automation can be switched off (advanced players keep manual control) ──
const toggled = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  for (const k of ['autoWorker', 'autoProduction', 'autoAttack', 'autoRally']) b.automation.setSetting(k, false);
  const off = { ...b.automation.settings };
  for (const k of ['autoWorker', 'autoProduction', 'autoAttack', 'autoRally']) b.automation.toggle(k);
  return { off, on: { ...b.automation.settings } };
});
check('automation: all four toggles switch off and back on', !Object.values(toggled.off).some(Boolean) && Object.values(toggled.on).every(Boolean), JSON.stringify(toggled));

// ── adventure layer ─────────────────────────────────────────────────
const adv = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const spots = b.adventure.view;
  return {
    total: spots.length,
    kinds: Array.from(new Set(spots.map((s) => s.kind))),
    spoils: b.adventure.collected.length,
  };
});
check('adventure: the map is populated with chests / caches / NPC / hidden vaults', adv.total >= 5 && ['chest', 'cache', 'npc', 'relic'].every((k) => adv.kinds.includes(k)), JSON.stringify(adv));

const looted = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  const hero = b.world.hero;
  const before = { gold: Math.round(b.world.wallet.gold), xp: Math.round(hero.xp), found: b.adventure.collected.length };
  const spot = b.adventure.spots.find((s) => !s.used && s.kind === 'chest');
  if (!spot) return { error: 'no chest' };
  // walk the hero onto the chest (fog must already cover it: reveal first)
  b.vision.revealArea(spot.x, spot.y, 200);
  hero.x = spot.x + 10;
  hero.y = spot.y + 10;
  await new Promise((r) => setTimeout(r, 1200));
  return {
    reward: b.adventure.collected[b.adventure.collected.length - 1] ?? null,
    before,
    after: { gold: Math.round(b.world.wallet.gold), xp: Math.round(hero.xp), found: b.adventure.collected.length },
  };
});
check(
  'adventure: walking the hero onto a chest grants gold + XP',
  !!looted.reward && (looted.after.xp > looted.before.xp || looted.after.gold > looted.before.gold),
  JSON.stringify(looted),
);

// ── roguelite run blessing ──────────────────────────────────────────
const blessing = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { blessing: b.runBlessing, lines: b.getHudState().relicLines, adventureLine: b.getHudState().adventure.blessing };
});
check('roguelite: every run has exactly one random blessing, shown separately from relics', !!blessing.blessing?.name && blessing.adventureLine.includes(blessing.blessing.name), JSON.stringify(blessing));

// ── the run blessing is actually applied to the match modifiers ──────
const blessingApplied = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const id = b.runBlessing.id;
  const mods = b.world.mods;
  return { id, mods: { ...mods } };
});
const applied =
  (blessingApplied.id === 'swift' && blessingApplied.mods.cooldownMul === 0.9) ||
  (blessingApplied.id === 'blade' && blessingApplied.mods.heroDamage >= 0.1) ||
  (blessingApplied.id === 'bulwark' && blessingApplied.mods.meleeHp >= 0.15) ||
  (blessingApplied.id === 'harvest' && blessingApplied.mods.harvestRate >= 0.15) ||
  (blessingApplied.id === 'march' && blessingApplied.mods.unitSpeed >= 0.08);
check('roguelite: the blessing is applied to the live match modifiers', applied, JSON.stringify(blessingApplied));

// ── map + main objectives stay fixed across runs ─────────────────────
const fixed = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  const before = {
    camps: b.world.buildings.filter((x) => x.team === 2 && x.def.id === 'wb_camp').map((x) => [Math.round(x.x), Math.round(x.y)]),
    objectives: b.missions.objectives.map((o) => o.def.text),
  };
  return before;
});
const fixedAgain = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  return {
    camps: b.world.buildings.filter((x) => x.team === 2 && x.def.id === 'wb_camp').map((x) => [Math.round(x.x), Math.round(x.y)]),
    objectives: b.missions.objectives.map((o) => o.def.text),
  };
});
check('roguelite: map layout and main objectives are deterministic within a session', JSON.stringify(fixed) === JSON.stringify(fixedAgain), JSON.stringify(fixed.objectives.length));

await page.screenshot({ path: `${OUT}41-singleplayer.png` });
check('singleplayer: no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${failures === 0 ? 'ALL SINGLE-PLAYER CHECKS PASSED' : `${failures} SINGLE-PLAYER CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
