import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
for (const [name, url, expectDemo, expectCount] of [['试玩版', 'http://localhost:4173/', true, 2], ['完整版', 'http://localhost:4174/', false, 10]]) {
  const p = await b.newPage({ viewport:{width:1280,height:800} });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil:'domcontentloaded', timeout:40000 });
  await p.waitForFunction(() => !!(window.__AETHERIA__ && window.__AETHERIA__.__build), null, { timeout:40000 });
  const build = await p.evaluate(() => window.__AETHERIA__.__build);
  const ok = build.demo === expectDemo && build.playable.length === expectCount;
  console.log(`${name}: ${JSON.stringify(build)} → ${ok ? '✅ 正确' : '❌ 不符'} (报错 ${errs.length})`);
  // 顺带确认菜单能起来
  await p.waitForFunction(() => window.__AETHERIA__.scene.isActive('Menu'), null, { timeout:30000 }).catch(() => {});
  const menu = await p.evaluate(() => window.__AETHERIA__.scene.isActive('Menu'));
  console.log(`   菜单场景: ${menu ? '✅' : '❌'}`);
  await p.close();
}
await b.close();
