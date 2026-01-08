/**
 * Device color definitions for Eidon Trackers
 * TODO: Define these based on Eidon Tracker Colors
 */

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
  SILVER = 'rgb(220, 220, 220)', // Light silver, close to transparent
  BLACK = 'rgb(20, 20, 20)', // Dark gray instead of true black
}

/**
 * Color option data for dropdowns
 */
export const COLOR_OPTIONS = [
  { value: DeviceColor.RED, label: 'Red', color: DeviceColor.RED },
  { value: DeviceColor.GREEN, label: 'Green', color: DeviceColor.GREEN },
  { value: DeviceColor.BLUE, label: 'Blue', color: DeviceColor.BLUE },
  { value: DeviceColor.YELLOW, label: 'Yellow', color: DeviceColor.YELLOW },
  { value: DeviceColor.PURPLE, label: 'Purple', color: DeviceColor.PURPLE },
  { value: DeviceColor.ORANGE, label: 'Orange', color: DeviceColor.ORANGE },
  { value: DeviceColor.PINK, label: 'Pink', color: DeviceColor.PINK },
  { value: DeviceColor.CYAN, label: 'Cyan', color: DeviceColor.CYAN },
  { value: DeviceColor.WHITE, label: 'White', color: DeviceColor.WHITE },
  { value: DeviceColor.SILVER, label: 'Silver', color: DeviceColor.SILVER },
  { value: DeviceColor.BLACK, label: 'Black', color: DeviceColor.BLACK },
];

