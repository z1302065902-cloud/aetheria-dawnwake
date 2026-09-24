import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
// 1) 试玩站（应只有两关）
for (const [name, url] of [['GitHub Pages','https://z1302065902-cloud.github.io/aetheria-dawnwake/'], ['Vercel','https://aetheria-dawnwake.vercel.app/']]) {
  const p = await b.newPage({ viewport:{width:1280,height:800} });
  await p.goto(url, { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForFunction(() => !!(window.__AETHERIA__ && window.__AETHERIA__.__build), null, { timeout:60000 });
  const build = await p.evaluate(() => window.__AETHERIA__.__build);
  console.log(`${name.padEnd(13)} 试玩版=${build.demo} 可玩关=${build.playable.join(',')} → ${build.demo && build.playable.length === 2 ? '✅' : '❌'}`);
  await p.close();
}
// 2) itch 应为付费下载
{
  const p = await b.newPage({ viewport:{width:1280,height:900} });
  await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(4000);
  const t = await p.evaluate(() => document.body.innerText);
  const buy = /Buy Now/i.test(t), run = /Run game/i.test(t);
  console.log(`itch.io        Buy Now=${buy} 免费Run game=${run} → ${buy && !run ? '✅ 付费下载模式' : '❌'}`);
  await p.close();
}
await b.close();
