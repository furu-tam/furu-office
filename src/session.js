import * as THREE from 'three';
import { BODY_ACC, EXCL, ROWS, buildWalker, clampLook, createPreview, disposeAvatar, freshLook, lookSig, normalizeLook, randomLook } from './avatar.js';

import {
  hooks, setCamera, setTween, setFollow, setMyIsland, setHoveredIsland, setWatchingFish, setInSecurity, setFishPose, setSecurityPose, setSecurityBlocked, setWalkView,
  AGENTS, AQ, G, REDUCED, SECURITY_URL, T, boat, box, burndownTex, buttons, camera, cancelMyCoffee, canvas, controls, desk, deskTagsEl, facesEl, fishBtn, fishPose, fishTag, follow, go, gulls, hoveredIsland, inSecurity, islands, labelsEl, meetingTvMat, meetingTvMesh, myIsland, onCoffeeOrder, orderCoffee, ortho, persp, pickers, rackMats, renderer, scene, seaMat, seated, securityBlocked, securityPose, securityTag, summonAgent, tags, tween, updateAgents, updateServer, watchingFish
} from './world.js';

// ---------- ngồi bàn làm việc: tiếng và camera trong cùng đảo ----------
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.55, 28),
  new THREE.MeshBasicMaterial({ color: 0x3fd0c0, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.03;
ring.visible = false;
scene.add(ring);

const HEAR_FULL = 1.8;   // nghe full trong bán kính này (m)
const HEAR_RANGE = 2.6;  // hết nghe ngoài bán kính này (m)
const PAIR_DUCK = 0.15;  // mức nền khi đang nói riêng / trong convo
const TAP_RANGE = 3.4;   // tầm vỗ vai mời nói chuyện khi đi dạo (m)
const hearRing = new THREE.Mesh(
  new THREE.RingGeometry(HEAR_RANGE - 0.05, HEAR_RANGE, 64),
  new THREE.MeshBasicMaterial({ color: 0x3fd0c0, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false })
);
hearRing.rotation.x = -Math.PI / 2;
hearRing.position.y = 0.035;
hearRing.visible = false;
scene.add(hearRing);

const $ = (id) => document.getElementById(id);
const _pt = new THREE.Vector3();
const people = new Map();
const bubbles = new Map();
const bubblesEl = document.getElementById('bubbles');
const roomLog = [];
const seenSay = new Set();
let myId = rid(9);
let mySlot = 0;
let myPresence = null;
let myLook = null;
let pendingPresence = null;
let localStream = null;
let micOn = false, camOn = false;
let sharing = false;
let screenStream = null;
let screenTex = null;
let screenVideo = null;
let screenCall = null;
const screenCalls = new Map();
let audioCtx = null;
let localMeter = null;
const remoteMeters = new Map();
const MIC_HTML = '<span class="mic" hidden aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.3-3A5.3 5.3 0 0 1 12 16.2 5.3 5.3 0 0 1 6.7 11H5a7 7 0 0 0 6 6.7V21h2v-3.3A7 7 0 0 0 19 11h-1.7z"/></svg><i></i><i></i><i></i></span>';
let peers = {};
// log sự kiện kết nối cho debug panel (?debug=1 hoặc phím `) — persist vào
// localStorage để sống qua reload; bấm c trong panel là copy hết để gửi Devin.
const dbgLog = [];
function dbgEv(msg) {
  const line = new Date().toLocaleTimeString('en-GB') + ' ' + msg;
  dbgLog.push(line);
  if (dbgLog.length > 200) dbgLog.shift();
  try { localStorage.setItem('furu-dbgl', JSON.stringify(dbgLog.slice(-200))); } catch (e) {}
}
const pidShort = (pid) => String(pid || '').slice(-6);
try { const prev = JSON.parse(localStorage.getItem('furu-dbgl') || '[]'); if (Array.isArray(prev)) dbgLog.push.apply(dbgLog, prev.slice(-200)); } catch (e) {}
dbgEv('— boot ' + myId + ' —');
let myPeer = null;
let broadcastOn = false;   // đang nói cho cả đảo
let dnd = false;           // không làm phiền: khóa mic/cam, im lặng, từ chối mọi lời mời
let pairPeer = null;       // peerId đang nói riêng 1:1
let pairOut = null;        // {pid, timer} invite mình gửi, chờ nhận
let pairIn = null;         // {pid, timer} invite tới đang chờ mình nhận
let pairMutedCalls = [];   // các call đã tắt sender khi đang nói riêng
// --- đi dạo FPV + vỗ vai mời + convo + nhạc cà phê ---
let fpv = false;
const SIT_RANGE = 1.45;
let sitNear = null;
const sitBtn = document.createElement('button');
sitBtn.id = 'sitPrompt';
sitBtn.type = 'button';
sitBtn.hidden = true;
sitBtn.textContent = 'Ngồi xuống';
sitBtn.addEventListener('click', (e) => { e.stopPropagation(); sitFromWalk(); });
document.body.appendChild(sitBtn);
const callBtn = document.createElement('button');
callBtn.id = 'callPrompt';
callBtn.type = 'button';
callBtn.hidden = true;
callBtn.textContent = 'Gọi agent';
callBtn.addEventListener('click', (e) => { e.stopPropagation(); callAgent(); });
document.body.appendChild(callBtn);
let fpvYaw = 0, fpvPitch = 0;
const fpvKeys = new Set();
const fpvPos = new THREE.Vector3(0, 0, 3);
let fpvSentAt = 0;
let walkPeer = null;          // Peer thứ 2: 'furuoff-w-{id}' — kênh mời/convo
const wconns = new Map();     // walkId -> DataConnection
const walkCalls = new Map();  // walkId -> MediaConnection
const walkStreams = new Map();// walkId -> MediaStream (remote)
const pendingWalk = new Set();// walkId được duyệt nhận call
const convoSet = new Set();   // walkId các member trong cuộc trò chuyện
let convoFar = 0;             // giây mọi member đều xa
let tapTarget = null;         // row đang trong tầm vỗ vai mời
let tapIn = null;             // {walkId, name, timer} invite đang chờ trả lời
let tapFrom = null;           // id người vừa vỗ vai mình từ xa (nút Đi tới)
const CAFE_ZONE = { x0: -13.6, x1: -4.6, z0: -8.2, z1: -1.2 }; // quầy + bàn cà phê + bar biển
const ytVid = new URLSearchParams(location.search).get('yt') || '9kzE8isXlQY';
let ytPlayer = null, ytReady = false, ytArmed = false;
const colliders = [];         // {x0,z0,x1,z1} — AABB nội thất/tường, resolve theo trục
let claimGen = 0;
let peerOpening = null;
let peerLibLoading = null;
const TURN_API_KEY = '';
const TURN_APP = '';
let iceList = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
let iceReady = null;
const PEER_SOURCES = [
  'vendor/peerjs/peerjs.min.js'
];

function rid(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < (len || 9); i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms || 3400);
}
function askNotify() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { Notification.requestPermission(); } catch (e) {}
}
function ensureTapButton(el, id) {
  if (!el) return;
  el.dataset.who = id;
  let btn = el.querySelector('.tap');
  if (id === myId) { if (btn) btn.remove(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tap';
    btn.textContent = 'Vỗ vai';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      askNotify();
      tapShoulder(el.dataset.who);
    });
    el.appendChild(btn);
  }
}
function patSound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!audioCtx) audioCtx = new AC();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    [0, 0.15].forEach((delay, i) => {
      const dur = 0.08;
      const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let s = 0; s < n; s++) data[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / n, 3);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const cloth = ctx.createBiquadFilter();
      cloth.type = 'lowpass';
      cloth.frequency.value = i ? 980 : 760;
      const g = ctx.createGain();
      g.gain.setValueAtTime(i ? 0.5 : 0.62, t0 + delay);
      src.connect(cloth); cloth.connect(g); g.connect(ctx.destination);
      src.start(t0 + delay);
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(i ? 150 : 118, t0 + delay);
      o.frequency.exponentialRampToValueAtTime(52, t0 + delay + 0.07);
      og.gain.setValueAtTime(0.0001, t0 + delay);
      og.gain.exponentialRampToValueAtTime(i ? 0.32 : 0.4, t0 + delay + 0.008);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.09);
      o.connect(og); og.connect(ctx.destination);
      o.start(t0 + delay);
      o.stop(t0 + delay + 0.1);
    });
  } catch (e) {}
}
const tapSent = new Map();
const seenTap = new Set();
function tapShoulder(id) {
  const row = people.get(id);
  if (!row || id === myId) return;
  const now = performance.now();
  if (now - (tapSent.get(id) || 0) < 2500) { toast('Vừa vỗ vai ' + row.name + '.'); return; }
  tapSent.set(id, now);
  row.bump = now;
  const name = myName();
  const tapId = 'tap-' + id + '-' + Date.now().toString(36);
  const msg = { kind: 'tap', id: tapId, to: id, from: myId, name };
  const desk = row.peerId && peers[row.peerId];
  let sent = false;
  if (desk && desk.conn && desk.conn.open) { sendTo(desk, msg); sent = true; }
  if (floorHost) { broadcastFloor(msg); sent = true; }
  else if (floorLink && floorLink.open) { try { floorLink.send(msg); sent = true; } catch (e) {} }
  const say = { kind: 'say', id: tapId, from: myId, name, text: '👋 Vỗ vai ' + row.name };
  onSay(say, floorHost, false);
  if (!floorHost && floorLink && floorLink.open) { try { floorLink.send(say); sent = true; } catch (e) {} }
  if (!sent) { toast('Đang nối phòng, thử lại sau giây lát.'); return; }
  patSound();
  toast('Đã vỗ vai ' + row.name + '.');
}
function deliverTap(msg) {
  if (!msg || msg.to !== myId || msg.from === myId) return;
  const key = String(msg.id || msg.from);
  if (seenTap.has(key)) return;
  seenTap.add(key);
  const name = String(msg.name || 'Đồng nghiệp').slice(0, 24);
  if (dnd) {
    const reply = { kind: 'tap-dnd', to: msg.from, from: myId, name: myName() };
    if (floorHost) broadcastFloor(reply);
    else if (floorLink && floorLink.open) { try { floorLink.send(reply); } catch (e) {} }
    const sender0 = people.get(msg.from);
    const desk0 = sender0 && sender0.peerId && peers[sender0.peerId];
    if (desk0 && desk0.conn && desk0.conn.open) sendTo(desk0, reply);
    return;
  }
  tapFrom = msg.from;
  const sender = people.get(msg.from);
  if (sender) sender.bump = performance.now();
  pushNotif('tap', name, { id: msg.from });
  const box = $('tapNotice');
  box.hidden = false;
  box.querySelector('span').textContent = name + ' đang gọi bạn.';
  clearTimeout(box._h);
  box._h = setTimeout(() => { box.hidden = true; }, 7000);
  toast(name + ' vỗ vai bạn.', 5000);
  patSound();
  const base = 'Văn Phòng furuCRM';
  document.title = 'Vỗ vai · ' + name;
  clearTimeout(deliverTap._t);
  deliverTap._t = setTimeout(() => { document.title = base; }, 8000);
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('Vỗ vai · ' + name, { body: name + ' đang gọi bạn trong văn phòng furuCRM.', tag: 'furu-tap' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {}
  }
}
function personUnderPointer() {
  const hits = raycaster.intersectObjects(G.people.children, true);
  for (const hit of hits) {
    let o = hit.object;
    while (o) {
      if (o.userData && o.userData.personId && o.userData.personId !== myId) return o.userData.personId;
      o = o.parent;
    }
  }
  return '';
}
function myName() {
  const v = $('nameInput').value.trim();
  return v ? v.slice(0, 24) : 'Bạn ' + myId.slice(0, 4);
}
function setConn(state, text) {
  const c = $('connStatus');
  c.classList.toggle('on', state === 'on');
  c.classList.toggle('err', state === 'err');
  $('connText').textContent = text;
}
function myCallId() { return myIsland ? 'furuoff-d' + myIsland + '-' + myId : ''; }
function islandOf(n) { return islands[n - 1] || null; }
function seatedQuiet() { return !!(islandOf(myIsland) && islandOf(myIsland).quiet); }
function seatOf(table, slot) {
  const island = islandOf(table);
  return island && slot > 0 ? island.seats[slot - 1] : null;
}
function faceAnchor(seat, target) {
  const s = Math.sin(seat.yaw), c = Math.cos(seat.yaw);
  target.set(seat.x + s * 0.2, 1.38 + (seat.y || 0), seat.z + c * 0.2);
}
function avatarTex(name) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#14323a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3fd0c0'; g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#062028'; g.font = '800 42px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((name || '?').trim().charAt(0).toUpperCase() || '?', 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function setProp(table, slot, visible) {
  const seat = seatOf(table, slot);
  if (seat && seat.prop) seat.prop.visible = visible;
}
function dropBody(g) {
  disposeAvatar(g);
}
function upsertSeat(info) {
  if (!info || !info.id || (!info.walk && (!info.table || !info.slot))) return;
  const seat = info.walk ? null : seatOf(info.table, info.slot);
  if (!seat && !info.walk) return;
  let row = people.get(info.id);
  if (!row) {
    const el = document.createElement('div');
    el.className = 'who';
    facesEl.appendChild(el);
    row = { el };
    people.set(info.id, row);
  }
  const prev = row.slot && (row.table !== info.table || row.slot !== (info.slot | 0)) ? { table: row.table, slot: row.slot } : null;
  row.id = info.id;
  row.name = String(info.name || 'Bạn').slice(0, 24);
  row.table = info.table | 0;
  row.slot = info.slot | 0;
  if (info.peerId) row.peerId = String(info.peerId);
  if (info.walkId) row.walkId = String(info.walkId);
  const mine = info.id === myId;
  row.el.classList.toggle('me', mine);
  ensureMicTag(row.el);
  row.el.querySelector('.nm').textContent = row.name + (mine ? ' · bạn' : '');
  if (prev) setProp(prev.table, prev.slot, true);
  const look = clampLook(info.look);
  const sig = lookSig(look);
  row.look = look;
  if (info.walk) {
    row.walk = 1; row.slot = 0; row.table = 0;
    row.wx = info.x || 0; row.wz = info.z || 0; row.wyaw = info.yaw || 0;
    row.px = row.wx; row.pz = row.wz;
    if (!row.body || row.bodyKind !== 'walk' || (sig && sig !== row.lookSig)) {
      if (row.body) dropBody(row.body);
      const av = buildWalker(look || undefined);
      row.body = av.root;
      row.bodyKind = 'walk'; row.lookSig = sig;
      row.avatar = av;
      G.people.add(row.body);
      row.body.position.set(row.wx, 0, row.wz);
      row.body.rotation.y = row.wyaw;
      row.body.userData.avatar = av;
    }
    row.body.userData.personId = info.id;
    row.body.visible = !mine;
    ensureTapButton(row.el, info.id);
    return;
  }
  setProp(row.table, row.slot, false);
  const sitY = seat.y || 0;
  if (!row.body || row.bodyKind !== 'seat' || (sig && sig !== row.lookSig)) {
    if (row.body) dropBody(row.body);
    row.body = seated(G.people, seat.x, seat.z, seat.yaw, sitY, look || undefined);
    row.bodyKind = 'seat';
    row.lookSig = sig;
  } else {
    row.body.position.set(seat.x, sitY, seat.z);
    row.body.rotation.y = seat.yaw;
  }
  row.walk = 0;
  row.body.userData.personId = info.id;
  ensureTapButton(row.el, info.id);
}
function removeSeat(id) {
  const row = people.get(id);
  if (!row) return;
  if (row.walkId) {
    const wc = walkCalls.get(row.walkId); try { if (wc) wc.close(); } catch (e) {}
    const wn = wconns.get(row.walkId); try { if (wn) wn.close(); } catch (e) {}
    wconns.delete(row.walkId);
    dropWalkPeer(row.walkId);
  }
  if (row.peerId && peers[row.peerId]) removePeer(row.peerId, false);
  setProp(row.table, row.slot, true);
  if (row.body) dropBody(row.body);
  row.el.remove();
  const bubble = bubbles.get(id);
  if (bubble) { bubble.el.remove(); bubbles.delete(id); }
  people.delete(id);
}
function rosterList() {
  return [...people.values()].map((r) => r.walk
    ? { id: r.id, name: r.name, walk: 1, x: r.wx, z: r.wz, yaw: r.wyaw, walkId: r.walkId || '', peerId: r.peerId || '', look: r.look }
    : { id: r.id, name: r.name, table: r.table, slot: r.slot, peerId: r.peerId || '', walkId: r.walkId || '', look: r.look });
}
function announceSeat() {
  if (myIsland === 0) {
    myPresence = null;
    removeSeat(myId);
    sendPresence({ kind: 'gone', id: myId });
    return;
  }
  const who = { id: myId, name: myName(), table: myIsland, slot: mySlot, peerId: myCallId(), walkId: myWalkId(), look: myLook };
  myPresence = who;
  upsertSeat(who);
  sendPresence({ kind: 'here', who });
}
function myWalkId() { return 'furuoff-w-' + myId; }
function announceWalk() {
  // camera nhìn trục -Z nên yaw model = fpvYaw + π — gửi luôn yaw model để
  // remote vẽ body.rotation.y đúng chiều mặt (và "đi tới" dùng đúng hướng lưng)
  const who = { id: myId, name: myName(), walk: 1, x: fpvPos.x, z: fpvPos.z, yaw: fpvYaw + Math.PI, walkId: myWalkId(), look: myLook };
  myPresence = who;
  upsertSeat(who);
  sendPresence({ kind: 'here', who });
}
function applyPos(m) {
  const row = people.get(m.id);
  if (!row || !row.walk) return;
  row.wx = m.x; row.wz = m.z; row.wyaw = m.yaw;
}
export function placeOffice() {
  const w = innerWidth, h = innerHeight;
  const showTags = myIsland === 0 && !inSecurity;
  deskTagsEl.hidden = !showTags;
  if (showTags) {
    if (securityTag) {
      _pt.copy(securityTag.v).project(camera);
      securityTag.el.hidden = _pt.z > 1;
      securityTag.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      securityTag.el.style.top = ((1 - _pt.y) / 2 * h) + 'px';
    }
    if (fishTag) {
      _pt.copy(fishTag.v).project(camera);
      fishTag.el.hidden = watchingFish || _pt.z > 1;
      fishTag.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      fishTag.el.style.top = ((1 - _pt.y) / 2 * h) + 'px';
    }
    islands.forEach((island, i) => {
      _pt.copy(island.center).project(camera);
      island.tag.hidden = _pt.z > 1;
      island.tag.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      island.tag.style.top = ((1 - _pt.y) / 2 * h) + 'px';
      island.tag.classList.toggle('hot', hoveredIsland === i);
    });
  }
  people.forEach((row) => {
    if (row.walk) {
      if (row.body) {
        const k = 0.18;
        const px = row.body.position.x + (row.wx - row.body.position.x) * k;
        const pz = row.body.position.z + (row.wz - row.body.position.z) * k;
        const moving = Math.hypot(row.wx - row.body.position.x, row.wz - row.body.position.z) > 0.01;
        row.body.position.set(px, 0, pz);
        let dy = row.wyaw - row.body.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        row.body.rotation.y += dy * 0.2;
        if (row.avatar) row.avatar.walkAmt = moving && !REDUCED ? 0.9 : 0;
      }
      _pt.set(row.wx, 1.95, row.wz).project(camera);
      row.el.hidden = _pt.z > 1;
      row.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      row.el.style.top = ((1 - _pt.y) / 2 * h) + 'px';
      if (row.body && row.bump) {
        const age = performance.now() - row.bump;
        row.body.rotation.z = age > 700 ? 0 : Math.sin(age / 55) * 0.22;
        if (age > 700) row.bump = 0;
      }
      return;
    }
    const seat = seatOf(row.table, row.slot);
    if (!seat) { row.el.hidden = true; return; }
    _pt.set(seat.x, 1.75 + (seat.y || 0), seat.z).project(camera);
    const disc = myIsland === row.table && row.id !== myId;
    row.el.hidden = _pt.z > 1 || disc;
    row.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
    row.el.style.top = ((1 - _pt.y) / 2 * h) + 'px';
    if (row.body && row.bump) {
      const age = performance.now() - row.bump;
      row.body.rotation.z = age > 700 ? 0 : Math.sin(age / 55) * 0.22;
      if (age > 700) row.bump = 0;
    }
  });
  if (tapTarget) {
    const p = posOf(tapTarget);
    if (p) {
      _pt.set(p.x, p.walk ? 2.05 : 1.95, p.z).project(camera);
      tapTagEl.hidden = _pt.z > 1;
      tapTagEl.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      tapTagEl.style.top = ((1 - _pt.y) / 2 * h) + 'px';
    } else tapTagEl.hidden = true;
  } else tapTagEl.hidden = true;
  if (fpv) {
    let best = null, bd = SIT_RANGE;
    islands.forEach((island, i) => {
      const used = takenSlots(i);
      island.seats.forEach((seat, s) => {
        if (used.has(s + 1)) return;
        const d = Math.hypot(fpvPos.x - seat.x, fpvPos.z - seat.z);
        if (d < bd) { bd = d; best = { island: i, slot: s, seat }; }
      });
    });
    sitNear = best;
    if (!best) sitBtn.hidden = true;
    else {
      _pt.set(best.seat.x, 1.2 + (best.seat.y || 0), best.seat.z).project(camera);
      sitBtn.hidden = false;
      if (_pt.z > 1) {
        sitBtn.style.left = '50%';
        sitBtn.style.top = (h - 88) + 'px';
        sitBtn.style.transform = 'translate(-50%, 0)';
      } else {
        sitBtn.style.left = ((_pt.x + 1) / 2 * w) + 'px';
        sitBtn.style.top = ((1 - _pt.y) / 2 * h) + 'px';
        sitBtn.style.transform = 'translate(-50%, -130%)';
      }
    }
  } else if (sitNear || !sitBtn.hidden) {
    sitNear = null;
    sitBtn.hidden = true;
  }
  if (myIsland > 0) {
    const island = islandOf(myIsland);
    if (!island) return;
    island.screens.forEach((screen, idx) => {
      const tag = screen.userData.tag;
      if (!screen.visible) { tag.hidden = true; return; }
      const seat = island.seats[idx];
      faceAnchor(seat, _pt);
      screen.position.copy(_pt);
      screen.lookAt(camera.position);
      _pt.y += 0.22;
      _pt.project(camera);
      tag.hidden = _pt.z > 1;
      tag.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      tag.style.top = ((1 - _pt.y) / 2 * h) + 'px';
    });
  }
  placeBubbles(w, h);
}
function placeBubbles(w, h) {
  const hide = camera !== persp || watchingFish || inSecurity;
  bubblesEl.hidden = hide;
  if (hide) return;
  const now = performance.now();
  bubbles.forEach((b, id) => {
    if (now > b.until) { b.el.remove(); bubbles.delete(id); return; }
    const row = people.get(id);
    if (row && row.walk) {
      _pt.set(row.wx, 2.1, row.wz).project(camera);
      b.el.hidden = _pt.z > 1;
      const head = (1 - _pt.y) / 2 * h;
      const top = head > 72 ? head - 4 : Math.min(h - 16, head + 78);
      b.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
      b.el.style.top = top + 'px';
      return;
    }
    const seat = row && seatOf(row.table, row.slot);
    if (!seat) { b.el.hidden = true; return; }
    _pt.set(seat.x, 1.9 + (seat.y || 0), seat.z).project(camera);
    b.el.hidden = _pt.z > 1;
    const head = (1 - _pt.y) / 2 * h;
    const top = head > 72 ? head - 4 : Math.min(h - 16, head + 78);
    b.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
    b.el.style.top = top + 'px';
  });
}
function sitCamera(seat) {
  setCamera(persp);
  labelsEl.hidden = true;
  const island = islandOf(myIsland);
  let eye, look;
  if (island && island.share) {
    const tv = new THREE.Vector3(10.5, 1.35, 7.6);
    const back = new THREE.Vector3(seat.x - 10.5, 0, seat.z - 7.6);
    if (back.lengthSq() < 0.04) back.set(0, 0, 1);
    back.normalize();
    eye = new THREE.Vector3(seat.x, 1.62, seat.z).addScaledVector(back, 1.45);
    look = tv;
  } else {
    const s = Math.sin(seat.yaw), c = Math.cos(seat.yaw);
    const back = island && island.quiet ? 1.25 : 1.75;
    if (seat.front) {
      eye = new THREE.Vector3(seat.x + s * 2.2, 1.4 + (seat.y || 0), seat.z + c * 2.2);
      look = new THREE.Vector3(seat.x, 0.85 + (seat.y || 0), seat.z);
    } else {
      eye = new THREE.Vector3(seat.x - s * back, 1.55 + (seat.y || 0), seat.z - c * back);
      look = new THREE.Vector3(seat.x + s * 0.4, 1.02 + (seat.y || 0), seat.z + c * 0.4);
    }
  }
  controls.enabled = false;
  const tighten = () => {
    controls.enabled = true;
    controls.minDistance = 0.8;
    controls.maxDistance = 3.4;
    controls.maxPolarAngle = Math.PI * 0.62;
  };
  if (REDUCED) {
    persp.position.copy(eye); controls.target.copy(look); setTween(null); tighten(); return;
  }
  setTween({ p0: persp.position.clone(), t0: controls.target.clone(), p1: eye, t1: look, s: 0, sit: true });
}
function releaseCamera() {
  controls.minDistance = 1;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.495;
  go('v3d');
}
function takenSlots(index) {
  const used = new Set();
  people.forEach((row) => {
    if (row.table === index + 1 && row.id !== myId && row.slot) used.add(row.slot);
  });
  return used;
}
function inviteSlug(island) {
  if (!island) return '';
  const zone = /^Zone (\d+)$/.exec(island.label);
  if (zone) return 'zone-' + zone[1];
  if (island.share) return 'hop';
  return '';
}
function inviteAbs(slug) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('vao', slug);
  return url.toString();
}
function setInviteParam(slug) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  if (slug) url.searchParams.set('vao', slug);
  history.replaceState(null, '', url);
}
async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch (e) {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-999px';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); toast(okMsg); }
    catch (err) { toast(text, 6000); }
    input.remove();
  }
}
function copyInvite(slug, label) {
  copyText(inviteAbs(slug), 'Đã chép link mời ' + label + '. Gửi link để người khác vào cùng chỗ.');
}
let inviteTaken = false;
function takeInvite() {
  if (inviteTaken || !$('maker').hidden || myIsland !== 0) return;
  const slug = new URL(location.href).searchParams.get('vao');
  if (!slug) return;
  const index = islands.findIndex((island) => inviteSlug(island) === slug);
  if (index < 0) return;
  inviteTaken = true;
  joinDesk(index, -1);
}
islands.forEach((island) => {
  const slug = inviteSlug(island);
  if (!slug || !island.tag) return;
  const link = document.createElement('a');
  link.className = 'invite';
  link.href = inviteAbs(slug);
  link.textContent = 'Mời';
  link.title = 'Link mời vào ' + island.label;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyInvite(slug, island.label);
  });
  island.tag.appendChild(link);
});
function joinDesk(index, prefer) {
  if (myIsland !== 0) return;
  if (index < 0 || index >= islands.length) return;
  const used = takenSlots(index);
  let slot = 0;
  if (prefer >= 0) {
    if (used.has(prefer + 1)) {
      const who = [...people.values()].find((r) => r.table === index + 1 && r.slot === prefer + 1 && r.id !== myId);
      if (who) { tapShoulder(who.id); return; }
      toast('Chỗ này đã có người. Chọn chỗ trống khác, hoặc bấm tên đảo.');
      return;
    }
    slot = prefer + 1;
  } else {
    for (let s = 1; s <= islands[index].seats.length; s++) if (!used.has(s)) { slot = s; break; }
    if (!slot) { toast('Đảo này đã kín chỗ.'); return; }
  }
  enterDesk(index, slot);
}
function enterDesk(index, slot) {
  endFishWatch();
  setFollow(-1);
  setMyIsland(index + 1);
  mySlot = slot;
  dbgEv('sit đảo' + (index + 1) + ' chỗ' + slot);
  try { localStorage.setItem('furu-office-seat', JSON.stringify({ i: myIsland, s: mySlot, t: Date.now() })); } catch (e) {}
  const island = islands[index];
  const quiet = !!island.quiet;
  document.body.classList.toggle('in-room', !quiet);
  applyChrome();
  $('dockView').hidden = true;
  $('dockRoom').hidden = false;
  $('btnTalk').hidden = quiet;
  $('btnHear').hidden = true;
  $('btnMic').hidden = quiet;
  $('btnCam').hidden = quiet;
  $('btnChat').hidden = false;
  $('btnLeave').textContent = quiet ? 'Rời chỗ' : 'Rời bàn';
  $('btnCoffee').hidden = !quiet;
  $('btnCoffee').disabled = false;
  $('btnCoffee').textContent = 'Gọi cà phê';
  const slug = inviteSlug(island);
  $('btnInvite').hidden = !slug;
  if (slug) setInviteParam(slug);
  $('hint').textContent = quiet
    ? 'Đang ngồi ' + island.label + ' · chỗ ' + slot + '/' + island.seats.length + ' · bấm Gọi cà phê'
    : slug
      ? 'Đang ở ' + island.label + ' · chỗ ' + slot + '/' + island.seats.length + ' · bấm Mời để gửi link'
      : 'Đang ngồi ' + island.label + ' (' + island.zone + ') · chỗ ' + slot + '/' + island.seats.length;
  $('btnShare').hidden = quiet || !island.share;
  $('btnTv').hidden = true;
  if (!quiet) {
    sysMsg(island.share
      ? 'Bạn đã vào phòng họp, chỗ ' + slot + '. Bấm Bật tiếng để nói, hoặc Chia sẻ màn hình để chiếu lên TV.'
      : 'Bạn đã ngồi ' + island.label + ', chỗ ' + slot + '. Bấm Bật tiếng để nói với cả đảo.');
  }
  toast(quiet ? 'Đã ngồi chơi. Bấm Gọi cà phê nếu muốn. Mic và camera tắt.' : island.share ? 'Đã vào phòng họp.' : 'Đã ngồi. Bấm Bật tiếng khi muốn nói.', 3200);
  updateSelf();
  syncControlButtons();
  syncPairUI();
  refreshScreens();
  ring.visible = false;
  announceSeat();
  sitCamera(island.seats[slot - 1]);
  askNotify();
  if (quiet) setConn('on', 'Chỗ ngồi chơi, không bật mic hay camera');
  else openTablePeer();
}
function leaveDesk(silent) {
  if (myIsland === 0) return;
  dbgEv('leave đảo' + myIsland);
  stopShare();
  if (pairPeer) exitPair();
  if (pairOut) { clearTimeout(pairOut.timer); pairOut = null; }
  if (pairIn) { clearTimeout(pairIn.timer); pairIn = null; hidePairAsk(); }
  leaveConvo(true);
  broadcastOn = false;
  if (dnd) { dnd = false; syncControlButtons(); }
  claimGen++;
  peerOpening = null;
  broadcast({ kind: 'bye' });
  Object.keys(peers).forEach((id) => {
    try { if (peers[id].conn) peers[id].conn.close(); } catch (e) {}
    try { if (peers[id].call) peers[id].call.close(); } catch (e) {}
  });
  peers = {};
  clearInterval(dialTimer);
  if (myPeer) { try { myPeer.destroy(); } catch (e) {} myPeer = null; }
  mySlot = 0;
  if (localStream) { localStream.getTracks().forEach((tr) => tr.stop()); localStream = null; }
  remoteAudio.forEach((a) => { try { a.pause(); a.srcObject = null; a.remove(); } catch (e) {} });
  remoteAudio.clear();
  releaseMeter(localMeter);
  localMeter = null;
  remoteMeters.forEach(releaseMeter);
  remoteMeters.clear();
  micOn = false;
  camOn = false;
  setMyIsland(0);
  try { localStorage.removeItem('furu-office-seat'); } catch (e) {}
  document.body.classList.remove('in-room');
  applyChrome();
  $('dockView').hidden = false;
  $('dockRoom').hidden = true;
  $('btnShare').hidden = true;
  $('btnTv').hidden = true;
  $('btnMic').hidden = false;
  $('btnCam').hidden = false;
  $('btnChat').hidden = false;
  $('btnLeave').textContent = 'Rời bàn';
  closeTvFull();
  $('btnTalk').hidden = false;
  $('btnHear').hidden = true;
  $('btnCoffee').hidden = true;
  $('btnCoffee').disabled = false;
  $('btnCoffee').textContent = 'Gọi cà phê';
  $('btnInvite').hidden = true;
  setInviteParam('');
  cancelMyCoffee();
  setConn('on', 'Ngồi cùng đảo là nói chuyện được với đồng nghiệp');
  refreshScreens();
  ring.visible = false;
  announceSeat();
  clearChatNote();
  releaseCamera();
  if (!silent) toast('Bạn đã rời bàn.');
}

