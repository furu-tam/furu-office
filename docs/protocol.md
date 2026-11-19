# Protocol — bản đồ tin nhắn & flow

Toàn bộ signaling đi qua PeerJS `DataConnection` (`reliable: true`); audio/video
đi qua `MediaConnection` (WebRTC). Không có server app — PeerJS cloud chỉ làm
broker để peer tìm nhau, còn relay nội dung do **floor host** (một client) đảm nhiệm.

## Peer IDs

| Pattern | Tầng | Ví dụ |
|---|---|---|
| `{hub}-{0..7}` | floor hub ID cố định (host claim) | `furu-hub-0` |
| `furuoff-d{island}-{myId}` | table peer khi ngồi đảo | `furuoff-d2-abc123` |
| `furuoff-d{island}-{myId}-r{n}` | table peer retry (né id ma) | `furuoff-d2-abc123-r2` |
| `furuoff-w-{myId}` | walk peer khi FPV | `furuoff-w-abc123` |

- `myId` random mỗi session. `HUB_PREFIX` mặc định `furu-hub`; `?hub=<p>` đổi
  thành `<p>-0..7` (test dùng `furu-test` — **tuyệt đối không test trên prefix thật**).
- Retry `-r{n}`: `openPeerAttempt` — peer vừa destroy nhưng broker chưa giải phóng
  ID → `unavailable-id`; thử lại với hậu tố, tối đa `PEER_TRIES = 3`.

## 1. Floor hub — presence backbone {#floor-hub}

### Scan & claim (`claimFloor → scanHub`)

```
claimFloor()
  └─ scanHub(gen, 0): duyệt hub 0→7
       ├─ thử new Peer(HUBS[i])           → open? mình làm HOST (becomeHost)
       ├─ unavailable-id (có người giữ)   → probeHub: connect vào, gửi 'ping'
       │      ├─ nhận 'beat'/'roster'     → becomeClient — hub đang sống
       │      └─ timeout ~7-9s            → scanHub(i+1) — host ma (ghost)
       └─ hết 8 hub                       → chờ 4s, quét lại từ đầu
```

`floorGen` tăng mỗi lần claimFloor — mọi callback kiểm tra `gen !== floorGen`
để bỏ qua kết quả cũ (tránh 2 vòng scan chồng nhau).

### Host (`becomeHost`)

- `floorConns[]`: conn của mọi client. Mỗi conn mới được gửi ngay:
  `{kind:'beat'}`, `{kind:'roster', people}`, `{kind:'log', items: roomLog[-30:]}`.
- Mỗi 2.5s broadcast `{kind:'beat', t}` — heartbeat cho client.
- **Reap**: client code mới trả `{pong}` mỗi khi nhận `beat` → host đánh dấu
  `conn._pong`. Conn đã `_pong` mà >25s không `_seen` (không data nào tới) →
  đóng conn + phát `{kind:'gone'}`. Conn không `_pong` (client bản cũ) không bị
  reap — không phân biệt được "chết" với "im lặng hợp lệ".
- Conn `close` → nếu là conn cuối của `whoId` đó → `gone`.
- Relay: `onFloorData` nhận `here/gone/move/say/tap/tap-dnd/coffee` →
  `broadcastFloor` cho toàn bộ client khác.

### Client (`becomeClient`)

- `floorLink` = conn tới host. Nhận `beat` → cập nhật `lastBeat`.
- `lastBeat` cũ >8s → coi host chết → `claimFloor()` quét lại (tự chuyển hub,
  có thể thành host mới trên hub trống thấp nhất).
- Gửi presence đầu tiên ngay khi join (`pendingPresence` hoặc `{here}`).

### Converge — dồn về hub thấp {#converge}

Host chết giữa chừng → broker giữ ghost ID hub thấp → client dạt sang hub cao
→ hub thấp được giải phóng sau → **hai floor song song** (2 nhóm người không thấy
nhau). Vá: ai ở `floorHub > 0` mỗi ~40s `probeAlive` các hub thấp hơn → thấy hub
thấp sống → `claimFloor()` dồn về.

