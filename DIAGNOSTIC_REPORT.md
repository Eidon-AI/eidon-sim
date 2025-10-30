# Diagnostic Report: ArmSolver and SkeletalRig Analysis

## Executive Summary
Analysis of quaternion parsing, angle extraction, and coordinate transformations reveals several critical issues that could cause mismatches between real device movements and displayed model movements.

---

## 1. QUATERNION FORMAT ANALYSIS ✓ (Appears Correct)

### Current Implementation
- **Raw Bluetooth Data**: Received as `[w, x, y, z]` (Float32Array)
- **Conversion Point**: `src/ui/App.ts:239` and `src/core/PlaybackManager.ts:187`
- **Conversion Code**: `[quaternion[1], quaternion[2], quaternion[3], quaternion[0]]` → `[x, y, z, w]`
- **Storage Format**: gl-matrix format `[x, y, z, w]` ✓

### Three.js Conversion
- **Location**: `src/ui/scene/skeletalRig.ts:327, 364, 391, 410`
- **Code**: `new THREE.Quaternion(deviceQuat[0], deviceQuat[1], deviceQuat[2], deviceQuat[3])`
- **Verification**: 
  - gl-matrix: `[x, y, z, w]` at indices `[0, 1, 2, 3]`
  - THREE.js: Constructor expects `(x, y, z, w)`
  - **STATUS**: ✓ Correct mapping

### Conclusion
**No quaternion format issues found** - the [w, x, y, z] → [x, y, z, w] conversion appears correct throughout the pipeline.

---

## 2. CRITICAL ISSUES IDENTIFIED

### Issue #1: Euler Angle Order Mismatch (CRITICAL)

**Location**: `src/ui/scene/skeletalRig.ts:330` vs `src/core/ArmSolver.ts:110`

**Problem**:
- `ArmSolver` uses `eulerZYX()` which extracts angles in **Z-Y-X order** = `[yaw, pitch, roll]`
- `skeletalRig.applySideQuaternion()` converts quaternion to Euler using `setFromQuaternion(threeQuat, 'XYZ')` which gives **X-Y-Z order**
- These are **fundamentally different rotation orders** and cannot be directly mapped

**Details**:
```typescript
// ArmSolver.ts:110 - Extracts [yaw, pitch, roll] from Z-Y-X decomposition
const [yaw, pitch, roll] = eulerZYX(Q_TU).map(r=>r*180/Math.PI);

// skeletalRig.ts:330 - Extracts [x, y, z] Euler angles in X-Y-Z order
const euler = new THREE.Euler().setFromQuaternion(threeQuat, 'XYZ');
// Then maps: correctedRoll = -euler.x, correctedPitch = euler.y, correctedYaw = -euler.z
```

**Impact**: The quaternion→Euler conversion in `applySideQuaternion()` is using the wrong Euler order, causing incorrect axis mappings.

**Recommendation**: Either:
1. Use `'ZYX'` order when converting to Euler, OR
2. Extract angles directly using `eulerZYX()` instead of converting through THREE.js

---

### Issue #2: Sign Inconsistencies Between Actuator and Quaternion Paths

**Location**: `src/ui/scene/skeletalRig.ts`

**Problem**: The actuator path and quaternion path apply different corrections:

**Actuator Path (line 448)**:
```typescript
arm.shoulder.rotation.set(
  -(a.shRoll - 0)*d2r,      // X = -shRoll
  (a.shPitch - 0)*d2r,      // Y = +shPitch  
  -(a.shYaw - 0)*d2r        // Z = -shYaw
);
```

**Quaternion Path (lines 334-336)**:
```typescript
const correctedRoll = -euler.x;    // Maps euler.x → roll
const correctedPitch = euler.y;    // Maps euler.y → pitch (NO negation)
const correctedYaw = -euler.z;    // Maps euler.z → yaw
```

**Comment Reference (line 333)**:
```typescript
// Comment says: arm.shoulder.rotation.set(a.shRoll*d2r, -a.shPitch*d2r, -(a.shYaw - 180)*d2r);
// But actual code uses: -(a.shRoll)*d2r, (a.shPitch)*d2r, -(a.shYaw)*d2r
```

**Issues**:
1. Comment doesn't match actual actuator code (sign differences, missing 180° offset)
2. Quaternion path applies `euler.y` directly to pitch, but comment suggests it should be negated
3. Actuator code has no yaw offset, but comment mentions `-(a.shYaw - 180)`

**Impact**: These inconsistencies suggest the coordinate corrections are either wrong or outdated.

---

### Issue #3: Euler Order Mismatch in Wrist Calculation

**Location**: `src/core/ArmSolver.ts:179` vs `src/ui/scene/skeletalRig.ts:392`

**Problem**:
- `ArmSolver` extracts wrist angles using `eulerZYX(Q_W)` which gives `[yaw, pitch, roll]` in Z-Y-X order
- `skeletalRig` converts relative quaternion to Euler using `setFromQuaternion(threeRelQuat, 'XYZ')` which gives `[x, y, z]` in X-Y-Z order
- Then maps: `correctedPitch = -relativeEuler.x`, `correctedYaw = -relativeEuler.z`

