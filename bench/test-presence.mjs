// Test presence end-to-end: 2 browser thật kết nối qua PeerJS floor hub.
//   node bench/test-presence.mjs
// Cần: npm i (playwright-core) + server tĩnh:  python3 -m http.server 8977
// Chrome/Chromium chỉnh qua CHROME_BIN. Chạy xong exit 1 nếu có case FAIL.
//
// Khóa regression cho các bug đã gặp:
//   - walker không hiện phía remote / move bị đông cứng (rAF stall)
//   - avatar quay lưng (gửi camera yaw thay vì model yaw, lệch 180°)
//   - seat -> walk transition mất row
//   - tapNotice không bấm được khi FPV giữ pointer lock (phím T teleport)
import { chromium } from 'playwright-core';

const EXE = process.env.CHROME_BIN
  || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
// hub=furu-test: test chạy trên floor riêng — bot "T" không lọt vào phòng production
const BASE = process.env.BENCH_URL || 'http://localhost:8977/index.html?bench=1&perf=1&hub=furu-test';
const LOOK = { v: 2, gender: 'nam', face: 'vui', hair: 'ngan', hairColor: 0, skin: 1, top: 'polo', shirt: 8, pants: 0, acc: ['luoitrai'], accColor: 5 };

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? ' PASS ' : '*FAIL*') + ' ' + name + (extra ? '  ' + extra : ''));
  if (!cond) failures++;
}
const near = (a, b, tol = 0.05) => a != null && b != null && Math.abs(a - b) <= tol;
const wrapPi = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a; };

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
await ctx.addInitScript((l) => { localStorage.setItem('furu-office-look', JSON.stringify({ ...l, name: 'T' })); }, LOOK);

const A = await ctx.newPage(), B = await ctx.newPage();
for (const [tag, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
}

try {
  await A.goto(BASE);
  await B.goto(BASE);
  await A.waitForFunction(() => window.__bench, null, { timeout: 15000 });
  await B.waitForFunction(() => window.__bench, null, { timeout: 15000 });
  // chờ cả 2 có floor thật (host hoặc link) — hub thấp có thể bị ghost giữ nên scan chậm
  const floorOk = (p) => p.waitForFunction(async () => {
    const w = await import('/src/world.js');
    const f = w.hooks.debug().floor;
    return f.host || f.link === true;
  }, null, { timeout: 45000, polling: 1000 });
  await floorOk(A);
  await floorOk(B);

  const aId = await A.evaluate(() => __bench.myId());
  const bId = await B.evaluate(() => __bench.myId());
  const rowOn = (p, id) => p.evaluate((i) => __bench.rows().find((r) => r.id === i), id);
  console.log(`A=${aId} B=${bId}`);

  // --- B ngồi -> A thấy seat row ---
  await B.evaluate(() => document.querySelector('.dtag .sit').click());
  await A.waitForFunction((i) => {
    const r = __bench.rows().find((x) => x.id === i);
    return r && r.kind === 'seat';
  }, bId, { timeout: 15000, polling: 500 }).catch(() => {});
  const seated = await rowOn(A, bId);
  check('A thấy B ngồi (kind=seat)', seated && seated.kind === 'seat' && seated.walk === 0, seated && `t${seated.table}s${seated.slot}`);

  // --- B vào FPV -> A thấy walk row ---
  await B.evaluate(() => document.getElementById('vwalk').click());
  await B.waitForTimeout(2500);
  const walking = await rowOn(A, bId);
  check('A thấy B đi dạo (kind=walk, body hiện)', walking && walking.kind === 'walk' && walking.walk === 1 && walking.body && walking.visible, walking && `(${walking.wx?.toFixed(1)},${walking.wz?.toFixed(1)})`);

  // --- yaw: B spawn yaw mặc định PI (nhìn +Z) -> wyaw phải ≈ 0 (model nhìn +Z) ---
  check('yaw đúng chiều (wyaw≈0, không quay lưng)', walking && Math.abs(wrapPi(walking.wyaw)) < 0.3, walking && `wyaw=${walking.wyaw.toFixed(2)}`);

  // --- B đi tới -> A thấy vị trí mới + body theo kịp ---
  await B.keyboard.down('KeyW');
  await B.waitForTimeout(1200);
  await B.keyboard.up('KeyW');
  await B.waitForTimeout(1500);
  const moved = await rowOn(A, bId);
  check('move lan truyền (wz thay đổi)', moved && moved.wz !== walking.wz, walking && moved && `${walking.wz.toFixed(2)} -> ${moved.wz.toFixed(2)}`);
  check('body bám theo wx/wz', moved && near(moved.bx, moved.wx, 0.6) && near(moved.bz, moved.wz, 0.6), moved && `body(${moved.bx?.toFixed(1)},${moved.bz?.toFixed(1)}) vs (${moved.wx?.toFixed(1)},${moved.wz?.toFixed(1)})`);

  // --- A ngồi rồi vỗ vai B -> B bấm T teleport tới gần A ngay trong FPV ---
  await A.evaluate(() => document.querySelector('.dtag .sit').click());
  await A.waitForTimeout(2500);
  const aSeat = await rowOn(B, aId);
  check('B thấy A ngồi (làm đích teleport)', aSeat && aSeat.kind === 'seat' && aSeat.px != null);
  await A.evaluate((to) => __bench.floor({ kind: 'tap', id: 'tap-test-' + Date.now(), to, from: __bench.myId(), name: 'A' }), bId);
  await B.waitForTimeout(1500);
  const notice = await B.evaluate(() => !document.getElementById('tapNotice').hidden);
  check('B hiện tapNotice', notice);
  await B.keyboard.press('KeyT');
  await B.waitForTimeout(2000);
  const teleported = await rowOn(A, bId);
  const dTele = teleported && aSeat && Math.hypot(teleported.px - aSeat.px, teleported.pz - aSeat.pz);
  check('B bấm T teleport tới gần A (vẫn trong FPV)', teleported && teleported.walk === 1 && dTele < 3.5, teleported && `d=${dTele?.toFixed(2)}m`);

  // --- B thoát FPV (Home) -> row biến mất phía A ---
  await B.evaluate(() => document.getElementById('vhome').click());
  await B.waitForTimeout(2000);
  const gone = await rowOn(A, bId);
  check('A mất row khi B rời (gone)', !gone, gone && `vẫn còn ${JSON.stringify(gone)}`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} case FAIL` : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
