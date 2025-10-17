import { quat, vec3 } from 'gl-matrix';
import { Device } from '../types/device';
import { HUM_LEN, RAD_LEN, HAND_LEN } from './constants';

/* helper to read little-endian u16 and map to −1…+1 float */
function u16ToFloat(dv: DataView, byte: number) {
  const raw = dv.getUint16(byte, true);
  return (raw / 32767) - 1;          // assume firmware already unit-norm
}

export function parseTracker(state: Device, view: DataView) {
  // === Quaternion ===
  const q: quat = [
    u16ToFloat(view, 0), // i
    u16ToFloat(view, 2), // j
    u16ToFloat(view, 4), // k
    u16ToFloat(view, 6)  // real
  ];
  state.quat = q;

  // === Derived unit vectors ===
  const upZ   = vec3.transformQuat(vec3.create(), [0, 0, 1], q);
  const up   = [upZ[0], upZ[2], -upZ[1]] as vec3;
  const fwdZ = vec3.transformQuat(vec3.create(), [0, 1, 0], q); // sensor Y-fwd
  const fwd  = [fwdZ[0], fwdZ[2], -fwdZ[1]] as vec3;            // swap Y/Z

  state.up  = up;
  state.fwd = fwd;

  // === Chain positions ===
  // Note: Position is determined by device configuration, not parsed from data
  // Chain positions will be set by the system based on device position
  state.chainStart = vec3.create();
  state.chainEnd = vec3.create();
}
