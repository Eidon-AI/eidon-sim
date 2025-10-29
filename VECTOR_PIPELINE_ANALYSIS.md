# Complete Vector Pipeline Analysis

## Pipeline Flow (Raw Quaternion → On-Screen Vectors)

### STEP 1: Raw Quaternion Input
**Location:** One of three entry points

#### A. HID Reports (`src/core/reportParsers.ts`)
```typescript
parseTracker(state: Device, view: DataView)
```
- **Input:** Raw bytes from HID device
- **Process:** Converts u16 bytes → float [-1, 1] via `u16ToFloat()`
- **Output:** Quaternion `q = [x, y, z, w]` at bytes [0,2,4,6]
- **What to change:** Byte order or normalization if wrong

#### B. Bluetooth (`src/ui/App.ts`)
```typescript
updateDeviceWithQuaternion(deviceId, quaternion: number[], store)
```
- **Input:** Quaternion array `[x, y, z, w]` from Bluetooth
- **Process:** Direct copy to quat format
- **Output:** Quaternion stored in device state
- **What to change:** If quaternion order is wrong (e.g., [w,x,y,z] vs [x,y,z,w])

#### C. Playback (`src/core/PlaybackManager.ts`)
```typescript
applySnapshot(snapshot: SensorSnapshot)
```
- **Input:** Recorded quaternion `[x, y, z, w]`
- **Process:** Direct copy
- **Output:** Quaternion stored in device state
- **What to change:** If recorded format is different

---

### STEP 2: Quaternion → Vectors Conversion
**Location:** `src/core/mathUtils.ts::quaternionToVectors()`

```typescript
export function quaternionToVectors(q: quat): { up: vec3; fwd: vec3 }
```

**What it does:**
1. Takes quaternion `q = [x, y, z, w]`
2. Transforms sensor-space unit vectors through quaternion:
   - `fwd = vec3.transformQuat([0, 0, 1], q)` ← sensor Z becomes forward
   - `up = vec3.transformQuat([0, 1, 0], q)` ← sensor Y becomes up

**Current assumptions:**
- Sensor frame: Z points out of board, Y is side, X is?
- World frame: Three.js (+Y up, +Z forward)
- Quaternion rotates sensor → world

**What to change if planes are wrong:**

**Option 1: Change sensor axis mapping**
```typescript
// Current:
const fwd = vec3.transformQuat(vec3.create(), [0, 0, 1], q);  // Z → forward
const up = vec3.transformQuat(vec3.create(), [0, 1, 0], q);   // Y → up

// If forward should come from Y:
const fwd = vec3.transformQuat(vec3.create(), [0, 1, 0], q);  // Y → forward
const up = vec3.transformQuat(vec3.create(), [0, 0, 1], q);    // Z → up

// If forward should come from X:
const fwd = vec3.transformQuat(vec3.create(), [1, 0, 0], q);  // X → forward
const up = vec3.transformQuat(vec3.create(), [0, 0, 1], q);   // Z → up
```

**Option 2: Apply coordinate space conversion**
```typescript
// If quaternion is in different coordinate system, add transform:
const fwdRaw = vec3.transformQuat(vec3.create(), [0, 0, 1], q);
const upRaw = vec3.transformQuat(vec3.create(), [0, 1, 0], q);

// Apply coordinate conversion matrix (e.g., swap axes):
const fwd = [fwdRaw[0], fwdRaw[2], -fwdRaw[1]];  // [x, z, -y]
const up = [upRaw[0], upRaw[2], -upRaw[1]];      // [x, z, -y]
```

**Option 3: Negate one or both axes**
```typescript
// If direction is reversed:
const fwd = vec3.scale(vec3.create(), 
  vec3.transformQuat(vec3.create(), [0, 0, 1], q), 
  -1  // Negate if pointing wrong direction
);
```

---

### STEP 3: Vector Storage
**Location:** Device state (in DeviceStore)

```typescript
device.fwd = fwd;  // Forward vector stored
device.up = up;    // Up vector stored
```

Vectors are in **world space** at this point.

---

### STEP 4: Vector Visualization - Arm Rotation
**Location:** `src/ui/scene/vectorArm.ts::refresh()`