let iceAt = 0;
function iceServers() {
  // TURN creds có hạn — tab mở lâu >12h mà dùng lại creds cũ thì call mới fail ICE
  if (iceReady && Date.now() - iceAt < 12 * 3600e3) return iceReady;
  iceAt = Date.now();
  iceReady = (async () => {
    const extra = [];
    if (TURN_API_KEY && TURN_APP) {
      try {
        const url = 'https://' + TURN_APP + '.metered.live/api/v1/turn/credentials?apiKey=' + encodeURIComponent(TURN_API_KEY);
        const list = await (await fetch(url)).json();
        if (Array.isArray(list)) extra.push.apply(extra, list);
      } catch (e) {}
    }
    try {
      const username = String(Math.floor(Date.now() / 1000) + 86400) + ':furuoffice';
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('openrelayprojectsecret'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username));
      const credential = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
      const turn = (urls) => ({ urls, username, credential });
      extra.push(
        turn('turn:staticauth.openrelay.metered.ca:80'),
        turn('turn:staticauth.openrelay.metered.ca:80?transport=tcp'),
        turn('turn:staticauth.openrelay.metered.ca:443'),
        turn('turns:staticauth.openrelay.metered.ca:443?transport=tcp')
      );
    } catch (e) {}
    iceList = iceList.concat(extra);
    return iceList;
  })();
  return iceReady;
}
function refreshScreens() {
  islands.forEach((island) => island.screens.forEach((s) => { s.visible = false; s.userData.tag.hidden = true; }));
  if (myIsland === 0) return;
  const island = islandOf(myIsland);
  if (!island) return;
  people.forEach((row) => {
    if (row.table !== myIsland || row.id === myId || !row.slot) return;
    const peer = row.peerId ? peers[row.peerId] : null;
    const screen = island.screens[row.slot - 1];
    if (!screen) return;
    screen.visible = true;
    const name = (peer && peer.name) || row.name || 'Bạn';
    const micOff = peer ? peer.micOn === false : false;
    const isDnd = peer ? !!peer.dnd : false;
    ensureMicTag(screen.userData.tag);
    screen.userData.tag.querySelector('.nm').textContent = name + (isDnd ? ' · DND' : micOff ? ' · mic tắt' : '');
    ensureTapButton(screen.userData.tag, row.id);
    const face = screen.userData.face;
    const stream = peer && peer.remoteStream;
    const hearOk = !row.peerId || hearingGain(row.peerId) > 0.001;
    const hasVideo = hearOk && stream && peer.camOn !== false && stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (stream) playRemoteAudio(stream);
    if (hasVideo) {
      const vid = screen.userData.video;
      if (vid.srcObject !== stream) {
        vid.srcObject = stream;
        vid.muted = true;
        vid.playsInline = true;
        vid.play().catch(() => {});
      }
      if (face.material.map !== screen.userData.videoTex) {
        face.material.map = screen.userData.videoTex;
        face.material.needsUpdate = true;
      }
    } else {
      if (screen.userData.avatarName !== name) {
        if (screen.userData.avatarTex) screen.userData.avatarTex.dispose();
        screen.userData.avatarTex = avatarTex(name);
        screen.userData.avatarName = name;
      }
      face.material.map = screen.userData.avatarTex;
      face.material.needsUpdate = true;
    }
  });
  applyGains();
  syncHearRing();
}
function rowAtSeat(table, slot) {
  for (const row of people.values()) if (row.table === table && row.slot === slot) return row;
  return null;
}
function hearingGain(pid) {
  if (dnd) return 0;
  if (pairPeer) return pid === pairPeer ? 1 : (inMeeting() ? PAIR_DUCK : 0);
  if (convoSet.size) {
    const row0 = seatByPeer(pid);
    if (row0 && row0.walkId && convoSet.has(row0.walkId)) return 0;   // member → nghe qua kênh convo
    return PAIR_DUCK;                                                // đảo duck 15% khi đang convo
  }
  if (inMeeting()) return 1;
  const entry = peers[pid];
  if (entry && entry.bc) return 1;
  const row = seatByPeer(pid);
  const island = islandOf(myIsland);
  if (!row || !island || row.table !== myIsland || !row.slot) return 1;
  const seat = island.seats[row.slot - 1], mine = island.seats[mySlot - 1];
  if (!seat || !mine) return 1;
  const d = Math.hypot(seat.x - mine.x, seat.z - mine.z);
  if (d <= HEAR_FULL) return 1;
  if (d >= HEAR_RANGE) return 0;
  return 1 - (d - HEAR_FULL) / (HEAR_RANGE - HEAR_FULL);
}
function applyGains() {
  applyWalkGains();
  Object.keys(peers).forEach((pid) => {
    const entry = peers[pid];
    if (!entry || !entry.remoteStream) return;
    const audio = remoteAudio.get(entry.remoteStream.id);
    if (audio) audio.volume = hearingGain(pid);
  });
}
function syncHearRing() {
  const island = islandOf(myIsland);
  const show = !!(island && !island.quiet && !island.share && !pairPeer);
  hearRing.visible = show;
  if (show && mySlot) {
    const seat = island.seats[mySlot - 1];
    if (seat) hearRing.position.set(seat.x, 0.035, seat.z);
  }
}
function updateSelf() {
  const wrap = $('selfWrap');
  const vid = $('selfVideo');
  $('selfPh').textContent = (myName().trim().charAt(0) || '?').toUpperCase();
  wrap.classList.toggle('cam-off', !localStream || !camOn);
  if (localStream && vid.srcObject !== localStream) {
    vid.srcObject = localStream;
    vid.muted = true;
    vid.playsInline = true;
    vid.play().catch(() => {});
  }
}
const remoteAudio = new Map();
const silentAudio = document.createElement('audio');
silentAudio.setAttribute('playsinline', '');
silentAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
document.body.appendChild(silentAudio);
function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  const kicked = silentAudio.play();
  if (kicked && kicked.then) kicked.then(() => silentAudio.pause()).catch(() => {});
  remoteAudio.forEach((audio) => {
    const goPlay = audio.play();
    if (goPlay && goPlay.then) goPlay.then(() => { $('btnHear').hidden = true; }).catch(() => { $('btnHear').hidden = false; });
  });
}
function ensureMicTag(el) {
  if (!el || el.querySelector('.nm')) return;
  el.textContent = '';
  el.insertAdjacentHTML('afterbegin', MIC_HTML);
  const nm = document.createElement('span');
  nm.className = 'nm';
  el.appendChild(nm);
}
function releaseMeter(meter) {
  if (!meter) return;
  try { meter.src.disconnect(); } catch (e) {}
}
function makeMeter(stream) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !stream || !stream.getAudioTracks().length) return null;
  try {
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser);
    return { stream, src, analyser, data: new Uint8Array(analyser.fftSize) };
  } catch (e) { return null; }
}
function rmsOf(meter) {
  meter.analyser.getByteTimeDomainData(meter.data);
  let sum = 0;
  const d = meter.data;
  for (let i = 0; i < d.length; i++) {
    const v = (d[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / d.length);
}
function voiceLevel(rms) {
  const n = (rms - 0.012) / 0.05;
  return n <= 0 ? 0 : n >= 1 ? 1 : n;
}
function setTalking(el, level, live) {
  if (!el) return;
  const mic = el.querySelector('.mic');
  if (!mic) return;
  mic.hidden = !live;
  if (!live) { el.classList.remove('speaking'); el._spoke = 0; return; }
  if (level > 0.08) el._spoke = performance.now();
  const speaking = !!(el._spoke && performance.now() - el._spoke < 340);
  el.classList.toggle('speaking', speaking);
  const lift = speaking ? level : 0;
  const shape = [0.55, 1, 0.68];
  const bars = mic.querySelectorAll('i');
  bars.forEach((bar, i) => {
    const wobble = speaking && !REDUCED ? 0.12 * Math.sin(T.value * (8 + i * 2) + i) : 0;
    bar.style.transform = 'scaleY(' + Math.max(0.22, Math.min(1, 0.25 + shape[i] * lift + wobble * lift)).toFixed(3) + ')';
  });
  const svg = mic.querySelector('svg');
  if (svg) svg.style.transform = 'scale(' + (1 + lift * 0.16).toFixed(3) + ')';
}
export function updateVoiceMeters() {
  const localLive = !!(micOn && localStream && localStream.getAudioTracks().some((t) => t.enabled && t.readyState === 'live'));
  let localLevel = 0;
  if (localLive) {
    if (!localMeter || localMeter.stream !== localStream) {
      releaseMeter(localMeter);
      localMeter = makeMeter(localStream);
    }
    if (localMeter) localLevel = voiceLevel(rmsOf(localMeter));
  } else if (localMeter) {
    releaseMeter(localMeter);
    localMeter = null;
  }
  setTalking($('btnMic'), localLevel, localLive);
  setTalking($('selfWrap'), localLevel, localLive);
  const me = people.get(myId);
  if (me) setTalking(me.el, localLevel, localLive);
  const heard = new Set();
  people.forEach((row) => {
    if (row.id === myId) return;
    const peer = row.peerId ? peers[row.peerId] : null;
    const stream = peer && peer.remoteStream;
    const live = !!(peer && peer.micOn !== false && stream && stream.getAudioTracks().some((t) => t.readyState === 'live'));
    let level = 0;
    if (live) {
      heard.add(stream.id);
      let meter = remoteMeters.get(stream.id);
      if (!meter) {
        meter = makeMeter(stream);
        if (meter) remoteMeters.set(stream.id, meter);
      }
      if (meter) level = voiceLevel(rmsOf(meter));
    }
    setTalking(row.el, level, live);
    const island = islandOf(row.table);
    const screen = island && island.screens[row.slot - 1];
    if (!screen) return;
    const show = live && row.table === myIsland;
    setTalking(screen.userData.tag, level, show);
    if (screen.userData.frame) screen.userData.frame.material.color.setHex(show && screen.userData.tag.classList.contains('speaking') ? 0x3fd0c0 : 0x102028);
  });
  remoteMeters.forEach((meter, id) => {
    if (!heard.has(id)) { releaseMeter(meter); remoteMeters.delete(id); }
  });
}
function playRemoteAudio(stream) {
  if (!stream || !stream.getAudioTracks().length) return false;
  let audio = remoteAudio.get(stream.id);
  if (!audio) {
    audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    remoteAudio.set(stream.id, audio);
  }
  if (audio.srcObject !== stream) audio.srcObject = stream;
  const goPlay = audio.play();
  if (goPlay && goPlay.then) goPlay.then(() => { $('btnHear').hidden = true; }).catch(() => { $('btnHear').hidden = false; });
  return true;
}
function startVoice() {
  unlockAudio();
  if (myIsland === 0 || seatedQuiet()) return;
  if (localStream && localStream.getAudioTracks().some((t) => t.readyState === 'live')) {
    micOn = true;
    localStream.getAudioTracks().forEach((t) => { t.enabled = true; });
    $('btnTalk').hidden = true;
    syncControlButtons();
    updateSelf();
    Promise.resolve(myPeer ? null : openTablePeer()).then(() => {
      if (!myPeer) $('btnTalk').hidden = false;
      pushStream();
    });
    return;
  }
  if (!window.isSecureContext) { toast('Điện thoại chỉ bật được mic trên trang https.', 4600); return; }
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) { toast('Trình duyệt này không mở được mic.', 4200); return; }
  if (!myPeer) openTablePeer();
  toast('Đang xin mic…', 1600);
  md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    .catch(() => md.getUserMedia({ audio: true, video: false }))
    .then((stream) => {
      if (myIsland === 0) { stream.getTracks().forEach((t) => t.stop()); return; }
      micOn = true;
      if (!localStream) localStream = stream;
      else {
        stream.getAudioTracks().forEach((t) => {
          if (!localStream.getAudioTracks().some((a) => a.readyState === 'live')) localStream.addTrack(t);
          else t.stop();
        });
      }
      $('btnTalk').hidden = true;
      syncControlButtons();
      updateSelf();
      Promise.resolve(myPeer ? null : openTablePeer()).then(() => pushStream());
      toast('Đã bật tiếng.');
    })
    .catch(() => toast('Chưa được phép dùng mic. Cho phép micro rồi bấm Bật tiếng lại.', 4800));
}
function pushStream() {
  if (!myPeer || !localStream || myIsland === 0) return;
  people.forEach((row) => {
    if (row.table !== myIsland || row.id === myId || !row.peerId) return;
    const entry = peers[row.peerId];
    if (entry && entry.call) { try { entry.call.close(); } catch (e) {} entry.call = null; }
    dial(row.peerId);
  });
}
// Tab bị OS ngủ/discard rồi tỉnh lại có thể khiến audio track 'ended' ngầm —
// sender vẫn gửi track chết nên bên kia nghe im lặng (lỗi nghe 1 chiều).
// Watchdog: track mic chết hết thì lấy lại stream và đẩy vào call mới.
let micReacquiring = false;
function reacquireMic() {
  if (micReacquiring) return;
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  micReacquiring = true;
  dbgEv('mic reacquire');
  md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    .catch(() => md.getUserMedia({ audio: true, video: false }))
    .then((stream) => {
      if (!micOn) { stream.getTracks().forEach((t) => t.stop()); return; }
      const old = localStream;
      localStream = stream;
      if (old) old.getTracks().forEach((t) => {
        try { if (t.readyState === 'live' && t.kind === 'video') localStream.addTrack(t); else t.stop(); } catch (e) {}
      });
      pushStream();
      walkCalls.forEach((call, wid) => { try { call.close(); } catch (e) {} walkCalls.delete(wid); });
      convoSet.forEach((wid) => setTimeout(() => dialWalk(wid), 300));
      updateSelf();
      sendState();
      toast('Mic vừa tự nối lại.');
      dbgEv('mic reacquired');
    })
    .catch(() => {})
    .finally(() => { micReacquiring = false; });
}
setInterval(() => {
  if (micOn && localStream && !localStream.getAudioTracks().some((t) => t.readyState === 'live')) reacquireMic();
}, 4000);
async function ensureVideo() {
  if (localStream && localStream.getVideoTracks().some((t) => t.readyState === 'live')) {
    localStream.getVideoTracks().forEach((t) => { t.enabled = true; });
    return true;
  }
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return false;
  const stream = await md.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  const track = stream.getVideoTracks()[0];
  if (!track) return false;
  if (!localStream) localStream = stream;
  else localStream.addTrack(track);
  let replaced = false;
  Object.keys(peers).forEach((id) => {
    const pc = peers[id].call && peers[id].call.peerConnection;
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) { sender.replaceTrack(track); replaced = true; }
  });
  if (!replaced) Promise.resolve(myPeer ? null : openTablePeer()).then(() => pushStream());
  return true;
}
function inMeeting() {
  const island = islandOf(myIsland);
  return !!(island && island.share);
}
function showMeetingScreen(stream, name) {
  if (!meetingTvMat || !stream) return;
  if (screenVideo) { try { screenVideo.pause(); screenVideo.srcObject = null; } catch (e) {} }
  if (screenTex) screenTex.dispose();
  const video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  video.srcObject = stream;
  video.play().catch(() => {});
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  meetingTvMat.map = tex;
  meetingTvMat.needsUpdate = true;
  screenVideo = video;
  screenTex = tex;
  if (inMeeting()) {
    $('btnTv').hidden = false;
    $('hint').textContent = 'Bấm TV hoặc Xem full để phóng màn hình chia sẻ';
  }
  if (name && name !== myName()) toast(name + ' đang chia sẻ màn hình.', 2800);
}
function openTvFull() {
  const stream = screenVideo && screenVideo.srcObject;
  if (!stream) { toast('Chưa có màn hình để phóng to.'); return; }
  const el = $('tvFull');
  const vid = $('tvFullVideo');
  if (vid.srcObject !== stream) vid.srcObject = stream;
  vid.muted = true;
  vid.playsInline = true;
  vid.play().catch(() => {});
  el.hidden = false;
  const ask = el.requestFullscreen ? el.requestFullscreen() : null;
  if (ask && ask.catch) ask.catch(() => {});
}
function closeTvFull() {
  const el = $('tvFull');
  if (!el) return;
  if (document.fullscreenElement === el) {
    const done = document.exitFullscreen();
    if (done && done.catch) done.catch(() => {});
  }
  el.hidden = true;
}
function clearMeetingScreen() {
  if (screenVideo) { try { screenVideo.pause(); screenVideo.srcObject = null; } catch (e) {} screenVideo = null; }
  if (screenTex) { screenTex.dispose(); screenTex = null; }
  screenCall = null;
  if (meetingTvMat) { meetingTvMat.map = burndownTex; meetingTvMat.needsUpdate = true; }
  closeTvFull();
  const fullVid = $('tvFullVideo');
  if (fullVid) fullVid.srcObject = null;
  if ($('btnTv')) $('btnTv').hidden = true;
  if (inMeeting()) {
    const island = islandOf(myIsland);
    $('hint').textContent = 'Đang ở phòng họp · chỗ ' + mySlot + '/' + island.seats.length + ' · có thể chia sẻ màn hình';
  }
}
function offerScreen(pid) {
  if (!myPeer || !screenStream || !pid || pid === myPeer.id) return;
  const prev = screenCalls.get(pid);
  if (prev) { try { prev.close(); } catch (e) {} }
  try {
    const call = myPeer.call(pid, screenStream, { metadata: { kind: 'screen', name: myName() } });
    if (call) screenCalls.set(pid, call);
  } catch (e) {}
}
function offerScreenToRoom() {
  people.forEach((row) => {
    if (row.table !== myIsland || row.id === myId || !row.peerId) return;
    offerScreen(String(row.peerId));
  });
}
function stopShare() {
  const was = sharing || !!screenStream;
  const stream = screenStream;
  sharing = false;
  screenStream = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  screenCalls.forEach((call) => { try { call.close(); } catch (e) {} });
  screenCalls.clear();
  clearMeetingScreen();
  if ($('btnShare')) syncControlButtons();
  if (was && myIsland > 0) broadcast({ kind: 'screen', on: false });
}
function startShare() {
  if (!inMeeting()) return;
  const md = navigator.mediaDevices;
  if (!window.isSecureContext || !md || !md.getDisplayMedia) {
    toast('Trình duyệt này không chia sẻ được màn hình.', 4200);
    return;
  }
  md.getDisplayMedia({ video: true, audio: false }).then((stream) => {
    if (!inMeeting()) { stream.getTracks().forEach((t) => t.stop()); return; }
    if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
    screenStream = stream;
    sharing = true;
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => { if (screenStream === stream) stopShare(); });
    showMeetingScreen(stream, myName());
    syncControlButtons();
    toast('Đang chiếu màn hình lên TV.');
    sysMsg('Bạn đang chia sẻ màn hình.');
    broadcast({ kind: 'screen', on: true, name: myName() });
    offerScreenToRoom();
  }).catch(() => toast('Chưa chia sẻ màn hình.', 2800));
}
function syncControlButtons() {
  $('btnMic').classList.toggle('off', !micOn);
  $('btnMic').querySelector('.mic-label').textContent = micOn ? 'Mic đang bật' : 'Mic đang tắt';
  $('btnCam').classList.toggle('off', !camOn);
  $('btnCam').textContent = camOn ? 'Camera đang bật' : 'Camera đang tắt';
  $('btnShare').classList.toggle('off', sharing);
  $('btnShare').textContent = sharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình';
  [$('btnMic'), $('btnCam'), $('btnTalk'), $('btnShare')].forEach(b => b.classList.toggle('locked', dnd));
}
(function prepMicButton() {
  const btn = $('btnMic');
  const label = document.createElement('span');
  label.className = 'mic-label';
  label.textContent = btn.textContent.trim();
  btn.textContent = '';
  btn.insertAdjacentHTML('afterbegin', MIC_HTML);
  btn.appendChild(label);
  const badge = $('selfWrap').querySelector('span');
  if (badge) badge.insertAdjacentHTML('afterbegin', MIC_HTML);
})();
function sysMsg(text) {
  const box = $('chatMsgs');
  const d = document.createElement('div');
  d.className = 'msg sys';
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}
function onChat(cm) {
  if (!cm || cm.kind !== 'msg' || !cm.text) return;
  appendChat(cm.from, cm.name, cm.text, false);
}
const CHAT_GAP_MS = 10 * 60e3;
let lastChatT = 0;
const fmtTime = (t) => { const d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
function appendChat(from, name, text, note, t) {
  const box = $('chatMsgs');
  const ts = t || Date.now();
  if (lastChatT && ts - lastChatT > CHAT_GAP_MS) {
    const hr = document.createElement('hr');
    hr.className = 'chat-gap';
    box.appendChild(hr);
  }
  lastChatT = ts;
  const mine = from === myId;
  const row = people.get(from);
  const island = row && islandOf(row.table);
  const place = island ? ' · ' + island.label : '';
  const m = document.createElement('div');
  m.className = 'msg' + (mine ? ' me' : '');
  m.innerHTML = '<span class="ts">' + fmtTime(ts) + '</span><span class="who-name">' + esc(mine ? 'Bạn' : (name || 'Đồng nghiệp')) + esc(place) + ':</span> ' + esc(text);
  box.appendChild(m);
  while (box.children.length > 80) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  if (note && !mine && !document.body.classList.contains('chat-open')) setChatNote(unreadChat + 1);
}
function showBubble(from, name, text) {
  if (!people.has(from)) return;
  let b = bubbles.get(from);
  if (!b) {
    const el = document.createElement('div');
    el.className = 'bubble';
    bubblesEl.appendChild(el);
    b = { el };
    bubbles.set(from, b);
  }
  b.until = performance.now() + 7000;
  const mine = from === myId;
  b.el.innerHTML = '<b>' + esc(mine ? 'Bạn' : (name || 'Đồng nghiệp')) + '</b>' + esc(String(text).slice(0, 140));
  b.el.hidden = false;
}
function onSay(msg, relay, fromLog) {
  if (!msg || !msg.id || !msg.text) return;
  const id = String(msg.id);
  if (id.startsWith('tap-')) {
    const target = id.slice(4, 13);
    if (!fromLog && target === myId) deliverTap({ id, to: myId, from: msg.from, name: msg.name });
    if (relay && floorHost) broadcastFloor({ kind: 'say', id, from: msg.from, name: msg.name, text: String(msg.text).slice(0, 300) });
    return;
  }
  const text = String(msg.text).slice(0, 300);
  const fresh = !seenSay.has(id);
  if (fresh) {
    seenSay.add(id);
    if (seenSay.size > 120) seenSay.delete(seenSay.values().next().value);
    const entry = { id, from: msg.from, name: msg.name, text, t: msg.t || Date.now() };
    roomLog.push(entry);
    if (roomLog.length > 30) roomLog.shift();
    appendChat(msg.from, msg.name, text, !fromLog, msg.t);
    if (!fromLog) showBubble(msg.from, msg.name, text);
  }
  if (relay && floorHost) broadcastFloor({ kind: 'say', id, from: msg.from, name: msg.name, text, t: msg.t });
}
function sendSay(text) {
  const msg = {
    kind: 'say',
    id: myId + '-' + Date.now().toString(36),
    from: myId,
    name: myName(),
    text: String(text).slice(0, 300),
    t: Date.now()
  };
  onSay(msg, floorHost, false);
  if (floorHost) return;
  if (floorLink && floorLink.open) floorLink.send(msg);
  else toast('Đang nối phòng, gửi lại sau giây lát.');
}
let unreadChat = 0;
function setChatNote(n) {
  unreadChat = n;
  [$('btnChat'), $('btnChatToggle')].forEach((btn) => {
    btn.classList.toggle('has-note', n > 0);
    if (n > 0) btn.dataset.n = n > 9 ? '9+' : String(n);
    else delete btn.dataset.n;
  });
}
function clearChatNote() { setChatNote(0); }
// ---------- chuông thông báo: giữ lại ai vỗ vai/mời khi đang bận, kèm giờ + Đi tới ----------
const notifList = [];
let bellUnread = 0;
try {
  const prev = JSON.parse(localStorage.getItem('furu-notif') || '[]');
  if (Array.isArray(prev)) prev.slice(0, 30).forEach((n) => { if (n && n.t) notifList.push(n); });
} catch (e) {}
function saveNotif() { try { localStorage.setItem('furu-notif', JSON.stringify(notifList.slice(0, 30))); } catch (e) {} }
const NOTIF_TEXT = { tap: 'vỗ vai bạn', invite: 'mời bạn nói chuyện', pair: 'mời bạn nói riêng' };
function pushNotif(kind, name, ref) {
  notifList.unshift({ t: Date.now(), kind, name: String(name || 'Ai đó').slice(0, 24), ...(ref || {}) });
  if (notifList.length > 30) notifList.pop();
  saveNotif();
  renderBell();
  const panel = $('bellPanel');
  if (panel && panel.hidden) {
    bellUnread++;
    const b = $('btnBell');
    b.classList.add('has-note');
    b.dataset.n = bellUnread > 9 ? '9+' : String(bellUnread);
  }
}
function renderBell() {
  const list = $('bellList');
  if (!list) return;
  list.innerHTML = '';
  if (!notifList.length) {
    const d = document.createElement('div');
    d.className = 'bell-empty';
    d.textContent = 'Chưa có thông báo.';
    list.appendChild(d);
    return;
  }
  notifList.forEach((n) => {
    const d = document.createElement('div');
    d.className = 'bell-item';
    const row = n.id ? people.get(n.id) : (n.wid ? rowByWalk(n.wid) : null);
    const canGo = !!(row && posOf(row));
    d.innerHTML = '<span class="ts">' + fmtTime(n.t) + '</span><span class="tx"><b>' + esc(n.name) + '</b> ' + esc(NOTIF_TEXT[n.kind] || n.kind) + '</span>';
    const btn = document.createElement('button');
    if (n.used) {
      d.classList.add('used');
      btn.textContent = 'đã đi';
      btn.disabled = true;
    } else {
      btn.textContent = canGo ? 'Đi tới' : 'đã rời';
      btn.disabled = !canGo;
      if (canGo) btn.addEventListener('click', () => {
        n.used = true;
        saveNotif();
        $('bellPanel').hidden = true;
        goToRow(row);
      });
    }
    d.appendChild(btn);
    list.appendChild(d);
  });
}
if ($('btnBell')) {
  $('btnBell').addEventListener('click', () => {
    const panel = $('bellPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      bellUnread = 0;
      const b = $('btnBell');
      b.classList.remove('has-note');
      delete b.dataset.n;
      renderBell();
    }
  });
  renderBell();
}
function refreshConnText() {
  if (myIsland === 0) return;
  const n = Object.keys(peers).length;
  if (!localStream) setConn(n ? 'on' : '', n ? 'Đã thấy ' + n + ' người — bấm Bật tiếng để nói' : 'Đã ngồi. Bấm Bật tiếng để nói chuyện.');
  else if (n > 0) setConn('on', 'Đang nói chuyện với ' + n + ' người cùng đảo');
  else setConn('', 'Đã bật tiếng — đang chờ người cùng đảo');
}
function loadPeerLib() {
  if (typeof Peer !== 'undefined') return Promise.resolve(true);
  if (peerLibLoading) return peerLibLoading;
  peerLibLoading = new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (typeof Peer !== 'undefined') return resolve(true);
      if (i >= PEER_SOURCES.length) return resolve(false);
      const s = document.createElement('script');
      s.src = PEER_SOURCES[i++];
      s.async = true;
      s.onload = () => { if (typeof Peer !== 'undefined') resolve(true); else next(); };
      s.onerror = () => next();
      document.head.appendChild(s);
    };
    next();
  });
  return peerLibLoading;
}
function openTablePeer() {
  if (myPeer) return Promise.resolve();
  if (peerOpening) return peerOpening;
  const gen = ++claimGen;
  const n = myIsland;
  setConn('', 'Đang nối cuộc gọi…');
  peerOpening = loadPeerLib().then((ok) => {
    if (gen !== claimGen || myIsland !== n) { peerOpening = null; return; }
    if (!ok) {
      peerOpening = null;
      setConn('err', 'Không tải được thư viện kết nối — bấm Bật tiếng để thử lại');
      toast('Không tải được thư viện kết nối. Kiểm tra mạng rồi bấm Bật tiếng.', 5200);
      return;
    }
    return iceServers().then((ice) => openPeerAttempt(gen, n, ice, 0));
  });
  return peerOpening;
}
// Lỗi vĩnh viễn, retry vô ích; còn lại (network/socket/unavailable-id) đều thử lại.
const PEER_FATAL = { 'browser-incompatible': 1, 'invalid-id': 1, 'invalid-key': 1, 'ssl-unavailable': 1 };
const PEER_TRIES = 3;
function openPeerAttempt(gen, n, ice, tries) {
  return new Promise((resolve) => {
    if (gen !== claimGen || myIsland !== n || myPeer) { peerOpening = null; resolve(); return; }
    // Lần retry gắn hậu tố để né id "ma": peer cũ vừa destroy nhưng broker chưa kịp
    // giải phóng id -> new Peer cùng id bị 'unavailable-id' -> chặn hoài mỗi lần bấm Bật tiếng.
    const id = myCallId() + (tries ? '-r' + tries : '');
    let p;
    try { p = new Peer(id, { config: { iceServers: ice, sdpSemantics: 'unified-plan' }, secure: true }); }
    catch (e) {
      peerOpening = null;
      setConn('err', 'Không mở được cuộc gọi — bấm Bật tiếng để thử lại');
      resolve();
      return;
    }
    let settled = false;
    const finish = (next) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      try { p.destroy(); } catch (e) {}
      next();
    };
    const fail = (msg, canRetry) => {
      if (gen !== claimGen) { try { p.destroy(); } catch (e) {} resolve(); return; }
      if (canRetry && tries + 1 < PEER_TRIES && myIsland === n && !myPeer) {
        finish(() => {
          setConn('', 'Đang nối lại cuộc gọi… (' + (tries + 2) + '/' + PEER_TRIES + ')');
          setTimeout(() => resolve(openPeerAttempt(gen, n, ice, tries + 1)), 1000 + tries * 1000);
        });
      } else {
        finish(() => {
          peerOpening = null;
          if (myIsland === n && !myPeer) { setConn('err', msg); $('btnTalk').hidden = false; }
          resolve();
        });
      }
    };
    const to = setTimeout(() => fail('Mạng chậm — bấm Bật tiếng để thử lại', true), 8000);
    dbgEv('peer try' + (tries + 1) + ' ' + id);
    p.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      peerOpening = null;
      if (gen !== claimGen || myIsland !== n) { try { p.destroy(); } catch (e) {} resolve(); return; }
      myPeer = p;
      dbgEv('peer open ' + id);
      wireMyPeer();
      announceSeat();
      dialKnown();
      watchDials();
      refreshConnText();
      refreshScreens();
      resolve();
    });
    p.on('error', (err) => {
      if (settled && myPeer !== p) return;   // peer thua cuộc, đã có peer khác sống
      if (myPeer === p) { handlePeerError(err); return; }
      console.warn('[peer] open lỗi:', err && err.type, 'lần', tries + 1);
      dbgEv('peer err ' + (err && err.type) + ' try' + (tries + 1));
      fail('Chưa nối được cuộc gọi — bạn vẫn ngồi ở bàn. Bấm Bật tiếng để thử lại.', !(err && PEER_FATAL[err.type]));
    });
  });
}
function wireMyPeer() {
  myPeer.on('connection', (conn) => {
    if (!conn.peer || conn.peer === myPeer.id || myIsland === 0) return;
    wireConn(conn.peer, conn);
  });
  myPeer.on('call', (call) => {
    if (call.metadata && call.metadata.kind === 'screen') {
      if (!inMeeting()) { try { call.close(); } catch (e) {} return; }
      try { call.answer(); } catch (e) {}
      call.on('stream', (rs) => {
        screenCall = call;
        showMeetingScreen(rs, (call.metadata && call.metadata.name) || '');
      });
      call.on('close', () => { if (screenCall === call) clearMeetingScreen(); });
      return;
    }
    if (!call.peer || call.peer === myPeer.id || myIsland === 0) { try { call.close(); } catch (e) {} return; }
    try { if (localStream) call.answer(localStream); else call.answer(); }
    catch (e) { try { call.answer(); } catch (e2) {} }
    attachCall(call.peer, call, 0);
  });
  myPeer.on('disconnected', () => {
    if (myIsland === 0 || !myPeer) return;
    setConn('err', 'Mất nối tới máy chủ bắt tay — đang tự nối lại…');
    try { myPeer.reconnect(); } catch (e) {}
  });
}
function handlePeerError(err) {
  if (!err) return;
  if (err.type === 'peer-unavailable') return;
  if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
    if (myIsland > 0) setConn('err', 'Mất nối tới máy chủ bắt tay — các máy đã nối vẫn nói chuyện bình thường');
    if (err.type === 'socket-error' || err.type === 'socket-closed') { try { myPeer && myPeer.reconnect(); } catch (e) {} }
  }
}
function seatByPeer(pid) {
  for (const row of people.values()) if (row.peerId === pid) return row;
  return null;
}
function getEntry(pid) {
  if (!peers[pid]) {
    const row = seatByPeer(pid);
    peers[pid] = { peerId: pid, slot: row ? row.slot : 0, name: (row && row.name) || 'Bạn', conn: null, call: null, remoteStream: null, micOn: true, camOn: true };
  }
  return peers[pid];
}
function dialKnown() {
  people.forEach((row) => {
    if (row.table !== myIsland || row.id === myId || !row.peerId) return;
    dial(row.peerId, 0);
  });
}
// call còn sống? call.open chỉ nói signaling xong — ICE failed/closed cũng phải
// coi như chết, kẻo guard `entry.call` chặn re-dial mãi mãi sau khi rời/vào lại bàn.
function callLive(call) {
  if (!call || !call.open) return false;
  const pc = call.peerConnection;
  if (!pc) return true;
  const s = pc.connectionState || pc.iceConnectionState || '';
  return s !== 'failed' && s !== 'closed';
}
function dial(pid, tries) {
  if (!myPeer || !pid || pid === myPeer.id || myIsland === 0) return;
  const row = seatByPeer(pid);
  const entry = getEntry(pid);
  if (row) { entry.name = row.name || entry.name; entry.slot = row.slot || entry.slot; }
  if (entry.conn && !entry.conn.open) entry.conn = null;
  if (entry.call && !callLive(entry.call)) { entry.call = null; entry.remoteStream = null; }
  const pendingFresh = entry.pending && performance.now() - entry.pendingAt < 5000;
  if (!entry.conn && !pendingFresh) {
    if (entry.pending) { try { entry.pending.close(); } catch (e) {} entry.pending = null; }
    try {
      const conn = myPeer.connect(pid, { reliable: true });
      if (conn) { entry.pending = conn; entry.pendingAt = performance.now(); wireConn(pid, conn); dbgEv('conn> ' + pidShort(pid)); }
    } catch (e) {}
  }
  if (localStream && !entry.call) {
    try {
      const call = myPeer.call(pid, localStream);
      if (call) { attachCall(pid, call, tries || 0); dbgEv('call> ' + pidShort(pid)); }
    } catch (e) {}
  }
}
let dialTimer = null;
function watchDials() {
  clearInterval(dialTimer);
  dialTimer = setInterval(() => {
    if (myIsland === 0 || !myPeer) return;
    people.forEach((row) => {
      if (row.table !== myIsland || row.id === myId || !row.peerId) return;
      const entry = peers[row.peerId];
      if (entry && entry.conn && entry.conn.open && (!localStream || callLive(entry.call))) return;
      dial(row.peerId, 0);
    });
  }, 2500);
}
function killCall(pid, call) {
  const cur = peers[pid];
  if (cur && cur.call === call) { cur.call = null; cur.remoteStream = null; refreshScreens(); }
}
function attachCall(pid, call, tries) {
  const entry = getEntry(pid);
  entry.call = call;
  const redial = () => { if (myIsland > 0) setTimeout(() => { if (myIsland > 0) dial(pid, (tries || 0) + 1); }, 1000); };
  call.on('stream', (rs) => {
    const cur = peers[pid];
    if (!cur) return;
    if (cur.remoteStream && cur.remoteStream !== rs) {
      const old = remoteAudio.get(cur.remoteStream.id);
      if (old) { try { old.pause(); old.srcObject = null; old.remove(); } catch (e) {} remoteAudio.delete(cur.remoteStream.id); }
    }
    cur.call = call;
    cur.remoteStream = rs;
    dbgEv('stream< ' + pidShort(pid));
    refreshScreens();
  });
  call.on('close', () => { killCall(pid, call); dbgEv('call- ' + pidShort(pid)); });
  call.on('iceStateChanged', (st) => {
    dbgEv('ice ' + pidShort(pid) + '=' + st);
    if (st === 'failed' || st === 'closed') { killCall(pid, call); redial(); }
    else if (st === 'disconnected') setTimeout(() => {
      const pc = call.peerConnection;
      const s = pc && (pc.connectionState || pc.iceConnectionState);
      if ((s === 'disconnected' || s === 'failed') && peers[pid] && peers[pid].call === call) { killCall(pid, call); if (myIsland > 0) dial(pid, (tries || 0) + 1); }
    }, 4000);
  });
  call.on('error', (err) => {
    const type = err && err.type;
    dbgEv('call err ' + pidShort(pid) + ' ' + type);
    killCall(pid, call);
    if ((type === 'peer-unavailable' || type === 'network' || type === 'server-error' || type === 'socket-error') && myIsland > 0) {
      setTimeout(() => { if (myIsland > 0) dial(pid, (tries || 0) + 1); }, 1200);
    }
  });
}
function wireConn(pid, conn) {
  conn.on('open', () => {
    const entry = getEntry(pid);
    if (entry.conn && entry.conn !== conn && entry.conn.open) { try { conn.close(); } catch (e) {} return; }
    entry.conn = conn;
    entry.pending = null;
    dbgEv('conn+ ' + pidShort(pid));
    sendTo(entry, { kind: 'hello', name: myName(), mic: micOn, cam: camOn, bc: broadcastOn, dnd });
    if (localStream && !entry.call) dial(pid, 0);
    refreshScreens();
    refreshConnText();
  });
  conn.on('data', (data) => handleData(pid, data));
  conn.on('close', () => {
    const entry = peers[pid];
    if (entry && entry.conn === conn) entry.conn = null;
    if (entry && entry.pending === conn) entry.pending = null;
    refreshConnText();
  });
  conn.on('error', () => {
    const entry = peers[pid];
    if (entry && entry.pending === conn && entry.conn !== conn) entry.pending = null;
  });
}
function handleData(pid, m) {
  if (!m || typeof m !== 'object') return;
  const entry = getEntry(pid);
  if (m.kind === 'hello') {
    const isNew = !entry.greeted;
    entry.name = String(m.name || 'Bạn').slice(0, 24);
    entry.micOn = m.mic !== false;
    entry.camOn = m.cam !== false;
    entry.bc = !!m.bc;
    entry.dnd = !!m.dnd;
    entry.greeted = true;
    if (isNew) {
      const place = (islandOf(myIsland) && islandOf(myIsland).label) || 'đảo';
      sysMsg(entry.name + ' đã vào ' + place + '.');
      toast(entry.name + ' đã vào ' + place + '.');
    }
    refreshScreens();
    refreshConnText();
  } else if (m.kind === 'msg' && m.text) {
    onChat({ kind: 'msg', from: pid, name: entry.name, text: String(m.text).slice(0, 300) });
  } else if (m.kind === 'state') {
    entry.micOn = m.mic !== false;
    entry.camOn = m.cam !== false;
    entry.bc = !!m.bc;
    entry.dnd = !!m.dnd;
    refreshScreens();
    applyGains();
  } else if (m.kind === 'pair-invite') {
    if (dnd || pairPeer || pairIn || pairOut) {
      sendTo(entry, { kind: 'pair-busy', reason: dnd ? 'dnd' : 'busy' });
      return;
    }
    pairIn = { pid, timer: setTimeout(() => declinePair(pid, true), 15000) };
    const prow = seatByPeer(pid);
    pushNotif('pair', String(m.name || entry.name || 'Ai đó').slice(0, 24), { id: prow && prow.id });
    showPairAsk(String(m.name || entry.name || 'Ai đó').slice(0, 24));
  } else if (m.kind === 'pair-accept') {
    if (pairOut && pairOut.pid === pid) { clearTimeout(pairOut.timer); pairOut = null; enterPair(pid); }
  } else if (m.kind === 'pair-decline') {
    if (pairOut && pairOut.pid === pid) {
      clearTimeout(pairOut.timer); pairOut = null;
      toast(entry.name + ' từ chối nói riêng.');
    }
  } else if (m.kind === 'pair-busy') {
    if (pairOut && pairOut.pid === pid) {
      clearTimeout(pairOut.timer); pairOut = null;
      toast(entry.name + (m.reason === 'dnd' ? ' đang bật Không làm phiền.' : ' đang nói riêng với người khác.'));
    }
  } else if (m.kind === 'pair-end') {
    if (pairPeer === pid) exitPair(true);
    if (pairIn && pairIn.pid === pid) { clearTimeout(pairIn.timer); pairIn = null; hidePairAsk(); }
    if (pairOut && pairOut.pid === pid) { clearTimeout(pairOut.timer); pairOut = null; }
  } else if (m.kind === 'screen') {
    if (!m.on && !sharing) clearMeetingScreen();
  } else if (m.kind === 'bye') removePeer(pid, true);
  else if (m.kind === 'tap') deliverTap({ id: m.id, to: myId, from: m.from || pid, name: m.name || entry.name });
}
function sendTo(entry, obj) {
  try { if (entry.conn && entry.conn.open) entry.conn.send(obj); } catch (e) {}
}
function broadcast(obj) {
  Object.keys(peers).forEach((id) => sendTo(peers[id], obj));
}
function removePeer(slot, announce) {
  const entry = peers[slot];
  if (!entry) return;
  if (slot === pairPeer) exitPair(true);
  if (pairOut && pairOut.pid === slot) { clearTimeout(pairOut.timer); pairOut = null; }
  if (pairIn && pairIn.pid === slot) { clearTimeout(pairIn.timer); pairIn = null; hidePairAsk(); }
  delete peers[slot];
  try { if (entry.conn) entry.conn.close(); } catch (e) {}
  try { if (entry.call) entry.call.close(); } catch (e) {}
  if (myIsland > 0) {
    if (announce && entry.greeted) { sysMsg(entry.name + ' đã rời đảo.'); toast(entry.name + ' đã rời đảo.'); }
    refreshScreens();
    refreshConnText();
  }
}

