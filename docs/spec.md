# Eidon Sim · Project Specification

This document gathers **all technical specs** in one place: USB/HID protocol, data model, software architecture, UI layout, and deployment assumptions. It is the canonical reference for contributors and for automated agents (Cursor, CI, etc.).

---

## 1  USB / HID Protocol

### 1.1  Vendor & Product IDs

| Device        | VID    | PID    | Kind                   |
| ------------- | ------ | ------ | ---------------------- |
| Eidon Glove   | 0xE1D0 | 0x0001 | IMU + 16‑finger angles |
| Eidon Tracker | 0xE1D0 | 0x0002 | IMU only               |

### 1.2  Report Summary

| Report                | ID   | Device(s) | Direction | Payload                                                                               |
| --------------------- | ---- | --------- | --------- | ------------------------------------------------------------------------------------- |
| **Quaternion + Data** | 0x01 | both      | *IN*      | 4×u16 quaternion + flags (tracker: 2 bits; glove: 16 buttons + 16 × u8 finger angles) |
| **Calibrate**         | 0x01 | both      | *OUT*     | `01 01` → start static calibration                                                    |
| **RGB Color**         | 0x02 | both      | *Feature* | 3 × u8 (`R, G, B`) — persistent                                                       |

#### 1.2.1  Quaternion encoding

```
Offset | Bytes | Field         | Notes
0      | 2     | q_i (LSB)     | little‑endian unsigned 16‑bit
2      | 2     | q_j           |
4      | 2     | q_k           |
6      | 2     | q_real        |
```

Decode: `float = (u16 / 32767) – 1.0`, then renormalise.

#### 1.2.2  Tracker flags (byte 8)

| Bit | Meaning                              |
| --- | ------------------------------------ |
| 0   | Side (0 = left, 1 = right)           |
| 1   | Level (0 = upper‑arm, 1 = lower‑arm) |
| 2‑7 | reserved (0)                         |

#### 1.2.3  Glove finger block

*16 Bytes · index layout 0‑15* — application maps to individual phalanges; 0 = flat, 255 = fully flexed.

---

## 2  Data Model (in code)

```
interface DeviceState {
  id: string;                 // "VID:PID:serial"
  kind: 'tracker' | 'glove';
  arm?: { side:'left'|'right'; level:'upper'|'lower' };
  color: string;              // hex "#RRGGBB"
  quat: quat;                 // gl‑matrix order [x,y,z,w]
  finger?: number[16];        // glove only
  up: vec3;   fwd: vec3;      // derived directions
  chainStart: vec3; chainEnd: vec3;
  lastSeen: number;           // ms since page load
}
```

Segment lengths (preferences):

* humerus = 0.30 m, radius = 0.26 m, hand = 0.10 m (defaults)

---

## 3  Software Architecture

```
/src
  core/
    HidManager   ← WebHID wrapper (connect, send, events)
    DeviceStore  ← holds Map<DeviceState>, math helpers
    ArmSolver    ← outputs 7 angles / side
    preferences  ← load/save UI prefs
  ui/
    scene/
      sceneManager  ← Three.js init, rAF loop
      vectorArm     ← Line2 segments
      skeletalRig   ← GLTF bones
    components/     ← Sidebar, DeviceCard, AnglePanel, PrefsModal
```

Communication flow:

1. **HidManager** emits `report` (raw DataView) → **DeviceStore.parseInto** → updates `DeviceState`.
2. `update` event triggers **ArmSolver.update(store)\`** → 7‑angle object.
3. Scene manager & UI components subscribe for reactive re‑render.

The logic in `/core` has **no DOM**; suitable for Web Worker or Node daemon reuse.

---

## 4  UI Layout

* CSS Grid: sidebar = 320 px fixed; canvas fills remaining viewport.
* Sidebar sections:

  1. Global controls (connect, disconnect, calibrate all)
  2. Device list (cards)
  3. Actuator angles panel
* Dark mode default (`html.dark`), light optional via `data-theme`.

---

## 5  Build & Deployment

* `npm run build` → Vite static bundle in `dist/`.
* Must be served over **HTTPS** or `http://localhost` for WebHID.
* CDN or self‑host: no server‑side code required.

---

## 6  Math Reference

See `/docs/kinematics.md` for quaternion → 7‑angle derivation and vector‑chain visualisation.

---

*Last updated : 2025‑05‑25*
