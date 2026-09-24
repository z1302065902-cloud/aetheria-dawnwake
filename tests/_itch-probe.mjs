import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--proxy-server=http://127.0.0.1:8899','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const p = await b.newPage({ viewport:{width:1280,height:900} });
await p.goto('https://zsy2026.itch.io/aetheria-dawnwake', { waitUntil:'networkidle', timeout:60000 });
await new Promise(r=>setTimeout(r,4000));
const info = await p.evaluate(() => {
  const iframes = [...document.querySelectorAll('iframe')].map(f => ({ id: f.id, cls: f.className, src: (f.src||'').slice(0,90) }));
  const t = document.body.innerText;
  return {
    iframes,
    hasRunBtn: /Run game|Play|Launch/i.test(t),
    hasProcessing: /processing|being processed|preparing/i.test(t),
    bodySnippet: t.slice(0, 700).replace(/\n+/g,' | '),
  };
});
console.log(JSON.stringify(info, null, 1).slice(0, 1800));
await b.close();
