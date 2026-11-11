import * as THREE from 'three';
import { islands, G, hooks, renderer } from './world.js';
import { randomLook } from './avatar.js';
import { saveGlbFile, clearGlbFile, glbInfo } from './glb-avatar.js';

// ---------- bench driver: chạy kịch bản đo hiệu năng avatar ----------
// Chỉ được nạp qua main.js khi URL có ?bench. Đi qua upsertSeat/removeSeat
// thật (cùng đường presence) nên đo đúng code path production.
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// Đóng form tạo nhân vật nếu đang mở (preview renderer thứ 2 sẽ làm nhiễm số đo)
try { if (!$('maker').hidden) $('lookForm').requestSubmit(); } catch (e) {}

const seatList = [];
{
  const maxSlots = Math.max(...islands.map((i) => i.seats.length));
  for (let s = 0; s < maxSlots; s++) {
    for (let i = 0; i < islands.length; i++) {
      if (islands[i].seats[s]) seatList.push({ table: i + 1, slot: s + 1 });
    }
  }
}
let seatIdx = 0;
let seq = 0;
const WALK_LANES = [
  { z: 6.8, x0: -10, x1: 10 }, { z: -6.8, x0: -10, x1: 10 },
  { x: -11.5, z0: -5, z1: 5 }, { x: 11.5, z0: -5, z1: 5 },
];
function walkPos(i) {
  const lane = WALK_LANES[i % WALK_LANES.length];
  const k = Math.floor(i / WALK_LANES.length);
  const t = (k % 5) / 4;
  if (lane.z != null) return { x: lane.x0 + (lane.x1 - lane.x0) * t, z: lane.z, yaw: Math.PI / 2 };
  return { x: lane.x, z: lane.z0 + (lane.z1 - lane.z0) * t, yaw: 0 };
}
function fakeId() { return 'bench-' + (seq++); }

function seatOne(look) {
  const seat = seatList[seatIdx++ % seatList.length];
  const id = fakeId();
  hooks.upsertSeat({ id, name: 'Bench ' + id, table: seat.table, slot: seat.slot, peerId: '', walkId: '', look: look || randomLook() });
  return id;
}
function walkOne(look) {
  const i = seq;
  const id = fakeId();
  const p = walkPos(i);
  hooks.upsertSeat({ id, name: 'Bench ' + id, walk: 1, x: p.x, z: p.z, yaw: p.yaw, walkId: 'w-' + id, peerId: '', look: look || randomLook() });
  return id;
}
function isFake(id) { return id.startsWith('bench-'); }

const api = {
  seatList: () => seatList.length,
  myId: () => hooks.myId(),
  spawnSeated(n = 1) { const ids = []; for (let i = 0; i < n; i++) ids.push(seatOne()); return ids; },
  spawnWalkers(n = 1) { const ids = []; for (let i = 0; i < n; i++) ids.push(walkOne()); return ids; },
  spawnMixed(n = 1) {
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(i % 2 ? walkOne() : seatOne());
    return ids;
  },
  joinMe() {
    const seat = seatList[seatIdx++ % seatList.length];
    const id = hooks.myId();
    hooks.upsertSeat({ id, name: 'Me', table: seat.table, slot: seat.slot, peerId: '', walkId: '', look: randomLook() });
    return id;
  },
  leaveMe() { hooks.removeSeat(hooks.myId()); },
  leave(id) { hooks.removeSeat(id); },
  clear() {
    for (const child of [...G.people.children]) {
      const id = child.userData.personId;
      if (id && isFake(id)) hooks.removeSeat(id);
    }
    hooks.removeSeat(hooks.myId());
    seatIdx = 0;
  },
  // join/leave churn: mỗi chu kỳ remove + upsert với look mới -> buộc rebuild,
  // lộ rõ rò rỉ geometry/material/texture qua renderer.info.memory.
  async churn({ cycles = 30, intervalMs = 120, walk = false } = {}) {
    const id = 'bench-churn';
    for (let c = 0; c < cycles; c++) {
      if (walk) {
        const p = walkPos(c);
        hooks.upsertSeat({ id, name: 'Churn', walk: 1, x: p.x, z: p.z, yaw: p.yaw, walkId: 'w-' + id, peerId: '', look: randomLook() });
      } else {
        const seat = seatList[c % seatList.length];
        hooks.upsertSeat({ id, name: 'Churn', table: seat.table, slot: seat.slot, peerId: '', walkId: '', look: randomLook() });
      }
      await new Promise((r) => setTimeout(r, intervalMs));
      hooks.removeSeat(id);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return true;
  },
  async loadGlb(url = 'bench/bench-avatar.glb') {
    const buf = await (await fetch(url)).arrayBuffer();
    await saveGlbFile(new File([buf], 'bench-avatar.glb', { type: 'model/gltf-binary' }));
    return glbInfo();
  },
  async clearGlb() { await clearGlbFile(); return true; },
  counts() {
    let meshes = 0, sprites = 0, skinned = 0, bodies = 0;
    const geos = new Set(), mats = new Set(), texs = new Set();
    for (const p of G.people.children) {
      if (!p.userData.avatar) continue;
      bodies++;
      p.traverse((n) => {
        if (n.isSkinnedMesh) skinned++;
        if (n.isMesh) { meshes++; if (n.geometry) geos.add(n.geometry); }
        if (n.isSprite) sprites++;
        const list = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
        for (const m of list) {
          mats.add(m);
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
            if (m && m[key]) texs.add(m[key]);
          }
        }
      });
    }
    return { bodies, meshes, skinned, sprites, geometries: geos.size, materials: mats.size, textures: texs.size };
  },
  probe() {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      dpr: renderer.getPixelRatio(),
      size: renderer.getSize(new THREE.Vector2()).toArray(),
      shadowMap: renderer.shadowMap.enabled,
    };
  },
};
window.__bench = api;

// ---------- ?bench=gen: sinh fixture .glb skinned tại chỗ, xuất base64 ----------
if (params.get('bench') === 'gen') {
  (async () => {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const bones = [];
    const hips = new THREE.Bone(); hips.name = 'hips'; hips.position.y = 0.9;
    const spine = new THREE.Bone(); spine.name = 'spine'; spine.position.y = 0.35;
    const head = new THREE.Bone(); head.name = 'head'; head.position.y = 0.45;
    hips.add(spine); spine.add(head); bones.push(hips, spine, head);
    const geo = new THREE.CylinderGeometry(0.22, 0.26, 1.5, 10, 6);
    geo.translate(0, 0.75, 0);
    const pos = geo.attributes.position;
    const si = [], sw = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const b = y < 0.9 ? 0 : y < 1.25 ? 1 : 2;
      si.push(b, 0, 0, 0); sw.push(1, 0, 0, 0);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x3f8fc0, roughness: 0.7 }));
    mesh.name = 'body';
    mesh.add(hips);
    mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Group();
    root.add(mesh);
    const track = new THREE.NumberKeyframeTrack('hips.position[y]', [0, 0.5, 1], [0.9, 0.95, 0.9]);
    const clip = new THREE.AnimationClip('idle', 1, [track]);
    const glb = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true, animations: [clip] }));
    const u8 = new Uint8Array(glb);
    let bin = '';
    for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    window.__glbB64 = btoa(bin);
  })().catch((e) => { window.__glbErr = String(e && e.stack || e); });
}
