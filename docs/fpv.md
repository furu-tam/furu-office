# FPV — đi dạo & convo ngoài sàn

Chế độ first-person: `vwalk` → `enterFpv()` → pointer lock trên canvas, WASD +
chuột nhìn, avatar procedural (`buildWalker`) xuất hiện trong scene cho remote.

## Vòng đời

| Hàm | Việc |
|---|---|
| `enterFpv(sx?, sz?, syaw?)` | `leaveDesk` nếu đang ngồi → `ensureWalkPeer` → `fpv=true`, spawn `(sx,sz)` hoặc `(0,4)`, `announceWalk` |
| `exitFpv` | `fpv=false`, gỡ pointer lock, `gone` nếu `myIsland===0`, về `v3d` |
| `sitFromWalk` | gần ghế (`sitNear`) → `exitFpv` + `joinDesk(island,slot)`. `leaveDesk` return sớm khi `myIsland===0` nên **convo được giữ** — rời theo `convoFar` nếu ngồi xa nhóm |
| `announceWalk` | gửi `{here, who:{walk:1,x,z,yaw:fpvYaw+π,walkId,look}}` |
| `sendWalkPos` | `{move,id,x,z,yaw:fpvYaw+π}` throttle 100ms |

### Presence walker

- `who.walk=1` + `x/z/yaw` → remote `upsertSeat` build `bodyKind='walk'`,
  nội suy `body.position → wx/wz` + `body.rotation.y → wyaw` trong `placeOffice`.
- `sendWalkPos` chạy từ **2 nguồn**: `fpvTick` (rAF, foreground mượt) +
  interval 250ms — tab nền Chrome throttle rAF nên chỉ rAF sẽ làm remote thấy
  avatar đông cứng. `visibilitychange` flush thêm 1 gói.

## Yaw — convention BẮT BUỘC {#yaw}

> `who.yaw = fpvYaw + Math.PI` — gửi **yaw model**, không gửi yaw camera.

- Camera `persp` nhìn theo hướng `-Z` của mình; `fpvYaw` là yaw camera.
- Model avatar mặc định quay mặt `+Z` → muốn model nhìn cùng hướng camera thì
  `body.rotation.y = fpvYaw + π`.
- Presence gửi luôn `+π` để remote chỉ `body.rotation.y = row.wyaw` — và
  `goToRow` dùng `row.wyaw` tính "điểm sau lưng" cho đúng.
- **Đảo ngược convention = avatar quay lưng/đi lùi** (đã từng bug — commit
  "Send model-facing yaw for walkers"). Sửa `wyaw` ở bất cứ đâu phải giữ
  `= fpvYaw + π` ở cả `announceWalk` lẫn `sendWalkPos`.

## Di chuyển

- `fpvTick(dt)` mỗi frame: KEYMAP WASD/mũi tên → vector theo `fpvYaw`,
  tốc độ 3 m/s. `hitWall` check per-axis (trượt theo tường, không kẹt).
- `hitWall(x,z)`: point+radius 0.3 vs `colliders` (AABB `{x0,x1,z0,z1}` trong
  `world.js` — tường, đảo bàn, quầy, bể cá...). Clamp `x∈[-11.9,11.9]`,
  `z∈[-8.9,8.9]`.
- `findSpawn(x,z,island)`: điểm trong wall → đẩy ra xa `island.center` (mỗi bước
  0.2m, tối đa 40) → vẫn kẹt → fallback `(0,4)`.
- `keydown` khi đang gõ INPUT/TEXTAREA → `fpvKeys.clear()` + return (commit
  "Ignore FPV movement keys while typing").

## Ngồi & tap trong FPV

- `sitNear`: ghế trong `SIT_RANGE=1.45m` → `sitBtn` hiện / phím `E` → `sitFromWalk`.
- Tap: click (raycast `fpvAct`) hoặc đứng gần + `tapTag` button →
  `d ≤ TAP_RANGE` → `sendInvite` trực tiếp; xa hơn → `askNotify` + `tapShoulder`
  (tap thường qua floor — chỉ báo "đang gọi", không mở convo).
- **Phím tắt vì pointer lock**: `T` = Đi tới người vỗ vai (`goToTapper`),
  `Y`/`Enter` = nhận `tapAsk`/`pairAsk`, `N` = từ chối, `Esc` = đóng bell/thả
  chuột, `G` = gọi agent, `E` = ngồi.