### Tin nhắn floor (`onFloorData` / `sendPresence` / `broadcastFloor`)

| kind | Chiều | Payload | Nghĩa |
|---|---|---|---|
| `here` | client→host→all | `{who}` | Row presence mới/cập nhật (seat hoặc walk) |
| `move` | client→host→all | `{id,x,z,yaw}` | Walker di chuyển (throttle 100ms) |
| `gone` | ai→host→all | `{id}` | Row rời phòng — cũng dùng tay để purge ghost |
| `roster` | host→client mới | `{people[]}` | Snapshot toàn bộ roster |
| `beat` | host→all | `{t}` | Heartbeat 2.5s |
| `ping` | client→host | — | Probe host còn sống không |
| `pong` | client→host | — | Trả lời mỗi `beat` — host biết client code mới còn sống (để reap) |
| `say` | ai→host→all | `{id,from,name,text,t}` | Chat phòng |
| `log` | host→client mới | `{items[]}` | 30 tin chat gần nhất |
| `tap` | ai→host→all | `{id,to,from,name}` | Vỗ vai — relay qua host + direct desk conn |
| `tap-dnd` | ai→host→all | `{to,from,name}` | Trả lời "đang DND" |
| `coffee` | ai→host→all | `{id,x,z,yaw,y}` | Gọi cà phê — agent phục vụ |
| `bye` | desk conn | — | Rời đảo |

### `who` — presence row schema {#who}

```js
// Ngồi:  { id, name, table, slot, peerId, walkId, look }
// Đi dạo: { id, name, walk: 1, x, z, yaw, walkId, look }
```

`upsertSeat(info)` chuyển đổi qua lại (seat↔walk) — rebuild avatar body đúng
`bodyKind`, gán `personId` cho raycast. `rowByWalk(wid)`/`seatByPeer(pid)` là
2 tra cứu ngược từ peer id về row.

## 2. Table peer — gọi audio theo đảo

Mở bởi `openTablePeer` khi `joinDesk` vào đảo talk. ID `myCallId()` —
`furuoff-d{island}-{myId}` — nghĩa là **đổi đảo = đổi ID** (destroy + mở lại).

### Data conn (`wireConn` → `handleData`)

