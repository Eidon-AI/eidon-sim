import { vec3, quat } from 'gl-matrix';
import { DeviceStore } from './DeviceStore';
import { Device, DeviceRole, DeviceColor } from '../types/device';
import {
  EIDON_SERVICE_UUID,
  QUATERNION_CHAR_UUID,
  FINGER_SENSOR_CHAR_UUID,
  DEVICE_INFO_CHAR_UUID,
  CALIBRATION_CHAR_UUID,
  FINGER_ALPHA,
} from './constants';
import { quaternionToVectors } from './mathUtils';

const LEFT_GLOVE_ROLE  = 0x08;
const RIGHT_GLOVE_ROLE = 0x09;

interface GloveConnection {
  bleDevice:    BluetoothDevice;
  server:       BluetoothRemoteGATTServer;
  deviceId:     string; // stable id used in DeviceStore
  side:         'left' | 'right';
  calibChar?:   BluetoothRemoteGATTCharacteristic;
}

export class GloveManager extends EventTarget {
  private connections = new Map<'left' | 'right', GloveConnection>();

  constructor(private store: DeviceStore) {
    super();
  }

  /** Trigger BLE picker for one glove.
   *  @param forcedSide When provided, overrides device-info role detection. */
  async connect(forcedSide?: 'left' | 'right'): Promise<void> {
    if (!navigator.bluetooth) {
      console.error('GloveManager: Web Bluetooth not available');
      return;
    }

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Eidon-Glove-' }],
        optionalServices: [EIDON_SERVICE_UUID],
      });
    } catch (e) {
      // User cancelled picker
      return;
    }

    await this._setupDevice(device, forcedSide);
  }

  /** Disconnect one side */
  async disconnect(side: 'left' | 'right'): Promise<void> {
    const conn = this.connections.get(side);
    if (!conn) return;
    try { conn.server.disconnect(); } catch (_) { /* ignore */ }
    this.store.removeDevice(conn.deviceId);
    this.connections.delete(side);
    this._emitChange();
  }

  isConnected(side: 'left' | 'right'): boolean {
    return this.connections.has(side);
  }

  getDeviceName(side: 'left' | 'right'): string | null {
    return this.connections.get(side)?.bleDevice.name ?? null;
  }

  /** Send calibration command (0x01) to one glove */
  async calibrateGlove(side: 'left' | 'right'): Promise<void> {
    const conn = this.connections.get(side);
    if (!conn?.calibChar) {
      console.warn(`GloveManager: no calibration char for ${side} glove`);
      return;
    }
    try {
      await conn.calibChar.writeValue(new Uint8Array([0x01]));
    } catch (e) {
      console.error(`GloveManager: calibration failed for ${side} glove`, e);
    }
  }

  private async _setupDevice(bleDevice: BluetoothDevice, forcedSide?: 'left' | 'right'): Promise<void> {
    let server: BluetoothRemoteGATTServer;
    try {
      server = await bleDevice.gatt!.connect();
    } catch (e) {
      console.error('GloveManager: GATT connect failed', e);
      return;
    }

    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(EIDON_SERVICE_UUID);
    } catch (e) {
      console.error('GloveManager: service not found', e);
      return;
    }

    // Determine side: user-chosen button takes priority over device-info bytes
    let side: 'left' | 'right' = forcedSide ?? 'right';
    if (!forcedSide) {
      try {
        const infoChar = await service.getCharacteristic(DEVICE_INFO_CHAR_UUID);
        const infoVal  = await infoChar.readValue();
        const roleByte = infoVal.byteLength > 6 ? infoVal.getUint8(6) : RIGHT_GLOVE_ROLE;
        side = roleByte === LEFT_GLOVE_ROLE ? 'left' : 'right';
      } catch (e) {
        console.warn('GloveManager: could not read device info, defaulting to right', e);
      }
    }

    // If a glove of this side is already connected, disconnect it first
    if (this.connections.has(side)) {
      await this.disconnect(side);
    }

    const deviceId = `glove-${side}`;
    const position = side === 'left' ? DeviceRole.ROLE_LEFT_GLOVE : DeviceRole.ROLE_RIGHT_GLOVE;

    // Create Device in store
    const dev: Device = {
      id:          deviceId,
      name:        bleDevice.name ?? `${side} glove`,
      position,
      color:       DeviceColor.ORANGE,
      quat:        quat.create(),
      up:          vec3.create(),
      fwd:         vec3.create(),
      chainStart:  vec3.create(),
      chainEnd:    vec3.create(),
      lastSeen:    performance.now(),
      fingerNorm:   Array(16).fill(0),
      fingerSmooth: Array(16).fill(0),
    };
    this.store.upsertDevice(dev);

    const conn: GloveConnection = { bleDevice, server, deviceId, side };
    this.connections.set(side, conn);

    // Subscribe to quaternion notifications
    try {
      const quatChar = await service.getCharacteristic(QUATERNION_CHAR_UUID);
      await quatChar.startNotifications();
      quatChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        const val = (e.target as BluetoothRemoteGATTCharacteristic).value!;
        this._onQuaternion(deviceId, val);
      });
    } catch (e) {
      console.error('GloveManager: quaternion notify failed', e);
    }

    // Get calibration characteristic (optional – swallow errors)
    try {
      conn.calibChar = await service.getCharacteristic(CALIBRATION_CHAR_UUID);
    } catch (_) { /* glove firmware may not expose it yet */ }

    // Subscribe to finger data notifications
    try {
      const fingerChar = await service.getCharacteristic(FINGER_SENSOR_CHAR_UUID);
      await fingerChar.startNotifications();
      fingerChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        const val = (e.target as BluetoothRemoteGATTCharacteristic).value!;
        this._onFingerData(deviceId, val);
      });
    } catch (e) {
      console.error('GloveManager: finger data notify failed', e);
    }

    // Listen for BLE disconnect
    bleDevice.addEventListener('gattserverdisconnected', () => {
      this.store.removeDevice(deviceId);
      this.connections.delete(side);
      this._emitChange();
    });

    this._emitChange();
  }

  /** Parse 16 bytes as 4 × float32 LE → quat [x,y,z,w] */
  private _onQuaternion(deviceId: string, dv: DataView): void {
    const dev = this.store['map'].get(deviceId);
    if (!dev) return;

    // BLE wire order: w, x, y, z  (each float32 LE)
    const w = dv.getFloat32(0,  true);
    const x = dv.getFloat32(4,  true);
    const y = dv.getFloat32(8,  true);
    const z = dv.getFloat32(12, true);

    // gl-matrix stores as [x, y, z, w].
    // Negate x and y: without both negations the forward vector renders on the opposite side
    // and pitch is inverted. z and w are kept as-is. Empirically verified correct mapping.
    const q: quat = [-x, -y, z, w];
    dev.quat = q;

    const { up, fwd } = quaternionToVectors(q);
    dev.up  = up;
    dev.fwd = fwd;
    dev.lastSeen = performance.now();

    this.store.dispatchEvent(new CustomEvent('update', { detail: dev }));
  }

  /** Parse 32 bytes as 16 × uint16 LE → normalize → EMA smooth */
  private _onFingerData(deviceId: string, dv: DataView): void {
    const dev = this.store['map'].get(deviceId);
    if (!dev) return;

    const norm: number[] = [];
    for (let i = 0; i < 16; i++) {
      norm.push(dv.getUint16(i * 2, true) / 65535);
    }

    const alpha = FINGER_ALPHA();
    const prev  = dev.fingerSmooth ?? Array(16).fill(0);
    dev.fingerSmooth = prev.map((p, i) => p + (norm[i] - p) * alpha);
    dev.fingerNorm   = norm;
    dev.lastSeen     = performance.now();

    this.store.dispatchEvent(new CustomEvent('update', { detail: dev }));

    // Notify FingerSensorPanel and other listeners
    document.dispatchEvent(new CustomEvent('fingerDataUpdate', {
      detail: { deviceId, fingerValues: dev.fingerSmooth }
    }));
  }

  private _emitChange(): void {
    const detail = {
      left:      this.isConnected('left'),
      right:     this.isConnected('right'),
      leftName:  this.getDeviceName('left'),
      rightName: this.getDeviceName('right'),
      anyConnected: this.isConnected('left') || this.isConnected('right'),
    };
    this.dispatchEvent(new CustomEvent('connectionChanged', { detail }));
    // Also broadcast on the document so ViewControls can react without a direct reference
    document.dispatchEvent(new CustomEvent('gloveConnectionChanged', { detail }));
  }

  destroy(): void {
    this.connections.forEach((_, side) => this.disconnect(side));
  }
}
