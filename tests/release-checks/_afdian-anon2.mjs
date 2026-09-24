import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--mute-audio'] });
const ctx = await b.newContext({ viewport:{width:1280,height:1000} });
const p = await ctx.newPage();
await p.goto('https://afdian.com/a/zsy2026', { waitUntil:'domcontentloaded', timeout:60000 });
await p.waitForTimeout(5000);
// 点「动态」标签
await p.click('text="动态"', { timeout: 15000 }).catch(async () => {
  await p.evaluate(() => { const el = [...document.querySelectorAll('a,div,span,li')].find(e => (e.innerText||'').trim() === '动态'); if (el) el.click(); });
});
await p.waitForTimeout(6000);
const st = await p.evaluate(() => {
  const t = document.body.innerText;
  return {
    url: location.href,
    hasOurPost: /以太利亚|Dawnwake|aetheria/i.test(t),
    snippet: (t.match(/【发布】[^\n]{0,70}/) || [''])[0],
    bodySample: t.slice(200, 700).replace(/\n+/g, ' | '),
  };
});
console.log(JSON.stringify(st, null, 1).slice(0, 1100));
await p.screenshot({ path:'artifacts/98-afdian-anon-feed.png' });
await b.close();
