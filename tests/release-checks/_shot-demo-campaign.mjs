import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:800} });
await p.goto('http://localhost:4173/', { waitUntil:'domcontentloaded', timeout:40000 });
await p.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout:40000 });
await p.waitForTimeout(2500);
// 点“战役”进战役面板
await p.evaluate(() => { const s = window.__AETHERIA__.scene.getScene('Menu'); s.screen = 'campaign'; s.render(); });
await p.waitForTimeout(2500);
await p.screenshot({ path:'artifacts/99-demo-campaign.png' });
const txt = await p.evaluate(() => ({ demo: window.__AETHERIA__.__build, playable: window.__AETHERIA__.__build.playable.length }));
console.log('试玩版:', JSON.stringify(txt));
await b.close();
