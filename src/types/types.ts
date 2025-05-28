import { quat, vec3 } from 'gl-matrix';

export type DeviceKind = 'tracker' | 'glove';

export interface DeviceState {
  id: string;                      // VID:PID:serial
  kind: DeviceKind;
  color: string;                   // "#RRGGBB"
  arm?: { side: 'left' | 'right'; level: 'upper' | 'lower' | 'hand' };
  quat: quat;
  up: vec3;
  fwd: vec3;
  chainStart: vec3;
  chainEnd: vec3;
  lastSeen: number;
  // glove only
  finger?: number[];        // raw 0-255
  fingerNorm?: number[];    // 0-1
  fingerDeg?:  number[];    // 0-90°
  fingerSmooth?: number[];  // EMA-filtered 0-1
}
