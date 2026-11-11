import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SHIRT = ['#169e8f', '#ff7a55', '#2f63ad', '#f5b544', '#e3ecef', '#7a4fc2', '#26333a', '#e0465e', '#1f2d4f'];
const SHIRT_N = ['Xanh ngọc', 'Cam', 'Xanh dương', 'Vàng', 'Trắng', 'Tím', 'Than', 'Đỏ hồng', 'Xanh navy'];
const SKIN = ['#f5c9a3', '#dca07a', '#b9744f', '#8a5638', '#5e3a26'];
const SKIN_N = ['Sáng', 'Trung bình sáng', 'Ngăm', 'Nâu', 'Nâu đậm'];
const HAIR = ['#1c1714', '#3d2418', '#141010', '#8a5a2b', '#d9b26a', '#b8462e', '#9aa3ab', '#3f6fd1'];
const HAIR_N = ['Đen', 'Nâu đậm', 'Đen tuyền', 'Nâu hạt dẻ', 'Vàng', 'Đỏ', 'Bạc', 'Xanh'];
const PANTS = ['#22333a', '#334452', '#5a4434', '#1f2d4f', '#c9c1b0'];
const PANTS_N = ['Xanh than', 'Xám xanh', 'Nâu', 'Jean', 'Kaki'];
const ACC = ['#e0465e', '#2fd0c0', '#f5b544', '#2f63ad', '#f2f2ef', '#1f2428'];
const ACC_N = ['Đỏ', 'Xanh ngọc', 'Vàng', 'Xanh dương', 'Trắng', 'Đen'];

export const ROWS = [
  { key: 'gender', label: 'Giới tính', type: 'seg', focus: 'full', opts: [['nam', 'Nam'], ['nu', 'Nữ']] },
  { key: 'face', label: 'Khuôn mặt', type: 'seg', focus: 'face', opts: [['hien', 'Hiền'], ['vui', 'Vui vẻ'], ['nghiem', 'Nghiêm'], ['ngac', 'Ngạc nhiên'], ['nhay', 'Nháy mắt'], ['ngau', 'Ngầu'], ['ngu', 'Buồn ngủ']] },
  { key: 'hair', label: 'Kiểu tóc', type: 'seg', focus: 'face', opts: [['ngan', 'Ngắn'], ['dinh', 'Đầu đinh'], ['lech', 'Mái lệch'], ['xoan', 'Xoăn'], ['dai', 'Dài'], ['duoi', 'Đuôi ngựa'], ['bui', 'Búi'], ['hoi', 'Hói'], ['troc', 'Trọc']] },
  { key: 'hairColor', label: 'Màu tóc', type: 'swatch', focus: 'face', colors: HAIR, names: HAIR_N },
  { key: 'skin', label: 'Da', type: 'swatch', focus: 'face', colors: SKIN, names: SKIN_N },
  { key: 'top', label: 'Kiểu áo', type: 'seg', focus: 'full', opts: [['thun', 'Áo thun'], ['polo', 'Polo'], ['hoodie', 'Hoodie'], ['vest', 'Vest']] },
  { key: 'shirt', label: 'Áo', type: 'swatch', focus: 'full', colors: SHIRT, names: SHIRT_N },
  { key: 'pants', label: 'Quần', type: 'swatch', focus: 'full', colors: PANTS, names: PANTS_N },
  { key: 'acc', label: 'Phụ kiện', type: 'multi', focus: 'face', opts: [['tainghe', 'Tai nghe'], ['kinhram', 'Kính râm'], ['kinhcan', 'Kính cận'], ['luoitrai', 'Mũ lưỡi trai'], ['len', 'Mũ len'], ['caphe', 'Ly cà phê'], ['dongho', 'Đồng hồ'], ['bongtai', 'Bông tai'], ['tuixeo', 'Túi đeo']] },
  { key: 'accColor', label: 'Màu phụ kiện', type: 'swatch', focus: 'face', colors: ACC, names: ACC_N },
];
export const EXCL = [['kinhram', 'kinhcan'], ['luoitrai', 'len']];
export const BODY_ACC = new Set(['caphe', 'dongho', 'tuixeo']);

