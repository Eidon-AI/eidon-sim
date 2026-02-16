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
export const EIDON_SERVICE_UUID = 'e1d00001-8b5a-3e5b-9e23-4f9b5c91bbde';
export const QUATERNION_CHAR_UUID = 'e1d00002-8b5a-3e5b-9e23-4f9b5c91bbde';
export const CALIBRATION_CHAR_UUID = 'e1d00003-8b5a-3e5b-9e23-4f9b5c91bbde';
export const DEVICE_INFO_CHAR_UUID = 'e1d00005-8b5a-3e5b-9e23-4f9b5c91bbde';

// LEFT characteristics (for receiving child data from left-side devices via ESP-NOW)
// These are available on right-side hub devices (right_hand, right_forearm, right_shoulder)
export const LEFT_QUATERNION_CHAR_UUID = 'e1d00008-8b5a-3e5b-9e23-4f9b5c91bbde';
export const LEFT_RAW_DATA_CHAR_UUID = 'e1d0000c-8b5a-3e5b-9e23-4f9b5c91bbde';
export const LEFT_BATTERY_CHAR_UUID = 'e1d0000d-8b5a-3e5b-9e23-4f9b5c91bbde';

// Raw data characteristics (for device's own data - MAIN characteristics)
export const HUB_RAW_DATA_CHAR_UUID = 'e1d0000b-8b5a-3e5b-9e23-4f9b5c91bbde';

// Glove-specific characteristics
export const FINGER_SENSOR_CHAR_UUID = 'e1d0000a-8b5a-3e5b-9e23-4f9b5c91bbde';

// Role configuration service
export const ROLE_CONFIG_SERVICE_UUID = 'e1d00006-8b5a-3e5b-9e23-4f9b5c91bbde';
export const ROLE_CONFIG_CHAR_UUID = 'e1d00007-8b5a-3e5b-9e23-4f9b5c91bbde';

/* ------------------------------------------------------------------
 * Device Roles (0-6, 8-9)
 * ---------------------------------------------------------------- */
export enum DeviceRole {
  LEFT_HAND = 0,
  RIGHT_HAND = 1,
  LEFT_FOREARM = 2,
  RIGHT_FOREARM = 3,
  LEFT_SHOULDER = 4,
  RIGHT_SHOULDER = 5,
  CHEST = 6,
  UNKNOWN = 7,
  LEFT_GLOVE = 8,
  RIGHT_GLOVE = 9
}

export const DEVICE_ROLE_NAMES = {
  [DeviceRole.LEFT_HAND]: 'Left Hand',
  [DeviceRole.RIGHT_HAND]: 'Right Hand',
  [DeviceRole.LEFT_FOREARM]: 'Left Forearm',
  [DeviceRole.RIGHT_FOREARM]: 'Right Forearm',
  [DeviceRole.LEFT_SHOULDER]: 'Left Shoulder',
  [DeviceRole.RIGHT_SHOULDER]: 'Right Shoulder',
  [DeviceRole.CHEST]: 'Chest',
  [DeviceRole.UNKNOWN]: 'Unknown',
  [DeviceRole.LEFT_GLOVE]: 'Left Glove',
  [DeviceRole.RIGHT_GLOVE]: 'Right Glove'
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
