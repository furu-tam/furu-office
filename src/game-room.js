import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCharacter, clampLook, disposeAvatar, lookSig, randomLook, tickAvatar } from './avatar.js';

const $ = (id) => document.getElementById(id);
const SEATS = 20;
const CHAIR_R = 2.2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = $('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
} catch (e) {
  $('err').hidden = false;
  throw e;
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b2233);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x163040, 0.85));
const sun = new THREE.DirectionalLight(0xfff2e4, 1.6);
sun.position.set(4, 8, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 40);
camera.position.set(0.2, 6.4, 7.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.4;
controls.maxDistance = 14;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.72 });
const felt = new THREE.MeshStandardMaterial({ color: 0x1d6b52, roughness: 0.9 });
const chairMat = new THREE.MeshStandardMaterial({ color: 0x243038, roughness: 0.6 });
const chairBack = new THREE.MeshStandardMaterial({ color: 0x2fa89a, roughness: 0.55 });
const metal = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.28, metalness: 0.7 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.86 });
function mesh(geo, material, x, y, z, parent) {
  const o = new THREE.Mesh(geo, material);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  parent.add(o);
  return o;
}

const floor = mesh(new THREE.CircleGeometry(4.6, 64), floorMat, 0, 0, 0, scene);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
const rug = mesh(new THREE.CircleGeometry(3.15, 64), new THREE.MeshStandardMaterial({ color: 0x14343a, roughness: 0.95 }), 0, 0.02, 0, scene);
rug.rotation.x = -Math.PI / 2;
mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 20), metal, 0, 0.36, 0, scene);
mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.07, 48), wood, 0, 0.74, 0, scene);
mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.02, 48), felt, 0, 0.785, 0, scene);
for (const [x, z, rot] of [[0.35, 0.15, 0.2], [0.42, 0.22, 0.4], [0.28, 0.28, -0.3]]) {
  const card = mesh(new THREE.BoxGeometry(0.16, 0.008, 0.24), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 }), x, 0.81, z, scene);
  card.rotation.y = rot;
}

const seats = [];
const pickers = [];
for (let i = 0; i < SEATS; i++) {
  const a = (i / SEATS) * Math.PI * 2;
  const x = Math.sin(a) * CHAIR_R;
  const z = Math.cos(a) * CHAIR_R;
  const yaw = Math.atan2(-x, -z);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), chairMat, 0, 0.46, 0, g);
  const back = mesh(new THREE.BoxGeometry(0.46, 0.48, 0.06), chairBack, 0, 0.76, -0.22, g);
  back.rotation.x = -0.1;
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), metal, 0, 0.24, 0, g);
  mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 5), chairMat, 0, 0.04, 0, g);
  const picker = mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), x, 0.7, z, scene);
  picker.userData.slot = i + 1;
  pickers.push(picker);
  seats.push({ x, z, yaw });
}

const dieCanvas = document.createElement('canvas');
dieCanvas.width = dieCanvas.height = 128;
const dieTex = new THREE.CanvasTexture(dieCanvas);
dieTex.colorSpace = THREE.SRGBColorSpace;
const dieMat = new THREE.MeshStandardMaterial({ map: dieTex, roughness: 0.45 });
const die = mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), dieMat, -0.15, 0.95, -0.05, scene);
function paintDie(n) {
  const g = dieCanvas.getContext('2d');
  g.fillStyle = '#f6f1e6';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#d9d0c2';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#1b2428';
  g.font = '800 78px "Be Vietnam Pro", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n || '?'), 64, 70);
  dieTex.needsUpdate = true;
}
paintDie(0);

