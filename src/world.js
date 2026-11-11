
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildLayout, WATERFALL_PATH } from '../aquarium-assets.js';
import { buildCharacter, clampLook, randomLook } from './avatar.js';
import { buildTetra, buildShrimp, buildSnail } from '../aquarium-fauna.js';


export const hooks = {
  toast() {},
  joinDesk() {},
  endFishWatch() {},
  enterFish() {},
  enterSecurity() {},
  leaveSecurity() {},
  seatedQuiet() { return false; },
  islandOf() { return null; },
  myName() { return ''; },
  broadcastFloor() {},
  myId() { return ''; },
  mySlot() { return 0; },
  isHost() { return false; },
  sendFloor() {},
};

// Units: 1 = 1 m. Floor top at y = 0 (3rd floor). Sea lies toward −Z, beach 12 m below.
export const canvas = document.getElementById('stage');
export let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (e) { document.getElementById('err').hidden = false; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb8687a, 140, 650);
export const persp = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
persp.position.set(-17, 14, -24);
export const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
ortho.position.set(0, 60, -1); ortho.up.set(0, 0, -1); ortho.lookAt(0, 0, -1);
export let camera = persp;
export const controls = new OrbitControls(persp, canvas);
controls.target.set(0, 0, 0); controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 1; controls.maxDistance = 90;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(17);
const pick = arr => arr[Math.floor(rng() * arr.length)];
export const T = { value: 0 };

// ---------- sky: red sunset over the sea ----------
const SUN_DIR = new THREE.Vector3(-0.12, 0.045, -1).normalize();
scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSun: { value: SUN_DIR }, uT: T },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    varying vec3 vD; uniform vec3 uSun; uniform float uT;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
    void main(){
      float y = max(vD.y, 0.0);
      float s = max(dot(vD, uSun), 0.0);
      float sea = max(dot(normalize(vec3(vD.x, 0.0, vD.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
      vec3 hor = mix(vec3(0.62,0.3,0.38), vec3(1.0,0.36,0.14), pow(sea, 3.0));
      vec3 mid = vec3(0.45,0.22,0.42), top = vec3(0.08,0.1,0.26);
      vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, y));
      c = mix(c, top, smoothstep(0.12, 0.6, y));
      c += vec3(1.0,0.35,0.1) * pow(s, 8.0) * 0.45 + vec3(1.0,0.5,0.2) * pow(s, 60.0) * 0.6;
      c = mix(c, vec3(1.0,0.22,0.08) * 1.6, smoothstep(0.99955, 0.9997, s));
      vec2 cp = vD.xz / max(vD.y, 0.06) * 1.6 + vec2(uT*0.01, 0.0);
      float cl = smoothstep(0.55, 0.85, fbm(cp)) * smoothstep(0.02, 0.15, y);
      vec3 cloud = mix(vec3(0.35,0.2,0.32), vec3(1.0,0.45,0.3), pow(sea, 2.0) * smoothstep(0.4, 0.0, y));
      c = mix(c, cloud, cl * 0.8);
      if (vD.y < 0.0) c = vec3(0.25,0.15,0.2);
      gl_FragColor = vec4(c, 1.0);
    }`,
})));

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x9a86c4, 0x3a2620, 0.6));
const sunL = new THREE.DirectionalLight(0xff7a3c, 2.4);
sunL.position.set(-0.2, 0.24, -1).normalize().multiplyScalar(60); sunL.target.position.set(0, 0, -1);
scene.add(sunL.target);
sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048);
Object.assign(sunL.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 160 });
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.02;
scene.add(sunL);

// ---------- textures ----------
function canvasTex(w, h, draw, name = '') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.name = name; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const rr = (a, b) => a + rng() * (b - a);
const oakTex = canvasTex(512, 512, (g, w, h) => {
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = r * h / rows, b = rr(200, 222);
    g.fillStyle = `rgb(${b},${b - 28},${b - 62})`; g.fillRect(0, y, w, h / rows);
    for (let k = 0; k < 30; k++) { g.strokeStyle = `rgba(120,80,40,${rr(0.04, 0.1)})`; g.beginPath(); const yy = y + rr(2, h / rows - 2); g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + rr(-3, 3), w * .6, yy + rr(-3, 3), w, yy); g.stroke(); }
    g.fillStyle = 'rgba(90,60,30,0.45)'; g.fillRect(0, y, w, 2); g.fillRect(rr(0.2, 0.8) * w, y, 2, h / rows);
  }
}, 'oak');
oakTex.wrapS = oakTex.wrapT = THREE.RepeatWrapping; oakTex.repeat.set(9, 5.5);
const teakTex = oakTex.clone(); teakTex.repeat.set(9, 1);
const sandTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#e3cfa6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rr(150, 255)},${rr(130, 230)},${rr(90, 180)},0.3)`; g.fillRect(rr(0, w), rr(0, h), 1.5, 1.5); }
}, 'sand');
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(60, 25);
const facadeTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#eef1f0'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    g.fillStyle = (r + c) % 3 ? '#7fb3c8' : '#9cc7d6'; g.fillRect(c * 64 + 6, r * 64 + 10, 52, 40);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(c * 64 + 6, r * 64 + 10, 52, 6);
  }
}, 'facade');
facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping; facadeTex.repeat.set(7, 3);
function codeTex(seed) {
  const r = mulberry32(seed);
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#131e29'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2e3c'; g.fillRect(0, 0, w, 12); g.fillRect(0, 12, 34, h);
    const cols = ['#7fd6c8', '#ffb067', '#9ab8ff', '#e6edf0', '#ff7a90', '#c3e88d'];
    let y = 20, ln = 1;
    while (y < h - 6) {
      g.fillStyle = '#44586a'; g.fillRect(8, y, 14, 4);
      let x = 42 + Math.floor(r() * 4) * 10; const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) { const len = 10 + r() * 46; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, len, 4); x += len + 6; if (x > w - 12) break; }
      y += 9; ln++;
    }
  }, 'code' + seed);
}
const codeTexes = [1, 2, 3, 4, 5].map(codeTex);
const screenMats = codeTexes.map(t => new THREE.MeshBasicMaterial({ map: t }));
export const burndownTex = canvasTex(512, 288, (g, w, h) => {
  g.fillStyle = '#131e29'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e6edf0'; g.font = '600 22px sans-serif'; g.fillText('Sprint 24 · Burndown', 24, 38);
  g.strokeStyle = '#2c3e4f'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(40, 70 + i * 45); g.lineTo(w - 24, 70 + i * 45); g.stroke(); }
  g.strokeStyle = '#4c6275'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(40, 70); g.lineTo(w - 24, 250); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#3fd0c0'; g.lineWidth = 4; g.beginPath();
  const pts = [70, 82, 95, 120, 128, 150, 178, 190, 214];
  pts.forEach((v, i) => { const x = 40 + i * 50; i ? g.lineTo(x, v) : g.moveTo(x, v); }); g.stroke();
  g.fillStyle = '#ffb067'; g.beginPath(); g.arc(40 + 8 * 50, 214, 6, 0, 7); g.fill();
}, 'burndown');
const coffeeSignTex = canvasTex(512, 160, (g, w, h) => {
  g.fillStyle = '#1d3a3a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffb067'; g.font = '700 64px sans-serif'; g.textAlign = 'center'; g.fillText('CÀ PHÊ', w / 2, 82);
  g.fillStyle = '#e6edf0'; g.font = '400 26px monospace'; g.fillText('espresso · bạc xỉu · 7:30–18:00', w / 2, 128);
}, 'coffee_sign');
function paintDevSign(g, w, h, logo) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#f6f8f7'; g.fillRect(0, 0, w, h);
  const title = 'furuCRM';
  const tag = "Let's dream with us!";
  g.font = '700 78px monospace';
  const titleW = g.measureText(title).width;
  g.font = '400 28px sans-serif';
  const textW = Math.max(titleW, g.measureText(tag).width);
  const logoSize = logo ? Math.round(h * 0.72) : 0;
  const gap = logo ? Math.round(h * 0.1) : 0;
  let x = (w - logoSize - gap - textW) / 2;
  const mid = h / 2;
  if (logo) {
    const c = document.createElement('canvas');
    c.width = logo.naturalWidth; c.height = logo.naturalHeight;
    const cg = c.getContext('2d');
    cg.drawImage(logo, 0, 0);
    const img = cg.getImageData(0, 0, c.width, c.height);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) px[i + 3] = Math.max(px[i], px[i + 1], px[i + 2]);
    cg.putImageData(img, 0, 0);
    g.drawImage(c, x, mid - logoSize / 2, logoSize, logoSize);
    x += logoSize + gap;
  }
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = '#142028'; g.font = '700 78px monospace'; g.fillText(title, x, mid - h * 0.08);
  g.fillStyle = '#5a6b70'; g.font = '400 28px sans-serif'; g.fillText(tag, x, mid + h * 0.1);
}
const devSignTex = canvasTex(1024, 512, (g, w, h) => paintDevSign(g, w, h, null), 'dev_sign');
{
  const logo = new Image();
  logo.onload = () => {
    const c = devSignTex.image;
    paintDevSign(c.getContext('2d'), c.width, c.height, logo);
    devSignTex.needsUpdate = true;
  };
  logo.src = 'assets/logo.png';
}
const rackTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#0c0f13'; g.fillRect(0, 0, w, h);
  for (let y = 8; y < h - 8; y += 14) {
    g.fillStyle = '#1b222b'; g.fillRect(8, y, w - 16, 11);
    for (let k = 0; k < 4; k++) { g.fillStyle = rng() < 0.75 ? '#38ff9c' : (rng() < 0.5 ? '#4aa8ff' : '#ffb24a'); g.fillRect(14 + k * 7, y + 4, 3, 3); }
  }
}, 'rack_leds');

