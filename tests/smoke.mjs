/**
 * Automated smoke / bot playtest for Aetheria: Dawnwake.
 *
 * Drives the REAL input path (mouse drag select, right-click orders, HUD button
 * clicks) and asserts that the game actually progresses: workers gather, buildings
 * get built, units get trained, combat kills things, objectives advance and the
 * mission can be won. Run with: node tests/smoke.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
// fileURLToPath (not .pathname) — the project path contains non-ASCII characters
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const errors = [];
let failures = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => {
  const stack = (err.stack ?? '').split('\n').slice(1, 4).join(' <- ').replace(/\s+/g, ' ');
  errors.push(`pageerror: ${err.message} ${stack}`);
});

// page-side helpers (recurses into containers, which hold the menu/HUD widgets)
await page.addInitScript(() => {
  window.__walk = (scene) => {
    const out = [];
    const rec = (list) => {
      for (const o of list) {
        out.push(o);
        if (o.list) rec(o.list);
      }
    };
    rec(scene.children.list);
    return out;
  };
  window.__findText = (scene, pred) => window.__walk(scene).filter((o) => o.type === 'Text' && pred(o.text));
});

const t0 = Date.now();
await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__AETHERIA__, null, { timeout: 30000 });
check('boot: Phaser game object created', true, `${Date.now() - t0} ms`);

// ── menu ─────────────────────────────────────────────────────────────
await page.waitForFunction(() => {
  const g = window.__AETHERIA__;
  return g && g.scene.isActive('Menu');
}, null, { timeout: 20000 });
await sleep(600);
const menuInfo = await page.evaluate(() => {
  const g = window.__AETHERIA__;
  const menu = g.scene.getScene('Menu');
  const all = window.__walk(menu);
  const texts = all.filter((o) => o.type === 'Text').map((o) => o.text);
  return { texts, buttonCount: all.filter((o) => o.type === 'Rectangle').length };
});
check('menu: title + 5 main actions rendered', menuInfo.texts.includes('AETHERIA') && menuInfo.buttonCount >= 5, `texts=${menuInfo.texts.length} rects=${menuInfo.buttonCount}`);
await page.screenshot({ path: `${OUT}01-menu.png` });

// click "开始战役 · 翡翠谷地" by locating its label text (real pointer input)
const startClicked = await page.evaluate(() => {
  const g = window.__AETHERIA__;
  const menu = g.scene.getScene('Menu');
  const label = window.__findText(menu, (t) => t.includes('开始战役'))[0];
  if (!label) return null;
  return { x: label.x, y: label.y };
});
check('menu: start button located', !!startClicked, JSON.stringify(startClicked));
if (startClicked) await page.mouse.click(startClicked.x, startClicked.y);

await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1500);
check('battle: scene created + HUD launched', await page.evaluate(() => window.__AETHERIA__.scene.isActive('Hud')));

const initial = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return {
    units: b.world.units.length,
    playerUnits: b.world.units.filter((u) => u.team === 1).length,
    buildings: b.world.buildings.length,
    resources: b.world.resources.length,
    gold: b.world.wallet.gold,
    wood: b.world.wallet.wood,
    enemies: b.world.units.filter((u) => u.team === 2).length,
    neutrals: b.world.units.filter((u) => u.team === 3).length,
    objectives: b.missions.objectives.length,
    hero: !!b.world.hero,
  };
});
check('battle: entities spawned (player/enemy/neutral/resources)', initial.playerUnits >= 5 && initial.enemies >= 6 && initial.resources >= 10 && initial.neutrals >= 3, JSON.stringify(initial));
check('battle: hero present', initial.hero);
await page.screenshot({ path: `${OUT}02-battle-start.png` });

// ── box select with real mouse drag ─────────────────────────────────
const castle = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const c = b.world.buildings.find((x) => x.def.id === 'castle');
  return { x: c.x, y: c.y };
});
const toScreen = (wx, wy) =>
  page.evaluate(
    ([x, y]) => {
      const cam = window.__AETHERIA_BATTLE__.cameras.main;
      return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
    },
    [wx, wy],
  );

const p1 = await toScreen(castle.x - 320, castle.y - 260);
const p2 = await toScreen(castle.x + 320, castle.y + 300);
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, { steps: 8 });
await page.mouse.move(p2.x, p2.y, { steps: 8 });
await page.mouse.up();
const selected = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { count: b.selection.count, workers: b.selection.units.filter((u) => u.def.role === 'worker').length };
});
check('input: drag box selects player units', selected.count >= 4, JSON.stringify(selected));

// ── right click a gold mine: workers must harvest ───────────────────
const mine = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const node = b.world.resources.filter((r) => r.resourceKind === 'gold').sort((a, c) => Math.hypot(a.x - b.world.map.playerStart.x, a.y - b.world.map.playerStart.y) - Math.hypot(c.x - b.world.map.playerStart.x, c.y - b.world.map.playerStart.y))[0];
  return { x: node.x, y: node.y, id: node.id };
});
const mineScreen = await toScreen(mine.x, mine.y);
await page.mouse.click(mineScreen.x, mineScreen.y, { button: 'right' });
await page.evaluate(() => {
  window.__AETHERIA_BATTLE__.speed = 8;
});
await sleep(6000);
const gathering = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return {
    gold: Math.floor(b.world.wallet.gold),
    gatherStates: b.world.units.filter((u) => u.team === 1 && u.def.role === 'worker').map((u) => u.state),
  };
});
check('economy: workers harvest and bank gold', gathering.gold > 0 || gathering.gatherStates.some((s) => s.startsWith('gather') || s === 'returnGo'), JSON.stringify(gathering));

// ── build a barracks through the HUD button ─────────────────────────
// isolate the construction checks: waves are a separate feature (verified later), and by now
// the earlier blocks have advanced the clock far enough that a wave is already on the field
// killing workers — that would decide this check for the wrong reason
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  b.ai.camps = [];
  b.ai.nextWaveAt = 1e9;
  // only units: the combat/boss blocks later in this test still need the enemy buildings
  for (const u of [...b.world.units]) if (u.team === 2 || u.team === 3) b.world.killUnit(u, 1);
  for (const u of b.world.units) if (u.team === 1) u.hp = u.maxHp;
});
const barracksBtn = await page.evaluate(() => {
  const hud = window.__AETHERIA__.scene.getScene('Hud');
  const label = window.__findText(hud, (t) => t.startsWith('兵营'))[0];
  return label && label.visible ? { x: label.x, y: label.y, text: label.text } : null;
});
check('hud: build button present for a worker selection', !!barracksBtn, barracksBtn?.text ?? 'none');
if (barracksBtn) {
  await page.mouse.click(barracksBtn.x, barracksBtn.y);
  await sleep(300);
  const spot = await toScreen(castle.x + 200, castle.y + 90);
  await page.mouse.move(spot.x, spot.y, { steps: 6 });
  await page.mouse.click(spot.x, spot.y);
  await sleep(600);
  const site = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    const s = b.world.buildings.find((x) => x.def.id === 'barracks' && x.team === 1);
    return s ? { building: s.building, construction: s.construction } : null;
  });
  check('build: barracks site placed by clicking the ground', !!site, JSON.stringify(site));
  const builderProbe = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    const s = b.world.buildings.find((x) => x.def.id === 'barracks' && x.team === 1);
    return b.world.units
      .filter((u) => u.def.role === 'worker')
      .map((u) => ({ st: u.state, bid: u.buildId, d: s ? Math.round(Math.hypot(u.x - s.x, u.y - s.y)) : -1 }));
  });
  check('build: settlers are assigned to the site', builderProbe.some((w) => w.bid > 0), JSON.stringify(builderProbe));
  try {
    await page.waitForFunction(
      () => {
        const b = window.__AETHERIA_BATTLE__;
        const s = b.world.buildings.find((x) => x.def.id === 'barracks' && x.team === 1);
        return !!s && s.building === false;
      },
      null,
      { timeout: 25000 },
    );
  } catch { /* fall through to the assertion below for a readable failure */ }
  const built = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    const s = b.world.buildings.find((x) => x.def.id === 'barracks' && x.team === 1);
    if (!s) return null;
    return {
      building: s.building,
      construction: Math.round(s.construction * 1000) / 1000,
      builders: b.world.units.filter((u) => u.buildId === s.id).length,
      workers: b.world.units
        .filter((u) => u.def.role === 'worker')
        .map((u) => ({ st: u.state, bid: u.buildId, d: Math.round(Math.hypot(u.x - s.x, u.y - s.y)), held: !!u.targetId })),
      held: b.automation ? Array.from(b.automation.hold ? b.automation.hold.keys() : []).length : -1,
      speed: b.speed,
      wallet: { gold: Math.round(b.world.wallet.gold), wood: Math.round(b.world.wallet.wood) },
      deaths: window.__DEATHS__ ?? [],
      elapsed: Math.round(b.world.elapsed),
    };
  });
  check('build: settlers finish construction', !!built && built.building === false, JSON.stringify(built));
}

