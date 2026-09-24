import { chromium } from 'playwright';
const b = await chromium.launch({
  channel: 'chromium', headless: true,
  args: ['--proxy-server=http://127.0.0.1:8899', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
console.log('1) 打开 itch 商店页…');
await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil: 'domcontentloaded', timeout: 60000 });
const title = await p.title();
// itch 的 HTML5 运行器嵌在 iframe 里；等它出现并拿到 src
const frame = await p.waitForSelector('iframe#game_drop, iframe[src*="html"], iframe[src*="itch.zone"]', { timeout: 40000 }).catch(() => null);
const src = frame ? await frame.getAttribute('src') : null;
console.log('   标题:', title);
console.log('   游戏 iframe:', src ? src.slice(0, 80) : '未找到');
if (src) {
  console.log('2) 打开游戏本体并等引擎启动…');
  const g = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const gerr = []; g.on('pageerror', e => gerr.push(e.message));
  await g.goto(src, { waitUntil: 'load', timeout: 60000 });
  await g.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 60000 });
  const info = await g.evaluate(() => ({ title: document.title, scenes: window.__AETHERIA__.scene.getScenes(true).map(s => s.scene.key) }));
  console.log('   ✅ itch 版进到菜单:', JSON.stringify(info));
  await g.evaluate(() => window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' }));
  await g.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 40000 });
  await new Promise(r => setTimeout(r, 4000));
  const st = await g.evaluate(() => ({ units: window.__AETHERIA_BATTLE__.world.units.length, buildings: window.__AETHERIA_BATTLE__.world.buildings.length, hud: window.__AETHERIA__.scene.isActive('Hud') }));
  console.log('   ✅ itch 版战斗可跑:', JSON.stringify(st));
  await g.screenshot({ path: 'artifacts/93-itch-build.png' });
  console.log('   游戏页报错:', gerr.length ? gerr.slice(0, 2) : '无');
}
console.log('商店页报错:', errs.length ? errs.slice(0, 2) : '无');
await b.close();