// ---------- materials ----------
const M = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const mat = {
  floor: M(0xffffff, 0.6, { map: oakTex }),
  teak: M(0xb07a52, 0.75, { map: teakTex }),
  wall: M(0xf2f3ef, 0.9),
  slab: M(0xdfe3e1, 0.85),
  facade: M(0xffffff, 0.6, { map: facadeTex }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ee, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  frost: new THREE.MeshStandardMaterial({ color: 0xeaf3f3, transparent: true, opacity: 0.6, roughness: 0.4, depthWrite: false, side: THREE.DoubleSide }),
  frame: M(0x2b3a42, 0.5, { metalness: 0.4 }),
  deskTop: M(0xf4f1ea, 0.55),
  deskLeg: M(0x2b3a42, 0.45, { metalness: 0.5 }),
  felt: M(0x6fa89c, 1),
  monitor: M(0x15191e, 0.4),
  chair: M(0x24313a, 0.6),
  chairAccent: M(0x2fa89a, 0.7),
  key: M(0x30363c, 0.6),
  white: M(0xf7f7f4, 0.5),
  chrome: M(0xc8cdd1, 0.2, { metalness: 0.9 }),
  walnut: M(0x6b4a33, 0.6),
  terrazzo: M(0xe9e4dc, 0.45),
  coral: M(0xff8a5b, 0.8),
  sand: M(0xe1c9a0, 0.95),
  sofa: M(0x3f6f7a, 0.95),
  sofaCush: M(0x4f8592, 0.95),
  rug: M(0xd9cfbf, 1),
  pot: M(0xc9b9a3, 0.8),
  leaf: M(0x3c8a4f, 0.8, { flatShading: true }),
  leaf2: M(0x5aa35f, 0.8, { flatShading: true }),
  booth: M(0x1f4e57, 0.8),
  podShell: M(0xf4f6f5, 0.35),
  podIn: M(0x2fa89a, 0.9),
  podGlow: new THREE.MeshStandardMaterial({ color: 0x9ff3e9, emissive: 0x5fe6d6, emissiveIntensity: 1.6 }),
  rack: M(0x14181d, 0.5, { metalness: 0.3 }),
  rackFront: new THREE.MeshStandardMaterial({ map: rackTex, emissiveMap: rackTex, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.5 }),
  tv: new THREE.MeshBasicMaterial({ map: burndownTex }),
  coffeeSign: new THREE.MeshBasicMaterial({ map: coffeeSignTex }),
  devSign: new THREE.MeshBasicMaterial({ map: devSignTex }),
  trunk: M(0x8a6a4a, 0.95),
  frond: M(0x3f8a3a, 0.85, { side: THREE.DoubleSide, flatShading: true }),
};
const SHIRTS = [0x2fa89a, 0xff8a5b, 0x3b6fb6, 0xf2c14e, 0xe8eef0, 0x7a5cc4, 0x2b3a42, 0xd94f6a].map(c => M(c, 0.85));
const SKIN = [0xf1c9a5, 0xd9a47c, 0xb97a52].map(c => M(c, 0.7));
const HAIR = [0x1d1612, 0x3a2a1e, 0x14100d].map(c => M(c, 0.9));
const PANTS = [0x2b3a42, 0x3a4c5e, 0x5a4a3c].map(c => M(c, 0.9));

// ---------- helpers ----------
export const G = Object.fromEntries(['exterior', 'shell', 'workspace', 'sea_desks', 'cafe', 'lounge', 'nap_room', 'meeting', 'security', 'booths', 'server', 'reception', 'balcony', 'plants', 'people'].map(n => {
  const g = new THREE.Group(); g.name = n; scene.add(g); return [n, g];
}));
export function box(w, h, d, m, x, y, z, parent, shadow = true) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = shadow; parent.add(o); return o;
}
function cyl(rt, rb, h, m, x, y, z, parent, seg = 20) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true; parent.add(o); return o;
}
function plane(w, h, m, x, y, z, ry, parent) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o;
}
function glassWall(x0, z0, x1, z1, h, parent, m = mat.glass, mullion = 1.6) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = -Math.atan2(z1 - z0, x1 - x0);
  const g = new THREE.Group(); g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.rotation.y = ang; parent.add(g);
  const p = box(len, h, 0.03, m, 0, h / 2, 0, g, false);
  box(len, 0.06, 0.07, mat.frame, 0, h, 0, g); box(len, 0.06, 0.07, mat.frame, 0, 0.03, 0, g);
  const n = Math.max(1, Math.round(len / mullion));
  for (let i = 0; i <= n; i++) box(0.05, h, 0.07, mat.frame, -len / 2 + len * i / n, h / 2, 0, g);
  return g;
}
function solidWall(x0, z0, x1, z1, h, parent, m = mat.wall) {
  const len = Math.hypot(x1 - x0, z1 - z0), w = box(len, h, 0.18, m, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, parent);
  w.rotation.y = -Math.atan2(z1 - z0, x1 - x0); return w;
}

// people: model faces +Z
export function seated(parent, x, z, yaw, y0 = 0, look) {
  const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = yaw;
  const avatar = buildCharacter(clampLook(look) || randomLook());
  avatar.root.position.z = -0.2;
  g.add(avatar.root);
  g.userData.avatar = avatar;
  parent.add(g); return g;
}
function walkerModel() {
  const g = new THREE.Group(); const shirt = SHIRTS[1], pants = PANTS[0];
  const legs = [-1, 1].map(s => { const pivot = new THREE.Group(); pivot.position.set(s * 0.1, 0.84, 0); box(0.12, 0.82, 0.14, pants, 0, -0.41, 0, pivot); g.add(pivot); return pivot; });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 4, 10), shirt); torso.position.y = 1.2; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), SKIN[1]); head.position.y = 1.62; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), HAIR[0]); hair.position.y = 1.63; g.add(hair);
  const mug = cyl(0.04, 0.035, 0.1, mat.white, 0.24, 1.0, 0.12, g, 12);
  const tc = document.createElement('canvas'); tc.width = 256; tc.height = 64;
  const paint = () => {
    const ctx = tc.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(8,28,42,0.9)'; ctx.beginPath(); ctx.roundRect(4, 8, 248, 48, 16); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.font = '700 28px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillText('Phục vụ', 48, 42);
  };
  paint();
  const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.ready.then(() => { paint(); tex.needsUpdate = true; });
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  tag.scale.set(0.72, 0.18, 1); tag.position.y = 1.95; g.add(tag);
  return { g, legs, mug };
}
function officeChair(parent, x, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
  box(0.48, 0.07, 0.46, mat.chair, 0, 0.47, 0, g);
  const back = box(0.46, 0.52, 0.06, mat.chairAccent, 0, 0.8, -0.24, g); back.rotation.x = -0.1;
  cyl(0.025, 0.025, 0.4, mat.chrome, 0, 0.25, 0, g, 8);
  cyl(0.28, 0.28, 0.04, mat.chair, 0, 0.05, 0, g, 5);
  parent.add(g); return g;
}
function plant(x, z, s = 1, parent = G.plants) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  cyl(0.2, 0.15, 0.42, mat.pot, 0, 0.21, 0, g, 14);
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.18, 0.28), 0), rng() < 0.5 ? mat.leaf : mat.leaf2);
    l.position.set(rr(-0.18, 0.18), rr(0.6, 1.25), rr(-0.18, 0.18)); l.castShadow = true; g.add(l);
  }
  cyl(0.015, 0.015, 0.9, mat.trunk, 0, 0.8, 0, g, 6);
  parent.add(g); return g;
}