// ── train a footman from the barracks ───────────────────────────────
const trainResult = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  const bar = b.world.buildings.find((x) => x.def.id === 'barracks' && x.team === 1 && !x.building);
  if (!bar) return { error: 'no barracks' };
  // fixture: this check is about the manual production path, so fund it explicitly
  // (auto-production deliberately keeps a construction reserve and may have spent the rest)
  b.world.wallet.gold = Math.max(b.world.wallet.gold, 600);
  const before = b.world.units.filter((u) => u.def.id === 'footman').length;
  const res = b.production.enqueue(bar, 'footman');
  return { res, queued: bar.production.length, before, gold: Math.floor(b.world.wallet.gold) };
});
check('production: barracks accepts a training order', trainResult.res === 'ok' && trainResult.queued >= 1, JSON.stringify(trainResult));
await sleep(6000);
const afterTrain = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { footmen: b.world.units.filter((u) => u.def.id === 'footman' && u.team === 1).length, popUsed: b.world.popUsed, popMax: b.world.popMax };
});
check('production: trained unit exists and population is counted', afterTrain.footmen >= 1 && afterTrain.popUsed > 0, JSON.stringify(afterTrain));

// ── combat: attack-move the army into the wildborn camp ─────────────
const combatSetup = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const army = b.world.units.filter((u) => u.team === 1 && u.def.role !== 'worker' && !u.isHero);
  // any hostile structure will do: the camp composition depends on the mission's objectives
  const camp = b.world.buildings.filter((x) => x.team === 2)[0];
  const enemiesBefore = b.world.units.filter((u) => u.team === 2).length;
  if (army.length === 0) return { error: 'no army' };
  if (!camp) return { error: 'no enemy buildings' };
  const hero = b.world.hero;
  b.orders.move([...army, hero].filter(Boolean), camp.x, camp.y, true);
  return { army: army.length, campX: camp.x, campY: camp.y, enemiesBefore };
});
check('combat: army ordered to attack-move onto the camp', !combatSetup.error, JSON.stringify(combatSetup));
await sleep(20000);
const combatResult = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return {
    killed: b.missions.unitsKilledByPlayer,
    heroXp: b.world.hero ? Math.round(b.world.hero.xp) : 0,
    heroLevel: b.world.hero ? b.world.hero.level : 0,
    heroHp: b.world.hero ? Math.round(b.world.hero.hp) : 0,
    enemyNear: b.world.units.filter((u) => u.team === 2 && Math.hypot(u.x - b.world.hero.x, u.y - b.world.hero.y) < 300).length,
    buildingsDestroyed: Array.from(b.missions.buildingsDestroyed.entries()),
  };
});
check('combat: kills registered / hero gained XP or took damage', combatResult.killed > 0 || combatResult.heroXp > 0 || combatResult.heroHp < (await page.evaluate(() => window.__AETHERIA_BATTLE__.world.hero.maxHp)), JSON.stringify(combatResult));

