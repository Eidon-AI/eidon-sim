import { quat, vec3 } from 'gl-matrix';

export type DeviceKind = 'tracker' | 'glove';

export interface DeviceState {
  id: string;                      // VID:PID:serial
  kind: DeviceKind;
  color: string;                   // "#RRGGBB"
  arm?: { side: 'left' | 'right'; level: 'upper' | 'lower' | 'hand' };
  quat: quat;
  finger?: number[];               // glove only
  up: vec3;
  fwd: vec3;
  chainStart: vec3;
  chainEnd: vec3;
  lastSeen: number;
}
