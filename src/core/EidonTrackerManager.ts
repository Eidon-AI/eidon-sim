import {
  EIDON_SERVICE_UUID,
  QUATERNION_CHAR_UUID,
  HAND_QUATERNION_CHAR_UUID,
  FOREARM_QUATERNION_CHAR_UUID,
  DEVICE_INFO_CHAR_UUID,
  CALIBRATION_CHAR_UUID,
  FINGER_SENSOR_CHAR_UUID,
  ROLE_CONFIG_SERVICE_UUID,
  ROLE_CONFIG_CHAR_UUID,
  HUB_RAW_DATA_CHAR_UUID,
  HAND_RAW_DATA_CHAR_UUID,
  FOREARM_RAW_DATA_CHAR_UUID,
  DeviceRole,
  DEVICE_ROLE_NAMES
} from './constants';
import { checkAndSyncVersion } from './DeviceVersionSync';
import { parseRawMotionData } from './rawMotionDataParser';

// Types for child devices (no longer using ChildDeviceConnectionManager)
export type ChildDeviceId = string;
export type ChildDeviceType = 'hand' | 'forearm';
export type ChildDeviceRole = 'left_hand' | 'right_hand' | 'left_forearm' | 'right_forearm';

export type DeviceId = string;

export interface RawMotionData {
  accelerometer: { x: number; y: number; z: number }; // m/s²
  gyroscope: { x: number; y: number; z: number }; // rad/s
  magnetometer: { x: number; y: number; z: number }; // µT
  timestamp: number;
}

export interface EidonDevice {
  id: DeviceId;
  name: string;
  role: DeviceRole;
  macAddress: string;
  connectionId: string;
  isConnected: boolean;
  isHub: boolean;
  parentHub?: string; // For child devices
  batteryLevel?: number;
  firmwareVersion?: string;
  color?: string;
  lastSeen: number;
}

export interface DeviceConnectionState {
  device: EidonDevice;
  bluetoothDevice?: BluetoothDevice;
  gattServer?: BluetoothRemoteGATTServer;
  services: Map<string, BluetoothRemoteGATTService>;
  characteristics: Map<string, BluetoothRemoteGATTCharacteristic>;
  isConnecting: boolean;
  connectionAttempts: number;
}

export class EidonTrackerManager extends EventTarget {
  private devices = new Map<DeviceId, EidonDevice>();
  private connectionStates = new Map<DeviceId, DeviceConnectionState>();
  private isScanning = false;
  
  // Raw data streams - keyed by deviceId
  private hubRawDataStreams = new Map<DeviceId, ReadableStream<RawMotionData>>();
  private handRawDataStreams = new Map<DeviceId, ReadableStream<RawMotionData>>();
  private forearmRawDataStreams = new Map<DeviceId, ReadableStream<RawMotionData>>();
  
  // Stream controllers for raw data
  private hubRawDataControllers = new Map<DeviceId, ReadableStreamDefaultController<RawMotionData>>();
  private handRawDataControllers = new Map<DeviceId, ReadableStreamDefaultController<RawMotionData>>();
  private forearmRawDataControllers = new Map<DeviceId, ReadableStreamDefaultController<RawMotionData>>();
  private scanAbortController?: AbortController;

  constructor() {
    super();
    this.autoReconnect();
  }

  /* ---------------- Public API ---------------- */

  /**
   * Start BLE device discovery
   * 
   * Scans for Eidon Bluetooth devices using Web Bluetooth API.
   * 
   * Filtering logic (matching Flutter app):
   * - Name contains 'eidon', 'tracker', or '6FDF' (case insensitive)
   * - Checks already connected devices first
   * - Uses name-based filtering as primary method (devices may not advertise service UUID in scan)
   * 
   * Standard Web Bluetooth flow: Shows browser popup for user to select a device.
   */
  async startDiscovery(): Promise<EidonDevice[]> {
    // If discovery is already in progress, cancel it first
    if (this.isScanning) {
      console.log('[EidonTrackerManager] Discovery already in progress, cancelling and starting new discovery');
      this.stopDiscovery();
    }

    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth) {
      throw new Error('Bluetooth not supported in this browser');
    }

    this.isScanning = true;

    const discoveredDevices: EidonDevice[] = [];

    try {
      // Start device scanning with name-based filters
      const bluetoothDevice = await this.scanForDevicesWithNameFilter(bluetooth);
      
      if (bluetoothDevice) {
        const device = await this.processScannedDevice(bluetoothDevice);
        if (device) {
          discoveredDevices.push(device);
          
          // Automatically connect immediately after discovery/pairing
          // This will show the connection popup back-to-back with the pairing popup
          // Both happen within the same user gesture (Scan button click)
          // Pass the bluetoothDevice directly to avoid needing to call requestDevice() again
          try {
            const connected = await this.connectToDeviceWithBluetoothDevice(device.id, bluetoothDevice);
            if (connected) {
              device.isConnected = true;
            } else {
              console.warn(`[EidonTrackerManager] Auto-connection failed for ${device.name}`);
            }
          } catch (connectError) {
            console.error(`[EidonTrackerManager] Auto-connection error for ${device.name}:`, connectError);
            // Don't fail discovery if connection fails - device is still discovered
          }
        }
      }
      this.dispatchEvent(new CustomEvent('devicesDiscovered', { detail: discoveredDevices }));
      return discoveredDevices;
    } catch (error) {
      this.isScanning = false;
      console.error('[EidonTrackerManager] Device discovery failed:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotFoundError') {
          console.log('[EidonTrackerManager] User cancelled device selection');
          return []; // Not an error - user just cancelled
        }
        if (error.name === 'SecurityError') {
          console.error('[EidonTrackerManager] Security error - ensure page is served over HTTPS');
        }
      }
      