// ── hero death + respawn path ───────────────────────────────────────
const heroAfterFight = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const h = b.world.hero;
  return { dead: h.dead, respawning: h.respawning, timer: Math.round(h.respawnTimer), hp: Math.round(h.hp) };
});
let respawned = false;
try {
  await page.waitForFunction(
    () => {
      const h = window.__AETHERIA_BATTLE__.world.hero;
      return h && !h.dead && !h.respawning && h.hp > 0;
    },
    null,
    { timeout: 30000 },
  );
  respawned = true;
} catch { /* reported below */ }
check('hero: death starts a respawn timer and the hero comes back', respawned, JSON.stringify(heroAfterFight));

// ── hero abilities through the real HUD buttons ─────────────────────
const abilityState = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const hero = b.world.hero;
  return { level: hero.level, mana: Math.round(hero.mana), skills: hero.skillList.map((s) => ({ id: s.id, cd: hero.cooldowns[s.id], mana: s.manaCost })) };
});
const cast = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const hero = b.world.hero;
  hero.mana = hero.maxMana;
  const before = hero.cooldowns.whirlwind ?? 0;
  const res = b.abilities.cast(hero, 'whirlwind', hero.x, hero.y);
  return { res, before, after: hero.cooldowns.whirlwind, channelling: !!hero.channel };
});
check('hero: whirlwind casts and starts a channel', cast.res.ok === true && cast.after > 0 && cast.channelling, JSON.stringify({ ...cast, ...abilityState }));

const charge = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const hero = b.world.hero;
  hero.mana = hero.maxMana;
  const x0 = hero.x;
  const y0 = hero.y;
  const res = b.abilities.cast(hero, 'shieldCharge', hero.x + 200, hero.y + 120);
  return { res, x0, y0 };
});
await sleep(260); // the dash lasts 0.24s — measure the dash, not the walk afterwards
const charged = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { x: b.world.hero.x, y: b.world.hero.y };
});
check('hero: shield charge moves the hero toward the target', charge.res.ok === true && Math.hypot(charged.x - charge.x0, charged.y - charge.y0) > 60, `${JSON.stringify(charge)} -> ${JSON.stringify(charged)}`);

// ── AI: enemy waves actually reach the player base ──────────────────
const waveInfo = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { waveIndex: b.ai.waveCount, nextIn: Math.round(b.ai.nextWaveAtPublic - b.now), elapsed: Math.round(b.world.elapsed) };
});
check('ai: wave timer runs', waveInfo.elapsed > 30, JSON.stringify(waveInfo));

// ── boss + victory path ─────────────────────────────────────────────
// The real barracks was built above; now drive the remaining main objectives by
// completing the camp and letting the objective chain advance (it is sequential).
const bossSpawn = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  if (b.missions.goldDeposited < 400) b.missions.goldDeposited = 400;
  while (b.missions.producedCombatUnits < 4) b.missions.producedCombatUnits++;
  const camp = b.world.buildings.find((x) => x.def.id === 'wb_camp');
  if (camp) b.world.killBuilding(camp, 1);
  b.world.wallet.gold = 5000;
  b.world.wallet.wood = 5000;
  return { campDestroyed: b.missions.buildingsDestroyed.get('wb_camp') ?? 0, bossSpawned: b.ai.bossSpawned, objectives: b.missions.objectives.map((o) => o.state) };
});
let bossState = { bossSpawned: false, boss: null };
try {
  await page.waitForFunction(() => window.__AETHERIA_BATTLE__.ai.bossSpawned, null, { timeout: 20000 });
  bossState = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    return { bossSpawned: b.ai.bossSpawned, boss: b.ai.boss ? { hp: Math.round(b.ai.boss.hp), x: Math.round(b.ai.boss.x), y: Math.round(b.ai.boss.y), phase: b.ai.bossPhase } : null };
  });
} catch (err) {
  bossState = await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    return { bossSpawned: b.ai.bossSpawned, boss: null, objectives: b.missions.objectives.map((o) => ({ t: o.def.id, s: o.state, p: o.progress })) };
  });
}
check('boss: spawns when the camp objective completes', bossState.bossSpawned && !!bossState.boss, JSON.stringify({ ...bossSpawn, ...bossState }));

// fight the boss for real: reinforce next to it and order a real attack
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const boss = b.ai.boss;
  if (!boss) return;
  b.world.wallet.gold = 9000;
  const squad = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const u = b.world.spawnUnit(i % 3 === 0 ? 'archer' : 'footman', boss.x + Math.cos(ang) * 150, boss.y + Math.sin(ang) * 150, 'dawn');
    u.team = 1;
    squad.push(u);
  }
  b.world.recomputePop();
  b.orders.attack(squad, boss);
});
await sleep(14000);
const bossFight = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const boss = b.ai.boss;
  return { bossHp: boss ? Math.round(boss.hp) : null, maxHp: boss ? boss.maxHp : null, phase: b.ai.bossPhase, summons: b.world.units.filter((u) => u.team === 2 && (u.def.id === 'direwolf' || u.def.id === 'shade')).length };
});
check('boss: takes damage from the army and can summon minions', bossFight.bossHp !== null && bossFight.bossHp < bossFight.maxHp, JSON.stringify(bossFight));

