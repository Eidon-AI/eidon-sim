// Sensor data structure returned from the API's sensor data files
// This represents the actual JSON structure stored in GCS and accessed via sensorDataReadUrl

import { DeviceColor } from "./device";

export interface DeviceSimple {
  id: string;
  position: string;  // Device role/position (e.g., 'left_hand', 'right_forearm')
  connectionId: string;
  color: DeviceColor;     // rgb(...) color for visualization
}

export interface SensorSnapshot {
  time: number;  // relative ms from start
  deviceData: Record<string, [number, number, number, number]>;  // DeviceSimple.id -> quaternion [x,y,z,w]
  fingerData?: Record<string, number[]>;  // Optional: DeviceSimple.id -> 16 finger sensor values (0.0-1.0)
}

export interface SensorRecording {
  id: string;
  name: string;
  startTime: number;  // absolute timestamp
  endTime: number;    // absolute timestamp
  sampleRate: number; // Hz (default 24)
  devices: DeviceSimple[];
  snapshots: SensorSnapshot[];
}

