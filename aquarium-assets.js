// Procedural aquascape assets: driftwood, aquatic plants, moss and rocks.
// Units: 1 = 10 cm, Y up, every asset has its origin at the base centre (where it meets the substrate).
// Plants carry 4 morph targets and a looping "Sway" clip; colours live in vertex colours (no textures).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const fract = x => x - Math.floor(x);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
}
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vn(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  return mix(mix(mix(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), mix(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    mix(mix(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), mix(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm3(x, y, z) { let a = 0.5, s = 0; for (let i = 0; i < 4; i++) { s += a * vn(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// ---------- geometry plumbing ----------
// every piece carries: position, normal, uv, color, aSway (sway weight at that vertex), aRand (per-leaf phase)
function decorate(g, colorFn, swayFn = () => 0, rand = 0) {
  const p = g.attributes.position, uv = g.attributes.uv, n = p.count;
  const col = new Float32Array(n * 3), sw = new Float32Array(n), rd = new Float32Array(n).fill(rand);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0;
    col.set(colorFn(x, y, z, u, v), i * 3);
    sw[i] = swayFn(x, y, z, u, v);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rd, 1));
  if (!uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
function indexed(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function grid(rows, cols, idx) {
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
}
function tube(pts, segs, radial, rFn) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t), r = rFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const n = fr.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r); uv.push(t, j / radial);
    }
  }
  grid(segs, radial, idx);
  return { geo: indexed(pos, uv, idx), curve };
}
// a leaf grows along +Y and arches toward +Z; u runs base->tip, v across the blade (0..1, midrib at 0.5)
function leaf({ len, width, shape, segU = 14, segV = 3, bend = 0.6, fold = 0.25, twist = 0, wave = 0, waveF = 7 }) {
  const pos = [], uv = [], idx = [];
  let p = V(0, 0, 0);
  for (let i = 0; i <= segU; i++) {
    const u = i / segU, th = bend * u * u, tw = twist * u;
    const dir = V(0, Math.cos(th), Math.sin(th)), nrm = V(0, -Math.sin(th), Math.cos(th));
    const side = V(Math.cos(tw), 0, 0).addScaledVector(nrm, Math.sin(tw));
    const n2 = nrm.clone().multiplyScalar(Math.cos(tw)).add(V(-Math.sin(tw), 0, 0));
    const w = width * shape(u) * (1 + wave * Math.sin(u * waveF * Math.PI));
    for (let j = 0; j <= segV * 2; j++) {
      const v = j / segV - 1;
      const q = p.clone().addScaledVector(side, v * w / 2).addScaledVector(n2, Math.abs(v) * w / 2 * fold);
      pos.push(q.x, q.y, q.z); uv.push((v + 1) / 2, u);
    }
    p = p.addScaledVector(dir, len / segU);
  }
  grid(segU, segV * 2, idx);
  return indexed(pos, uv, idx);
}
const place = (g, { yaw = 0, tilt = 0, roll = 0, at = V(0, 0, 0), scale = 1 }) =>
  g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, roll, 'YXZ')), V(scale, scale, scale)));
const leafColor = ({ base, mid, tip, rib, edge }) => (x, y, z, v, u) => {
  let c = u < 0.5 ? mixc(base, mid, u / 0.5) : mixc(mid, tip, (u - 0.5) / 0.5);
  const a = Math.abs(v - 0.5) * 2;
  c = mixc(c, rib, smooth(0.12, 0.0, a) * 0.7);
  c = mixc(c, edge, smooth(0.75, 1.0, a) * 0.5);
  return c;
};

// ---------- materials ----------
export function materials() {
  return {
    plant: new THREE.MeshStandardMaterial({ name: 'aquatic_plant', vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ name: 'driftwood', vertexColors: true, roughness: 0.92, metalness: 0 }),
    moss: new THREE.MeshStandardMaterial({ name: 'moss', vertexColors: true, roughness: 1, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ name: 'rock', vertexColors: true, roughness: 0.85, flatShading: true }),
  };
}

// ---------- plants ----------
function vallisneria(seed) {
  const R = rng(seed), H = 4.6, parts = [];
  const pal = { base: lin(0xd5dc9a), mid: lin(0x7cbf55), tip: lin(0x5a9e43), rib: lin(0xb9df8e), edge: lin(0x4b8a3a) };
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.35;
    const g = leaf({ len: 3.0 + R() * 1.7, width: 0.16 + R() * 0.07, shape: u => (1 - Math.pow(u, 10)) * (0.7 + 0.3 * smooth(0, 0.08, u)), segU: 22, segV: 1, bend: 0.4 + R() * 0.9, fold: 0.1, twist: (R() - 0.5) * 3 });
    place(g, { yaw: R() * Math.PI * 2, tilt: (R() - 0.5) * 0.2, at: V(Math.cos(a) * r, 0, Math.sin(a) * r) });
    parts.push(decorate(g, leafColor(pal), (x, y) => Math.pow(clamp(y / H, 0, 1.2), 1.6) * 0.55, R() * 2 - 1));
  }
  return parts;
}
function amazonSword(seed) {
  const R = rng(seed), H = 3.2, parts = [];
  const pal = { base: lin(0x6fae4c), mid: lin(0x55a447), tip: lin(0x4a9640), rib: lin(0xb8e08e), edge: lin(0x2f7432) };
  const stem = lin(0x9cc06a);
  for (let i = 0; i < 12; i++) {
    const yaw = i * 2.39996 + R() * 0.3, tilt = 0.25 + (i / 12) * 0.6 + R() * 0.15, plen = 0.6 + R() * 0.5;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ'));
    const tip = V(0, plen, 0).applyMatrix4(m);
    const pet = tube([V(0, 0, 0), tip.clone().multiplyScalar(0.5).add(V(0, 0.05, 0)), tip], 6, 5, t => mix(0.05, 0.03, t)).geo;
    const sway = (x, y) => Math.pow(clamp(y / H, 0, 1.2), 1.8) * 0.18;
    const rand = R() * 2 - 1;
    parts.push(decorate(pet, () => stem, sway, rand));
    const g = leaf({ len: 1.5 + R() * 0.8, width: 0.5 + R() * 0.15, shape: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.9), segU: 14, segV: 3, bend: 0.6 + R() * 0.5, fold: 0.28 });
    place(g, { yaw, tilt, at: tip });
    parts.push(decorate(g, leafColor(pal), sway, rand));
  }
  return parts;
}
function rhizomeAndLeaves(seed, { count, H, sway, pal, rhizome, leafOpts, petiole = 0, tiltA = 0.2, tiltB = 0.7 }) {
  const R = rng(seed), parts = [];
  const rz = tube([V(-0.35, 0.04, 0), V(0, 0.07, 0.03), V(0.35, 0.04, -0.02)], 8, 6, () => 0.055).geo;
  parts.push(decorate(rz, () => rhizome));
  for (let i = 0; i < count; i++) {
    const at = V(-0.3 + R() * 0.6, 0.06, (R() - 0.5) * 0.08), yaw = R() * Math.PI * 2, tilt = tiltA + R() * (tiltB - tiltA);
    const swayFn = (x, y) => Math.pow(clamp(y / H, 0, 1.2), 1.6) * sway, rand = R() * 2 - 1;
    let base = at;
    if (petiole) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ'));
      const tip = V(0, petiole * (0.7 + R() * 0.6), 0).applyMatrix4(m).add(at);
      parts.push(decorate(tube([at, tip], 3, 5, () => 0.03).geo, () => pal.base, swayFn, rand));
      base = tip;
    }
    const g = leaf(leafOpts(R));
    place(g, { yaw, tilt, at: base });
    parts.push(decorate(g, leafColor(pal), swayFn, rand));
  }
  return parts;
}
const javaFern = seed => rhizomeAndLeaves(seed, {
  count: 10, H: 2, sway: 0.12, rhizome: lin(0x5d5a34), tiltA: 0.1, tiltB: 0.8,
  pal: { base: lin(0x3c7a3a), mid: lin(0x3b8a3e), tip: lin(0x2f6f33), rib: lin(0x1f4a24), edge: lin(0x2a6230) },
  leafOpts: R => ({ len: 1.1 + R() * 0.9, width: 0.24 + R() * 0.08, shape: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.7), segU: 16, segV: 2, bend: 0.4 + R() * 0.5, fold: 0.2, wave: 0.12, waveF: 9 }),
});
const anubias = seed => rhizomeAndLeaves(seed, {
  count: 7, H: 1.2, sway: 0.05, rhizome: lin(0x4f6b35), petiole: 0.35, tiltA: 0.5, tiltB: 1.1,
  pal: { base: lin(0x2c6a33), mid: lin(0x22622c), tip: lin(0x1d5627), rib: lin(0x7fb36a), edge: lin(0x174a20) },
  leafOpts: R => ({ len: 0.7 + R() * 0.35, width: 0.46 + R() * 0.12, shape: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 0.75), segU: 10, segV: 3, bend: 0.35, fold: 0.15 }),
});
function rotala(seed) {
  const R = rng(seed), H = 3.8, parts = [];
  const g0 = lin(0x6cb24e), g1 = lin(0xe7a052), g2 = lin(0xe8697a);
  const tint = h => h < 0.55 ? mixc(g0, g1, h / 0.55) : mixc(g1, g2, (h - 0.55) / 0.45);
  for (let s = 0; s < 9; s++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.32, h = 2.4 + R() * 1.4;
    const base = V(Math.cos(a) * r, 0, Math.sin(a) * r), lean = V(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.6);
    const pts = [base, base.clone().add(V(lean.x * 0.3, h * 0.35, lean.z * 0.3)), base.clone().add(V(lean.x * 0.8, h * 0.7, lean.z * 0.8)), base.clone().add(V(lean.x, h, lean.z))];
    const swayFn = (x, y) => Math.pow(clamp(y / H, 0, 1.2), 1.8) * 0.3, rand = R() * 2 - 1;
    const { geo, curve } = tube(pts, 16, 5, () => 0.03);
    parts.push(decorate(geo, (x, y) => mixc(tint(y / h), [0.35, 0.3, 0.15], 0.3), swayFn, rand));
    let rot = R() * Math.PI;
    for (let y = 0.25; y < h - 0.05; y += 0.15) {
      const t = y / h, P = curve.getPointAt(t), size = mix(1, 0.7, t);
      rot += Math.PI / 2;
      for (let k = 0; k < 2; k++) {
        const g = leaf({ len: 0.26 * size, width: 0.075 * size, shape: u => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8), segU: 4, segV: 1, bend: 0.5, fold: 0.2 });
        place(g, { yaw: rot + k * Math.PI, tilt: mix(1.2, 0.55, t), at: P });
        const c = tint(t);
        parts.push(decorate(g, () => c, swayFn, rand));
      }
    }
  }
  return parts;
}
function hairgrass(seed) {
  const R = rng(seed), H = 0.6, parts = [];
  const pal = { base: lin(0x8acb5a), mid: lin(0x7fcf55), tip: lin(0xb6e57c), rib: lin(0x9ad86a), edge: lin(0x6fbf4a) };
  for (let i = 0; i < 55; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.45;
    const g = leaf({ len: 0.28 + R() * 0.35, width: 0.028, shape: u => 1 - u * 0.8, segU: 5, segV: 1, bend: 0.2 + R() * 0.7, fold: 0 });
    place(g, { yaw: R() * Math.PI * 2, tilt: (R() - 0.5) * 0.5, at: V(Math.cos(a) * r, 0, Math.sin(a) * r) });
    parts.push(decorate(g, leafColor(pal), (x, y) => Math.pow(clamp(y / H, 0, 1.2), 1.5) * 0.06, R() * 2 - 1));
  }
  return parts;
}