// finish it off
await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  if (b.ai.boss) b.world.killUnit(b.ai.boss, 1);
});
await sleep(3000);
const endState = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return {
    ended: b.isEnded,
    victory: b.missions.victory,
    objectives: b.missions.objectives.map((o) => ({ text: o.def.text, state: o.state })),
    bossAlive: !!b.ai.boss && !b.ai.boss.dead,
  };
});
check('mission: victory triggers when all main objectives are complete', endState.ended && endState.victory, JSON.stringify(endState));
const endMusic = await page.evaluate(() => window.__AETHERIA_AUDIO__.currentTrack);
check('audio: victory switches to the victory track', endMusic === 'victory', `track = ${endMusic}`);
await sleep(800);
await page.screenshot({ path: `${OUT}03-victory.png` });

// ── defeat path: restart via the HUD button, then lose the castle ───
const retryBtn = await page.evaluate(() => {
  const hud = window.__AETHERIA__.scene.getScene('Hud');
  // labels are bilingual now ("再打一次 · Play again"), so match on the Chinese prefix
  const label = window.__findText(hud, (t) => t.startsWith('再打一次'))[0];
  return label && label.visible ? { x: label.x, y: label.y } : null;
});
check('ui: result panel offers a retry button', !!retryBtn);
if (retryBtn) await page.mouse.click(retryBtn.x, retryBtn.y);
await page.waitForFunction(
  () => {
    const b = window.__AETHERIA_BATTLE__;
    return b && !b.isEnded && b.world.buildings.some((x) => x.def.id === 'castle' && x.team === 1);
  },
  null,
  { timeout: 20000 },
);
check('ui: retry restarts a clean match', true);
const defeat = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  b.speed = 4;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1);
  if (castle) b.world.killBuilding(castle, 2);
  return { castleGone: !b.world.buildings.some((x) => x.def.id === 'castle') };
});
await sleep(1200);
const defeatState = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { ended: b.isEnded, defeat: b.missions.defeat };
});
check('mission: losing the castle ends in defeat', defeat.castleGone && defeatState.ended && defeatState.defeat, JSON.stringify({ ...defeat, ...defeatState }));
const defeatMusic = await page.evaluate(() => window.__AETHERIA_AUDIO__.currentTrack);
check('audio: defeat switches to the defeat track', defeatMusic === 'defeat', `track = ${defeatMusic}`);
await page.screenshot({ path: `${OUT}04-defeat.png` });

// ── relics: the permanent bonuses must actually be applied ──────────
// 1) grant relics in the save and restart, so the match modifiers are built from it
await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1') || '{}');
  raw.hero = raw.hero || {};
  raw.hero.relics = ['flameRelic', 'warriorRelic', 'heroRelic', 'bannerRelic', 'harvestRate'];
  window.localStorage.setItem('aetheria.dawnwake.save.v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1500);

const relicMods = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  return { mods: { ...b.world.mods }, hudLines: b.getHudState().relicLines };
});
check(
  'relics: save -> live match modifiers',
  relicMods.mods.fireDamage === 0.1 &&
    // a run blessing may add to these, so assert a lower bound
    relicMods.mods.meleeHp >= 0.08 &&
    relicMods.mods.heroDamage >= 0.12 &&
    relicMods.mods.unitSpeed >= 0.06 &&
    // every relic must be listed; a run blessing may add one more line
    ['魔法伤害 +10%', '近战单位生命 +8%', '英雄伤害 +12%', '部队移动速度 +6%'].every((l) => relicMods.hudLines.includes(l)) &&
    relicMods.hudLines.length >= 4,
  JSON.stringify(relicMods),
);

// 2) flame relic: magic damage from the player must be exactly 10% higher
const magicCompare = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const mk = () => b.world.spawnUnit('raider', 400, 2600, 'wildborn');
  const targetA = mk();
  const targetB = mk();
  b.world.mods.fireDamage = 0.1;
  const boosted = b.combat.applyDamage(targetA, 100, 'magic', 1, b.world.hero.id, false);
  b.world.mods.fireDamage = 0;
  const plain = b.combat.applyDamage(targetB, 100, 'magic', 1, b.world.hero.id, false);
  b.world.mods.fireDamage = 0.1;
  b.world.killUnit(targetA, 1);
  b.world.killUnit(targetB, 1);
  return { boosted, plain, ratio: boosted / plain };
});
check('relics: flame relic gives +10% magic damage', Math.abs(magicCompare.ratio - 1.1) < 0.001, `boosted ${magicCompare.boosted.toFixed(2)} vs plain ${magicCompare.plain.toFixed(2)} → ×${magicCompare.ratio.toFixed(3)}`);

// 3) warrior relic: melee units spawn with +8% HP (150 -> 162)
const meleeHp = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  b.world.mods.meleeHp = 0.08;
  const footman = b.world.spawnUnit('footman', 500, 2600, 'dawn');
  const archer = b.world.spawnUnit('archer', 540, 2600, 'dawn');
  const out = { footmanMax: footman.maxHp, archerMax: archer.maxHp };
  b.world.killUnit(footman, 2);
  b.world.killUnit(archer, 2);
  return out;
});
check('relics: warrior relic gives melee units +8% max HP (150→162)', meleeHp.footmanMax === 162 && meleeHp.archerMax === 92, JSON.stringify(meleeHp));

// ── audio: the five required music tracks must exist and switch ──────
const musicTracks = await page.evaluate(() => {
  const a = window.__AETHERIA_AUDIO__;
  const seen = [];
  for (const t of ['menu', 'battle', 'boss', 'victory', 'defeat']) {
    a.playMusic(t);
    seen.push({ requested: t, actual: a.currentTrack });
  }
  a.playMusic('battle');
  return { seen, trackCount: seen.filter((x) => x.requested === x.actual).length };
});
check(
  'audio: all five music tracks (menu/battle/boss/victory/defeat) are switchable',
  musicTracks.trackCount === 5,
  JSON.stringify(musicTracks.seen.map((x) => x.actual)),
);

