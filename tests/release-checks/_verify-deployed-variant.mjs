import { chromium } from 'playwright';
const urls = [
  ['GitHub Pages', 'https://z1302065902-cloud.github.io/aetheria-dawnwake/'],
  ['Vercel', 'https://aetheria-dawnwake.vercel.app/'],
];
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
for (const [name, url] of urls) {
  const p = await b.newPage({ viewport:{width:1280,height:800} });
  try {
    await p.goto(url, { waitUntil:'domcontentloaded', timeout:60000 });
    await p.waitForFunction(() => !!(window.__AETHERIA__ && window.__AETHERIA__.__build), null, { timeout:60000 });
    const build = await p.evaluate(() => window.__AETHERIA__.__build);
    const ok = build.demo === true && build.playable.length === 2;
    console.log(`${name.padEnd(13)} ${JSON.stringify(build)} → ${ok ? '✅ 是试玩版（前两关）' : '❌ 不是试玩版'}`);
  } catch (e) { console.log(`${name.padEnd(13)} ❌ ${String(e).slice(0,60)}`); }
  await p.close();
}
await b.close();
