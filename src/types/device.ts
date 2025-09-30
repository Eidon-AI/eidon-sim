import { quat, vec3 } from 'gl-matrix';

export type DeviceKind = 'tracker' | 'glove';

export interface Device {
    id: string;  // UUID from BaseEntity
    createdAt: Date;
    updatedAt: Date;
    name: string;  // User-friendly name for the device
    type: DeviceType;  // Enum value
    position: DeviceRole;  // Enum value (int)
    color: DeviceColor;  // Enum value
    connectionId: string;  // Connection identifier for the device
    userId: string;  // Foreign key to users table
  }

export interface ConnectedDevice {
  deviceId: string;
  name: string;
  role: DeviceRole;
  lastDataUpdate: number; // timestamp
  color?: string; // RGB string from database

  // Data
  quat: quat;
  up: vec3;
  fwd: vec3;
  chainStart: vec3;
  chainEnd: vec3;
  firmwareVersion?: string;
}

export interface DeviceConnectionState {
  connectedDevices: ConnectedDevice[];
  
  // Methods for checking connection status
  isConnected(role: DeviceRole): boolean;
  get disconnectedDevices(): DeviceRole[];
  get totalConnectedDevices(): number;
}
  
  // Enum types for Eidon devices
  
  export enum DeviceType {
    TRACKER = 'tracker',
    GLOVE = 'glove',
  }
  
  export enum DeviceRole {
    ROLE_LEFT_HAND = 0,      // Left hand/arm
    ROLE_RIGHT_HAND = 1,     // Right hand/arm
    ROLE_LEFT_FOREARM = 2,   // Left forearm
    ROLE_RIGHT_FOREARM = 3,  // Right forearm
    ROLE_LEFT_HUB = 4,       // Left hub/upper arm
    ROLE_RIGHT_HUB = 5,      // Right hub/upper arm
    ROLE_CHEST = 6,          // Chest
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
    };
    return stringMap[roleString];
  };
  
  // For backward compatibility, keep the old enum name but point to the new one
  export const DevicePosition = DeviceRole;
  