// ---------- hardscape ----------
function moss(seed) {
  const R = rng(seed), parts = [];
  for (let i = 0; i < 22; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.4, s = 0.08 + R() * 0.12;
    const g = new THREE.IcosahedronGeometry(s, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const f = 0.75 + h3(p.getX(k) * 9 + i, p.getY(k) * 9, p.getZ(k) * 9) * 0.5; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.7, p.getZ(k) * f); }
    g.translate(Math.cos(a) * r, s * 0.4 + (0.4 - r) * 0.25, Math.sin(a) * r);
    const c = mixc(lin(0x3f7a2e), lin(0x6fa645), R());
    parts.push(decorate(g, (x, y) => mixc(c, lin(0x8cbf5a), smooth(0, 0.4, y) * 0.4)));
  }
  return parts;
}
// branch(): wobbling, tapering limbs that split recursively; returns the pieces and attach points for epiphytes
function driftwood(seed, { trunks, gnarl = 0.45, rise = 0.12, kids = 2, depth = 2, segs = 7, pal }) {
  const R = rng(seed), parts = [], attach = [];
  function branch(start, dir, len, r0, d) {
    const pts = [start.clone()]; let p = start.clone(); const dd = dir.clone().normalize();
    for (let k = 1; k <= segs; k++) {
      dd.add(V(R() - 0.5, (R() - 0.5) * 0.6, R() - 0.5).multiplyScalar(gnarl)); dd.y += rise; dd.normalize();
      p = p.clone().addScaledVector(dd, len / segs); pts.push(p);
    }
    const bump = R() * 10;
    const { geo, curve } = tube(pts, segs * 7, 10, t => (t > 0.97 ? mix(r0 * 0.3, 0.01, (t - 0.97) / 0.03) : mix(r0, r0 * 0.3, t)) * (1 + 0.14 * Math.sin(t * 19 + bump) + 0.08 * Math.sin(t * 47 + bump)));
    parts.push(decorate(geo, (x, y, z, u, v) => {
      const streak = noise(u * len * 2.2 + bump, v * 7) * 0.65 + noise(u * len * 9, v * 22) * 0.35;
      let c = mixc(pal.dark, pal.light, smooth(0.25, 0.75, streak));
      c = mixc(c, pal.bleach, smooth(0.6, 1, u) * 0.5 + smooth(0.55, 0.9, y / 5) * 0.3);
      return mixc(c, pal.crack, smooth(0.32, 0.18, streak) * 0.8);
    }));
    attach.push({ p: curve.getPointAt(0.5), r: r0 * 0.65, depth: d }, { p: curve.getPointAt(0.8), r: r0 * 0.45, depth: d });
    if (d > 0) {
      for (let k = 0; k < kids; k++) {
        const t = 0.35 + R() * 0.45, q = curve.getPointAt(t);
        const nd = curve.getTangentAt(t).add(V(R() - 0.5, 0.5 + R() * 0.6, R() - 0.5).multiplyScalar(1.3)).normalize();
        branch(q, nd, len * (0.45 + R() * 0.25), r0 * mix(0.6, 0.35, t), d - 1);
      }
    }
  }
  trunks(R).forEach(([s, d, l, r]) => branch(s, d, l, r, depth));
  return { parts, attach };
}
const woodPal = { dark: lin(0x4a3424), light: lin(0x8f6d4f), bleach: lin(0xc2ad8e), crack: lin(0x2a1d14) };
const driftwoodLarge = seed => driftwood(seed, {
  pal: woodPal, gnarl: 0.4, rise: 0.08, kids: 2, depth: 2,
  trunks: R => [
    [V(-3.2, 0.15, 0.6), V(1, 0.3, -0.25), 6.2, 0.38],
    [V(-2.6, 0.1, 0.4), V(-0.3, -0.2, 0.9), 1.6, 0.22],
    [V(-2.9, 0.1, 0.7), V(-0.6, -0.15, -0.8), 1.4, 0.2],
    [V(-1.0, 0.2, 0.1), V(0.5, 1, -0.2), 2.3, 0.24],
  ],
});
const spiderWood = seed => driftwood(seed, {
  pal: { dark: lin(0x6b4e36), light: lin(0xb08c66), bleach: lin(0xd6c2a0), crack: lin(0x3a2a1c) },
  gnarl: 0.9, rise: 0.18, kids: 2, depth: 2, segs: 8,
  trunks: R => Array.from({ length: 6 }, (_, k) => {
    const a = k / 6 * Math.PI * 2 + R();
    return [V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), 2.6 + R() * 1.6, 0.11 + R() * 0.05];
  }),
});
function seiryu(seed, sx = 1.2, sy = 0.9, sz = 1) {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, v = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = fbm3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6);
    const ridge = 1 - Math.abs(Math.sin(v.y * 9 + n * 4)) * 0.06;
    const k = (0.7 + n * 0.6) * ridge;
    p.setXYZ(i, v.x * k * sx, Math.max(v.y * k * sy, -0.15), v.z * k * sz);
  }
  g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y - 0.12, 0);
  g.computeVertexNormals();
  const dark = lin(0x6f7a80), light = lin(0xb9c2c4), vein = lin(0xe9ecea);
  return [decorate(g, (x, y, z) => {
    const s = fbm3(x * 2 + seed, y * 6, z * 2);
    let c = mixc(dark, light, smooth(0.3, 0.75, s));
    return mixc(c, vein, smooth(0.04, 0.0, Math.abs(Math.sin(y * 7 + x * 1.5 + s * 3))) * 0.8);
  })];
}