**Details**:
```typescript
// ArmSolver: eulerZYX gives [yaw, pitch, roll] from Z-Y-X
const [wYaw, wRoll, wPitch] = eulerZYX(Q_W);
// Returns: wrYaw = wYaw, wrPitch = wPitch

// skeletalRig: setFromQuaternion('XYZ') gives [x, y, z] from X-Y-Z
const relativeEuler = new THREE.Euler().setFromQuaternion(threeRelQuat, 'XYZ');
// Then: correctedPitch = -relativeEuler.x, correctedYaw = -relativeEuler.z
```

**Impact**: `euler.x` (from X-Y-Z) is NOT equivalent to pitch from Z-Y-X decomposition. This is mapping wrong axes.

---

### Issue #4: Shoulder Yaw Offset Inconsistency

**Location**: `src/ui/scene/skeletalRig.ts:333, 348, 336`

**Problem**:
- Comment suggests: `-(a.shYaw - 180)*d2r` (180° offset)
- Actual actuator code: `-(a.shYaw - 0)*d2r` (no offset)
- Quaternion path: `-euler.z` (no offset applied)

**Question**: Should there be a 180° yaw offset? The comment suggests yes, but code says no.

---

### Issue #5: Elbow Rotation Calculation Complexity

**Location**: `src/ui/scene/skeletalRig.ts:364-371`

**Problem**: 
- Extracts elbow flex from relative quaternion using `relativeEuler.z` (from X-Y-Z decomposition)
- But `eulerZYX()` (used in ArmSolver) would extract flex differently
- The sign correction `-relativeEuler.z` may not match the actual physical rotation

**Details**:
```typescript
const relativeEuler = new THREE.Euler().setFromQuaternion(threeRelQuat, 'XYZ');
const elbowFlex = -relativeEuler.z;  // Uses Z component from X-Y-Z
```
But Z component from X-Y-Z is NOT the same as the flex angle from Z-Y-X decomposition.

---

### Issue #6: Coordinate System Transformation Assumptions

**Location**: `src/core/mathUtils.ts:109-122`

**Current Assumptions**:
```typescript
// Sensor Z [0, 0, 1] → transforms to upZ
// Then converted: up = [upZ[0], upZ[2], -upZ[1]]  // [x, z, y] conversion
// Sensor Y [0, 1, 0] → transforms to fwdY  
// Then converted: fwd = [fwdY[0], fwdY[2], -fwdY[1]]  // [x, z, -y] conversion
```

**Potential Issues**:
1. The axis swapping `[x, z, y]` and `[x, z, -y]` may not correctly map sensor frame to Three.js scene frame
2. If sensor axes are misinterpreted, all derived vectors (up, fwd) will be wrong
3. This cascades to angle calculations in ArmSolver (which uses these vectors)

**Recommendation**: Verify sensor frame → scene frame transformation with physical device.

---

## 3. CASCADING EFFECTS

### How Issues Compound:

1. **Wrong Euler order** → Wrong axis mappings → Wrong bone rotations
2. **Sign inconsistencies** → Rotations flipped/mirrored incorrectly
3. **Coordinate system issues** → Up/forward vectors wrong → Elbow flex calculation wrong
4. **Yaw offset uncertainty** → Model orientation consistently off

### Evidence of Cascading Issues:

The comment at `skeletalRig.ts:333` mentions corrections that don't match actual code, suggesting multiple iterations of fixes that may have introduced inconsistencies.

---

## 4. SPECIFIC RECOMMENDATIONS

### Priority 1: Fix Euler Order Mismatch
- Use consistent Euler order (`ZYX`) when extracting angles from quaternions
- OR: Extract angles using same function (`eulerZYX`) in both solver and rig

### Priority 2: Align Actuator and Quaternion Paths
- Make `applySideQuaternion()` and `applySideActuatorAngles()` produce identical results
- Update comments to match actual code, or fix code to match intended behavior

### Priority 3: Verify Coordinate Transformations
- Validate sensor frame → scene frame mapping in `quaternionToVectors()`
- Test with known device orientations to verify up/fwd vectors

### Priority 4: Standardize Sign Corrections
- Document why each sign flip is needed
- Ensure consistent application across all rotation calculations

---

## 5. QUATERNION FORMAT VERIFICATION

✅ **CONFIRMED**: Quaternion format conversion is correct:
- Raw: `[w, x, y, z]` 
- Stored: `[x, y, z, w]` (gl-matrix format)
- THREE.js: Correctly constructed as `(x, y, z, w)`

**No quaternion parsing issues detected** - the format conversion pipeline appears correct.

---

## Summary

The main issues are:
1. **Euler angle order mismatches** (X-Y-Z vs Z-Y-X) causing wrong axis mappings
2. **Sign inconsistencies** between different code paths and comments
3. **Potential coordinate system misalignments** in vector transformations
4. **Missing or incorrect offsets** (180° yaw offset mentioned but not applied)

The quaternion format itself appears correct, but the interpretation and conversion to bone rotations has multiple inconsistencies.

