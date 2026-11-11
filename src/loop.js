import * as THREE from 'three';
import { placeOffice, updateVoiceMeters, tickSession, isFpv } from './session.js';
import { tickAvatar } from './avatar.js';
import { perfStart, perfEnd } from './perf.js';
import {
  AGENTS, AQ, G, REDUCED, T, boat, camera, controls, follow, gulls, ortho, persp, rackMats, renderer, scene, seaMat, setTween, tags, tween, updateAgents, updateServer
} from './world.js';

// ---------- loop ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let shadowTick = 0;
// Bóng đổ render lại mỗi 3 frame: avatar cử động chậm (thở ~6mm) nên
// shadow map re-render mỗi frame lãng phí ~26% CPU ở phòng 20 người.
// ?noshadow để A/B benchmark.
const SHADOW_DIV = new URLSearchParams(location.search).has('noshadow') ? 1 : 3;
renderer.setAnimationLoop(() => {
  perfStart();
  renderer.shadowMap.autoUpdate = (shadowTick++ % SHADOW_DIV) === 0;
  const dt = Math.min(clock.getDelta(), 0.05);
  T.value += dt; seaMat.uniforms.uT.value = T.value;
  boat.position.x = -60 + ((T.value * 1.2) % 140); boat.rotation.z = Math.sin(T.value * 0.9) * 0.04;
  rackMats.forEach((m, i) => { m.emissiveIntensity = 1.0 + 0.35 * Math.sin(T.value * (5 + i) + i); });
  AQ.update(dt);
  updateAgents(dt, T.value);
  updateServer(dt);
  for (const person of G.people.children) {
    const av = person.userData.avatar;
    if (!av) continue;
    if (av.glb) { if (av.mixer) av.mixer.update(dt); }
    else tickAvatar(av, dt, T.value, REDUCED);
  }
  for (const b of gulls) {
    b.a += b.speed * dt;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    b.g.position.set(b.cx + b.rx * ca, b.y + Math.sin(b.a * 2 + b.ph) * 1.2, b.cz + b.rz * sa);
    const dx = -b.rx * sa * Math.sign(b.speed), dz = b.rz * ca * Math.sign(b.speed);
    b.g.rotation.y = Math.atan2(dx, dz);
    b.g.rotation.z = -0.3 * Math.sign(b.speed);
    const glide = Math.sin(T.value * 0.35 + b.ph) > 0.35;
    const amp = glide ? 0.06 : 0.6, f = T.value * b.flap + b.ph;
    for (const w of b.wings) {
      w.inner.rotation.z = w.s * (Math.sin(f) * amp + 0.15);
      w.outer.rotation.z = w.s * (Math.sin(f - 0.7) * amp * 0.8 - (glide ? 0.12 : 0));
    }
  }

  if (tween) {
    tween.s = Math.min(1, tween.s + dt / 1.4);
    const e = tween.s < 0.5 ? 4 * tween.s ** 3 : 1 - (-2 * tween.s + 2) ** 3 / 2;
    persp.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.s >= 1) {
      const sit = tween.sit;
      const fish = tween.fish;
      setTween(null);
      if (sit || fish) {
        controls.enabled = true;
        controls.minDistance = fish ? 0.4 : 0.8;
        controls.maxDistance = fish ? 3.2 : 3.4;
        controls.maxPolarAngle = fish ? Math.PI * 0.7 : Math.PI * 0.62;
      }
    }
  }
  if (follow >= 0) {
    const a = AGENTS[follow], fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), kf = 1 - Math.exp(-dt * 2.5);
    tmp.set(a.g.position.x - fx * 2.8, 2.0, a.g.position.z - fz * 2.8); persp.position.lerp(tmp, kf);
    tmp.set(a.g.position.x + fx * 1.0, 0.8, a.g.position.z + fz * 1.0); controls.target.lerp(tmp, kf);
    persp.lookAt(controls.target);
  } else if (camera === persp && !tween && !isFpv()) controls.update();
  else if (camera !== persp) {
    const w = innerWidth, h = innerHeight;
    for (const t of tags) {
      tmp.copy(t.v).project(ortho);
      t.el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; t.el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
    }
  }
  tickSession(dt);
  placeOffice();
  updateVoiceMeters();
  renderer.render(scene, camera);
  perfEnd();
});
