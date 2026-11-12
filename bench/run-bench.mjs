// Benchmark driver cho furu-office avatar rendering.
//   node bench/run-bench.mjs run   -> chạy ma trận kịch bản, ghi bench/results-*.json
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

// Thêm &nomerge&noshadow vào URL để đo baseline A/B với code hiện tại.
const ab = process.env.AB ? '&nomerge&noshadow' : '';

await page.goto(`${BASE}?bench=1&perf=1${ab}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__perf && window.__bench, null, { timeout: 15000 });

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
  await setup(page);
  await settle();
  const s = await sample();
  s.scenario = name;
  results.push(s);
  console.log(name.padEnd(34),
    `fps=${s.fps.toFixed(1)} ms(avg/p95)=${s.ms.avg.toFixed(1)}/${s.ms.p95.toFixed(1)} cpu=${s.cpu.avg.toFixed(1)}/${s.cpu.p95.toFixed(1)}`,
    `calls=${s.calls} tris=${(s.triangles / 1000).toFixed(0)}k geo=${s.geometries} tex=${s.textures} av=${s.avatars}`);
}

for (const n of [1, 5, 10, 20]) {
  for (const stance of ['sit', 'stand', 'mixed']) {
    await run(`n=${n} ${stance}`, async (p) => {
      if (stance === 'sit') await p.evaluate((k) => window.__bench.spawnSeated(k), n);
      else if (stance === 'stand') await p.evaluate((k) => window.__bench.spawnWalkers(k), n);
      else await p.evaluate((k) => window.__bench.spawnMixed(k), n);
    });
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