// tall backdrop cliff: a stretched rock with vertical fluting, narrowing to a ragged crest, moss on the ledges
function cliff(seed, sx = 1, sy = 4.5, sz = 0.7) {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, v = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = fbm3(v.x * 2 + seed, v.y * 1.3, v.z * 2);
    const flute = 0.12 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 7 + n * 5));
    const k = 0.78 + n * 0.45 - flute, taper = 1 - 0.4 * Math.max(v.y, 0);
    const crest = v.y > 0.6 ? (fbm3(v.x * 6 + seed, 0, v.z * 6) - 0.5) * 0.35 : 0;
    p.setXYZ(i, v.x * k * sx * taper, Math.max(((v.y * k + crest + 1) / 2) * sy, -0.15), v.z * k * sz * taper);
  }
  // pin the crest to exactly sy so heights can be matched to the tank rim
  g.computeBoundingBox(); g.scale(1, sy / g.boundingBox.max.y, 1);
  g.computeVertexNormals();
  const dark = lin(0x55626a), light = lin(0xa9b4b8), crack = lin(0x323a40), mossC = lin(0x5d8a3c);
  return [decorate(g, (x, y, z) => {
    const s2 = fbm3(x * 1.5 + seed, y * 3, z * 1.5);
    let c = mixc(dark, light, smooth(0.3, 0.75, s2) * smooth(0, sy * 0.9, y + 1));
    c = mixc(c, crack, smooth(0.06, 0.0, Math.abs(Math.sin(x * 9 + z * 5 + s2 * 6))) * 0.7);
    return mixc(c, mossC, smooth(0.62, 0.78, fbm3(x * 5, y * 5 + seed, z * 5)) * 0.55);
  })];
}
// the white waterfall: a ribbon dropping from the gap between the cliffs, then a sand river winding to the front
export const WATERFALL_PATH = [V(0.4, 5.45, -2.62), V(0.43, 3.9, -2.38), V(0.38, 1.8, -2.18), V(0.42, 0.35, -1.98), V(0.4, 0.02, -1.8)];
export const RIVER_PATH = [V(0.4, 0.016, -1.85), V(0.05, 0.016, -0.7), V(0.75, 0.016, 0.5), V(0.25, 0.016, 1.7), V(0.55, 0.016, 2.95)];
function ribbon(path, segs, width, flat) {
  const c = new THREE.CatmullRomCurve3(path), pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = c.getPointAt(t), T = c.getTangentAt(t);
    const side = flat ? V(-T.z, 0, T.x).normalize() : V(1, 0, 0), w = width(t);
    const bulge = flat ? V(0, 0, 0) : T.clone().cross(V(1, 0, 0)).normalize().multiplyScalar(0.05 * Math.sin(t * Math.PI));
    for (let j = 0; j <= 8; j++) {
      const u = j / 8, q = P.clone().addScaledVector(side, (u - 0.5) * w).add(bulge).add(flat ? V(0, 0, 0) : V(0, 0, 0.04 * Math.sin(u * Math.PI)));
      pos.push(q.x, q.y, q.z); uv.push(u, t);
    }
  }
  grid(segs, 8, idx);
  return indexed(pos, uv, idx);
}
function waterTex(name, fill) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [r, g, b, a] = fill((x + 0.5) / S, 1 - (y + 0.5) / S), i = (y * S + x) * 4;
    img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.name = name; t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function buildWater() {
  const group = new THREE.Group(); group.name = 'SandWaterfall';
  const fallMap = waterTex('waterfall_streaks', (u, v) => {
    const s = noise(u * 22, v * 5) * 0.6 + noise(u * 60, v * 2) * 0.4;
    return [0.94, 0.97, 1, Math.pow(Math.sin(u * Math.PI), 0.6) * (0.55 + 0.45 * s)];
  });
  const riverMap = waterTex('sand_river', (u, v) => {
    const s = noise(u * 30, v * 12) * 0.5 + 0.5 * noise(u * 8, v * 40);
    return [0.96, 0.95, 0.92, smooth(0, 0.22, Math.sin(u * Math.PI)) * (0.85 + 0.15 * s)];
  });
  const fall = new THREE.Mesh(ribbon(WATERFALL_PATH, 48, t => 0.42 + 0.55 * t, false),
    new THREE.MeshStandardMaterial({ name: 'waterfall', map: fallMap, transparent: true, depthWrite: false, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: fallMap, emissiveIntensity: 0.35, roughness: 0.3 }));
  fall.name = 'waterfall';
  const river = new THREE.Mesh(ribbon(RIVER_PATH, 60, t => 0.9 + 0.35 * t, true),
    new THREE.MeshStandardMaterial({ name: 'sand_river', map: riverMap, transparent: true, depthWrite: false, roughness: 0.9 }));
  river.name = 'sand_river'; river.renderOrder = 1;
  group.add(fall, river);
  return group;
}
const riverXAt = z => { const c = new THREE.CatmullRomCurve3(RIVER_PATH); let best = 9, bx = 0; for (let i = 0; i <= 40; i++) { const p = c.getPointAt(i / 40); const d = Math.abs(p.z - z); if (d < best) { best = d; bx = p.x; } } return bx; };

