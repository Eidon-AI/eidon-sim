// src/core/constants.ts
/* ------------------------------------------------------------------
 * USB Vendor & Product IDs for Eidon devices
 * ---------------------------------------------------------------- */
export const EIDON_VENDOR_ID   = 0xE1D0;

export const EIDON_GLOVE_PID   = 0x0001;   // glove (IMU + 16 fingers)
export const EIDON_TRACKER_PID = 0x0002;   // tracker (IMU only)

/* ------------------------------------------------------------------
 * HID report constants
 * ---------------------------------------------------------------- */
export const CALIBRATE_OUT_REPORT_ID = 0x01;
export const CALIBRATE_PAYLOAD       = 0x01;

export const COLOR_FEATURE_REPORT_ID = 0x01;   // 3-byte RGB

// segment lengths (metres) – user-editable later
export const HUM_LEN  = 0.30;   // humerus
export const RAD_LEN  = 0.26;   // radius/ulna
export const HAND_LEN = 0.10;   // hand

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

/* Exponential moving-average smoothing factor (0–1) */
export const ANGLE_ALPHA = 0.2;          // 0.2 ⇒ ~5-frame memory