export function freshLook() {
  return { v: 2, gender: 'nam', face: 'hien', hair: 'ngan', hairColor: 1, skin: 2, top: 'thun', shirt: 2, pants: 0, acc: [], accColor: 1 };
}
function exclusive(list) {
  const out = [];
  for (const item of list) {
    const group = EXCL.find((g) => g.includes(item));
    if (group) for (const other of group) {
      const at = out.indexOf(other);
      if (at >= 0) out.splice(at, 1);
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}
function readLook(raw, strict) {
  if (!raw || typeof raw !== 'object') return null;
  const look = freshLook();
  let seen = false;
  for (const row of ROWS) {
    const value = raw[row.key];
    if (row.type === 'seg' && row.opts.some((o) => o[0] === value)) { look[row.key] = value; seen = true; }
    else if (row.type === 'swatch' && Number.isInteger(value) && value >= 0 && value < row.colors.length) { look[row.key] = value; seen = true; }
    else if (row.type === 'multi' && Array.isArray(value)) {
      look[row.key] = exclusive(value.filter((item) => row.opts.some((o) => o[0] === item)));
      if (look[row.key].length) seen = true;
    } else if (strict) return null;
  }
  return !strict || seen ? look : null;
}
export function normalizeLook(raw) { return readLook(raw, true); }
export function clampLook(raw) {
  if (!raw || typeof raw !== 'object' || !ROWS.some((row) => raw[row.key] != null)) return null;
  return readLook(raw, false);
}
export function lookSig(look) {
  if (!look) return '';
  return JSON.stringify([look.gender, look.face, look.hair, look.hairColor, look.skin, look.top, look.shirt, look.pants, look.accColor, look.acc]);
}
export function randomLook() {
  const look = freshLook();
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  for (const row of ROWS) {
    if (row.type === 'seg') look[row.key] = pick(row.opts)[0];
    if (row.type === 'swatch') look[row.key] = Math.floor(Math.random() * row.colors.length);
  }
  const pool = ROWS.find((row) => row.key === 'acc').opts.map((o) => o[0]).sort(() => Math.random() - 0.5);
  look.acc = exclusive(pool.slice(0, Math.floor(Math.random() * 3)));
  return look;
}

const HEAD_Y = 1.36;
const R = 0.22;
const whiteBasic = new THREE.MeshBasicMaterial({ color: 0xffffff });
const keepMat = new Set([whiteBasic]);

export function disposeAvatar(root) {
  const seen = new Set();
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    const list = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    for (const material of list) {
      if (!material || keepMat.has(material) || seen.has(material)) continue;
      seen.add(material);
      if (material.map) material.map.dispose();
      material.dispose();
    }
  });
  if (root.parent) root.parent.remove(root);
}

const mat = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, ...extra });
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
function mk(geo, material, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
// Gộp các mesh anh em cùng material trong mỗi group -> ít draw call hơn mà
// vẫn giữ khớp nối (chỉ merge trong cùng parent; torso/head/legs/blink vẫn
// là group riêng animate được). Mesh nhỏ hơn SHADOW_MIN_R không đổ bóng.
const SHADOW_MIN_R = 0.07;
function mergeSiblingMeshes(group) {
  const buckets = new Map();
  for (const child of group.children) {
    if (!child.isMesh || child.isSkinnedMesh || Array.isArray(child.material)) continue;
    const key = child.material.uuid + '|' + (child.castShadow ? 1 : 0) + (child.receiveShadow ? 2 : 0);
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { m: child.material, cast: child.castShadow, recv: child.receiveShadow, list: [] });
    b.list.push(child);
  }
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = [];
    for (const mesh of b.list) {
      mesh.updateMatrix();
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const out = new THREE.Mesh(merged, b.m);
    out.castShadow = b.cast;
    out.receiveShadow = b.recv;
    for (const mesh of b.list) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    group.add(out);
  }
}
function optimizeAvatar(root) {
  if (new URLSearchParams(location.search).has('nomerge')) return; // A/B benchmark
  root.traverse((n) => {
    if (!n.isMesh || !n.castShadow) return;
    if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere();
    if (n.geometry.boundingSphere.radius * Math.max(n.scale.x, n.scale.y, n.scale.z) < SHADOW_MIN_R) n.castShadow = false;
  });
  const nodes = [];
  root.traverse((n) => { if (!n.isMesh && !n.isSprite) nodes.push(n); });
  for (const g of nodes) mergeSiblingMeshes(g);
}
const fz = (x, y) => 0.96 * R * Math.sqrt(Math.max(0, 1 - (x / R) ** 2 - (y / (1.02 * R)) ** 2));
function place(obj, x, y, off = 0.003) {
  obj.position.set(x, y, fz(x, y) + off);
  obj.rotation.set(-Math.asin(y / R) * 0.9, Math.asin(x / R) * 0.9, 0);
  return obj;
}
function textSprite(text, w, h, font, color, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (next) => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, h / 2 - 4);
      g.fill();
      g.strokeStyle = 'rgba(47,208,192,0.6)';
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(next, w / 2, h / 2 + 2);
    tex.needsUpdate = true;
  };
  draw(text);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.userData.draw = draw;
  return sprite;
}