function sendState() {
  broadcast({ kind: 'state', mic: micOn, cam: camOn, bc: broadcastOn, dnd });
}
// ---------- pair 1:1: privacy phía gửi bằng cách tắt sender tới non-partner ----------
function setCallSendersActive(call, active) {
  try {
    const pc = call && call.peerConnection;
    if (!pc || !pc.getSenders) return;
    pc.getSenders().forEach((s) => {
      try {
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings.forEach((e) => { e.active = active; });
        s.setParameters(p).catch(() => {});
      } catch (e) {}
    });
  } catch (e) {}
}
function muteNonPartnerSends() {
  pairMutedCalls = [];
  Object.keys(peers).forEach((id) => {
    if (id === pairPeer) return;
    const call = peers[id].call;
    if (!call) return;
    setCallSendersActive(call, false);
    pairMutedCalls.push(call);
  });
}
function pairName(pid) {
  const entry = peers[pid];
  const row = entry ? null : seatByPeer(pid);
  return (entry && entry.name) || (row && row.name) || 'Đồng nghiệp';
}
function enterPair(pid) {
  if (pairIn) { clearTimeout(pairIn.timer); sendTo(getEntry(pairIn.pid), { kind: 'pair-decline' }); pairIn = null; hidePairAsk(); }
  if (pairOut) { clearTimeout(pairOut.timer); if (pairOut.pid !== pid) sendTo(getEntry(pairOut.pid), { kind: 'pair-decline' }); pairOut = null; }
  pairPeer = pid;
  muteNonPartnerSends();
  const name = pairName(pid);
  setConn('on', 'Đang nói riêng với ' + name + (inMeeting() ? ' · phòng họp nghe nhỏ' : ''));
  toast('Đang nói riêng với ' + name + '. Esc hoặc Kết thúc để quay lại.');
  sysMsg('Bạn đang nói riêng với ' + name + '.');
  refreshScreens();
  syncPairUI();
}
function exitPair(byPeer) {
  if (!pairPeer) return;
  const pid = pairPeer;
  pairPeer = null;
  pairMutedCalls.forEach((call) => setCallSendersActive(call, true));
  pairMutedCalls = [];
  if (!byPeer) { const entry = peers[pid]; if (entry) sendTo(entry, { kind: 'pair-end' }); }
  toast(byPeer ? pairName(pid) + ' đã kết thúc nói riêng.' : 'Đã kết thúc nói riêng.');
  refreshConnText();
  refreshScreens();
  syncPairUI();
}
function invitePair(row) {
  if (!row || !row.peerId || row.id === myId) return;
  if (dnd) { toast('Đang bật Không làm phiền — tắt nó trước đã.'); return; }
  if (pairPeer) { toast('Đang nói riêng — bấm Kết thúc nói riêng trước.'); return; }
  if (pairOut) return;
  const entry = peers[row.peerId];
  if (!entry || !entry.conn || !entry.conn.open) {
    dial(row.peerId, 0);
    toast('Chưa nối được ' + (row.name || 'người này') + ' — thử lại sau giây.');
    return;
  }
  if (entry.dnd) { toast(entry.name + ' đang bật Không làm phiền.'); return; }
  sendTo(entry, { kind: 'pair-invite', name: myName() });
  pairOut = {
    pid: row.peerId,
    timer: setTimeout(() => { pairOut = null; toast((entry.name || row.name || 'Họ') + ' không nhận.'); }, 15000)
  };
  toast('Đang gọi riêng ' + (entry.name || row.name || 'người này') + '…');
}
function showPairAsk(name) {
  $('pairAskText').textContent = name + ' mời bạn nói riêng';
  $('pairAsk').hidden = false;
}
function hidePairAsk() { $('pairAsk').hidden = true; }
function declinePair(pid, timedOut) {
  if (pairIn && pairIn.pid === pid) { clearTimeout(pairIn.timer); pairIn = null; }
  hidePairAsk();
  const entry = peers[pid];
  if (entry) sendTo(entry, { kind: 'pair-decline' });
}
function acceptPair() {
  if (!pairIn) { hidePairAsk(); return; }
  const pid = pairIn.pid;
  clearTimeout(pairIn.timer); pairIn = null; hidePairAsk();
  const entry = peers[pid];
  if (!entry) { toast('Người gọi đã rời.'); return; }
  sendTo(entry, { kind: 'pair-accept' });
  enterPair(pid);
}
function syncPairUI() {
  const island = islandOf(myIsland);
  const talk = !!(island && !island.quiet);
  $('btnBc').hidden = !talk || !!island.share;
  $('btnBc').disabled = !!pairPeer;
  $('btnPairEnd').hidden = !pairPeer;
  $('btnDnd').hidden = !talk;
  $('btnBc').classList.toggle('live', broadcastOn);
  $('btnBc').setAttribute('aria-pressed', String(broadcastOn));
  $('btnDnd').classList.toggle('live', dnd);
  $('btnDnd').setAttribute('aria-pressed', String(dnd));
}
function setDnd(on) {
  if (on === dnd) return;
  if (on) {
    if (pairPeer) exitPair();
    leaveConvo(true);
    if (pairOut) { const e = peers[pairOut.pid]; clearTimeout(pairOut.timer); if (e) sendTo(e, { kind: 'pair-end' }); pairOut = null; }
    if (pairIn) { clearTimeout(pairIn.timer); declinePair(pairIn.pid); }
    if (tapIn) { clearTimeout(tapIn.timer); $('tapAsk').hidden = true; tapIn = null; }
    dnd = true;
    micOn = false;
    camOn = false;
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = false; });
      localStream.getVideoTracks().forEach((t) => { t.enabled = false; });
    }
    toast('Đã bật Không làm phiền. Mic, camera đã khóa và bạn không nghe ai.');
  } else {
    dnd = false;
    toast('Đã tắt Không làm phiền.');
  }
  sendState();
  syncControlButtons();
  syncPairUI();
  updateSelf();
  refreshScreens();
  applyGains();
}

