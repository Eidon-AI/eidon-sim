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