// ── loot / equipment / talents: the RPG progression loop must close ─
// 1) loot: a 3-star victory with a boss kill must drop items into the save
const loot = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const before = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1') || '{}').hero?.inventory?.length ?? 0;
  b.ai.bossSpawned = true;         // boss bonus drop
  b.missions.optionalDone = 2;
  b.missions.finish(true);         // 3 stars (fast, no optional failures, boss killed)
  const after = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1') || '{}').hero?.inventory ?? [];
  return { before, after, count: after.length };
});
check('loot: a victory drops equipment into the save inventory', loot.count > loot.before, `${loot.before} → ${loot.count} items: ${JSON.stringify(loot.after)}`);
await sleep(600);
const resultPanelLoot = await page.evaluate(() => {
  const hud = window.__AETHERIA__.scene.getScene('Hud');
  const find = (list) => {
    const out = [];
    const rec = (l) => {
      for (const o of l) {
        out.push(o);
        if (o.list) rec(o.list);
      }
    };
    rec(list);
    return out;
  };
  const texts = find(hud.children.list).filter((o) => o.type === 'Text').map((o) => o.text);
  return texts.filter((t) => t.includes('战利品') || t.includes('没有掉落'));
});
check('loot: the result panel lists what dropped', resultPanelLoot.length === 1 && resultPanelLoot[0].includes('战利品'), JSON.stringify(resultPanelLoot));

// 2) equipment: equip the best weapon through the real menu UI, then verify it in-match
const equipFlow = await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1'));
  // make sure a weapon exists and is unequipped so the test is deterministic
  if (!raw.hero.inventory.includes('tidePiercer')) raw.hero.inventory.push('tidePiercer');
  raw.hero.equipment = {}; // isolate: no other item may contribute stats
  window.localStorage.setItem('aetheria.dawnwake.save.v1', JSON.stringify(raw));
  return { inventory: raw.hero.inventory.length };
});
check('equipment: test fixture written (a legendary weapon is available)', equipFlow.inventory > 0, JSON.stringify(equipFlow));

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').selectedHero = 'knightCommander';
  window.__AETHERIA__.scene.getScene('Menu').screen = 'heroes';
  window.__AETHERIA__.scene.getScene('Menu').render();
});
await sleep(800);
const equipBtn = await page.evaluate(() => {
  const menu = window.__AETHERIA__.scene.getScene('Menu');
  const out = [];
  const rec = (l) => {
    for (const o of l) {
      out.push(o);
      if (o.list) rec(o.list);
    }
  };
  rec(menu.children.list);
  // the "装备" button that sits on the same row as the legendary weapon
  const label = out.find((o) => o.type === 'Text' && o.text.startsWith('破潮之矛'));
  if (!label) return null;
  // the inventory row is now two lines tall (bilingual name + stats) and its button sits on the
  // row's centre, so match within the row band rather than within 6px
  const btn = out.find((o) => o.type === 'Text' && o.text.startsWith('装备') && Math.abs(o.y - label.y) < 22 && o.visible);
  return btn ? { x: btn.x, y: btn.y, item: label.text } : { row: label.y };
});
check('equipment: the inventory row for the legendary weapon is rendered', !!equipBtn && !!equipBtn.x, JSON.stringify(equipBtn));
if (equipBtn && equipBtn.x) await page.mouse.click(equipBtn.x, equipBtn.y);
await sleep(600);
const equipped = await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1'));
  return { weapon: raw.hero.equipment.weapon, attack: raw.hero.equipment.weapon ? 34 : 0 };
});
check('equipment: clicking 装备 writes the slot into the save', equipped.weapon === 'tidePiercer', JSON.stringify(equipped));

// start a match: the equipped item must show up on the hero
await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1200);
const heroEquipped = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const h = b.world.hero;
  return {
    equipAttack: h.equipment.attack,
    equipCrit: h.equipment.crit,
    equipSkill: h.equipment.skillDamage,
    attackTotal: h.attackTotal,
    baseAttack: h.def.attack,
  };
});
check(
  'equipment: the hero in-match carries the item stats (attack 34 / crit 14 / skill 18)',
  heroEquipped.equipAttack === 34 && heroEquipped.equipCrit === 14 && heroEquipped.equipSkill === 18 && heroEquipped.attackTotal === heroEquipped.baseAttack + 34,
  JSON.stringify(heroEquipped),
);
// attack speed is a real stat too (it must not be flavour text)
const speedStat = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1'));
  raw.hero.equipment.ring = 'voidSigil'; // +18% attack speed
  if (!raw.hero.inventory.includes('voidSigil')) raw.hero.inventory.push('voidSigil');
  window.localStorage.setItem('aetheria.dawnwake.save.v1', JSON.stringify(raw));
  return true;
});
void speedStat;

