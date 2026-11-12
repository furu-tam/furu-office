import { hooks } from './world.js';

// ---------- debug panel: xem ruột kết nối PeerJS ----------
// Bật: thêm ?debug=1 vào URL, localStorage 'furu-dbg'='1', hoặc bấm phím ` (backquote).
// Cập nhật 2 lần/giây từ hooks.debug() — không ảnh hưởng khi tắt.

const el = document.createElement('div');
el.id = 'dbgPanel';
el.hidden = true;
el.style.cssText = [
  'position:fixed', 'left:8px', 'bottom:8px', 'z-index:9999',
  'max-width:400px', 'max-height:55vh', 'overflow:auto',
  'padding:8px 10px', 'border-radius:8px',
  'background:rgba(4,16,20,.78)', 'color:#7fe0c0',
  'font:10px/1.45 ui-monospace,Menlo,monospace',
  'white-space:pre-wrap', 'pointer-events:none', 'user-select:text',
].join(';');
document.body.appendChild(el);

let show = new URLSearchParams(location.search).has('debug')
  || localStorage.getItem('furu-dbg') === '1';
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Backquote') { show = !show; return; }
  if (show && e.code === 'KeyC') copyDbg();
});
window.__dbg = (v) => { show = v !== false; };

// bắt lỗi JS + promise không xử lý vào chung log để điều tra sau
const ev = (m) => { try { hooks.dbgEv && hooks.dbgEv(m); } catch (e) {} };
addEventListener('error', (e) => ev('JS lỗi: ' + (e.message || e.type) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', (e) => ev('promise lỗi: ' + (e.reason && (e.reason.message || e.reason.type || e.reason) || '?')));
const _cerr = console.error.bind(console);
console.error = (...a) => { try { ev('console.error: ' + a.map(String).join(' ').slice(0, 160)); } catch (e) {} _cerr(...a); };

function dbgText() {
  const d = hooks.debug ? hooks.debug() : null;
  const L = [
    '=== furu-office debug dump ' + new Date().toISOString() + ' ===',
    'url: ' + location.href,
    'ua: ' + navigator.userAgent,
  ];
  if (d) L.push('snap: ' + JSON.stringify({ myId: d.myId, island: d.island, slot: d.slot, mic: d.micOn, peer: d.peer, peers: d.peers, floor: d.floor, walk: d.walk }));
  L.push('--- log ---');
  (hooks.dbgLog ? hooks.dbgLog() : []).forEach((l) => L.push(l));
  return L.join('\n');
}
function copyDbg() {
  const txt = dbgText();
  const done = () => hooks.toast && hooks.toast('Đã copy log debug — gửi cho Devin.');
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done).catch(() => fallback()); return; }
  fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    ta.remove();
  }
}
window.__dbgCopy = copyDbg;

const yn = (v) => (v ? '1' : '0');
function render() {
  el.hidden = !show;
  if (!show || !hooks.debug) return;
  const d = hooks.debug();
  const L = [];
  L.push(`DBG · id ${d.myId} · đảo ${d.island}#${d.slot} · mic ${yn(d.micOn)} cam ${yn(d.camOn)}${d.fpv ? ' · FPV' : ''}${d.dnd ? ' · DND' : ''}${d.bc ? ' · BC' : ''}  [\`: tắt · c: copy log]`);
  L.push(d.peer
    ? `peer ${d.peer.id} open=${yn(d.peer.open)} dest=${yn(d.peer.destroyed)} disc=${yn(d.peer.disconn)}`
    : `peer - ${d.opening ? '(đang mở…)' : '(chưa mở)'}`);
  if (d.stream) L.push('stream ' + d.stream.join(' '));
  L.push(`floor host=${yn(d.floor.host)} link=${d.floor.link == null ? '-' : yn(d.floor.link)} conns=${d.floor.conns} people=${d.floor.people}`);
  L.push(`walk peer=${d.walk.peer || '-'} convo=${d.walk.convo} conns=${d.walk.conns} calls=${d.walk.calls} streams=${d.walk.streams}`);
  if (d.peers.length) {
    L.push('peers:');
    d.peers.forEach((p) => {
      const c = p.call ? `call=${p.call.open ? 'open' : 'dead'} ice=${p.call.ice}` : 'call=-';
      L.push(`  ${p.name} ${p.pid.slice(-8)}\n    conn=${p.conn} ${c} rx=${p.rx} g=${p.gain}`);
    });
  }
  if (d.log.length) { L.push('log:'); d.log.forEach((l) => L.push('  ' + l)); }
  el.textContent = L.join('\n');
}
setInterval(render, 500);
render();