// ---------- exterior: building, beach, sea, palms ----------
const BEACH_Y = -12, SEA_Y = -12.3, SHORE_Z = -30.5;
{
  const ex = G.exterior;
  box(26.6, 12, 16.6, mat.facade, 0, -6.15, 0, ex).name = 'building_below';
  const sandY = z => z > -28 ? BEACH_Y : BEACH_Y + (z + 28) * 0.12;
  const g = new THREE.PlaneGeometry(500, 160, 120, 60); g.rotateX(-Math.PI / 2); g.translate(0, 0, -50);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, sandY(p.getZ(i)) + Math.sin(p.getX(i) * 0.4) * Math.cos(p.getZ(i) * 0.3) * 0.06);
  g.computeVertexNormals();
  const sand = new THREE.Mesh(g, M(0xffffff, 1, { map: sandTex })); sand.receiveShadow = true; ex.add(sand);
  // promenade
  box(500, 0.1, 5, M(0xcfc8bd, 0.9), 0, BEACH_Y + 0.05, -11.5, ex);
  // distant islands
  const hillM = M(0x8fb1bf, 1, { flatShading: true });
  for (const [x, z, r, h] of [[-160, -320, 60, 22], [-90, -340, 40, 14], [140, -300, 70, 26]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), hillM); c.position.set(x, SEA_Y + h / 2 - 2, z); c.scale.z = 0.5; ex.add(c);
  }
  // palms
  function palm(x, z, h, lean) {
    const pg = new THREE.Group(); pg.position.set(x, sandY(z), z); pg.rotation.y = rr(0, 6.28);
    let px = 0, py = 0; const seg = 7;
    for (let i = 0; i < seg; i++) {
      const s = cyl(0.22 - i * 0.015, 0.26 - i * 0.015, h / seg + 0.05, mat.trunk, px, py + h / seg / 2, 0, pg, 8);
      s.rotation.z = -lean * (i / seg); px += Math.sin(lean * i / seg) * h / seg; py += Math.cos(lean * i / seg) * h / seg;
    }
    for (let k = 0; k < 8; k++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.4, 4, 1, true), mat.frond);
      f.scale.set(1, 1, 0.12); f.position.set(px, py, 0);
      f.rotation.set(0, k / 8 * Math.PI * 2, 0); f.rotateZ(Math.PI / 2 + 0.45); f.translateY(1.6); f.castShadow = true; pg.add(f);
    }
    ex.add(pg);
  }
  for (let i = 0; i < 16; i++) palm(rr(-60, 60), rr(-24, -14), rr(7, 10), rr(0.1, 0.4));
}
// sea
export const seaMat = new THREE.ShaderMaterial({
  transparent: true, fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uSun: { value: SUN_DIR }, uShore: { value: SHORE_Z } }]),
  vertexShader: `
    uniform float uT; varying vec3 vW;
    #include <fog_pars_vertex>
    void main(){
      vec3 p = position;
      p.y += sin(p.x*0.12 + uT*0.8)*0.12 + sin(p.z*0.21 - uT*1.1)*0.14;
      vec4 w = modelMatrix * vec4(p,1.); vW = w.xyz;
      vec4 mvPosition = viewMatrix * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `
    uniform float uT; uniform vec3 uSun; uniform float uShore; varying vec3 vW;
    #include <fog_pars_fragment>
    float n(vec2 p){ return sin(p.x)*sin(p.y); }
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      vec2 q = vW.xz;
      vec3 N = normalize(vec3(0.1*cos(q.x*0.12+uT*0.8) + 0.07*n(q*1.3+uT) + 0.03*n(q*4.1-uT*1.7), 1.0,
                              0.12*cos(q.y*0.21-uT*1.1) + 0.07*n(q.yx*1.7-uT) + 0.03*n(q.yx*3.7+uT*1.3)));
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 deep = vec3(0.06,0.1,0.22), shallow = vec3(0.22,0.3,0.42);
      float d = clamp((uShore - vW.z) / 40.0, 0.0, 1.0);
      vec3 c = mix(shallow, deep, d);
      c = mix(c, vec3(0.85,0.42,0.38), fres * 0.6);
      vec3 R = reflect(-V, N);
      float rs = max(dot(R, uSun), 0.0);
      c += vec3(1.0,0.38,0.12) * (pow(rs, 40.0) * 0.9 + pow(rs, 400.0) * 3.0);
      float dist = vW.z - uShore, foam = 0.0;
      for (int i = 0; i < 3; i++) {
        float f = float(i), pos = -mod(uT*0.5 + f*1.4, 4.2);
        foam += smoothstep(0.45, 0.0, abs(dist - pos - sin(vW.x*0.3+f)*0.4)) * (1.0 - (-pos)/4.2);
      }
      foam += smoothstep(-0.8, 0.2, dist);
      c = mix(c, vec3(0.97,0.98,0.96), clamp(foam, 0.0, 1.0) * 0.85);
      gl_FragColor = vec4(c, mix(0.95, 0.55, smoothstep(-2.5, 0.3, dist)));
      #include <fog_fragment>
    }`,
});
{
  const g = new THREE.PlaneGeometry(1200, 600, 240, 120); g.rotateX(-Math.PI / 2); g.translate(0, SEA_Y, SHORE_Z + 2 - 300);
  const sea = new THREE.Mesh(g, seaMat); sea.name = 'sea_surface'; G.exterior.add(sea);
}
// sailboat
export const boat = new THREE.Group();
{
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 6, 10, 1, false, 0, Math.PI), mat.white);
  hull.rotation.set(Math.PI / 2, 0, Math.PI / 2); hull.position.y = 0.4; boat.add(hull);
  cyl(0.06, 0.06, 7, mat.white, 0, 3.8, 0, boat, 6);
  const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 7.2, 0), new THREE.Vector3(-3, 1, 0)]), M(0xfff6ea, 0.8, { side: THREE.DoubleSide }));
  sail.geometry.computeVertexNormals(); boat.add(sail);
  boat.position.set(-60, SEA_Y, -120); scene.add(boat);
}

// ---------- seagulls ----------
export const gulls = [];
{
  const white = M(0xf4f1ec, 0.8, { side: THREE.DoubleSide }), tip = M(0x2a2a2a, 0.8, { side: THREE.DoubleSide });
  const wingGeo = pts => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); return g; };
  const innerGeo = wingGeo([0, 0, 0.13, 0.45, 0, 0.1, 0, 0, -0.1, 0.45, 0, 0.1, 0.45, 0, -0.12, 0, 0, -0.1]);
  const outerGeo = wingGeo([0, 0, 0.1, 0.55, 0, -0.1, 0, 0, -0.12]);
  const bodyGeo = new THREE.SphereGeometry(1, 12, 8), headGeo = new THREE.SphereGeometry(0.075, 10, 8);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.scale.setScalar(rr(1.2, 1.6)); scene.add(g);
    const body = new THREE.Mesh(bodyGeo, white); body.scale.set(0.09, 0.08, 0.3); g.add(body);
    const head = new THREE.Mesh(headGeo, white); head.position.set(0, 0.04, 0.26); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 6), M(0xf2b233, 0.6)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.03, 0.36); g.add(beak);
    const wings = [-1, 1].map(s => {
      const inner = new THREE.Group(); inner.position.set(s * 0.05, 0.02, 0); g.add(inner);
      const im = new THREE.Mesh(innerGeo, white); im.scale.x = s; inner.add(im);
      const outer = new THREE.Group(); outer.position.set(s * 0.45, 0, 0); inner.add(outer);
      const om = new THREE.Mesh(outerGeo, tip); om.scale.x = s; outer.add(om);
      return { s, inner, outer };
    });
    gulls.push({
      g, wings,
      cx: rr(-22, 22), cz: rr(-16, -38), rx: rr(10, 26), rz: rr(3, 9), y: rr(-1.5, 7),
      speed: rr(0.12, 0.22) * (rng() < 0.5 ? -1 : 1), a: rr(0, 6.28), flap: rr(7, 10), ph: rr(0, 6.28),
    });
  }
}

// ---------- shell: floor, glass façade, walls ----------
{
  const s = G.shell;
  box(26.4, 0.3, 16.4, mat.slab, 0, -0.16, 0, s);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), mat.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.005; fl.receiveShadow = true; fl.name = 'floor_oak'; s.add(fl);
  glassWall(-13, -8, 13, -8, 3, s, mat.glass, 2.6);          // sea façade
  glassWall(13, -8, 13, 8, 3, s, mat.glass, 2.6);            // side façade
  solidWall(-13, -8, -13, 8, 3, s);
  solidWall(-13, 8, -4.8, 8, 3, s); solidWall(-3.4, 8, 13, 8, 3, s);
  box(1.4, 0.4, 0.18, mat.wall, -4.1, 2.8, 8, s);            // door lintel
  // columns
  for (const [x, z] of [[-6.5, -2.2], [6.5, -2.2], [-6.5, 6.4], [6.5, 6.4]]) box(0.4, 3, 0.4, mat.wall, x, 1.5, z, s);
}

// ---------- work desks you can sit at: 4 islands × 8 + 6 sea desks ----------
export const islands = [];
export const pickers = [];
export let meetingTvMat = null;
export let meetingTvMesh = null;
export let securityTag = null;
export let fishTag = null;
export let watchingFish = false;
export let fishPose = null;
export let inSecurity = false;
export let securityPose = null;
export let securityBlocked = false;
export const SECURITY_URL = 'https://furu-agentforce.my.site.com/pwas/s/login/?ec=302&startURL=%2Fpwas%2Fs%2F';
let islandCursor = null;
export const facesEl = document.getElementById('faces');
export const deskTagsEl = document.getElementById('deskTags');
function faceDisc() {
  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.muted = true;
  video.setAttribute('playsinline', '');
  const videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 32),
    new THREE.MeshBasicMaterial({ map: videoTex, toneMapped: false, side: THREE.DoubleSide })
  );
  const frame = new THREE.Mesh(
    new THREE.RingGeometry(0.085, 0.105, 32),
    new THREE.MeshBasicMaterial({ color: 0x102028, side: THREE.DoubleSide })
  );
  frame.position.z = -0.006;
  const g = new THREE.Group();
  g.add(frame, face);
  g.visible = false;
  g.renderOrder = 3;
  scene.add(g);
  const tag = document.createElement('div');
  tag.className = 'facename';
  tag.hidden = true;
  facesEl.appendChild(tag);
  g.userData = { video, videoTex, face, frame, tag, avatarTex: null, avatarName: '' };
  return g;
}
function startIsland(label, zone) {
  islandCursor = { label, zone, seats: [], screens: [] };
  islands.push(islandCursor);
}
function registerSeat(deskGroup, prop) {
  deskGroup.updateWorldMatrix(true, false);
  const p = new THREE.Vector3(0, 0, 0.66);
  deskGroup.localToWorld(p);
  const q = new THREE.Quaternion();
  deskGroup.getWorldQuaternion(q);
  const yawPerson = new THREE.Euler().setFromQuaternion(q, 'YXZ').y + Math.PI;
  const slot = islandCursor.seats.length;
  islandCursor.seats.push({ x: p.x, z: p.z, yaw: yawPerson, prop });
  islandCursor.screens.push(faceDisc());
  const picker = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.05, 0.78),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  picker.position.set(0, 0.85, 0.1);
  picker.userData.island = islands.length - 1;
  picker.userData.slot = slot;
  deskGroup.add(picker);
  pickers.push(picker);
}
function addOpenSeat(x, z, yaw, parent, y = 0, front = false) {
  const slot = islandCursor.seats.length;
  islandCursor.seats.push({ x, z, yaw, y, front, prop: null });
  islandCursor.screens.push(faceDisc());
  const picker = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 1.2, 0.72),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  picker.position.set(x, 0.75 + y, z);
  picker.userData.island = islands.length - 1;
  picker.userData.slot = slot;
  parent.add(picker);
  pickers.push(picker);
}
function tagIsland(island, i) {
  let sx = 0, sz = 0;
  island.seats.forEach((s) => { sx += s.x; sz += s.z; });
  island.center = new THREE.Vector3(sx / island.seats.length, 1.85, sz / island.seats.length);
  const el = document.createElement('div');
  el.className = 'dtag place';
  const sit = document.createElement('button');
  sit.type = 'button';
  sit.className = 'sit';
  sit.innerHTML = '<b>' + island.label + '</b>' + island.seats.length + ' chỗ';
  sit.title = island.zone;
  sit.addEventListener('click', (e) => { e.stopPropagation(); hooks.joinDesk(i, -1); });
  el.appendChild(sit);
  deskTagsEl.appendChild(el);
  island.tag = el;
}

// ---------- workspace: 4 bench clusters × 8 desks, dual monitors ----------
export function desk(parent, x, z, yaw, dual = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; parent.add(g);
  box(1.38, 0.035, 0.7, mat.deskTop, 0, 0.74, 0, g);
  for (const sx of [-0.64, 0.64]) box(0.04, 0.72, 0.6, mat.deskLeg, sx, 0.36, 0, g);
  const screens = dual ? [-0.3, 0.3] : [0];
  screens.forEach((mx, i) => {
    const m = new THREE.Group(); m.position.set(mx, 0, -0.2); m.rotation.y = dual ? (i ? -0.16 : 0.16) : 0; g.add(m);
    box(0.2, 0.02, 0.14, mat.monitor, 0, 0.77, 0, m);
    box(0.04, 0.3, 0.04, mat.monitor, 0, 0.92, -0.02, m);
    box(0.56, 0.34, 0.03, mat.monitor, 0, 1.12, 0, m);
    const sc = plane(0.52, 0.3, screenMats[Math.floor(rng() * screenMats.length)], 0, 1.12, 0.017, 0, m);
  });
  box(0.42, 0.02, 0.13, mat.key, 0, 0.77, 0.12, g);
  if (rng() < 0.35) cyl(0.04, 0.035, 0.1, pick([mat.white, mat.coral, mat.chairAccent]), 0.48, 0.81, 0.08, g, 12);
  officeChair(g, 0, 0.68, Math.PI + rr(-0.25, 0.25));
  if (islandCursor) registerSeat(g, null);
  return g;
}
function cluster(cx, cz, label) {
  const g = new THREE.Group(); g.name = `cluster_${cx}_${cz}`; G.workspace.add(g);
  startIsland(label, 'khu làm việc');
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) desk(g, cx - 2.1 + i * 1.4, cz + s * 0.35, s > 0 ? 0 : Math.PI);
  islandCursor = null;
  box(5.6, 0.36, 0.03, mat.felt, cx, 0.95, cz, g);
}
cluster(-4, 0, 'Zone 1'); cluster(3, 0, 'Zone 2'); cluster(-4, 4, 'Zone 3'); cluster(3, 4, 'Zone 4');

// sea-view hot desks, single low monitor so the horizon stays clear
startIsland('View biển', 'nhìn biển');
for (let i = 0; i < 6; i++) {
  const x = -3.5 + i * 1.4;
  desk(G.sea_desks, x, -6.65, 0, false);
}
islandCursor = null;
islands.forEach(tagIsland);

// ---------- café: counter, espresso, window bar, tables ----------
{
  const c = G.cafe;
  box(0.7, 0.9, 4, mat.white, -12.55, 0.45, -4.6, c);
  box(0.76, 0.05, 4.06, mat.terrazzo, -12.55, 0.925, -4.6, c);
  box(0.4, 0.04, 4, mat.walnut, -12.75, 1.75, -4.6, c);            // shelf
  for (let i = 0; i < 9; i++) cyl(0.045, 0.04, 0.1, i % 3 ? mat.white : mat.coral, -12.75, 1.82, -6.3 + i * 0.42, c, 10);
  // espresso machine
  box(0.5, 0.42, 0.62, mat.chrome, -12.6, 1.16, -4.4, c);
  box(0.52, 0.06, 0.64, mat.coral, -12.6, 1.4, -4.4, c);
  box(0.18, 0.36, 0.18, mat.monitor, -12.6, 1.13, -5.05, c);       // grinder
  cyl(0.11, 0.11, 0.14, mat.leaf2, -12.55, 1.02, -3.4, c, 14);       // fruit bowl
  box(0.72, 1.9, 0.7, mat.chrome, -12.6, 0.95, -2.15, c).name = 'fridge';
  plane(1.8, 0.56, mat.coffeeSign, -12.9, 2.25, -4.6, Math.PI / 2, c);
  // pendant lights
  for (let i = 0; i < 3; i++) {
    const z = -6 + i * 1.4;
    cyl(0.004, 0.004, 0.9, mat.monitor, -12.3, 2.55, z, c, 4);
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 18, 1, true), M(0x1d3a3a, 0.6, { side: THREE.DoubleSide })); sh.position.set(-12.3, 2.05, z); c.add(sh);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe1b0, emissive: 0xffb860, emissiveIntensity: 3 })); b.position.set(-12.3, 1.97, z); c.add(b);
  }
  // window bar facing the sea
  box(6.2, 0.05, 0.42, mat.walnut, -8.5, 1.05, -7.62, c);
  for (const x of [-11.5, -8.5, -5.5]) box(0.05, 1.02, 0.36, mat.frame, x, 0.51, -7.62, c);
  for (let i = 0; i < 6; i++) {
    const x = -11.1 + i * 1.12;
    cyl(0.19, 0.19, 0.05, mat.coral, x, 0.75, -7.12, c, 16);
    cyl(0.025, 0.025, 0.72, mat.chrome, x, 0.38, -7.12, c, 8);
    cyl(0.2, 0.2, 0.02, mat.chrome, x, 0.01, -7.12, c, 16);
  }
  // café tables, each its own quiet seat group
  for (const [tx, tz] of [[-9.6, -4.3], [-7.2, -4.3], [-8.4, -2.5]]) {
    cyl(0.42, 0.42, 0.04, mat.terrazzo, tx, 0.74, tz, c, 24);
    cyl(0.03, 0.03, 0.72, mat.frame, tx, 0.37, tz, c, 8);
    cyl(0.22, 0.22, 0.02, mat.frame, tx, 0.01, tz, c, 16);
    startIsland('Cà phê', 'bàn riêng · ngồi chơi');
    islandCursor.quiet = true;
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2 + 0.4, x = tx + Math.cos(a) * 0.7, z = tz + Math.sin(a) * 0.7, yaw = Math.atan2(tx - x, tz - z);
      const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = yaw; c.add(ch);
      box(0.42, 0.04, 0.42, mat.walnut, 0, 0.45, 0, ch); box(0.42, 0.4, 0.04, mat.walnut, 0, 0.68, -0.2, ch);
      for (const sx of [-0.18, 0.18]) for (const sz of [-0.18, 0.18]) box(0.03, 0.45, 0.03, mat.frame, sx, 0.225, sz, ch);
      addOpenSeat(x, z, yaw, c);
    }
    const table = islandCursor;
    islandCursor = null;
    tagIsland(table, islands.indexOf(table));
  }
}

// ---------- lounge: sofa, bean bags, hanging egg chair ----------
function sofa(parent, x, z, len, yaw) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; parent.add(g);
  box(len, 0.36, 0.88, mat.sofa, 0, 0.2, 0, g);
  box(len, 0.5, 0.22, mat.sofa, 0, 0.6, -0.33, g);
  const n = Math.round(len / 0.9);
  for (let i = 0; i < n; i++) box(len / n - 0.05, 0.12, 0.62, mat.sofaCush, -len / 2 + (i + 0.5) * len / n, 0.44, 0.08, g);
  for (const s of [-1, 1]) box(0.18, 0.55, 0.88, mat.sofa, s * (len / 2 - 0.09), 0.3, 0, g);
  return g;
}
{
  const l = G.lounge;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.2), mat.rug); rug.rotation.x = -Math.PI / 2; rug.position.set(8.4, 0.012, -5.5); rug.receiveShadow = true; l.add(rug);
  sofa(l, 8.2, -3.4, 5.0, Math.PI);
  sofa(l, 11.9, -5.6, 3.2, -Math.PI / 2);
  box(1.6, 0.05, 0.8, mat.walnut, 8.4, 0.38, -5.5, l);
  for (const sx of [-0.7, 0.7]) box(0.05, 0.36, 0.7, mat.frame, 8.4 + sx, 0.18, -5.5, l);
  cyl(0.04, 0.035, 0.1, mat.white, 8.1, 0.45, -5.4, l, 12);
  for (const [x, z, col] of [[6.1, -6.9, 0xff8a5b], [7.6, -7.25, 0xf2c14e], [9.3, -7.05, 0x2fa89a]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), M(col, 0.95)); b.scale.set(1, 0.55, 1); b.position.set(x, 0.27, z); b.castShadow = b.receiveShadow = true; l.add(b);
  }
  // hanging egg chair
  const e = new THREE.Group(); e.position.set(4.8, 0, -4.6); l.add(e);
  cyl(0.4, 0.45, 0.06, mat.frame, 0, 0.03, -0.55, e, 24);
  box(0.05, 2.2, 0.05, mat.frame, 0, 1.1, -0.55, e);
  box(0.05, 0.05, 0.7, mat.frame, 0, 2.2, -0.25, e);
  cyl(0.008, 0.008, 0.6, mat.chrome, 0, 1.9, 0.08, e, 4);
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16, Math.PI * 0.2, Math.PI * 1.6), M(0xd9c4a3, 0.9, { side: THREE.DoubleSide }));
  egg.scale.set(1, 1.25, 1); egg.position.set(0, 1.0, 0.08); egg.rotation.y = Math.PI; egg.castShadow = true; e.add(egg);
  box(0.6, 0.1, 0.6, mat.sofaCush, 0, 0.62, 0.1, e);
  // floor lamp
  cyl(0.02, 0.02, 1.6, mat.frame, 10.8, 0.8, -3.9, l, 8);
  cyl(0.18, 0.22, 0.25, M(0xf3ead9, 0.7, { emissive: 0xffd9a0, emissiveIntensity: 0.4 }), 10.8, 1.65, -3.9, l, 16);
  startIsland('Giải lao', 'ngồi chơi');
  islandCursor.quiet = true;
  for (const x of [6.6, 8.2, 9.8]) addOpenSeat(x, -3.55, Math.PI, l, -0.1, true);
  for (const z of [-6.4, -4.8]) addOpenSeat(11.35, z, -Math.PI / 2, l, -0.1, true);
  for (const [x, z] of [[6.1, -6.9], [7.6, -7.25], [9.3, -7.05]]) addOpenSeat(x, z, Math.atan2(8.4 - x, -5.5 - z), l, -0.12, true);
  addOpenSeat(4.8, -4.5, 0, l, 0.08, true);
  const lounge = islandCursor;
  islandCursor = null;
  tagIsland(lounge, islands.indexOf(lounge));
}

// ---------- nap room: frosted partition, 2 nap pods ----------
{
  const n = G.nap_room;
  glassWall(9.6, -2.4, 9.6, -0.5, 2.5, n, mat.frost, 1);
  glassWall(9.6, 0.5, 9.6, 2.4, 2.5, n, mat.frost, 1);
  glassWall(9.6, -2.4, 13, -2.4, 2.5, n, mat.frost, 1.2);
  glassWall(9.6, 2.4, 13, 2.4, 2.5, n, mat.frost, 1.2);
  for (const z of [-1.25, 1.25]) {
    const p = new THREE.Group(); p.position.set(11.8, 0, z); n.add(p);
    box(2.1, 0.42, 1.2, mat.podShell, 0, 0.21, 0, p);
    box(1.95, 0.12, 1.05, mat.podIn, 0, 0.48, 0, p);
    box(0.4, 0.1, 0.7, mat.white, 0.75, 0.59, 0, p);
    const dg = new THREE.CylinderGeometry(0.62, 0.62, 1.5, 24, 1, true, 0, Math.PI); dg.rotateZ(Math.PI / 2);
    const dome = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0xf4f6f5, roughness: 0.35, side: THREE.DoubleSide }));
    dome.position.set(0.3, 0.42, 0); dome.castShadow = true; p.add(dome);
    const strip = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.015, 6, 24, Math.PI), mat.podGlow);
    strip.rotation.y = Math.PI / 2; strip.position.set(-0.44, 0.42, 0); p.add(strip);
  }
  box(0.5, 0.45, 0.4, mat.walnut, 10.1, 0.22, -2.0, n);  // shoe/locker bench
}

// ---------- meeting room ----------
{
  const m = G.meeting;
  glassWall(8, 3, 13, 3, 3, m, mat.glass, 1.25);
  glassWall(8, 4.3, 8, 8, 3, m, mat.glass, 1.2);
  box(3.0, 0.05, 1.15, mat.walnut, 10.5, 0.74, 5.6, m);
  for (const sx of [-1.2, 1.2]) box(0.06, 0.72, 0.9, mat.frame, 10.5 + sx, 0.36, 5.6, m);
  startIsland('Phòng họp', '6 người · TV');
  islandCursor.share = true;
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const x = 9.5 + i, z = 5.6 + s * 0.9;
    officeChair(m, x, z, s > 0 ? Math.PI : 0);
    addOpenSeat(x, z, s > 0 ? Math.PI : 0, m);
  }
  const meeting = islandCursor;
  islandCursor = null;
  tagIsland(meeting, islands.indexOf(meeting));
  box(1.7, 1.0, 0.05, mat.monitor, 10.5, 1.5, 7.88, m);
  meetingTvMat = mat.tv.clone();
  meetingTvMesh = plane(1.62, 0.92, meetingTvMat, 10.5, 1.5, 7.85, Math.PI, m);
}

// ---------- phone booths ----------
for (const z of [0.4, 1.85]) {
  const b = new THREE.Group(); b.position.set(-12.25, 0, z); G.booths.add(b);
  box(1.2, 0.06, 1.3, mat.booth, 0, 2.3, 0, b);
  box(0.06, 2.3, 1.3, mat.booth, -0.6, 1.15, 0, b);
  for (const s of [-1, 1]) box(1.2, 2.3, 0.06, mat.booth, 0, 1.15, s * 0.65, b);
  box(0.03, 2.2, 1.24, mat.glass, 0.6, 1.12, 0, b, false);
  box(0.05, 2.3, 0.05, mat.frame, 0.6, 1.15, 0.6, b);
  box(0.4, 0.03, 0.8, mat.walnut, -0.38, 1.0, 0, b);
  cyl(0.18, 0.18, 0.06, mat.coral, -0.1, 0.6, 0, b, 16); cyl(0.03, 0.03, 0.58, mat.chrome, -0.1, 0.29, 0, b, 8);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), new THREE.MeshStandardMaterial({ color: 0xfff2d9, emissive: 0xffe2b0, emissiveIntensity: 1.2 }));
  lamp.position.set(0, 2.26, 0); b.add(lamp);
}

// ---------- server room ----------
export const rackMats = [];
{
  const s = G.server;
  glassWall(-13, 4.4, -9.4, 4.4, 3, s, mat.glass, 1.2);
  solidWall(-9.4, 4.4, -9.4, 8, 3, s);
  for (let i = 0; i < 4; i++) {
    const front = mat.rackFront.clone(); front.emissiveIntensity = rr(0.9, 1.4); rackMats.push(front);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.05, 1.0), [mat.rack, mat.rack, mat.rack, mat.rack, mat.rack, front]);
    r.position.set(-12.4 + i * 0.66, 1.025, 6.9); r.castShadow = true; s.add(r);
  }
  box(0.9, 0.35, 0.25, mat.white, -11.2, 2.6, 7.85, s);   // AC
}

// ---------- reception & entrance ----------
{
  const r = G.reception;
  box(2.4, 1.05, 0.6, mat.white, -1.8, 0.525, 6.9, r);
  box(2.5, 0.05, 0.7, mat.walnut, -1.8, 1.07, 6.9, r);
  officeChair(r, -1.8, 7.5, Math.PI);
  plane(2.4, 1.2, mat.devSign, 2.2, 1.9, 7.82, Math.PI, r);
  sofa(r, 4.6, 7.4, 2.2, Math.PI);
}

// ---------- aquarium on the reception counter: the 120 × 60 × 60 cm planted tank (Hồ Thủy Sinh 120), modelled in 10 cm units ----------
export const AQ = { feedT: 0, lift: 0 };
{
  const W = 12, D = 6, H = 6.2, WATER = 5.7, S = 0.1;
  const A = new THREE.Group(); A.name = 'aquarium';
  A.position.set(-1.45, 1.125, 6.9); A.rotation.y = Math.PI; A.scale.setScalar(S);   // front glass faces visitors (−Z)
  G.reception.add(A);
  const AU = { uTime: { value: 0 } };
  const tb = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); A.add(b); return b; };
  tb(W + 0.5, 0.3, D + 0.5, M(0x1b2a30, 0.5), 0, -0.6, 0);                  // black base plate
  const sand = tb(W + 0.3, 0.45, D + 0.3, M(0xf1e6d6, 1), 0, -0.225, 0); sand.receiveShadow = true;
  const vUvShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const caustics = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.ShaderMaterial({
    uniforms: AU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: vUvShader,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float c(vec2 p){ p *= 6.0; float t = uTime*0.6; vec2 i = p; float v = 0.0;
        for (int n = 0; n < 3; n++){ float f = float(n)+1.0;
          i = p + vec2(cos(t/f - i.x) + sin(t/f + i.y), sin(t/f - i.y) + cos(t/f + i.x));
          v += 1.0/length(vec2(p.x/(sin(i.x+t)/0.02), p.y/(cos(i.y+t)/0.02))); }
        return pow(v/3.0, 1.6); }
      void main(){ float k = c(vUv*vec2(2.0,1.0)); float edge = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x)*smoothstep(0.0,0.1,vUv.y)*smoothstep(1.0,0.9,vUv.y);
        gl_FragColor = vec4(vec3(0.9,1.0,0.85)*k*0.35*edge, 1.0); }`,
  }));
  caustics.rotation.x = -Math.PI / 2; caustics.position.y = 0.012; A.add(caustics);
  const pebM = [M(0xe9e2d7, 0.8, { flatShading: true }), M(0xbfc8c6, 0.8, { flatShading: true })];
  for (let i = 0; i < 70; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 + rng() * 0.08, 0), pebM[rng() < 0.3 ? 1 : 0]);
    p.position.set((rng() - 0.5) * (W - 0.6), 0.03, (rng() - 0.5) * (D - 0.6)); p.rotation.set(rng() * 3, rng() * 3, 0); p.scale.y = 0.7; A.add(p);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
    vertexShader: vUvShader,
    fragmentShader: `varying vec2 vUv; void main(){
      vec3 cream = vec3(0.86, 0.93, 0.84), mint = vec3(0.6, 0.83, 0.78), teal = vec3(0.35, 0.66, 0.66);
      vec3 c = mix(cream, mint, smoothstep(0.35, 1.0, vUv.x)); c = mix(c, teal, smoothstep(0.75, 1.0, vUv.x) * 0.5);
      c *= 0.85 + 0.15 * vUv.y; c = mix(c, vec3(1.0), exp(-pow(length(vUv - vec2(0.35, 0.75))*2.2, 2.0)) * 0.25);
      gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0); }`,
  }));
  back.position.set(0, H / 2, -D / 2 - 0.02); A.add(back);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fd4dc, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  [[W, H, 0, H / 2, D / 2, 0], [D, H, -W / 2, H / 2, 0, Math.PI / 2], [D, H, W / 2, H / 2, 0, Math.PI / 2]].forEach(([w, h, x, y, z, ry]) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat); g.position.set(x, y, z); g.rotation.y = ry; g.renderOrder = 5; A.add(g);
  });
  const water = tb(W - 0.02, WATER, D - 0.02, new THREE.MeshBasicMaterial({ color: 0x5fb3b8, transparent: true, opacity: 0.08, depthWrite: false }), 0, WATER / 2, 0); water.renderOrder = 4;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.02, 60, 30), new THREE.ShaderMaterial({
    uniforms: AU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position;
      p.z += sin(p.x*2.0 + uTime*1.5)*0.025 + cos(p.y*3.0 + uTime*1.1)*0.02;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){
      float r = sin(vUv.x*40.0 + uTime*1.2 + sin(vUv.y*20.0 + uTime))*0.5 + 0.5;
      gl_FragColor = vec4(vec3(0.75, 0.92, 0.9), 0.12 + r*0.08); }`,
  }));
  surface.rotation.x = -Math.PI / 2; surface.position.y = WATER; surface.renderOrder = 6; A.add(surface);
  const rimMat = M(0x0f8199, 0.4), rimInner = M(0xe6e2a8, 0.6);
  tb(W + 0.5, 0.14, 0.25, rimMat, 0, H, D / 2); tb(W + 0.5, 0.14, 0.25, rimMat, 0, H, -D / 2);
  tb(0.25, 0.14, D + 0.5, rimMat, -W / 2, H, 0); tb(0.25, 0.14, D + 0.5, rimMat, W / 2, H, 0);
  tb(W, 0.06, 0.12, rimInner, 0, H + 0.08, -D / 2 + 0.1); tb(0.12, 0.06, D, rimInner, -W / 2 + 0.1, H + 0.08, 0); tb(0.12, 0.06, D, rimInner, W / 2 - 0.1, H + 0.08, 0);
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: AU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: vUvShader,
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){
      float a = smoothstep(0.0, 1.0, vUv.y) * sin(vUv.x*3.14159) * (0.55 + 0.45*sin(uTime*0.7 + vUv.x*5.0));
      gl_FragColor = vec4(vec3(0.95, 1.0, 0.9), a*0.06); }`,
  });
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rng(), WATER), shaftMat);
    s.position.set(-5 + i * 1.7, WATER / 2, -1 + rng() * 2); s.rotation.set(0, rng() * 0.6 - 0.3, 0.12); s.renderOrder = 7; A.add(s);
  }

  // aquascape: rock cliff, spider wood, plants, moss, white sand waterfall
  const scape = buildLayout();
  A.add(scape.group);
  const mixer = new THREE.AnimationMixer(scape.group); mixer.clipAction(scape.clip).play();
  const NOISE = `float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1.0,0.0)), u.x), mix(h(i+vec2(0.0,1.0)), h(i+vec2(1.0,1.0)), u.x), u.y); }`;
  const fallMesh = scape.group.getObjectByName('waterfall'), riverMesh = scape.group.getObjectByName('sand_river');
  if (fallMesh) {
    fallMesh.material = new THREE.ShaderMaterial({
      uniforms: AU, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: vUvShader,
      fragmentShader: `uniform float uTime; varying vec2 vUv; ${NOISE}
        void main(){
          float flow = vUv.y * 6.0 - uTime * 1.6;
          float s = n(vec2(vUv.x * 18.0, flow)) * 0.6 + n(vec2(vUv.x * 46.0, flow * 0.7)) * 0.4;
          float a = pow(sin(vUv.x * 3.14159), 0.6) * (0.45 + 0.55 * s) * smoothstep(0.0, 0.05, vUv.y);
          gl_FragColor = vec4(mix(vec3(0.86, 0.93, 0.97), vec3(1.0), s), clamp(a + smoothstep(0.85, 1.0, vUv.y) * 0.25, 0.0, 1.0) * 0.95);
        }`,
    });
    fallMesh.renderOrder = 3;
  }
  if (riverMesh) {
    riverMesh.material = new THREE.ShaderMaterial({
      uniforms: AU, transparent: true, depthWrite: false, vertexShader: vUvShader,
      fragmentShader: `uniform float uTime; varying vec2 vUv; ${NOISE}
        void main(){
          float flow = vUv.y * 16.0 - uTime * 0.45;
          float s = n(vec2(vUv.x * 10.0, flow)) * 0.6 + n(vec2(vUv.x * 30.0, flow * 2.0)) * 0.4;
          float spark = smoothstep(0.93, 1.0, n(vec2(vUv.x * 80.0, vUv.y * 160.0 - uTime * 2.0)));
          float a = smoothstep(0.0, 0.25, sin(vUv.x * 3.14159)) * (0.8 + 0.2 * s);
          float bank = smoothstep(0.12, 0.0, abs(vUv.x - 0.12)) + smoothstep(0.12, 0.0, abs(vUv.x - 0.88));
          vec3 c = mix(vec3(0.97, 0.98, 1.0) + vec3(0.03) * s, vec3(0.72, 0.74, 0.76), bank * 0.5);
          gl_FragColor = vec4(c + spark * 0.4, a);
        }`,
    });
  }
  // falling sand grains and mist at the foot of the waterfall (point sizes are world units, so scaled 1:10)
  const fallCurve = new THREE.CatmullRomCurve3(WATERFALL_PATH);
  const pts = (n, color, size, opacity) => {
    const pos = new Float32Array(n * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: size * S, transparent: true, opacity, depthWrite: false }));
    p.frustumCulled = false; A.add(p);
    return { pos, geo, seed: Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()]) };
  };
  const grains = pts(180, 0xffffff, 0.045, 0.9), mist = pts(220, 0xf2f8fa, 0.12, 0.35), bub = pts(160, 0xe8fbff, 0.09, 0.7);
  const foot = WATERFALL_PATH[WATERFALL_PATH.length - 1];

  // fauna: 16 neon tetras in a school, cherry shrimp and apple snails on the sand
  const tetra = buildTetra(), shrimp = buildShrimp(), snail = buildSnail();
  const faunaMixers = [];
  const spawn = (src, off) => {
    const o = src.object.clone(); o.rotation.order = 'YZX'; A.add(o);
    const mx = new THREE.AnimationMixer(o), act = mx.clipAction(src.clip); act.play(); act.time = Math.random() * off; act.timeScale = 0.85 + Math.random() * 0.35;
    faunaMixers.push(mx); return { obj: o, act };
  };
  const clampV = (x, a, b) => Math.min(Math.max(x, a), b);
  const schoolAt = t => new THREE.Vector3(4.2 * Math.sin(t * 0.13) * (1 - AQ.lift * 0.6), 3.0 + 0.7 * Math.sin(t * 0.21 + 1) + AQ.lift * 1.9, 1.4 * Math.sin(t * 0.27));
  const school = Array.from({ length: 16 }, () => ({
    ...spawn(tetra, 0.8),
    off: new THREE.Vector3((Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.3),
    lag: Math.random() * 0.8, ph: Math.random() * 6.28,
  }));
  const fishPos = (f, t) => schoolAt(t - f.lag).add(f.off.clone().multiplyScalar((1 + 0.18 * Math.sin(t * 0.9 + f.ph)) * (1 - AQ.lift * 0.35)));
  const crawlTarget = p => new THREE.Vector3(clampV(p.x + (Math.random() - 0.5) * 3, -5.6, 5.6), 0.01, clampV(p.z + (Math.random() - 0.5) * 2, -2.6, 2.6));
  const crawlers = [];
  for (let i = 0; i < 13; i++) {
    const isSnail = i >= 9, s = spawn(isSnail ? snail : shrimp, isSnail ? 2 : 1.2);
    s.obj.position.set(-5 + Math.random() * 10, 0.01, -2 + Math.random() * 4.5); s.obj.rotation.y = Math.random() * 6.28;
    crawlers.push({ ...s, target: crawlTarget(s.obj.position), wait: Math.random() * 3, speed: isSnail ? 0.045 : 0.13 });
  }
  const tv = new THREE.Vector3();

  // tank light: cool glow onto the counter
  const glow = new THREE.PointLight(0xdff8ff, 1.6, 2.4, 2); glow.position.set(0, H + 1, 0); A.add(glow);

  // food flakes for "Ngắm cá"
  const flakeM = M(0xd9733a, 0.8), flakes = [];
  for (let i = 0; i < 40; i++) { const fl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), flakeM); fl.visible = false; A.add(fl); flakes.push(fl); }
  AQ.feed = () => {
    AQ.feedT = 14;
    flakes.forEach(fl => { fl.visible = true; fl.position.set(rr(-3, 3), WATER - rr(0, 0.3), rr(-1.5, 1.5)); fl.userData.v = rr(0.15, 0.35); fl.rotation.y = rr(0, 6); });
  };

  AQ.update = (dt) => {
    const t = AU.uTime.value += dt;
    AQ.feedT = Math.max(0, AQ.feedT - dt);
    AQ.lift += ((AQ.feedT > 0 ? 1 : 0) - AQ.lift) * Math.min(1, dt * 1.2);
    mixer.update(dt); faunaMixers.forEach(m => m.update(AQ.lift > 0.5 ? dt * 1.6 : dt));
    for (const f of school) {
      const p = fishPos(f, t), v = fishPos(f, t + 0.05).sub(p);
      f.obj.position.copy(p); f.obj.rotation.set(0, Math.atan2(-v.z, v.x), Math.atan2(v.y, Math.hypot(v.x, v.z)));
    }
    for (const s of crawlers) {
      const o = s.obj;
      if (s.wait > 0) { s.wait -= dt; s.act.timeScale = 0.35; continue; }
      s.act.timeScale = 1;
      tv.copy(s.target).sub(o.position); tv.y = 0;
      const d = tv.length();
      if (d < 0.05) { s.wait = 1 + Math.random() * 4; s.target = crawlTarget(o.position); continue; }
      let diff = Math.atan2(-tv.z, tv.x) - o.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      o.rotation.y += diff * Math.min(1, dt * s.speed * 18);
      if (Math.abs(diff) < 0.6) o.position.addScaledVector(tv.normalize(), Math.min(d, dt * s.speed));
    }
    grains.seed.forEach(([a, b, c], i) => {
      const u = (a + t * (0.3 + b * 0.15)) % 1, p = fallCurve.getPointAt(u);
      grains.pos.set([p.x + (b - 0.5) * (0.4 + 0.55 * u), p.y, p.z + (c - 0.5) * 0.12 + 0.03], i * 3);
    });
    mist.seed.forEach(([a, b, c], i) => {
      const life = (a + t * (0.15 + b * 0.1)) % 1;
      mist.pos.set([foot.x + (b - 0.5) * 1.4 * (0.3 + life), 0.05 + life * 0.9, foot.z + (c - 0.5) * 0.8 * (0.3 + life) + 0.15], i * 3);
    });
    bub.seed.forEach(([a, b, c], i) => {
      const life = (t * (0.12 + a * 0.08) + b) % 1;
      bub.pos.set([4.9 + Math.sin(t * 3 + c * 20) * 0.08 * life + (a - 0.5) * 0.25, 0.2 + life * (WATER - 0.25), -2.6 + (c - 0.5) * 0.25], i * 3);
    });
    grains.geo.attributes.position.needsUpdate = mist.geo.attributes.position.needsUpdate = bub.geo.attributes.position.needsUpdate = true;
    for (const fl of flakes) if (fl.visible) {
      fl.position.y -= fl.userData.v * dt; fl.position.x += Math.sin(t * 2 + fl.id) * 0.02 * dt; fl.rotation.y += dt;
      if (fl.position.y < 0.3 || AQ.feedT <= 0) fl.visible = false;
    }
  };
  const fishPicker = new THREE.Mesh(
    new THREE.BoxGeometry(12.4, 6.6, 6.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  fishPicker.position.y = 3.1;
  fishPicker.userData.fish = true;
  A.add(fishPicker);
  pickers.push(fishPicker);
}



export const fishBtn = document.createElement('button');
fishBtn.type = 'button';
fishBtn.className = 'dtag';
fishBtn.innerHTML = '<b>Hồ cá</b>ngắm cá';
fishBtn.title = 'Ngắm hồ thủy sinh';
fishBtn.addEventListener('click', (e) => { e.stopPropagation(); hooks.enterFish(); });
deskTagsEl.appendChild(fishBtn);
fishTag = { el: fishBtn, v: new THREE.Vector3(-1.45, 1.92, 6.9) };

// ---------- balcony ----------
{
  const b = G.balcony;
  box(26.4, 0.25, 2.8, mat.slab, 0, -0.14, -9.4, b);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.6), mat.teak); deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.004, -9.35); deck.receiveShadow = true; b.add(deck);
  glassWall(-13.1, -10.75, 13.1, -10.75, 1.05, b, mat.glass, 2);
  for (const x of [-1, 2, 5, 8]) {
    const lg = new THREE.Group(); lg.position.set(x, 0, -9.4); lg.rotation.y = Math.PI; b.add(lg);
    box(0.65, 0.2, 1.7, mat.white, 0, 0.3, 0.15, lg);
    const back = box(0.65, 0.08, 0.7, mat.white, 0, 0.55, -0.85, lg); back.rotation.x = 0.7;
    box(0.6, 0.05, 1.5, mat.coral, 0, 0.42, 0.2, lg);
  }
  for (const x of [-10, -6.5]) {
    cyl(0.35, 0.35, 0.04, mat.white, x, 0.74, -9.4, b, 20); cyl(0.03, 0.03, 0.72, mat.frame, x, 0.37, -9.4, b, 8);
    for (const s of [-1, 1]) { const ch = box(0.42, 0.04, 0.42, mat.teak, x + s * 0.6, 0.45, -9.4, b); }
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.45, 8, 1, true), M(0xf3ead9, 0.8, { side: THREE.DoubleSide }));
    umb.position.set(x, 2.35, -9.4); umb.castShadow = true; b.add(umb);
    cyl(0.025, 0.025, 2.3, mat.frame, x, 1.2, -9.4, b, 6);
  }
  plant(-12.5, -9.6, 1.1, b); plant(12.5, -9.6, 1.1, b); plant(-4.2, -9.8, 0.9, b);
}

