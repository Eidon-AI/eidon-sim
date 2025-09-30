// Sensor data recording interfaces

export interface SensorRecordingInterface {
  id: string;
  name: string;
  startTime: number;  // absolute timestamp
  endTime: number;    // absolute timestamp
  sampleRate: number; // Hz (default 24)
  devices: DeviceSimple[];
  snapshots: RecordingSnapshot[];
}

export interface DeviceSimple {
  id: string;
  position: string;  // Device role/position
  connectionId: string;
}

export interface RecordingSnapshot {
  time: number;  // relative ms from start
  deviceData: Record<string, [number, number, number, number]>;  // DeviceSimple.id -> quaternion [x,y,z,w]
}
