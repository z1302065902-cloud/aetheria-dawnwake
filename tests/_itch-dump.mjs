import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--proxy-server=http://127.0.0.1:8899','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:900} });
await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil:'networkidle', timeout:60000 });
await p.waitForTimeout(5000);
const d = await p.evaluate(() => ({
  imgs: [...document.querySelectorAll('img')].map(i => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(-60) })).filter(x => x.w > 80),
  text: document.body.innerText.replace(/\n{2,}/g,'\n').slice(0, 1200),
}));
console.log('图片数:', d.imgs.length);
d.imgs.slice(0,8).forEach(i => console.log('  ', i.w + 'x' + i.h, i.src));
console.log('--- 页面文字 ---');
console.log(d.text);
await b.close();
