# furu-office — tài liệu kỹ thuật

Tài liệu cho dev đọc code. Kiến thức gốc nằm rải trong commit messages, issue #1/#2
và comment tiếng Việt trong code — thư mục này gom lại thành bản đồ.

| File | Nội dung |
|---|---|
| [protocol.md](protocol.md) | Bản đồ tin nhắn: floor hub, presence, table conn, walk conn, các flow đầy đủ |
| [audio.md](audio.md) | Mô hình âm thanh: gain theo khoảng cách, pair/broadcast/DND/duck, watchdog tự lành |
| [fpv.md](fpv.md) | Đi dạo FPV: di chuyển, yaw convention, collision, tap→teleport→convo mesh |
| [testing.md](testing.md) | Suite regression 2-3 browser, hub test riêng, debug panel, dọn ghost |

## Mental model — 3 "tầng" kết nối độc lập

App **không có server riêng**. Mọi thứ đi qua PeerJS cloud (broker signaling miễn
phí). Một client giữ **3 loại Peer độc lập**, mỗi loại một ID pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. FLOOR PEER — presence + chat + tap                           │
│    ID cố định: {HUB_PREFIX}-{0..7}   (mặc định furu-hub-N)       │
│    Ai claim được ID hub trước làm HOST, còn lại connect vào làm  │
│    CLIENT. Host giữ roster + relay mọi tin nhắn phòng.           │
│    → session.js: claimFloor/scanHub/probeHub/becomeHost/Client   │
├─────────────────────────────────────────────────────────────────┤
│ 2. TABLE PEER — gọi audio khi NGỒI tại một đảo                   │
│    ID: furuoff-d{island}-{myId}   (vd: furuoff-d3-abc123)        │
│    Mở khi ngồi xuống đảo talk (bỏ qua đảo quiet). Ngồi cùng đảo │
│    → tự dial lẫn nhau = mesh audio bàn.                         │
│    → session.js: openTablePeer/dial/attachCall/wireConn          │
├─────────────────────────────────────────────────────────────────┤
│ 3. WALK PEER — mời + convo khi ĐI DẠO (FPV)                      │
│    ID: furuoff-w-{myId}                                          │
│    Mở lần đầu vào FPV. Data conn mang invite/convo-join, media   │
│    conn (call) mang audio convo — mesh đầy đủ giữa các member.   │
│    → session.js: ensureWalkPeer/sendInvite/joinConvo/dialWalk    │
└─────────────────────────────────────────────────────────────────┘
```

Ba tầng không phụ thuộc nhau: đi dạo vẫn thấy presence (floor) nhưng không có
table call; ngồi bàn vẫn giữ walkPeer nhưng convoSet đã clear.

## File map

| File | Vai trò |
|---|---|
| `src/session.js` (~3.2k dòng) | Tất cả network + state: presence, floor, calls, chat, tap, FPV, convo, pair, DND, notification |
| `src/world.js` | Scene Three.js: sàn, đảo bàn, ghế, colliders, agent, café, phòng họp, `colliders`, `islands` |
| `src/avatar.js` | Avatar procedural theo `look` JSON (buildWalker/buildSeated) |
| `src/game-room.js` | Bàn game (werewolf) — đảo riêng có mic chung |
| `src/wolf-game.js` | Logic game ma sói |
| `src/loop.js` | Render loop + `tickSession(dt)` + `placeOffice` (nội suy avatar theo wx/wz) |
| `src/bench.js` | `window.__bench` — API test/benchmark, chỉ load khi `?bench` |
| `src/debug.js` | Debug panel — `` ` `` toggle, `c` copy log, `?debug=1` |
| `src/perf.js` | HUD fps/draw-call khi `?perf=1` |
| `bench/test-presence.mjs` | Suite regression 3 browser (npm test) |
| `bench/run-bench.mjs` | Driver benchmark hiệu năng avatar |

## Đảo (islands) — `world.js`

4 đảo làm việc × 8 ghế + các đảo đặc biệt. Cờ trên island quyết định hành vi audio:

| Cờ | Nghĩa | Đảo |
|---|---|---|
| (mặc định) | Đảo talk — ngồi là mở table peer, nghe theo khoảng cách ghế | Đảo 1-4, View biển |
| `quiet: true` | Đảo yên tĩnh — không mở peer, không call | Cà phê, Giải lao |
| `share: true` | Phòng họp — mọi người nghe full volume + screen share lên TV | Phòng họp |

## Tọa độ & convention

- Trục: `x` ngang, `z` sâu; biển về phía `-z`; sàn y=0.
- Vùng đi được clamp `x∈[-11.9,11.9]`, `z∈[-8.9,8.9]`; tường/vật cản trong `colliders` (`hitWall`).
- **Yaw**: camera nhìn `-Z`, model quay `+Z` → presence gửi `yaw = fpvYaw + π`.
  Đọc kỹ [fpv.md](fpv.md#yaw) trước khi đụng vào yaw.
- Tên người = `localStorage['furu-office-look'].name`; look = JSON trong cùng key.

## Khi gặp bug — bắt đầu từ đâu

| Triệu chứng | Nghi tới | Đọc |
|---|---|---|
| Không thấy ai trong phòng | floor split-brain, ghost hub | [protocol.md — floor hub](protocol.md#floor-hub) |
| Ngồi cạnh nhau không nghe | table peer chết, ICE, conn pending | [audio.md — self-heal](audio.md#self-heal) |
| Nghe họ mà họ không nghe mình | mic track 'ended' ngầm | [audio.md — mic reacquire](audio.md#self-heal) |
| 3 người convo nhưng 2 người không nghe nhau | star topology — đã fix bằng mesh | [fpv.md — convo mesh](fpv.md#convo) |
| Avatar quay lưng / đi lùi | sai yaw convention | [fpv.md — yaw](fpv.md#yaw) |
| Bị đá khỏi convo lúc đi xa | convoFar auto-leave | [fpv.md — convo](fpv.md#convo) |
| User "ma" nằm lại roster | conn chết chưa reap / host code cũ | [protocol.md — ghost](protocol.md#ghosts) |

## Công cụ chẩn đoán

- Debug panel: bấm `` ` `` → xem peer/conn/call/ICE/floor/walk realtime; `c` copy
  log 200 sự kiện (persist localStorage `furu-dbgl`, sống qua reload).
- `localStorage['furu-dbg']='1'` để panel mở sẵn mỗi lần load.
- `?bench=1` → `__bench` trong console: `rows()`, `convo()`, `floor(msg)`, `invite(id)`.
