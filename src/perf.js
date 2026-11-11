import { G, renderer } from './world.js';

// ---------- perf monitor: khung hình + renderer.info + số avatar ----------
// Ring buffer mẫu frame; đọc renderer.info NGAY SAU renderer.render() trong
// cùng tick (autoReset xóa số liệu ở đầu render kế tiếp).
const CAP = 2048;
const deltas = new Float32Array(CAP); // ms giữa 2 frame (chu kỳ frame)
const cpus = new Float32Array(CAP);   // ms CPU của thân loop
let head = 0, len = 0, pending = -1;
let lastT = 0, t0 = 0;
const info = { calls: 0, tris: 0, geos: 0, texs: 0, progs: 0, avatars: 0, mixers: 0, bodies: 0 };

export function perfStart() {
  const now = performance.now();
  t0 = now;
  if (!lastT) { lastT = now; return; }
  deltas[head] = now - lastT;
  lastT = now;
  pending = head;
  head = (head + 1) % CAP;
  if (len < CAP) len++;
}

export function perfEnd() {
  if (pending < 0) return;
  cpus[pending] = performance.now() - t0;
  pending = -1;
  const i = renderer.info;
  info.calls = i.render.calls;
  info.tris = i.render.triangles;
  info.geos = i.memory.geometries;
  info.texs = i.memory.textures;
  info.progs = i.programs ? i.programs.length : 0;
  let bodies = 0, mixers = 0;
  for (const p of G.people.children) {
    const av = p.userData.avatar;
    if (!av) continue;
    bodies++;
    if (av.glb && av.mixer) mixers++;
  }
  info.bodies = bodies;
  info.avatars = bodies;
  info.mixers = mixers;
}

function pct(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
function summarize(buf) {
  const a = Array.from(buf.subarray(0, len)).sort((x, y) => x - y);
  const sum = a.reduce((s, v) => s + v, 0);
  return { avg: sum / (a.length || 1), p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: a.length ? a[a.length - 1] : 0 };
}

export function perfStats() {
  const d = summarize(deltas), c = summarize(cpus);
  return {
    frames: len,
    fps: d.avg > 0 ? 1000 / d.avg : 0,
    ms: { avg: d.avg, p50: d.p50, p95: d.p95, p99: d.p99, max: d.max },
    cpu: { avg: c.avg, p50: c.p50, p95: c.p95, max: c.max },
    calls: info.calls, triangles: info.tris,
    geometries: info.geos, textures: info.texs, programs: info.progs,
    avatars: info.avatars, mixers: info.mixers,
  };
}
export function perfReset() { head = 0; len = 0; pending = -1; lastT = 0; }

window.__perf = { stats: perfStats, reset: perfReset };

// ---------- HUD mini khi ?perf=1 ----------
if (new URLSearchParams(location.search).has('perf')) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99;background:rgba(7,21,26,.85);color:#bfeee8;font:11px/1.5 ui-monospace,monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  setInterval(() => {
    const s = perfStats();
    el.textContent = `${s.fps.toFixed(0)} fps  ${s.ms.avg.toFixed(1)}ms (p95 ${s.ms.p95.toFixed(1)})\n` +
      `cpu ${s.cpu.avg.toFixed(1)}ms (p95 ${s.cpu.p95.toFixed(1)})\n` +
      `calls ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k\n` +
      `geo ${s.geometries}  tex ${s.textures}\n` +
      `avatars ${s.avatars}  mixers ${s.mixers}`;
  }, 500);
}
