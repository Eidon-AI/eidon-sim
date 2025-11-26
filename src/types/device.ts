import { quat, vec3 } from 'gl-matrix';

export interface DeviceData {
  quat: quat;                 // gl-matrix order [x,y,z,w]
  up: vec3;   fwd: vec3;      // derived directions
  chainStart: vec3; chainEnd: vec3;
  lastSeen: number;           // ms since page load
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
    ROLE_LEFT_HUB = 4,       // Left hub/upper arm
    ROLE_RIGHT_HUB = 5,      // Right hub/upper arm
    ROLE_CHEST = 6,          // Chest
    ROLE_LEFT_GLOVE = 8,     // Left glove (with finger sensors)
    ROLE_RIGHT_GLOVE = 9,    // Right glove (with finger sensors)
  }
  
  // TODO: Define these based on Eidon Tracker Colors
  export enum DeviceColor {
    RED = 'rgb(255, 0, 0)',
    GREEN = 'rgb(0, 128, 0)',
    BLUE = 'rgb(0, 0, 255)',
    YELLOW = 'rgb(255, 255, 0)',
    PURPLE = 'rgb(128, 0, 128)',
    ORANGE = 'rgb(255, 165, 0)',
    PINK = 'rgb(255, 192, 203)',
    CYAN = 'rgb(0, 255, 255)',
    WHITE = 'rgb(255, 255, 255)',
    BLACK = 'rgb(40, 40, 40)', // Dark gray instead of true black
  }
  
  // Mapping number to role string
  export const deviceRoleToString = (role: DeviceRole): string => {
    const roleMap: Record<DeviceRole, string> = {
      [DeviceRole.ROLE_LEFT_HAND]: 'left_hand',
      [DeviceRole.ROLE_RIGHT_HAND]: 'right_hand',
      [DeviceRole.ROLE_LEFT_FOREARM]: 'left_forearm',
      [DeviceRole.ROLE_RIGHT_FOREARM]: 'right_forearm',
      [DeviceRole.ROLE_LEFT_HUB]: 'left_hub',
      [DeviceRole.ROLE_RIGHT_HUB]: 'right_hub',
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
      'left_hub': DeviceRole.ROLE_LEFT_HUB,
      'right_hub': DeviceRole.ROLE_RIGHT_HUB,
      'chest': DeviceRole.ROLE_CHEST,
      'left_glove': DeviceRole.ROLE_LEFT_GLOVE,
      'right_glove': DeviceRole.ROLE_RIGHT_GLOVE,
    };
    return stringMap[roleString];
  };
  
  // For backward compatibility, keep the old enum name but point to the new one
  export const DevicePosition = DeviceRole;
  