// ---------- plants inside ----------
for (const [x, z, s] of [[-4.8, -7.5, 1.1], [4.4, -7.5, 1.1], [12.5, -7.6, 1.2], [-8.6, 6.8, 1], [6.8, 0.6, 1], [0, 7.4, 0.9], [-12.4, 3.4, 0.8], [8.5, 2.4, 0.9], [-12.4, -0.9, 0.8]]) plant(x, z, s);

// ---------- security room: right wall, between nap room and lounge ----------
{
  const sec = G.security;
  glassWall(11.85, -3.9, 11.85, -3.25, 2.6, sec, mat.glass, 1.15);
  glassWall(11.85, -2.75, 11.85, -2.5, 2.6, sec, mat.glass, 1.15);
  glassWall(11.85, -3.9, 13, -3.9, 2.6, sec, mat.glass, 1.3);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.35), M(0x16343c, 0.9));
  pad.rotation.x = -Math.PI / 2; pad.position.set(12.42, 0.012, -3.2); pad.receiveShadow = true; sec.add(pad);
  box(0.55, 0.04, 0.9, mat.deskTop, 12.5, 0.74, -3.2, sec);
  for (const sz of [-0.38, 0.38]) box(0.48, 0.72, 0.04, mat.deskLeg, 12.5, 0.36, -3.2 + sz, sec);
  box(0.04, 0.55, 0.8, mat.monitor, 12.74, 1.18, -3.2, sec);
  const secTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#102028'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3fd0c0'; g.font = '700 54px sans-serif'; g.textAlign = 'center';
    g.fillText('SECURITY', w / 2, 108);
    g.fillStyle = '#d5e4e8'; g.font = '400 28px sans-serif'; g.fillText('tra cứu', w / 2, 164);
  }, 'security_sign');
  plane(0.72, 0.46, new THREE.MeshBasicMaterial({ map: secTex }), 12.68, 1.18, -3.2, -Math.PI / 2, sec);
  officeChair(sec, 12.05, -3.2, Math.PI / 2);
  const picker = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.7, 1.3),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  picker.position.set(12.42, 1.05, -3.2);
  picker.userData.security = true;
  sec.add(picker);
  pickers.push(picker);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'dtag';
  el.innerHTML = '<b>Security</b>tra cứu';
  el.title = 'Mở trang tra cứu';
  el.addEventListener('click', (e) => { e.stopPropagation(); hooks.enterSecurity(); });
  deskTagsEl.appendChild(el);
  securityTag = { el, v: new THREE.Vector3(12.42, 1.85, -3.2) };
}

