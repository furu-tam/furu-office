import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCharacter, clampLook, disposeAvatar, lookSig, randomLook, tickAvatar } from './avatar.js';
import { bootWolf } from './wolf-game.js?v=7';

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

const people = new Map();
const peopleRoot = new THREE.Group();
scene.add(peopleRoot);
const facesEl = $('faces');
const _pt = new THREE.Vector3();

let mySlot = 0;
let wolfPhase = 'lobby';
let lastSeat = -2;
const looks = new Map();
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
function lookFor(key, isMe) {
  if (isMe) {
    const saved = myLook();
    if (saved) return saved;
    key = 'me';
  }
  if (!looks.has(key)) looks.set(key, randomLook());
  return looks.get(key);
}
function dropRowBody(row) {
  if (!row.body) return;
  disposeAvatar(row.body);
  row.body = null;
  row.avatar = null;
}
const MIC_HTML = '<span class="mic" hidden aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.3-3A5.3 5.3 0 0 1 12 16.2 5.3 5.3 0 0 1 6.7 11H5a7 7 0 0 0 6 6.7V21h2v-3.3A7 7 0 0 0 19 11h-1.7z"/></svg><i></i><i></i><i></i></span>';
function ensureName(el) {
  if (el.querySelector('.nm')) return;
  el.textContent = '';
  el.insertAdjacentHTML('afterbegin', MIC_HTML);
  const nm = document.createElement('span');
  nm.className = 'nm';
  el.appendChild(nm);
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
  mic.querySelectorAll('i').forEach((bar, i) => {
    const wobble = speaking && !reduced ? 0.12 * Math.sin(t * (8 + i * 2) + i) : 0;
    bar.style.transform = 'scaleY(' + Math.max(0.22, Math.min(1, 0.25 + shape[i] * lift + wobble * lift)).toFixed(3) + ')';
  });
  const svg = mic.querySelector('svg');
  if (svg) svg.style.transform = 'scale(' + (1 + lift * 0.16).toFixed(3) + ')';
}
function upsertSeat(slot, info) {
  let row = people.get(slot);
  if (!row) {
    const el = document.createElement('div');
    el.className = 'who';
    facesEl.appendChild(el);
    row = { slot, el };
    people.set(slot, row);
  }
  const name = String(info.name || 'Bạn').slice(0, 24);
  const look = lookFor(slot + ':' + name, !!info.you);
  const sig = lookSig(look);
  row.name = name;
  row.alive = info.alive !== false;
  row.slot = slot;
  let label = name + (info.you ? ' · bạn' : '');
  if (!row.alive) label += ' · đã chết';
  else if (wolfPhase === 'vote' && info.votes) label += ' · ' + info.votes + ' phiếu';
  ensureName(row.el);
  row.el.querySelector('.nm').textContent = label;
  row.el.classList.toggle('me', !!info.you);
  row.el.classList.toggle('dead', !row.alive);
  if (!row.body || sig !== row.lookSig) {
    dropRowBody(row);
    const seat = seats[slot - 1];
    const g = new THREE.Group();
    g.position.set(seat.x, 0, seat.z);
    g.rotation.y = seat.yaw;
    const avatar = buildCharacter(look);
    avatar.root.position.z = -0.05;
    g.add(avatar.root);
    peopleRoot.add(g);
    row.body = g;
    row.avatar = avatar;
    row.lookSig = sig;
  }
  row.body.rotation.z = row.alive ? 0 : 0.18;
  row.body.position.y = row.alive ? 0 : -0.08;
}
function removeSeat(slot) {
  const row = people.get(slot);
  if (!row) return;
  dropRowBody(row);
  row.el.remove();
  people.delete(slot);
}
function sitCamera(slot) {
  const seat = seats[slot - 1];
  const s = Math.sin(seat.yaw);
  const c = Math.cos(seat.yaw);
  camera.position.set(seat.x - s * 1.7, 1.65, seat.z - c * 1.7);
  controls.target.set(0, 0.85, 0);
}
function applyWolf(state) {
  wolfPhase = state.phase || 'lobby';
  const live = new Set();
  (state.slots || []).forEach((info, i) => {
    if (!info || info.type === 'empty') return;
    const slot = i + 1;
    live.add(slot);
    upsertSeat(slot, info);
  });
  for (const slot of [...people.keys()]) if (!live.has(slot)) removeSeat(slot);
  const seat = state.mySeat;
  mySlot = seat >= 0 ? seat + 1 : 0;
  if (seat !== lastSeat) {
    lastSeat = seat;
    if (mySlot) sitCamera(mySlot);
    else {
      camera.position.set(0.2, 6.4, 7.6);
      controls.target.set(0, 0.8, 0);
    }
  }
  $('btnSit').hidden = mySlot > 0;
  $('btnLeave').hidden = !mySlot;
  const hints = {
    lobby: mySlot ? 'Ghế ' + mySlot + '/20 · đủ 5 người thì bắt đầu ván' : 'Bấm một ghế để ngồi chơi ma sói',
    night: 'Đêm ' + (state.round || 1) + ' · chọn người trên ghế hoặc trong bảng',
    day: 'Ngày ' + (state.round || 1) + ' · thảo luận trong bảng, rồi bỏ phiếu',
    vote: 'Bấm ghế của người bạn muốn treo cổ',
    hunter: 'Thợ săn chọn một người để bắn',
    ended: 'Ván kết thúc · bấm Ván mới trong bảng ma sói',
  };
  $('hint').textContent = state.gm || hints[wolfPhase] || hints.lobby;
  scene.background.set(state.night ? 0x070b16 : 0x0b2233);
  sun.intensity = state.night ? 0.28 : 1.6;
}
try {
  const saved = localStorage.getItem('furu-office-name');
  if (saved) $('nameInput').value = saved;
} catch (e) {}
const wolf = bootWolf(applyWolf);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down = null;
  if (dx * dx + dy * dy > 36) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickers, false)[0];
  if (hit) wolf.clickSeat(hit.object.userData.slot - 1);
});
$('btnSit').addEventListener('click', () => wolf.joinFirst());
$('btnLeave').addEventListener('click', () => wolf.leave());
$('btnWolf').addEventListener('click', () => {
  const panel = $('wolf');
  panel.hidden = !panel.hidden;
  $('btnWolf').setAttribute('aria-pressed', panel.hidden ? 'false' : 'true');
});
$('btnInvite').addEventListener('click', async () => {
  const url = new URL(location.href);
  const soi = url.searchParams.get('soi');
  url.search = '';
  url.hash = '';
  if (soi) url.searchParams.set('soi', soi);
  const text = url.toString();
  try { await navigator.clipboard.writeText(text); toast('Đã chép link mời. Bạn bè mở link là vào cùng bàn ma sói.'); }
  catch (e) { toast(text); }
});
$('nameInput').addEventListener('change', () => {
  try { localStorage.setItem('furu-office-name', $('nameInput').value.trim()); } catch (e) {}
});

const clock = new THREE.Clock();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  for (const row of people.values()) if (row.avatar && row.alive) tickAvatar(row.avatar, dt, t, reduced);
  const talk = wolf.talking();
  const heard = new Set();
  for (const row of talk) {
    heard.add(row.seat);
    const who = people.get(row.seat);
    if (who) setTalking(who.el, row.level, row.live);
    if (row.seat === mySlot) setTalking($('btnMic'), row.level, row.live);
  }
  for (const row of people.values()) if (!heard.has(row.slot)) setTalking(row.el, 0, false);
  if (!heard.has(mySlot)) setTalking($('btnMic'), 0, false);
  controls.update();
  const w = innerWidth, h = innerHeight;
  for (const row of people.values()) {
    const seat = seats[row.slot - 1];
    if (!seat) continue;
    _pt.set(seat.x, row.alive ? 1.65 : 1.15, seat.z).project(camera);
    row.el.hidden = _pt.z > 1;
    row.el.style.left = ((_pt.x + 1) / 2 * w) + 'px';
    row.el.style.top = ((1 - _pt.y) / 2 * h) + 'px';
  }
  renderer.render(scene, camera);
});
