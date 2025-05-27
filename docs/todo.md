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

## Milestone 3  (next up)
- [x] Smooth angle filtering + joint limits
- [x] RGB feature-report color picker
- [x] GLTF humanoid arm skinned to 7 angles
- [ ] Sidebar finger bars (glove)
- [ ] Preferences panel: segment lengths, theme switch
- [ ] Unit tests for mathUtils & parsers

## Milestone 4  (Glove fingers UI)

* [ ] Render 16 finger bars (flex %) per glove card
* [ ] Optional: simple finger bones on GLTF hand mesh

## Milestone 5  (Calibration & RGB feature)

* [x] `HidManager.sendCalibrate(id)` helper
* [ ] Global **Calibrate All** already wired – ensure per‑device ↻ button in card
* [ ] Implement color picker → writes 3‑byte feature report 0x02
* [ ] Read color on initial connect, apply as swatch background

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
