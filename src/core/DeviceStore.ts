import { quat, vec3, vec3 as v3 } from 'gl-matrix';
import { parseTracker } from './reportParsers';
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

  /** Subscribe to HidManager.report */
  handleRaw(id: string, view: DataView) {
    // Ignore live input during playback
    if (this.playbackMode) return;
    
    const state = this.map.get(id) ?? this.newState(id, view);
    this.parseInto(state, view);
    this.map.set(id, state);
    this.dispatchEvent(new CustomEvent('update', { detail: state }));
  }

  /** Enable/disable playback mode */
  setPlaybackMode(enabled: boolean) {
    this.playbackMode = enabled;
    console.log('DeviceStore playback mode:', enabled ? 'ON' : 'OFF');
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
  private newState(id: string, view: DataView): Device {
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

  private parseInto(state: Device, view: DataView) {
    parseTracker(state, view);
    state.lastSeen = performance.now();
  }

  /** Convenience: fetch device by specific position */
  getByPosition(position: DeviceRole): Device | undefined {
    return [...this.map.values()].find(
      s => s.position === position
    );
  }

  destroy(): void {
    // Clean up document event listener
    document.removeEventListener('deviceColor', this.boundHandleDeviceColor);
    
    // Clear device map
    this.map.clear();
    
    console.log('DeviceStore destroyed');
  }
}