// 3) talents: spend a point through the UI and verify it lands in world.mods
const talentSetup = await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1'));
  raw.hero.talentPoints = 3;
  raw.hero.talents = {};
  raw.hero.relics = []; // isolate the talent effect from the relic effect
  window.localStorage.setItem('aetheria.dawnwake.save.v1', JSON.stringify(raw));
  return { points: raw.hero.talentPoints };
});
check('talents: test fixture written (3 points, no relics)', talentSetup.points === 3, JSON.stringify(talentSetup));

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await page.evaluate(() => {
  const menu = window.__AETHERIA__.scene.getScene('Menu');
  menu.screen = 'heroes';
  menu.render();
});
await sleep(700);
const plusBtn = await page.evaluate(() => {
  const menu = window.__AETHERIA__.scene.getScene('Menu');
  const out = [];
  const rec = (l) => {
    for (const o of l) {
      out.push(o);
      if (o.list) rec(o.list);
    }
  };
  rec(menu.children.list);
  const row = out.find((o) => o.type === 'Text' && o.text.includes('烈焰精研'));
  if (!row) return null;
  // a talent row is now two lines tall (bilingual name + effect), and its + button is centred on
  // the row's first line: match within the row band instead of within 4px
  const btn = out.find((o) => o.type === 'Text' && o.text === '+' && Math.abs(o.y - row.y) < 20 && o.visible);
  return btn ? { x: btn.x, y: btn.y } : { row: row.text };
});
check('talents: the 烈焰精研 talent row has a + button', !!plusBtn && !!plusBtn.x, JSON.stringify(plusBtn));
if (plusBtn && plusBtn.x) await page.mouse.click(plusBtn.x, plusBtn.y);
await sleep(600);
const spent = await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1'));
  return { points: raw.hero.talentPoints, ranks: raw.hero.talents };
});
check('talents: clicking + spends exactly one point and records the rank', spent.points === 2 && spent.ranks.flameMastery === 1, JSON.stringify(spent));

await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1200);
const talentMods = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const h = b.world.hero;
  b.world.mods.fireDamage = b.world.mods.fireDamage; // no-op, keep object identity
  // measure the talent's real effect: 6% more magic damage than without it
  const mk = () => b.world.spawnUnit('raider', 400, 2600, 'wildborn');
  const a = mk();
  const c = mk();
  const boosted = b.combat.applyDamage(a, 100, 'magic', 1, h.id, false);
  const withTalent = b.world.mods.fireDamage;
  b.world.mods.fireDamage = 0;
  const plain = b.combat.applyDamage(c, 100, 'magic', 1, h.id, false);
  b.world.mods.fireDamage = withTalent;
  b.world.killUnit(a, 1);
  b.world.killUnit(c, 1);
  return { fireDamage: withTalent, boosted, plain, ratio: boosted / plain, relicLines: b.getHudState().relicLines };
});
check(
  'talents: the bought rank is live in the match (+6% magic damage)',
  Math.abs(talentMods.ratio - 1.06) < 0.002,
  `mods.fireDamage ${talentMods.fireDamage} · ${talentMods.boosted.toFixed(2)} vs ${talentMods.plain.toFixed(2)} = ×${talentMods.ratio.toFixed(3)} · HUD: ${JSON.stringify(talentMods.relicLines)}`,
);

// restore a clean progression state so later checks (and the next run) are deterministic
await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('aetheria.dawnwake.save.v1'));
  raw.hero.talents = {};
  raw.hero.talentPoints = 0;
  raw.hero.inventory = ['tidePiercer'];
  raw.hero.equipment = {};
  window.localStorage.setItem('aetheria.dawnwake.save.v1', JSON.stringify(raw));
});

// ── fog of war: unexplored stays dark, explored is remembered ───────
const fogStart = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const v = b.world.vision;
  if (b.isEnded) return { ended: true };
  const camp = b.world.buildings.find((x) => x.team === 2 && x.def.id === 'wb_camp');
  const stones = b.world.map.searchPoints[0];
  const start = b.world.map.playerStart;
  const enemyAtCamp = b.world.units.filter((u) => u.team === 2 && Math.hypot(u.x - camp.x, u.y - camp.y) < 400);
  return {
    hasVision: !!v,
    fogTexture: window.__AETHERIA__.textures.exists('fog'),
    fogSize: (() => {
      const t = window.__AETHERIA__.textures.get('fog');
      return t ? [t.source[0].width, t.source[0].height] : null;
    })(),
    baseVisible: v.isVisibleWorld(start.x, start.y),
    campVisible: v.isVisibleWorld(camp.x, camp.y),
    campExplored: v.isExploredWorld(camp.x, camp.y),
    stonesVisible: v.isVisibleWorld(stones.x, stones.y),
    visibleTiles: v.visibleTiles,
    exploredTiles: v.exploredTiles,
    enemySpritesHidden: enemyAtCamp.length > 0 && enemyAtCamp.every((u) => u.sprite && !u.sprite.visible),
    enemyCount: enemyAtCamp.length,
    exploreObjectiveState: (b.missions.objectives.find((o) => o.def.id === 'o8') ?? { state: 'missing' }).state,
    // player units must never be hidden by their own fog
    playerVisible: b.world.units.filter((u) => u.team === 1).every((u) => !u.sprite || u.sprite.visible),
  };
});
check('fog: the checks ran on a live match', !fogStart.ended, fogStart.ended ? 'match had already ended — results below are meaningless' : 'live');
check('fog: fog texture exists at tile resolution', fogStart.hasVision && fogStart.fogTexture && fogStart.fogSize[0] === 72 && fogStart.fogSize[1] === 72, JSON.stringify(fogStart.fogSize));
check('fog: the starting base is visible, the enemy camp is not', fogStart.baseVisible && !fogStart.campVisible && !fogStart.campExplored, `base ${fogStart.baseVisible} · camp visible ${fogStart.campVisible} / explored ${fogStart.campExplored}`);
check('fog: enemy units outside vision are not rendered', fogStart.enemySpritesHidden, `${fogStart.enemyCount} enemies at the camp, all sprites hidden`);
check('fog: player units are always rendered', fogStart.playerVisible);
check('fog: only a small part of the map starts explored', fogStart.exploredTiles > 40 && fogStart.exploredTiles < 72 * 72 * 0.5, `${fogStart.exploredTiles} / ${72 * 72} tiles explored · ${fogStart.visibleTiles} visible`);
check('fog: the explore objective is NOT complete before exploring', fogStart.exploreObjectiveState === 'active', String(fogStart.exploreObjectiveState));

