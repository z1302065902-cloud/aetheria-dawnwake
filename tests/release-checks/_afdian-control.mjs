import { chromium } from 'playwright';
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--mute-audio'] });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const p = await ctx.newPage();
// 1) 匿名去发现页找一个创作者
await p.goto('https://afdian.com/discover', { waitUntil:'domcontentloaded', timeout:60000 }).catch(async () => {
  await p.goto('https://afdian.com/', { waitUntil:'domcontentloaded', timeout:60000 });
});
await p.waitForTimeout(6000);
const links = await p.evaluate(() => [...new Set([...document.querySelectorAll('a')].map(a => a.getAttribute('href')||'').filter(h => /^\/a\/[\w-]+/.test(h)))].slice(0, 4));
console.log('发现的创作者页:', JSON.stringify(links));
for (const l of links) {
  await p.goto('https://afdian.com' + l, { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(5000);
  const st = await p.evaluate(() => {
    const t = document.body.innerText;
    return {
      url: location.href,
      name: (t.match(/^[^\n]{2,20}$/m) || [''])[0],
      unverified: /未认证创作者/.test(t),
      postCards: (t.match(/发布了动态|发布了文章|发布了视频/g) || []).length,
      feedText: (t.match(/(动态)[\s\S]{0,200}/) || [''])[0].replace(/\n+/g,' | ').slice(0, 150),
    };
  });
  console.log(' ', JSON.stringify(st));
}
await b.close();
