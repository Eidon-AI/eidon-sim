import { DeviceRole } from '../core/constants';
import { EidonDevice } from './EidonTrackerManager';
import { ChildDeviceConnectionManager, ChildDeviceState } from './ChildDeviceConnectionManager';

/**
 * Represents a connected device in the connection state
 */
export interface ConnectedDevice {
  deviceId: string;
  name: string;
  role: DeviceRole;
  lastDataUpdate: number;
  color?: string;
  isChild: boolean; // true for hand/forearm, false for hubs/chest
}

/**
 * Device Connection State Manager
 * 
 * Manages the state of connected devices (both primary and child devices).
 * Provides reactive updates when device count changes.
 * 
 * Similar to Flutter's DeviceConnectionState pattern:
 * - Tracks connected devices in an array
 * - Provides totalConnectedDevices getter
 * - Supports bulk updates from tracker manager
 * - Supports individual device add/remove for child devices
 */
export class DeviceConnectionStateManager extends EventTarget {
  private connectedDevices: ConnectedDevice[] = [];

  constructor() {
    super();
  }

  /**
   * Get total number of connected devices
   * Computed from connectedDevices.length (similar to Flutter's getter)
   */
  get totalConnectedDevices(): number {
    return this.connectedDevices.length;
  }

  /**
   * Get all connected devices
   */
  getConnectedDevices(): ConnectedDevice[] {
    return [...this.connectedDevices];
  }

  /**
   * Bulk update connected devices from tracker manager
   * Called when tracker manager's device list changes
   * 
   * Filters out child devices (hand/forearm) - those are tracked individually
   * Only includes primary devices (hubs/chest)
   */
  updateConnectedDevices(connectedTrackers: EidonDevice[]): void {
    // Filter to only primary devices (hubs/chest), exclude child devices
    const primaryDevices = connectedTrackers.filter(device => 
      !device.parentHub && device.isConnected
    );

    // Convert EidonDevice to ConnectedDevice
    const connectedDevices = primaryDevices.map(tracker => {
      const device: ConnectedDevice = {
        deviceId: tracker.id,
        name: tracker.name,
        role: tracker.role,
        lastDataUpdate: tracker.lastSeen || performance.now(),
        color: tracker.color,
        isChild: false
      };
      return device;
    }).filter((device): device is ConnectedDevice => device !== null);

    // Update state
    this.connectedDevices = [
      ...connectedDevices,
      // Keep existing child devices (they're managed separately)
      ...this.connectedDevices.filter(d => d.isChild)
    ];

    // Dispatch update event
    this.dispatchEvent(new CustomEvent('connectionStateChanged', {
      detail: { totalConnectedDevices: this.totalConnectedDevices }
    }));
  }

  /**
   * Add a device to the connection state
   * Used for individual device additions (especially child devices)
   */
  addDevice(device: ConnectedDevice): void {
    // Remove existing device with same ID if exists
    this.connectedDevices = this.connectedDevices.filter(
      d => d.deviceId !== device.deviceId
    );

    // Add new device
    this.connectedDevices.push(device);

    // Dispatch update event
    this.dispatchEvent(new CustomEvent('connectionStateChanged', {
      detail: { totalConnectedDevices: this.totalConnectedDevices }
    }));
  }

  /**
   * Add device with color from profile data
   * Convenience method for adding devices with color
   */
  addDeviceWithColor(
    deviceId: string,
    name: string,
    role: DeviceRole,
    color: string | undefined,
    isChild: boolean = false
  ): void {
    const device: ConnectedDevice = {
      deviceId,
      name,
      role,
      lastDataUpdate: performance.now(),
      color,
      isChild
    };
    this.addDevice(device);
  }

  /**
   * Remove a device from the connection state
   */
  removeDevice(deviceId: string): void {
    const wasPresent = this.connectedDevices.some(d => d.deviceId === deviceId);
    
    if (!wasPresent) {
      return; // Device not in list, no change needed
    }

    // Remove device
    this.connectedDevices = this.connectedDevices.filter(
      d => d.deviceId !== deviceId
    );

    // Dispatch update event
    this.dispatchEvent(new CustomEvent('connectionStateChanged', {
      detail: { totalConnectedDevices: this.totalConnectedDevices }
    }));
  }

  /**
   * Get connection state for a specific device
   */
  getDevice(deviceId: string): ConnectedDevice | undefined {
    return this.connectedDevices.find(d => d.deviceId === deviceId);
  }

  /**
   * Check if a device is connected
   */
  isDeviceConnected(deviceId: string): boolean {
    return this.connectedDevices.some(d => d.deviceId === deviceId);
  }

  /**
   * Clear all devices (for cleanup)
   */
  clear(): void {
    this.connectedDevices = [];
    this.dispatchEvent(new CustomEvent('connectionStateChanged', {
      detail: { totalConnectedDevices: 0 }
    }));
  }
}

