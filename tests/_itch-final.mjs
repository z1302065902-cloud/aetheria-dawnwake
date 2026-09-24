import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--proxy-server=http://127.0.0.1:8899','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:900} });
await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil:'domcontentloaded', timeout:60000 });
await p.waitForTimeout(4000);
const st = await p.evaluate(() => {
  const shots = [...document.querySelectorAll('img')].filter(i => /screenshot|img\/\d|cloudfront|imgix/i.test(i.src) || i.naturalWidth > 500).length;
  const t = document.body.innerText;
  return {
    title: document.title,
    runBtn: /Run game/i.test(t),
    cover: !!document.querySelector('.game_thumb img, .cover_image img'),
    bigImages: shots,
    tagline: (t.match(/单人幻想即时战略[^\n]*/) || [''])[0].slice(0, 60),
  };
});
console.log('itch 商店页:', JSON.stringify(st, null, 1));
await p.screenshot({ path: 'artifacts/94-itch-page.png', fullPage: false });
await b.close();
