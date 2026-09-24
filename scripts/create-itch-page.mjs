/**
 * 用 ego-browser 自动创建 itch.io 项目页 / Create the itch.io project page automatically.
 *
 * 为什么需要它：butler 只能给「已存在」的项目上传文件，项目页必须先在网页端创建。这一步原本要手动填表，
 * 现在脚本化，配合 scripts/finish-itch-publish.sh 就能一条命令走完整个 itch 发布。
 *
 * 运行：~/.local/bin/ego-browser nodejs < scripts/create-itch-page.mjs
 * 前置：itch.io 可达（需连 VPN —— 主站在本机被 DNS 污染 + SNI 阻断），浏览器已登录 zsy2026。
 *
 * 依据实测：表单字段名 game[title] / game[slug] / game[short_text]；Kind 下拉需展开后选 HTML；
 * 保存按钮是 button.save_btn；封面用 JPEG（PNG 那次被服务端拒）；文件选择器要 click 后 await。
 */
const SLUG = 'aetheria-dawnwake';
const USER = 'zsy2026';
const TITLE = 'Aetheria: Dawnwake · 以太利亚 · 黎明觉醒';
const SHORT =
  '单人幻想即时战略 · 英雄成长 · Roguelite 遗物 — 十关三幕，中英双语，浏览器打开即玩。Single-player fantasy RTS in your browser.';
const ROOT = '/Users/zsy/Desktop/游戏项目/aetheria-rts';
const COVER = `${ROOT}/release/itch/cover.jpg`;
const SHOTS = [1, 2, 3, 4, 5, 6].map((i) => {
  const names = ['1-menu', '2-deploy', '3-battle', '4-heroes', '5-campaign', '6-result'];
  return `${ROOT}/release/itch/shots/${names[i - 1]}.png`;
});

const task = await taskSpace('create itch project page');
console.log('spaceId:', task.spaceId);
const page = task.page('p1');

await page.goto('https://itch.io/game/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

const url = await page.url();
if (/\/login/.test(url)) {
  console.error('✗ 跳到了登录页 —— 请先在 ego 浏览器里登录 itch.io（账号 zsy2026），再运行本脚本。');
  await task.handOff();
  throw new Error('not logged in');
}

// ── 1. 文本字段 ────────────────────────────────────────────────────────────
await page.fill('loc=css:input[name="game[title]"]', TITLE);
await page.fill('loc=css:input[name="game[slug]"]', SLUG);
await page.fill('loc=css:input[name="game[short_text]"]', SHORT.slice(0, 190));
console.log('✓ 已填 title / slug / short_text');

// ── 2. Kind = HTML（下载物改为浏览器内运行） ───────────────────────────────
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Upload Cover Image|Kind of project/i.test(x.innerText));
  void b;
  const box = [...document.querySelectorAll('input')].find((i) => i.parentElement && /Kind of project/i.test(i.parentElement.parentElement?.innerText || ''));
  if (box) box.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(500);
const kindOk = await page.evaluate(() => {
  // the dropdown is a textbox that opens a list of options
  const inputs = [...document.querySelectorAll('input')];
  const kindIdx = inputs.findIndex((i) => /Downloadable|HTML/.test(i.value || ''));
  if (kindIdx >= 0) {
    inputs[kindIdx].scrollIntoView({ block: 'center' });
    inputs[kindIdx].click();
    return true;
  }
  return false;
});
await page.waitForTimeout(900);
if (kindOk) {
  await page.click('text="HTML"', { label: 'choose HTML kind' }).catch(() => {});
  await page.waitForTimeout(700);
}
const kindNow = await page.evaluate(() => {
  const t = document.body.innerText;
  return /Kind of project[\s\S]{0,80}?HTML/.test(t) ? 'HTML' : 'unknown';
});
console.log('✓ Kind =', kindNow);

// ── 3. 封面 + 截图（文件选择器：先挂号、再点击） ───────────────────────────
async function upload(buttonRe, files, label) {
  const chooserP = page.waitForFileChooser({ timeout: 15000 }).catch(() => null);
  await page.evaluate((re) => {
    const b = [...document.querySelectorAll('button')].find((x) => new RegExp(re, 'i').test(x.innerText));
    if (b) {
      b.scrollIntoView({ block: 'center' });
      b.click();
    }
  }, buttonRe.source || buttonRe);
  const chooser = await chooserP;
  if (!chooser) {
    console.log(`! ${label}: 文件选择器未弹出`);
    return false;
  }
  await chooser.setFiles(files);
  console.log(`✓ ${label}: 已提交 ${files.length} 个文件`);
  return true;
}

await upload(/Upload Cover Image/, [COVER], '封面');
// wait for the cover preview to actually land before moving on
let coverLanded = false;
for (let i = 0; i < 8 && !coverLanded; i++) {
  await page.waitForTimeout(2000);
  coverLanded = await page.evaluate(() => {
    const t = document.body.innerText;
    const bad = /There's an issue with the file/.test(t);
    const imgs = [...document.querySelectorAll('img')].filter((x) => x.naturalWidth > 100 && !/static\.itch|itch\.io/.test(x.src));
    return !bad && imgs.length > 0;
  });
}
console.log(coverLanded ? '✓ 封面已显示预览' : '! 封面未确认（继续，页面可能仍会保存）');

await upload(/Add screenshots/, SHOTS, '截图');
await page.waitForTimeout(8000);

// ── 4. 保存 ───────────────────────────────────────────────────────────────
const saved = await page.evaluate(() => {
  const b = document.querySelector('button.save_btn') || [...document.querySelectorAll('button')].find((x) => /Save & view page/i.test(x.innerText));
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  b.click();
  return true;
});
console.log(saved ? '✓ 已点击 Save & view page' : '✗ 找不到保存按钮');
await page.waitForTimeout(8000);

const after = await page.evaluate(() => {
  const t = document.body.innerText;
  const err = t.match(/(There's an issue[\s\S]{0,80}|is required[\s\S]{0,40})/);
  return { url: location.href, err: err ? err[0].replace(/\n+/g, ' ') : null };
});
console.log('保存后 URL:', after.url);
if (after.err) console.log('! 页面提示:', after.err);
console.log('下一步: bash scripts/finish-itch-publish.sh  （butler 上传 + 验 200）');
console.log(`页面地址应为: https://${USER}.itch.io/${SLUG}`);
await task.handOff();
