/**
 * Child Device Connection Manager
 * 
 * Manages connection state for child devices (hand/forearm) that connect via hubs.
 * Implements disconnection detection using inactivity timeout, error handling, and stream completion.
 * 
 * Based on Flutter app's DeviceDisconnectionService logic:
 * - 1 second inactivity timeout
 * - Stream error handling
 * - Stream completion detection
 * - Initial data check
 * - Reconnection requires 3 consecutive packets
 */

export type ChildDeviceId = string;
export type ChildDeviceType = 'hand' | 'forearm';
export type ChildDeviceRole = 'left_hand' | 'right_hand' | 'left_forearm' | 'right_forearm';

export interface ChildDeviceState {
  id: ChildDeviceId;
  type: ChildDeviceType;
  role: ChildDeviceRole;
  parentHubId: string;
  isConnected: boolean;
  lastPacketTime: number;
  inactivityTimer?: number;
  consecutivePackets: number;
  subscriptionKey: string;
}

export class ChildDeviceConnectionManager extends EventTarget {
  private static readonly CHILD_DISCONNECTION_TIMEOUT = 1000; // 1 second in milliseconds
  private static readonly REQUIRED_CONSECUTIVE_PACKETS = 3; // Packets required for reconnection

  private childDevices = new Map<ChildDeviceId, ChildDeviceState>();
  private inactivityTimers = new Map<ChildDeviceId, number>();

  /**
   * Register a child device and start monitoring its connection state
   */
  registerChildDevice(
    childId: ChildDeviceId,
    type: ChildDeviceType,
    role: ChildDeviceRole,
    parentHubId: string,
    subscriptionKey: string
  ): void {
    // Remove existing state if any
    this.unregisterChildDevice(childId);

    const state: ChildDeviceState = {
      id: childId,
      type,
      role,
      parentHubId,
      isConnected: false, // Start as disconnected until we receive data
      lastPacketTime: 0,
      consecutivePackets: 0,
      subscriptionKey
    };

    this.childDevices.set(childId, state);

    // Set initial data check timer - if no data arrives within timeout, mark as disconnected
    const initialCheckTimer = window.setTimeout(() => {
      const currentState = this.childDevices.get(childId);
      if (currentState && currentState.lastPacketTime === 0) {
        // No data received within initial timeout
        this.handleDisconnection(childId);
      }
    }, ChildDeviceConnectionManager.CHILD_DISCONNECTION_TIMEOUT);

    this.inactivityTimers.set(childId, initialCheckTimer);

    console.log(`[ChildDeviceConnectionManager] Registered child device: ${childId} (${type}, ${role}) for hub ${parentHubId}`);
  }

  /**
   * Unregister a child device and clean up timers
   */
  unregisterChildDevice(childId: ChildDeviceId): void {
    this.clearInactivityTimer(childId);
    this.childDevices.delete(childId);
    console.log(`[ChildDeviceConnectionManager] Unregistered child device: ${childId}`);
  }

  /**
   * Unregister all child devices for a specific hub
   */
  unregisterChildDevicesForHub(hubId: string): void {
    const childDevicesToRemove: ChildDeviceId[] = [];
    
    this.childDevices.forEach((state, childId) => {
      if (state.parentHubId === hubId) {
        childDevicesToRemove.push(childId);
      }
    });

    childDevicesToRemove.forEach(childId => {
      this.unregisterChildDevice(childId);
    });
  }

