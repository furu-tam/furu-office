// Benchmark driver cho furu-office avatar rendering.
//   node bench/run-bench.mjs run   -> chạy ma trận kịch bản, ghi bench/results-*.json
//   node bench/run-bench.mjs gen   -> sinh lại bench/bench-avatar.glb (fixture skinned)
// Cần: npm i playwright-core + Chrome/Chromium (chỉnh EXE), và server tĩnh ở :8977
//   python3 -m http.server 8977
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.env.CHROME_BIN
  || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = process.env.BENCH_URL || 'http://localhost:8977/index.html';
const OUT = join(ROOT, 'bench');
mkdirSync(OUT, { recursive: true });

const SAMPLE_MS = Number(process.env.SAMPLE_MS || 6000);
const SETTLE_MS = Number(process.env.SETTLE_MS || 2500);

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--window-size=1440,900'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const mode = process.argv[2] || 'run';
// Thêm &nomerge&noshadow vào URL để đo baseline A/B với code hiện tại.
const ab = process.env.AB ? '&nomerge&noshadow' : '';

await page.goto(`${BASE}?bench=${mode === 'gen' ? 'gen' : '1'}&perf=1${ab}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__perf && window.__bench, null, { timeout: 15000 });

if (mode === 'gen') {
  await page.waitForFunction(() => window.__glbB64 || window.__glbErr, null, { timeout: 20000 });
  const err = await page.evaluate(() => window.__glbErr);
  if (err) { console.error('gen error:', err); process.exit(1); }
  const b64 = await page.evaluate(() => window.__glbB64);
  writeFileSync(join(OUT, 'bench-avatar.glb'), Buffer.from(b64, 'base64'));
  console.log('wrote bench/bench-avatar.glb');
  await browser.close();
  process.exit(0);
}

const probe = await page.evaluate(() => window.__bench.probe());
console.log('PROBE', JSON.stringify(probe));

async function sample() {
  await page.evaluate(() => window.__perf.reset());
  await page.waitForTimeout(SAMPLE_MS);
  return page.evaluate(() => ({ ...window.__perf.stats(), counts: window.__bench.counts() }));
}
async function settle() { await page.waitForTimeout(SETTLE_MS); }

const results = [];
async function run(name, setup) {
  await page.evaluate(() => window.__bench.clear());
  await page.evaluate(() => window.__bench.clearGlb());
  await setup(page);
  await settle();
  const s = await sample();
  s.scenario = name;
  results.push(s);
  console.log(name.padEnd(34),
    `fps=${s.fps.toFixed(1)} ms(avg/p95)=${s.ms.avg.toFixed(1)}/${s.ms.p95.toFixed(1)} cpu=${s.cpu.avg.toFixed(1)}/${s.cpu.p95.toFixed(1)}`,
    `calls=${s.calls} tris=${(s.triangles / 1000).toFixed(0)}k geo=${s.geometries} tex=${s.textures} av=${s.avatars} mix=${s.mixers}`);
}

for (const n of [1, 5, 10, 20]) {
  for (const stance of ['sit', 'stand', 'mixed']) {
    for (const glb of [0, 1]) {
      await run(`n=${n} ${stance} glb=${glb}`, async (p) => {
        if (glb) await p.evaluate(() => window.__bench.loadGlb());
        if (stance === 'sit') await p.evaluate((k) => window.__bench.spawnSeated(k), n);
        else if (stance === 'stand') await p.evaluate((k) => window.__bench.spawnWalkers(k), n);
        else await p.evaluate((k) => window.__bench.spawnMixed(k), n);
        if (glb) await p.evaluate(() => window.__bench.joinMe());
      });
    }
  }
}

await run('churn seated (10 present)', async (p) => {
  await p.evaluate(() => window.__bench.spawnSeated(10));
  p.evaluate(() => window.__bench.churn({ cycles: 40, intervalMs: 100 }));
});
await run('churn walk (10 present)', async (p) => {
  await p.evaluate(() => window.__bench.spawnSeated(10));
  p.evaluate(() => window.__bench.churn({ cycles: 40, intervalMs: 100, walk: true }));
});

writeFileSync(join(OUT, `results-${Date.now()}.json`), JSON.stringify({ probe, ab: !!ab, results }, null, 2));
console.log('DONE');
await browser.close();