function sendPresence(msg) {
  if (floorHost) { applyPresence(msg, true); return; }
  if (floorLink && floorLink.open) floorLink.send(msg);
  else if (msg.kind === 'move') { if (!pendingPresence || pendingPresence.kind === 'move') pendingPresence = msg; }
  else pendingPresence = msg;
}
function noteFloor(ok) {
  if (myIsland !== 0) { if (ok) refreshConnText(); return; }
  setConn(ok ? 'on' : '', ok ? 'Đã nối phòng. Ngồi cùng đảo để nói chuyện.' : 'Đang tìm mọi người trong phòng…');
}
function resolveSeatClash() {
  if (myIsland === 0 || !mySlot) return;
  const other = [...people.values()].find((r) => r.id !== myId && r.table === myIsland && r.slot === mySlot && r.id < myId);
  if (!other) return;
  const used = takenSlots(myIsland - 1);
  const island = islandOf(myIsland);
  if (!island) return;
  let slot = 0;
  for (let s = 1; s <= island.seats.length; s++) if (!used.has(s)) { slot = s; break; }
  if (!slot || slot === mySlot) return;
  mySlot = slot;
  announceSeat();
  sitCamera(island.seats[slot - 1]);
}
function notePeer(who) {
  if (!who || who.id === myId || who.table !== myIsland || !who.peerId || !myPeer) return;
  dial(String(who.peerId), 0);
  if (sharing && screenStream) offerScreen(String(who.peerId));
}
function applyPresence(msg, relay) {
  if (!msg) return;
  if (msg.kind === 'here' && msg.who) {
    upsertSeat(msg.who);
    if (relay) broadcastFloor(msg);
    notePeer(msg.who);
    resolveSeatClash();
    refreshScreens();
  } else if (msg.kind === 'gone' && msg.id) {
    if (msg.id === myId && myIsland > 0) return;
    removeSeat(msg.id);
    if (relay) broadcastFloor(msg);
    refreshScreens();
  } else if (msg.kind === 'move' && msg.id) {
    applyPos(msg);
    if (relay) broadcastFloor(msg);
  } else if (msg.kind === 'roster' && Array.isArray(msg.people)) {
    const keep = new Set(msg.people.map((p) => p.id));
    [...people.keys()].forEach((id) => { if (id !== myId && !keep.has(id)) removeSeat(id); });
    msg.people.forEach((p) => { upsertSeat(p); notePeer(p); });
    resolveSeatClash();
    refreshScreens();
  }
}
function broadcastFloor(msg) {
  floorConns.forEach((c) => { try { if (c.open) c.send(msg); } catch (e) {} });
}
function onFloorData(msg, from) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.kind === 'beat' || msg.kind === 'ping') {
    lastBeat = performance.now();
    // client trả lời beat bằng pong để host biết còn sống — không có thì walker bị 'gone'
    if (msg.kind === 'beat' && !floorHost && floorLink && floorLink.open) {
      try { floorLink.send({ kind: 'pong' }); } catch (e) {}
    }
    return;
  }
  if (msg.kind === 'here' && msg.who && floorHost) {
    if (from) from.whoId = msg.who.id;
    applyPresence(msg, true);
    return;
  }
  if (msg.kind === 'gone' && floorHost) { applyPresence(msg, true); return; }
  if (msg.kind === 'move' && msg.id) { applyPresence(msg, floorHost); return; }
  if (msg.kind === 'say') { onSay(msg, floorHost, false); return; }
  if (msg.kind === 'tap') {
    if (floorHost && from) broadcastFloor(msg);
    deliverTap(msg);
    return;
  }
  if (msg.kind === 'tap-dnd') {
    if (floorHost && from) broadcastFloor(msg);
    if (msg.to === myId && msg.from !== myId) {
      const who = people.get(msg.from);
      toast((msg.name || (who && who.name) || 'Người đó') + ' đang bật Không làm phiền.');
    }
    return;
  }
  if (msg.kind === 'coffee') {
    if (floorHost && from) broadcastFloor(msg);
    onCoffeeOrder(msg);
    return;
  }
  if (msg.kind === 'log' && Array.isArray(msg.items) && !floorHost) {
    msg.items.forEach((item) => onSay(item, false, true));
    return;
  }
  if (!floorHost && (msg.kind === 'here' || msg.kind === 'gone' || msg.kind === 'roster' || msg.kind === 'move')) applyPresence(msg, false);
}
const HUBS = ['furu-hub-0', 'furu-hub-1', 'furu-hub-2', 'furu-hub-3', 'furu-hub-4', 'furu-hub-5', 'furu-hub-6', 'furu-hub-7'];
let floorGen = 0;
let floorPeer = null;
let floorHost = false;
let floorLink = null;
let floorConns = [];
let floorHub = -1;
let floorTimer = null;
let lastBeat = 0;
function destroyFloor() {
  clearInterval(floorTimer);
  try { if (floorPeer) floorPeer.destroy(); } catch (e) {}
  floorPeer = null;
  floorLink = null;
  floorHost = false;
  floorConns = [];
  floorHub = -1;
}
function peerOpts(ice) {
  return { config: { iceServers: ice, sdpSemantics: 'unified-plan' }, secure: true };
}
let reprobeAt = performance.now();
// Probe thử hub i có host nào trả lời beat không (peer ẩn danh, dùng xong destroy).
function probeAlive(index, done) {
  iceServers().then((ice) => {
    let p;
    try { p = new Peer(undefined, peerOpts(ice)); } catch (e) { done(false); return; }
    let settled = false;
    const fin = (ok) => { if (settled) return; settled = true; try { p.destroy(); } catch (e) {} done(ok); };
    const to = setTimeout(() => fin(false), 8000);
    p.on('open', () => {
      const conn = p.connect(HUBS[index], { reliable: true });
      conn.on('open', () => { try { conn.send({ kind: 'ping' }); } catch (e) {} });
      conn.on('data', (m) => { if (m && (m.kind === 'beat' || m.kind === 'roster')) { clearTimeout(to); fin(true); } });
      conn.on('close', () => fin(false));
      conn.on('error', () => fin(false));
    });
    p.on('error', () => fin(false));
  });
}
function startFloorWatch(gen) {
  clearInterval(floorTimer);
  floorTimer = setInterval(() => {
    if (gen !== floorGen) return;
    // Hội tụ về hub số thấp nhất còn sống: host chết mà giữ ID hub thấp sẽ làm
    // floor tách thành nhiều hub song song — ai thấy hub thấp sống lại thì claimFloor() quay về.
    if (floorHub > 0 && performance.now() - reprobeAt > 40000) {
      reprobeAt = performance.now();
      (function tryLower(i) {
        if (i < 0 || gen !== floorGen || floorHub === 0) return;
        probeAlive(i, (ok) => {
          if (ok && gen === floorGen && floorHub > 0) { dbgEv('floor converge hub' + i); claimFloor(); }
          else if (gen === floorGen) tryLower(i - 1);
        });
      })(floorHub - 1);
    }
    if (floorHost) {
      broadcastFloor({ kind: 'beat', t: Date.now() });
      const now = performance.now();
      floorConns = floorConns.filter((c) => {
        // chỉ dọn conn đã từng trả lời ping (client code mới) — client bản cũ không
        // gửi ping nên không thể phân biệt "chết" với "im lặng hợp lệ"
        if (!c._pong || now - (c._seen || 0) < 25000) return true;
        try { c.close(); } catch (e) {}
        if (c.whoId && c.whoId !== myId) { removeSeat(c.whoId); broadcastFloor({ kind: 'gone', id: c.whoId }); }
        return false;
      });
      return;
    }
    if (!floorLink || !floorLink.open || performance.now() - lastBeat > 8000) claimFloor();
  }, 2500);
}
function becomeHost(gen, p, index) {
  floorPeer = p;
  floorHost = true;
  floorLink = null;
  floorHub = index;
  lastBeat = performance.now();
  noteFloor(true);
  dbgEv('floor host hub' + index);
  p.on('connection', (conn) => {
    floorConns.push(conn);
    conn.on('open', () => {
      conn._seen = performance.now();
      try { conn.send({ kind: 'beat', t: Date.now() }); } catch (e) {}
      try { conn.send({ kind: 'roster', people: rosterList() }); } catch (e) {}
      if (roomLog.length) { try { conn.send({ kind: 'log', items: roomLog.slice(-30) }); } catch (e) {} }
    });
    conn.on('data', (msg) => {
      conn._seen = performance.now();
      if (msg && msg.kind === 'ping') { try { conn.send({ kind: 'beat', t: Date.now() }); } catch (e) {} return; }
      if (msg && msg.kind === 'pong') { conn._pong = true; return; }
      onFloorData(msg, conn);
    });
    conn.on('close', () => {
      floorConns = floorConns.filter((c) => c !== conn);
      if (conn.whoId && conn.whoId !== myId && !floorConns.some((c) => c.whoId === conn.whoId)) {
        removeSeat(conn.whoId);
        broadcastFloor({ kind: 'gone', id: conn.whoId });
      }
    });
  });
  p.on('disconnected', () => { try { p.reconnect(); } catch (e) {} });
  p.on('close', () => { if (gen === floorGen) setTimeout(claimFloor, 700); });
  p.on('error', (err) => {
    if (gen !== floorGen) return;
    const type = err && err.type;
    if (type === 'network' || type === 'socket-error' || type === 'socket-closed' || type === 'server-error') setTimeout(claimFloor, 800);
  });
  if (myPresence) broadcastFloor({ kind: 'here', who: myPresence });
  startFloorWatch(gen);
}
function becomeClient(gen, p, conn, index) {
  floorPeer = p;
  floorLink = conn;
  floorHost = false;
  floorHub = index;
  lastBeat = performance.now();
  noteFloor(true);
  dbgEv('floor join hub' + index);
  const msg = (pendingPresence && pendingPresence.kind !== 'move')
    ? pendingPresence
    : (myPresence ? { kind: 'here', who: myPresence } : pendingPresence);
  pendingPresence = null;
  if (msg) { try { conn.send(msg); } catch (e) {} }
  p.on('disconnected', () => { try { p.reconnect(); } catch (e) {} });
  p.on('close', () => { if (gen === floorGen) setTimeout(claimFloor, 700); });
  startFloorWatch(gen);
}
function probeHub(gen, index, ice) {
  if (gen !== floorGen) return;
  const p = new Peer(undefined, peerOpts(ice));
  let settled = false;
  const next = () => {
    if (settled || gen !== floorGen) return;
    settled = true;
    try { p.destroy(); } catch (e) {}
    scanHub(gen, index + 1);
  };
  const to = setTimeout(next, 9000);
  p.on('open', () => {
    if (settled || gen !== floorGen) { try { p.destroy(); } catch (e) {} return; }
    const conn = p.connect(HUBS[index], { reliable: true });
    const beatWait = setTimeout(next, 7000);
    conn.on('open', () => { try { conn.send({ kind: 'ping' }); } catch (e) {} });
    conn.on('data', (msg) => {
      if (!msg) return;
      if (!settled && (msg.kind === 'beat' || msg.kind === 'roster')) {
        settled = true;
        clearTimeout(to);
        clearTimeout(beatWait);
        becomeClient(gen, p, conn, index);
      }
      if (msg.kind === 'beat') { lastBeat = performance.now(); return; }
      onFloorData(msg, null);
    });
    conn.on('close', next);
    conn.on('error', next);
  });
  p.on('error', next);
}
function scanHub(gen, index) {
  if (gen !== floorGen) return;
  if (index >= HUBS.length) { setTimeout(() => { if (gen === floorGen) scanHub(gen, 0); }, 4000); return; }
  iceServers().then((ice) => {
    if (gen !== floorGen) return;
    let p;
    try { p = new Peer(HUBS[index], peerOpts(ice)); }
    catch (e) { scanHub(gen, index + 1); return; }
    let settled = false;
    const giveUp = () => {
      if (settled || gen !== floorGen) return;
      settled = true;
      try { p.destroy(); } catch (e) {}
      probeHub(gen, index, ice);
    };
    const to = setTimeout(giveUp, 12000);
    p.on('open', () => {
      if (settled || gen !== floorGen) { try { p.destroy(); } catch (e) {} return; }
      settled = true;
      clearTimeout(to);
      becomeHost(gen, p, index);
    });
    p.on('error', (err) => {
      if (gen !== floorGen || settled) return;
      const type = err && err.type;
      if (type === 'unavailable-id' || type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') giveUp();
    });
  });
}
function claimFloor() {
  const gen = ++floorGen;
  destroyFloor();
  noteFloor(false);
  scanHub(gen, 0);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; unlockAudio(); });