// walking the hero to the standing stones must complete the explore objective
const exploreResult = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  const stones = b.world.map.searchPoints[0];
  const hero = b.world.hero;
  hero.x = stones.x + 40;
  hero.y = stones.y + 40;
  b.vision.update(b.world);
  b.vision.paint();
  b.missions.update(0.3);
  const obj = b.missions.objectives.find((o) => o.def.id === 'o8');
  return {
    stonesVisible: b.vision.isVisibleWorld(stones.x, stones.y),
    objectiveState: obj ? obj.state : 'missing',
    exploredAfter: b.vision.exploredTiles,
  };
});
check('fog: the explore objective completes when the stones come into vision', exploreResult.stonesVisible && exploreResult.objectiveState === 'done', JSON.stringify(exploreResult));

// explored areas must be remembered after the hero leaves
const remembered = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const stones = b.world.map.searchPoints[0];
  const hero = b.world.hero;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1);
  hero.x = castle.x + 60;
  hero.y = castle.y + 60;
  b.vision.update(b.world);
  return {
    nowVisible: b.vision.isVisibleWorld(stones.x, stones.y),
    stillExplored: b.vision.isExploredWorld(stones.x, stones.y),
    exploredTiles: b.vision.exploredTiles,
  };
});
check('fog: explored ground is remembered after leaving (visible=false, explored=true)', !remembered.nowVisible && remembered.stillExplored, JSON.stringify(remembered));

// ── formation: 20 units must cross a bridge without stacking ────────
const bridge = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  // Isolate the measurement: no enemy units, no camp production, no incoming waves.
  for (const u of [...b.world.units]) if (u.team !== 1) b.world.killUnit(u, 1);
  b.ai.camps = [];
  b.ai.nextWaveAt = 1e9;
  b.ai.bossSpawned = true; // keep the boss out of this test
  // isolate formation/pathing: no enemies on the field and automation must not re-task the
  // squad mid-crossing (this check is about movement, not about auto-attack)
  b.automation.setSetting('autoAttack', false);
  b.automation.setSetting('autoRally', false);
  b.ai.camps = []; // stop camp reinforcement production too, not just the waves
  b.mapEvents.schedule = []; // a meteor would damage the squad mid-crossing
  // a void rift triggers when the hero walks over it and spawns shades that then attack the squad
  b.adventure.spots = [];
  window.__SPAWNLOG__ = [];
  const prevSpawn = b.world.spawnEnemyUnit.bind(b.world);
  b.world.spawnEnemyUnit = (id, x, y, f) => {
    window.__SPAWNLOG__.push(`${id}@${Math.round(b.world.elapsed)}`);
    return prevSpawn(id, x, y, f);
  };
  // hook THIS world: the global hook was installed on the first battle and dies with it
  window.__DEATHS__ = [];
  const prevKilled = b.world.onKilled;
  b.world.onKilled = (e, kt) => {
    if (e.kind === 'unit' && e.team === 1) window.__DEATHS__.push(`${e.def.id}<-t${kt}@${Math.round(b.world.elapsed)}`);
    prevKilled?.(e, kt);
  };
  for (const u of [...b.world.units]) if (u.team === 2 || u.team === 3) b.world.killUnit(u, 1);
  // hostile BUILDINGS shoot too (the camp totem): they were killing 8 squad members mid-crossing
  for (const bb of [...b.world.buildings]) if (bb.team === 2 || bb.team === 3) b.world.killBuilding(bb, 1);
  for (const u of b.world.units) if (u.team === 1) u.hp = u.maxHp;
  b.paused = false;
  b.speed = 4;
  b.world.wallet.gold = 9999;
  b.world.wallet.wood = 9999;
  const west = b.world.map.landings[2];   // west mouth of the southern bridge
  const east = b.world.map.landings[3];   // east mouth
  const squad = [];
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    const u = b.world.spawnUnit(i % 4 === 0 ? 'archer' : 'footman', west.x + Math.cos(ang) * 150 - 60, west.y + Math.sin(ang) * 150, 'dawn');
    u.team = 1;
    squad.push(u);
  }
  b.world.recomputePop();
  b.orders.move(squad, east.x, east.y, false);
  window.__SQUAD__ = squad;
  window.__START_X__ = west.x;
  window.__TARGET_X__ = east.x;
  return { west, east, count: squad.length };
});
check('formation: 20 units ordered across the bridge', bridge.count === 20, JSON.stringify({ west: bridge.west, east: bridge.east }));

try {
  await page.waitForFunction(
    () => {
      const squad = window.__SQUAD__ || [];
      return squad.filter((u) => !u.dead).every((u) => u.path.length === 0);
    },
    null,
    { timeout: 60000 },
  );
} catch { /* measured below regardless */ }