### `goToRow(row)` — teleport "Đi tới"

```
p = posOf(row);  back = row.walk ? row.wyaw : seat.yaw
điểm = p - dir(back)*1.3m        → hitWall → findSpawn
yaw = atan2(điểm - p)            → nhìn vào lưng họ
fpv? dịch chuyển : enterFpv(x,z,yaw)
row.walkId → setTimeout(sendInvite, 400ms) — auto mời sau khi tới
```

## Walking convo — mesh P2P {#convo}

Convo = nhóm walker nói chuyện proximity, tách khỏi table calls. State:

| Biến | Vai trò |
|---|---|
| `walkPeer` | Peer `furuoff-w-{id}` — data conns (mời) + media calls (audio) |
| `wconns` | `walkId → DataConnection` — kênh invite/convo-join/convo-leave |
| `walkCalls`/`walkStreams` | `walkId → MediaConnection`/`remoteStream` |
| `convoSet` | Set walkId member hiện tại — gain + quyền answer + auto-leave |
| `pendingWalk` | walkId được duyệt trước call vào (đang chờ dial/answer) |
| `convoFar` | Đếm thời gian xa toàn bộ member |

### Gate answer (`walkPeer.on('call')`)

Chỉ answer nếu `pendingWalk` hoặc `convoSet` chứa `call.peer` — call lạ đóng
luôn. Vì vậy **ai muốn gọi ai thì phía bên kia phải được báo trước** qua
`convo-join`/`invite-accept` — đây là lý do protocol báo cả 2 chiều.

### Hình thành mesh (sau fix `4533465`)

X mời B vào convo đang có member cũ (vd A):

```
B nhận {invite} → tapYes:
    gửi {invite-accept, members:[...convoSet_B, B]} cho X
    báo member cũ của B: {convo-join, id:X}   (kéo X vào group nếu B đang convo)
    convoSet_B += X; pendingWalk_B += X
X nhận accept → joinConvo(B, members_B):
    convoSet_X += B + members_B; dialWalk(B); dialWalk(mỗi member mới @700ms)
    với mỗi member cũ w của X:
        gửi w: {convo-join, id:B}         → w thêm B + pendingWalk (chờ call)
        gửi B: {convo-join, id:w, dial:1} → B thêm w + dialWalk(w) @600ms
→ mọi cặp tự dial → mesh đầy đủ. Trước fix: chỉ X gọi cả hai = star,
  A và B không nghe nhau.
```

Nếu **B đang trong convo khác** khi X mời: `invite-accept` của B mang
`members=[...]` → X joinConvo thêm cả member của B vào group → hai nhóm hợp nhất
(B đã báo member của nó về X bằng `convo-join` ở tapYes).

### Giữ & rời convo

- `convoFar`: interval 250ms — `convoSet.size>0` mà **không member nào** trong
  `HEAR_RANGE*1.5` (3.9m) → `+0.25` mỗi tick; đủ `5` (≈5s) → `leaveConvo()` +
  toast "Đi quá xa". Có 1 member gần → reset 0.
- `leaveConvo(silent)`: báo `{convo-leave, id:myWalkId}` cho từng member →
  đóng walkCalls/walkStreams/wconns → `convoSet.clear()`. Remote nhận
  `convo-leave` → `dropWalkPeer(id)` (đóng call/stream, xóa convoSet).
- Nút `btnConvoEnd` hiện khi `convoSet.size>0`.
- `dropWalkPeer` còn chạy khi walk `call.on('close')` hoặc `conn.on('close')`
  — conn media chết thì member rớt khỏi convo luôn.
- `removeSeat(id)` (row gone) đóng luôn `walkCalls`/`wconns` + `dropWalkPeer`.

## Agent & nhạc khi đi dạo

- `callAgent` (nút/phím `G`): `summonAgent(x,z)` trong `world.js` — agent gần
  nhất ở phone booth chạy tới, chờ ở home nếu không có.
- `cafeGain` áp cho walker luôn — vào `CAFE_ZONE` là nghe nhạc (xem audio.md).
- Walker vẫn nhận chat/tap/notification bình thường qua floor.

## Test liên quan

`bench/test-presence.mjs` phủ: walk row lan truyền, `wyaw` model-facing, body
bám `wx/wz`, teleport `T` về đúng tầm `d<3.5m`, mesh convo 3 người bền qua
ngưỡng auto-leave. Chạy `npm test` sau mọi thay đổi ở vùng này.
