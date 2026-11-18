# Audio — mô hình nghe/nói & tự lành

Ba nguồn âm thanh riêng biệt, mỗi nguồn một pipeline gain:

1. **Table calls** (`peers[pid].call`) — audio bàn khi ngồi đảo talk.
2. **Walk calls** (`walkCalls[wid]`) — audio convo khi đi dạo.
3. **Nhạc cà phê** (`ytPlayer`) — YouTube ẩn, gain theo zone.

Mỗi remote stream treo một `<audio>` trong `remoteAudio` — `applyGains()` /
`applyWalkGains()` / `cafeGain()` set `el.volume` theo trạng thái hiện tại.

## Hằng số

| Tên | Giá trị | Nghĩa |
|---|---|---|
| `HEAR_FULL` | 1.8 m | Trong bán kính này nghe full |
| `HEAR_RANGE` | 2.6 m | Ngoài bán kính này nghe 0 — suy giảm tuyến tính ở giữa |
| `PAIR_DUCK` | 0.15 | Gain nền cho người ngoài khi đang pair/convo |
| `TAP_RANGE` | 3.4 m | Tầm vỗ vai mời convo trong FPV |
| convo auto-leave | >`HEAR_RANGE*1.5` (3.9m) với MỌI member, 5s | Đi xa nhóm → tự rời |

## `hearingGain(pid)` — quyết định volume table call

Thứ tự ưu tiên (return sớm thắng):

```
dnd                     → 0          (DND = điếc hoàn toàn)
pairPeer === pid        → 1          (đối tác nói riêng: full)
pairPeer (pid khác)     → inMeeting() ? PAIR_DUCK : 0
convoSet.size:
  row.walkId ∈ convoSet → 0          (member convo nghe qua walkCalls, không qua bàn)
  row khác              → PAIR_DUCK  (giả tiếng đảo khi đang convo)
inMeeting()             → 1          (phòng họp: ai cũng full)
entry.bc                → 1          (đang broadcast: bỏ qua khoảng cách)
cùng đảo                → distGain(khoảng cách GHẾ)   ← proximity theo vị trí ngồi
khác đảo / không ngồi   → 1          (mặc định nghe — đường peerId vẫn cùng đảo mới dial)
```

`distGain(d)`: `d ≤ HEAR_FULL → 1`, `d ≥ HEAR_RANGE → 0`, tuyến tính ở giữa.

## `walkGain(wid)` — volume convo

`convoSet.has(wid) ? distGain(khoảng cách walker thực) : 0` — theo `posOf` của
walk row (cập nhật liên tục qua `move`), không phải ghế.

## `cafeGain()` — nhạc nền

Trong `CAFE_ZONE` (hình chữ nhật quanh quầy cà phê): `0.8` — ngoài zone: `0`.
DND → `0`; pair ngoài meeting → `0`; pair trong meeting → `PAIR_DUCK`;
đang convo → `× 0.15`. `?yt=<videoId>` đổi nhạc (mặc định `9kzE8isXlQY`),
iframe YouTube ẩn, autoplay arm khi có gesture đầu tiên (`pointerdown`/`keydown`).

## Các chế độ

### Broadcast (`btnBc` / `broadcastOn`)

Bật → `sendState()` báo `bc` qua desk conn → remote `hearingGain` thấy
`entry.bc` → `1` cho dù xa. Người nói cả bàn/đảo. Tắt khi `leaveDesk`, bị khóa
khi `pairPeer`/`dnd`.

### Nói riêng 1:1 — privacy phía GỬI {#pair}

Khác proximity (privacy phía nghe): pair tắt **sender** của mình tới mọi call
không-phải-partner:

- `enterPair` → `muteNonPartnerSends()`: với mỗi `call` ≠ pairPeer →
  `setCallSendersActive(call, false)` — set `encodings[].active=false` trên
  RTCRtpSender → remote nghe im lặng (stream vẫn sống, không cần re-dial).
- `exitPair` → mở lại `active=true` cho `pairMutedCalls`.
- Nghe vẫn theo `hearingGain`: partner=1; người khác = `PAIR_DUCK` nếu đang
  trong phòng họp, `0` nếu không.
- Trong FPV: `tapYes`/`joinConvo` tự `exitPair()` trước — pair không đi cùng convo.

### DND (`setDnd(true)`)