// ---------- catalogue ----------
export const CATALOGUE = [
  { id: 'driftwood_large', label: 'Lũa nhánh lớn', kind: 'wood', make: s => driftwoodLarge(s).parts },
  { id: 'driftwood_spider', label: 'Lũa rễ (spider wood)', kind: 'wood', make: s => spiderWood(s).parts },
  { id: 'plant_vallisneria', label: 'Rong lá băng (Vallisneria)', kind: 'plant', make: vallisneria },
  { id: 'plant_rotala', label: 'Vẩy ốc đỏ (Rotala)', kind: 'plant', make: rotala },
  { id: 'plant_amazon_sword', label: 'Kiếm Amazon (Echinodorus)', kind: 'plant', make: amazonSword },
  { id: 'plant_java_fern', label: 'Dương xỉ Java (Microsorum)', kind: 'plant', make: javaFern },
  { id: 'plant_anubias', label: 'Ráy Anubias', kind: 'plant', make: anubias },
  { id: 'plant_hairgrass', label: 'Cỏ thảm Hairgrass (Eleocharis)', kind: 'plant', make: hairgrass },
  { id: 'moss_clump', label: 'Rêu Java', kind: 'moss', make: moss },
  { id: 'rock_seiryu_a', label: 'Đá Seiryu A', kind: 'rock', make: s => seiryu(s, 1.3, 1.0, 1.0) },
  { id: 'rock_seiryu_b', label: 'Đá Seiryu B', kind: 'rock', make: s => seiryu(s + 5, 0.9, 1.3, 0.8) },
  { id: 'rock_cliff', label: 'Vách núi đá (nền sau)', kind: 'rock', make: s => cliff(s, 1.0, 6.0, 0.7) },
  { id: 'waterfall_sand', label: 'Thác cát trắng và dòng suối cát', kind: 'water' },
];
const MAT_OF = { wood: 'wood', plant: 'plant', moss: 'moss', rock: 'rock' };

