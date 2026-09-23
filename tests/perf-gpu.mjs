/**
 * Real-GPU frame time measurement.
 *
 * The smoke test runs headless, and headless Chromium has no GPU backend — it falls
 * back to SwiftShader (CPU rasterisation), so its frame times say nothing about the
 * real product. This script launches a HEADED Chromium (real Metal/ANGLE GPU on macOS),
 * reports which renderer actually drew the frames, and measures frame pacing under a
 * load that matches the design target (60+ units on screen).
 *
 * Usage: node tests/perf-gpu.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../artifacts/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: false, // ← the whole point: a real GPU surface
  args: [
    '--window-size=1600,980',
    '--mute-audio',
    // a headed window that is not foreground gets rAF throttled to ~1 Hz, which would
    // silently turn every measurement below into a lie
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // UNCAPPED=1 removes the vsync ceiling so the numbers below become the real frame
    // *cost* instead of an echo of the 120Hz refresh rate.
    ...(process.env.UNCAPPED === '1' ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__AETHERIA__ && window.__AETHERIA__.scene.isActive('Menu'), null, { timeout: 30000 });
await sleep(1000);
await page.screenshot({ path: `${OUT}gpu-01-menu.png` });

const gpu = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : 'none',
    vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : 'none',
    dpr: window.devicePixelRatio,
    drawingBuffer: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : null,
    memory: navigator.deviceMemory ?? 'n/a',
    cores: navigator.hardwareConcurrency ?? 'n/a',
  };
});
console.log(`GPU: ${gpu.vendor} / ${gpu.renderer} ${process.env.UNCAPPED === '1' ? '[uncapped mode]' : ''}`);
console.log(`viewport ${gpu.drawingBuffer?.[0]}×${gpu.drawingBuffer?.[1]} @dpr ${gpu.dpr} · cores ${gpu.cores} · mem ${gpu.memory}`);

const measure = async (label, setup) => {
  await page.bringToFront();
  await page.evaluate(setup);
  await sleep(1500);
  const stats = await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const step = (t) => {
        frames.push(t - last);
        last = t;
        if (++n < 300) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const sorted = frames.slice(2).sort((a, b) => a - b);
    const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    const sum = sorted.reduce((a, c) => a + c, 0);
    return {
      samples: sorted.length,
      avgMs: sum / sorted.length,
      p50: pick(0.5),
      p95: pick(0.95),
      worst: sorted[sorted.length - 1],
      over33: sorted.filter((f) => f > 33.4).length,
      units: window.__AETHERIA_BATTLE__ ? window.__AETHERIA_BATTLE__.world.units.length : 0,
    };
  });
  const fps = 1000 / stats.avgMs;
  console.log(
    `[${label}] avg ${stats.avgMs.toFixed(2)}ms (${fps.toFixed(1)} FPS) · p50 ${stats.p50.toFixed(2)} · p95 ${stats.p95.toFixed(2)} · worst ${stats.worst.toFixed(2)} · frames>33ms ${stats.over33}/${stats.samples} · ${stats.units} units`,
  );
  return stats;
};

// ── 1. baseline: opening minutes of the mission (target: a comfortable 60 FPS) ──
await page.evaluate(() => {
  window.__AETHERIA__.scene.getScene('Menu').scene.start('Battle', { missionId: 'm01', heroId: 'knightCommander' });
});
await page.waitForFunction(() => !!window.__AETHERIA_BATTLE__, null, { timeout: 30000 });
await sleep(2500);
const baseline = await measure('baseline · 6 units + base', () => {
  const b = window.__AETHERIA_BATTLE__;
  b.speed = 1;
  b.paused = false;
});

// ── 2. design load: 60 player units on screen, mid-fight ──
const load = await measure('design load · 60 units fighting', () => {
  const b = window.__AETHERIA_BATTLE__;
  const castle = b.world.buildings.find((x) => x.def.id === 'castle' && x.team === 1);
  b.world.wallet.gold = 9999;
  b.world.wallet.wood = 9999;
  b.world.popMax = 200;
  for (let i = 0; i < 56; i++) {
    const u = b.world.spawnUnit(i % 3 === 0 ? 'archer' : 'footman', castle.x + (Math.random() - 0.5) * 520, castle.y + (Math.random() - 0.5) * 520, 'dawn');
    u.team = 1;
  }
  const camp = b.world.buildings.find((x) => x.team === 2);
  b.orders.move(b.world.units.filter((u) => u.team === 1 && !u.isHero), camp.x, camp.y, true);
  b.cameras.main.setZoom(0.6); // pull back so everything is on screen at once
  b.cameras.main.centerOn((castle.x + camp.x) / 2, (castle.y + camp.y) / 2);
});

await sleep(6000); // let the fight really start (projectiles, deaths, particles)
const fight = await measure('peak load · combat + particles + minimap', () => {
  const b = window.__AETHERIA_BATTLE__;
  b.cameras.main.setZoom(0.5);
});
try {
  await page.screenshot({ path: `${OUT}gpu-02-load.png`, timeout: 15000 });
} catch {
  console.log('(load screenshot timed out)');
}

// ── 3. worst case: 90 units + the boss + all effects in one frame ──
const boss = await measure('worst case · 90 units + boss', () => {
  const b = window.__AETHERIA_BATTLE__;
  const bossUnit = b.ai.spawnBoss(b.mission);
  for (let i = 0; i < 30; i++) {
    const ang = (i / 30) * Math.PI * 2;
    const u = b.world.spawnUnit(i % 2 ? 'raider' : 'hunter', bossUnit.x + Math.cos(ang) * 260, bossUnit.y + Math.sin(ang) * 260, 'wildborn');
    u.team = 2;
  }
  b.orders.move(b.world.units.filter((u) => u.team === 1), bossUnit.x, bossUnit.y, true);
  b.cameras.main.setZoom(0.55);
  b.cameras.main.centerOn(bossUnit.x, bossUnit.y);
});
await sleep(6000);
const bossFight = await measure('worst case · boss fight sustained', () => {
  const b = window.__AETHERIA_BATTLE__;
  b.cameras.main.setZoom(0.5);
});
try {
  await page.screenshot({ path: `${OUT}gpu-03-bossfight.png`, timeout: 15000 });
} catch {
  console.log('(boss-fight screenshot timed out)');
}

// ── 4. headroom ramp: the numbers above are vsync-locked (120Hz), so push the unit
// count far past the design cap until the frame budget actually breaks. This turns
// "it hit the cap" into a real headroom number instead of a vsync echo.
const ramp = [];
for (const target of [120, 200, 300]) {
  await page.evaluate((n) => {
    const b = window.__AETHERIA_BATTLE__;
    const bossUnit = b.ai.boss ?? { x: b.world.map.playerStart.x + 400, y: b.world.map.playerStart.y + 400 };
    while (b.world.units.filter((u) => u.team === 1).length < n) {
      const u = b.world.spawnUnit(Math.random() < 0.5 ? 'archer' : 'footman', bossUnit.x + (Math.random() - 0.5) * 700, bossUnit.y + (Math.random() - 0.5) * 700, 'dawn');
      u.team = 1;
    }
    b.orders.move(b.world.units.filter((u) => u.team === 1), bossUnit.x, bossUnit.y, true);
  }, target);
  await sleep(4000);
  const stats = await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const step = (t) => {
        frames.push(t - last);
        last = t;
        if (++n < 240) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const sorted = frames.slice(2).sort((a, b) => a - b);
    const sum = sorted.reduce((a, c) => a + c, 0);
    const b = window.__AETHERIA_BATTLE__;
    return {
      avgMs: sum / sorted.length,
      p95: sorted[Math.floor(sorted.length * 0.95)],
      worst: sorted[sorted.length - 1],
      units: b.world.units.length,
      alive: b.world.units.filter((u) => !u.dead).length,
    };
  });
  ramp.push({ target, ...stats });
  console.log(`[ramp · target ${target}] avg ${stats.avgMs.toFixed(2)}ms (${(1000 / stats.avgMs).toFixed(1)} FPS) · p95 ${stats.p95.toFixed(2)} · worst ${stats.worst.toFixed(2)} · ${stats.alive} alive`);
}
await page.bringToFront();
try {
  await page.screenshot({ path: `${OUT}gpu-04-ramp.png`, timeout: 15000 });
} catch {
  console.log('(screenshot of the extreme-stress frame timed out — not part of the assertions)');
}
const rampWorst = ramp[ramp.length - 1];
check(
  'fps: headroom — 200+ units still hold the 120Hz vsync cap',
  ramp.find((r) => r.target === 200)?.avgMs <= 9,
  ramp.map((r) => `${r.target}→${(1000 / r.avgMs).toFixed(0)}fps`).join(' · '),
);
check('fps: extreme stress stays above 60 FPS', rampWorst.avgMs <= 16.7, `${(1000 / rampWorst.avgMs).toFixed(1)} FPS at ${rampWorst.alive} units`);
console.log(`MODE: ${process.env.UNCAPPED === '1' ? 'UNCAPPED (real frame cost)' : 'vsync-capped'}`);

check('gpu: a real (non-SwiftShader) renderer is in use', !/swiftshader|llvmpipe|software/i.test(gpu.renderer), gpu.renderer);
check('fps: baseline holds 60 FPS (avg frame <= 20ms)', baseline.avgMs <= 20, `${baseline.avgMs.toFixed(2)}ms (${(1000 / baseline.avgMs).toFixed(1)} FPS), p95 ${baseline.p95.toFixed(2)}ms`);
check('fps: 60-unit design load holds 60 FPS (avg <= 20ms)', load.avgMs <= 20, `${load.avgMs.toFixed(2)}ms (${(1000 / load.avgMs).toFixed(1)} FPS), p95 ${load.p95.toFixed(2)}ms, worst ${load.worst.toFixed(2)}ms`);
check('fps: sustained combat holds 60 FPS (avg <= 20ms)', fight.avgMs <= 20, `${fight.avgMs.toFixed(2)}ms (${(1000 / fight.avgMs).toFixed(1)} FPS), p95 ${fight.p95.toFixed(2)}ms`);
check('fps: worst case (90 units + boss) stays above 50 FPS', bossFight.avgMs <= 20, `${bossFight.avgMs.toFixed(2)}ms (${(1000 / bossFight.avgMs).toFixed(1)} FPS), p95 ${bossFight.p95.toFixed(2)}ms, worst ${bossFight.worst.toFixed(2)}ms`);
check('fps: no frame hitch over 50ms in the worst case', bossFight.worst <= 50, `worst ${bossFight.worst.toFixed(2)}ms · frames>33ms ${bossFight.over33}/${bossFight.samples}`);

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} GPU checks passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