function fpvAct() {
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects([...G.people.children, ...pickers], true);
  for (const hit of hits) {
    let o = hit.object, pid = '', pk = null;
    while (o) {
      if (!pid && o.userData && o.userData.personId) pid = o.userData.personId;
      if (!pk && o.userData && (o.userData.island !== undefined)) pk = o.userData;
      o = o.parent;
    }
    if (pid && pid !== myId) {
      const row = people.get(pid);
      const p = row && posOf(row);
      const d = p ? Math.hypot(fpvPos.x - p.x, fpvPos.z - p.z) : 99;
      if (row && d <= TAP_RANGE) sendInvite(row);
      else if (row) { askNotify(); tapShoulder(pid); }
      return;
    }
    if (pk) {
      const isl = pk.island, sl = pk.slot;
      const occ = rowAtSeat(isl + 1, sl + 1);
      if (occ) {
        const p = posOf(occ);
        const d = p ? Math.hypot(fpvPos.x - p.x, fpvPos.z - p.z) : 99;
        if (d <= TAP_RANGE) sendInvite(occ);
        else { askNotify(); tapShoulder(occ.id); }
        return;
      }
      exitFpv();
      joinDesk(isl, sl);
      return;
    }
  }
}
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down = null;
  if (dx * dx + dy * dy > 36) return;
  if (fpv) { fpvAct(); return; }
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (inMeeting() && meetingTvMesh && screenVideo && screenVideo.srcObject) {
    const tvHit = raycaster.intersectObject(meetingTvMesh, false)[0];
    if (tvHit) { openTvFull(); return; }
  }
  if (!inSecurity && !watchingFish) {
    if (myIsland > 0) {
      const island = islandOf(myIsland);
      if (island && island.screens.length) {
        const sh = raycaster.intersectObjects(island.screens, false)[0];
        if (sh) {
          const slot = island.screens.indexOf(sh.object) + 1;
          const who = rowAtSeat(myIsland, slot);
          if (who && who.id !== myId) { invitePair(who); return; }
        }
      }
    }
    const person = personUnderPointer();
    if (person) { askNotify(); tapShoulder(person); return; }
  }
  if (myIsland !== 0 || inSecurity) return;
  const hit = raycaster.intersectObjects(pickers, false)[0];
  // Ngắm cá đã ẩn trên thanh công cụ.
  // if (hit && hit.object.userData.fish) { enterFish(); return; }
  if (hit && hit.object.userData.security) { enterSecurity(); return; }
  if (hit) joinDesk(hit.object.userData.island, hit.object.userData.slot);
});
canvas.addEventListener('pointermove', (e) => {
  if (fpv) return;
  if (inMeeting() && meetingTvMesh && screenVideo && screenVideo.srcObject) {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const tvHit = raycaster.intersectObject(meetingTvMesh, false)[0];
    canvas.style.cursor = tvHit ? 'zoom-in' : '';
    setHoveredIsland(-1); ring.visible = false;
    return;
  }
  if (myIsland !== 0 || inSecurity) {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    setHoveredIsland(-1); ring.visible = false;
    canvas.style.cursor = !inSecurity && !watchingFish && personUnderPointer() ? 'pointer' : '';
    return;
  }
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (!watchingFish && personUnderPointer()) {
    setHoveredIsland(-1); ring.visible = false; canvas.style.cursor = 'pointer'; return;
  }
  const hit = raycaster.intersectObjects(pickers, false)[0];
  if (hit && (hit.object.userData.fish || hit.object.userData.security)) {
    setHoveredIsland(-1); ring.visible = false; canvas.style.cursor = 'pointer'; return;
  }
  setHoveredIsland(hit ? hit.object.userData.island : -1);
  canvas.style.cursor = hit ? 'pointer' : '';
  if (hit) {
    const seat = islands[hit.object.userData.island].seats[hit.object.userData.slot];
    ring.visible = true;
    ring.position.set(seat.x, 0.04, seat.z);
  } else ring.visible = false;
});