export function buildCharacter(look, stance = 'seat') {
  const S = clampLook(look) || freshLook();
  const female = S.gender === 'nu';
  const has = (key) => S.acc.includes(key);
  const hat = has('luoitrai') || has('len');
  const skin = SKIN[S.skin];
  const hairC = HAIR[S.hairColor];
  const shirtC = SHIRT[S.shirt];
  const accC = ACC[S.accColor];
  const M = {
    skin: mat(skin, 0.55), skinD: mat(shade(skin, 0.86), 0.6),
    hair: mat(hairC, 0.85, { side: THREE.DoubleSide }), brow: mat(shade(hairC, 0.8), 0.8),
    shirt: mat(shirtC, 0.78), shirtD: mat(shade(shirtC, 0.78), 0.8), jacket: mat(shirtC, 0.7, { side: THREE.DoubleSide }),
    pants: mat(PANTS[S.pants], 0.85), shoe: mat('#1b1d20', 0.45), white: mat('#eef1ef', 0.7),
    dark: mat('#1b1512', 0.35), mouth: mat(female ? '#b84a5e' : '#6a2c28', 0.55), inMouth: mat('#4a1a1e', 0.8, { side: THREE.DoubleSide }),
    acc: mat(accC, 0.55), accSoft: mat(accC, 0.9, { side: THREE.DoubleSide }), black: mat('#16191c', 0.4),
    lens: mat('#0a0d10', 0.08, { metalness: 0.6 }), gold: mat('#e2b85a', 0.25, { metalness: 0.9 }),
    glow: new THREE.MeshStandardMaterial({ color: accC, emissive: new THREE.Color(accC), emissiveIntensity: 1.2 }),
  };
  const root = new THREE.Group();
  const standing = stance === 'stand';
  const out = { root, blink: [], zs: [], legs: [], blinkT: 2 + Math.random() * 2, phase: Math.random() * Math.PI * 2 };

  if (standing) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.11, 0.86, 0);
      root.add(pivot);
      mk(new THREE.CapsuleGeometry(0.082, 0.62, 6, 14), M.pants, pivot, 0, -0.4, 0);
      mk(new THREE.SphereGeometry(0.09, 18, 12), M.shoe, pivot, 0, -0.79, 0.05).scale.set(1, 0.55, 1.5);
      out.legs.push(pivot);
    }
    mk(new THREE.SphereGeometry(0.2, 24, 16), M.pants, root, 0, 0.9, 0).scale.set(female ? 1.0 : 1.05, 0.55, 0.95);
  } else {
    for (const s of [-1, 1]) {
      mk(new THREE.CapsuleGeometry(0.085, 0.3, 6, 14), M.pants, root, s * 0.11, 0.56, 0.17).rotation.x = Math.PI / 2;
      mk(new THREE.CapsuleGeometry(0.075, 0.3, 6, 14), M.pants, root, s * 0.11, 0.32, 0.38);
      mk(new THREE.SphereGeometry(0.09, 18, 12), M.shoe, root, s * 0.11, 0.06, 0.43).scale.set(1, 0.55, 1.5);
    }
    mk(new THREE.SphereGeometry(0.2, 24, 16), M.pants, root, 0, 0.56, 0).scale.set(female ? 1.0 : 1.05, 0.55, 0.95);
  }

  const torso = new THREE.Group();
  torso.position.y = standing ? 0.92 : 0.56;
  out.torsoY = torso.position.y;
  root.add(torso);
  out.torso = torso;
  const sx = female ? 0.97 : 1.12;
  const sz = 0.85;
  mk(new THREE.CapsuleGeometry(0.2, 0.28, 8, 28), S.top === 'vest' ? M.white : M.shirt, torso, 0, 0.26, 0).scale.set(sx, 1, sz);
  mk(new THREE.CylinderGeometry(0.068, 0.075, 0.16, 18), M.skin, torso, 0, 0.6, 0);
  if (S.top === 'thun') {
    mk(new THREE.TorusGeometry(0.082, 0.018, 8, 24), M.shirtD, torso, 0, 0.56, 0).rotation.x = Math.PI / 2;
  } else if (S.top === 'polo') {
    mk(new THREE.CylinderGeometry(0.085, 0.093, 0.05, 20), M.shirtD, torso, 0, 0.55, 0);                    // cổ áo đứng
    mk(new THREE.BoxGeometry(0.045, 0.15, 0.014), M.shirtD, torso, 0, 0.45, 0.175);                         // lược áo
    for (const s of [-1, 1]) {
      const flap = mk(new THREE.BoxGeometry(0.075, 0.06, 0.014), M.shirtD, torso, s * 0.058, 0.53, 0.16);   // 2 ve cổ
      flap.rotation.set(0.18, s * 0.3, s * 0.45);
    }
    for (const y of [0.47, 0.41]) mk(new THREE.SphereGeometry(0.009, 8, 6), M.white, torso, 0, y, 0.185);   // cúc
  } else if (S.top === 'hoodie') {
    const hood = mk(new THREE.TorusGeometry(0.15, 0.06, 10, 28), M.shirt, torso, 0, 0.56, -0.03);
    hood.rotation.x = Math.PI / 2;
    hood.scale.set(sx * 0.95, 0.9, 1);
    mk(new THREE.BoxGeometry(0.26, 0.1, 0.03), M.shirtD, torso, 0, 0.18, 0.175);
    for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), M.white, torso, s * 0.04, 0.45, 0.17);
  } else {
    const GAP = 0.42;
    const jacket = new THREE.Group();
    jacket.scale.set(sx * 1.05, 1, sz * 1.08);
    torso.add(jacket);
    mk(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 36, 1, true, GAP, Math.PI * 2 - GAP * 2), M.jacket, jacket, 0, 0.26, 0);
    mk(new THREE.SphereGeometry(0.2, 36, 10, Math.PI / 2 + GAP, Math.PI * 2 - GAP * 2, 0, Math.PI / 2), M.jacket, jacket, 0, 0.4, 0);
    mk(new THREE.SphereGeometry(0.2, 36, 10, Math.PI / 2 + GAP, Math.PI * 2 - GAP * 2, Math.PI / 2, Math.PI / 2), M.jacket, jacket, 0, 0.12, 0);
    for (const s of [-1, 1]) {
      const lapel = mk(new THREE.BoxGeometry(0.07, 0.2, 0.012), M.shirtD, jacket, s * 0.075, 0.42, 0.185);
      lapel.rotation.set(0, s * 0.3, s * 0.35);
    }
    mk(new THREE.BoxGeometry(0.045, 0.24, 0.012), M.black, torso, 0, 0.36, 0.172);
    mk(new THREE.SphereGeometry(0.014, 8, 6), M.dark, jacket, 0, 0.17, 0.2);
  }

  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * (0.2 * sx + 0.045), 0.5, 0);
    torso.add(shoulder);
    const sleeve = S.top === 'vest' ? M.jacket : M.shirt;
    const shortSleeve = S.top === 'thun' || S.top === 'polo';
    mk(new THREE.SphereGeometry(0.076, 16, 12), sleeve, shoulder);
    if (shortSleeve) {
      mk(new THREE.CapsuleGeometry(0.079, 0.08, 6, 14), sleeve, shoulder, 0, -0.06, 0);
      mk(new THREE.CapsuleGeometry(0.064, 0.2, 6, 14), M.skin, shoulder, 0, -0.16, 0);
    } else mk(new THREE.CapsuleGeometry(0.072, 0.2, 6, 14), sleeve, shoulder, 0, -0.15, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.rotation.set(0.25, -s * 0.3, 0);
    shoulder.add(elbow);
    mk(new THREE.CapsuleGeometry(0.062, 0.18, 6, 14), shortSleeve ? M.skin : sleeve, elbow, 0, 0, 0.11).rotation.x = Math.PI / 2;
    if (!shortSleeve) mk(new THREE.CylinderGeometry(0.066, 0.066, 0.03, 16), M.shirtD, elbow, 0, 0, 0.2).rotation.x = Math.PI / 2;
    mk(new THREE.SphereGeometry(0.068, 16, 12), M.skin, elbow, 0, 0, 0.26).scale.set(0.9, 0.8, 1.1);
    if (s < 0 && has('caphe')) {
      const cup = new THREE.Group();
      cup.position.set(0, 0.075, 0.26);
      elbow.add(cup);
      mk(new THREE.CylinderGeometry(0.045, 0.036, 0.11, 18), M.white, cup);
      mk(new THREE.CylinderGeometry(0.047, 0.042, 0.04, 18), mat('#8a5a36', 0.9), cup, 0, -0.005, 0);
      mk(new THREE.CylinderGeometry(0.048, 0.048, 0.016, 18), M.acc, cup, 0, 0.062, 0);
    }
    if (s > 0 && has('dongho')) {
      mk(new THREE.TorusGeometry(0.066, 0.014, 8, 22), M.black, elbow, 0, 0, 0.2);
      mk(new THREE.BoxGeometry(0.04, 0.014, 0.045), M.glow, elbow, 0, 0.072, 0.2);
    }
  }

  if (has('tuixeo')) {
    const strap = mk(new THREE.BoxGeometry(0.055, 0.68, 0.016), M.acc, torso, -0.02, 0.24, 0.155);
    strap.rotation.z = 0.55; strap.rotation.y = -0.1;
    mk(new THREE.BoxGeometry(0.21, 0.15, 0.08), M.acc, torso, -0.26, -0.04, 0.1).rotation.y = 0.35;
    mk(new THREE.BoxGeometry(0.21, 0.05, 0.081), M.accSoft, torso, -0.26, 0.02, 0.1).rotation.y = 0.35;
  }

  const head = new THREE.Group();
  head.position.set(0, standing ? HEAD_Y + 0.28 : HEAD_Y, 0);
  out.headY = head.position.y;
  root.add(head);
  out.head = head;
  mk(new THREE.SphereGeometry(R, 44, 30), M.skin, head).scale.set(1, 1.02, 0.96);
  for (const s of [-1, 1]) mk(new THREE.SphereGeometry(0.055, 16, 12), M.skinD, head, s * 0.215, -0.01, -0.01).scale.set(0.45, 1, 0.75);
  place(mk(new THREE.SphereGeometry(0.03, 14, 10), M.skinD, head), 0, -0.025, 0.004).scale.set(1.1, 0.9, 0.9);

  const faces = {
    hien: { eyes: 'dot', brow: [0, 0.02], mouth: 'smile', blush: 0.18 },
    vui: { eyes: 'arc', brow: [0.015, -0.12], mouth: 'grin', blush: 0.35 },
    nghiem: { eyes: 'lid', brow: [-0.01, 0.32], mouth: 'frown', blush: 0 },
    ngac: { eyes: 'big', brow: [0.03, -0.14], mouth: 'O', blush: 0.1 },
    nhay: { eyes: 'wink', brow: [0.01, -0.05], mouth: 'smirk', blush: 0.3 },
    ngau: { eyes: 'lid', brow: 'cool', mouth: 'smirk', blush: 0 },
    ngu: { eyes: 'line', brow: [-0.012, 0.04], mouth: 'smallO', blush: 0.12 },
  };
  const F = faces[S.face] || faces.hien;
  const EY = 0.02;
  const EX = 0.075;
  const eyeDot = (x, k = 1) => {
    const g = place(new THREE.Group(), x, EY, 0);
    head.add(g);
    mk(new THREE.SphereGeometry(0.028, 16, 12), M.dark, g).scale.set(1, 1.2 * k, 0.55);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.008 * k, 8, 6), whiteBasic);
    hl.position.set(0.009, 0.012 * k, 0.014);
    g.add(hl);
    out.blink.push(g);
  };
  const eyeArc = (x) => place(mk(new THREE.TorusGeometry(0.027, 0.008, 6, 16, Math.PI), M.dark, head), x, EY, 0.004);
  const eyeLine = (x) => {
    const line = place(mk(new THREE.CapsuleGeometry(0.007, 0.04, 4, 8), M.dark, head), x, EY - 0.006, 0.004);
    line.rotation.z = Math.PI / 2;
  };
  const lid = (x) => place(mk(new THREE.SphereGeometry(0.034, 16, 10), M.skin, head), x, EY + 0.018, 0.007).scale.set(1.15, 0.55, 0.7);
  for (const s of [-1, 1]) {
    const x = s * EX;
    if (F.eyes === 'dot' || F.eyes === 'lid') eyeDot(x);
    if (F.eyes === 'big') eyeDot(x, 1.35);
    if (F.eyes === 'lid') lid(x);
    if (F.eyes === 'arc') eyeArc(x);
    if (F.eyes === 'line') eyeLine(x);
    if (F.eyes === 'wink') (s < 0 ? eyeDot(x) : eyeArc(x));
    const open = ['dot', 'lid', 'big'].includes(F.eyes) || (F.eyes === 'wink' && s < 0);
    if (female && open) for (let k = 0; k < 2; k++) {
      const lash = place(mk(new THREE.CapsuleGeometry(0.004, 0.02, 3, 6), M.dark, head), x + s * (0.022 + k * 0.01), EY + 0.03 - k * 0.006, 0.004);
      lash.rotation.z = -s * (0.6 + k * 0.4);
    }
    let dy;
    let angle;
    if (F.brow === 'cool') { dy = s > 0 ? 0.022 : -0.004; angle = s > 0 ? -0.12 : 0.22; }
    else [dy, angle] = F.brow;
    const brow = place(mk(new THREE.CapsuleGeometry(female ? 0.007 : 0.01, 0.05, 4, 8), M.brow, head), x, 0.088 + dy, 0.006);
    brow.rotation.z = Math.PI / 2 + s * angle;
    if (F.blush) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), new THREE.MeshBasicMaterial({ color: 0xff7d8a, transparent: true, opacity: F.blush, depthWrite: false }));
      place(blush, s * 0.12, -0.055, 0.004);
      head.add(blush);
    }
  }
  const mouth = place(new THREE.Group(), 0, -0.09, 0.004);
  head.add(mouth);
  if (F.mouth === 'smile') {
    const smile = mk(new THREE.TorusGeometry(0.042, 0.009, 6, 20, Math.PI), M.mouth, mouth);
    smile.rotation.z = Math.PI;
    smile.scale.y = 0.65;
  }
  if (F.mouth === 'grin') {
    const grin = new THREE.Group();
    grin.scale.set(1.15, 0.85, 1);
    mouth.add(grin);
    mk(new THREE.CircleGeometry(0.05, 24, Math.PI, Math.PI), M.inMouth, grin);
    const teeth = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.016), M.white);
    teeth.position.set(0, -0.009, 0.001);
    grin.add(teeth);
    mk(new THREE.TorusGeometry(0.05, 0.008, 6, 20, Math.PI), M.mouth, grin).rotation.z = Math.PI;
    mk(new THREE.CapsuleGeometry(0.006, 0.09, 3, 6), M.mouth, grin).rotation.z = Math.PI / 2;
  }
  if (F.mouth === 'frown') {
    const frown = mk(new THREE.TorusGeometry(0.038, 0.008, 6, 16, Math.PI), M.mouth, mouth);
    frown.scale.y = 0.35;
    frown.position.y = -0.008;
  }
  if (F.mouth === 'O') {
    mk(new THREE.TorusGeometry(0.02, 0.008, 8, 20), M.mouth, mouth);
    mk(new THREE.CircleGeometry(0.02, 20), M.inMouth, mouth);
  }
  if (F.mouth === 'smallO') {
    mk(new THREE.TorusGeometry(0.011, 0.006, 8, 16), M.mouth, mouth);
    mk(new THREE.CircleGeometry(0.011, 16), M.inMouth, mouth);
  }
  if (F.mouth === 'smirk') {
    const smirk = mk(new THREE.TorusGeometry(0.04, 0.008, 6, 16, Math.PI * 0.75), M.mouth, mouth);
    smirk.rotation.z = Math.PI * 1.12;
    smirk.scale.y = 0.6;
    smirk.position.x = 0.01;
  }
  if (S.face === 'ngu') for (let i = 0; i < 3; i++) {
    const zed = textSprite('z', 64, 64, '700 52px "Be Vietnam Pro", sans-serif', '#bfeee8', null);
    zed.scale.setScalar(0.07 + i * 0.025);
    root.add(zed);
    out.zs.push({ z: zed, ph: i / 3 });
  }

  const hs = (radius, t0, t1, p0 = 0, sweep = Math.PI * 2) => {
    const mesh = mk(new THREE.SphereGeometry(radius, 40, 16, p0, sweep, t0, t1 - t0), M.hair, head);
    mesh.scale.set(1, 1.02, 0.96);
    return mesh;
  };
  const capH = (radius, tEnd) => hs(radius, 0, tEnd);
  const band = (radius, t0, t1, extra) => hs(radius, t0, t1, Math.PI - extra, Math.PI + 2 * extra);
  const onSphere = (radius, th, ph) => new THREE.Vector3(-radius * Math.cos(ph) * Math.sin(th), radius * Math.cos(th) * 1.02, radius * Math.sin(ph) * Math.sin(th) * 0.96);
  const P = Math.PI;
  switch (S.hair) {
    case 'dinh': capH(R * 1.012, 0.35 * P); band(R * 1.012, 0.3 * P, 0.6 * P, 0.3); break;
    case 'ngan':
      capH(R * 1.045, 0.34 * P); band(R * 1.045, 0.3 * P, 0.64 * P, 0.35);
      if (!hat) for (const a of [-0.7, -0.35, 0, 0.35, 0.7]) {
        const bang = mk(new THREE.SphereGeometry(0.06, 14, 10), M.hair, head);
        bang.position.copy(onSphere(R * 1.02, 0.34 * P, P / 2 + a));
        bang.scale.set(1.1, 0.6, 0.7);
      }
      break;
    case 'lech':
      capH(R * 1.05, 0.34 * P); band(R * 1.05, 0.3 * P, 0.64 * P, 0.35);
      if (!hat) {
        const sweep = mk(new THREE.SphereGeometry(0.13, 20, 14), M.hair, head, -0.05, 0.165, 0.1);
        sweep.scale.set(1.5, 0.5, 1);
        sweep.rotation.z = 0.3;
      }
      break;
    case 'xoan': {
      const count = 160;
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / count) * 1.6;
        const rad = Math.sqrt(1 - y * y);
        const ph = i * 2.39996;
        const d = new THREE.Vector3(Math.cos(ph) * rad, y, Math.sin(ph) * rad);
        const keep = hat ? (y < 0.38 && d.z < 0.2 && y > -0.45) : (d.z > 0.25 ? y > 0.45 : y > -0.45);
        if (!keep) continue;
        const curl = mk(new THREE.SphereGeometry(0.068, 10, 8), M.hair, head);
        curl.position.set(d.x * R, d.y * R * 1.02, d.z * R * 0.96);
      }
      break;
    }
    case 'dai':
      capH(R * 1.05, 0.36 * P); band(R * 1.05, 0.3 * P, 0.7 * P, 0.5);
      mk(new THREE.CapsuleGeometry(0.2, 0.28, 8, 20), M.hair, head, 0, -0.22, -0.1).scale.set(1.22, 1.05, 0.62);
      for (const s of [-1, 1]) mk(new THREE.CapsuleGeometry(0.05, 0.28, 6, 12), M.hair, head, s * 0.2, -0.16, 0.05).rotation.z = s * 0.08;
      if (!hat) {
        const fringe = mk(new THREE.SphereGeometry(0.1, 18, 12), M.hair, head, 0.05, 0.17, 0.13);
        fringe.scale.set(1.4, 0.5, 0.8);
        fringe.rotation.z = -0.3;
      }
      break;
    case 'duoi':
    case 'bui':
      capH(R * 1.035, 0.36 * P); band(R * 1.035, 0.3 * P, 0.6 * P, 0.3);
      if (S.hair === 'duoi') {
        mk(new THREE.SphereGeometry(0.035, 12, 10), M.acc, head, 0, 0.06, -0.225);
        const tail = mk(new THREE.CapsuleGeometry(0.065, 0.22, 6, 12), M.hair, head, 0, -0.1, -0.28);
        tail.rotation.x = 0.35;
      } else if (!hat) {
        mk(new THREE.SphereGeometry(0.1, 20, 14), M.hair, head, 0, 0.2, -0.12);
        const tie = mk(new THREE.TorusGeometry(0.075, 0.014, 8, 20), M.acc, head, 0, 0.16, -0.1);
        tie.rotation.x = Math.PI / 2 + 0.5;
      }
      break;
    case 'hoi': band(R * 1.03, 0.33 * P, 0.62 * P, 0.55); break;
    default: break;
  }

  if (has('luoitrai')) {
    const radius = R * 1.1;
    const theta = 0.36 * P;
    hs(radius, 0, theta).material = M.acc;
    const visor = mk(new THREE.CylinderGeometry(0.16, 0.16, 0.014, 32, 1, false, -P / 2, P), M.acc, head, 0, radius * 1.02 * Math.cos(theta) - 0.004, 0.12);
    visor.rotation.x = 0.15;
    mk(new THREE.SphereGeometry(0.02, 10, 8), M.acc, head, 0, radius * 1.02 + 0.005, 0);
    const logo = mk(new THREE.SphereGeometry(0.028, 12, 8), M.gold, head, 0, radius * 0.72, radius * 0.66);
    logo.scale.set(1.15, 0.75, 0.3);
  }
  if (has('len')) {
    const radius = R * 1.1;
    const theta = 0.37 * P;
    hs(radius, 0, theta).material = M.accSoft;
    const rim = mk(new THREE.TorusGeometry(radius * Math.sin(theta), 0.028, 10, 40), M.accSoft, head, 0, radius * 1.02 * Math.cos(theta), 0);
    rim.rotation.x = P / 2;
    rim.scale.y = 0.96;
    mk(new THREE.SphereGeometry(0.06, 14, 10), M.accSoft, head, 0, radius * 1.02 + 0.04, 0);
  }
  if (has('tainghe')) {
    const bandR = hat ? R * 1.22 : R * 1.12;
    mk(new THREE.TorusGeometry(bandR, 0.018, 8, 40, P), M.black, head);
    for (const s of [-1, 1]) {
      mk(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 24), M.black, head, s * bandR, -0.01, 0).rotation.z = P / 2;
      mk(new THREE.TorusGeometry(0.05, 0.012, 8, 24), M.glow, head, s * (bandR + 0.032), -0.01, 0).rotation.y = P / 2;
    }
  }
  const glasses = (sun) => {
    const y = EY + 0.005;
    for (const s of [-1, 1]) {
      const x = s * EX;
      const z = fz(x, y) + 0.028;
      if (sun) {
        const lens = mk(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 28), M.lens, head, x, y, z);
        lens.rotation.order = 'YXZ';
        lens.rotation.set(P / 2, s * 0.2, 0);
        lens.scale.set(1.15, 1, 0.85);
      } else {
        const ring = mk(new THREE.TorusGeometry(0.043, 0.007, 8, 28), M.black, head, x, y, z);
        ring.rotation.y = s * 0.2;
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.042, 24), new THREE.MeshStandardMaterial({ color: 0xcfeff5, transparent: true, opacity: 0.18, roughness: 0.05 }));
        glass.position.set(x, y, z);
        glass.rotation.y = s * 0.2;
        head.add(glass);
      }
      const arm = mk(new THREE.BoxGeometry(0.01, 0.012, 0.234), M.black, head, s * 0.18, y + 0.01, 0.107);
      arm.rotation.y = -s * 0.41;
    }
    mk(new THREE.BoxGeometry(0.045, 0.01, 0.01), M.black, head, 0, y + 0.015, fz(0, y) + 0.03);
    if (sun) mk(new THREE.BoxGeometry(0.27, 0.012, 0.012), M.black, head, 0, y + 0.048, fz(0, y + 0.048) + 0.024);
  };
  if (has('kinhram')) glasses(true);
  if (has('kinhcan')) glasses(false);
  if (has('bongtai')) for (const s of [-1, 1]) mk(new THREE.SphereGeometry(0.016, 12, 10), M.gold, head, s * 0.222, -0.066, -0.005);
  optimizeAvatar(root);
  return out;
}

