# Glove Support Design — 2026-03-20

## Scope
BLE glove connection, hand visualization (vector + skeletal), and playback of flutter app recordings.
No recording capability. No ESP-NOW / tracker hub changes.

---

## 1. GloveManager (`src/core/GloveManager.ts`)

Web Bluetooth equivalent of flutter's `EidonGloveService`.

**BLE UUIDs** (from `ble_constants.dart`):
- Service:     `E1D00001-8B5A-3E5B-9E23-4F9B5C91BBDE`
- Quaternion:  `E1D00002-8B5A-3E5B-9E23-4F9B5C91BBDE`
- Finger data: `E1D0000A-8B5A-3E5B-9E23-4F9B5C91BBDE`
- Device info: `E1D00005-8B5A-3E5B-9E23-4F9B5C91BBDE`

**Connection flow:**
1. `navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Eidon-Glove-' }], optionalServices: [SERVICE_UUID] })`
2. `device.gatt.connect()`
3. `getPrimaryService` → `getCharacteristic(DEVICE_INFO_CHAR)` → `readValue()`
4. Byte 6 of device info = role (`0x08` = left_glove, `0x09` = right_glove)
5. `startNotifications(QUATERNION_CHAR)` → parse 16 bytes as 4 × float32 little-endian [w,x,y,z]
6. `startNotifications(FINGER_DATA_CHAR)` → parse 32 bytes as 16 × uint16 little-endian
7. On each notification, normalize + EMA smooth fingers, write to DeviceStore

**Finger processing:**
- Normalize: `value / 65535` → 0–1
- EMA: `smooth[i] = FINGER_ALPHA * norm[i] + (1 - FINGER_ALPHA) * smooth[i]`
- Constants added to `src/core/constants.ts`: `FINGER_ALPHA = 0.3`, `HAND_LEN = 0.10`

Supports two simultaneous instances (left + right), each independent.

---

## 2. DeviceStore Extensions

New fields added to existing DeviceStore (no restructuring):

```typescript
interface GloveState {
  connected: boolean;
  role: 'left_glove' | 'right_glove';
  quat: [number, number, number, number];  // [w, x, y, z]
  fingers: number[];        // 16 raw uint16 values (0-65535)
  fingersNorm: number[];    // 0-1 normalized
  fingersSmooth: number[];  // EMA-smoothed 0-1
}

gloveLeft:  GloveState | null
gloveRight: GloveState | null
```

GloveManager writes here on each BLE notification. Renderers and PlaybackManager both read from here — single source of truth.

---

## 3. Hand Visualization

### A) Vector Chain Hand

Extend `src/ui/scene/vectorArm.ts` (or new `vectorHand.ts`) using the legacy `parseGlove` approach.

- Hand quaternion from `gloveState.quat` orients the palm in world space
- 5 fingers × 3 segments each, driven by `fingersSmooth`
- Segment lengths from `HAND_LEN` constant
- Rendered as Three.js `Line2` segments — consistent with existing vector arm style
- Logic rescued from legacy `src/core/reportParsers.ts` (`parseGlove`, `HAND_LEN`)

### B) Skeletal GLTF Hand

Extend `src/ui/scene/skeletalRig.ts` to drive finger bones when a glove is connected.

- The existing GLTF humanoid model includes finger bones
- On each frame, map `fingersSmooth[i]` → finger bone rotation for each joint
- Hand orientation from `gloveState.quat` applied to wrist/hand root bone
- Both hands supported independently

Both renderers read from `DeviceStore.gloveLeft/Right` — no separate path for live vs playback.

---

## 4. DeviceModal Connection UI

Add a **Gloves section** below existing tracker connection cards in `DeviceModal`:

```
┌─────────────────────────────────┐
│  Trackers          [existing]   │
│  ─────────────────────────────  │
│  Gloves                         │
│  [Connect Left Glove]  ● / ○    │
│  [Connect Right Glove] ● / ○    │
└─────────────────────────────────┘
```

- Each button triggers `GloveManager.connect()` (user gesture → Web Bluetooth picker)
- Role auto-detected from device info byte 6 — no manual selection
- After connection: button shows device name + disconnect option
- Connected gloves appear in sidebar `DeviceCard` alongside trackers

---

## 5. Playback (Flutter App Recordings)

Extend `src/core/PlaybackManager.ts` to handle flutter app JSON format.

**Flutter recording format:**
```json
{
  "devices": [
    { "id": "MAC_addr", "position": "left_glove",  "connectionId": "Eidon-Glove-..." },
    { "id": "MAC_addr", "position": "right_glove", "connectionId": "Eidon-Glove-..." }
  ],
  "snapshots": [
    {
      "time": 0,
      "deviceData":  { "MAC_left": [x, y, z, w] },
      "fingerData":  { "MAC_left": [16 uint16 values] }
    }
  ]
}
```

**Changes to PlaybackManager:**
- On recording load: scan `devices[]` for `position === 'left_glove' | 'right_glove'`, build MAC → role map
- On each snapshot tick: if `fingerData` present → normalize uint16→0-1 → EMA smooth → write to `DeviceStore.gloveLeft/Right`
- `deviceData` quaternions for glove MACs written to `gloveState.quat`
- Renderers are unchanged — they read from DeviceStore regardless of data source

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/GloveManager.ts` | New — Web Bluetooth glove connection |
| `src/core/constants.ts` | Add `FINGER_ALPHA`, `HAND_LEN` |
| `src/core/DeviceStore.ts` | Add `gloveLeft`, `gloveRight` GloveState fields |
| `src/core/PlaybackManager.ts` | Extend to parse flutter recording format + fingerData |
| `src/ui/scene/vectorArm.ts` | Extend (or new `vectorHand.ts`) with finger chain rendering |
| `src/ui/scene/skeletalRig.ts` | Drive finger bones from glove state |
| `src/ui/components/device-modal/DeviceModal.ts` | Add Gloves section with connect buttons |
| `src/core/constants.ts` | BLE UUIDs for glove service/characteristics |
