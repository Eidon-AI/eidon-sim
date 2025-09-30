# Eidon Sym · Kinematics Reference

> **Purpose**  This document formalises the maths that turn the raw HID reports from three IMUs per arm (upper‑arm, lower‑arm, glove) into the seven anatomical joint angles that drive the humanoid animation and robot actuators.

---

## 1  Coordinate Frames

| Symbol    | Description                                   | Notes                                                        |
| --------- | --------------------------------------------- | ------------------------------------------------------------ |
| **S**     | *Sensor frame* – axes printed on the IMU PCB  | Z‑axis points *out* of the board (gravity ≈ −Z when face‑up) |
| **B**     | *Bone frame* – anatomical axes you care about | +x → distal, +y → left, +z → up                              |
| **T**     | *Torso / World* – global frame for the scene  | Three.js default: +Y up, +Z forward                          |
| **Q\_XY** | Quaternion rotating **Y → X**                 | Stored `[x, y, z, w]` (gl‑matrix order)                      |

---

## 2  Static Calibration ("N‑pose")

1. Ask the user to stand upright, arms down, palms facing thighs.
2. Record a short average of each sensor quaternion `Q_T S_cal`.
3. Compute constant offsets so *sensor → bone* alignment is frozen:

```ts
const Q_BS = quat.invert(quat.create(), Q_TS_cal);
```

Store `Q_BS` in `localStorage` – no need to re‑calibrate on page reload.

---

## 3  Runtime Pipeline (per animation frame)

### 3.1  Bone orientations

```ts
// bone ← world  =  (bone←sensor) × (sensor←world)
Q_BW = quat.mul(quat.create(), Q_BS, Q_TW_sensor);
```

Repeat for upper‑arm **U**, fore‑arm **F**, hand **H**.

### 3.2  Relative joint quaternions

```ts
Q_SHOULDER = Q_BUW;                         // parent = torso
Q_ELBOW    = Q_BUW⁻¹ × Q_BFW;               // upper → fore
Q_WRIST    = Q_BFW⁻¹ × Q_BHW;               // fore  → hand
```

Any shared yaw drift cancels because the parent’s inverse is premultiplied.

---

## 4  Angle Extraction (7 DOF)

| Joint        | DOF                    | Euler / Twist order            | Code snippet                               |
| ------------ | ---------------------- | ------------------------------ | ------------------------------------------ |
| **Shoulder** | yaw ψ, pitch θ, roll φ | **Z‑Y‑X** (ISB)                | `[ψ,θ,φ] = eulerZYX(Q_SHOULDER)`           |
| **Elbow**    | flexion ε              | **Y‑Z‑X**, first axis = Y      | `ε  = eulerYZX(Q_ELBOW)[0]`                |
| **Fore‑arm** | pron/sup ρ             | Twist about **x<sub>F</sub>**  | `ρ  = quat.getAxisAngle(Q_ELBOW, [1,0,0])` |
| **Wrist**    | pitch α, yaw β         | **Z‑Y‑X**, keep first two axes | `[β,α] = eulerZYX(Q_WRIST)`                |

All values are in **radians**; convert to degrees with `rad * 180/Math.PI` before feeding servos.

---

## 5  Chained Vector Visualisation

1. Assume canonical shoulder origins at `(-0.25, 0.05, ±0.15)` m.
2. Segment lengths (defaults, override via Preferences):

   * humerus `L_h = 0.30 m`
   * radius   `L_r = 0.26 m`
   * hand     `L_p = 0.10 m`
3. For each tracker, derive **forward** vector:

```ts
const fwd = vec3.transformQuat(vec3.create(), [0, 0, 1], Q_BW); // sensor Z‑up → world Z
```

4. Chain points: `P0 = shoulder`, `P1 = P0 + fwd_U * L_h`, etc.  Render with `THREE.Line2`.

---

## 6  Numeric Details & Tips

* **Quaternion decode**  Raw u16 range `[0‥65535]` → `(value / 32767) – 1` then normalise.
* **Filtering**  Apply a 1‑pole EMA (`α ≈ 0.1`) to quats before angle extraction.
* **Singularities**  Clamp elbow flex to `< 0.1 rad` to avoid gimbal flips at full extension.
* **Units**  Keep internal maths in radians & metres; convert only at UI/servo boundaries.

---

## 7  References

* International Society of Biomechanics – Recommendations for joint coordinate systems, Part II (Shoulder, Elbow, Wrist).
* gl‑matrix 4.0 documentation.
* SlimeVR firmware – open‑source inertial mocap maths.

---

*Last updated : 2025‑05‑25*
