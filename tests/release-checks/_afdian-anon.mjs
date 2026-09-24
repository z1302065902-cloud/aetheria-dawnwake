import { chromium } from 'playwright';
// 全新 profile = 无任何 cookie = 真匿名
const b = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('https://afdian.com/a/zsy2026', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(6000);
const loggedOut = await p.evaluate(() => !!document.querySelector('a[href*=login]') || /登录/.test(document.body.innerText.slice(0, 200)));
const st = await p.evaluate(() => {
  const t = document.body.innerText;
  return {
    title: document.title,
    hasOurPost: /以太利亚|Dawnwake|aetheria/i.test(t),
    snippet: (t.match(/【发布】[^\n]{0,60}/) || [''])[0],
    creatorName: (t.match(/zsy2026/) || [''])[0],
    creating: (t.match(/正在创作[^\n]{0,40}/) || [''])[0],
    postCount: (t.match(/\d+\s*条?动态/) || [''])[0],
  };
});
console.log('匿名访问（无 cookie）:', JSON.stringify({ ...st, loggedOutBanner: loggedOut, errors: errs.slice(0, 2) }, null, 1));
await p.screenshot({ path: 'artifacts/97-afdian-anon.png' });
await b.close();
