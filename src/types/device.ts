import { quat, vec3 } from 'gl-matrix';
import { DeviceColor } from './deviceColors';

export interface DeviceData {
  quat: quat;                 // gl-matrix order [x,y,z,w]
  up: vec3;   fwd: vec3;      // derived directions
  chainStart: vec3; chainEnd: vec3;
  lastSeen: number;           // ms since page load
  fingerNorm?:   number[];    // 16 values, 0-1 normalized (glove only)
  fingerSmooth?: number[];    // EMA-smoothed 0-1 (glove only)
}

export interface Device extends DeviceData {
  id: string;
  name: string;
  position: DeviceRole;
  color: DeviceColor;
  connectionId?: string;  // Optional for live devices
  userId?: string;       // Optional for live devices
  createdAt?: Date;      // Optional for live devices
  updatedAt?: Date;      // Optional for live devices
  lastDataUpdate?: number; // Optional for playback devices
  firmwareVersion?: string; // Optional
}

export interface DeviceConnectionState {
  connectedDevices: Device[];
  
  // Methods for checking connection status
  isConnected(role: DeviceRole): boolean;
  get disconnectedDevices(): DeviceRole[];
  get totalConnectedDevices(): number;
}
  
  // Enum types for Eidon devices
  
  export enum DeviceRole {
    ROLE_LEFT_HAND = 0,      // Left hand/arm
    ROLE_RIGHT_HAND = 1,     // Right hand/arm
    ROLE_LEFT_FOREARM = 2,   // Left forearm
    ROLE_RIGHT_FOREARM = 3,  // Right forearm
    ROLE_LEFT_SHOULDER = 4,  // Left shoulder
    ROLE_RIGHT_SHOULDER = 5, // Right shoulder
    ROLE_CHEST = 6,          // Chest
    ROLE_LEFT_GLOVE = 8,     // Left glove (with finger sensors)
    ROLE_RIGHT_GLOVE = 9,    // Right glove (with finger sensors)
  }
  
  // Re-export DeviceColor from deviceColors.ts for backward compatibility
  export { DeviceColor } from './deviceColors';
  
  // Mapping number to role string
  export const deviceRoleToString = (role: DeviceRole): string => {
    const roleMap: Record<DeviceRole, string> = {
      [DeviceRole.ROLE_LEFT_HAND]: 'left_hand',
      [DeviceRole.ROLE_RIGHT_HAND]: 'right_hand',
      [DeviceRole.ROLE_LEFT_FOREARM]: 'left_forearm',
      [DeviceRole.ROLE_RIGHT_FOREARM]: 'right_forearm',
      [DeviceRole.ROLE_LEFT_SHOULDER]: 'left_shoulder',
      [DeviceRole.ROLE_RIGHT_SHOULDER]: 'right_shoulder',
      [DeviceRole.ROLE_CHEST]: 'chest',
      [DeviceRole.ROLE_LEFT_GLOVE]: 'left_glove',
      [DeviceRole.ROLE_RIGHT_GLOVE]: 'right_glove',
    };
    return roleMap[role];
  };
  
  // Mapping string to role number
  export const stringToDeviceRole = (roleString: string): DeviceRole => {
    const stringMap: Record<string, DeviceRole> = {
      'left_hand': DeviceRole.ROLE_LEFT_HAND,
      'right_hand': DeviceRole.ROLE_RIGHT_HAND,
      'left_forearm': DeviceRole.ROLE_LEFT_FOREARM,
      'right_forearm': DeviceRole.ROLE_RIGHT_FOREARM,
      'left_shoulder': DeviceRole.ROLE_LEFT_SHOULDER,
      'right_shoulder': DeviceRole.ROLE_RIGHT_SHOULDER,
      'chest': DeviceRole.ROLE_CHEST,
      'left_glove': DeviceRole.ROLE_LEFT_GLOVE,
      'right_glove': DeviceRole.ROLE_RIGHT_GLOVE,
    };
    return stringMap[roleString];
  };
  
  // For backward compatibility, keep the old enum name but point to the new one
  export const DevicePosition = DeviceRole;
  