  /**
   * Handle incoming data packet for a child device
   */
  handlePacket(childId: ChildDeviceId): void {
    const state = this.childDevices.get(childId);
    if (!state) {
      console.warn(`[ChildDeviceConnectionManager] Received packet for unregistered child device: ${childId}`);
      return;
    }

    const now = performance.now();
    const wasConnected = state.isConnected;

    // Reset inactivity timer
    this.resetInactivityTimer(childId);

    // Update last packet time
    state.lastPacketTime = now;

    // Increment consecutive packet counter
    state.consecutivePackets++;

    // Check if we should mark as connected (reconnection)
    if (!wasConnected && state.consecutivePackets >= ChildDeviceConnectionManager.REQUIRED_CONSECUTIVE_PACKETS) {
      state.isConnected = true;
      state.consecutivePackets = 0; // Reset counter after successful reconnection
      this.dispatchEvent(new CustomEvent('childDeviceConnected', {
        detail: { childId, state }
      }));
      console.log(`[ChildDeviceConnectionManager] Child device reconnected: ${childId} (received ${ChildDeviceConnectionManager.REQUIRED_CONSECUTIVE_PACKETS} consecutive packets)`);
    } else if (!wasConnected) {
      // Not yet reconnected, but we're getting packets
      console.log(`[ChildDeviceConnectionManager] Child device receiving packets: ${childId} (${state.consecutivePackets}/${ChildDeviceConnectionManager.REQUIRED_CONSECUTIVE_PACKETS} consecutive)`);
    }
  }

  /**
   * Handle disconnection - called by inactivity timer, error handler, or stream completion
   */
  handleDisconnection(childId: ChildDeviceId): void {
    const state = this.childDevices.get(childId);
    if (!state) {
      return;
    }

    if (state.isConnected) {
      state.isConnected = false;
      state.consecutivePackets = 0; // Reset counter on disconnection
      this.dispatchEvent(new CustomEvent('childDeviceDisconnected', {
        detail: { childId, state }
      }));
      console.log(`[ChildDeviceConnectionManager] Child device disconnected: ${childId}`);
    }

    // Clear inactivity timer (will be reset on next packet)
    this.clearInactivityTimer(childId);
  }

  /**
   * Handle stream error - triggers immediate disconnection
   */
  handleStreamError(childId: ChildDeviceId, error: Error): void {
    console.error(`[ChildDeviceConnectionManager] Stream error for child device ${childId}:`, error);
    this.handleDisconnection(childId);
  }

  /**
   * Handle stream completion - triggers immediate disconnection
   */
  handleStreamDone(childId: ChildDeviceId): void {
    console.log(`[ChildDeviceConnectionManager] Stream done for child device: ${childId}`);
    this.handleDisconnection(childId);
  }

  /**
   * Reset inactivity timer for a child device
   */
  private resetInactivityTimer(childId: ChildDeviceId): void {
    this.clearInactivityTimer(childId);

    const timer = window.setTimeout(() => {
      // Inactivity timeout - mark as disconnected
      this.handleDisconnection(childId);
    }, ChildDeviceConnectionManager.CHILD_DISCONNECTION_TIMEOUT);

    this.inactivityTimers.set(childId, timer);
  }

  /**
   * Clear inactivity timer for a child device
   */
  private clearInactivityTimer(childId: ChildDeviceId): void {
    const timer = this.inactivityTimers.get(childId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.inactivityTimers.delete(childId);
    }
  }

  /**
   * Get connection state for a child device
   */
  getChildDeviceState(childId: ChildDeviceId): ChildDeviceState | undefined {
    return this.childDevices.get(childId);
  }

  /**
   * Check if a child device is connected
   */
  isChildDeviceConnected(childId: ChildDeviceId): boolean {
    const state = this.childDevices.get(childId);
    return state?.isConnected ?? false;
  }

  /**
   * Get all child devices for a specific hub
   */
  getChildDevicesForHub(hubId: string): ChildDeviceState[] {
    const children: ChildDeviceState[] = [];
    this.childDevices.forEach(state => {
      if (state.parentHubId === hubId) {
        children.push(state);
      }
    });
    return children;
  }

  /**
   * Clean up all timers and state
   */
  destroy(): void {
    // Clear all timers
    this.inactivityTimers.forEach((timer) => {
      window.clearTimeout(timer);
    });
    this.inactivityTimers.clear();
    this.childDevices.clear();
    console.log('[ChildDeviceConnectionManager] Destroyed');
  }
}

