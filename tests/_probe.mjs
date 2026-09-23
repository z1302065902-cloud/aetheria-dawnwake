import { chromium } from 'playwright';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:720} });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173', { waitUntil:'load' });
await p.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'));
await p.evaluate(() => window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId:'m01', heroId:'knightCommander' }));
await p.waitForFunction(() => !!window.__AETHERIA_BATTLE__);
await sleep(2000);
const out = await p.evaluate(() => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find(x => x.def.id === 'castle');
  const log = [];
  const site = b.world.spawnBuilding('barracks', castle.x + 200, castle.y + 90, 'dawn', false);
  log.push({ step: 'spawned', siteId: site.id, workers: b.world.units.filter(u=>u.def.role==='worker').map(u=>({st:u.state,bid:u.buildId})) });
  b.build.startConstruction(site, (a) => b.automation.holdUnits(a, 30));
  log.push({ step: 'afterStart', workers: b.world.units.filter(u=>u.def.role==='worker').map(u=>({st:u.state,bid:u.buildId})) });
  return { siteId: site.id, log, hasAutomation: !!b.automation, hasBuild: !!b.build };
});
console.log(JSON.stringify(out, null, 1).slice(0, 1600));
for (let i=0;i<4;i++){
  await sleep(1200);
  const s = await p.evaluate(() => {
    const b = window.__AETHERIA_BATTLE__;
    const site = b.world.buildings.find(x=>x.def.id==='barracks' && x.team===1);
    return { con: site ? site.construction.toFixed(3) : 'gone', builders: site ? b.world.units.filter(u=>u.buildId===site.id).length : -1,
      workers: b.world.units.filter(u=>u.def.role==='worker').map(u=>({st:u.state,bid:u.buildId})) };
  });
  console.log(JSON.stringify(s));
}
await b.close();
