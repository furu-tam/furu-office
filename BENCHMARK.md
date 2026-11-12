# Avatar Rendering Benchmark — furu-office

Environment: Apple M1 Pro, Chromium 124 (headless, ANGLE Metal), 1440×900 @ dpr 1
(plus a dpr 2 spot-check), `index.html?bench=1` driving the real
`upsertSeat`/`removeSeat` presence path. Metrics: `src/perf.js` — frame Δ, loop
CPU, `renderer.info` sampled in the same tick right after `renderer.render()`
(before `info.autoReset` clears it on the next render).

## Baseline → after (dpr 1)

| scenario | fps before | fps after | cpu ms avg before | after | calls before | after | meshes/avatar |
|---|---|---|---|---|---|---|---|
| 1 sit | 60.0 | 60.0 | 6.6 | 5.9 | 1501 | 1487 | 42 → 25 |
| 5 sit | 60.0 | 60.0 | 8.1 | 6.6–12.7 | 1680 | 1601 | |
| 5 stand | 60.0 | 60.0 | 8.0 | 6.9 | 1687 | 1615 | |
| 5 mixed | 60.0 | 60.0 | 8.3 | 7.1 | 1671 | 1582 | |
| 10 sit | 60.0 | 60.0 | 9.4 | 7.1 | 1890 | 1733 | |
| 10 stand | 59.3 | 60.0 | 16.5 | 7.0 | 1994 | 1748 | |
| 10 mixed | 57.1 | 60.0 | 17.2 | 7.2 | 2217 | 1738 | |
| 20 sit | 42.7 | **60.0** | 23.0 | 8.9 | 2336 | 1997 | ~44 → ~26 |
| 20 stand | 43.4 | **59.8** | 22.7 | 10.3 | 2348 | 2080 | |
| 20 mixed | 39.6 | **60.0** | 24.9 | 8.8 | 2543 | 1999 | ~54 → ~26 |
| 20 sit + local GLB | 39.2 | **60.0** | 25.1 | 8.8 | 2466 | 2002 | |
| churn ±1/100ms (10 av) | 57.1 | 60.0 | 16.6 | 7.6 | 2054 | 1725 | |

dpr 2 spot-check (20 seated): **35.9 → 52.8 fps** (cpu 27.6 → 17.6 ms).
Retina is GPU-fill-bound; dpr 1 is the vsync-capped 60 ceiling either way.

## Bottlenecks found (evidence)

1. **Per-mesh draw-call/object overhead — primary.** `renderer.render()` ≈ 100%
   of loop CPU (measured by patching `render`); `tickAvatar`/`placeOffice` are
   minor. Procedural avatar = ~42–75 meshes (curly hair `xoan` ≈ 160 spheres)
   each with own geometry+material → ~50 calls/avatar across both passes.
2. **Shadow-map re-render every frame ≈ 26% of frame time** at n=20
   (autoUpdate frozen: 26.7→19.8 ms cpu, 36.9→49.7 fps). Avatar motion is
   ~6 mm breathing — per-frame shadow updates are wasted.
3. Tiny casters: eyes/mouth/jewelry/curls (2–7 cm) drew shadows nobody sees.
4. No leak on join/leave: geometries/textures flat after 80 rebuild cycles;
   `disposeAvatar`/`disposeGlbBody` free correctly. Presence updates already
   skip rebuild via `lookSig` (verified live: same look → same body object;
   changed look → rebuild). GLB local avatar costs ~2 calls + 1 mixer — cheap.

## Optimizations applied

1. **`optimizeAvatar()` in `avatar.js`** — after `buildCharacter` assembles the
   parts, merge sibling meshes sharing (material, castShadow, receiveShadow)
   inside each articulating group (`BufferGeometryUtils.mergeGeometries` with
   baked local matrices). Head/torso/legs/blink stay separate groups →
   breathing, head sway, leg swing, blink all preserved (verified live).
   ~42–75 → ~25 meshes/avatar. Also `?nomerge` A/B flag.
2. **Small-part shadow pruning** — meshes with bounding-sphere radius × scale
   < 7 cm get `castShadow = false` before merging (buckets keep cast flag).
3. **Shadow update every 3rd frame** in `loop.js` (`?noshadow` for A/B) —
   biggest single win; shadow latency ~50 ms is invisible at avatar speeds.

Not needed: InstancedMesh/LOD (avatars are skinned-articulated + now ~25 draws,
GPU isn't the dpr-1 bottleneck), geometry/material caches across avatars
(disposal ownership risk, weak evidence — see limitations).

## Files

- `src/perf.js` — monitor + `window.__perf` + `?perf` HUD.
- `src/bench.js` — `?bench` driver (`window.__bench`), real presence path,
  GLB via real `saveGlbFile`, churn test, mesh counters, `?bench=gen` fixture gen.
- `bench/` — `run-bench.mjs` (needs `playwright-core` + Chrome; serve repo on
  :8977), `bench-avatar.glb` fixture, captured `baseline-*.json`/`after-*.json`.
- `vendor/three/addons/exporters/GLTFExporter.js` + `utils/TextureUtils.js` —
  only for regenerating the fixture (`node bench/run-bench.mjs gen`).

## Remaining limitations

- **dpr 2 (retina) ≈ 53 fps** at n=20 — GPU fill + PCFSoft sampling, not draws.
  Further gains need visual tradeoffs not taken: pixelRatio 2→1.5, shadow map
  2048→1024, PCFSoft→PCF, or vertex-color single-material merge (~10 draws/av,
  loses per-part roughness). Shadow frames also create ~30 ms p95 spikes at
  dpr 2 (1 in 3 frames re-renders the map) — even pacing, slightly uneven.
- Benchmarks are one machine/GPU; absolute numbers transfer loosely.
- Headless rAF is vsync-pinned at 60 — wins above 60 fps only show as cpu ms.
- `bench/` + `?bench`/`?perf`/`nomerge`/`noshadow` are dev tooling: zero cost
  in normal use (bench.js only loads with `?bench`), but they ship in the repo.
- The office scene itself is ~1450 calls before any avatar — out of scope.