export function buildWalker(look) {
  return buildCharacter(look, 'stand');
}

export function tickAvatar(avatar, dt, t, reduced) {
  if (!avatar) return;
  const amp = reduced ? 0 : 1;
  const breath = Math.sin(t * 2 + avatar.phase) * 0.006 * amp;
  avatar.torso.position.y = (avatar.torsoY || 0.56) + breath;
  avatar.head.position.y = (avatar.headY || HEAD_Y) + breath;
  if (avatar.legs.length) {
    const sw = (avatar.walkAmt || 0) * 0.5;
    avatar.legs[0].rotation.x = Math.sin(t * 8 + avatar.phase) * sw;
    avatar.legs[1].rotation.x = Math.sin(t * 8 + avatar.phase + Math.PI) * sw;
  }
  avatar.head.rotation.y = Math.sin(t * 0.6 + avatar.phase) * 0.18 * amp;
  avatar.head.rotation.x = Math.sin(t * 0.4 + avatar.phase) * 0.04 * amp;
  avatar.blinkT -= dt;
  const closed = avatar.blinkT < 0;
  avatar.blink.forEach((g) => { g.scale.y = closed ? 0.12 : 1; });
  if (avatar.blinkT < -0.12) avatar.blinkT = 2 + Math.random() * 3;
  for (const zed of avatar.zs) {
    const u = (t * 0.35 + zed.ph) % 1;
    zed.z.position.set(0.2 + u * 0.12, (avatar.headY || HEAD_Y) + 0.22 + u * 0.3, 0.05);
    zed.z.material.opacity = Math.sin(u * Math.PI);
  }
}

