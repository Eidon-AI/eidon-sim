import { RawMotionData } from './EidonTrackerManager';

/**
 * Parses raw motion data from 36 bytes
 * Format: 12 bytes accel (3 floats), 12 bytes gyro (3 floats), 12 bytes mag (3 floats)
 * All floats are little-endian, 4 bytes each
 */
export function parseRawMotionData(data: DataView, timestamp: number = performance.now()): RawMotionData | null {
  // Minimum 36 bytes required
  if (data.byteLength < 36) {
    return null;
  }

  try {
    // Accelerometer (bytes 0-11): 3 floats
    const accelX = data.getFloat32(0, true); // little-endian
    const accelY = data.getFloat32(4, true);
    const accelZ = data.getFloat32(8, true);

    // Gyroscope (bytes 12-23): 3 floats
    const gyroX = data.getFloat32(12, true);
    const gyroY = data.getFloat32(16, true);
    const gyroZ = data.getFloat32(20, true);

    // Magnetometer (bytes 24-35): 3 floats
    const magX = data.getFloat32(24, true);
    const magY = data.getFloat32(28, true);
    const magZ = data.getFloat32(32, true);

    return {
      accelerometer: { x: accelX, y: accelY, z: accelZ },
      gyroscope: { x: gyroX, y: gyroY, z: gyroZ },
      magnetometer: { x: magX, y: magY, z: magZ },
      timestamp
    };
  } catch (error) {
    console.warn('[RawMotionDataParser] Failed to parse raw motion data:', error);
    return null;
  }
}

