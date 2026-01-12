import { vec3, quat } from 'gl-matrix';
import { Device } from '../types/device';
import { eulerXYZ } from './mathUtils';

/**
 * Yaw calculation method selection:
 * - 1: Use average forward direction of hubs
 * - 2: Use chest UP vector projection onto XZ plane
 * - 3: Use direct yaw from chest device quaternion
 */
export const CHEST_YAW_METHOD = 1;

/**
 * Calculate yaw angle from chest device UP vector projection onto yaw plane (XZ plane).
 * 
 * The chest device UP vector is projected onto the horizontal plane (XZ plane) and
 * the yaw angle is calculated from this projection.
 * 
 * @param chest - Chest device with up vector
 * @returns Yaw angle in radians, or null if chest device is invalid
 */
export function calculateYawFromChestUp(chest: Device | undefined): number | null {
  if (!chest || !chest.up) {
    return null;
  }

  // Project up vector onto yaw plane (XZ plane, horizontal plane)
  // chest.up from quaternionToVectors() is [x, z, y] in scene space:
  // - chest.up[0] = X component (left/right)
  // - chest.up[1] = Z component (forward/back)
  // - chest.up[2] = Y component (up/down, vertical - not used for yaw)
  
  // Project onto yaw plane: use X and Z components only
  const upX = chest.up[0];  // X component
  const upZ = chest.up[1];  // Z component
  
  // Check if the vector has meaningful magnitude
  const magnitude = Math.sqrt(upX * upX + upZ * upZ);
  if (magnitude < 0.001) {
    return null;
  }
  
  // Calculate yaw angle from chest up vector projection onto XZ plane
  // atan2(x, z) gives us the angle in the horizontal plane:
  // - atan2(0, 1) = 0° = +Z (forward) 
  // - atan2(1, 0) = 90° = +X (right)
  // - atan2(0, -1) = 180° = -Z (backward)
  const yawRad = Math.atan2(upX, upZ);
  
  return yawRad;
}

/**
 * Calculate yaw angle from average forward direction of left and right hub devices.
 * 
 * Averages the forward vectors from both hub devices and calculates the yaw angle
 * from the resulting average forward direction projected onto the yaw plane (XZ plane).
 * 
 * @param leftHub - Left hub device with forward vector
 * @param rightHub - Right hub device with forward vector
 * @param hasActiveData - Function to check if a device has active data
 * @returns Yaw angle in radians, or null if no valid hub devices available
 */
export function calculateYawFromHubs(
  leftHub: Device | undefined,
  rightHub: Device | undefined,
  hasActiveData: (device: Device | undefined, isChildDevice: boolean) => boolean
): number | null {
  // Check if we have active data from at least one hub
  const leftHubValid = leftHub && hasActiveData(leftHub, false);
  const rightHubValid = rightHub && hasActiveData(rightHub, false);
  
  if (!leftHubValid && !rightHubValid) {
    return null;
  }
  
  // Average the forward vectors from available hubs
  // fwd from quaternionToVectors() is [x, z, y] in scene space:
  // - fwd[0] = X component (left/right)
  // - fwd[1] = Z component (forward/back)
  // - fwd[2] = Y component (up/down, vertical - not used for yaw)
  
  let avgFwdX = 0;
  let avgFwdZ = 0;
  let count = 0;
  
  if (leftHubValid && leftHub.fwd) {
    avgFwdX += leftHub.fwd[0];
    avgFwdZ += leftHub.fwd[1];
    count++;
  }
  
  if (rightHubValid && rightHub.fwd) {
    avgFwdX += rightHub.fwd[0];
    avgFwdZ += rightHub.fwd[1];
    count++;
  }
  
  if (count === 0) {
    return null;
  }
  
  // Average the forward vectors
  avgFwdX /= count;
  avgFwdZ /= count;
  
  // Check if the averaged vector has meaningful magnitude
  const magnitude = Math.sqrt(avgFwdX * avgFwdX + avgFwdZ * avgFwdZ);
  if (magnitude < 0.001) {
    return null;
  }
  
  // Project onto yaw plane: use X and Z components only
  // Calculate yaw angle from average forward vector projection onto XZ plane
  // atan2(x, z) gives us the angle in the horizontal plane:
  // - atan2(0, 1) = 0° = +Z (forward) 
  // - atan2(1, 0) = 90° = +X (right)
  // - atan2(0, -1) = 180° = -Z (backward)
  const yawRad = Math.atan2(avgFwdX, avgFwdZ);
  
  return yawRad;
}

/**
 * Calculate yaw angle directly from chest device quaternion.
 * 
 * Extracts the yaw component directly from the chest device's quaternion
 * without any vector projection or averaging.
 * 
 * @param chest - Chest device with quaternion
 * @returns Yaw angle in radians, or null if chest device is invalid
 */
export function calculateYawFromChestYaw(chest: Device | undefined): number | null {
  if (!chest || !chest.quat) {
    return null;
  }

  // Check if quaternion is not identity (identity = [0, 0, 0, 1])
  const isIdentity = Math.abs(chest.quat[0]) < 0.001 && 
                     Math.abs(chest.quat[1]) < 0.001 && 
                     Math.abs(chest.quat[2]) < 0.001 && 
                     Math.abs(chest.quat[3] - 1.0) < 0.001;
  
  if (isIdentity) {
    return null;
  }

  // Extract yaw directly from quaternion using eulerXYZ
  // eulerXYZ returns [yaw, roll, pitch] in radians
  const [yawRad] = eulerXYZ(chest.quat);
  
  return yawRad;
}