$('btnTalk').addEventListener('click', () => { if (dnd) { toast('Đang bật Không làm phiền.'); return; } startVoice(); });
$('btnHear').addEventListener('click', () => {
  unlockAudio();
  let pending = 0;
  remoteAudio.forEach((audio) => {
    pending++;
    const goPlay = audio.play();
    if (goPlay && goPlay.then) goPlay.then(() => { if (--pending === 0) $('btnHear').hidden = true; }).catch(() => {});
    else pending--;
  });
  if (!remoteAudio.size) $('btnHear').hidden = true;
});
$('btnMic').addEventListener('click', () => {
  if (dnd) { toast('Đang bật Không làm phiền.'); return; }
  if (!localStream || !localStream.getAudioTracks().length) { startVoice(); return; }
  micOn = !micOn;
  localStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
  syncControlButtons();
  refreshScreens();
  sendState();
});
$('btnShare').addEventListener('click', () => { if (dnd) { toast('Đang bật Không làm phiền.'); return; } if (sharing) stopShare(); else startShare(); });
$('btnTv').addEventListener('click', openTvFull);
$('tvFullClose').addEventListener('click', closeTvFull);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) $('tvFull').hidden = true; });
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (watchingFish) { leaveFish(); return; }
  if (inSecurity) { leaveSecurity(); return; }
  if (fpv && document.pointerLockElement !== canvas) { exitFpv(); return; }
  if (pairPeer) { exitPair(); return; }
  if (follow >= 0) { go('v3d'); return; }
  if (!$('tvFull').hidden) closeTvFull();
});
function endFishWatch() {
  if (!watchingFish) return;
  setWatchingFish(false);
  setFishPose(null);
  controls.minDistance = 1;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.495;
  const fishBtn = $('btnFish');
  if (fishBtn) fishBtn.setAttribute('aria-pressed', 'false');
}
function enterFish() {
  setFollow(-1);
  if (myIsland !== 0) { toast('Rời bàn trước khi ngắm cá.'); return; }
  if (inSecurity) return;
  if (AQ.feed) AQ.feed();
  if (watchingFish) {
    $('hint').textContent = 'Đang cho cá ăn · bấm Ngắm cá để rắc thêm · Esc để trở lại';
    return;
  }
  setWatchingFish(true);
  setCamera(persp);
  labelsEl.hidden = true;
  ring.visible = false;
  setFishPose({ p: persp.position.clone(), t: controls.target.clone() });
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b.id === 'btnFish')));
  const eye = new THREE.Vector3(-1.55, 1.5, 5.75);
  const look = new THREE.Vector3(-1.45, 1.42, 6.9);
  controls.enabled = false;
  if (REDUCED) {
    persp.position.copy(eye); controls.target.copy(look); setTween(null);
    controls.enabled = true;
    controls.minDistance = 0.4; controls.maxDistance = 3.2; controls.maxPolarAngle = Math.PI * 0.7;
  } else setTween({ p0: persp.position.clone(), t0: controls.target.clone(), p1: eye, t1: look, s: 0, fish: true });
  $('hint').textContent = 'Đang cho cá ăn · bấm Ngắm cá để rắc thêm · Esc để trở lại';
}
function leaveFish() {
  if (!watchingFish) return;
  const pose = fishPose;
  endFishWatch();
  $('hint').textContent = 'Bấm một bàn để ngồi · kéo để xoay';
  if (!pose) { controls.enabled = true; return; }
  controls.enabled = true;
  if (REDUCED) { persp.position.copy(pose.p); controls.target.copy(pose.t); setTween(null); return; }
  setTween({ p0: persp.position.clone(), t0: controls.target.clone(), p1: pose.p, t1: pose.t, s: 0 });
}
function enterSecurity() {
  endFishWatch();
  setFollow(-1);
  if (inSecurity) return;
  if (myIsland !== 0) { toast('Rời bàn trước khi vào RAG.'); return; }
  setInSecurity(true);
  controls.enabled = false;
  setCamera(persp);
  labelsEl.hidden = true;
  ring.visible = false;
  setSecurityPose({ p: persp.position.clone(), t: controls.target.clone() });
  const eye = new THREE.Vector3(10.15, 1.62, -3.2);
  const look = new THREE.Vector3(12.55, 1.15, -3.2);
  if (REDUCED) { persp.position.copy(eye); controls.target.copy(look); setTween(null); }
  else setTween({ p0: persp.position.clone(), t0: controls.target.clone(), p1: eye, t1: look, s: 0 });
  const frame = $('secureFrame');
  if (frame.src) {
    frame.hidden = securityBlocked;
    $('secureBlocked').hidden = !securityBlocked;
  } else {
    setSecurityBlocked(false);
    $('secureBlocked').hidden = true;
    frame.hidden = false;
    frame.src = SECURITY_URL;
  }
  $('secureRoom').hidden = false;
  $('hint').textContent = 'RAG · Esc hoặc Thoát để rời phòng';
  $('secureExit').focus();
}
function leaveSecurity() {
  if (!inSecurity) return;
  setInSecurity(false);
  $('secureRoom').hidden = true;
  const pose = securityPose;
  setSecurityPose(null);
  $('hint').textContent = 'Bấm một bàn để ngồi · kéo để xoay';
  labelsEl.hidden = true;
  controls.enabled = true;
  if (!pose) return;
  if (REDUCED) { persp.position.copy(pose.p); controls.target.copy(pose.t); setTween(null); return; }
  setTween({ p0: persp.position.clone(), t0: controls.target.clone(), p1: pose.p, t1: pose.t, s: 0 });
}
$('secureExit').addEventListener('click', leaveSecurity);
$('secureFrame').addEventListener('load', () => {
  const frame = $('secureFrame');
  let blocked = true;
  try {
    blocked = !frame.contentWindow || frame.contentWindow.location.href === 'about:blank';
  } catch (e) { blocked = false; }
  setSecurityBlocked(blocked);
  frame.hidden = blocked;
  $('secureBlocked').hidden = !blocked || $('secureRoom').hidden;
  if (blocked && !$('secureRoom').hidden) $('secureExit').focus();
});
$('btnCam').addEventListener('click', () => {
  if (dnd) { toast('Đang bật Không làm phiền.'); return; }
  if (camOn) {
    camOn = false;
    if (localStream) localStream.getVideoTracks().forEach((t) => { t.enabled = false; });
    syncControlButtons();
    updateSelf();
    sendState();
    return;
  }
  ensureVideo().then((ok) => {
    camOn = ok;
    if (!ok) toast('Chưa bật được camera. Hãy cho phép camera rồi bấm lại.', 4600);
    syncControlButtons();
    updateSelf();
    sendState();
  }).catch(() => {
    camOn = false;
    toast('Trình duyệt đang chặn camera. Mở quyền camera cho trang này.', 4800);
    syncControlButtons();
  });
});
$('btnLeave').addEventListener('click', () => {
  const seat = myIsland ? seatOf(myIsland, mySlot) : null;
  const island = islandOf(myIsland);
  if (!seat) { leaveDesk(false); return; }
  const sx = seat.x - Math.sin(seat.yaw) * 1.4, sz = seat.z - Math.cos(seat.yaw) * 1.4;
  const sp = findSpawn(sx, sz, island);
  const yaw = Math.atan2(sp.x - seat.x, sp.z - seat.z);
  leaveDesk(true);
  enterFpv(sp.x, sp.z, yaw);
  toast('Đã đứng dậy — đang đi dạo.');
});
$('btnCoffee').addEventListener('click', orderCoffee);
$('btnInvite').addEventListener('click', () => {
  const island = islandOf(myIsland);
  const slug = inviteSlug(island);
  if (slug) copyInvite(slug, island.label);
});
// $('btnFish').addEventListener('click', enterFish);
let menuOpen = true;
let preferChat = innerWidth > 980;
try { menuOpen = localStorage.getItem('furu-office-menu') !== '0'; } catch (e) {}
function applyChrome() {
  document.body.classList.toggle('menu-hidden', !menuOpen);
  document.body.classList.toggle('chat-open', preferChat);
  $('btnChatToggle').hidden = false;
  $('btnMenu').textContent = menuOpen ? 'Ẩn menu' : 'Hiện menu';
  $('btnMenu').setAttribute('aria-pressed', String(menuOpen));
  const chatOn = document.body.classList.contains('chat-open');
  $('btnChatToggle').textContent = chatOn ? 'Ẩn chat' : 'Hiện chat';
  $('btnChatToggle').setAttribute('aria-pressed', String(chatOn));
  $('btnChat').setAttribute('aria-pressed', String(chatOn));
}
function toggleMenu() {
  menuOpen = !menuOpen;
  try { localStorage.setItem('furu-office-menu', menuOpen ? '1' : '0'); } catch (e) {}
  applyChrome();
}
function toggleChat() {
  preferChat = !document.body.classList.contains('chat-open');
  if (preferChat) clearChatNote();
  applyChrome();
}
applyChrome();
$('btnMenu').addEventListener('click', toggleMenu);
$('btnChatToggle').addEventListener('click', toggleChat);
$('btnChat').addEventListener('click', toggleChat);
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('chatInput').value.trim();
  if (!v) return;
  sendSay(v);
  $('chatInput').value = '';
});
function storedLook() {
  try {
    const raw = JSON.parse(localStorage.getItem('furu-office-look') || 'null');
    const look = normalizeLook(raw);
    if (!look) return null;
    const name = String((raw && raw.name) || localStorage.getItem('furu-office-name') || '').slice(0, 24);
    return { look, name };
  } catch (e) { return null; }
}
function saveLook(colors, name) {
  const look = normalizeLook(colors);
  if (!look) return;
  myLook = look;
  const entry = { ...look, name: String(name || '').slice(0, 24) };
  try {
    localStorage.setItem('furu-office-look', JSON.stringify(entry));
    localStorage.setItem('furu-office-name', entry.name);
  } catch (e) {}
  $('nameInput').value = entry.name;
}
let draft = freshLook();
let lookPreview = null;
const lookRefreshers = [];
function copyLook(look) {
  const next = normalizeLook(look) || freshLook();
  return { ...next, acc: [...next.acc] };
}
function refreshLook() { lookRefreshers.forEach((fn) => fn()); }
function previewLook() {
  if (!lookPreview) {
    lookPreview = createPreview($('lookPreview'));
    if (!lookPreview) $('lookErr').hidden = false;
  }
  if (!lookPreview) return;
  lookPreview.setLook(draft);
  lookPreview.setName($('lookName').value.trim());
}
function buildLookForm() {
  const rows = $('lookRows');
  if (rows.childElementCount) return;
  for (const row of ROWS) {
    const line = document.createElement('div');
    line.className = 'row';
    const label = document.createElement('span');
    label.textContent = row.label;
    label.id = 'lab-' + row.key;
    const opts = document.createElement('div');
    opts.className = 'opts' + (row.type === 'multi' ? ' multi' : '');
    opts.setAttribute('role', 'group');
    opts.setAttribute('aria-labelledby', label.id);
    const buttons = [];
    const items = row.type === 'swatch' ? row.colors.map((color, i) => [i, row.names[i], color]) : row.opts;
    for (const [value, text, color] of items) {
      const button = document.createElement('button');
      button.type = 'button';
      if (row.type === 'swatch') {
        button.className = 'sw';
        button.style.background = color;
        button.setAttribute('aria-label', text);
        button.title = text;
      } else {
        button.className = 'chip';
        button.textContent = text;
      }
      button.addEventListener('click', () => {
        if (row.type === 'multi') {
          if (draft.acc.includes(value)) draft.acc = draft.acc.filter((item) => item !== value);
          else {
            const group = EXCL.find((g) => g.includes(value));
            draft.acc = draft.acc.filter((item) => !(group && group.includes(item))).concat(value);
          }
          if (lookPreview) lookPreview.focus(BODY_ACC.has(value) ? 'full' : 'face');
        } else {
          draft[row.key] = value;
          if (lookPreview) lookPreview.focus(row.focus);
        }
        refreshLook();
        previewLook();
      });
      buttons.push([button, value]);
      opts.appendChild(button);
    }
    lookRefreshers.push(() => buttons.forEach(([button, value]) => {
      button.setAttribute('aria-pressed', String(row.type === 'multi' ? draft.acc.includes(value) : draft[row.key] === value));
    }));
    line.append(label, opts);
    rows.appendChild(line);
  }
}
function showMaker(doneLabel) {
  const saved = storedLook();
  draft = saved ? copyLook(saved.look) : freshLook();
  $('lookName').value = (saved && saved.name) || $('nameInput').value || '';
  $('lookGo').textContent = doneLabel;
  buildLookForm();
  refreshLook();
  $('maker').hidden = false;
  previewLook();
  if (lookPreview) lookPreview.start();
}
try {
  const saved = storedLook();
  if (saved) {
    saveLook(saved.look, saved.name);
    $('maker').hidden = true;
  } else {
    const named = localStorage.getItem('furu-office-name');
    if (named) $('nameInput').value = named;
    showMaker('Vào văn phòng');
  }
} catch (e) { showMaker('Vào văn phòng'); }
takeInvite();
$('lookName').addEventListener('input', () => { if (lookPreview) lookPreview.setName($('lookName').value.trim()); });
$('camFull').addEventListener('click', () => lookPreview && lookPreview.focus('full'));
$('camFace').addEventListener('click', () => lookPreview && lookPreview.focus('face'));
$('lookSpin').addEventListener('click', () => {
  const on = $('lookSpin').getAttribute('aria-pressed') !== 'true';
  $('lookSpin').setAttribute('aria-pressed', String(on));
  if (lookPreview) lookPreview.setSpin(on);
});
$('lookRand').addEventListener('click', () => {
  const name = $('lookName').value;
  draft = randomLook();
  $('lookName').value = name;
  refreshLook();
  previewLook();
});
$('lookForm').addEventListener('submit', (e) => {
  e.preventDefault();
  saveLook(draft, $('lookName').value.trim());
  $('maker').hidden = true;
  if (lookPreview) lookPreview.stop();
  updateSelf();
  if (myIsland > 0) announceSeat();
  takeInvite();
});
$('btnLook').addEventListener('click', () => showMaker('Xong'));
$('nameInput').addEventListener('change', () => {
  const name = $('nameInput').value.trim().slice(0, 24);
  if (myLook) saveLook(myLook, name);
  else { try { localStorage.setItem('furu-office-name', name); } catch (e) {} }
  updateSelf();
  if (myIsland > 0) {
    broadcast({ kind: 'hello', name: myName(), mic: micOn, cam: camOn });
    announceSeat();
  }
});
addEventListener('beforeunload', () => {
  if (myIsland > 0 || fpv) {
    const msg = { kind: 'gone', id: myId };
    try {
      if (floorHost) broadcastFloor(msg);
      else if (floorLink && floorLink.open) floorLink.send(msg);
    } catch (e) {}
  }
  if (localStream) localStream.getTracks().forEach((tr) => tr.stop());
});
// ---------- FPV đi dạo + vỗ vai mời nói chuyện + convo + nhạc cà phê ----------
islands.forEach((island) => {                                                // AABB khu bàn: ghế shrink 1.6m
  if (!island.seats.length) return;
  const xs = island.seats.map(s => s.x), zs = island.seats.map(s => s.z);
  const b = { x0: Math.min(...xs) + 1.6, z0: Math.min(...zs) + 1.6, x1: Math.max(...xs) - 1.6, z1: Math.max(...zs) - 1.6 };
  if (b.x1 - b.x0 < 0.4) { const c = (b.x0 + b.x1) / 2; b.x0 = c - 0.5; b.x1 = c + 0.5; }
  if (b.z1 - b.z0 < 0.4) { const c = (b.z0 + b.z1) / 2; b.z0 = c - 0.5; b.z1 = c + 0.5; }
  colliders.push(b);
});
colliders.push(
  { x0: -12.4, z0: 4.4, x1: -9.9, z1: 9.4 },   // phòng server (staff only)
  { x0: 10.6, z0: -9.4, x1: 12.4, z1: -4.4 },  // phòng security
  { x0: -12.4, z0: -6.3, x1: -11.9, z1: -2.9 },// quầy cà phê
  { x0: -2.4, z0: 5.9, x1: -0.6, z1: 7.4 },    // quầy lễ tân
  { x0: 0.3, z0: 5.6, x1: 2.6, z1: 7.6 },      // hồ cá
);
export function isFpv() { return fpv; }
function myPos() {
  if (fpv) return { x: fpvPos.x, z: fpvPos.z, y: 0, walk: 1 };
  if (myIsland) { const s = seatOf(myIsland, mySlot); if (s) return { x: s.x, z: s.z, y: s.y || 0 }; }
  return null;
}
function posOf(row) {
  if (!row) return null;
  if (row.walk) return { x: row.wx, z: row.wz, y: 0, walk: 1 };
  const s = seatOf(row.table, row.slot);
  return s ? { x: s.x, z: s.z, y: s.y || 0 } : null;
}
function rowByWalk(wid) { for (const r of people.values()) if (r.walkId === wid) return r; return null; }
function distGain(d) { return d <= HEAR_FULL ? 1 : Math.max(0, (HEAR_RANGE - d) / (HEAR_RANGE - HEAR_FULL)); }
function hitWall(x, z) {
  const r = 0.3;
  return colliders.some(b => x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1);
}
function findSpawn(sx, sz, island) {
  let x = sx, z = sz;
  if (hitWall(x, z)) {
    if (island) {
      let dx = sx - island.center.x, dz = sz - island.center.z;
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      for (let i = 0; i < 40 && hitWall(x, z); i++) { x += dx * 0.2; z += dz * 0.2; }
    }
    if (hitWall(x, z)) { x = 0; z = 4; }
  }
  return { x, z };
}
function enterFpv(sx, sz, syaw) {
  if (fpv) return;
  if (!$('maker').hidden) { toast('Chọn hình đã rồi đi dạo nhé.'); return; }
  if (myIsland > 0) leaveDesk();
  ensureWalkPeer();
  fpv = true;
  fpvPos.set(sx ?? 0, 0, sz ?? 4); fpvYaw = syaw ?? Math.PI; fpvPitch = 0;
  $('crosshair').hidden = false;
  $('vwalk').setAttribute('aria-pressed', 'true');
  buttons.forEach(b => { if (b.id !== 'vwalk') b.setAttribute('aria-pressed', 'false'); });
  setFollow(-1);
  $('hint').textContent = 'WASD di chuyển · chuột nhìn · gần ghế bấm Ngồi xuống hoặc E · Gọi agent hoặc phím G · Esc thả chuột';
  callBtn.hidden = false;
  setWalkView(true);
  setCamera(persp); controls.enabled = false; labelsEl.hidden = true; setTween(null);
  canvas.requestPointerLock();
  announceWalk();
}
function callAgent() {
  let x, z;
  if (fpv) { x = fpvPos.x; z = fpvPos.z; }
  else if (myIsland) {
    const s = seatOf(myIsland, mySlot);
    if (!s) return;
    x = s.x; z = s.z;
  } else {
    toast('Đi dạo hoặc ngồi xuống rồi hãy gọi agent.');
    return;
  }
  const name = summonAgent(x, z);
  if (name) toast('Agent ' + name + ' đang chạy tới.');
}
function sitFromWalk() {
  if (!fpv || !sitNear) return;
  const target = sitNear;
  exitFpv();
  joinDesk(target.island, target.slot);
}
function exitFpv() {
  if (!fpv) return;
  fpv = false; fpvKeys.clear();
  sitNear = null; sitBtn.hidden = true;
  callBtn.hidden = true;
  setWalkView(false);
  $('crosshair').hidden = true;
  $('vwalk').setAttribute('aria-pressed', 'false');
  tapTarget = null;
  if (document.pointerLockElement) document.exitPointerLock();
  if (myIsland === 0) { myPresence = null; removeSeat(myId); sendPresence({ kind: 'gone', id: myId }); }
  go('v3d');
}
document.addEventListener('pointerlockchange', () => {
  if (fpv && document.pointerLockElement !== canvas) {
    $('hint').textContent = 'Đi dạo tạm dừng · click vào màn hình để tiếp tục · Esc/Home để về view mặc định';
  }
});
document.addEventListener('mousemove', (e) => {
  if (!fpv || document.pointerLockElement !== canvas) return;
  fpvYaw -= e.movementX * 0.0022;
  fpvPitch = Math.max(-1.45, Math.min(1.45, fpvPitch - e.movementY * 0.0022));
});
const KEYMAP = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
document.addEventListener('keydown', (e) => { if (fpv && KEYMAP[e.code]) { fpvKeys.add(e.code); e.preventDefault(); } });
document.addEventListener('keyup', (e) => fpvKeys.delete(e.code));
export function tickSession(dt) {
  if (fpv) fpvTick(dt);
}
function fpvTick(dt) {
  let dx = 0, dz = 0;
  fpvKeys.forEach(k => { dx += KEYMAP[k][0]; dz += KEYMAP[k][1]; });
  if (dx || dz) {
    const fx = -Math.sin(fpvYaw), fz = -Math.cos(fpvYaw);
    const rx = Math.cos(fpvYaw), rz = -Math.sin(fpvYaw);
    let mx = fx * -dz + rx * dx, mz = fz * -dz + rz * dx;
    const L = Math.hypot(mx, mz) || 1, sp = 3 * dt / L;
    mx *= sp; mz *= sp;
    if (!hitWall(fpvPos.x + mx, fpvPos.z)) fpvPos.x += mx;
    if (!hitWall(fpvPos.x, fpvPos.z + mz)) fpvPos.z += mz;
    fpvPos.x = Math.max(-11.9, Math.min(11.9, fpvPos.x));
    fpvPos.z = Math.max(-8.9, Math.min(8.9, fpvPos.z));
  }
  persp.position.set(fpvPos.x, 1.6, fpvPos.z);
  persp.rotation.order = 'YXZ';
  persp.rotation.set(fpvPitch, fpvYaw, 0);
  sendWalkPos();
}
// 'move' gửi từ rAF (mượt ở foreground) LẪN interval 250ms — tab nền tạm dừng
// rAF nên nếu chỉ gửi trong fpvTick thì remote thấy avatar đông cứng tại chỗ spawn.
function sendWalkPos() {
  const now = performance.now();
  if (now - fpvSentAt < 100) return;
  fpvSentAt = now;
  sendPresence({ kind: 'move', id: myId, x: fpvPos.x, z: fpvPos.z, yaw: fpvYaw + Math.PI });
}
document.addEventListener('visibilitychange', () => {
  if (fpv && document.hidden) { fpvSentAt = 0; sendWalkPos(); }
});
// --- walk peer: kênh mời nói chuyện + convo ---
function ensureWalkPeer() {
  if (walkPeer) return Promise.resolve();
  return loadPeerLib().then((ok) => ok ? iceServers() : null).then((ice) => {
    if (!ice || walkPeer) return;
    walkPeer = new Peer(myWalkId(), peerOpts(ice));
    walkPeer.on('connection', (conn) => {
      wconns.set(conn.peer, conn);
      conn.on('data', (d) => handleWalkData(conn.peer, d));
      conn.on('close', () => wconns.delete(conn.peer));
    });
    walkPeer.on('call', (call) => {
      if (!pendingWalk.has(call.peer) && !convoSet.has(call.peer)) { try { call.close(); } catch (e) {} return; }
      pendingWalk.delete(call.peer);
      try { call.answer(localStream || new MediaStream()); } catch (e) { try { call.close(); } catch (e2) {} return; }
      walkCalls.set(call.peer, call);
      convoSet.add(call.peer);
      $('btnConvoEnd').hidden = false;
      call.on('stream', (s) => addWalkStream(call.peer, s));
      call.on('close', () => dropWalkPeer(call.peer));
    });
    walkPeer.on('error', (e) => { if (e && e.type === 'peer-unavailable') toast('Không kết nối được'); });
  });
}
function addWalkStream(wid, stream) {
  walkStreams.set(wid, stream);
  playRemoteAudio(stream);
  applyWalkGains();
}
function dropWalkPeer(wid) {
  const s = walkStreams.get(wid);
  if (s) { const a = remoteAudio.get(s.id); if (a) { try { a.pause(); a.srcObject = null; a.remove(); } catch (e) {} remoteAudio.delete(s.id); } }
  walkCalls.delete(wid); walkStreams.delete(wid);
  convoSet.delete(wid);
  if (!convoSet.size) $('btnConvoEnd').hidden = true;
}
function dialWalk(wid) {
  if (!walkPeer || walkCalls.has(wid)) return;
  let conn = wconns.get(wid);
  if (!conn || !conn.open) {
    conn = walkPeer.connect(wid, { reliable: true });
    wconns.set(wid, conn);
  }
  if (!conn.__hwd) { conn.__hwd = true; conn.on('data', (d) => handleWalkData(wid, d)); conn.on('close', () => wconns.delete(wid)); }
  let call;
  try { call = walkPeer.call(wid, localStream || new MediaStream()); } catch (e) { return; }
  walkCalls.set(wid, call);
  call.on('stream', (s) => addWalkStream(wid, s));
  call.on('close', () => dropWalkPeer(wid));
}
function ensureVoiceThen(fn) {
  if (localStream) { fn(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Trình duyệt này không mở được mic'); return; }
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((s) => { localStream = s; micOn = true; fn(); })
    .catch(() => toast('Không lấy được mic'));
}
function joinConvo(wid, members) {
  if (pairPeer) exitPair();
  ensureVoiceThen(() => {
    convoSet.add(wid);
    dialWalk(wid);
    members.forEach((m) => { if (m !== myWalkId() && !convoSet.has(m)) { convoSet.add(m); setTimeout(() => dialWalk(m), 700); } });
    $('btnConvoEnd').hidden = false;
    applyGains(); applyWalkGains();
    toast('Đang trò chuyện' + (convoSet.size > 1 ? ' · ' + convoSet.size + ' người' : ''));
  });
}
function leaveConvo(silent) {
  if (!convoSet.size && !walkCalls.size) return;
  convoSet.forEach((wid) => { const c = wconns.get(wid); try { if (c && c.open) c.send({ kind: 'convo-leave', id: myWalkId() }); } catch (e) {} });
  convoSet.clear();
  walkCalls.forEach((c) => { try { c.close(); } catch (e) {} });
  walkCalls.clear(); walkStreams.clear(); wconns.clear();
  convoFar = 0;
  $('btnConvoEnd').hidden = true;
  applyGains(); applyWalkGains();
  if (!silent) toast('Đã rời cuộc trò chuyện');
}
function handleWalkData(wid, d) {
  if (!d || !d.kind) return;
  if (d.kind === 'invite') {
    if (dnd || pairPeer || convoSet.size) {
      const c = wconns.get(wid);
      try { if (c && c.open) c.send({ kind: 'invite-busy', reason: dnd ? 'dnd' : pairPeer ? 'pair' : 'convo' }); } catch (e) {}
      return;
    }
    if (tapIn) clearTimeout(tapIn.timer);
    tapIn = { walkId: wid, name: d.name || 'Ai đó' };
    pushNotif('invite', tapIn.name, { wid });
    $('tapAskText').textContent = tapIn.name + ' vỗ vai bạn — nói chuyện?';
    $('tapAsk').hidden = false;
    tapIn.timer = setTimeout(() => { $('tapAsk').hidden = true; tapIn = null; }, 15000);
  } else if (d.kind === 'invite-accept') {
    joinConvo(wid, d.members || []);
  } else if (d.kind === 'invite-busy') {
    toast(d.reason === 'dnd' ? 'Người đó đang bật Không làm phiền' : d.reason === 'convo' ? 'Người đó đang trong cuộc trò chuyện khác' : 'Người đó đang nói riêng');
  } else if (d.kind === 'convo-join') {
    if (convoSet.size) { convoSet.add(d.id); pendingWalk.add(d.id); applyWalkGains(); }
  } else if (d.kind === 'convo-leave') {
    const c = walkCalls.get(d.id); try { if (c) c.close(); } catch (e) {}
    dropWalkPeer(d.id);
    applyWalkGains();
  }
}
function walkGain(wid) {
  if (!convoSet.has(wid)) return 0;
  const me = myPos(), row = rowByWalk(wid), tp = row && posOf(row);
  if (!me || !tp) return 0;
  return distGain(Math.hypot(me.x - tp.x, me.z - tp.z));
}
function applyWalkGains() {
  walkStreams.forEach((s, wid) => { const el = remoteAudio.get(s.id); if (el) el.volume = walkGain(wid); });
}
function sendInvite(row) {
  if (!row || row.id === myId) return;
  if (!row.walkId) { toast((row.name || 'Người đó') + ' chưa hỗ trợ nói chuyện khi đi dạo.'); return; }
  if (convoSet.size && convoSet.has(row.walkId)) return;
  ensureWalkPeer().then(() => {
    if (!walkPeer) { toast('Không nối được kênh nói chuyện.'); return; }
    let conn = wconns.get(row.walkId);
    if (!conn || !conn.open) {
      conn = walkPeer.connect(row.walkId, { reliable: true });
      wconns.set(row.walkId, conn);
      conn.on('open', () => conn.send({ kind: 'invite', name: myName() }));
    } else conn.send({ kind: 'invite', name: myName() });
    if (!conn.__hwd) { conn.__hwd = true; conn.on('data', (d) => handleWalkData(row.walkId, d)); conn.on('close', () => wconns.delete(row.walkId)); }
    toast('Đã vỗ vai ' + row.name + ' — chờ nhận');
  });
}
// --- nút Đi tới trên tapNotice/chuông: teleport ra sau lưng người vỗ vai rồi auto mời ---
function goToRow(row) {
  $('tapNotice').hidden = true;
  if (!row) { toast('Không thấy người đã vỗ vai nữa.'); return; }
  const p = posOf(row);
  if (!p) { toast('Không định vị được ' + row.name + '.'); return; }
  const back = row.walk ? (row.wyaw || 0) : (seatOf(row.table, row.slot) ? seatOf(row.table, row.slot).yaw : 0);
  let x = p.x - Math.sin(back) * 1.3;
  let z = p.z - Math.cos(back) * 1.3;
  if (hitWall(x, z)) {
    const s = findSpawn(x, z, islandOf(row.table));
    x = s.x; z = s.z;
  }
  const yaw = Math.atan2(x - p.x, z - p.z);
  if (fpv) { fpvPos.set(x, 0, z); fpvYaw = yaw; fpvPitch = 0; fpvSentAt = 0; sendWalkPos(); }
  else enterFpv(x, z, yaw);
  if (row.walkId) setTimeout(() => sendInvite(row), 400);
}
function goToTapper() { goToRow(people.get(tapFrom)); }
$('tapGo').addEventListener('click', goToTapper);
// FPV giữ pointer lock nên không click được nút — phím tắt cho các dialog:
// T = đi tới người vỗ vai · Y/Enter = nhận · N = từ chối.
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.code === 'Escape' && $('bellPanel') && !$('bellPanel').hidden) { $('bellPanel').hidden = true; return; }
  if (e.code === 'KeyE' && fpv && sitNear) { e.preventDefault(); sitFromWalk(); return; }
  if (e.code === 'KeyG' && (fpv || myIsland > 0)) { e.preventDefault(); callAgent(); return; }
  if (e.code === 'KeyT' && !$('tapNotice').hidden) { e.preventDefault(); goToTapper(); return; }
  if (e.code === 'KeyY' || e.code === 'Enter') {
    if (!$('tapAsk').hidden) { e.preventDefault(); $('tapYes').click(); }
    else if (!$('pairAsk').hidden) { e.preventDefault(); $('pairYes').click(); }
  } else if (e.code === 'KeyN') {
    if (!$('tapAsk').hidden) { e.preventDefault(); $('tapNo').click(); }
    else if (!$('pairAsk').hidden) { e.preventDefault(); $('pairNo').click(); }
  }
});
// --- nhạc cà phê: YouTube ẩn, 80% trong zone, 0 ngoài ---
window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('ytBox', {
    videoId: ytVid,
    playerVars: { autoplay: 1, mute: 1, loop: 1, playlist: ytVid, controls: 0, disablekb: 1, rel: 0, playsinline: 1 },
    events: { onReady: () => { ytReady = true; } },
  });
};
(() => { const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); })();
const armYt = () => { if (ytArmed || !ytReady) return; try { ytPlayer.unMute(); ytPlayer.playVideo(); ytArmed = true; } catch (e) {} };
addEventListener('pointerdown', armYt);
addEventListener('keydown', armYt);
function cafeGain() {
  const me = myPos();
  if (!me || dnd) return 0;
  const inZone = me.x >= CAFE_ZONE.x0 && me.x <= CAFE_ZONE.x1 && me.z >= CAFE_ZONE.z0 && me.z <= CAFE_ZONE.z1;
  if (!inZone) return 0;
  if (pairPeer && !inMeeting()) return 0;
  let g = 0.8;
  if (pairPeer && inMeeting()) g = PAIR_DUCK;
  else if (convoSet.size) g *= 0.15;
  return g;
}
const tapTagEl = document.createElement('button');
tapTagEl.id = 'tapTag'; tapTagEl.type = 'button'; tapTagEl.hidden = true;
tapTagEl.addEventListener('click', () => { if (tapTarget) sendInvite(tapTarget); });
document.body.appendChild(tapTagEl);
setInterval(() => {
  if (ytPlayer && ytReady && ytArmed) { try { ytPlayer.setVolume(Math.round(cafeGain() * 100)); } catch (e) {} }
  if (fpv) sendWalkPos();
  let best = null, bd = TAP_RANGE;
  if (fpv) {
    people.forEach((row) => {
      if (row.id === myId || !row.walkId) return;
      if (convoSet.size && convoSet.has(row.walkId)) return;
      const p = posOf(row);
      if (!p) return;
      const d = Math.hypot(fpvPos.x - p.x, fpvPos.z - p.z);
      if (d < bd) { bd = d; best = row; }
    });
  }
  tapTarget = best;
  if (tapTarget) tapTagEl.textContent = 'Vỗ vai ' + tapTarget.name;
  if (convoSet.size) {
    const me = myPos();
    const near = me && [...convoSet].some((wid) => {
      const r = rowByWalk(wid), p = r && posOf(r);
      return p && Math.hypot(me.x - p.x, me.z - p.z) <= HEAR_RANGE * 1.5;
    });
    convoFar = near ? 0 : convoFar + 0.25;
    if (convoFar >= 5) { leaveConvo(); toast('Đi quá xa — đã rời cuộc trò chuyện'); }
    else applyWalkGains();
  }
}, 250);