const people = new Map();
const peopleRoot = new THREE.Group();
scene.add(peopleRoot);
const facesEl = $('faces');
const _pt = new THREE.Vector3();
let mySlot = 0;
let myId = '';
{
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 9; i++) myId += chars[Math.floor(Math.random() * chars.length)];
}
function myName() {
  const v = $('nameInput').value.trim();
  return v ? v.slice(0, 24) : 'Bạn ' + myId.slice(0, 4);
}
function myLook() {
  try { return clampLook(JSON.parse(localStorage.getItem('furu-office-look') || 'null')); }
  catch (e) { return null; }
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
function taken() {
  const used = new Set();
  people.forEach((row) => { if (row.id !== myId && row.slot) used.add(row.slot); });
  return used;
}
function freeSlot() {
  const used = taken();
  for (let s = 1; s <= SEATS; s++) if (!used.has(s)) return s;
  return 0;
}
function dropRowBody(row) {
  if (!row.body) return;
  disposeAvatar(row.body);
  row.body = null;
  row.avatar = null;
}
function upsert(who) {
  if (!who || !who.id || !who.slot || who.slot < 1 || who.slot > SEATS) return;
  let row = people.get(who.id);
  if (!row) {
    const el = document.createElement('div');
    el.className = 'who';
    facesEl.appendChild(el);
    row = { id: who.id, el };
    people.set(who.id, row);
  }
  row.name = String(who.name || 'Bạn').slice(0, 24);
  row.slot = who.slot | 0;
  const look = clampLook(who.look);
  if (look) row.storedLook = look;
  const sig = look ? lookSig(look) : (row.lookSig || '');
  row.el.classList.toggle('me', who.id === myId);
  row.el.textContent = row.name + (who.id === myId ? ' · bạn' : '');
  if (!row.body || (sig && sig !== row.lookSig)) {
    dropRowBody(row);
    const seat = seats[row.slot - 1];
    const g = new THREE.Group();
    g.position.set(seat.x, 0, seat.z);
    g.rotation.y = seat.yaw;
    const avatar = buildCharacter(look || row.cached || (row.cached = randomLook()));
    avatar.root.position.z = -0.16;
    g.add(avatar.root);
    peopleRoot.add(g);
    row.body = g;
    row.avatar = avatar;
    row.lookSig = sig || 'rand';
  } else {
    const seat = seats[row.slot - 1];
    row.body.position.set(seat.x, 0, seat.z);
    row.body.rotation.y = seat.yaw;
  }
}
function removePerson(id) {
  const row = people.get(id);
  if (!row) return;
  dropRowBody(row);
  row.el.remove();
  people.delete(id);
}
function sitCamera(slot) {
  const seat = seats[slot - 1];
  const s = Math.sin(seat.yaw);
  const c = Math.cos(seat.yaw);
  camera.position.set(seat.x - s * 1.7, 1.65, seat.z - c * 1.7);
  controls.target.set(0, 0.85, 0);
}
function announce() {
  const who = { id: myId, name: myName(), slot: mySlot, look: myLook() };
  upsert(who);
  send({ kind: 'here', who });
}
function sit(slot) {
  if (mySlot) return;
  if (!slot) slot = freeSlot();
  if (!slot) { toast('Bàn đã kín 20 ghế.'); return; }
  if (taken().has(slot)) { toast('Ghế này đã có người.'); return; }
  mySlot = slot;
  $('btnSit').hidden = true;
  $('btnRoll').hidden = false;
  $('btnLeave').hidden = false;
  $('hint').textContent = 'Đang ngồi ghế ' + slot + '/20 · gieo xúc xắc khi tới lượt';
  announce();
  sitCamera(slot);
  toast('Đã ngồi ghế ' + slot + '.');
}
function leave() {
  if (!mySlot) return;
  const id = myId;
  mySlot = 0;
  removePerson(id);
  send({ kind: 'gone', id });
  $('btnSit').hidden = false;
  $('btnRoll').hidden = true;
  $('btnLeave').hidden = true;
  $('hint').textContent = 'Bấm một ghế để ngồi';
  camera.position.set(0.2, 6.4, 7.6);
  controls.target.set(0, 0.8, 0);
  toast('Bạn đã rời ghế.');
}

let rollUntil = 0;
let rollValue = 0;
let lastRoll = 0;
function showRoll(msg) {
  if (!msg || msg.id === lastRoll) return;
  lastRoll = msg.id;
  rollValue = msg.value;
  rollUntil = performance.now() + (reduced ? 0 : 700);
  paintDie(msg.value);
  const line = (msg.name || 'Ai đó') + ' gieo được ' + msg.value + '.';
  $('hint').textContent = mySlot ? 'Ghế ' + mySlot + '/20 · ' + line : line;
  toast(line);
}
function rollDie() {
  if (!mySlot) { toast('Ngồi vào bàn rồi hãy gieo.'); return; }
  if (performance.now() < rollUntil) return;
  const value = 1 + Math.floor(Math.random() * 6);
  showRoll({ id: Date.now(), name: myName(), value });
  send({ kind: 'roll', id: lastRoll, name: myName(), value });
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down = null;
  if (dx * dx + dy * dy > 36 || mySlot) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickers, false)[0];
  if (hit) sit(hit.object.userData.slot);
});
$('btnSit').addEventListener('click', () => sit(0));
$('btnRoll').addEventListener('click', rollDie);
$('btnLeave').addEventListener('click', leave);
$('btnInvite').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  const text = url.toString();
  try { await navigator.clipboard.writeText(text); toast('Đã chép link phòng game.'); }
  catch (e) { toast(text, 5000); }
});
try {
  const saved = localStorage.getItem('furu-office-name');
  if (saved) $('nameInput').value = saved;
} catch (e) {}
$('nameInput').addEventListener('change', () => {
  try { localStorage.setItem('furu-office-name', $('nameInput').value.trim()); } catch (e) {}
  if (mySlot) announce();
});

