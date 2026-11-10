// Procedural aquarium fauna: neon tetra and red cherry shrimp.
// Same conventions as aquarium-assets.js: 1 unit = 10 cm, Y up, head toward +X.
// Each animal is rebuilt for every frame of its cycle; the frames become morph targets driven by a looping clip.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const TAU = Math.PI * 2;

// ---------- geometry helpers ----------
function paint(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
// bilinear patch: A-B is the base edge, D-C the far edge (C sits on B's side); u across, v base->far
function patch(A, B, C, D, su = 6, sv = 8, warp = null) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= sv; i++) for (let j = 0; j <= su; j++) {
    const u = j / su, v = i / sv;
    let p = A.clone().lerp(B, u).lerp(D.clone().lerp(C, u), v);
    if (warp) p = warp(p, u, v);
    pos.push(p.x, p.y, p.z); uv.push(u, v);
  }
  grid(sv, su, idx);
  return indexed(pos, uv, idx);
}
function tube(pts, segs, radial, rFn) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, P = curve.getPointAt(t), r = rFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU;
      const n = fr.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r); uv.push(t, j / radial);
    }
  }
  grid(segs, radial, idx);
  return indexed(pos, uv, idx);
}
function ellipsoid(c, s, rotZ = 0, ws = 18, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.applyMatrix4(new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotZ)), s));
  return g;
}
function canvasTex(name, w, h, fill, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 1] = fill((x + 0.5) / w, 1 - (y + 0.5) / h), i = (y * w + x) * 4;
    img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.name = name; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, canvas: c };
}

// frames -> one mesh per material, base pose = frame 0, every other frame a morph target, one-hot keyframes
function animated(rootName, clipName, frames, period, mats, scale) {
  const N = 16, perFrame = [];
  for (let f = 0; f < N; f++) perFrame.push(frames(f / N * TAU));
  const group = new THREE.Group(); group.name = rootName;
  const meshes = [];
  for (const key of Object.keys(perFrame[0])) {
    const geos = perFrame.map(fr => { const g = mergeGeometries(fr[key]); g.scale(scale, scale, scale); return g; });
    const base = geos[0];
    base.morphAttributes.position = geos.slice(1).map(g => g.attributes.position);
    base.morphTargetsRelative = false;
    base.computeBoundingSphere();
    const m = new THREE.Mesh(base, mats[key]); m.name = `${rootName}_${key}`; m.updateMorphTargets();
    group.add(m); meshes.push(m);
  }
  const times = [], vals = [];
  for (let f = 0; f <= N; f++) { times.push(f / N * period); for (let j = 0; j < N - 1; j++) vals.push(j === (f % N) - 1 ? 1 : 0); }
  const clip = new THREE.AnimationClip(clipName, period, meshes.map(m => new THREE.NumberKeyframeTrack(`${m.name}.morphTargetInfluences`, times, vals)));
  return { object: group, clip };
}