$('tapYes').addEventListener('click', () => {
  $('tapAsk').hidden = true;
  const t = tapIn; tapIn = null;
  if (!t) return;
  if (pairPeer) exitPair();
  ensureWalkPeer().then(() => ensureVoiceThen(() => {
    const conn = wconns.get(t.walkId);
    try { if (conn && conn.open) conn.send({ kind: 'invite-accept', members: [...convoSet, myWalkId()] }); } catch (e) {}
    wconns.forEach((c, w) => { try { if (convoSet.has(w) && c.open) c.send({ kind: 'convo-join', id: t.walkId }); } catch (e) {} });
    pendingWalk.add(t.walkId);
    convoSet.add(t.walkId);
    $('btnConvoEnd').hidden = false;
    applyGains();
  }));
});
$('tapNo').addEventListener('click', () => {
  $('tapAsk').hidden = true;
  const t = tapIn; tapIn = null;
  if (!t) return;
  const conn = wconns.get(t.walkId);
  try { if (conn && conn.open) conn.send({ kind: 'invite-busy', reason: 'decline' }); } catch (e) {}
});
$('btnConvoEnd').addEventListener('click', () => leaveConvo());
$('vwalk').addEventListener('click', () => enterFpv());
$('btnCallAgent').addEventListener('click', callAgent);
$('btnCallAgentRoom').addEventListener('click', callAgent);
$('vhome').addEventListener('click', () => { exitFpv(); go('v3d'); });
$('btnBc').addEventListener('click', () => {
  if (pairPeer) { toast('Đang nói riêng — Kết thúc trước đã.'); return; }
  if (dnd) { toast('Đang bật Không làm phiền.'); return; }
  broadcastOn = !broadcastOn;
  sendState(); syncPairUI();
  toast(broadcastOn ? 'Cả đảo đang nghe bạn.' : 'Đã tắt nói cả bàn.');
});
$('btnDnd').addEventListener('click', () => setDnd(!dnd));
$('btnPairEnd').addEventListener('click', () => exitPair());
$('pairYes').addEventListener('click', acceptPair);
$('pairNo').addEventListener('click', () => { if (pairIn) declinePair(pairIn.pid); });

