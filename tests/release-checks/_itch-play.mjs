import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--proxy-server=http://127.0.0.1:8899','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil:'domcontentloaded', timeout:60000 });
await p.waitForTimeout(2500);
console.log('1) 点击 Run game…');
await p.click('text="Run game"', { timeout: 20000 }).catch(async () => {
  await p.evaluate(() => { const el = [...document.querySelectorAll('a,button,div')].find(e => /^Run game$/i.test(e.textContent.trim())); if (el) el.click(); });
});
// 等游戏 iframe 出现
let frame = null;
for (let i = 0; i < 30 && !frame; i++) {
  await p.waitForTimeout(2000);
  const f = p.frames().find(fr => /itch\.zone|html-classic|index\.html/.test(fr.url()));
  if (f) frame = f;
}
console.log('2) 游戏 frame:', frame ? frame.url().slice(0, 90) : '未出现');
if (frame) {
  await p.waitForTimeout(4000);
  const ok = await frame.evaluate(() => !!(window.__AETHERIA__ && window.__AETHERIA__.scene)).catch(() => false);
  console.log('   引擎已启动:', ok ? '✅' : '❌');
  if (ok) {
    const st = await frame.evaluate(() => ({
      scenes: window.__AETHERIA__.scene.getScenes(true).map(s=>s.scene.key),
      canvas: !!document.querySelector('canvas'),
      title: document.title,
    }));
    console.log('   ✅ itch 内运行中:', JSON.stringify(st));
    await p.screenshot({ path:'artifacts/93-itch-run.png' });
  } else {
    const t = await frame.evaluate(() => document.body.innerText.slice(0, 200)).catch(()=> '');
    console.log('   frame 内容:', t.replace(/\n+/g,' | ').slice(0,180));
  }
}
console.log('商店页报错:', errs.length ? errs.slice(0,2) : '无');
await b.close();
