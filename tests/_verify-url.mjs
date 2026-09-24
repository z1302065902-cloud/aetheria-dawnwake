import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.goto(url, { waitUntil:'load', timeout:60000 });
await p.waitForFunction(()=>window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, {timeout:45000});
const info = await p.evaluate(()=>document.title);
await p.evaluate(()=>window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle',{missionId:'m04',heroId:'arcaneMage'}));
await p.waitForFunction(()=>!!window.__AETHERIA_BATTLE__, null, {timeout:30000});
await new Promise(r=>setTimeout(r,3500));
const st = await p.evaluate(()=>{
  const b=window.__AETHERIA_BATTLE__;
  return { units: b.world.units.length, buildings: b.world.buildings.length, hud: window.__AETHERIA__.scene.isActive('Hud') };
});
console.log(`✅ ${url}\n   title: ${info}\n   战斗: ${JSON.stringify(st)}\n   报错: ${errs.length?errs.slice(0,2):'无'}`);
await b.close();