// ---------- neon tetra (Paracheirodon innesi), 3.5 cm ----------
const tetraProfile = t => {
  t = clamp(t, 0, 1);
  const r = t < 0.32 ? Math.pow(Math.sin(t / 0.32 * Math.PI / 2), 0.85) : 0.2 + 0.8 * Math.pow(Math.cos((t - 0.32) / 0.68 * Math.PI / 2), 1.1);
  return r * 0.13;
};
export function buildTetra() {
  const canvases = [];
  // body skin, u = head->tail, v = around (0 back, 0.5 belly)
  const skin = canvasTex('neon_tetra_skin', 512, 256, (u, v) => {
    const yn = Math.cos(v * TAU);
    const back = mixc([0.42, 0.45, 0.33], [0.3, 0.33, 0.24], smooth(0.5, 1, yn));
    const silver = [0.86, 0.88, 0.9], red = [0.86, 0.1, 0.08];
    let c = yn > 0.1 ? back : mixc(silver, red, smooth(0.3, 0.42, u) * smooth(-0.95, -0.4, yn) + smooth(0.3, 0.42, u) * (1 - smooth(-0.95, -0.4, yn)) * 1.0);
    c = mixc(c, [0.78, 0.8, 0.78], smooth(0.12, 0.0, u) * 0.6);
    const stripe = smooth(0.15, 0.1, Math.abs(yn - 0.26)) * smooth(0.1, 0.16, u) * smooth(0.86, 0.8, u);
    c = mixc(c, mixc([0.3, 0.95, 1.0], [0.15, 0.5, 1.0], smooth(0.2, 0.8, u)), stripe);
    if (u > 0.86) c = mixc(c, yn < 0.2 ? red : [0.75, 0.75, 0.7], 0.6);
    return c;
  });
  const glow = canvasTex('neon_tetra_glow', 512, 256, (u, v) => {
    const yn = Math.cos(v * TAU);
    const s = smooth(0.14, 0.09, Math.abs(yn - 0.26)) * smooth(0.1, 0.16, u) * smooth(0.86, 0.8, u);
    return [0.2 * s, 0.75 * s, 1.0 * s];
  });
  const finTex = canvasTex('fin_rays', 256, 256, (u, v) => {
    const ray = 0.5 + 0.5 * Math.cos(u * 70);
    const a = (0.22 + 0.25 * ray) * smooth(1.0, 0.85, v) * (0.75 + 0.25 * smooth(0, 0.3, v));
    return [1, 1, 1, a];
  });
  canvases.push(['neon_tetra_skin', skin.canvas], ['neon_tetra_glow', glow.canvas], ['fin_rays', finTex.canvas]);
  const mats = {
    body: new THREE.MeshPhysicalMaterial({ name: 'neon_tetra_body', map: skin.tex, emissiveMap: glow.tex, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.15, clearcoat: 0.6, iridescence: 0.4 }),
    fin: new THREE.MeshStandardMaterial({ name: 'neon_tetra_fin_clear', map: finTex.tex, color: 0xdfe9ec, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4 }),
    finRed: new THREE.MeshStandardMaterial({ name: 'neon_tetra_fin_red', map: finTex.tex, color: 0xe2432a, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4 }),
    eye: new THREE.MeshStandardMaterial({ name: 'neon_tetra_eye', vertexColors: true, roughness: 0.1, metalness: 0.3 }),
  };
  const X = t => 0.5 - t;
  const deform = (p, ph) => {
    const t = clamp((0.5 - p.x), 0, 1.4);
    return V(p.x, p.y, p.z + Math.sin(t * 5 - ph) * 0.1 * t * t - Math.sin(-ph) * 0.004);
  };
  const frames = ph => {
    const D = g => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const q = deform(V(p.getX(i), p.getY(i), p.getZ(i)), ph); p.setXYZ(i, q.x, q.y, q.z); } g.computeVertexNormals(); return g; };
    // body
    const SEG = 60, RAD = 28, pos = [], uv = [], idx = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, r = tetraProfile(t);
      for (let j = 0; j <= RAD; j++) { const a = j / RAD * TAU; pos.push(X(t), Math.cos(a) * r - 0.01, Math.sin(a) * r * 0.52); uv.push(t, j / RAD); }
    }
    grid(SEG, RAD, idx);
    const body = D(indexed(pos, uv, idx));
    const top = t => tetraProfile(t) - 0.01, bot = t => -tetraProfile(t) - 0.01;
    const flap = (amp, f = 1, o = 0) => (p, u, v) => p.add(V(0, 0, Math.sin(ph * f + o + v * 2) * amp * v));
    const fins = [], red = [];
    [1, -1].forEach(s => red.push(D(patch(V(-0.44, -0.01), V(-0.44, -0.01 + s * 0.045), V(-0.75, -0.01 + s * 0.2), V(-0.62, -0.01 + s * 0.035), 5, 8))));
    fins.push(D(patch(V(0.02, top(0.48)), V(-0.1, top(0.6)), V(-0.18, top(0.6) + 0.11), V(-0.03, top(0.48) + 0.13), 5, 6)));
    fins.push(D(patch(V(-0.04, bot(0.54)), V(-0.33, bot(0.82)), V(-0.35, bot(0.82) - 0.05), V(-0.08, bot(0.54) - 0.09), 8, 5)));
    fins.push(D(patch(V(-0.32, top(0.82)), V(-0.37, top(0.87)), V(-0.4, top(0.87) + 0.03), V(-0.33, top(0.82) + 0.035), 3, 3)));
    [1, -1].forEach(s => {
      fins.push(D(patch(V(0.3, -0.06, s * 0.055), V(0.27, -0.08, s * 0.055), V(0.16, -0.1, s * 0.12), V(0.2, -0.05, s * 0.13), 4, 6, flap(0.03 * s, 2, s))));
      fins.push(D(patch(V(0.06, bot(0.44) + 0.01, s * 0.02), V(0.0, bot(0.5) + 0.01, s * 0.02), V(-0.07, bot(0.5) - 0.06, s * 0.05), V(0.0, bot(0.44) - 0.06, s * 0.05), 3, 5)));
    });
    const eyes = [1, -1].map(s => paint(D(ellipsoid(V(0.38, 0.02, s * 0.045), V(0.042, 0.042, 0.026))), (x, y, z, nx, ny, nz) => {
      const f = nz * s, up = ny;
      if (f > 0.86) return [0.01, 0.01, 0.02];
      if (f > 0.55) return up > 0.25 ? [0.15, 0.55, 0.95] : [0.8, 0.82, 0.8];
      return [0.45, 0.48, 0.42];
    }));
    return { body: [body], fin: fins, finRed: red, eye: eyes };
  };
  const out = animated('NeonTetra', 'Swim', frames, 0.8, mats, 0.35);
  return { ...out, canvases, label: 'Cá neon (Paracheirodon innesi)' };
}

