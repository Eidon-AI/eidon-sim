// src/core/constants.ts

import { prefs } from "./preferences";

/* ------------------------------------------------------------------
 * Eidon Device Identifiers
 * ---------------------------------------------------------------- */
export const EIDON_VENDOR_ID   = 0xE1D0;
export const EIDON_PRODUCT_ID  = 0x0002;

/* ------------------------------------------------------------------
 * Bluetooth LE Service and Characteristic UUIDs
 * ---------------------------------------------------------------- */
export const EIDON_SERVICE_UUID = 'E1D00001-8B5A-3E5B-9E23-4F9B5C91BBDE';
export const QUATERNION_CHAR_UUID = 'E1D00002-8B5A-3E5B-9E23-4F9B5C91BBDE';
export const CALIBRATION_CHAR_UUID = 'E1D00003-8B5A-3E5B-9E23-4F9B5C91BBDE';
export const DEVICE_INFO_CHAR_UUID = 'E1D00005-8B5A-3E5B-9E23-4F9B5C91BBDE';

// Hub-specific characteristics
export const HAND_QUATERNION_CHAR_UUID = 'E1D00008-8B5A-3E5B-9E23-4F9B5C91BBDE';
export const FOREARM_QUATERNION_CHAR_UUID = 'E1D00009-8B5A-3E5B-9E23-4F9B5C91BBDE';

// Role configuration service
export const ROLE_CONFIG_SERVICE_UUID = 'E1D00006-8B5A-3E5B-9E23-4F9B5C91BBDE';
export const ROLE_CONFIG_CHAR_UUID = 'E1D00007-8B5A-3E5B-9E23-4F9B5C91BBDE';

/* ------------------------------------------------------------------
 * Device Roles (0-6)
 * ---------------------------------------------------------------- */
export enum DeviceRole {
  LEFT_HAND = 0,
  RIGHT_HAND = 1,
  LEFT_FOREARM = 2,
  RIGHT_FOREARM = 3,
  LEFT_HUB = 4,
  RIGHT_HUB = 5,
  CHEST = 6,
  UNKNOWN = 7
}

export const DEVICE_ROLE_NAMES = {
  [DeviceRole.LEFT_HAND]: 'Left Hand',
  [DeviceRole.RIGHT_HAND]: 'Right Hand',
  [DeviceRole.LEFT_FOREARM]: 'Left Forearm',
  [DeviceRole.RIGHT_FOREARM]: 'Right Forearm',
  [DeviceRole.LEFT_HUB]: 'Left Hub',
  [DeviceRole.RIGHT_HUB]: 'Right Hub',
  [DeviceRole.CHEST]: 'Chest',
  [DeviceRole.UNKNOWN]: 'Unknown'
};

// segment lengths (metres) – user-editable later
export const HUM_LEN  = () => prefs.humLen;
export const RAD_LEN  = () => prefs.radLen;
export const HAND_LEN = () => prefs.handLen;

export const ANGLE_ALPHA  = () => prefs.angleAlpha;
export const FINGER_ALPHA = () => prefs.fingerAlpha;

/* Joint limits (deg) – simple, anatomically reasonable */
export const JOINT_LIMITS = {
  shYaw:   [-180, 180],
  shPitch: [-120,  90],
  shRoll:  [-90,   90],
  elFlex:  [   0, 135],
  faRoll:  [-180, 180],
  wrPitch: [-80,   80],
  wrYaw:   [-80,   80]
};

export const RAD_TO_DEG = 180 / Math.PI;
