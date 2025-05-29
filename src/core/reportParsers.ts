import { quat, vec3 } from 'gl-matrix';
import { DeviceState } from '../types/types';
import { HUM_LEN, RAD_LEN, HAND_LEN, FINGER_ALPHA } from './constants';

/* helper to read little-endian u16 and map to −1…+1 float */
function u16ToFloat(dv: DataView, byte: number) {
  const raw = dv.getUint16(byte, true);
  return (raw / 32767) - 1;          // assume firmware already unit-norm
}

export function parseTracker(state: DeviceState, view: DataView) {
  // === Quaternion ===
  const q: quat = [
    u16ToFloat(view, 0), // i
    u16ToFloat(view, 2), // j
    u16ToFloat(view, 4), // k
    u16ToFloat(view, 6)  // real
  ];
  state.quat = q;

  // === Buttons ===
  const btn = view.getUint8(8);
  const side  = (btn & 0b00000001) ? 'left' : 'right';
  const level = (btn & 0b00000010) ? 'upper' : 'lower';
  state.arm = { side, level };

  // === Derived unit vectors ===
  const upZ   = vec3.transformQuat(vec3.create(), [0, 0, 1], q);
  const up   = [-upZ[0], upZ[2], upZ[1]] as vec3;
  const fwdZ = vec3.transformQuat(vec3.create(), [0, 1, 0], q); // sensor Y-fwd
  const fwd  = [-fwdZ[0], fwdZ[2], fwdZ[1]] as vec3;            // swap Y/Z

  state.up  = up;
  state.fwd = fwd;

  // === Chain positions ===
  const shoulder: vec3 = side === 'left'
    ? [-0.25, 0.05,  3]
    : [-0.25, 0.05, -3];

  const start = (level === 'upper')
    ? shoulder
    : state.chainStart;        // will be filled after upper tracker parsed

  const len = level === 'upper' ? HUM_LEN()
           : level === 'lower' ? RAD_LEN()
           : HAND_LEN();

  const end = vec3.scaleAndAdd(vec3.create(), start, fwd, len);

  state.chainStart = start;
  state.chainEnd   = end;
}

export function parseGlove(state: DeviceState, view: DataView) {
  /* --------- button flags (16-bit) --------- */
  const buttons16   = view.getUint16(0, true);
  const configByte  = view.getUint8(1);          // 2nd byte = side/level
  const side        = (configByte & 0b00000001) ? 'left' : 'right';
  state.arm = { side, level: 'hand' };

  /* --------- finger angles (16 × u8) -------- */
  const fingers: number[] = [];
  for (let i = 0; i < 16; i++) fingers.push(view.getUint8(2 + i));
  state.finger = fingers;                        // raw 0-255
  state.fingerNorm = fingers.map(b => b / 255);  // 0-1
  state.fingerDeg  = fingers.map(b => b / 255 * 90);

  /* after you assign fingerNorm/fingerDeg in parseGlove */
  if (!state.fingerSmooth) state.fingerSmooth = Array(16).fill(0);
  state.fingerSmooth = state.fingerSmooth.map((prev,i)=>
    prev + (state.fingerNorm![i] - prev) * FINGER_ALPHA()
  );

  /* --------- quaternion (bytes 18-25) ------- */
  const base = 2 + 16;                           // 18
  const q: quat = [
    u16ToFloat(view, base + 0),  // i
    u16ToFloat(view, base + 2),  // j
    u16ToFloat(view, base + 4),  // k
    u16ToFloat(view, base + 6)   // real
  ];
  state.quat = q;

  /* --------- derived vectors & chain pos ---- */
  const upZ  = vec3.transformQuat(vec3.create(), [1,0,1], q);
  const up   = [-upZ[0], upZ[2], upZ[1]] as vec3;
  const fwdZ = vec3.transformQuat(vec3.create(), [0,1,0], q);
  const fwd  = [-fwdZ[0], fwdZ[2], fwdZ[1]] as vec3;   // swap Y/Z and invert vertical component

  state.up  = up;
  state.fwd = fwd;

  const shoulder: vec3 = side === 'left'
      ? [-0.25, 0.05,  3]
      : [-0.25, 0.05, -3];

  const start = state.chainStart || shoulder;          // if trackers missing
  const end   = vec3.scaleAndAdd(vec3.create(), start, fwd, HAND_LEN());

  state.chainStart = start;
  state.chainEnd   = end;
}
