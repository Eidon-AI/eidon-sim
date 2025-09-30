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
   */
  async startDiscovery(): Promise<EidonDevice[]> {
    if (this.isScanning) {
      console.log('Discovery already in progress');
      return [];
    }

    this.isScanning = true;
    this.scanAbortController = new AbortController();

    try {
      const devices = await this.scanForDevices();
      this.dispatchEvent(new CustomEvent('devicesDiscovered', { detail: devices }));
      return devices;
    } catch (error) {
      console.error('Device discovery failed:', error);
      this.dispatchEvent(new CustomEvent('discoveryError', { detail: error }));
      return [];
    } finally {
      this.isScanning = false;
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
  }

  /**
   * Connect to a specific device
   */
  async connectToDevice(deviceId: DeviceId): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.error('Device not found:', deviceId);
      return false;
    }

    const connectionState = this.connectionStates.get(deviceId);
    if (connectionState?.isConnecting) {
      console.log('Connection already in progress for:', deviceId);
      return false;
    }

    if (connectionState?.isConnected) {
      console.log('Device already connected:', deviceId);
      return true;
    }

    try {
      await this.performConnection(deviceId);
      return true;
    } catch (error) {
      console.error('Connection failed for device:', deviceId, error);
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

  private async scanForDevices(): Promise<EidonDevice[]> {
    if (!navigator.bluetooth) {
      throw new Error('Bluetooth not supported');
    }

    const discoveredDevices: EidonDevice[] = [];

    try {
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [EIDON_SERVICE_UUID] }
        ],
        optionalServices: [
          EIDON_SERVICE_UUID,
          ROLE_CONFIG_SERVICE_UUID
        ]
      });

      // Check if device is already known
      const existingDevice = this.findDeviceByBluetoothDevice(bluetoothDevice);
      if (existingDevice) {
        return [existingDevice];
      }

      // Create new device entry
      const device = await this.createDeviceFromBluetoothDevice(bluetoothDevice);
      if (device) {
        this.devices.set(device.id, device);
        discoveredDevices.push(device);
      }

    } catch (error) {
      if (error.name !== 'NotFoundError') {
        throw error;
      }
    }

    return discoveredDevices;
  }

  private async createDeviceFromBluetoothDevice(bluetoothDevice: BluetoothDevice): Promise<EidonDevice | null> {
    try {
      // Extract device information from manufacturer data
      const manufacturerData = this.extractManufacturerData(bluetoothDevice);
      if (!manufacturerData) {
        return null;
      }

      const role = manufacturerData.role;
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
      console.error('Failed to create device from Bluetooth device:', error);
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

  private async performConnection(deviceId: DeviceId): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    const connectionState: DeviceConnectionState = {
      device,
      isConnecting: true,
      connectionAttempts: 0,
      services: new Map(),
      characteristics: new Map()
    };

    this.connectionStates.set(deviceId, connectionState);

    try {
      // Request Bluetooth device
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [EIDON_SERVICE_UUID] }
        ],
        optionalServices: [
          EIDON_SERVICE_UUID,
          ROLE_CONFIG_SERVICE_UUID
        ]
      });

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
