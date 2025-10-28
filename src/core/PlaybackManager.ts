import { DeviceStore } from './DeviceStore';
import { ArmSolver } from './ArmSolver';
import { Device, DeviceRole, DeviceColor, stringToDeviceRole } from '../types/device';
import { vec3, quat } from 'gl-matrix';
import { SensorRecording, DeviceSimple, SensorSnapshot } from '../types/sensorData';


export class PlaybackManager extends EventTarget {
  private isPlayingBack = false;
  private isPaused = false;
  private playbackRecording: SensorRecording | null = null;
  private playbackPosition = 0; // current time in ms
  private playbackStartTime = 0;
  private playbackAnimationId: number | null = null;
  private temporaryDeviceIds: Set<string> = new Set(); // Track devices created for playback

  constructor(
    private store: DeviceStore,
    private solver: ArmSolver
  ) {
    super();
  }


  public startPlayback(recording: SensorRecording): void {
    if (this.isPlayingBack) return;

    this.playbackRecording = recording;
    this.playbackPosition = 0;
    this.playbackStartTime = performance.now();
    this.isPlayingBack = true;
    this.isPaused = false;

    // Enable playback mode to disable live input
    this.store.setPlaybackMode(true);

    // Create temporary device states for devices that don't exist
    this.createTemporaryDevices(recording);

    // Use requestAnimationFrame for smoother, more efficient playback
    const playbackLoop = () => {
      if (this.isPlayingBack && !this.isPaused) {
        this.updatePlayback();
        this.playbackAnimationId = requestAnimationFrame(playbackLoop);
      }
    };
    this.playbackAnimationId = requestAnimationFrame(playbackLoop);

    this.dispatchEvent(new CustomEvent('playbackStateChanged', { 
      detail: { state: 'playing', position: 0, duration: this.getRecordingDuration(recording) } 
    }));
  }

  public pausePlayback(): void {
    if (!this.isPlayingBack || this.isPaused) return;

    this.isPaused = true;
    if (this.playbackAnimationId) {
      cancelAnimationFrame(this.playbackAnimationId);
      this.playbackAnimationId = null;
    }

    this.dispatchEvent(new CustomEvent('playbackStateChanged', { 
      detail: { state: 'paused', position: this.playbackPosition } 
    }));
  }

  public resumePlayback(): void {
    if (!this.isPlayingBack || !this.isPaused) return;

    this.isPaused = false;
    this.playbackStartTime = performance.now() - this.playbackPosition;

    // Resume animation loop
    const playbackLoop = () => {
      if (this.isPlayingBack && !this.isPaused) {
        this.updatePlayback();
        this.playbackAnimationId = requestAnimationFrame(playbackLoop);
      }
    };
    this.playbackAnimationId = requestAnimationFrame(playbackLoop);

    this.dispatchEvent(new CustomEvent('playbackStateChanged', { 
      detail: { state: 'playing', position: this.playbackPosition } 
    }));
  }

  public stopPlayback(): void {
    if (!this.isPlayingBack) return;

    this.isPlayingBack = false;
    this.isPaused = false;
    
    if (this.playbackAnimationId) {
      cancelAnimationFrame(this.playbackAnimationId);
      this.playbackAnimationId = null;
    }

    this.playbackPosition = 0;
    this.playbackRecording = null;

    // Clean up temporary devices
    this.cleanupTemporaryDevices();

    // Disable playback mode to re-enable live input
    this.store.setPlaybackMode(false);

    // Return to live input
    this.dispatchEvent(new CustomEvent('playbackStateChanged', { detail: { state: 'stopped' } }));
  }

  public seekTo(position: number): void {
    if (!this.playbackRecording) return;

    this.playbackPosition = Math.max(0, Math.min(position, this.getRecordingDuration(this.playbackRecording)));
    
    if (this.isPlayingBack && !this.isPaused) {
      this.playbackStartTime = performance.now() - this.playbackPosition;
    }

    // Apply the snapshot at the new position immediately
    const snapshot = this.findSnapshotAtTime(this.playbackRecording, this.playbackPosition);
    if (snapshot) {
      this.applySnapshot(snapshot);
    }

    // Send position update to update scrubber
    this.dispatchEvent(new CustomEvent('playbackPositionUpdate', { 
      detail: { position: this.playbackPosition, duration: this.getRecordingDuration(this.playbackRecording) } 
    }));

    this.dispatchEvent(new CustomEvent('playbackStateChanged', { 
      detail: { state: this.isPaused ? 'paused' : 'playing', position: this.playbackPosition } 
    }));
  }

