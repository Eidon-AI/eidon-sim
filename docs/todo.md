# Eidon Sim · TODO

A living checklist of implementation tasks, grouped by milestone. Tick items off and re‑commit this doc as work progresses.

---

## Legend

* [ ] open
* [x] done
* \[\~] in‑progress / PR open

---

# TODO — Eidon Sim

## Milestone 1  (bootstrap)
- [x] Vite + TS scaffold, dark Tailwind theme
- [x] HidManager / DeviceStore skeleton
- [x] Basic sidebar + Connect / Disconnect / Calibrate buttons
* [x] Global **Calibrate All** already wired – ensure per‑device ↻ button in card
* [x] Implement color picker → writes 3‑byte feature report 0x01
* [x] Read color on initial connect, apply as swatch background

## Milestone 2  (vector view + math pipeline)
- [x] Hex-style device IDs with name slug + serial
- [x] Tracker & **fixed glove** report parsers
- [x] Up / forward vectors + chain positions
- [x] VectorArm renderer (both arms)
- [x] mathUtils (Euler helpers) — bug-fixed m21/m01
- [x] ArmSolver: real 7-angle computation
- [x] AnglePanel live table (no listener loss)
- [x] Event-safe sidebar (insertAdjacentHTML / appendChild)
- [x] Button-listener retention after UI updates
* [x] `HidManager.sendCalibrate(id)` helper

## Milestone 3  (skeletal arms, UX)
- [x] Single Y-Bot rig drives both arms
- [x] Corrected shoulder/elbow/wrist axes
- [x] Calibration overlay + right-arm yaw flip
- [x] Vector-arm chaining bug fixed

## Milestone 4  (fingers & polish)  **← completed**
- [x] Parse 16 glove axes → norm / deg
- [x] Accurate MCP yaw + PIP flex mapping
- [x] DIP estimated at ½ PIP
- [x] EMA finger smoothing (`FINGER_ALPHA`)
- [x] Hand mesh colour-tinted to tracker RGB
- [x] Sidebar finger bars (smoothed %)

## Milestone 5  (next up)
- [x] Preferences: stereo camera enable + host
- [x] StereoCam component with rotated dual streams
- [ ] Preferences panel  
  - segment lengths  
  - theme toggle  
  - smoothing factors
- [ ] GLTF wrist-roll bone (optional helper)
- [ ] Unit tests (mathUtils, parsers, solver)
- [ ] Troubleshooting doc + screenshots
- [ ] Deploy workflow (GitHub Pages action)

## Milestone 6  (Preferences + Themes)

* [ ] `/ui/Preferences` modal
  * [ ] segment length inputs (3)
  * [ ] dark/light toggle (sets `data-theme` on `<html>`)
  * [ ] save/load via `PreferencesStore`
* [ ] Apply custom lengths to vector‑chain computation

## Milestone 7  (QA + Docs)

* [ ] Unit tests (Vitest) for quaternion decode, angle extraction
* [ ] Expand `docs/kinematics.md` with diagrams
* [ ] Create `docs/hid-spec.md` summarising descriptors & reports
* [ ] Write deployment guide for GitHub Pages & ESP32 SPIFFS

---

*Last updated : 2025‑05‑25*
