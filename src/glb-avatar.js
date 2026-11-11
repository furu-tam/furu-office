import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

// ---------- nhân vật .glb tự upload: local-only, người khác vẫn thấy look từ "Đổi hình" ----------
const DB = 'furu-office';
const STORE = 'kv';
const KEY = 'glb';
const TARGET_H = 1.62;   // chiều cao sau normalize (m)
const SEAT_BACK = -0.45; // đứng lùi ra sau ghế (local -Z)

let loader = null;
let glb = null;          // { root, clips, name, skinned, live, dead }
let flip = false;

// ---------- IndexedDB ----------
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbOp(mode, fn) {
  return openDb().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    tx.onerror = () => rej(tx.error);
    fn(tx.objectStore(STORE), res);
  }));
}
const idbGet = (k) => idbOp('readonly', (st, res) => { const r = st.get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
const idbPut = (k, v) => idbOp('readwrite', (st, res) => { const r = st.put(v, k); r.onsuccess = () => res(true); r.onerror = () => res(false); }).then((ok) => { if (!ok) throw new Error('idb-put-failed'); });
const idbDel = (k) => idbOp('readwrite', (st, res) => { const r = st.delete(k); r.onsuccess = () => res(true); r.onerror = () => res(false); });

// ---------- disposal: source scene sở hữu geometry/material/texture; clone chỉ mượn ----------
// Mỗi source record đếm clone đang sống (src.live). Retire đánh dấu dead —
// chỉ dispose khi clone cuối cùng đã rời scene, để upload liên tiếp không
// dispose nhầm tài nguyên clone thế hệ cũ vẫn đang dùng.
function disposeGlbScene(root) {
  const geos = new Set(), mats = new Set(), texs = new Set();
  root.traverse((n) => {
    if (n.geometry) geos.add(n.geometry);
    const list = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of list) {
      if (m) mats.add(m);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap']) {
        if (m && m[key]) texs.add(m[key]);
      }
    }
  });
  geos.forEach((g) => g.dispose());
  texs.forEach((t) => t.dispose());
  mats.forEach((m) => m.dispose());
}
function retire(src) {
  src.dead = true;
  if (src.live === 0) disposeGlbScene(src.root);
}

function normalize(scene) {
  // Đưa model về chuẩn: chân tại y=0, tâm x/z tại gốc, cao TARGET_H — hướng mặt +Z.
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const s = size.y > 0.01 ? TARGET_H / size.y : 1;
  const inner = new THREE.Group();
  inner.scale.setScalar(Math.min(10, Math.max(0.02, s)));
  inner.position.set(-center.x * inner.scale.x, -box.min.y * inner.scale.x, -center.z * inner.scale.x);
  inner.add(scene);
  const g = new THREE.Group();
  g.add(inner);
  return g;
}

async function parse(buf, name) {
  loader = loader || new GLTFLoader();
  const res = await new Promise((res, rej) => loader.parse(buf, '', res, rej));
  const root = normalize(res.scene);
  const prev = glb;
  glb = {
    root,
    clips: res.animations || [],
    name,
    skinned: !!res.scene.getObjectByProperty('isSkinnedMesh', true),
    live: 0,
    dead: false,
  };
  if (prev) retire(prev);
}

export async function initGlb() {
  // Đọc IndexedDB đúng một lần lúc boot — presence update/frame không đụng IDB.
  try {
    const rec = await idbGet(KEY);
    if (rec) flip = !!rec.flip;
    if (rec && rec.buf) await parse(rec.buf, rec.name || 'character.glb');
  } catch (e) {
    // Dữ liệu hỏng / parse lỗi -> fallback procedural + xóa record hỏng.
    glb = null;
    try { await idbDel(KEY); } catch (e2) {}
  }
}

export function glbInfo() { return glb ? { name: glb.name } : null; }
export function glbFlipped() { return flip; }
export async function setGlbFlip(v) {
  flip = !!v;
  try { const rec = (await idbGet(KEY)) || {}; rec.flip = flip; await idbPut(KEY, rec); } catch (e) {}
}

export function glbBody() {
  if (!glb) return null;
  const src = glb;
  const root = src.skinned ? skClone(src.root) : src.root.clone(true);
  root.rotation.y = flip ? Math.PI : 0;
  root.position.z = SEAT_BACK;
  const g = new THREE.Group();
  g.add(root);
  let mixer = null;
  if (src.clips.length) {
    mixer = new THREE.AnimationMixer(root);
    const clip = src.clips.find((c) => /idle|stand|breath|seat|sit/i.test(c.name)) || src.clips[0];
    mixer.clipAction(clip).play();
  }
  g.userData.avatar = { glb: true, mixer, walkAmt: 0 };
  g.userData.glb = true;
  g.userData.src = src;
  src.live++;
  return g;
}

// Gỡ body GLB khỏi scene + teardown mixer. KHÔNG dispose geometry/material —
// chúng thuộc source scene và đang được các clone khác dùng chung.
export function disposeGlbBody(g) {
  if (!g) return;
  const av = g.userData.avatar;
  if (av && av.mixer) {
    try {
      av.mixer.stopAllAction();
      av.mixer.uncacheRoot(av.mixer.getRoot());
    } catch (e) {}
    av.mixer = null;
  }
  const src = g.userData.src;
  g.userData.avatar = null;
  g.userData.src = null;
  if (g.parent) g.parent.remove(g);
  if (src) {
    src.live = Math.max(0, src.live - 1);
    if (src.dead && src.live === 0) disposeGlbScene(src.root);
  }
}

export async function saveGlbFile(file) {
  const buf = await file.arrayBuffer();
  await parse(buf, file.name);          // throw nếu không parse được — glb cũ vẫn giữ (fallback)
  try {
    const rec = (await idbGet(KEY)) || {};
    await idbPut(KEY, { ...rec, buf, name: file.name, flip });
    return { name: glb.name, persisted: true };
  } catch (e) {
    // Hết quota / IDB lỗi — vẫn dùng được trong phiên, chỉ không lưu cho lần sau.
    return { name: glb.name, persisted: false };
  }
}

export async function clearGlbFile() {
  const prev = glb;
  glb = null;
  if (prev) retire(prev);
  try { await idbDel(KEY); } catch (e) {}
}