| kind | Nghĩa |
|---|---|
| `hello` | Bắt tay: `{name, mic, cam, bc, dnd}` — gửi ngay khi conn open |
| `msg` | Chat riêng trong đảo (text ≤300) |
| `state` | Cập nhật cờ `{mic, cam, bc, dnd}` |
| `pair-invite/accept/decline/busy/end` | Bắt tay nói riêng 1:1 (xem audio.md#pair) |
| `screen` | `{on}` — báo trạng thái chia sẻ màn hình phòng họp |
| `tap` | Tap chuyển trực tiếp (ngoài floor relay) |
| `bye` | Rời đảo — remote `removePeer` + sysMsg "đã rời" |

### Media conn

`dial(pid)` = connect data (nếu chưa) + `myPeer.call(pid, localStream)` khi đã
bật mic. Incoming call → `attachCall` trừ `metadata.kind==='screen'` (call chia
sẻ màn hình phòng họp — chỉ answer khi `inMeeting()`).

### Dial watchdog (`watchDials`, 2.5s)

Mỗi tick quét row cùng đảo có `peerId`: conn chưa open hoặc `!callLive(call)`
→ `dial` lại. `callLive` = `call.open && connectionState ∉ {failed, closed}` —
call nửa vời bị tỉa trước khi guard `entry.call` chặn redial mãi mãi.

## 3. Walk peer — mời & convo {#walk-msgs}

Data conn trên `walkPeer` (`furuoff-w-{id}`). Handler: `handleWalkData`.

| kind | Chiều | Payload | Nghĩa |
|---|---|---|---|
| `invite` | mời→được mời | `{name}` | "Vỗ vai — nói chuyện?" (`tapAsk`) |
| `invite-accept` | được mời→mời | `{members: [...convoSet, myWalkId()]}` | Chấp nhận + gửi danh sách member hiện có của mình |
| `invite-busy` | được mời→mời | `{reason: dnd\|pair\|convo\|decline}` | Từ chối có lý do |
| `convo-join` | member↔member | `{id, dial?}` | "id vừa join convo". `dial=1` → mình là người mới, chủ động gọi; không có → chỉ duyệt sẵn (`pendingWalk`) chờ call |
| `convo-leave` | member→all | `{id}` | id rời convo → `dropWalkPeer` |

## 4. Các flow đầy đủ

### Vào phòng

```
load → claimFloor (scan hub) → roster từ host → upsertSeat từng row
     → saved seat <12h? → tự joinDesk lại chỗ cũ
     → joinDesk: announceSeat {here who={table,slot,peerId,walkId}}
                 openTablePeer → dialKnown → call mesh cùng đảo
```

### Vỗ vai → teleport → convo

```
A tap B (tapShoulder):
  {tap} qua floor + desk conn B        → B: deliverTap → tapNotice + chuông + title
B bấm "Đi tới"/T (goToRow):
  tính điểm sau lưng A 1.3m theo yaw A → hitWall? findSpawn → FPV tại đó
  nếu A đang đi dạo (row.walkId): +400ms sendInvite
A nhận {invite}: dnd/pair/convo? → invite-busy; không → tapAsk 15s
A nhấn Nhận (tapYes):
  gửi {invite-accept, members:[...]} cho B
  báo member cũ của MÌNH: {convo-join, id: B}
  convoSet += B; pendingWalk += B
B nhận accept → joinConvo(A, members):
  convoSet += A + members; dialWalk(A) + dialWalk(mỗi member)
  báo member cũ của MÌNH về A: {convo-join, id:A} (họ chờ call)
  báo A về member cũ: {convo-join, id:member, dial:1} (A chủ động dial)
→ mọi cặp có call trực tiếp = mesh. Chi tiết: fpv.md#convo
```

### Nói riêng 1:1 (seated pair)

```
invitePair(row): sendTo {pair-invite} qua desk conn → pairOut (15s timeout)
Bên kia: dnd/pair/đang mời? → pair-busy; không → pairIn + pairAsk 15s
Nhận → {pair-accept} → cả 2 enterPair(pid):
  pairPeer = pid; muteNonPartnerSends() — tắt sender tới mọi call khác
Kết thúc → {pair-end} → exitPair → mở lại sender
```

### Chat

```
sendSay → onSay local (append + roomLog + bubble) + floorLink.send
host nhận → onSay(relay) → append local + broadcastFloor cho client khác
client nhận → onSay → append (dedup seenSay)
```

`roomLog` 30 tin → gửi `{log}` cho client mới join. `t: Date.now` → hiển thị
`HH:MM`; gap >`CHAT_GAP_MS` (10') → chèn `<hr>`.

### Rời/dọn dẹp

- `leaveDesk`/`exitFpv`: `leaveConvo` + `bye`/`gone` + đóng peers.
- `removeSeat(id)`: đóng `walkCalls`/`wconns` của row + `removePeer(peerId)` —
  presence mất → dọn mọi kênh liên quan.

## Ghost & các mode hỏng đã biết {#ghosts}

| Hiện tượng | Cơ chế | Xử lý |
|---|---|---|
| Ghost **row** (user chết còn trong roster) | tab chết → conn socket PeerJS đóng chậm | Host reap >25s (code mới) hoặc gửi `{gone}` tay qua floor |
| Ghost **hub** (host chết giữ `furu-hub-N`) | broker chưa thu socket → `unavailable-id` | `probeHub` timeout → bỏ qua, scan hub tiếp; converge dồn về khi được giải phóng |
| Ghost **peer id** (`unavailable-id` khi mở table/walk peer) | peer cũ destroy nhưng broker giữ ID | `openPeerAttempt` retry `-r{n}` suffix |
| Split floor | host chết, 2 hub song song | `probeAlive` 40s + claimFloor hội tụ |
| Row `peerId: null` | who cũ không có field — row vỏ | purge `{gone}` tay |