// ---------- red cherry shrimp (Neocaridina davidi), 2.5 cm ----------
export function buildShrimp() {
  const mats = {
    shell: new THREE.MeshPhysicalMaterial({ name: 'cherry_shrimp_shell', vertexColors: true, side: THREE.DoubleSide, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: 0x3a0000, emissiveIntensity: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ name: 'cherry_shrimp_eye', color: 0x050505, roughness: 0.05, metalness: 0.4 }),
  };
  const red = lin(0xd8121a), deep = lin(0x86070b), light = lin(0xff5048), leg = lin(0xe8463e), joint = lin(0xffb0a0);
  const shellColor = (x, y, z) => {
    const sp = h3(Math.floor(x * 70), Math.floor(y * 70), Math.floor(z * 70));
    let c = mixc(red, deep, sp > 0.82 ? 0.7 : 0);
    return mixc(c, light, smooth(0.1, 0.0, y - 0.18) * 0.3);
  };
  const strip = g => { g.deleteAttribute('uv'); return g; };
  const frames = ph => {
    const shell = [], eyes = [];
    const add = (g, fn = shellColor) => shell.push(strip(paint(g, fn)));
    const bob = Math.sin(ph) * 0.006;
    // carapace with a slight hump, and the rostrum spike
    add(ellipsoid(V(0.32, 0.32 + bob, 0), V(0.25, 0.13, 0.1), -0.05, 22, 14));
    add(ellipsoid(V(0.2, 0.36 + bob, 0), V(0.16, 0.1, 0.09), 0.1, 18, 12));
    add(tube([V(0.54, 0.33 + bob), V(0.63, 0.36 + bob), V(0.73, 0.39 + bob)], 8, 6, t => mix(0.026, 0.004, t)));
    // abdomen: six overlapping plates along an arched spine, tail flicks a touch
    const flick = Math.sin(ph) * 0.03;
    const spine = new THREE.CatmullRomCurve3([V(0.12, 0.33), V(-0.05, 0.35), V(-0.2, 0.32), V(-0.33, 0.25 + flick * 0.5), V(-0.42, 0.17 + flick), V(-0.47, 0.1 + flick * 1.5)].map(p => p.add(V(0, bob))));
    const radii = [0.12, 0.115, 0.1, 0.085, 0.07, 0.06];
    // one smooth shell with a raised rim where each of the six segments overlaps the next
    add(tube(spine.getPoints(16), 84, 16, t => {
      const f = t * 5.999, k = Math.floor(f), seg = f - k, base = mix(radii[k], radii[Math.min(k + 1, 5)], seg);
      return base * (1 + 0.08 * smooth(0.0, 0.2, seg) - 0.08 * smooth(0.8, 1.0, seg)) * (t > 0.95 ? mix(1, 0.55, (t - 0.95) / 0.05) : 1);
    }));
    radii.forEach((r, i) => {
      const t = (i + 0.5) / 6, P = spine.getPointAt(t), T = spine.getTangentAt(t);
      // swimmerets beat as a wave from front to back
      [1, -1].forEach(s => {
        const sw = Math.sin(ph * 2 - i * 0.9) * 0.5;
        const dir = V(-Math.sin(sw) * 0.5, -Math.cos(sw), 0).normalize();
        const base = P.clone().add(V(0, -r * 0.8, s * r * 0.4));
        add(patch(base, base.clone().add(V(-0.03, 0, 0)), base.clone().addScaledVector(dir, 0.08).add(V(-0.03, 0, s * 0.02)), base.clone().addScaledVector(dir, 0.09).add(V(0, 0, s * 0.02)), 2, 3), () => leg);
      });
    });
    // tail fan: telson plus two pairs of uropods spread flat
    const E = spine.getPointAt(0.97), d = spine.getTangentAt(1).normalize(), n = V(0, 0, 1).add(d.clone().cross(V(0, 0, 1))).normalize();
    [0, 0.45, -0.45, 0.85, -0.85].forEach((a, k) => {
      const dir = d.clone().applyAxisAngle(n, a * 0.8), w = k === 0 ? 0.04 : 0.06, len = k === 0 ? 0.17 : 0.15;
      const side = dir.clone().cross(n).normalize().multiplyScalar(w);
      add(patch(E.clone().sub(side.clone().multiplyScalar(0.4)), E.clone().add(side.clone().multiplyScalar(0.4)), E.clone().addScaledVector(dir, len).add(side.clone().multiplyScalar(0.3)), E.clone().addScaledVector(dir, len).sub(side.clone().multiplyScalar(0.3)), 2, 4), (x, y, z) => mixc(red, light, 0.25));
    });
    [1, -1].forEach(s => {
      // eyes on short stalks
      add(tube([V(0.52, 0.36 + bob, s * 0.04), V(0.56, 0.385 + bob, s * 0.08)], 3, 6, () => 0.015));
      eyes.push(strip(ellipsoid(V(0.565, 0.39 + bob, s * 0.09), V(0.032, 0.03, 0.03), 0, 12, 10)));
      // long antennae reaching forward, waving slowly
      const ant = [V(0.55, 0.33), V(0.76, 0.35, s * 0.05), V(0.98, 0.38, s * 0.12), V(1.2, 0.36, s * 0.2), V(1.42, 0.3, s * 0.27)]
        .map((p, k) => p.add(V(0, bob + Math.sin(ph + k * 0.8) * 0.025 * k, Math.cos(ph + k) * 0.015 * k)));
      add(tube(ant, 24, 4, t => mix(0.01, 0.003, t)), () => mixc(red, light, 0.2));
      // forked antennules
      const b0 = V(0.57, 0.36 + bob, s * 0.02), b1 = V(0.66, 0.4 + bob, s * 0.04);
      add(tube([b0, b1, V(0.76, 0.43 + bob, s * 0.04)], 5, 4, t => mix(0.008, 0.003, t)));
      add(tube([b1, V(0.74, 0.39 + bob, s * 0.08)], 3, 4, t => mix(0.007, 0.003, t)));
      // five walking legs; the stepping wave runs front to back, left and right out of phase
      [0.46, 0.39, 0.32, 0.25, 0.18].forEach((x, i) => {
        const dx = mix(0.1, -0.08, i / 4), step = Math.sin(ph + i * 1.2 + (s > 0 ? 0 : Math.PI));
        const hip = V(x, 0.23 + bob, s * 0.05), knee = V(x + dx * 0.3, 0.25 + bob + Math.max(step, 0) * 0.02, s * 0.2);
        const foot = V(x + dx + step * 0.02, Math.max(step, 0) * 0.015, s * 0.26);
        add(tube([hip, knee, foot], 8, 4, t => mix(0.01, 0.005, t)), (x2, y2) => mixc(leg, joint, smooth(0.04, 0.0, Math.abs(y2 - knee.y)) * 0.6));
      });
    });
    return { shell, eye: eyes };
  };
  const out = animated('CherryShrimp', 'Graze', frames, 1.2, mats, 0.25);
  return { ...out, canvases: [], label: 'Tép đỏ (Neocaridina davidi)' };
}