// ---------- mesh + sway ----------
const SWAY_T = 6;
function toMesh(name, parts, mat, sway) {
  let g = mergeGeometries(parts);
  if (mat.flatShading) { if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); }
  if (sway) {
    const p = g.attributes.position, s = g.attributes.aSway, r = g.attributes.aRand, n = p.count;
    const t = [0, 1, 2, 3].map(() => new Float32Array(n * 3));
    for (let i = 0; i < n; i++) {
      const k = s.getX(i), q = r.getX(i);
      t[0][i * 3] = k; t[0][i * 3 + 1] = -k * k * 0.25;
      t[1][i * 3 + 2] = k; t[1][i * 3 + 1] = -k * k * 0.25;
      t[2][i * 3] = k * q; t[3][i * 3 + 2] = k * q;
    }
    g.morphAttributes.position = t.map(a => new THREE.BufferAttribute(a, 3));
    g.morphTargetsRelative = true;
  }
  g.deleteAttribute('aSway'); g.deleteAttribute('aRand');
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.name = name;
  if (sway) m.updateMorphTargets();
  return m;
}
// a slow current pushes along +X with a little cross-flow; per-leaf phase rides on targets 2 and 3
export function swayClip(meshes, name = 'Sway') {
  const times = [], vals = [];
  for (let f = 0; f <= 48; f++) {
    const t = f / 48 * SWAY_T, ph = t / SWAY_T * Math.PI * 2;
    times.push(t);
    vals.push(0.35 + 0.65 * Math.sin(ph), 0.45 * Math.sin(ph + 1.7), 0.5 * Math.sin(2 * ph + 0.4), 0.5 * Math.sin(2 * ph + 2.3));
  }
  return new THREE.AnimationClip(name, SWAY_T, meshes.map(m => new THREE.NumberKeyframeTrack(`${m.name}.morphTargetInfluences`, times, vals)));
}
export function buildAsset(id, seed = 7) {
  const mats = materials(), item = CATALOGUE.find(c => c.id === id);
  if (item.kind === 'water') return { object: buildWater(), clip: null, label: item.label, kind: item.kind };
  const mesh = toMesh(id, item.make(seed), mats[MAT_OF[item.kind]], item.kind === 'plant');
  const clip = item.kind === 'plant' ? swayClip([mesh]) : null;
  return { object: mesh, clip, label: item.label, kind: item.kind };
}