const HUBS = ['furu-game-0', 'furu-game-1', 'furu-game-2', 'furu-game-3'];
const ice = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
let floorGen = 0;
let floorPeer = null;
let floorHost = false;
let floorLink = null;
let floorConns = [];
function send(msg) {
  if (floorHost) broadcast(msg, null);
  else if (floorLink && floorLink.open) { try { floorLink.send(msg); } catch (e) {} }
}
function broadcast(msg, skip) {
  floorConns.forEach((conn) => { if (conn !== skip && conn.open) { try { conn.send(msg); } catch (e) {} } });
  onFloor(msg);
}
function roster() {
  return [...people.values()].map((r) => ({ id: r.id, name: r.name, slot: r.slot, look: r.id === myId ? myLook() : r.storedLook }));
}
function onFloor(msg) {
  if (!msg || !msg.kind || msg.kind === 'beat' || msg.kind === 'ping') return;
  if (msg.kind === 'here') {
    upsert(msg.who);
    if (msg.who && msg.who.id !== myId && msg.who.slot === mySlot && msg.who.id < myId) {
      const next = freeSlot();
      if (next) { mySlot = next; announce(); sitCamera(next); toast('Ghế vừa bị trùng. Bạn chuyển sang ghế ' + next + '.'); }
    }
  } else if (msg.kind === 'gone' && msg.id !== myId) removePerson(msg.id);
  else if (msg.kind === 'roster' && Array.isArray(msg.people)) msg.people.forEach(upsert);
  else if (msg.kind === 'roll') showRoll(msg);
}
function destroyFloor() {
  clearInterval(floorTimer);
  try { if (floorPeer) floorPeer.destroy(); } catch (e) {}
  floorPeer = null;
  floorLink = null;
  floorHost = false;
  floorConns = [];
}
let floorTimer = null;
function watch(gen) {
  clearInterval(floorTimer);
  floorTimer = setInterval(() => {
    if (gen !== floorGen) return;
    if (floorHost) broadcast({ kind: 'beat', t: Date.now() }, null);
    else if (!floorLink || !floorLink.open) claim();
  }, 2500);
}
function becomeHost(gen, peer) {
  floorPeer = peer;
  floorHost = true;
  peer.on('connection', (conn) => {
    floorConns.push(conn);
    conn.on('open', () => {
      try { conn.send({ kind: 'roster', people: roster() }); } catch (e) {}
      try { conn.send({ kind: 'beat', t: Date.now() }); } catch (e) {}
    });
    conn.on('data', (msg) => {
      if (!msg || msg.kind === 'ping') { try { conn.send({ kind: 'beat', t: Date.now() }); } catch (e) {} return; }
      if (msg.kind === 'here' && msg.who) conn.whoId = msg.who.id;
      broadcast(msg, conn);
    });
    conn.on('close', () => {
      floorConns = floorConns.filter((c) => c !== conn);
      if (conn.whoId && conn.whoId !== myId) {
        removePerson(conn.whoId);
        broadcast({ kind: 'gone', id: conn.whoId }, null);
      }
    });
  });
  peer.on('error', () => { if (gen === floorGen) setTimeout(claim, 800); });
  peer.on('close', () => { if (gen === floorGen) setTimeout(claim, 700); });
  watch(gen);
}
function claim() {
  const gen = ++floorGen;
  destroyFloor();
  const opts = { config: { iceServers: ice, sdpSemantics: 'unified-plan' }, secure: true };
  const scan = (index) => {
    if (gen !== floorGen) return;
    if (index >= HUBS.length) { setTimeout(() => { if (gen === floorGen) scan(0); }, 4000); return; }
    let peer;
    try { peer = new Peer(HUBS[index], opts); }
    catch (e) { scan(index + 1); return; }
    let settled = false;
    const asGuest = () => {
      if (settled || gen !== floorGen) return;
      settled = true;
      try { peer.destroy(); } catch (e) {}
      const guest = new Peer(undefined, opts);
      let joined = false;
      const fail = () => {
        if (joined || gen !== floorGen) return;
        try { guest.destroy(); } catch (e) {}
        scan(index + 1);
      };
      guest.on('open', () => {
        if (gen !== floorGen) { try { guest.destroy(); } catch (e) {} return; }
        const conn = guest.connect(HUBS[index], { reliable: true });
        const timer = setTimeout(fail, 7000);
        conn.on('open', () => { try { conn.send({ kind: 'ping' }); } catch (e) {} });
        conn.on('data', (msg) => {
          if (msg && (msg.kind === 'beat' || msg.kind === 'roster') && !joined) {
            joined = true;
            clearTimeout(timer);
            floorPeer = guest;
            floorLink = conn;
            floorHost = false;
            if (mySlot) send({ kind: 'here', who: { id: myId, name: myName(), slot: mySlot, look: myLook() } });
            watch(gen);
          }
          onFloor(msg);
        });
        conn.on('close', () => { if (joined && gen === floorGen) claim(); else fail(); });
      });
      guest.on('error', fail);
    };
    const timer = setTimeout(asGuest, 8000);
    peer.on('open', () => {
      if (settled || gen !== floorGen) return;
      settled = true;
      clearTimeout(timer);
      becomeHost(gen, peer);
    });
    peer.on('error', (err) => {
      if (gen !== floorGen || settled) return;
      const type = err && err.type;
      if (type === 'unavailable-id' || type === 'network' || type === 'server-error' || type === 'socket-error') asGuest();
    });
  };
  const start = () => scan(0);
  if (window.Peer) start();
  else {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs/peerjs.min.js';
    s.onload = () => { if (window.Peer) start(); };
    document.head.appendChild(s);
  }
}
addEventListener('beforeunload', () => { if (mySlot) send({ kind: 'gone', id: myId }); });
claim();

const clock = new THREE.Clock();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  for (const row of people.values()) if (row.avatar) tickAvatar(row.avatar, dt, t, reduced);
  if (rollUntil) {
    const left = rollUntil - performance.now();
    if (left > 0) die.rotation.set(t * 9, t * 7, t * 5);
    else { die.rotation.set(0, 0.4, 0); rollUntil = 0; }
  }
  controls.update();
  const w = innerWidth, h = innerHeight;
  for (const row of people.values()) {
    const seat = seats[row.slot - 1];
    if (!seat) continue;
    _pt.set(seat.x, 1.65, seat.z).project(camera);
    row.el.hidden = _pt.z > 1;
    row.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
    row.el.style.top = ((1 - _pt.y) / 2 * h) + 'px';
  }
  renderer.render(scene, camera);
});
