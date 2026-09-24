import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--proxy-server=http://127.0.0.1:8899','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:800} });
const failed = [];
p.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0,80)}`));
p.on('console', m => { if (m.type() === 'error') failed.push('console: ' + m.text().slice(0,120)); });
await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil:'domcontentloaded', timeout:60000 });
await p.waitForTimeout(2500);
await p.click('text="Run game"', { timeout: 20000 }).catch(() => {});
let frame = null;
for (let i = 0; i < 20 && !frame; i++) {
  await p.waitForTimeout(2000);
  frame = p.frames().find(fr => /itch\.zone/.test(fr.url())) || null;
}
console.log('frame:', frame ? frame.url().slice(0,80) : '未出现');
if (frame) {
  for (let i = 1; i <= 6; i++) {
    await p.waitForTimeout(5000);
    const st = await frame.evaluate(() => ({
      engine: !!(window.__AETHERIA__ && window.__AETHERIA__.scene),
      splash: !!document.getElementById('splash'),
      scripts: document.querySelectorAll('script').length,
      canvas: !!document.querySelector('canvas'),
    })).catch(e => ({ err: String(e).slice(0,60) }));
    console.log(`  t=${i*5}s`, JSON.stringify(st));
    if (st.engine) break;
  }
}
console.log('失败请求/报错:', failed.length ? [...new Set(failed)].slice(0,6) : '无');
await b.close();
