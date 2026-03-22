import { quat, vec3, vec3 as v3 } from 'gl-matrix';
import { Device, DeviceRole, DeviceColor } from '../types/device';

export class DeviceStore extends EventTarget {
  private playbackMode = false;

  constructor(){
    super();

    this.boundHandleDeviceColor = this.handleDeviceColor.bind(this);
    document.addEventListener('deviceColor', this.boundHandleDeviceColor);
  }

  private boundHandleDeviceColor: (e: Event) => void;

  private handleDeviceColor(e: Event) {
    const { id, hex } = (e as CustomEvent<{ id: string; hex: string }>).detail;
    const s = this.map.get(id);
    if (!s) return;
    s.color = hex as DeviceColor;
    this.dispatchEvent(new CustomEvent('update', { detail: s }));
  }

  private map = new Map<string, Device>();

  /** Enable/disable playback mode */
  setPlaybackMode(enabled: boolean) {
    this.playbackMode = enabled;
    console.log('DeviceStore playback mode:', enabled ? 'ON' : 'OFF');
  }

  /** Check if playback mode is enabled */
  isPlaybackMode(): boolean {
    return this.playbackMode;
  }

  /** Update device state during playback (bypasses live input blocking) */
  updateDeviceForPlayback(deviceId: string, updates: Partial<Device>) {
    const device = this.map.get(deviceId);
    if (!device) return;

    // Apply updates
    Object.assign(device, updates);

    // Update lastSeen
    device.lastSeen = performance.now();

    // Dispatch update event
    this.dispatchEvent(new CustomEvent('update', { detail: device }));
  }

  /* ---------- internal helpers ------------------------------- */
  private newState(id: string): Device {
    return {
      id,
      name: `Device ${id}`,
      position: DeviceRole.ROLE_LEFT_HAND, // Default position, will be set by system
      color: DeviceColor.ORANGE,
      quat: quat.create(),
      up:   vec3.create(),
      fwd:  vec3.create(),
      chainStart: vec3.create(),
      chainEnd:   vec3.create(),
      lastSeen: performance.now()
    };
  }

  /** Convenience: fetch device by specific position */
  getByPosition(position: DeviceRole): Device | undefined {
    // During playback mode, prioritize playback devices over live devices
    if (this.playbackMode) {
      // First try to find a playback device
      const playbackDevice = [...this.map.values()].find(
        s => s.position === position && s.userId === 'playback'
      );
      if (playbackDevice) {
        return playbackDevice;
      }
    }
    
    // Fallback to any device with that position (for live mode or if no playback device found)
    return [...this.map.values()].find(
      s => s.position === position
    );
  }

  /** Add or replace a device (used by GloveManager) */
  upsertDevice(device: Device): void {
    this.map.set(device.id, device);
    this.dispatchEvent(new CustomEvent('update', { detail: device }));
  }

  /** Remove a device by id (used by GloveManager on disconnect) */
  removeDevice(id: string): void {
    this.map.delete(id);
    document.dispatchEvent(new CustomEvent('deviceRemoved', { detail: { id } }));
  }

  destroy(): void {
    // Clean up document event listener
    document.removeEventListener('deviceColor', this.boundHandleDeviceColor);
    
    // Clear device map
    this.map.clear();
    
    console.log('DeviceStore destroyed');
  }
}
