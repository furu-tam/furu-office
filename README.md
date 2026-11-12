# furu-office

Văn phòng ảo kiểu oVice: sàn văn phòng Three.js, avatar procedural, âm thanh theo
khoảng cách, gọi riêng 1:1, DND, đi dạo FPV, vỗ vai mời nói chuyện và nhạc cà phê.
Kết nối ngang hàng qua PeerJS (không cần server riêng) — presence đi qua "floor hub"
do một client trong phòng làm host và relay cho phần còn lại.

## Chạy local

```bash
npm run serve            # python3 -m http.server 8977
# mở http://localhost:8977
```

Mở 2 tab/cửa sổ để test tương tác 2 người.

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `WASD` / mũi tên | Di chuyển (chế độ đi dạo FPV) |
| `T` | Đi tới người vừa vỗ vai (kể cả đang FPV) |
| `Y` / `Enter` | Nhận lời mời nói chuyện / nói riêng |
| `N` | Từ chối lời mời |
| `Esc` | Thả chuột / thoát chế độ hiện tại |
| `Home` | Thoát FPV về view mặc định |

FPV giữ pointer lock nên nút trên màn hình không click được — dùng `T`/`Y`/`N`.

## Test

```bash
npm i                  # cài playwright-core (lần đầu)
npm test               # node bench/test-presence.mjs
```

Test mở 2 browser thật kết nối qua PeerJS và assert end-to-end: ngồi → thấy trên
remote, seat→walk khi vào FPV, move lan truyền + body bám theo, yaw đúng chiều
(không quay lưng), và `gone` khi rời. Chạy trước khi push mỗi khi sửa
`src/session.js` (presence/FPV/convo/tap).

Lưu ý:

- Cần server đang chạy ở `:8977` (đổi qua `BENCH_URL`).
- Trình duyệt: mặc định Chrome for Testing; đổi qua `CHROME_BIN`.
- Hub PeerJS là cloud dùng chung → đôi khi thấy người lạ trong roster, bình thường.
- Tab bị ẩn/nền bị throttle rAF — hiện tượng giật/nhảy chỗ lúc test tay là đã biết;
  presence vẫn được duy trì bằng interval 250ms + heartbeat beat/pong 25s.

## Benchmark hiệu năng

```bash
npm run bench          # node bench/run-bench.mjs run → bench/results-*.json
```

Đo fps/draw-calls/triangles theo ma trận 1–20 avatar (sit/stand/mixed).
Xem HUD realtime: mở `index.html?perf=1`, hoặc inspect roster qua
`index.html?bench=1` rồi `__bench.rows()` trong console.

## Kiến trúc nhanh

- `src/world.js` — scene văn phòng, ghế, đảo, camera, agent; export `hooks` cho session.
- `src/session.js` — presence, floor hub, PeerJS call/chat, FPV walk, convo, pair, DND.
- `src/avatar.js` — nhân vật procedural (`buildCharacter`/`buildWalker`, look JSON sync qua presence).
- `src/loop.js` — render loop; `tickSession` cập nhật FPV, `placeOffice` bám tag/interp.
- `src/perf.js`, `src/bench.js`, `bench/` — perf counter + driver benchmark/test.

Convention vị trí: `walk` presence mang `wx/wz/wyaw` (wyaw là **yaw model** =
yaw camera + π); remote nội suy `body.position → wx/wz` trong `placeOffice`.