**What happens:**
1. Gets vectors from device: `hub.fwd`, `forearm.fwd`, `hand.fwd`, `hub.up`, etc.
2. Applies arm-specific 90° rotation via `rotFwd()` and `rotUp()`
3. Uses rotated vectors to position tubes/arrows on screen

#### Rotation Matrices (`vectorArm.ts` lines 133-142):

```typescript
// Right arm: 90° rotation about +Y axis
const rightYaw90Array = new Float32Array([
  0, 0, 1,    // Column 1: X' = Z
  0, 1, 0,    // Column 2: Y' = Y (no change)
  -1, 0, 0    // Column 3: Z' = -X
]);

// Left arm: 90° rotation about +Y axis (opposite)
const leftYaw90Array = new Float32Array([
  0, 0, -1,   // Column 1: X' = -Z
  0, 1, 0,    // Column 2: Y' = Y (no change)
  1, 0, 0     // Column 3: Z' = X
]);
```

**Applied transformation:**
```typescript
const rotFwd = (v: vec3) => {
  return vec3.transformMat3(vec3.create(), v, 
    side === 'right' ? rightYaw90Array : leftYaw90Array
  );
};
```

**Effect on vector `[x, y, z]`:**
- Right arm: `[z, y, -x]`
- Left arm: `[-z, y, x]`

**What to change if planes are wrong:**

**Option 1: Change rotation angle/axis**
```typescript
// Instead of 90° about Y, try 90° about X:
const rightYaw90Array = new Float32Array([
  1, 0, 0,    // X unchanged
  0, 0, 1,    // Y → Z
  0, -1, 0    // Z → -Y
]);
```

**Option 2: Remove rotation entirely (if not needed)**
```typescript
const rotFwd = (v: vec3) => v;  // Pass through unchanged
const rotUp = (v: vec3) => v;    // Pass through unchanged
```

**Option 3: Swap left/right rotations**
```typescript
// Use right rotation for left arm and vice versa
const rotFwd = (v: vec3) => vec3.transformMat3(vec3.create(), v,
  this.side === 'left' ? rightYaw90Array : leftYaw90Array  // Swapped
);
```

**Option 4: Change rotation amount**
```typescript
// Instead of 90°, try 180°:
const rightYaw180Array = new Float32Array([
  -1, 0, 0,   // X' = -X
  0, 1, 0,    // Y' = Y
  0, 0, -1    // Z' = -Z
]);
```

---

### STEP 5: Three.js Rendering
**Location:** `vectorArm.ts` lines 204-236

Vectors are used directly to:
- Position tubes: `tube.position.set(midpoint.x, midpoint.y, midpoint.z)`
- Orient arrows: `tip.lookAt(tip.position.x + fwdX, ...)`

Three.js coordinate system: **+Y up, +Z forward**

---

## SUMMARY: Where to Fix Plane Issues

**Most likely culprits (in order of probability):**

1. **`quaternionToVectors()` - Wrong sensor axis mapping**
   - Try swapping: `[0,0,1]` vs `[0,1,0]` vs `[1,0,0]`
   - Try negating: multiply by -1

2. **`rotFwd()` / `rotUp()` - Wrong arm rotation matrix**
   - Try removing rotation: `v => v`
   - Try different rotation axis/angle
   - Try swapping left/right matrices

3. **Quaternion coordinate system mismatch**
   - Add coordinate space conversion after `transformQuat`
   - Apply `[x, z, -y]` or similar swap

4. **Raw quaternion order/form**
   - Check if quaternion is `[w,x,y,z]` instead of `[x,y,z,w]`
   - Check if quaternion needs normalization

---

## Quick Test Changes

**Test 1: Swap sensor axes in quaternionToVectors**
```typescript
const fwd = vec3.transformQuat(vec3.create(), [0, 1, 0], q);  // Y → forward
const up = vec3.transformQuat(vec3.create(), [0, 0, 1], q);   // Z → up
```

**Test 2: Remove arm rotation**
```typescript
const rotFwd = (v: vec3) => v;
const rotUp = (v: vec3) => v;
```

**Test 3: Negate forward vector**
```typescript
const fwd = vec3.scale(vec3.create(), 
  vec3.transformQuat(vec3.create(), [0, 0, 1], q), 
  -1
);
```