      this.dispatchEvent(new CustomEvent('discoveryError', { detail: error }));
      throw error; // Re-throw so caller can handle it
    }
  }



  /**
   * Check if device is likely an Eidon device based on name patterns (matching Flutter logic)
   */
  private isLikelyEidonDevice(deviceName: string, rawName: string): boolean {
    const nameLower = deviceName.toLowerCase();
    const rawNameLower = rawName.toLowerCase();
    
    return nameLower.includes('eidon') ||
           nameLower.includes('tracker') ||
           nameLower.includes('6fdf') ||
           rawNameLower.includes('eidon') ||
           rawNameLower.includes('tracker') ||
           rawNameLower.includes('6fdf');
  }

  /**
   * Get device name (matching Flutter _getDeviceName logic)
   */
  private getDeviceName(bluetoothDevice: any): string {
    return (bluetoothDevice.name || '').trim();
  }

  /**
   * Scan for devices using strict Eidon filtering
   * Uses name-based OR UUID filters simultaneously
   * Filters: Service UUID OR name prefix "Eidon"/"eidon"/"EIDON"
   * Name check: If "Eidon" not in name, device is rejected
   */
  private async scanForDevicesWithNameFilter(bluetooth: any): Promise<any | null> {
    try {
      // Use both filters simultaneously (OR logic - matches either name OR service UUID)
      const device = await bluetooth.requestDevice({
        filters: [
          // Service UUID filter
          { services: [EIDON_SERVICE_UUID] },
          // Name prefix filters (OR logic - any of these)
          { namePrefix: 'Eidon' },
          { namePrefix: 'eidon' },
          { namePrefix: 'EIDON' }
        ],
        optionalServices: [
          EIDON_SERVICE_UUID,
          ROLE_CONFIG_SERVICE_UUID
        ]
      });
      
      // Check name first - if "Eidon" not in name, skip/reject
      const deviceName = (device.name || '').trim();
      const deviceNameLower = deviceName.toLowerCase();
      
      if (!deviceNameLower.includes('eidon')) {
        console.warn(`[EidonTrackerManager] Device "${deviceName}" does not contain "Eidon" in name - rejecting`);
        // Return null to reject the device
        return null;
      }
      
      return device;
      
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        // User cancelled or no devices found
        return null;
      }
      throw error;
    }
  }

  /**
   * Add a device to trackerManager from a paired BluetoothDevice (from getDevices())
   * This allows pre-registering saved devices that are already paired
   * @param bluetoothDevice - The paired Bluetooth device
   * @returns The EidonDevice if successfully added, null otherwise
   */
  public async addDeviceFromPairedBluetoothDevice(bluetoothDevice: any): Promise<EidonDevice | null> {
    // Use processScannedDevice with skipNameCheck=true since this is a paired/trusted device
    return this.processScannedDevice(bluetoothDevice, true);
  }

  /**
   * Process a scanned Bluetooth device and create EidonDevice entry
   * @param bluetoothDevice - The Bluetooth device to process
   * @param skipNameCheck - If true, skip the Eidon name check (for paired devices that may have been verified already)
   */
  private async processScannedDevice(bluetoothDevice: any, skipNameCheck: boolean = false): Promise<EidonDevice | null> {
    // First verify it's an Eidon device by name (unless skipNameCheck is true)
    if (!skipNameCheck) {
      const deviceName = this.getDeviceName(bluetoothDevice);
      const rawName = (bluetoothDevice.name || '').trim();
      
      if (!this.isLikelyEidonDevice(deviceName, rawName)) {
        console.warn(`[EidonTrackerManager] Rejecting non-Eidon device: "${deviceName}"`);
        return null;
      }
    }

    // Check if device is already known
    const existingDevice = this.findDeviceByBluetoothDevice(bluetoothDevice);
    if (existingDevice) {
      console.log(`[EidonTrackerManager] Device already known: ${existingDevice.name}`);
      return existingDevice;
    }

    // Create new device entry
    const device = await this.createDeviceFromBluetoothDevice(bluetoothDevice);
    if (device) {
      this.devices.set(device.id, device);
      
      // Verify device has our services (matching Flutter verifyConnectedDevice)
      // Don't fail if verification fails - paired devices might not be connected yet
      await this.verifyDeviceServices(device, bluetoothDevice).catch(err => {
        console.warn(`[EidonTrackerManager] Service verification failed for ${device.name} (this is OK for paired but disconnected devices):`, err);
      });
      
      return device;
    }
    
    return null;
  }

  /**
   * Verify device has required services (matching Flutter verifyConnectedDevice)
   */
  private async verifyDeviceServices(device: EidonDevice, bluetoothDevice: any): Promise<void> {
    try {
      if (!bluetoothDevice.gatt) {
        // For paired devices from getDevices(), gatt might not be available immediately
        // This is fine - we'll verify on actual connection
        return;
      }

      const gattServer = await bluetoothDevice.gatt.connect();
      const services = await gattServer.getPrimaryServices();
      const serviceUuids = services.map((s: any) => s.uuid);
      
      const hasEidonService = serviceUuids.includes(EIDON_SERVICE_UUID.toLowerCase());
      if (!hasEidonService) {
        console.warn(`[EidonTrackerManager] Device ${device.name} does not have required Eidon service!`);
      }
      
      gattServer.disconnect();
    } catch (error) {
      // Don't fail device creation if service verification fails - just log a warning
      // This is especially important for paired devices that might not be connected yet
      console.warn(`[EidonTrackerManager] Could not verify services for ${device.name}:`, error);
    }
  }

  /**
   * Stop BLE device discovery
   */
  stopDiscovery(): void {
    if (this.scanAbortController) {
      this.scanAbortController.abort();
      this.scanAbortController = undefined;
    }
    this.isScanning = false;
    
    // Dispatch event to notify that discovery was cancelled
    this.dispatchEvent(new CustomEvent('discoveryCancelled'));
  }

  /**
   * Connect to a specific device
   */
  async connectToDevice(deviceId: DeviceId): Promise<boolean> {
    return this.connectToDeviceWithBluetoothDevice(deviceId, undefined);
  }

  /**
   * Find device in trackerManager by connectionId (Bluetooth device identifier)
   * @param connectionId - The Bluetooth device connectionId
   * @returns The EidonDevice if found, undefined otherwise
   */
  getDeviceByConnectionId(connectionId: string): EidonDevice | undefined {
    const allDevices = this.getAllDevices();
    return allDevices.find(d => 
      d.connectionId === connectionId || 
      d.macAddress === connectionId
    );
  }

  /**
   * Register a device by discovering it via name, then registering it in trackerManager
   * Also stores the BluetoothDevice in connectionState for immediate connection
   * @param deviceName - The name of the device to discover
   * @param expectedConnectionId - The expected connectionId to verify we got the right device
   * @returns The registered EidonDevice if successful, null otherwise
   */
  async registerDeviceByName(deviceName: string, expectedConnectionId?: string): Promise<EidonDevice | null> {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth) {
      throw new Error('Bluetooth not supported in this browser');
    }

    try {
      // Discover device by name
      const bluetoothDevice = await bluetooth.requestDevice({
        filters: [
          { services: [EIDON_SERVICE_UUID] },
          { name: deviceName.trim() }
        ],
        optionalServices: [
          EIDON_SERVICE_UUID,
          ROLE_CONFIG_SERVICE_UUID
        ]
      });

      // Verify it's the right device
      const deviceNameLower = (bluetoothDevice.name || '').trim().toLowerCase();
      const expectedNameLower = deviceName.trim().toLowerCase();
      
      if (deviceNameLower !== expectedNameLower && !deviceNameLower.includes('eidon')) {
        console.warn(`[EidonTrackerManager] Device name mismatch: expected "${deviceName}", got "${bluetoothDevice.name}"`);
        return null;
      }

      // Verify connectionId if provided
      if (expectedConnectionId && bluetoothDevice.id !== expectedConnectionId) {
        console.warn(`[EidonTrackerManager] ConnectionId mismatch: expected ${expectedConnectionId}, got ${bluetoothDevice.id}`);
        // Still proceed - the user selected it, so it might be correct
      }

      // Register the device in trackerManager
      const device = await this.processScannedDevice(bluetoothDevice, true);
      
      if (!device) {
        console.error(`[EidonTrackerManager] Failed to register device: ${bluetoothDevice.name}`);
        return null;
      }

      // Store the BluetoothDevice in connectionState so it can be reused for connection
      // without requiring another user gesture
      let connectionState = this.connectionStates.get(device.id);
      if (!connectionState) {
        connectionState = {
          device,
          isConnecting: false,
          connectionAttempts: 0,
          services: new Map(),
          characteristics: new Map()
        };
        this.connectionStates.set(device.id, connectionState);
      }
      connectionState.bluetoothDevice = bluetoothDevice;

      return device;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        console.log(`[EidonTrackerManager] User cancelled device selection for "${deviceName}"`);
        return null;
      }
      console.error(`[EidonTrackerManager] Failed to register device by name "${deviceName}":`, error);
      throw error;
    }
  }

  /**
   * Connect to a device by connectionId (Bluetooth device identifier)
   * First checks if device exists in trackerManager, if not returns null
   * @param connectionId - The Bluetooth device connectionId
   * @returns The connected EidonDevice if successful, null otherwise
   */
  async connectToDeviceByConnectionId(connectionId: string): Promise<EidonDevice | null> {
    const existingDevice = this.getDeviceByConnectionId(connectionId);
    
    if (!existingDevice) {
      // Device not found - needs to be registered first
      console.log(`[EidonTrackerManager] Device not found by connectionId: ${connectionId}`);
      return null;
    }

    // Device exists, connect to it
    console.log(`[EidonTrackerManager] Found existing device by connectionId: ${existingDevice.name} (${existingDevice.id})`);
    const connected = await this.connectToDevice(existingDevice.id);
    if (connected) {
      return existingDevice;
    }
    return null;
  }

  /**
   * Connect to a device by name using targeted requestDevice() call
   * This discovers, registers, and connects in one operation
   * Used as fallback when connectionId-based connection fails
   * @param deviceName - The name of the device to connect to
   * @param expectedConnectionId - Optional expected connectionId for verification
   * @returns The connected EidonDevice if successful, null otherwise
   */
  async connectToDeviceByName(deviceName: string, expectedConnectionId?: string): Promise<EidonDevice | null> {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth) {
      throw new Error('Bluetooth not supported in this browser');
    }

    try {
      // Use targeted requestDevice with name filter
      const normalizedName = deviceName.trim();
      const bluetoothDevice = await bluetooth.requestDevice({
        filters: [
          { services: [EIDON_SERVICE_UUID] },
          { name: normalizedName }
        ],
        optionalServices: [
          EIDON_SERVICE_UUID,
          ROLE_CONFIG_SERVICE_UUID
        ]
      });

      // Verify it's the right device by name
      const pairedName = (bluetoothDevice.name || '').trim().toLowerCase();
      const targetName = deviceName.trim().toLowerCase();
      
      if (pairedName !== targetName && !pairedName.includes('eidon')) {
        console.warn(`[EidonTrackerManager] Device name mismatch: expected "${deviceName}", got "${bluetoothDevice.name}"`);
        return null;
      }

      // Verify connectionId if provided
      if (expectedConnectionId && bluetoothDevice.id !== expectedConnectionId) {
        console.warn(`[EidonTrackerManager] ConnectionId mismatch: expected ${expectedConnectionId}, got ${bluetoothDevice.id}`);
      }

      // Process the device and add it to trackerManager if not already present
      let device = await this.processScannedDevice(bluetoothDevice, true);
      
      if (!device) {
        console.error(`[EidonTrackerManager] Failed to process device: ${bluetoothDevice.name}`);
        return null;
      }

      // Connect to the device
      const connected = await this.connectToDeviceWithBluetoothDevice(device.id, bluetoothDevice);
      
      if (connected) {
        return device;
      }
      
      return null;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        console.log(`[EidonTrackerManager] User cancelled device selection for "${deviceName}"`);
        return null;
      }
      console.error(`[EidonTrackerManager] Failed to connect to device by name "${deviceName}":`, error);
      throw error;
    }
  }

  /**
   * Connect to a device, optionally using a provided BluetoothDevice (from discovery)
   */
  private async connectToDeviceWithBluetoothDevice(deviceId: DeviceId, bluetoothDevice?: any): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.error('Device not found:', deviceId);
      return false;
    }

    const connectionState = this.connectionStates.get(deviceId);
    
    // If already connected, don't reconnect
    if (device.isConnected) {
      console.log('Device already connected:', deviceId);
      return true;
    }

    // If connection is already in progress, wait a bit and check again
    // This handles the case where auto-connection is still in progress
    if (connectionState?.isConnecting) {
      // Wait a short time and check if it completed
      await new Promise(resolve => setTimeout(resolve, 100));
      if (device.isConnected) {
        return true;
      }
      // If still connecting after wait, allow retry (clear the flag)
      console.log('Clearing stale isConnecting flag for:', deviceId);
      connectionState.isConnecting = false;
    }

    try {
      await this.performConnection(deviceId, bluetoothDevice);
      return true;
    } catch (error) {
      console.error('Connection failed for device:', deviceId, error);
      // Ensure flag is cleared on error
      const state = this.connectionStates.get(deviceId);
      if (state) {
        state.isConnecting = false;
      }
      return false;
    }
  }

  /**
   * Connect to all hub and chest devices
   */
  async connectToAll(): Promise<void> {
    const hubAndChestDevices = Array.from(this.devices.values()).filter(
      device => device.role === DeviceRole.LEFT_HUB || 
                device.role === DeviceRole.RIGHT_HUB || 
                device.role === DeviceRole.CHEST
    );

    const connectionPromises = hubAndChestDevices.map(device => 
      this.connectToDevice(device.id)
    );

    await Promise.allSettled(connectionPromises);
  }

  /**
   * Disconnect from a specific device
   */
  async disconnectDevice(deviceId: DeviceId): Promise<void> {
    // Clean up raw data streams
    this.cleanupRawDataStreams(deviceId);
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      return;
    }

    try {
      // Remove child devices if this is a hub
      const device = this.devices.get(deviceId);
      if (device?.isHub) {
        // Remove child devices from devices map
        const childDevices = Array.from(this.devices.values()).filter(
          d => d.parentHub === deviceId
        );
        for (const child of childDevices) {
          // Dispatch disconnection event for each child
          this.dispatchEvent(new CustomEvent('deviceDisconnected', { detail: { deviceId: child.id } }));
          // Remove from devices map
          this.devices.delete(child.id);
          this.connectionStates.delete(child.id);
        }
      }

      // Disconnect the device
      if (connectionState.gattServer?.connected) {
        connectionState.gattServer.disconnect();
      }

      // Update device state
      const deviceState = this.devices.get(deviceId);
      if (deviceState) {
        deviceState.isConnected = false;
        this.devices.set(deviceId, deviceState);
      }

      // Clean up connection state
      this.connectionStates.delete(deviceId);

      this.dispatchEvent(new CustomEvent('deviceDisconnected', { detail: { deviceId } }));
    } catch (error) {
      console.error('Disconnect failed for device:', deviceId, error);
    }
  }

  /**
   * Disconnect from all devices
   */
  async disconnectAll(): Promise<void> {
    const connectedDevices = Array.from(this.devices.values()).filter(d => d.isConnected);
    const disconnectPromises = connectedDevices.map(device => 
      this.disconnectDevice(device.id)
    );

    await Promise.allSettled(disconnectPromises);
  }

  /**
   * Send calibration command to a device by connectionId
   */
  async calibrateDevice(connectionId: string): Promise<void> {
    // Find device by connectionId
    const device = this.getDeviceByConnectionId(connectionId);
    if (!device) {
      console.error('Device not found for calibration by connectionId:', connectionId);
      return;
    }

    const connectionState = this.connectionStates.get(device.id);
    if (!connectionState?.device?.isConnected) {
      console.error('Device not connected for calibration:', connectionId);
      return;
    }

    const calibrationChar = connectionState.characteristics.get(CALIBRATION_CHAR_UUID);
    if (!calibrationChar) {
      console.error('Calibration characteristic not found for device:', connectionId);
      return;
    }

    try {
      // Send calibration command (0x01)
      const calibrationData = new Uint8Array([0x01]);
      await calibrationChar.writeValue(calibrationData);
      console.log('Calibration command sent to device:', connectionId);
    } catch (error) {
      console.error('Calibration failed for device:', connectionId, error);
    }
  }


  /**
   * Get all devices
   */
  getAllDevices(): EidonDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): EidonDevice[] {
    return Array.from(this.devices.values()).filter(d => d.isConnected);
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: DeviceId): EidonDevice | undefined {
    return this.devices.get(deviceId);
  }

  /* ---------------- Private Methods ---------------- */


  private async createDeviceFromBluetoothDevice(bluetoothDevice: BluetoothDevice): Promise<EidonDevice | null> {
    try {
      // Extract device information from manufacturer data
      const manufacturerData = this.extractManufacturerData(bluetoothDevice);
      const role = manufacturerData?.role ?? DeviceRole.UNKNOWN;
      const macAddress = this.extractMacAddress(bluetoothDevice);

      const device: EidonDevice = {
        id: macAddress || bluetoothDevice.id,
        name: bluetoothDevice.name || `Eidon ${DEVICE_ROLE_NAMES[role]}`,
        role,
        macAddress: macAddress || bluetoothDevice.id,
        connectionId: bluetoothDevice.id,
        isConnected: false,
        isHub: role === DeviceRole.LEFT_HUB || role === DeviceRole.RIGHT_HUB || role === DeviceRole.CHEST,
        lastSeen: performance.now()
      };

      return device;
    } catch (error) {
      console.error('[EidonTrackerManager] Failed to create device from Bluetooth device:', error);
      return null;
    }
  }

  private extractManufacturerData(bluetoothDevice: BluetoothDevice): { role: DeviceRole } | null {
    // This would need to be implemented based on the actual manufacturer data structure
    // For now, return a default role
    return { role: DeviceRole.UNKNOWN };
  }

  private extractMacAddress(bluetoothDevice: BluetoothDevice): string | null {
    // Extract MAC address from device information
    // This would need to be implemented based on the actual device structure
    return bluetoothDevice.id;
  }

  private findDeviceByBluetoothDevice(bluetoothDevice: BluetoothDevice): EidonDevice | null {
    return Array.from(this.devices.values()).find(
      device => device.connectionId === bluetoothDevice.id
    ) || null;
  }

  /**
   * Connect to GATT server with retry logic to handle transient disconnections
   */
  private async connectGattWithRetry(bluetoothDevice: any, maxRetries: number = 3): Promise<BluetoothRemoteGATTServer> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // If GATT is already connected, verify it's still connected
        if (bluetoothDevice.gatt?.connected) {
          // Small delay to ensure connection is stable
          await new Promise(resolve => setTimeout(resolve, 100));
          if (bluetoothDevice.gatt.connected) {
            return bluetoothDevice.gatt;
          }
        }

        // Connect to GATT server
        const gattServer = await bluetoothDevice.gatt!.connect();
        
        // Verify connection is actually established
        if (!gattServer.connected) {
          throw new Error('GATT server connect() returned but server is not connected');
        }

        // Small delay to ensure connection is stable before returning
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify again after delay
        if (!gattServer.connected) {
          throw new Error('GATT server disconnected immediately after connection');
        }

        return gattServer;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, attempt * 200));
        }
      }
    }
    
    // Only warn if all retries failed
    if (lastError) {
      console.warn(`[EidonTrackerManager] Failed to connect to GATT server after ${maxRetries} attempts:`, lastError.message);
    }
    throw lastError || new Error('Failed to connect to GATT server after retries');
  }

  /**
   * Ensure GATT server is connected, reconnect if necessary
   */
  private async ensureGattConnected(gattServer: BluetoothRemoteGATTServer, bluetoothDevice: any): Promise<BluetoothRemoteGATTServer> {
    if (gattServer.connected) {
      return gattServer;
    }

    console.log('[EidonTrackerManager] GATT server disconnected, reconnecting...');
    return await this.connectGattWithRetry(bluetoothDevice);
  }

  private async performConnection(deviceId: DeviceId, providedBluetoothDevice?: any): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    // Get or create connection state
    let connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      connectionState = {
        device,
        isConnecting: true,
        connectionAttempts: 0,
        services: new Map(),
        characteristics: new Map()
      };
      this.connectionStates.set(deviceId, connectionState);
    } else {
      connectionState.isConnecting = true;
    }

    try {
      const bluetooth = (navigator as any).bluetooth;
      let bluetoothDevice: any = null;

      // Priority 1: Use provided BluetoothDevice (from discovery, still in user gesture context)
      if (providedBluetoothDevice) {
        bluetoothDevice = providedBluetoothDevice;
      }
      // Priority 2: Check existing connection state
      else if (connectionState.bluetoothDevice) {
        bluetoothDevice = connectionState.bluetoothDevice;
      }
      // Priority 3: Try to get from paired devices (no popup)
      else if (bluetooth && typeof bluetooth.getDevices === 'function') {
        try {
          const pairedDevices = await bluetooth.getDevices();
          bluetoothDevice = pairedDevices.find((d: any) => {
            if (d.id === device.connectionId || d.id === device.macAddress) {
              return true;
            }
            const dName = (d.name || '').trim().toLowerCase();
            const deviceName = (device.name || '').trim().toLowerCase();
            return dName === deviceName && dName.includes('eidon');
          });
          
          if (bluetoothDevice) {
            console.log(`[EidonTrackerManager] Found device ${device.name} in paired devices, reusing without popup`);
            if (bluetoothDevice.id !== device.connectionId) {
              device.connectionId = bluetoothDevice.id;
              this.devices.set(deviceId, device);
            }
          }
        } catch (getDevicesError) {
          console.warn('[EidonTrackerManager] getDevices() failed:', getDevicesError);
        }
      }

      // Priority 4: Request device again (will show popup #2 for connection)
      // This works if we're still in user gesture context (from discovery)
      if (!bluetoothDevice) {
        console.log(`[EidonTrackerManager] Requesting device ${device.name} via popup for connection`);
        bluetoothDevice = await bluetooth.requestDevice({
          filters: [
            { services: [EIDON_SERVICE_UUID] }
          ],
          optionalServices: [
            EIDON_SERVICE_UUID,
            ROLE_CONFIG_SERVICE_UUID
          ]
        });
      }

      connectionState.bluetoothDevice = bluetoothDevice;

      // Connect to GATT server with retry logic
      let gattServer = await this.connectGattWithRetry(bluetoothDevice);
      connectionState.gattServer = gattServer;

      // Verify connection is stable before proceeding
      if (!gattServer.connected) {
        throw new Error('GATT server connection not established');
      }

      // Discover services
      const services = await gattServer.getPrimaryServices();
      for (const service of services) {
        connectionState.services.set(service.uuid, service);
      }

      // Discover characteristics for main service
      const mainService = connectionState.services.get(EIDON_SERVICE_UUID);
      if (mainService) {
        // Ensure connection is still stable before getting characteristics
        gattServer = await this.ensureGattConnected(gattServer, bluetoothDevice);
        connectionState.gattServer = gattServer;
        
        const characteristics = await mainService.getCharacteristics();
        for (const char of characteristics) {
          connectionState.characteristics.set(char.uuid, char);
        }
      }

      // Discover characteristics for role config service (if available)
      const roleConfigService = connectionState.services.get(ROLE_CONFIG_SERVICE_UUID);
      if (roleConfigService) {
        // Ensure connection is still stable before getting characteristics
        gattServer = await this.ensureGattConnected(gattServer, bluetoothDevice);
        connectionState.gattServer = gattServer;
        
        const characteristics = await roleConfigService.getCharacteristics();
        for (const char of characteristics) {
          connectionState.characteristics.set(char.uuid, char);
        }
      }

      // Fetch device info and role from the device
      await this.fetchDeviceInfo(deviceId);

      // Subscribe to quaternion notifications
      await this.subscribeToQuaternionData(deviceId);

      // Subscribe to finger sensor notifications (if glove device)
      if (device.role === DeviceRole.LEFT_GLOVE || device.role === DeviceRole.RIGHT_GLOVE) {
        await this.subscribeToFingerData(deviceId);
      }

      // Update device state
      device.isConnected = true;
      device.lastSeen = performance.now();
      this.devices.set(deviceId, device);

      connectionState.isConnecting = false;

      // If this is a hub, create and subscribe to child devices
      // Only setup if not already set up (check if child devices already exist)
      if (device.isHub && (device.role === DeviceRole.LEFT_HUB || device.role === DeviceRole.RIGHT_HUB)) {
        const existingChildren = Array.from(this.devices.values()).filter(d => d.parentHub === deviceId);
        if (existingChildren.length === 0) {
          await this.setupChildDevicesForHub(deviceId);
        }
      }

      // Subscribe to raw data characteristics for all devices (hub, hand, forearm)
      // Each device will only have the characteristics it supports
      await this.subscribeToRawData(deviceId);

      this.dispatchEvent(new CustomEvent('deviceConnected', { detail: { deviceId, device } }));

    } catch (error) {
      connectionState.isConnecting = false;
      this.connectionStates.delete(deviceId);
      throw error;
    }
  }

  private async subscribeToQuaternionData(deviceId: DeviceId): Promise<void> {
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      return;
    }

    const quaternionChar = connectionState.characteristics.get(QUATERNION_CHAR_UUID);
    if (!quaternionChar) {
      console.warn('Quaternion characteristic not found for device:', deviceId);
      return;
    }

    try {
      await quaternionChar.startNotifications();
      quaternionChar.addEventListener('characteristicvaluechanged', (event) => {
        this.handleQuaternionData(deviceId, event);
      });
    } catch (error) {
      console.error('Failed to subscribe to quaternion data for device:', deviceId, error);
    }
  }

  /**
   * Fetch device information (role, etc.) from the device
   */
  private async fetchDeviceInfo(deviceId: DeviceId): Promise<void> {
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      return;
    }

    const device = this.devices.get(deviceId);
    if (!device) {
      return;
    }

    try {
      // Try to read role from ROLE_CONFIG characteristic
      const roleChar = connectionState.characteristics.get(ROLE_CONFIG_CHAR_UUID);
      if (roleChar) {
        const roleData = await roleChar.readValue();
        const roleValue = roleData.getUint8(0); // Role is typically a single byte

        // Map the role value to DeviceRole enum
        // Valid roles: 0-6 (tracker roles) and 8-9 (glove roles)
        const isValidRole = (roleValue >= 0 && roleValue <= 6) || roleValue === 8 || roleValue === 9;
        if (isValidRole) {
          device.role = roleValue as DeviceRole;

          // Update isHub flag based on role
          device.isHub = device.role === DeviceRole.LEFT_HUB ||
                        device.role === DeviceRole.RIGHT_HUB ||
                        device.role === DeviceRole.CHEST;

          this.devices.set(deviceId, device);

          // Dispatch event so UI can update with the new role
          this.dispatchEvent(new CustomEvent('deviceInfoUpdated', { detail: { deviceId, device } }));
        }
      }

      // Try to read device info from DEVICE_INFO characteristic
      const deviceInfoChar = connectionState.characteristics.get(DEVICE_INFO_CHAR_UUID);
      if (deviceInfoChar) {
        const infoData = await deviceInfoChar.readValue();

        // Parse device info from firmware structure:
        // Bytes 0-1: Device ID
        // Byte 2: Firmware version Major
        // Byte 3: Firmware version Minor
        // Byte 4: Firmware version Patch
        // Byte 5: Battery percentage (0-100)
        // Byte 6: Device role
        // Bytes 7-12: MAC address
        console.log(`[EidonTrackerManager] Device info bytes: ${infoData.byteLength}`,
          Array.from(new Uint8Array(infoData.buffer, infoData.byteOffset, infoData.byteLength)));

        if (infoData.byteLength >= 7) {
          const firmwareMajor = infoData.getUint8(2);
          const firmwareMinor = infoData.getUint8(3);
          const firmwarePatch = infoData.getUint8(4);
          const batteryLevel = infoData.getUint8(5);
          const roleFromInfo = infoData.getUint8(6);

          console.log(`[EidonTrackerManager] Parsed device info - firmware: ${firmwareMajor}.${firmwareMinor}.${firmwarePatch}, battery: ${batteryLevel}%, role: ${roleFromInfo}`);

          device.firmwareVersion = `${firmwareMajor}.${firmwareMinor}.${firmwarePatch}`;
          device.batteryLevel = batteryLevel;

          // Also update role from DEVICE_INFO if valid (backup in case ROLE_CONFIG didn't work)
          const isValidRole = (roleFromInfo >= 0 && roleFromInfo <= 6) || roleFromInfo === 8 || roleFromInfo === 9;
          if (isValidRole && device.role === DeviceRole.UNKNOWN) {
            device.role = roleFromInfo as DeviceRole;
            device.isHub = device.role === DeviceRole.LEFT_HUB ||
                          device.role === DeviceRole.RIGHT_HUB ||
                          device.role === DeviceRole.CHEST;
          }
        } else if (infoData.byteLength >= 6) {
          // Fallback for older firmware that doesn't have patch byte
          const firmwareMajor = infoData.getUint8(2);
          const firmwareMinor = infoData.getUint8(3);
          const batteryLevel = infoData.getUint8(4);
          const roleFromInfo = infoData.getUint8(5);

          console.log(`[EidonTrackerManager] Parsed device info (legacy) - firmware: ${firmwareMajor}.${firmwareMinor}, battery: ${batteryLevel}%, role: ${roleFromInfo}`);

          device.firmwareVersion = `${firmwareMajor}.${firmwareMinor}.0`; // Pad patch as 0 for legacy
          device.batteryLevel = batteryLevel;

          // Also update role from DEVICE_INFO if valid (backup in case ROLE_CONFIG didn't work)
          const isValidRole = (roleFromInfo >= 0 && roleFromInfo <= 6) || roleFromInfo === 8 || roleFromInfo === 9;
          if (isValidRole && device.role === DeviceRole.UNKNOWN) {
            device.role = roleFromInfo as DeviceRole;
            device.isHub = device.role === DeviceRole.LEFT_HUB ||
                          device.role === DeviceRole.RIGHT_HUB ||
                          device.role === DeviceRole.CHEST;
          }

          this.devices.set(deviceId, device);

          // Auto-sync version will be handled by DeviceModal which has access to saved devices

          // Dispatch event for UI update
          this.dispatchEvent(new CustomEvent('deviceInfoUpdated', { detail: { deviceId, device } }));
        }
      } else {
        console.log(`[EidonTrackerManager] DEVICE_INFO characteristic not found`);
      }
    } catch (error) {
      console.warn(`[EidonTrackerManager] Failed to fetch device info for ${device.name}:`, error);
      // Don't fail connection if info fetch fails
    }
  }

  private handleQuaternionData(deviceId: DeviceId, event: Event): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const data = characteristic.value;

    if (!data) {
      return;
    }

    // Parse quaternion data (16 bytes: 4 floats)
    // Byte order: Bytes 0-3: w, Bytes 4-7: x, Bytes 8-11: y, Bytes 12-15: z
    // Float32Array will read as [w, x, y, z] - will be reordered to [x, y, z, w] in App.ts
    const quaternion = new Float32Array(data.buffer, data.byteOffset, 4);

    this.dispatchEvent(new CustomEvent('quaternionData', {
      detail: {
        deviceId,
        quaternion: Array.from(quaternion),
        timestamp: performance.now()
      }
    }));
  }

  private async subscribeToRawData(deviceId: DeviceId): Promise<void> {
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      return;
    }

    // Create streams for raw data
    this.createRawDataStreams(deviceId);

    // Subscribe to hub raw data
    const hubRawDataChar = connectionState.characteristics.get(HUB_RAW_DATA_CHAR_UUID);
    if (hubRawDataChar) {
      try {
        await hubRawDataChar.startNotifications();
        hubRawDataChar.addEventListener('characteristicvaluechanged', (event) => {
          this.handleRawData(deviceId, 'hub', event);
        });
        console.log(`[EidonTrackerManager] Subscribed to hub raw data for ${deviceId}`);
      } catch (error) {
        console.warn(`[EidonTrackerManager] Failed to subscribe to hub raw data:`, error);
      }
    }

    // Subscribe to hand raw data
    const handRawDataChar = connectionState.characteristics.get(HAND_RAW_DATA_CHAR_UUID);
    if (handRawDataChar) {
      try {
        await handRawDataChar.startNotifications();
        handRawDataChar.addEventListener('characteristicvaluechanged', (event) => {
          this.handleRawData(deviceId, 'hand', event);
        });
        console.log(`[EidonTrackerManager] Subscribed to hand raw data for ${deviceId}`);
      } catch (error) {
        console.warn(`[EidonTrackerManager] Failed to subscribe to hand raw data:`, error);
      }
    }

    // Subscribe to forearm raw data
    const forearmRawDataChar = connectionState.characteristics.get(FOREARM_RAW_DATA_CHAR_UUID);
    if (forearmRawDataChar) {
      try {
        await forearmRawDataChar.startNotifications();
        forearmRawDataChar.addEventListener('characteristicvaluechanged', (event) => {
          this.handleRawData(deviceId, 'forearm', event);
        });
        console.log(`[EidonTrackerManager] Subscribed to forearm raw data for ${deviceId}`);
      } catch (error) {
        console.warn(`[EidonTrackerManager] Failed to subscribe to forearm raw data:`, error);
      }
    }
  }

  private createRawDataStreams(deviceId: DeviceId): void {
    // Create hub raw data stream
    if (!this.hubRawDataStreams.has(deviceId)) {
      const hubStream = new ReadableStream<RawMotionData>({
        start: (controller) => {
          this.hubRawDataControllers.set(deviceId, controller);
        }
      });
      this.hubRawDataStreams.set(deviceId, hubStream);
    }

    // Create hand raw data stream
    if (!this.handRawDataStreams.has(deviceId)) {
      const handStream = new ReadableStream<RawMotionData>({
        start: (controller) => {
          this.handRawDataControllers.set(deviceId, controller);
        }
      });
      this.handRawDataStreams.set(deviceId, handStream);
    }

    // Create forearm raw data stream
    if (!this.forearmRawDataStreams.has(deviceId)) {
      const forearmStream = new ReadableStream<RawMotionData>({
        start: (controller) => {
          this.forearmRawDataControllers.set(deviceId, controller);
        }
      });
      this.forearmRawDataStreams.set(deviceId, forearmStream);
    }
  }

  private handleRawData(deviceId: DeviceId, type: 'hub' | 'hand' | 'forearm', event: Event): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const data = characteristic.value;

    if (!data || data.byteLength < 36) {
      console.warn(`[EidonTrackerManager] Invalid raw data: data=${!!data}, byteLength=${data?.byteLength}`);
      return;
    }

    try {
      const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const rawData = parseRawMotionData(dataView, performance.now());

      if (!rawData) {
        console.warn(`[EidonTrackerManager] Failed to parse raw data for ${deviceId}`);
        return;
      }

      // For HUB_RAW_DATA_CHAR_UUID: route to the device's own hub stream
      // - If deviceId is a child device (hand/forearm) connecting directly: route to child device's hub stream
      // - If deviceId is a hub: route to hub's hub stream
      // For HAND_RAW_DATA_CHAR_UUID and FOREARM_RAW_DATA_CHAR_UUID: route directly (only hubs have these)
      // These are used when child devices connect via hub (ESP NOW), and hub reports child data
      
      let targetDeviceId = deviceId;
      let streamType = type;
      
      // Check if this is a child device using HUB_RAW_DATA_CHAR_UUID (direct connection case)
      if (type === 'hub') {
        const device = this.devices.get(deviceId);
        if (device) {
          const isHand = device.role === DeviceRole.LEFT_HAND || device.role === DeviceRole.RIGHT_HAND;
          const isForearm = device.role === DeviceRole.LEFT_FOREARM || device.role === DeviceRole.RIGHT_FOREARM;
          
          if (isHand || isForearm) {
            // Child device connecting directly - using HUB_RAW_DATA_CHAR_UUID for its own data
            // Route to child device's hub stream (DeviceModal will interpret based on device role)
            targetDeviceId = deviceId; // Use child device's ID
            streamType = 'hub'; // Still use 'hub' stream type, but for the child device
          } else {
            // Actual hub device - route to hub's hub stream
            targetDeviceId = deviceId;
            streamType = 'hub';
          }
        }
      }

      // Enqueue to appropriate stream based on characteristic type and device
      const controller = streamType === 'hub' 
        ? this.hubRawDataControllers.get(targetDeviceId)
        : streamType === 'hand'
        ? this.handRawDataControllers.get(targetDeviceId)
        : this.forearmRawDataControllers.get(targetDeviceId);

      if (controller) {
        controller.enqueue(rawData);
      } else {
        console.warn(`[EidonTrackerManager] No ${streamType} stream controller found for ${targetDeviceId}`);
      }
    } catch (error) {
      console.warn(`[EidonTrackerManager] Error handling raw data:`, error);
    }
  }

  // Getters for raw data streams
  getHubRawDataStream(deviceId: DeviceId): ReadableStream<RawMotionData> | undefined {
    return this.hubRawDataStreams.get(deviceId);
  }

  getHandRawDataStream(deviceId: DeviceId): ReadableStream<RawMotionData> | undefined {
    return this.handRawDataStreams.get(deviceId);
  }

  getForearmRawDataStream(deviceId: DeviceId): ReadableStream<RawMotionData> | undefined {
    return this.forearmRawDataStreams.get(deviceId);
  }

  // Checkers for raw data availability
  hasHubRawDataCharacteristic(deviceId: DeviceId): boolean {
    const connectionState = this.connectionStates.get(deviceId);
    return connectionState?.characteristics.has(HUB_RAW_DATA_CHAR_UUID) ?? false;
  }

  hasHandRawDataCharacteristic(deviceId: DeviceId): boolean {
    const connectionState = this.connectionStates.get(deviceId);
    return connectionState?.characteristics.has(HAND_RAW_DATA_CHAR_UUID) ?? false;
  }

  hasForearmRawDataCharacteristic(deviceId: DeviceId): boolean {
    const connectionState = this.connectionStates.get(deviceId);
    return connectionState?.characteristics.has(FOREARM_RAW_DATA_CHAR_UUID) ?? false;
  }

  private cleanupRawDataStreams(deviceId: DeviceId): void {
    // Close and remove hub raw data stream
    const hubController = this.hubRawDataControllers.get(deviceId);
    if (hubController) {
      try {
        hubController.close();
      } catch (error) {
        // Ignore errors on close
      }
      this.hubRawDataControllers.delete(deviceId);
    }
    this.hubRawDataStreams.delete(deviceId);

    // Close and remove hand raw data stream
    const handController = this.handRawDataControllers.get(deviceId);
    if (handController) {
      try {
        handController.close();
      } catch (error) {
        // Ignore errors on close
      }
      this.handRawDataControllers.delete(deviceId);
    }
    this.handRawDataStreams.delete(deviceId);

    // Close and remove forearm raw data stream
    const forearmController = this.forearmRawDataControllers.get(deviceId);
    if (forearmController) {
      try {
        forearmController.close();
      } catch (error) {
        // Ignore errors on close
      }
      this.forearmRawDataControllers.delete(deviceId);
    }
    this.forearmRawDataStreams.delete(deviceId);
  }

  private async subscribeToFingerData(deviceId: DeviceId): Promise<void> {
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      return;
    }

    const fingerChar = connectionState.characteristics.get(FINGER_SENSOR_CHAR_UUID);
    if (!fingerChar) {
      console.warn('Finger sensor characteristic not found for device:', deviceId);
      return;
    }

    try {
      await fingerChar.startNotifications();
      fingerChar.addEventListener('characteristicvaluechanged', (event) => {
        this.handleFingerData(deviceId, event);
      });
      console.log(`[EidonTrackerManager] Subscribed to finger sensor data for ${deviceId}`);
    } catch (error) {
      console.error('Failed to subscribe to finger sensor data for device:', deviceId, error);
    }
  }

  private handleFingerData(deviceId: DeviceId, event: Event): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const data = characteristic.value;

    if (!data) {
      return;
    }

    // Parse finger sensor data (32 bytes: 16 uint16 values)
    // Each uint16 is encoded as: (normalized_value * 2 - 1 + 1) * 32767.5
    // Decode: normalized_value = (uint16 / 32767.5 - 1 + 1) / 2 = uint16 / 65535
    const fingerValues: number[] = [];
    const uint16Array = new Uint16Array(data.buffer, data.byteOffset, 16);

    for (let i = 0; i < 16; i++) {
      // Decode from uint16 back to 0.0-1.0 range
      const normalized = uint16Array[i] / 65535.0;
      fingerValues.push(normalized);
    }

    this.dispatchEvent(new CustomEvent('fingerData', {
      detail: {
        deviceId,
        fingerValues,
        timestamp: performance.now()
      }
    }));
  }


  /**
   * Generate child device ID based on hub ID and device type
   */
  private generateChildDeviceId(hubId: DeviceId, type: ChildDeviceType): ChildDeviceId {
    return `${hubId}_${type}`;
  }

  /**
   * Determine child device role based on hub role and characteristic UUID
   */
  private getChildDeviceRole(hubRole: DeviceRole, characteristicUuid: string): ChildDeviceRole | null {
    const isHand = characteristicUuid.toLowerCase() === HAND_QUATERNION_CHAR_UUID.toLowerCase();
    const isForearm = characteristicUuid.toLowerCase() === FOREARM_QUATERNION_CHAR_UUID.toLowerCase();
    
    if (!isHand && !isForearm) {
      return null;
    }

    if (hubRole === DeviceRole.LEFT_HUB) {
      return isHand ? 'left_hand' : 'left_forearm';
    } else if (hubRole === DeviceRole.RIGHT_HUB) {
      return isHand ? 'right_hand' : 'right_forearm';
    }

    return null;
  }

  /**
   * Map child device role to DeviceRole enum
   */
  private mapChildRoleToDeviceRole(childRole: ChildDeviceRole): DeviceRole {
    switch (childRole) {
      case 'left_hand':
        return DeviceRole.LEFT_HAND;
      case 'right_hand':
        return DeviceRole.RIGHT_HAND;
      case 'left_forearm':
        return DeviceRole.LEFT_FOREARM;
      case 'right_forearm':
        return DeviceRole.RIGHT_FOREARM;
      default:
        return DeviceRole.UNKNOWN;
    }
  }

  /**
   * Create virtual child devices for a hub and subscribe to their characteristics
   */
  private async setupChildDevicesForHub(hubId: DeviceId): Promise<void> {
    const hubDevice = this.devices.get(hubId);
    const connectionState = this.connectionStates.get(hubId);
    
    if (!hubDevice || !connectionState || !hubDevice.isHub) {
      return;
    }

    // Only handle LEFT_HUB and RIGHT_HUB (not CHEST)
    if (hubDevice.role !== DeviceRole.LEFT_HUB && hubDevice.role !== DeviceRole.RIGHT_HUB) {
      return;
    }

    const mainService = connectionState.services.get(EIDON_SERVICE_UUID);
    if (!mainService) {
      console.warn(`[EidonTrackerManager] Cannot setup child devices: main service not found for hub ${hubId}`);
      return;
    }

    // Check if hub has child characteristics
    const handChar = connectionState.characteristics.get(HAND_QUATERNION_CHAR_UUID);
    const forearmChar = connectionState.characteristics.get(FOREARM_QUATERNION_CHAR_UUID);

    if (!handChar && !forearmChar) {
      console.log(`[EidonTrackerManager] Hub ${hubId} does not have child device characteristics - skipping child device setup`);
      return;
    }

    // Create child devices
    const childDevices: Array<{ id: ChildDeviceId; type: ChildDeviceType; role: ChildDeviceRole; char: BluetoothRemoteGATTCharacteristic }> = [];

    if (handChar) {
      const handId = this.generateChildDeviceId(hubId, 'hand');
      const handRole = this.getChildDeviceRole(hubDevice.role, HAND_QUATERNION_CHAR_UUID);
      if (handRole) {
        childDevices.push({ id: handId, type: 'hand', role: handRole, char: handChar });
      }
    }

    if (forearmChar) {
      const forearmId = this.generateChildDeviceId(hubId, 'forearm');
      const forearmRole = this.getChildDeviceRole(hubDevice.role, FOREARM_QUATERNION_CHAR_UUID);
      if (forearmRole) {
        childDevices.push({ id: forearmId, type: 'forearm', role: forearmRole, char: forearmChar });
      }
    }

    // Create EidonDevice entries for each child and subscribe to characteristics
    for (const child of childDevices) {
      const childDevice: EidonDevice = {
        id: child.id,
        name: `${hubDevice.name} ${child.type === 'hand' ? 'Hand' : 'Forearm'}`,
        role: this.mapChildRoleToDeviceRole(child.role),
        macAddress: `${hubDevice.macAddress}_${child.type}`,
        connectionId: hubDevice.connectionId, // Use parent hub's connectionId
        isConnected: true, // Child devices are "connected" when hub is connected
        isHub: false,
        parentHub: hubId,
        color: hubDevice.color, // Inherit color from parent
        lastSeen: performance.now()
      };

      this.devices.set(child.id, childDevice);

      // Dispatch deviceConnected event for child device
      this.dispatchEvent(new CustomEvent('deviceConnected', { detail: { deviceId: child.id, device: childDevice } }));

      // Subscribe to characteristic notifications
      try {
        await child.char.startNotifications();
        
        // Create event handler that routes data to child device ID
        const eventHandler = (event: Event) => {
          try {
            this.handleChildQuaternionData(hubId, child.id, child.type, event);
          } catch (error) {
            console.error(`[EidonTrackerManager] Error in child quaternion event handler for ${child.id}:`, error);
          }
        };
        
        child.char.addEventListener('characteristicvaluechanged', eventHandler);
      } catch (error) {
        console.error(`[EidonTrackerManager] Failed to subscribe to ${child.type} quaternion data for hub ${hubId}:`, error);
      }
    }
  }

  /**
   * Handle quaternion data from child device characteristics
   */
  private handleChildQuaternionData(
    hubId: DeviceId,
    childId: ChildDeviceId,
    childType: ChildDeviceType,
    event: Event
  ): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const data = characteristic.value;
    
    if (!data) {
      return;
    }

    try {
      // Parse quaternion data (16 bytes: 4 floats)
      // Byte order: Bytes 0-3: w, Bytes 4-7: x, Bytes 8-11: y, Bytes 12-15: z
      const quaternion = new Float32Array(data.buffer, data.byteOffset, 4);
      
      // Update child device lastSeen
      const childDevice = this.devices.get(childId);
      if (childDevice) {
        childDevice.lastSeen = performance.now();
        childDevice.isConnected = true; // Mark as connected when we receive data
        this.devices.set(childId, childDevice);
      }

      // Dispatch quaternion data event with child device ID
      this.dispatchEvent(new CustomEvent('quaternionData', {
        detail: {
          deviceId: childId, // Use child device ID, not hub ID
          quaternion: Array.from(quaternion),
          timestamp: performance.now()
        }
      }));
    } catch (error) {
      console.error(`[EidonTrackerManager] Error handling child quaternion data for ${childId}:`, error);
    }
  }

  private async autoReconnect(): Promise<void> {
    // Use navigator.bluetooth.getDevices() to get previously paired devices
    // This API requires the "bluetooth" permission and only works with devices
    // that the user has previously granted access to
    try {
      if (!navigator.bluetooth || !navigator.bluetooth.getDevices) {
        console.log('[EidonTrackerManager] getDevices() not supported');
        return;
      }

      const devices = await navigator.bluetooth.getDevices();
      console.log(`[EidonTrackerManager] Found ${devices.length} previously paired device(s)`);

      for (const bluetoothDevice of devices) {
        // Filter for Eidon devices by name
        const name = bluetoothDevice.name?.toLowerCase() || '';
        if (!name.includes('eidon') && !name.includes('tracker') && !name.includes('6fdf')) {
          continue;
        }

        console.log(`[EidonTrackerManager] Attempting auto-reconnect to: ${bluetoothDevice.name}`);

        // Set up disconnect listener
        bluetoothDevice.addEventListener('gattserverdisconnected', () => {
          console.log(`[EidonTrackerManager] Device disconnected: ${bluetoothDevice.name}`);
          const deviceId = bluetoothDevice.id;
          const device = this.devices.get(deviceId);
          if (device) {
            device.isConnected = false;
            this.devices.set(deviceId, device);
            this.dispatchEvent(new CustomEvent('deviceDisconnected', { detail: { deviceId, device } }));
          }
        });

        // Use watchAdvertisements to wait for the device to be seen
        if ((bluetoothDevice as any).watchAdvertisements) {
          try {
            let connected = false;

            // Set up listener for when we see an advertisement
            const connectOnAdvertisement = async (event: any) => {
              if (connected) return;
              connected = true;
              console.log(`[EidonTrackerManager] Received advertisement from: ${bluetoothDevice.name}`);
              bluetoothDevice.removeEventListener('advertisementreceived', connectOnAdvertisement);

              try {
                const gattServer = await bluetoothDevice.gatt?.connect();
                if (gattServer) {
                  await this.setupConnectedDevice(bluetoothDevice, gattServer);
                  console.log(`[EidonTrackerManager] Auto-reconnected to: ${bluetoothDevice.name}`);
                }
              } catch (connectError) {
                console.log(`[EidonTrackerManager] Failed to connect after advertisement:`, connectError);
              }
            };

            bluetoothDevice.addEventListener('advertisementreceived', connectOnAdvertisement);
            await (bluetoothDevice as any).watchAdvertisements();
            console.log(`[EidonTrackerManager] Watching for advertisements from: ${bluetoothDevice.name}`);

            // Also set up periodic retries - try direct connect every 5 seconds
            const retryInterval = setInterval(async () => {
              if (connected) {
                clearInterval(retryInterval);
                return;
              }
              console.log(`[EidonTrackerManager] Retrying direct connect: ${bluetoothDevice.name}`);

              try {
                const gattServer = await bluetoothDevice.gatt?.connect();
                if (gattServer) {
                  connected = true;
                  clearInterval(retryInterval);
                  bluetoothDevice.removeEventListener('advertisementreceived', connectOnAdvertisement);
                  await this.setupConnectedDevice(bluetoothDevice, gattServer);
                  console.log(`[EidonTrackerManager] Auto-reconnected to: ${bluetoothDevice.name}`);
                }
              } catch (error) {
                // Will retry on next interval
                console.log(`[EidonTrackerManager] Retry failed for ${bluetoothDevice.name}, will retry...`);
              }
            }, 5000);

          } catch (watchError) {
            console.log(`[EidonTrackerManager] watchAdvertisements failed, trying direct connect:`, watchError);
            // Fall back to direct connect attempt
            try {
              const gattServer = await bluetoothDevice.gatt?.connect();
              if (gattServer) {
                await this.setupConnectedDevice(bluetoothDevice, gattServer);
                console.log(`[EidonTrackerManager] Auto-reconnected to: ${bluetoothDevice.name}`);
              }
            } catch (error) {
              console.log(`[EidonTrackerManager] Could not auto-reconnect to ${bluetoothDevice.name}:`, error);
            }
          }
        } else {
          // No watchAdvertisements support, try direct connect
          try {
            const gattServer = await bluetoothDevice.gatt?.connect();
            if (gattServer) {
              await this.setupConnectedDevice(bluetoothDevice, gattServer);
              console.log(`[EidonTrackerManager] Auto-reconnected to: ${bluetoothDevice.name}`);
            }
          } catch (error) {
            console.log(`[EidonTrackerManager] Could not auto-reconnect to ${bluetoothDevice.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('[EidonTrackerManager] Auto-reconnect failed:', error);
    }
  }

  /**
   * Set up a device that is already connected via GATT
   * Used for auto-reconnect when we already have the BluetoothDevice and gattServer
   */
  private async setupConnectedDevice(bluetoothDevice: BluetoothDevice, gattServer: BluetoothRemoteGATTServer): Promise<void> {
    const deviceId = bluetoothDevice.id;

    // Create or update device entry
    let device = this.devices.get(deviceId);
    if (!device) {
      device = {
        id: deviceId,
        name: bluetoothDevice.name || 'Unknown Device',
        role: DeviceRole.UNKNOWN,
        macAddress: deviceId,
        connectionId: deviceId,
        isConnected: false,
        isHub: false,
        lastSeen: performance.now()
      };
      this.devices.set(deviceId, device);
    }

    // Create connection state
    const connectionState: DeviceConnectionState = {
      device,
      bluetoothDevice,
      gattServer,
      isConnecting: true,
      connectionAttempts: 0,
      services: new Map(),
      characteristics: new Map()
    };
    this.connectionStates.set(deviceId, connectionState);

    try {
      // Discover services
      const services = await gattServer.getPrimaryServices();
      for (const service of services) {
        connectionState.services.set(service.uuid, service);
      }

      // Discover characteristics for main service
      const mainService = connectionState.services.get(EIDON_SERVICE_UUID);
      if (mainService) {
        const characteristics = await mainService.getCharacteristics();
        for (const char of characteristics) {
          connectionState.characteristics.set(char.uuid, char);
        }
      }

      // Discover characteristics for role config service (if available)
      const roleConfigService = connectionState.services.get(ROLE_CONFIG_SERVICE_UUID);
      if (roleConfigService) {
        const characteristics = await roleConfigService.getCharacteristics();
        for (const char of characteristics) {
          connectionState.characteristics.set(char.uuid, char);
        }
      }

      // Fetch device info and role
      await this.fetchDeviceInfo(deviceId);

      // Subscribe to quaternion notifications
      await this.subscribeToQuaternionData(deviceId);

      // Subscribe to finger sensor notifications (if glove device)
      if (device.role === DeviceRole.LEFT_GLOVE || device.role === DeviceRole.RIGHT_GLOVE) {
        await this.subscribeToFingerData(deviceId);
      }

      // Update device state
      device.isConnected = true;
      device.lastSeen = performance.now();
      this.devices.set(deviceId, device);

      connectionState.isConnecting = false;

      // If this is a hub, set up child devices
      if (device.isHub && (device.role === DeviceRole.LEFT_HUB || device.role === DeviceRole.RIGHT_HUB)) {
        const existingChildren = Array.from(this.devices.values()).filter(d => d.parentHub === deviceId);
        if (existingChildren.length === 0) {
          await this.setupChildDevicesForHub(deviceId);
        }
      }

      this.dispatchEvent(new CustomEvent('deviceConnected', { detail: { deviceId, device } }));

    } catch (error) {
      connectionState.isConnecting = false;
      this.connectionStates.delete(deviceId);
      throw error;
    }
  }

  public destroy(): void {
    this.stopDiscovery();
    this.disconnectAll();
    this.devices.clear();
    this.connectionStates.clear();
    console.log('EidonTrackerManager destroyed');
  }
}