// ---------- full aquascape for a 120 x 60 cm tank (12 x 6 units), substrate top at y = 0 ----------
export function buildLayout() {
  const mats = materials(), R = rng(2026);
  const group = new THREE.Group(); group.name = 'Aquascape';
  const bucket = {};
  const put = (id, parts, opts) => { parts.forEach(g => place(g, opts)); (bucket[id] ||= []).push(...parts); };
  const yawM = (yaw, scale, at) => new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V(scale, scale, scale));

  const wood = driftwoodLarge(11), woodAt = { yaw: 0.1, at: V(-2.5, 0, -0.2), scale: 0.8 };
  put('driftwood_large', wood.parts, woodAt);
  const wm = yawM(woodAt.yaw, woodAt.scale, woodAt.at);
  const spider = spiderWood(23), spiderAt = { yaw: 0.8, at: V(3.7, 0, -1.7), scale: 0.95 };
  put('driftwood_spider', spider.parts, spiderAt);

  [[-5.0, -1.9, 1.1], [-3.7, -2.0, 0.95], [5.1, -1.9, 1.05], [-5.4, -1.0, 0.85]].forEach(([x, z, s], i) =>
    put('plant_vallisneria', vallisneria(100 + i), { yaw: R() * 6, at: V(x, 0, z), scale: s }));
  [[-1.4, -1.7, 0.9], [2.0, -1.6, 0.85], [-4.4, -1.6, 0.8]].forEach(([x, z, s], i) =>
    put('plant_rotala', rotala(200 + i), { yaw: R() * 6, at: V(x, 0, z), scale: s }));
  [[-3.7, -0.7, 1.0], [5.0, 0.2, 0.75]].forEach(([x, z, s], i) =>
    put('plant_amazon_sword', amazonSword(300 + i), { yaw: R() * 6, at: V(x, 0, z), scale: s }));
  // epiphytes tied onto the driftwood
  const spots = wood.attach.map(a => ({ ...a, w: a.p.clone().applyMatrix4(wm) })).filter(a => a.w.y < 3.4 && a.w.y > 0.4).sort((a, b) => b.w.y - a.w.y);
  [spots[0], spots[3]].forEach((a, i) => a && put('plant_java_fern', javaFern(400 + i), { yaw: R() * 6, at: a.w.clone().add(V(0, a.r * 0.6, 0)), scale: 0.9 }));
  spots.slice(-2).forEach((a, i) => put('plant_anubias', anubias(500 + i), { yaw: R() * 6, at: a.w.clone().add(V(0, a.r * 0.5, 0)), scale: 0.9 }));
  [spots[1], spots[2], spots[5], spots[7]].forEach((a, i) => a && put('moss_clump', moss(600 + i), { yaw: R() * 6, at: a.w.clone().add(V(0, a.r * 0.6, 0)), scale: 0.8 }));

  // distant mountain range along the back glass, with a gap in the middle for the falls
  // crests reach the tank rim (6.2); the right range stands a little taller than the left
  [[-5.3, -2.55, 1.0, 5.5, 0.7], [-4.1, -2.62, 0.9, 5.8, 0.7], [-2.9, -2.5, 0.8, 5.4, 0.6], [-1.8, -2.6, 0.7, 5.7, 0.6], [-0.75, -2.5, 0.6, 5.3, 0.55],
   [1.55, -2.5, 0.65, 5.6, 0.55], [2.6, -2.62, 0.8, 6.1, 0.6], [3.7, -2.5, 0.9, 5.8, 0.7], [4.8, -2.6, 1.0, 6.2, 0.7], [5.7, -2.5, 0.7, 5.9, 0.6],
   [-3.4, -2.86, 0.5, 5.9, 0.3], [3.1, -2.86, 0.5, 6.2, 0.3], [0.4, -2.9, 0.75, 5.8, 0.32], [-0.2, -2.75, 0.45, 5.4, 0.35], [1.05, -2.75, 0.45, 5.7, 0.35]]
    .forEach(([x, z, sx, sy, sz], i) => put('rock_cliff', cliff(900 + i * 11, sx, sy, sz), { yaw: (R() - 0.5) * 0.6, at: V(x, 0, z), scale: 1 }));

  const rocks = [['rock_seiryu_a', 2.4, 1.0, 0.9, 0.4], ['rock_seiryu_b', 3.5, 1.7, 0.65, 1.3], ['rock_seiryu_a', -1.7, 1.7, 0.5, 2.2]];
  rocks.forEach(([id, x, z, s, yaw], i) => put(id, seiryu(31 + i * 7, ...(id.endsWith('a') ? [1.3, 1.0, 1.0] : [0.9, 1.3, 0.8])), { yaw, at: V(x, 0, z), scale: s }));
  const nearRock = (x, z) => rocks.some(([, rx, rz, s]) => Math.hypot(x - rx, z - rz) < s * 1.3);
  let n = 0;
  for (let tries = 0; tries < 200 && n < 30; tries++) {
    const x = -5.6 + R() * 11.2, z = 0.6 + R() * 2.1;
    if (nearRock(x, z) || Math.abs(x - riverXAt(z)) < 0.8) continue;
    put('plant_hairgrass', hairgrass(700 + n), { yaw: R() * 6, at: V(x, 0, z), scale: 0.7 + R() * 0.6 });
    n++;
  }

  const meshes = [], swaying = [], byKind = {};
  for (const [id, parts] of Object.entries(bucket)) {
    const kind = CATALOGUE.find(c => c.id === id).kind;
    const m = toMesh(id, parts, mats[MAT_OF[kind]], kind === 'plant');
    group.add(m); meshes.push(m);
    (byKind[kind] ||= []).push(m);
    if (kind === 'plant') swaying.push(m);
  }
  const water = buildWater(); group.add(water); byKind.water = [water];
  return { group, clip: swayClip(swaying), meshes, byKind };
}