- `hearingGain`/`walkGain`/`cafeGain` → đều 0 (điếc).
- `localStream` audio+video `enabled=false` (câm + tắt hình với mọi người).
- `pairPeer` → `exitPair`; `leaveConvo`; từ chối `pair-in`/`pair-out`/`tapIn` pending.
- Remote thấy `dnd` qua `state`; tap tới → trả `{tap-dnd}` → người gửi thấy
  "đang bật Không làm phiền".
- Bật DND **không** đóng calls — chỉ tắt tracks + gain → tắt DND nghe lại ngay.

### Phòng họp (`island.share`)

- `inMeeting()` → `hearingGain` = 1 cho mọi row (không theo khoảng cách ghế).
- Screen share: `myPeer.call(pid, screenStream, {metadata:{kind:'screen',name}})`
  → remote answer nếu `inMeeting()` → texture lên `meetingTvMesh`; `{screen,on:false}`
  hoặc call close → `clearMeetingScreen` → về texture burndown.
- Nút `btnBc` ẩn trong phòng họp (share = broadcast sẵn); `btnShare` chỉ hiện ở đảo `share`.

## Self-heal — các watchdog tự lành {#self-heal}

Triết lý: tab ngủ/đứt mạng để lại kết nối "nửa vời" — phải tự phát hiện và
re-dial thay vì chờ user reload. Bảng watchdog:

| Watchdog | Chu kỳ | Phát hiện | Hành động |
|---|---|---|---|
| `watchDials` | 2.5s | row cùng đảo có `peerId` mà conn !open hoặc `!callLive(call)` | `dial` lại |
| `call.iceStateChanged` | event | `failed`/`closed` | `killCall` + redial sau 1s |
| 〃 | event | `disconnected` >4s không hồi | killCall + redial |
| `call.error` | event | `peer-unavailable`/`network`/… | killCall + redial sau 1.2s |
| mic watchdog | 4s | `micOn && localStream` nhưng 0 audio track `live` | `reacquireMic` |
| `myPeer.disconnected` | event | socket broker đứt | `myPeer.reconnect()` |
| `openPeerAttempt` | mỗi lần mở | `unavailable-id` (id ma) | retry ID `-r{n}`, ≤3 lần |
| `iceServers()` | lười | TURN creds >12h | refetch trước khi mở peer mới |
| walk `conn close`/`call close` | event | member mất conn | `dropWalkPeer` (gọn convoSet) |

### `reacquireMic` — bug "nghe 1 chiều"

Tab bị OS đóng băng/discard → audio track `ended` ngầm nhưng `localStream` còn
→ sender vẫn gửi track chết → **họ nghe mình im lặng, mình nghe họ bình thường**.
Watchdog: hết track sống → getUserMedia lại (fallback `{audio:true}`) → giữ
video track cũ nếu còn sống → `pushStream()` (đóng+dial lại table calls) +
đóng `walkCalls` + redial `convoSet` sau 300ms → toast "Mic vừa tự nối lại".

> ⚠️ Nếu tách `pushStream`/walk-call rebuild ra riêng, nhớ `reacquireMic` gọi
> cả hai — quên nhánh walk → convo chết im sau khi tab tỉnh lại.

## Vòng đời localStream

- `ensureVoiceThen(fn)`: getUserMedia audio (echoCancellation+noiseSuppression)
  lần đầu → `localStream`, `micOn=true`. Được gọi từ btnTalk / `tapYes` / `joinConvo`.
- `ensureVideo()`: thêm video track, `replaceTrack` trên sender của mọi call
  đang chạy (không re-dial).
- `pushStream()`: đóng mọi table call hiện tại → `dial` lại — dùng khi stream
  mới thay cũ (peer call của PeerJS không renegotiate track mới sạch sẽ).
- `sendState()` báo `mic/cam/bc/dnd` qua desk conns → remote cập nhật
  `entry.*` → `applyGains`.

## Giới hạn đã biết

- Autoplay: remote `<audio>` cần gesture — `unlockAudio`/armYt ở pointerdown
  đầu tiên; trước đó có nút "Bật nghe".
- Chrome discard tab: presence/auto-seat quay lại được nhưng **mic phải bấm
  lại** (getUserMedia cần gesture) — không code nào qua được.
- Walk convo không có ICE watchdog riêng — `dropWalkPeer` chờ `close`; call
  nửa vời tạm thời do reacquireMic/leaveConvo dọn. Nếu cần siết hơn, thêm
  `iceStateChanged` như `attachCall`.