export function createPreview(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  camera.position.set(1.4, 1.45, 3.0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.92, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.7;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.enablePan = false;
  controls.autoRotateSpeed = 2.4;
  scene.add(new THREE.HemisphereLight(0xcfeff0, 0x1d2a2c, 0.75));
  const key = new THREE.DirectionalLight(0xfff2e4, 2.0);
  key.position.set(1.6, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.2, near: 0.5, far: 8 });
  key.shadow.bias = -0.0006;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5fe6d6, 1.3);
  rim.position.set(-2, 1.8, -2.2);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 64), mat('#0e2c33', 0.95));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.75, 64), new THREE.MeshBasicMaterial({ color: 0x2fd0c0, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
  const chair = mat('#252c31', 0.55);
  const chrome = mat('#9aa4aa', 0.25, { metalness: 0.8 });
  mk(new THREE.BoxGeometry(0.58, 0.08, 0.54), chair, scene, 0, 0.44, 0.02);
  const back = mk(new THREE.BoxGeometry(0.52, 0.6, 0.07), chair, scene, 0, 0.82, -0.29);
  back.rotation.x = -0.08;
  mk(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 10), chrome, scene, 0, 0.22, 0);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = mk(new THREE.BoxGeometry(0.05, 0.035, 0.3), chair, scene, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    mk(new THREE.SphereGeometry(0.035, 10, 8), chair, scene, Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29);
  }
  const tag = textSprite(' ', 512, 120, '700 56px "Be Vietnam Pro", sans-serif', '#eaf4f2', 'rgba(7,21,26,0.82)');
  tag.scale.set(0.82, 0.19, 1);
  tag.position.set(0, 1.86, 0);
  scene.add(tag);
  document.fonts?.ready.then(() => tag.userData.draw(tag.userData.label || ' '));
  let char = null;
  let popAge = 9;
  let tween = null;
  let view = 'full';
  let running = false;
  let frame = 0;
  const clock = new THREE.Clock();
  const views = { full: { t: [0, 0.92, 0], d: 3.3 }, face: { t: [0, 1.38, 0], d: 1.15 } };
  function resize() {
    const well = canvas.parentElement;
    const w = well.clientWidth || 320;
    const h = well.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setLook(look) {
    if (char) { scene.remove(char.root); disposeAvatar(char.root); }
    char = buildCharacter(look);
    scene.add(char.root);
    popAge = 0;
  }
  function setName(name) {
    tag.userData.label = name || ' ';
    tag.userData.draw(tag.userData.label);
  }
  function focus(next) {
    view = next;
    const full = document.getElementById('camFull');
    const face = document.getElementById('camFace');
    if (full) full.setAttribute('aria-pressed', String(next === 'full'));
    if (face) face.setAttribute('aria-pressed', String(next === 'face'));
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-4) dir.set(1.4, 0.5, 3);
    dir.normalize();
    const target = new THREE.Vector3(...views[next].t);
    const position = target.clone().addScaledVector(dir, views[next].d);
    if (reduced) { controls.target.copy(target); camera.position.copy(position); tween = null; return; }
    tween = { t0: controls.target.clone(), p0: camera.position.clone(), t1: target, p1: position, s: 0 };
  }
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (char) {
      tickAvatar(char, dt, t, reduced);
      popAge += dt;
      char.root.scale.setScalar(1 - 0.05 * Math.exp(-popAge * 7) * Math.cos(popAge * 22) * (reduced ? 0 : 1));
    }
    if (tween) {
      tween.s = Math.min(1, tween.s + dt / 0.8);
      const e = tween.s < 0.5 ? 4 * tween.s ** 3 : 1 - ((-2 * tween.s + 2) ** 3) / 2;
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      if (tween.s >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  }
  controls.addEventListener('start', () => { tween = null; });
  if (canvas.parentElement) new ResizeObserver(resize).observe(canvas.parentElement);
  return {
    setLook, setName, focus, resize,
    setSpin(on) { controls.autoRotate = on; },
    start() {
      if (running) return;
      running = true;
      resize();
      clock.getDelta();
      loop();
    },
    stop() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
