// Test anchor lan truyền cho NGƯỜI NGOÀI convo: A+B convo -> C phải thấy anchor + marker.
//   node bench/test-anchor.mjs
import { chromium } from 'playwright-core';

const EXE = process.env.CHROME_BIN
  || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = process.env.BENCH_URL || 'http://localhost:8977/index.html?bench=1&perf=1&hub=furu-test';
const LOOK = { v: 2, gender: 'nam', face: 'vui', hair: 'ngan', hairColor: 0, skin: 1, top: 'polo', shirt: 8, pants: 0, acc: ['luoitrai'], accColor: 5 };

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? ' PASS ' : '*FAIL*') + ' ' + name + (extra ? '  ' + extra : ''));
  if (!cond) failures++;
}

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
await ctx.addInitScript((l) => { localStorage.setItem('furu-office-look', JSON.stringify({ ...l, name: 'T' })); }, LOOK);

const A = await ctx.newPage(), B = await ctx.newPage(), C = await ctx.newPage();
for (const [tag, p] of [['A', A], ['B', B], ['C', C]]) {
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
}

try {
  await A.goto(BASE); await B.goto(BASE); await C.goto(BASE);
  for (const p of [A, B, C]) await p.waitForFunction(() => window.__bench, null, { timeout: 15000 });
  const floorOk = (p) => p.waitForFunction(async () => {
    const w = await import('/src/world.js');
    const f = w.hooks.debug().floor;
    return f.host || f.link === true;
  }, null, { timeout: 45000, polling: 1000 });
  await floorOk(A); await floorOk(B); await floorOk(C);
  const aId = await A.evaluate(() => __bench.myId());
  const bId = await B.evaluate(() => __bench.myId());

  // A,B đi dạo -> A mời B -> B nhận -> convo
  await A.evaluate(() => document.getElementById('vwalk').click());
  await B.evaluate(() => document.getElementById('vwalk').click());
  await B.waitForTimeout(2500);
  // chờ C thấy A,B trên floor (walk presence lan đủ)
  await C.waitForFunction((ids) => ids.every((i) => __bench.rows().some((r) => r.id === i)),
    [aId, bId], { timeout: 30000, polling: 500 });
  await A.evaluate((id) => __bench.invite(id), bId);
  await B.waitForFunction(() => !document.getElementById('tapAsk').hidden, null, { timeout: 10000 });
  await B.evaluate(() => document.getElementById('tapYes').click());
  await B.waitForTimeout(3000);

  const wid = (id) => 'furuoff-w-' + id;
  const anchorsOf = (p) => p.evaluate(() => __bench.anchors());

  const [aA, aB, aC] = await Promise.all([anchorsOf(A), anchorsOf(B), anchorsOf(C)]);
  console.log('A anchors:', JSON.stringify(aA));
  console.log('B anchors:', JSON.stringify(aB));
  console.log('C anchors:', JSON.stringify(aC));

  check('C thấy anchor của convo A-B', aC.length >= 1 && aC.some((a) => a.members.includes(wid(aId)) && a.members.includes(wid(bId))), `C:${aC.length}`);
  check('C render marker + lines', aC.some((a) => a.marker && a.lines >= 1), aC[0] && `marker=${aC[0].marker} lines=${aC[0].lines}`);
  check('B cũng có anchor (được mời)', aB.some((a) => a.members.includes(wid(aId))), `B:${aB.length}`);

  // anchor bám theo nhóm: A đi xa -> vị trí anchor đổi theo
  const before = aC[0] && { x: aC[0].x, z: aC[0].z };
  await A.keyboard.down('KeyW');
  await A.waitForTimeout(2000);
  await A.keyboard.up('KeyW');
  await A.waitForTimeout(2000);
  const aC2 = await anchorsOf(C);
  check('anchor di chuyển theo nhóm', aC2[0] && before && (Math.abs(aC2[0].x - before.x) > 0.3 || Math.abs(aC2[0].z - before.z) > 0.3),
    before && aC2[0] && `(${before.x},${before.z}) -> (${aC2[0].x},${aC2[0].z})`);

  // B rời convo -> line của B mất (không còn chỉ thừa), anchor chết khi <2
  await B.evaluate(() => document.getElementById('btnConvoEnd').click());
  await B.waitForTimeout(2500);
  const aC3 = await anchorsOf(C);
  const aB2 = await anchorsOf(B);
  check('anchor chết khi còn 1 member (C)', !aC3.length, `C:${JSON.stringify(aC3)}`);
  check('B không còn thấy anchor sau khi rời', !aB2.length, `B:${JSON.stringify(aB2)}`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} case FAIL` : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
