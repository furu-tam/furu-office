# Testing & debug — đồ chơi kiểm thử

## Suite regression — `bench/test-presence.mjs`

```bash
npm run serve          # terminal 1: server :8977
npm test               # terminal 2
```

Mở **3 browser headless thật** (playwright-core, Chrome for Testing +
`--use-fake-device-for-media-stream`) kết nối qua PeerJS cloud — không mock.
Mỗi case là 1 bug đã từng xảy ra:

| Case | Khóa regression |
|---|---|
| A thấy B ngồi | seat row lan truyền qua floor |
| A thấy B đi dạo | seat→walk transition (mất row) |
| yaw đúng chiều | avatar quay lưng (wyaw = fpvYaw+π) |
| move lan truyền + body bám wx/wz | nội suy vị trí walker |
| B teleport `T` tới A | tap→"Đi tới" khi pointer lock |
| A-B convo | invite→accept→call 2 chiều |
| mesh 3 người | convo-join báo member cũ ↔ người mới (star→mesh); chờ >5s chứng minh bền qua convoFar |
| B rời → row mất | `gone` + removeSeat |

- Exit code 0 = tất cả PASS.
- `CHROME_BIN` đổi binary; `BENCH_URL` đổi server.
- **Hub test riêng**: URL `?hub=furu-test` → floor id `furu-test-hub-*`, tách
  hẳn production `furu-hub-*`. Bot test tên "T" (localStorage name) — nếu thấy
  "T" trong phòng thật nghĩa là có test đang chạy trên prefix production (bug,
  không được phép).

## `__bench` — API điều khiển trong page (`?bench=1`)

| Hàm | Tác dụng |
|---|---|
| `rows()` | Snapshot roster: id/walk/wx/wz/wyaw/table/slot/body/kind/px/pz/visible/bx/bz |
| `myId()` | id session hiện tại |
| `spawnSeated(n)` / `spawnWalkers(n)` / `spawnMixed(n)` | Spawn row giả qua `upsertSeat` thật (đo hiệu năng/điền phòng) |
| `invite(id)` | `sendInvite(people.get(id))` — mời convo không cần UI |
| `convo()` | `[...convoSet]` — kiểm tra membership mesh |
| `floor(msg)` | Gửi floor message thật (host → broadcastFloor; client → sendFloor). Dùng gửi `{kind:'tap'}` hay `{kind:'gone'}` thủ công |
| `churn({cycles,walk})` | Vòng upsert/remove — lộ rò rỉ geometry/material |
| `counts()` / `probe()` | Đếm mesh/material/texture + thông tin renderer |

## Debug panel — `src/debug.js`

Mở: `` ` `` (backquote), `?debug=1`, hoặc `localStorage['furu-dbg']='1'` + reload.
Render 2Hz từ `hooks.debug()`:

- Dòng 1: `id · đảo · mic/cam · FPV/DND/BC`
- `peer`: table peer `open/destroyed/disconnected`
- `stream`: tracks local `live/ended`
- `floor`: `host/link/conns/people`
- `walk`: `peer/convo/conns/calls/streams`
- `peers:` từng người — `conn=open|dead`, `call=open|dead ice=...`, `rx`, `gain`
- `log:` 200 sự kiện gần nhất — `sit/leave/peer open|err/dial/conn±/call±/stream±/ice=`

**Copy log**: panel mở → `c`, hoặc `__dbgCopy()` trong console. Log persist ở
`localStorage['furu-dbgl']` (xoay vòng 200 dòng, sống qua reload, kèm marker
`— boot <id> —` + `window.onerror`/`unhandledrejection`/`console.error`).

Dấu hiệu đọc nhanh: `conn=dead`/`call=dead` = nửa vời; `ice=failed|disconnected`
lặp = đường P2P hỏng; `stream ended` = mic chết ngầm.

## Dọn ghost thủ công

User chết còn row trên roster (host code cũ không reap):

```js
// vào trang với ?debug=1, console:
__bench.floor({ kind: 'gone', id: '<myId-của-ghost>' })
```

→ host `applyPresence(gone, relay=true)` → purge khỏi mọi client. Kiểm tra
roster: `__bench.rows()`.

Ghost **hub** (`furu-hub-N` bị giữ bởi socket chết): tự hết — `probeHub` timeout
→ scan qua hub kế; broker thu socket sau vài phút → converge 40s dồn mọi người
về. Không can thiệp được từ client.

## Benchmark hiệu năng

```bash
npm run bench          # node bench/run-bench.mjs → bench/results-*.json
```

Ma trận avatar 1–20 (seated/walk/mixed), đo fps/draw-calls/triangles qua
`?bench=1&perf=1`. `churn` để soi memory leak. `?perf=1` = HUD realtime.

## Ghi chú flake đã biết

- Case đầu đôi khi FAIL do **ghost hub production** làm scan chậm — test đã
  chờ `floor.link` thật thay vì sleep cứng; nếu vẫn flake thì đó là môi trường
  (hub bị ghost), không phải code.
- `pageerror "pointer lock"` trong headless là **bình thường** — Chrome headless
  không grant pointer lock; FPV vẫn vào được.
- gUM trong headless: fake device trả track sống — convo/call test được; riêng
  `reacquireMic` không cover (không giả lập được track ended).