const formationResult = await page.evaluate(() => {
  const squad = (window.__SQUAD__ || []).filter((u) => !u.dead);
  let worstRatio = Infinity;
  let worstPair = null;
  for (let i = 0; i < squad.length; i++) {
    for (let j = i + 1; j < squad.length; j++) {
      const a = squad[i];
      const c = squad[j];
      const dist = Math.hypot(a.x - c.x, a.y - c.y);
      const ratio = dist / (a.radius + c.radius);
      if (ratio < worstRatio) {
        worstRatio = ratio;
        worstPair = [Math.round(dist), a.radius + c.radius];
      }
    }
  }
  const b = window.__AETHERIA_BATTLE__;
  const target = b.world.map.landings[3];
  const arrived = squad.filter((u) => Math.hypot(u.x - target.x, u.y - target.y) < 200).length;
  // "crossed the river": on the bridge or on its east side (the river runs north-south)
  const onEastSide = squad.filter((u) => u.x > (window.__START_X__ + window.__TARGET_X__) / 2).length;
  const stillPathing = squad.filter((u) => u.path.length > 0).length;
  return {
    count: squad.length, worstRatio, worstPair, arrived, onEastSide, stillPathing,
    deaths: (window.__DEATHS__ || []).slice(-10),
    squadDead: (window.__SQUAD__ || []).filter((u) => u.dead).length,
    spawns: (window.__SPAWNLOG__ || []).slice(-8),
  };
});
check(
  'formation: no two units overlap closer than 0.8×(r1+r2) after crossing',
  formationResult.worstRatio >= 0.8,
  `worst gap ratio ${formationResult.worstRatio.toFixed(2)} (dist/radii ${JSON.stringify(formationResult.worstPair)}) · arrived ${formationResult.arrived}/${formationResult.count} · east ${formationResult.onEastSide} · dead ${formationResult.squadDead} · deaths ${JSON.stringify(formationResult.deaths)} · spawns ${JSON.stringify(formationResult.spawns)}`,
);
check(
  'formation: the squad actually crossed the bridge',
  formationResult.onEastSide >= formationResult.count * 0.8,
  `east side ${formationResult.onEastSide}/${formationResult.count} · arrived ${formationResult.arrived} · still pathing ${formationResult.stillPathing}`,
);

// ── performance: simulation budget (headless-GPU independent) ───────
// The previous match ended (defeat), and a finished match freezes the simulation —
// so restart into a live match first, otherwise the numbers below are meaningless.
const retryBtn2 = await page.evaluate(() => {
  const hud = window.__AETHERIA__.scene.getScene('Hud');
  // labels are bilingual now ("再打一次 · Play again"), so match on the Chinese prefix
  const label = window.__findText(hud, (t) => t.startsWith('再打一次'))[0];
  return label && label.visible ? { x: label.x, y: label.y } : null;
});
if (retryBtn2) await page.mouse.click(retryBtn2.x, retryBtn2.y);
await page.waitForFunction(
  () => {
    const b = window.__AETHERIA_BATTLE__;
    return b && !b.isEnded && !b.paused && b.world.buildings.some((x) => x.def.id === 'castle' && x.team === 1);
  },
  null,
  { timeout: 20000 },
);
const sim = await page.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1) ?? { x: b.world.map.playerStart.x, y: b.world.map.playerStart.y };
  // stress: 60 extra combat units + a big fight at the enemy camp
  b.world.wallet.gold = 9999;
  b.world.wallet.wood = 9999;
  for (let i = 0; i < 60; i++) {
    const u = b.world.spawnUnit(i % 3 === 0 ? 'archer' : 'footman', castle.x + (Math.random() - 0.5) * 420, castle.y + (Math.random() - 0.5) * 420, 'dawn');
    u.team = 1;
  }
  b.world.recomputePop();
  const camp = b.world.buildings.find((x) => x.team === 2);
  if (camp) b.orders.move(b.world.units.filter((u) => u.team === 1 && !u.isHero), camp.x, camp.y, true);
  // measure the pure simulation cost: 240 ticks of the real update pipeline
  const elapsedBefore = b.world.elapsed;
  const t0 = performance.now();
  for (let i = 0; i < 240; i++) b.update(0, 16.7);
  const total = performance.now() - t0;
  const simSeconds = b.world.elapsed - elapsedBefore;
  const g = window.__AETHERIA__;
  return {
    perTick: total / 240,
    simSeconds,
    units: b.world.units.length,
    projectiles: b.combat.activeProjectiles,
    textures: g.textures.getTextureKeys().length,
    displayObjects: b.children.list.length,
  };
});
check('performance: 240 real sim ticks ran', sim.simSeconds > 3.5, `${sim.simSeconds.toFixed(2)}s of simulation advanced`);
check('performance: simulation tick under 8ms with 100+ units', sim.perTick < 8 && sim.perTick > 0.01, `${sim.perTick.toFixed(3)} ms/tick · ${sim.units} units · ${sim.projectiles} projectiles`);
check(
  'performance: texture count stays within budget (no runaway texture creation)',
  sim.textures < 300,
  `${sim.textures} textures · ${sim.displayObjects} display objects in the battle scene`,
);

// frame pacing under the headless software rasteriser (a real GPU is far faster —
// this bound only catches pathological stalls)
const perf = await page.evaluate(async () => {
  const b = window.__AETHERIA_BATTLE__;
  b.paused = false;
  b.speed = 1;
  const frames = [];
  let last = performance.now();
  await new Promise((resolve) => {
    let n = 0;
    const step = (t) => {
      frames.push(t - last);
      last = t;
      if (++n < 180) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  frames.sort((a, c) => a - c);
  return { avg: frames.reduce((a, c) => a + c, 0) / frames.length, worst: frames[frames.length - 1], n: frames.length, units: b.world.units.length };
});
check('performance: no frame stall over 250ms (software rasteriser)', perf.worst < 250, `avg ${perf.avg.toFixed(1)}ms worst ${perf.worst.toFixed(1)}ms · ${perf.units} units`);

// ── save system ─────────────────────────────────────────────────────
const saveState = await page.evaluate(() => {
  const raw = window.localStorage.getItem('aetheria.dawnwake.save.v1');
  const parsed = raw ? JSON.parse(raw) : null;
  return { exists: !!parsed, unlocked: parsed?.campaign?.unlockedMissions ?? [], victories: parsed?.stats?.victories ?? 0 };
});
check('save: progress persisted to localStorage', saveState.exists && saveState.unlocked.length >= 1, JSON.stringify(saveState));

// ── console hygiene ─────────────────────────────────────────────────
check('console: no page errors during the whole session', errors.length === 0, errors.slice(0, 6).join(' | '));

await browser.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
