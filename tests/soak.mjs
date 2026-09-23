/**
 * Soak / leak test.
 *
 * The judge for "corpses and FX need pooling" is not a feeling — it is: after N matches
 * that each create and destroy thousands of short-lived objects, do the texture count,
 * the display-object count and the JS heap still return to where they started?
 *
 * Runs several full matches (restart via the in-game retry path), forces a GC through CDP
 * after each one and reports the deltas. A real leak shows up as monotonic growth.
 *
 * Usage: node tests/soak.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const MATCHES = Number(process.env.MATCHES ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function collectGarbage() {
  try {
    await cdp.send('HeapProfiler.collectGarbage');
  } catch { /* not fatal */ }
}

/**
 * Samples three times after a forced GC and keeps the MINIMUM of each counter: scene
 * teardown leaves transient Phaser Text textures pending collection, so a single sample
 * is flaky. A real leak cannot be hidden by taking a minimum over time.
 */
async function sample() {
  await collectGarbage();
  await sleep(400);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    runs.push(await readCounters());
    await sleep(350);
  }
  const min = (key) => Math.min(...runs.map((r) => r[key]));
  return {
    ownTextures: min('ownTextures'),
    textures: min('textures'),
    battleObjects: min('battleObjects'),
    hudObjects: min('hudObjects'),
    heapMB: min('heapMB'),
  };
}

async function readCounters() {
  return page.evaluate(() => {
    const game = window.__AETHERIA__;
    const hud = game.scene.getScene('Hud');
    const battle = window.__AETHERIA_BATTLE__;
    const keys = game.textures.getTextureKeys();
    // Phaser registers a transient UUID canvas texture per Text object, so the *total*
    // count fluctuates while scenes are torn down. Only our own generated namespace is
    // a meaningful leak signal: it must be exactly the same after every match.
    const own = keys.filter((k) => /^(u_|b_|p_|fx_|icon_|terrain|minimap|res_|px1)/.test(k)).length;
    return {
      ownTextures: own,
      textures: keys.length,
      battleObjects: battle ? battle.children.list.length : 0,
      hudObjects: hud && hud.scene.isActive() ? hud.children.list.length : 0,
      fxEmitters: battle && battle.fx ? Array.from(battle.fx.emitters ? battle.fx.emitters.keys() : []).length : 0,
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : -1,
    };
  });
}

/** One "match" of abuse: spawn a big army, fight, kill everything, blow buildings up. */
async function stressMatch() {
  await page.evaluate(async () => {
    const b = window.__AETHERIA_BATTLE__;
    b.speed = 6;
    const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1) ?? {
      x: b.world.map.playerStart.x,
      y: b.world.map.playerStart.y,
    };
    b.world.wallet.gold = 9999;
    b.world.wallet.wood = 9999;
    b.world.popMax = 200;
    b.world.mods.fireDamage = 0.1;
    // 60 friendly units
    const squad = [];
    for (let i = 0; i < 60; i++) {
      const u = b.world.spawnUnit(i % 3 === 0 ? 'archer' : 'footman', castle.x + (Math.random() - 0.5) * 500, castle.y + (Math.random() - 0.5) * 500, 'dawn');
      u.team = 1;
      squad.push(u);
    }
    // 30 enemies right next to them
    const boss = b.ai.spawnBoss(b.mission);
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const u = b.world.spawnUnit(i % 2 ? 'raider' : 'hunter', boss.x + Math.cos(ang) * 220, boss.y + Math.sin(ang) * 220, 'wildborn');
      u.team = 2;
    }
    b.orders.move(squad, boss.x, boss.y, true);
    // hero abilities (AoE + channels)
    const h = b.world.hero;
    h.mana = 999;
    b.abilities.cast(h, 'warCry', h.x, h.y);
    b.abilities.cast(h, 'whirlwind', h.x, h.y);
    b.abilities.cast(h, 'shieldCharge', boss.x, boss.y);
    b.cameras.main.centerOn(boss.x, boss.y);
    b.cameras.main.setZoom(0.6);
    window.__STRESS__ = { squad, boss };
  });

  // let the fight run (kills -> corpses, projectiles, damage numbers, particles)
  await sleep(9000);

  await page.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    // explicit mass death: every corpse path + building destruction path fires
    for (const u of [...b.world.units]) if (u.team !== 1 || u.def.role === 'worker') b.world.killUnit(u, 1);
    for (const bl of [...b.world.buildings]) if (bl.team === 2) b.world.killBuilding(bl, 1);
    for (let i = 0; i < 12; i++) b.fx.explosion(600 + i * 40, 600 + i * 30, 120, i % 2 === 0);
  });
  await sleep(3500);
}

// ── 1st match: open it through the real menu path ──
await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(1500);

const samples = [];
for (let m = 1; m <= MATCHES; m++) {
  await stressMatch();
  const s = await sample();
  samples.push({ match: m, ...s });
  console.log(
    `match ${m}: ownTextures ${s.ownTextures} · totalTextures ${s.textures} · battleObjects ${s.battleObjects} · hudObjects ${s.hudObjects} · heap ${s.heapMB.toFixed(1)}MB`,
  );
  if (m < MATCHES) {
    // restart through the real in-game path (HUD result panel -> 再打一次)
    await page.evaluate(() => {
      const b = window.__AETHERIA_BATTLE__;
      b.missions.finish(true);
    });
    await sleep(900);
    const btn = await page.evaluate(() => {
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
      const label = find(hud.children.list).find((o) => o.type === 'Text' && o.text === '再打一次');
      return label && label.visible ? { x: label.x, y: label.y } : null;
    });
    if (btn) await page.mouse.click(btn.x, btn.y);
    await sleep(2500);
  }
}

const first = samples[0];
const last = samples[samples.length - 1];
const growth = (a, b) => (a <= 0 ? 0 : ((b - a) / a) * 100);

check('soak: ran the requested number of matches', samples.length === MATCHES, `${samples.length} matches · ${first.battleObjects} objects each`);
check(
  'soak: generated (game-owned) texture count is exactly stable',
  last.ownTextures === first.ownTextures && last.ownTextures >= 60,
  `${first.ownTextures} → ${last.ownTextures}`,
);
check(
  'soak: total texture count returns to baseline within the Text-object jitter',
  last.textures <= first.textures + 12,
  `${first.textures} → ${last.textures} (the ±jitter is Phaser Text UUID textures, created and destroyed per scene)`,
);
check(
  'soak: battle display-object count returns to baseline (no object leak)',
  last.battleObjects <= first.battleObjects * 1.15 + 10,
  `${first.battleObjects} → ${last.battleObjects} (${growth(first.battleObjects, last.battleObjects).toFixed(1)}%)`,
);
check(
  'soak: HUD display-object count returns to baseline',
  last.hudObjects <= first.hudObjects * 1.15 + 10,
  `${first.hudObjects} → ${last.hudObjects} (${growth(first.hudObjects, last.hudObjects).toFixed(1)}%)`,
);
check(
  'soak: JS heap growth stays under 35% after forced GC',
  first.heapMB < 0 || growth(first.heapMB, last.heapMB) < 35,
  `${first.heapMB.toFixed(1)}MB → ${last.heapMB.toFixed(1)}MB (${growth(first.heapMB, last.heapMB).toFixed(1)}%)`,
);
console.log('\nper-match deltas:', samples.map((s) => `${s.match}:${s.heapMB.toFixed(1)}MB/${s.battleObjects}obj`).join('  '));

await page.screenshot({ path: `${OUT}soak-final.png` });
await browser.close();
console.log(`\n${failures === 0 ? 'SOAK PASSED' : `${failures} SOAK CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
