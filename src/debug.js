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
  if (e.code !== 'Backquote' || e.repeat) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  show = !show;
});
window.__dbg = (v) => { show = v !== false; };

const yn = (v) => (v ? '1' : '0');
function render() {
  el.hidden = !show;
  if (!show || !hooks.debug) return;
  const d = hooks.debug();
  const L = [];
  L.push(`DBG · id ${d.myId} · đảo ${d.island}#${d.slot} · mic ${yn(d.micOn)} cam ${yn(d.camOn)}${d.fpv ? ' · FPV' : ''}${d.dnd ? ' · DND' : ''}${d.bc ? ' · BC' : ''}`);
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