// ---------- golden apple snail (Pomacea sp.), shell about 4 cm ----------
// shell = a big globose body whorl (deformed sphere with a flat base over the foot) crowned by a small
// stepped spire swept along a logarithmic spiral; both are oriented around one coil axis leaning back and right
function snailShell() {
  const gold = lin(0xf2b31e), deep = lin(0xd38712), apexC = lin(0x9a6a2a);
  const AX = V(-0.45, 0.85, 0.3).normalize(), C = V(-0.05, 0.42, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), AX);
  const growth = (ang, k) => 0.9 + 0.1 * Math.sin(ang * 38 + k);
  // body whorl
  const bw = new THREE.SphereGeometry(0.42, 56, 40), bp = bw.attributes.position, col = [];
  for (let i = 0; i < bp.count; i++) {
    const v = V(bp.getX(i), bp.getY(i), bp.getZ(i));
    const local = v.clone().applyQuaternion(q.clone().invert());
    const ang = Math.atan2(local.z, local.x), up = local.y / 0.42;
    v.multiply(V(1.04, 0.92, 0.95));
    v.y = Math.max(v.y, -0.3);
    bp.setXYZ(i, v.x + C.x, v.y + C.y, v.z + C.z);
    let c = mixc(deep, gold, 0.75 * growth(ang, up * 2));
    c = mixc(c, deep, smooth(0.6, 0.95, up) * 0.45);
    col.push(...c);
  }
  bw.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  bw.computeVertexNormals();
  // spire
  const TURNS = 2.6, K = Math.log(2.1) / TAU, TH = TURNS * TAU, R_END = 0.2, r0 = R_END / Math.exp(K * TH);
  const SU = 240, SV = 20, pos = [], sc = [], uv = [], idx = [];
  for (let i = 0; i <= SU; i++) {
    const th = i / SU * TH, r = r0 * Math.exp(K * th), R = 0.9 * r, h = -1.25 * r;
    const rad = V(Math.cos(th), 0, Math.sin(th));
    for (let j = 0; j <= SV; j++) {
      const ph = j / SV * TAU, p = V(0, h, 0).addScaledVector(rad, R + r * Math.cos(ph)).add(V(0, r * 1.1 * Math.sin(ph), 0));
      pos.push(p.x, p.y, p.z); uv.push(i / SU, j / SV);
      let c = mixc(deep, gold, 0.75 * growth(th, ph));
      c = mixc(c, deep, smooth(0.5, 1, Math.sin(ph)) * 0.4);
      sc.push(...mixc(c, apexC, smooth(0.06, 0.0, r)));
    }
  }
  grid(SU, SV, idx);
  const sp = indexed(pos, uv, idx);
  sp.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  // sink the last spire whorl into the top of the body whorl
  sp.translate(0, 0.19 + 1.25 * R_END, 0);
  sp.applyQuaternion(q); sp.translate(C.x, C.y, C.z);
  sp.deleteAttribute('uv'); bw.deleteAttribute('uv');
  return mergeGeometries([bw, sp]);
}
export function buildSnail() {
  const mats = {
    shell: new THREE.MeshPhysicalMaterial({ name: 'apple_snail_shell', vertexColors: true, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    body: new THREE.MeshPhysicalMaterial({ name: 'apple_snail_body', vertexColors: true, roughness: 0.45, clearcoat: 0.4, sheen: 0.5, sheenColor: 0xfff0d0 }),
    eye: new THREE.MeshStandardMaterial({ name: 'apple_snail_eye', color: 0x0a0806, roughness: 0.1 }),
  };
  const shell0 = snailShell();
  const cream = lin(0xf1e3c4), speck = lin(0xf3c96a), blush = lin(0xe9a07a), pale = lin(0xf7efe0);
  const bodyColor = (x, y, z) => {
    const sp = h3(Math.floor(x * 60), Math.floor(y * 60), Math.floor(z * 60));
    let c = mixc(cream, speck, sp > 0.8 ? 0.5 : 0.1);
    return mixc(c, blush, smooth(0.5, 0.75, x) * smooth(0.2, 0.05, y) * 0.35);
  };
  const strip = g => { g.deleteAttribute('uv'); return g; };
  const frames = ph => {
    const body = [], eye = [];
    const add = (g, fn = bodyColor) => body.push(strip(paint(g, fn)));
    // foot: flat sole, rounded front, pointed tail; a pedal wave rolls along it
    const foot = new THREE.SphereGeometry(1, 40, 20), fp = foot.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      let x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
      const tail = smooth(0, -1, x);
      x = x * 0.68 + 0.08 + Math.sin(ph) * 0.015;
      z = z * 0.24 * (1 - tail * 0.75);
      y = Math.max(y, -0.15) * 0.11 + 0.016 + (y > 0 ? Math.sin(x * 14 - ph) * 0.006 : 0);
      fp.setXYZ(i, x, y, z);
    }
    foot.computeVertexNormals(); add(foot);
    const bob = Math.sin(ph) * 0.01, sway = Math.sin(ph) * 0.03;
    // neck and snout reaching out of the aperture
    add(ellipsoid(V(0.42, 0.17 + bob, 0), V(0.22, 0.14, 0.17), -0.3, 20, 12));
    add(ellipsoid(V(0.62, 0.11 + bob, 0), V(0.13, 0.07, 0.12), -0.15, 18, 10));
    const wave = (k, amp, o) => Math.sin(ph + k * 0.9 + o) * amp * k;
    [1, -1].forEach(s => {
      // labial tentacles, short and forward
      add(tube([V(0.7, 0.1 + bob, s * 0.05), V(0.82, 0.05 + bob, s * 0.15), V(0.92, 0.025, s * 0.25 + wave(1, 0.02, s))], 10, 6, t => mix(0.028, 0.008, t)), () => pale);
      // cephalic tentacles: long whips sweeping out to the side
      const ct = [V(0.55, 0.2 + bob, s * 0.1), V(0.68, 0.23 + bob, s * 0.3), V(0.74, 0.2, s * 0.6), V(0.68, 0.14, s * 0.9), V(0.56, 0.08, s * 1.15)]
        .map((p, k) => p.add(V(wave(k, 0.012, s), wave(k, 0.008, 1 + s), 0)));
      add(tube(ct, 24, 6, t => mix(0.024, 0.004, t)), () => pale);
      // eyes on small stalks at the tentacle base
      add(tube([V(0.52, 0.21 + bob, s * 0.13), V(0.53, 0.25 + bob, s * 0.17)], 3, 6, () => 0.022));
      eye.push(strip(ellipsoid(V(0.535, 0.262 + bob, s * 0.175), V(0.02, 0.02, 0.02), 0, 10, 8)));
    });
    // breathing siphon curled up on the left side
    add(tube([V(0.3, 0.22, 0.17), V(0.32, 0.36, 0.25), V(0.27, 0.5, 0.27), V(0.2, 0.56, 0.24)], 12, 8, t => mix(0.045, 0.03, t)), () => mixc(cream, speck, 0.3));
    // operculum riding on the back of the foot
    add(ellipsoid(V(-0.38, 0.13, 0), V(0.16, 0.025, 0.13), 0.35, 16, 8), () => lin(0x8a6a3a));
    const shell = shell0.clone();
    shell.applyMatrix4(new THREE.Matrix4().compose(V(0, bob, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(sway, 0, sway * 0.5)), V(1, 1, 1)));
    return { shell: [shell], body, eye };
  };
  const out = animated('AppleSnail', 'Crawl', frames, 2.0, mats, 0.4);
  return { ...out, canvases: [], label: 'Ốc táo vàng (Pomacea)' };
}

export const FAUNA = [
  { id: 'fauna_neon_tetra', build: buildTetra },
  { id: 'fauna_cherry_shrimp', build: buildShrimp },
  { id: 'fauna_apple_snail', build: buildSnail },
];
