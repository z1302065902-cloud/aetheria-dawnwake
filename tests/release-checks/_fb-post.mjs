import fs from 'node:fs/promises';
const text = (await fs.readFile('/tmp/fb-post.txt', 'utf8')).trim();
const task = await takeOverTaskSpace(36);
const page = await task.newPage();
// FB 的 domcontentloaded 常常永远到不了（有资源被挂住）→ 容错继续
try {
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
} catch (e) {
  console.log('   （goto 超时，但页面已在加载，继续）');
}
await page.waitForTimeout(16000);
console.log('1) URL:', await page.url());
// 开 composer
try { await page.click('loc=role:button[name*="分享你的新鲜事吧"]', { label: 'open composer' }); } catch (e) { console.log('  开 composer 失败:', String(e).slice(0, 60)); }
// 等编辑器
let ready = false;
for (let i = 0; i < 6 && !ready; i++) {
  await page.waitForTimeout(5000);
  ready = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    return !!(d && d.querySelector('div[role=textbox]'));
  });
  console.log('   等编辑器:', ready);
}
if (!ready) { console.log('✗ 编辑器未出现，放弃'); await page.close(); }
else {
  // 填
  try { await page.fill('loc=css:div[role=textbox]', text, { clearFirst: true }); console.log('2) ✅ 文案已填入'); }
  catch (e) { console.log('2) 填充失败:', String(e).slice(0, 80)); }
  await page.waitForTimeout(2500);
  const len = await page.evaluate(() => (document.querySelector('[role=dialog] div[role=textbox]')?.innerText || '').length);
  console.log('   编辑器字符数:', len);
  // 找发布按钮（对话框内，面积最小的精确匹配）
  const btn = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    const cands = [...d.querySelectorAll('[role=button],button,div,span')].filter(e => ['发布', 'Post'].includes((e.innerText || '').trim()));
    return cands.map(e => { const r = e.getBoundingClientRect(); return { t: (e.innerText||'').trim(), x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), w: Math.round(r.width), h: Math.round(r.height) }; }).sort((a,b) => a.w*a.h - b.w*b.h)[0] || null;
  });
  console.log('3) 发布按钮:', JSON.stringify(btn));
  if (btn && len > 50) {
    await page.mouse.click(btn.x, btn.y, { label: 'publish the post' });
    await page.waitForTimeout(9000);
    const after = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      const main = document.querySelector('[role=main]');
      return { dlgOpen: !!d, mainHead: (main?.innerText || '').slice(0, 120).replace(/\n+/g, ' | ') };
    });
    console.log('4) 发布后:', JSON.stringify(after).slice(0, 400));
  } else console.log('   （未点击：按钮或内容不满足）');
}
