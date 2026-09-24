import { chromium } from 'playwright';
// 现在 LetsVPN 是全局模式，可直接访问（不再需要代理）
const b = await chromium.launch({ channel:'chromium', headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
const targets = [
  { name: 'GitHub Pages', url: 'https://z1302065902-cloud.github.io/aetheria-dawnwake/', direct: true },
  { name: 'Vercel',       url: 'https://aetheria-dawnwake.vercel.app/',                     direct: true },
  { name: 'itch.io',      url: 'https://zsy2026.itch.io/aetheria-dawnwake',                 direct: false },
];
for (const t of targets) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let gamePage = p;
    if (!t.direct) {
      await p.waitForTimeout(2500);
      await p.click('text="Run game"', { timeout: 20000 }).catch(() => {});
      let frame = null;
      for (let i = 0; i < 20 && !frame; i++) { await p.waitForTimeout(2000); frame = p.frames().find(fr => /itch\.zone/.test(fr.url())) || null; }
      if (!frame) throw new Error('itch 游戏 frame 未出现');
      await p.waitForTimeout(4000);
      const ok = await frame.evaluate(() => !!(window.__AETHERIA__ && window.__AETHERIA__.scene)).catch(() => false);
      console.log(`${t.name.padEnd(14)} ✅ 引擎启动=${ok} · frame=${frame.url().slice(0, 52)}`);
      await p.close(); continue;
    }
    await p.waitForFunction(() => !!(window.__AETHERIA__ && window.__AETHERIA__.scene), null, { timeout: 60000 });
    const st = await p.evaluate(async () => {
      const g = window.__AETHERIA__;
      g.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
      return true;
    });
    await p.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 40000 });
    await p.waitForTimeout(4000);
    const s = await p.evaluate(() => ({ units: window.__AETHERIA_BATTLE__.world.units.length, buildings: window.__AETHERIA_BATTLE__.world.buildings.length, hud: window.__AETHERIA__.scene.isActive('Hud') }));
    console.log(`${t.name.padEnd(14)} ✅ 引擎+战斗可跑 ${JSON.stringify(s)} · 报错=${errs.length ? errs[0].slice(0,40) : '无'}`);
  } catch (e) {
    console.log(`${t.name.padEnd(14)} ❌ ${String(e).slice(0, 70)}`);
  }
  await p.close();
}
await b.close();