loadPeerLib().then((ok) => { if (ok) claimFloor(); });
// Chrome tự reload tab bị discard khi focus lại — tự ngồi lại chỗ cũ (<12h) để
// trải nghiệm như chưa chết. Không restore FPV (auto-grab chuột rất khó chịu).
try {
  const sv = JSON.parse(localStorage.getItem('furu-office-seat') || 'null');
  if (sv && sv.i > 0 && Date.now() - sv.t < 12 * 3600e3) {
    setTimeout(() => {
      const used = takenSlots(sv.i - 1);
      joinDesk(sv.i - 1, used.has(sv.s) ? -1 : sv.s - 1);
    }, 1200);
  }
} catch (e) {}



hooks.toast = toast;
hooks.joinDesk = joinDesk;
hooks.endFishWatch = endFishWatch;
hooks.enterFish = enterFish;
hooks.enterSecurity = enterSecurity;
hooks.leaveSecurity = leaveSecurity;
hooks.seatedQuiet = seatedQuiet;
hooks.islandOf = islandOf;
hooks.myName = myName;
hooks.broadcastFloor = broadcastFloor;
hooks.myId = () => myId;
hooks.mySlot = () => mySlot;
hooks.isHost = () => floorHost;
hooks.sendFloor = (msg) => { if (floorLink && floorLink.open) { try { floorLink.send(msg); } catch (e) {} } };
hooks.posOf = (r) => posOf(r);
hooks.debug = () => ({
  myId, island: myIsland, slot: mySlot, dnd, fpv, micOn, camOn, bc: broadcastOn,
  peer: myPeer ? { id: myPeer.id, open: myPeer.open, destroyed: myPeer.destroyed, disconn: myPeer.disconnected } : null,
  opening: !!peerOpening,
  stream: localStream ? localStream.getTracks().map((t) => t.kind + ':' + (t.enabled ? 'on' : 'off') + '/' + t.readyState) : null,
  peers: Object.values(peers).map((e) => ({
    pid: e.peerId, name: e.name,
    conn: e.conn ? (e.conn.open ? 'open' : 'dead') : (e.pending ? 'pending' : '-'),
    call: e.call ? { open: !!e.call.open, ice: e.call.peerConnection ? (e.call.peerConnection.connectionState || e.call.peerConnection.iceConnectionState) : '-' } : null,
    rx: e.remoteStream ? e.remoteStream.getTracks().map((t) => t.kind[0] + ':' + t.readyState).join('+') : '-',
    gain: +hearingGain(e.peerId).toFixed(2),
  })),
  floor: { host: floorHost, link: floorLink ? floorLink.open : null, conns: floorConns.length, people: people.size },
  walk: { peer: walkPeer ? walkPeer.id : null, convo: convoSet.size, conns: wconns.size, streams: walkStreams.size, calls: walkCalls.size },
  log: dbgLog.slice(-24),
});
hooks.dbgEv = dbgEv;
hooks.dbgLog = () => dbgLog.slice();
hooks.upsertSeat = upsertSeat;
hooks.removeSeat = removeSeat;
hooks.people = () => people;