  private updatePlayback(): void {
    if (!this.playbackRecording || this.isPaused) return;

    this.playbackPosition = performance.now() - this.playbackStartTime;
    const duration = this.getRecordingDuration(this.playbackRecording);

    if (this.playbackPosition >= duration) {
      // Loop back to the beginning instead of stopping
      this.playbackPosition = 0;
      this.playbackStartTime = performance.now();
    }

    // Find the snapshot to display
    const snapshot = this.findSnapshotAtTime(this.playbackRecording, this.playbackPosition);
    if (snapshot) {
      this.applySnapshot(snapshot);
    }

    // Send position update for scrubber without triggering UI rebuild
    this.dispatchEvent(new CustomEvent('playbackPositionUpdate', { 
      detail: { position: this.playbackPosition, duration } 
    }));
  }

  private findSnapshotAtTime(recording: SensorRecording, time: number): SensorSnapshot | null {
    const snapshots = recording.snapshots;
    if (snapshots.length === 0) return null;

    // Find the closest snapshot at or before the requested time
    let bestSnapshot = snapshots[0];
    for (const snapshot of snapshots) {
      if (snapshot.time <= time) {
        bestSnapshot = snapshot;
      } else {
        break;
      }
    }

    return bestSnapshot;
  }

  private applySnapshot(snapshot: SensorSnapshot): void {
    // Apply device data using the new playback method
    // deviceData format: Record<string, [x, y, z, w]> - direct quaternion arrays
    for (const [deviceId, quatArray] of Object.entries(snapshot.deviceData)) {
      // Prepare the updates object with quaternion
      const updates: any = {
        quat: [...quatArray]  // quatArray is [x, y, z, w]
      };

      // Recalculate derived vectors from quaternion (all devices are trackers)
      const q = updates.quat;
      const deviceState = this.store['map'].get(deviceId);
      
      if (deviceState) {
        // From parseTracker logic - transform quaternion to up/fwd vectors
        const upZ = vec3.transformQuat(vec3.create(), [0, 0, 1], q);
        updates.up = [upZ[0], upZ[2], -upZ[1]] as vec3;
        const fwdZ = vec3.transformQuat(vec3.create(), [0, 1, 0], q);
        updates.fwd = [fwdZ[0], fwdZ[2], -fwdZ[1]] as vec3;

        // Apply updates using the playback method
        this.store.updateDeviceForPlayback(deviceId, updates);
      }
    }
  }

  private getRecordingDuration(recording: SensorRecording): number {
    if (recording.snapshots.length === 0) return 0;
    return recording.snapshots[recording.snapshots.length - 1].time;
  }

  private createTemporaryDevices(recording: SensorRecording): void {
    recording.devices.forEach(deviceSimple => {
      // Check if device already exists in store
      const existingDevice = this.store['map'].get(deviceSimple.id);
      
      if (!existingDevice) {
        // Create temporary device state (all devices are trackers, no finger data)
        const tempDevice: Device = {
          // Device metadata
          id: deviceSimple.id,
          name: `Device ${deviceSimple.id}`,
          position: stringToDeviceRole(deviceSimple.position),
          color: DeviceColor.ORANGE, // Default color
          connectionId: deviceSimple.connectionId,
          userId: 'playback', // Placeholder for playback
          createdAt: new Date(),
          updatedAt: new Date(),
          
          // DeviceData
          quat: quat.create(),
          up: vec3.create(),
          fwd: vec3.create(),
          chainStart: vec3.create(),
          chainEnd: vec3.create(),
          lastSeen: performance.now()
        };

        // Add to store
        this.store['map'].set(deviceSimple.id, tempDevice);
        this.temporaryDeviceIds.add(deviceSimple.id);
        
        // Trigger update event so UI and 3D scene know about this device
        this.store.dispatchEvent(new CustomEvent('update', { detail: tempDevice }));
      }
    });
  }

  private cleanupTemporaryDevices(): void {
    this.temporaryDeviceIds.forEach(deviceId => {
      const device = this.store['map'].get(deviceId);
      if (device) {
        // Dispatch removal event before deleting
        document.dispatchEvent(new CustomEvent('deviceRemoved', { detail: { id: deviceId } }));
      }
      this.store['map'].delete(deviceId);
    });
    this.temporaryDeviceIds.clear();
  }

  // Getters for UI
  public get playbackState() {
    if (this.isPlayingBack) {
      return this.isPaused ? 'paused' : 'playing';
    }
    return 'stopped';
  }

  public get currentPlaybackPosition(): number {
    return this.playbackPosition;
  }

  public get currentPlaybackDuration(): number {
    return this.playbackRecording ? this.getRecordingDuration(this.playbackRecording) : 0;
  }

  public destroy(): void {
    // Stop any ongoing playback
    if (this.isPlayingBack) {
      this.stopPlayback();
    }

    // Clean up animation frames
    if (this.playbackAnimationId) {
      cancelAnimationFrame(this.playbackAnimationId);
      this.playbackAnimationId = null;
    }

    // Clean up temporary devices
    this.cleanupTemporaryDevices();
  }
}
