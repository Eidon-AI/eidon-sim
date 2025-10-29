import {
  EIDON_SERVICE_UUID,
  QUATERNION_CHAR_UUID,
  HAND_QUATERNION_CHAR_UUID,
  FOREARM_QUATERNION_CHAR_UUID,
  DEVICE_INFO_CHAR_UUID,
  CALIBRATION_CHAR_UUID,
  ROLE_CONFIG_SERVICE_UUID,
  ROLE_CONFIG_CHAR_UUID,
  DeviceRole,
  DEVICE_ROLE_NAMES
} from './constants';

export type DeviceId = string;

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
            console.log(`[EidonTrackerManager] Auto-connecting to newly discovered device: ${device.name}`);
            const connected = await this.connectToDeviceWithBluetoothDevice(device.id, bluetoothDevice);
            if (connected) {
              console.log(`[EidonTrackerManager] Successfully auto-connected to ${device.name}`);
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
      console.log('[EidonTrackerManager] Requesting device with name OR service UUID filter...');
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
      
      console.log(`[EidonTrackerManager] Device "${deviceName}" passed name check`);
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
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState) {
      return;
    }

    try {
      // Disconnect child devices if this is a hub
      const device = this.devices.get(deviceId);
      if (device?.isHub) {
        const childDevices = Array.from(this.devices.values()).filter(
          d => d.parentHub === deviceId
        );
        for (const child of childDevices) {
          await this.disconnectDevice(child.id);
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
   * Send calibration command to a device
   */
  async calibrateDevice(deviceId: DeviceId): Promise<void> {
    const connectionState = this.connectionStates.get(deviceId);
    if (!connectionState?.isConnected) {
      console.error('Device not connected for calibration:', deviceId);
      return;
    }

    const calibrationChar = connectionState.characteristics.get(CALIBRATION_CHAR_UUID);
    if (!calibrationChar) {
      console.error('Calibration characteristic not found for device:', deviceId);
      return;
    }

    try {
      // Send calibration command (0x01)
      const calibrationData = new Uint8Array([0x01]);
      await calibrationChar.writeValue(calibrationData);
      console.log('Calibration command sent to device:', deviceId);
    } catch (error) {
      console.error('Calibration failed for device:', deviceId, error);
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
      let bluetoothDevice: any = providedBluetoothDevice;

      // If not provided, check existing connection state
      if (!bluetoothDevice && connectionState.bluetoothDevice) {
        bluetoothDevice = connectionState.bluetoothDevice;
        console.log(`[EidonTrackerManager] Reusing stored BluetoothDevice for ${device.name}`);
      }

      // If still not available, try to get from paired devices
      if (!bluetoothDevice) {
        const bluetooth = (navigator as any).bluetooth;
        if (bluetooth && typeof bluetooth.getDevices === 'function') {
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
      }

      // If still not available, need to request device again (will show popup)
      // This requires user gesture, but if we're coming from discovery, we're still in the gesture context
      if (!bluetoothDevice) {
        const bluetooth = (navigator as any).bluetooth;
        console.log(`[EidonTrackerManager] Device ${device.name} not found in paired devices, requesting via popup`);
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

      // Connect to GATT server
      const gattServer = await bluetoothDevice.gatt!.connect();
      connectionState.gattServer = gattServer;

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

      // Fetch device info and role from the device
      await this.fetchDeviceInfo(deviceId);

      // Subscribe to quaternion notifications
      await this.subscribeToQuaternionData(deviceId);

      // Update device state
      device.isConnected = true;
      device.lastSeen = performance.now();
      this.devices.set(deviceId, device);

      connectionState.isConnecting = false;

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
        if (roleValue >= 0 && roleValue <= 6) {
          device.role = roleValue as DeviceRole;
          console.log(`[EidonTrackerManager] Fetched role ${roleValue} (${DEVICE_ROLE_NAMES[device.role]}) from device ${device.name}`);
          
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
        
        // Parse device info - assuming it contains color info
        // Structure depends on firmware - may need adjustment
        // For now, check if there's color data (typically RGB bytes at some offset)
        if (infoData.byteLength >= 3) {
          // Example: first 3 bytes might be RGB color
          // Adjust offset based on actual firmware structure
          const r = infoData.getUint8(0);
          const g = infoData.getUint8(1);
          const b = infoData.getUint8(2);
          
          // Only update if color values are non-zero (assuming 0,0,0 is invalid/unset)
          if (r > 0 || g > 0 || b > 0) {
            device.color = `rgb(${r}, ${g}, ${b})`;
            this.devices.set(deviceId, device);
            console.log(`[EidonTrackerManager] Fetched color rgb(${r}, ${g}, ${b}) from device ${device.name}`);
            
            // Dispatch event for UI update
            this.dispatchEvent(new CustomEvent('deviceInfoUpdated', { detail: { deviceId, device } }));
          }
        }
        
        console.log(`[EidonTrackerManager] Device info received for ${device.name}:`, infoData);
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

    // Parse quaternion data (assuming 16 bytes: 4 floats for quaternion)
    const quaternion = new Float32Array(data.buffer, data.byteOffset, 4);
    
    this.dispatchEvent(new CustomEvent('quaternionData', {
      detail: {
        deviceId,
        quaternion: Array.from(quaternion),
        timestamp: performance.now()
      }
    }));
  }

  private async autoReconnect(): Promise<void> {
    // TODO: Implement auto-reconnection to saved devices
    // This would load saved device information from backend/localStorage
    // and attempt to reconnect to them
    console.log('Auto-reconnect not yet implemented');
  }

  public destroy(): void {
    this.stopDiscovery();
    this.disconnectAll();
    this.devices.clear();
    this.connectionStates.clear();
    console.log('EidonTrackerManager destroyed');
  }
}
