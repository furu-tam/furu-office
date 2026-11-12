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

const A = await ctx.newPage(), B = await ctx.newPage(), C = await ctx.newPage();
for (const [tag, p] of [['A', A], ['B', B], ['C', C]]) {
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
}

try {
  await A.goto(BASE);
  await B.goto(BASE);
  await C.goto(BASE);
  await A.waitForFunction(() => window.__bench, null, { timeout: 15000 });
  await B.waitForFunction(() => window.__bench, null, { timeout: 15000 });
  await C.waitForFunction(() => window.__bench, null, { timeout: 15000 });
  // chờ cả 3 có floor thật (host hoặc link) — hub thấp có thể bị ghost giữ nên scan chậm
  const floorOk = (p) => p.waitForFunction(async () => {
    const w = await import('/src/world.js');
    const f = w.hooks.debug().floor;
    return f.host || f.link === true;
  }, null, { timeout: 45000, polling: 1000 });
  await floorOk(A);
  await floorOk(B);
  await floorOk(C);

  const aId = await A.evaluate(() => __bench.myId());
  const bId = await B.evaluate(() => __bench.myId());
  const cId = await C.evaluate(() => __bench.myId());
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

  // --- convo mesh: A,B,C cùng đi dạo GẦN NHAU; A mời B rồi mời C -> 3 người phải thấy nhau ---
  // enterFpv() spawn về (0,4) — B đang đứng cạnh ghế của A nên phải vào lại FPV để về chung spawn,
  // nếu không B "đi quá xa" khỏi nhóm và bị convoFar tự đá sau ~5s (đúng thiết kế).
  await A.evaluate(() => document.getElementById('vwalk').click());
  await C.evaluate(() => document.getElementById('vwalk').click());
  await B.evaluate(() => document.getElementById('vhome').click());
  await B.waitForTimeout(700);
  await B.evaluate(() => document.getElementById('vwalk').click());
  await B.waitForTimeout(2500);
  const wid = (id) => 'furuoff-w-' + id;
  const convoOf = (p) => p.evaluate(() => __bench.convo());
  await A.evaluate((id) => __bench.invite(id), bId);
  await B.waitForFunction(() => !document.getElementById('tapAsk').hidden, null, { timeout: 10000 });
  await B.evaluate(() => document.getElementById('tapYes').click());
  await B.waitForTimeout(2500);
  const [convA1, convB1] = [await convoOf(A), await convoOf(B)];
  check('A-B convo sau khi mời + nhận', convA1.includes(wid(bId)) && convB1.includes(wid(aId)), `A:${convA1} B:${convB1}`);
  await A.evaluate((id) => __bench.invite(id), cId);
  await C.waitForFunction(() => !document.getElementById('tapAsk').hidden, null, { timeout: 10000 });
  await C.evaluate(() => document.getElementById('tapYes').click());
  await C.waitForTimeout(6500); // > ngưỡng convoFar 5s — chứng minh mesh bền, không chỉ hình thành
  const [convA2, convB2, convC2] = [await convoOf(A), await convoOf(B), await convoOf(C)];
  const mesh = convA2.includes(wid(bId)) && convA2.includes(wid(cId))
    && convB2.includes(wid(aId)) && convB2.includes(wid(cId))
    && convC2.includes(wid(aId)) && convC2.includes(wid(bId));
  check('convo mesh 3 người (mọi cặp đều có call)', mesh, `A:${convA2} B:${convB2} C:${convC2}`);

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