// ---------- AI agents: hovering robots that patrol the aisles ----------
export const AGENTS = [];
{
  const agentsG = new THREE.Group(); agentsG.name = 'agents'; scene.add(agentsG);
  const shell = M(0xf2f4f3, 0.32, { metalness: 0.15 });
  const visorM = M(0x0b141c, 0.15, { metalness: 0.4 });
  const PI = Math.PI;
  function drawTag(c, name, role, col) {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,28,42,0.88)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(36, h / 2, 11, 0, 7); g.fill();
    g.fillStyle = '#f3f8f8'; g.font = '700 32px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText('Agent ' + name, 60, 44);
    g.fillStyle = '#a8c1c9'; g.font = '400 23px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(role, 60, 76);
  }
  const DEFS = [
    { name: 'Claude', role: 'viết code', hex: 0xd97757, speed: 0.9, start: 0,
      route: [[-7.2, -2.75, 1.2], [7.6, -2.75, 1.2], [7.6, 5.9, 1.2], [-7.2, 5.9, 1.2]] },
    { name: 'Cursor', role: 'trong editor', hex: 0x4aa8ff, speed: 1.0, start: 2,
      route: [[-7.2, -2.75, 1], [-7.2, 5.9, 1], [7.6, 5.9, 1], [7.6, -2.75, 1]] },
  ];
  for (const d of DEFS) {
    const col = '#' + d.hex.toString(16).padStart(6, '0');
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; agentsG.add(g);
    const body = new THREE.Group(); g.add(body);
    const accent = new THREE.MeshStandardMaterial({ color: d.hex, emissive: d.hex, emissiveIntensity: 1.2, roughness: 0.4 });
    const add = (geo, m, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(new THREE.CapsuleGeometry(0.19, 0.2, 6, 18), shell, 0, 0.42, 0).scale.z = 0.88;
    const belt = add(new THREE.TorusGeometry(0.19, 0.018, 8, 32), accent, 0, 0.36, 0); belt.rotation.x = PI / 2; belt.scale.y = 0.88;
    add(new THREE.BoxGeometry(0.1, 0.035, 0.02), accent, 0, 0.5, 0.17);
    const head = new THREE.Group(); head.position.y = 0.9; body.add(head);
    add(new THREE.SphereGeometry(0.23, 28, 20), shell, 0, 0, 0, head).scale.set(1.15, 0.9, 1);
    add(new THREE.SphereGeometry(0.2, 28, 18), visorM, 0, 0, 0.13, head).scale.set(1.1, 0.72, 0.6);
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.hex).lerp(new THREE.Color(0xffffff), 0.45) });
    const eyes = [-1, 1].map(s => { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.045, 4, 8), eyeM); e.position.set(s * 0.075, 0.01, 0.245); head.add(e); return e; });
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), visorM, 0, 0.25, 0, head);
    add(new THREE.SphereGeometry(0.032, 12, 10), accent, 0, 0.33, 0, head);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 18), accent, s * 0.26, 0, 0, head).rotation.z = PI / 2;
    const hands = [-1, 1].map(s => add(new THREE.SphereGeometry(0.065, 16, 12), shell, s * 0.29, 0.42, 0.02));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.27, 32), new THREE.MeshBasicMaterial({ color: d.hex, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -PI / 2; ring.position.y = 0.02; g.add(ring);
    const cup = new THREE.Group(); cup.position.set(-0.29, 0.53, 0.06); cup.visible = false; body.add(cup);
    add(new THREE.CylinderGeometry(0.045, 0.036, 0.11, 14), mat.white, 0, 0, 0, cup);
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.015, 14), mat.coral, 0, 0.06, 0, cup);
    const tc = document.createElement('canvas'); tc.width = 320; tc.height = 96;
    drawTag(tc, d.name, d.role, col);
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace;
    document.fonts?.ready.then(() => { drawTag(tc, d.name, d.role, col); tex.needsUpdate = true; });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); tag.scale.set(0.9, 0.27, 1); tag.position.y = 1.5; g.add(tag);
    const route = d.route.map(([x, z, pause = 0, face = null, act = null]) => ({ p: new THREE.Vector2(x, z), pause, face, act }));
    const s0 = route[d.start], next = route[(d.start + 1) % route.length];
    const dir = next.p.clone().sub(s0.p).normalize();
    AGENTS.push({ d, g, body, head, eyes, hands, ring, cup, accent, route,
      idx: (d.start + 1) % route.length, pos: s0.p.clone(), dir, off: new THREE.Vector2(),
      yaw: Math.atan2(dir.x, dir.y), wait: 0, faceYaw: null, act: null, moving: true, ph: rng() * 6.28, blink: rr(1, 4) });
  }
}
const laneV = new THREE.Vector2();
export function updateAgents(dt, t) {
  const k = 1 - Math.exp(-dt * 4);
  for (const a of AGENTS) {
    let wantYaw = a.yaw;
    if (a.wait > 0) {
      a.wait -= dt; a.moving = false;
      if (a.faceYaw !== null) wantYaw = a.faceYaw;
      if (a.wait <= 0 && a.act) { a.cup.visible = a.act === 'pick'; a.act = null; }
    } else {
      const tgt = a.route[a.idx], v = tgt.p.clone().sub(a.pos), dist = v.length(), step = a.d.speed * dt;
      if (dist <= step) {
        a.pos.copy(tgt.p);
        if (tgt.pause) { a.wait = tgt.pause; a.faceYaw = tgt.face; a.act = tgt.act; }
        a.idx = (a.idx + 1) % a.route.length;
      } else {
        v.divideScalar(dist); a.pos.addScaledVector(v, step); a.dir.copy(v); a.moving = true;
        wantYaw = Math.atan2(v.x, v.y);
      }
    }
    a.off.lerp(laneV.set(-a.dir.y, a.dir.x).multiplyScalar(a.moving ? 0.18 : 0), k);
    let diff = wantYaw - a.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.yaw += diff * Math.min(1, dt * 6);
    a.g.position.set(a.pos.x + a.off.x, 0, a.pos.y + a.off.y);
    a.g.rotation.y = a.yaw;
    a.g.rotation.x += ((a.moving ? 0.1 : 0) - a.g.rotation.x) * k;
    a.body.position.y = 0.1 + Math.sin(t * 2.4 + a.ph) * 0.035;
    a.hands.forEach((h, i) => { h.position.z = 0.02 + (a.moving ? Math.sin(t * 7 + a.ph + i * Math.PI) * 0.06 : 0); });
    a.head.rotation.y += ((a.wait > 0 ? Math.sin(t * 1.5 + a.ph) * 0.4 : 0) - a.head.rotation.y) * k;
    a.blink -= dt;
    let ey = a.wait > 0 ? 0.45 : 1;
    if (a.blink < 0) { ey = 0.1; if (a.blink < -0.12) a.blink = rr(2, 5); }
    a.eyes.forEach(e => { e.scale.y += (ey - e.scale.y) * Math.min(1, dt * 20); });
    a.accent.emissiveIntensity = 1 + 0.8 * (0.5 + 0.5 * Math.sin(t * (a.wait > 0 ? 9 : 3) + a.ph));
    a.ring.material.opacity = 0.3 + 0.12 * Math.sin(t * 2.4 + a.ph);
  }
}
const walker = walkerModel(); G.people.add(walker.g);
const PATH = [[1.4, 2], [-8, 2], [-10.9, 1.4], [-10.9, -3.2], [-11.75, -4.4]].map(([x, z]) => new THREE.Vector2(x, z));
const CUM = [0]; for (let i = 1; i < PATH.length; i++) CUM.push(CUM[i - 1] + PATH[i].distanceTo(PATH[i - 1]));
const PATH_LEN = CUM[CUM.length - 1];
const walk = { d: 0, dir: 1, pause: 2 };
function pathAt(d) {
  let i = 1; while (i < CUM.length - 1 && CUM[i] < d) i++;
  const t = (d - CUM[i - 1]) / (CUM[i] - CUM[i - 1]);
  return { p: PATH[i - 1].clone().lerp(PATH[i], t), dir: PATH[i].clone().sub(PATH[i - 1]).normalize() };
}
const COFFEE_NODES = [
  { id: 'counter', p: new THREE.Vector2(-11.7, -4.5) },
  { id: 'lane', p: new THREE.Vector2(-10.9, -3.2) },
  { id: 'north', p: new THREE.Vector2(-10.9, 1.4) },
  { id: 'west', p: new THREE.Vector2(-8, 2) },
  { id: 'mid', p: new THREE.Vector2(1.4, 2) },
  { id: 'east', p: new THREE.Vector2(8.2, 2) },
  { id: 'loungeIn', p: new THREE.Vector2(5.4, -2.0) },
  { id: 'loungeFront', p: new THREE.Vector2(5.4, -4.6) },
];
const COFFEE_LINKS = {
  counter: ['lane'], lane: ['counter', 'north'], north: ['lane', 'west'], west: ['north', 'mid'],
  mid: ['west', 'east'], east: ['mid', 'loungeIn'], loungeIn: ['east', 'loungeFront'], loungeFront: ['loungeIn'],
};
const serve = { queue: [], active: null };
const servedCups = new Map();
const seenCoffee = new Set();
function coffeeNode(id) { return COFFEE_NODES.find((n) => n.id === id); }
function nearestCoffeeId(v) {
  let best = COFFEE_NODES[0], d = Infinity;
  for (const n of COFFEE_NODES) {
    const dd = v.distanceToSquared(n.p);
    if (dd < d) { d = dd; best = n; }
  }
  return best.id;
}
function coffeePath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const q = [fromId];
  const prev = { [fromId]: '' };
  while (q.length) {
    const id = q.shift();
    for (const n of COFFEE_LINKS[id]) {
      if (prev[n] != null) continue;
      prev[n] = id;
      if (n === toId) {
        const out = [n];
        let cur = n;
        while (prev[cur]) { cur = prev[cur]; out.push(cur); }
        return out.reverse();
      }
      q.push(n);
    }
  }
  return [fromId];
}
function walkerPos() { return new THREE.Vector2(walker.g.position.x, walker.g.position.z); }
function coffeeRoute(from, to) {
  const ids = coffeePath(nearestCoffeeId(from), nearestCoffeeId(to));
  const pts = ids.map((id) => coffeeNode(id).p.clone());
  if (pts.length && from.distanceTo(pts[0]) < 0.4) pts.shift();
  pts.push(to.clone());
  return pts;
}
function nearestPathPoint(pos) {
  let best = PATH[0].clone(), bestD = Infinity, along = 0;
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i], ab = b.clone().sub(a), len = ab.length();
    const t = THREE.MathUtils.clamp(pos.clone().sub(a).dot(ab) / (len * len), 0, 1);
    const closest = a.clone().lerp(b, t);
    const dist = closest.distanceToSquared(pos);
    if (dist < bestD) { bestD = dist; best = closest; along = CUM[i - 1] + t * (CUM[i] - CUM[i - 1]); }
  }
  return { p: best, d: along };
}
function serveTargets(seat) {
  const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
  const sx = Math.cos(seat.yaw), sz = -Math.sin(seat.yaw);
  const cafe = seat.x < -4;
  const stand = cafe
    ? new THREE.Vector2(seat.x + fx * 0.95 + sx * 0.35, seat.z + fz * 0.95 + sz * 0.35)
    : new THREE.Vector2(seat.x + fx * 0.72, seat.z + fz * 0.72);
  let cup;
  if (cafe) cup = new THREE.Vector3(seat.x + fx * 0.55 + sx * 0.24, 0.8, seat.z + fz * 0.55 + sz * 0.24);
  else if (Math.hypot(seat.x - 8.4, seat.z + 5.5) < 2.6) cup = new THREE.Vector3(THREE.MathUtils.clamp(seat.x, 7.8, 9.0), 0.46, -5.5);
  else cup = new THREE.Vector3(seat.x + sx * 0.28, 0.42 + (seat.y || 0), seat.z + sz * 0.28);
  return { stand, cup };
}
function makeServeCup() {
  const g = new THREE.Group();
  cyl(0.038, 0.03, 0.075, mat.white, 0, 0.04, 0, g, 12);
  cyl(0.042, 0.042, 0.012, mat.coral, 0, 0.078, 0, g, 12);
  return g;
}
function clink() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1480, t0);
    o.frequency.exponentialRampToValueAtTime(880, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.13);
  } catch (e) {}
}
function dropServeCup(job) {
  if (job.skipCup || servedCups.has(job.id)) return;
  while (servedCups.size >= 8) {
    const oldest = servedCups.keys().next().value;
    scene.remove(servedCups.get(oldest));
    servedCups.delete(oldest);
  }
  const cup = makeServeCup();
  cup.position.copy(job.cupAt);
  scene.add(cup);
  servedCups.set(job.id, cup);
  clink();
}
function clearMyCups() {
  for (const [id, cup] of [...servedCups]) {
    if (!id.startsWith('cof-' + hooks.myId() + '-')) continue;
    scene.remove(cup);
    servedCups.delete(id);
  }
}
function beginCoffee() {
  const order = serve.queue.shift();
  if (!order) { serve.active = null; return; }
  const from = walkerPos();
  const counter = coffeeNode('counter').p;
  const targets = serveTargets(order);
  serve.active = {
    id: order.id, mine: !!order.mine, skipCup: false,
    seat: new THREE.Vector2(order.x, order.z), cupAt: targets.cup,
    phase: 'toCounter', wait: 0,
    waypoints: coffeeRoute(from, counter),
    then: coffeeRoute(counter, targets.stand),
  };
  walker.mug.visible = false;
}
function enqueueCoffee(order) {
  if (serve.queue.some((q) => q.id === order.id) || (serve.active && serve.active.id === order.id)) return;
  serve.queue.push(order);
  if (!serve.active) beginCoffee();
}
export function cancelMyCoffee() {
  serve.queue = serve.queue.filter((q) => !q.mine);
  const job = serve.active;
  if (job && job.mine && job.phase !== 'return') {
    job.skipCup = true;
    job.mine = false;
    job.phase = 'return';
    job.wait = 0;
    job.waypoints = coffeeRoute(walkerPos(), nearestPathPoint(walkerPos()).p);
    walker.mug.visible = false;
  }
  clearMyCups();
}
export function orderCoffee() {
  if (!hooks.seatedQuiet() || !hooks.mySlot()) return;
  const btn = document.getElementById('btnCoffee');
  if (btn.disabled) return;
  const seat = hooks.islandOf(myIsland).seats[hooks.mySlot() - 1];
  if (!seat) return;
  const msg = { kind: 'coffee', id: 'cof-' + hooks.myId() + '-' + Date.now().toString(36), x: seat.x, z: seat.z, yaw: seat.yaw, y: seat.y || 0, name: hooks.myName() };
  seenCoffee.add(msg.id);
  const ahead = !!(serve.active && !serve.active.mine) || serve.queue.some((q) => !q.mine);
  enqueueCoffee({ id: msg.id, x: seat.x, z: seat.z, yaw: seat.yaw, y: seat.y || 0, mine: true });
  btn.disabled = true;
  btn.textContent = 'Đang mang…';
  hooks.toast(ahead ? 'Phục vụ đang bận, sẽ mang cà phê tới sau.' : 'Đã gọi cà phê. Phục vụ đang mang tới.');
  if (hooks.isHost()) hooks.broadcastFloor(msg);
  else hooks.sendFloor(msg);
}
export function onCoffeeOrder(msg) {
  if (!msg || !msg.id || seenCoffee.has(msg.id)) return;
  const x = Number(msg.x), z = Number(msg.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  seenCoffee.add(msg.id);
  enqueueCoffee({ id: String(msg.id), x, z, yaw: Number(msg.yaw) || 0, y: Number(msg.y) || 0, mine: false });
}
function setWalkerLegs(moving) {
  const sw = moving ? Math.sin(T.value * 7.5) * 0.45 : 0;
  walker.legs[0].rotation.x = sw; walker.legs[1].rotation.x = -sw;
}
function stepWalker(target, dt) {
  const pos = walkerPos();
  const delta = target.clone().sub(pos);
  const dist = delta.length();
  const step = 1.25 * dt;
  if (dist <= Math.max(step, 0.04)) {
    walker.g.position.set(target.x, 0, target.y);
    setWalkerLegs(false);
    return true;
  }
  delta.multiplyScalar(step / dist);
  walker.g.position.x += delta.x;
  walker.g.position.z += delta.y;
  walker.g.rotation.y = Math.atan2(delta.x, delta.y);
  setWalkerLegs(true);
  return false;
}
function faceWalker(x, z, dt) {
  const yaw = Math.atan2(x - walker.g.position.x, z - walker.g.position.z);
  let diff = yaw - walker.g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  walker.g.rotation.y += diff * Math.min(1, dt * 6);
  setWalkerLegs(false);
}
function updatePatrol(dt) {
  let moving = false;
  if (walk.pause > 0) walk.pause -= dt;
  else {
    walk.d += walk.dir * dt * 1.15; moving = true;
    if (walk.d >= PATH_LEN) { walk.d = PATH_LEN; walk.dir = -1; walk.pause = 4; }
    if (walk.d <= 0) { walk.d = 0; walk.dir = 1; walk.pause = 6; }
  }
  const step = pathAt(walk.d);
  walker.g.position.set(step.p.x, 0, step.p.y);
  walker.g.rotation.y = Math.atan2(step.dir.x * walk.dir, step.dir.y * walk.dir);
  setWalkerLegs(moving);
  walker.mug.visible = walk.dir < 0 || walk.d >= PATH_LEN - 0.01;
}
function finishServe(job) {
  if (job.mine && myIsland > 0) {
    hooks.toast('Cà phê đã tới.');
    const btn = document.getElementById('btnCoffee');
    btn.disabled = false;
    btn.textContent = 'Gọi cà phê';
  }
  dropServeCup(job);
  walker.mug.visible = false;
  job.phase = 'return';
  job.waypoints = coffeeRoute(walkerPos(), nearestPathPoint(walkerPos()).p);
}
export function updateServer(dt) {
  const job = serve.active;
  if (!job) { updatePatrol(dt); return; }
  if (job.wait > 0) {
    job.wait -= dt;
    if (job.phase === 'pick') faceWalker(coffeeNode('counter').p.x, coffeeNode('counter').p.y, dt);
    else if (job.phase === 'serve') faceWalker(job.seat.x, job.seat.y, dt);
    else setWalkerLegs(false);
    if (job.wait > 0) return;
    if (job.phase === 'pick') {
      walker.mug.visible = true;
      job.phase = 'toSeat';
      job.waypoints = job.then;
    } else if (job.phase === 'serve') finishServe(job);
  }
  const wp = job.waypoints[0];
  if (!wp) {
    if (job.phase === 'toCounter') { job.phase = 'pick'; job.wait = 0.7; }
    else if (job.phase === 'toSeat') { job.phase = 'serve'; job.wait = 1.1; }
    else {
      const back = nearestPathPoint(walkerPos());
      walk.d = back.d;
      walk.pause = 0.4;
      serve.active = null;
      beginCoffee();
    }
    return;
  }
  if (stepWalker(wp, dt)) job.waypoints.shift();
}

// ---------- zone labels (plan view) ----------
const ZONES = [
  ['Khu làm việc', '32 chỗ · màn hình đôi', [-0.5, 2, 2]],
  ['Bàn view biển', '6 chỗ hot-desk', [0, 1, -6.2]],
  ['Bar ngắm biển', '6 ghế cao', [-8.5, 1, -7.2], 'warm'],
  ['Quầy cà phê', 'espresso · tủ lạnh · 3 bàn', [-9.3, 1, -3.3], 'warm'],
  ['Lounge nghỉ ngơi', 'sofa · bean bag · ghế treo', [8.4, 1, -5.6]],
  ['Phòng ngủ trưa', '2 nap pod', [11.3, 1, 0]],
  ['Phòng họp', '6 người · TV', [10.5, 1, 5.6]],
  ['Phone booth', '×2', [-11.2, 1, 1.1]],
  ['Phòng server', '4 rack', [-11.2, 1, 6.1]],
  ['Lễ tân', 'lối vào · hồ thủy sinh 120', [-1.45, 1, 6.6]],
  ['Ban công', 'ghế nằm · bàn cà phê', [2, 1, -9.4], 'warm'],
  ['Security', 'tra cứu', [12.42, 1, -3.2]],
];
export const labelsEl = document.getElementById('labels');
export const tags = ZONES.map(([n, s, p, cls]) => {
  const el = document.createElement('div'); el.className = 'tag' + (cls ? ' ' + cls : '');
  el.innerHTML = `<b>${n}</b>${s}`; labelsEl.appendChild(el);
  return { el, v: new THREE.Vector3(...p) };
});

// ---------- views ----------
const VIEWS = {
  v3d: { p: [-17, 14, -24], t: [0, 0, 0] },
  vsea: { p: [0.7, 1.22, -5.75], t: [0.7, 0.75, -11.5] },
  vcafe: { p: [-5.0, 2.3, -0.4], t: [-10.6, 0.9, -5.4] },
  vlounge: { p: [4.6, 2.4, 0.6], t: [9.8, 0.6, -5.6] },
};
export let tween = null;
export let follow = -1;
export let myIsland = 0;
export let hoveredIsland = -1;
export const buttons = [...document.querySelectorAll('#dockView button')];
export function go(id) {
  hooks.endFishWatch();
  if (id !== 'vagent') follow = -1;
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b.id === id)));
  if (id === 'vagent') {
    if (inSecurity) hooks.leaveSecurity();
    if (myIsland !== 0) {
      hooks.toast('Rời bàn trước khi theo agent.');
      buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
      return;
    }
    follow = (follow + 1) % AGENTS.length;
    camera = persp; controls.enabled = false; labelsEl.hidden = true; tween = null;
    document.getElementById('hint').textContent = 'Đang theo Agent ' + AGENTS[follow].d.name + ' · bấm lại để đổi agent';
    return;
  }
  if (id === 'vplan') {
    camera = ortho; controls.enabled = false; labelsEl.hidden = false; tween = null;
    document.getElementById('hint').textContent = 'Mặt bằng nhìn từ trên · bấm một đảo để ngồi';
    return;
  }
  camera = persp; controls.enabled = myIsland === 0; labelsEl.hidden = true;
  if (myIsland === 0) document.getElementById('hint').textContent = 'Bấm một bàn để ngồi · kéo để xoay';
  const v = VIEWS[id], p1 = new THREE.Vector3(...v.p), t1 = new THREE.Vector3(...v.t);
  if (REDUCED) { persp.position.copy(p1); controls.target.copy(t1); tween = null; return; }
  tween = { p0: persp.position.clone(), t0: controls.target.clone(), p1, t1, s: 0 };
}
buttons.forEach(b => { if (b.id !== 'btnFish') b.addEventListener('click', () => go(b.id)); });
controls.addEventListener('start', () => { tween = null; });

function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  persp.aspect = a; persp.fov = a < 0.8 ? 62 : 45; persp.updateProjectionMatrix();
  const halfH = Math.max(11.5, 14.5 / a) * 1.22;
  Object.assign(ortho, { left: -halfH * a, right: halfH * a, top: halfH, bottom: -halfH }); ortho.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();


export function setCamera(v) { camera = v; }
export function setTween(v) { tween = v; }
export function setFollow(v) { follow = v; }
export function setMyIsland(v) { myIsland = v; }
export function setHoveredIsland(v) { hoveredIsland = v; }
export function setWatchingFish(v) { watchingFish = v; }
export function setInSecurity(v) { inSecurity = v; }
export function setFishPose(v) { fishPose = v; }
export function setSecurityPose(v) { securityPose = v; }
export function setSecurityBlocked(v) { securityBlocked = v; }
