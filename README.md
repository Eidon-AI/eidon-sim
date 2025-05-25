# Eidon Sim 🦾

> **Live-visual tele-operation UI for Eidon IMU Trackers (PID 0x0002) and Glove Controllers (PID 0x0001).**  
> Streams orientation + finger data via WebHID, renders a humanoid arm and a vector-chain representation in Three.js, and outputs seven actuator angles per arm — all in a static, client-side web app.

<div align="center">

|  |  |
|--|--|
| **Tech stack** | Vite + TypeScript + Tailwind + Three.js + gl-matrix |
| **Browser req.** | Chromium ≥ 89 (WebHID) |
| **Build size** | ≈ 45 kB gzipped |
| **License** | MIT — © 2025 Eidon AI |

</div>

---

## ✨ Features

| ✓ | Description |
|---|-------------|
| **HID discovery** | Connect, disconnect, and calibrate all devices with one click |
| **Device cards** | Live quats, finger angles (×16), color picker, per-device calibrate |
| **Twin visualisations** | Skeletal GLTF arm **and** raw vector-chain overlay |
| **7-axis solver** | Shoulder yaw/pitch/roll • Elbow flex • Fore-arm roll • Wrist pitch/yaw |
| **Fully static** | `npm run build` → drop `dist/` on any HTTPS host |
| **Dark / light** | Dark default; toggle in Preferences |

---

## 🚀 Quick start

```bash
git clone https://github.com/<you>/eidon-arm-dashboard.git
cd eidon-arm-dashboard
npm install
npm run dev       # opens http://localhost:5173
```

1. Click **Connect HID** → select your Eidon devices.  
2. Watch quaternions stream in the log.  
3. Hit **Calibrate All** to zero orientation.

> On Chrome Stable, enable `chrome://flags/#enable-experimental-web-platform-features` once — WebHID may still be behind the flag.

---

## 🗂 Project structure

```text
.
├─ src/
│  ├─ main.ts               # app bootstrap
│  ├─ styles.css            # Tailwind dark-first theme
│  ├─ core/                 # logic w/o DOM
│  │   ├─ constants.ts      # VID/PIDs, report IDs
│  │   ├─ HidManager.ts     # WebHID wrapper (connect, send, raw reports)
│  │   ├─ DeviceStore.ts    # Map<id,DeviceState> + math helpers
│  │   └─ types.ts          # shared interfaces
│  └─ ui/
│      ├─ App.ts            # sidebar + canvas layout
│      └─ (scene, sidebar)  # TODO in later milestones
├─ public/                  # static assets (logo, GLTF models)
├─ vite.config.ts
└─ README.md
```

*Design rule :* everything under `/core` must stay DOM-free so it can later move to a Web Worker or Node service.

---

## 🛠 Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev-server with HMR at http://localhost:5173 |
| `npm run build` | Generate production bundle in `dist/` |
| `npm run preview` | Serve the build locally on 8080 |
| `npm run lint` | ESLint (strict) for `src/**/*.ts` |

---

## 📦 Deployment

1. `npm run build`  
2. Upload `dist/` to any static host (GitHub Pages, Netlify, S3, ESP32 SPIFFS…).  
3. Serve via **HTTPS** (or `localhost`) — WebHID is blocked on insecure origins.  
4. If you add assets like WASM or GLB, set proper MIME types.

---

## 🧮 Math overview

| Step | Formula / note |
|------|----------------|
| **Decode quaternion** | u16 → `q ∈ ℝ⁴`, normalised |
| **Up / forward vecs** | `up = q · (0,0,1)` • swap Y↔Z for Three.js |
| **Chain positions** | Shoulder → humerus → radius → hand (prefs) |
| **7 angles** | Z-Y-X (shoulder), Y hinge (elbow), twist, Z-Y (wrist) |
| **Vector-chain render** | Each segment = `THREE.Line2` from `chainStart → chainEnd` |

A full derivation will live in `/docs/kinematics.md` (TODO).

---

## 📒 Milestones roadmap

| # | Goal | Status |
|---|------|--------|
| **M1** | Vite + TS scaffold (this commit) | ✅ |
| **M2** | Complete `DeviceStore.parseInto()` math, render vector lines | ✅ |
| **M3** | Load GLTF arm, apply seven angles, show in canvas | ☐ |
| **M4** | Glove finger decoding & UI bars | ☐ |
| **M5** | Per-device calibrate + RGB feature | ☐ |
| **M6** | Preferences panel (segment lengths, theme) | ☐ |
| **M7** | Docs + unit tests + static deployment recipe | ☐ |

Granular tasks live in `/docs/todo.md`.

---

## 🛎 Troubleshooting

| Symptom | Fix |
|---------|-----|
| **“No compatible devices”** | Check VID 0xE1D0, PIDs 0x0001/0x0002; cable; firmware. |
| **WebHID open fails** | Origin must be HTTPS; reload after granting permission. |
| **Dev-server hot reload resets devices** | Chrome revokes HID on refresh; hit **Calibrate** again. |
| **Quaternion zeros / NaN** | Confirm firmware endian; some boards need `littleEndian=true`. |

---

## 🤝 Contributing

1. Fork & clone  
2. `npm install`  
3. `git checkout -b feat/my-amazing-thing`  
4. Keep PRs milestone-scoped (< 300 LOC)  
5. `npm run lint && npm run build` before pushing

---

## 📜 License

```text
MIT License — see LICENSE file
© 2025 Eidon AI / Robert Dale Smith
```

Add yourself to CONTRIBUTORS.md if you land a PR!
