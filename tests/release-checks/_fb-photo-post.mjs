import fs from 'node:fs/promises';
const caption = `Aetheria: Dawnwake · 以太利亚 · 黎明觉醒
单人幻想即时战略 · 浏览器打开即玩 · 中英双语
免费试玩前两关 → https://z1302065902-cloud.github.io/aetheria-dawnwake/
完整版 $1 → https://zsy2026.itch.io/aetheria-dawnwake
全部美术与音效由代码程序化生成。`;
const task = await takeOverTaskSpace(36);
const page = await task.newPage();
try { await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch (e) { console.log('  (goto 容错)'); }
await page.waitForTimeout(16000);
console.log('1) URL:', await page.url());
// 开 composer
try { await page.click('loc=role:button[name*="分享你的新鲜事吧"]', { label: 'open composer' }); } catch (e) { console.log('  开 composer 失败'); }
// 等编辑器
let ready = false;
for (let i = 0; i < 6 && !ready; i++) {
  await page.waitForTimeout(5000);
  ready = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return !!(d && d.querySelector('div[role=textbox]')); });
}
console.log('2) 编辑器就绪:', ready);
if (!ready) { console.log('✗ 放弃'); await page.close(); }
else {
  // 3) 挂 chooser 并点「照片/视频」
  const cp = page.waitForFileChooser({ timeout: 20000 }).catch(() => null);
  try { await page.click('loc=css:[aria-label="照片/视频"]', { label: 'attach photo' }); }
  catch (e) {
    console.log('  aria 选择器失败，尝试坐标');
    const b = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const el = [...d.querySelectorAll('[role=button]')].find(x => /照片|视频|Photo|photo/i.test(x.getAttribute('aria-label')||'')); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), l: el.getAttribute('aria-label') }; });
    console.log('  按钮:', JSON.stringify(b));
    if (b) await page.mouse.click(b.x, b.y, { label: 'attach photo by coords' });
  }
  const ch = await cp;
  if (ch) { await ch.setFiles(['/tmp/fb-photo.jpg']); console.log('3) ✅ 图片已提交'); await page.waitForTimeout(9000); }
  else console.log('3) ✗ 文件选择器未出现');
  // 4) 填文案
  try { await page.fill('loc=css:div[role=textbox]', caption, { clearFirst: true }); console.log('4) ✅ 文案已填'); } catch (e) { console.log('4) 文案失败:', String(e).slice(0, 60)); }
  await page.waitForTimeout(2500);
  // 5) 发帖
  const btn = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const el = d && d.querySelector('[aria-label="发帖"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; });
  console.log('5) 发帖按钮:', JSON.stringify(btn));
  if (btn) { await page.mouse.click(btn.x, btn.y, { label: 'publish photo post' }); await page.waitForTimeout(12000); }
  const after = await page.evaluate(() => ({ dlgOpen: !!document.querySelector('[role=dialog]'), mainLen: (document.querySelector('[role=main]')?.innerText||'').length }));
  console.log('6) 发布后:', JSON.stringify(after));
}
