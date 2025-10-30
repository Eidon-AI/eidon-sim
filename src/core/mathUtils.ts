import { quat, mat3, vec3 } from 'gl-matrix';

/* Safe acos with clamp */
function safeAcos(x: number) {
  return Math.acos(Math.min(1, Math.max(-1, x)));
}

/* Z-Y-X Euler (yaw-pitch-roll) --------------------------------------- */
export function eulerZYX(q: quat): [number, number, number] {
  const m = mat3.create();
  mat3.fromQuat(m, q);
  /* 0 1 2
     3 4 5
     6 7 8 */
  const [m00, m01, m02,
         m10, m11, m12,
         m20, m21, m22] = m;

  const yaw   = Math.atan2(-m10, m00);  // Z
  const pitch = Math.asin ( m20);       // Y
  const roll  = Math.atan2(-m21, m22);  // X
  return [yaw, pitch, roll];
}

/* Y-Z-X Euler (flex first) ------------------------------------------- */
export function eulerYZX(q: quat): [number, number, number] {
  const m = mat3.create();
  mat3.fromQuat(m, q);
  /* row-major: 0 1 2 / 3 4 5 / 6 7 8 */
  const [m00, m01, m02,
         ,    , m12,
         ,    , m22] = m;

  const flex  = Math.atan2( m12,  m22);   // rotation about +Y
  const twist = Math.asin (-m02);         // about +Z (not used here)
  const roll  = Math.atan2( m01,  m00);   // about +X
  return [flex, twist, roll];
}

/**
 * Update quaternion to Euler conversion to match firmware implementation
 */
export function eulerXYZ(q: quat): [number, number, number] {
  // const [x, y, z, w] = q;
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];

  // Different quaternion to euler conversion that might reduce axis coupling
  const yaw = Math.atan2(2.0 * (w * z + x * y),
                        1.0 - 2.0 * (y * y + z * z));
  
  const pitch = Math.asin(2.0 * (w * y - z * x));
  
  const roll = Math.atan2(2.0 * (w * x + y * z),
                         1.0 - 2.0 * (x * x + y * y));

  // Convert to degrees and swap pitch and roll
  return [
    yaw,
    roll,   // Use roll value for pitch
    pitch,  // Use pitch value for roll
  ];
}

/* Twist around +X ---------------------------------------------------- */
export function twistAroundX(q: quat): number {
  const angle = 2 * Math.acos(q[3]);
  const s = Math.sqrt(1 - q[3] * q[3]);
  const axisX = s < 1e-6 ? 1 : q[0] / s;
  return angle * axisX;
}

/** Elbow flex (deg) given upper & lower forward vectors */
export function elbowFlexDeg(fwdUpper: vec3, fwdLower: vec3): number {
  const u = vec3.normalize(vec3.create(), fwdUpper);
  const l = vec3.normalize(vec3.create(), fwdLower);
  const cos = vec3.dot(u, l);
  return safeAcos(cos) * 180 / Math.PI;
}

/** Extract twist (deg) of qParent⁻¹·qChild about parent.forward */
export function rollAroundForward(
  qParent: quat,
  qChild: quat,
  fwdParent: vec3
): number {
  // relative rotation child in parent space
  const qRel = quat.multiply(quat.create(), quat.invert(quat.create(), qParent), qChild);

  // project rotation axis onto forward vector
  const angle = 2 * Math.acos(qRel[3]);
  if (angle < 1e-6) return 0;

  const s = Math.sqrt(1 - qRel[3] * qRel[3]);
  const axis = [qRel[0] / s, qRel[1] / s, qRel[2] / s] as vec3;
  const sign = vec3.dot(axis, fwdParent) >= 0 ? 1 : -1;
  return sign * angle * 180 / Math.PI;
}


/**
 * Convert quaternion to forward and up vectors in scene space.
 * This is the standard transformation used throughout the codebase.
 * @param q - Quaternion in format [x, y, z, w]
 * @returns Object with forward (fwd) and up vectors in scene space
 */
export function quaternionToVectors(q: quat): { up: vec3; fwd: vec3 } {
  // Transform sensor unit vectors through quaternion
  // Coordinate space conversion: Device [X, Y, Z] → Scene [X, Y, Z]
  // - Device X [1, 0, 0] → Left/Right (Scene X)
  // - Device Y [0, 1, 0] → Forward (Scene Z)
  // - Device Z [0, 0, 1] → Up (Scene Y)
  
  const upZ = vec3.transformQuat(vec3.create(), [0, 0, 1], q);   // sensor Z
  const up = [upZ[0], upZ[2], upZ[1]] as vec3;                  // [x, z, y] conversion: Device X→Scene X, Device Z→Scene Y (up), Device Y→Scene Z
  
  const fwdY = vec3.transformQuat(vec3.create(), [0, 1, 0], q);  // sensor Y (forward)
  const fwd = [fwdY[0], fwdY[2], -fwdY[1]] as vec3;             // [x, z, -y] conversion: Device Y→Scene Z (forward)

  return { up, fwd };

  //  // === Derived unit vectors ===
  //  const upZ   = vec3.transformQuat(vec3.create(), [0, 0, 1], q);
  //  const up   = [upZ[0], upZ[2], -upZ[1]] as vec3;
  //  const fwdZ = vec3.transformQuat(vec3.create(), [0, 1, 0], q); // sensor Y-fwd
  //  const fwd  = [fwdZ[0], fwdZ[2], -fwdZ[1]] as vec3;            // swap Y/Z
 
  //  state.up  = up;
  //  state.fwd = fwd;
}

/**
 * Format quaternion as a readable string.
 * @param q - Quaternion in format [x, y, z, w] or number array
 * @returns Formatted string like "(0.123, 0.456, 0.789, 0.987)"
 */
export function formatQuaternion(q: quat | number[]): string {
  if (q.length !== 4) {
    throw new Error('Quaternion must have 4 components');
  }
  return `(${q[0].toFixed(3)}, ${q[1].toFixed(3)}, ${q[2].toFixed(3)}, ${q[3].toFixed(3)})`;
}
