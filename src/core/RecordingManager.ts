import { DeviceStore } from './DeviceStore';
import { ArmSolver } from './ArmSolver';
import { DeviceState } from '../types/types';
import { vec3, quat } from 'gl-matrix';

export interface RecordingDevice {
  id: string;
  kind: 'glove' | 'tracker';
  color: string;
  arm: { side: 'left' | 'right'; level: 'upper' | 'lower' | 'hand' };
}

export interface RecordingSnapshot {
  time: number; // relative ms from start
  deviceData: Record<string, {
    quat: [number, number, number, number];
    finger?: number[]; // only for gloves
  }>;
}

export interface Recording {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  sampleRate: number;
  devices: RecordingDevice[];
  snapshots: RecordingSnapshot[];
}

export class RecordingManager extends EventTarget {
  private isRecording = false;
  private isPlayingBack = false;
  private isPaused = false;
  private currentRecording: Recording | null = null;
  private playbackRecording: Recording | null = null;
  private playbackPosition = 0; // current time in ms
  private playbackStartTime = 0;
  private sampleRate = 30; // Hz
  private recordingStartTime = 0;
  private recordingInterval: number | null = null;
  private playbackInterval: number | null = null;
  private playbackAnimationId: number | null = null;
  private audioContext: AudioContext | null = null;
  private temporaryDeviceIds: Set<string> = new Set(); // Track devices created for playback
  
  // Safeguards to prevent memory issues
  private readonly MAX_RECORDING_DURATION = 10 * 60 * 1000; // 10 minutes max
  private readonly MAX_SNAPSHOTS = 18000; // 30fps * 600s = 18,000 snapshots max

  constructor(
    private store: DeviceStore,
    private solver: ArmSolver
  ) {
    super();
    this.initAudio();
  }

  private initAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Audio context not available:', e);
    }
  }

  private playBeep(frequency: number, duration: number, isLong = false) {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  private async countdown(): Promise<void> {
    return new Promise((resolve) => {
      let count = 3;
      
      const countdownStep = () => {
        if (count > 0) {
          this.playBeep(800, 0.2);
          this.dispatchEvent(new CustomEvent('countdown', { detail: { count } }));
          count--;
          setTimeout(countdownStep, 1000);
        } else {
          // Final long beep
          this.playBeep(1000, 0.5, true);
          this.dispatchEvent(new CustomEvent('countdown', { detail: { count: 0 } }));
          setTimeout(resolve, 500);
        }
      };

      countdownStep();
    });
  }

  private captureSnapshot(): RecordingSnapshot {
    const devices = Array.from(this.store['map'].values());
    const currentTime = performance.now() - this.recordingStartTime;

    const deviceData: Record<string, any> = {};
    
    devices.forEach(device => {
      const data: any = {
        quat: [...device.quat] as [number, number, number, number]
      };
      
      if (device.kind === 'glove' && device.finger) {
        data.finger = [...device.finger];
      }
      
      deviceData[device.id] = data;
    });

    return {
      time: currentTime,
      deviceData,
    };
  }

  private captureDevices(): RecordingDevice[] {
    const devices = Array.from(this.store['map'].values());
    return devices.map(device => ({
      id: device.id,
      kind: device.kind,
      color: device.color,
      arm: device.arm || { side: 'left', level: 'upper' }
    }));
  }

  public async startRecording(): Promise<void> {
    if (this.isRecording) return;

    this.dispatchEvent(new CustomEvent('recordingStateChanged', { detail: { state: 'countdown' } }));
    
    await this.countdown();

    const now = Date.now();
    this.recordingStartTime = performance.now();
    
    this.currentRecording = {
      id: `rec_${now}`,
      name: `Recording_${new Date(now).toISOString().replace(/[:.]/g, '_').slice(0, -5)}`,
      startTime: now,
      endTime: 0,
      sampleRate: this.sampleRate,
      devices: this.captureDevices(),
      snapshots: []
    };

    this.isRecording = true;
    
    this.recordingInterval = window.setInterval(() => {
      if (this.currentRecording) {
        // Safety check: stop recording if it gets too long
        const currentTime = performance.now() - this.recordingStartTime;
        if (currentTime > this.MAX_RECORDING_DURATION || 
            this.currentRecording.snapshots.length > this.MAX_SNAPSHOTS) {
          console.warn('Recording stopped automatically due to length limits');
          this.stopRecording();
          return;
        }
        
        this.currentRecording.snapshots.push(this.captureSnapshot());
      }
    }, 1000 / this.sampleRate);

    this.dispatchEvent(new CustomEvent('recordingStateChanged', { detail: { state: 'recording' } }));
  }

  public stopRecording(): void {
    if (!this.isRecording || !this.currentRecording) return;

    this.isRecording = false;
    
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    this.currentRecording.endTime = Date.now();
    
    // Save to localStorage asynchronously to avoid blocking
    this.saveToLocalStorage(this.currentRecording).catch(e => {
      console.error('Failed to save recording:', e);
    });

    this.dispatchEvent(new CustomEvent('recordingStateChanged', { 
      detail: { state: 'stopped', recording: this.currentRecording } 
    }));
  }

  public startPlayback(recording: Recording): void {
    if (this.isPlayingBack || this.isRecording) return;

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

  private findSnapshotAtTime(recording: Recording, time: number): RecordingSnapshot | null {
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

  private applySnapshot(snapshot: RecordingSnapshot): void {
    // Apply device data using the new playback method
    for (const [deviceId, data] of Object.entries(snapshot.deviceData)) {
      // Prepare the updates object
      const updates: any = {
        quat: [...data.quat]
      };
      
      // Update finger data for gloves
      if (data.finger) {
        updates.finger = [...data.finger];
        updates.fingerNorm = data.finger.map(f => f / 255);
        updates.fingerDeg = data.finger.map(f => (f / 255) * 90);
      }

      // Recalculate derived vectors from quaternion
      const q = updates.quat;
      const deviceState = this.store['map'].get(deviceId);
      
      if (deviceState) {
        if (deviceState.kind === 'tracker') {
          // From parseTracker logic
          const upZ = vec3.transformQuat(vec3.create(), [0, 0, 1], q);
          updates.up = [upZ[0], upZ[2], -upZ[1]] as vec3;
          const fwdZ = vec3.transformQuat(vec3.create(), [0, 1, 0], q);
          updates.fwd = [fwdZ[0], fwdZ[2], -fwdZ[1]] as vec3;
        } else if (deviceState.kind === 'glove') {
          // From parseGlove logic
          const upZ = vec3.transformQuat(vec3.create(), [1, 0, 1], q);
          updates.up = [upZ[0], upZ[2], -upZ[1]] as vec3;
          const fwdZ = vec3.transformQuat(vec3.create(), [0, 1, 0], q);
          updates.fwd = [fwdZ[0], fwdZ[2], -fwdZ[1]] as vec3;
        }

        // Apply updates using the new playback method
        this.store.updateDeviceForPlayback(deviceId, updates);
      }
    }
  }

  private getRecordingDuration(recording: Recording): number {
    if (recording.snapshots.length === 0) return 0;
    return recording.snapshots[recording.snapshots.length - 1].time;
  }

  private async saveToLocalStorage(recording: Recording): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use setTimeout to defer the heavy operation to avoid blocking main thread
        setTimeout(() => {
          try {
            const recordings = this.getLocalStorageRecordings();
            recordings[recording.id] = recording;
            localStorage.setItem('eidon_recordings', JSON.stringify(recordings));
            resolve();
          } catch (e) {
            console.error('Failed to save recording to localStorage:', e);
            reject(e);
          }
        }, 0);
      } catch (e) {
        console.error('Failed to save recording to localStorage:', e);
        reject(e);
      }
    });
  }

  private getLocalStorageRecordings(): Record<string, Recording> {
    try {
      const stored = localStorage.getItem('eidon_recordings');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('Failed to load recordings from localStorage:', e);
      return {};
    }
  }

  public getRecordings(): Recording[] {
    const recordings = Object.values(this.getLocalStorageRecordings());
    // Sort by startTime descending (most recent first)
    return recordings.sort((a, b) => b.startTime - a.startTime);
  }

  public loadRecording(id: string): Recording | null {
    const recordings = this.getLocalStorageRecordings();
    return recordings[id] || null;
  }

  public deleteRecording(id: string): void {
    const recordings = this.getLocalStorageRecordings();
    delete recordings[id];
    localStorage.setItem('eidon_recordings', JSON.stringify(recordings));
  }

  public exportRecording(recording: Recording): void {
    const dataStr = JSON.stringify(recording, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `${recording.name}.json`;
    link.click();
    
    URL.revokeObjectURL(link.href);
  }

  public async importRecording(file: File): Promise<Recording> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const recording = JSON.parse(e.target?.result as string) as Recording;
          this.saveToLocalStorage(recording);
          resolve(recording);
        } catch (error) {
          reject(new Error('Invalid recording file format'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  public async uploadRecording(recording: Recording): Promise<void> {
    // TODO: Replace with actual API call to api.eidon.ai/upload
    console.log('Upload recording to api.eidon.ai/upload:', {
      id: recording.id,
      name: recording.name,
      deviceCount: recording.devices.length,
      snapshotCount: recording.snapshots.length,
      duration: this.getRecordingDuration(recording),
      data: recording
    });
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Upload completed (simulated)');
  }

  // Getters for UI
  public get recordingState() {
    if (this.isRecording) return 'recording';
    return 'idle';
  }

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

  private createTemporaryDevices(recording: Recording): void {
    recording.devices.forEach(deviceInfo => {
      // Check if device already exists in store
      const existingDevice = this.store['map'].get(deviceInfo.id);
      
      if (!existingDevice) {
        // Create temporary device state
        const tempDevice: DeviceState = {
          id: deviceInfo.id,
          kind: deviceInfo.kind,
          color: deviceInfo.color,
          arm: deviceInfo.arm,
          quat: quat.create(),
          up: vec3.create(),
          fwd: vec3.create(),
          chainStart: vec3.create(),
          chainEnd: vec3.create(),
          lastSeen: performance.now()
        };

        // Add finger properties for gloves
        if (deviceInfo.kind === 'glove') {
          tempDevice.finger = Array(16).fill(0);
          tempDevice.fingerNorm = Array(16).fill(0);
          tempDevice.fingerDeg = Array(16).fill(0);
          tempDevice.fingerSmooth = Array(16).fill(0);
        }

        // Add to store
        this.store['map'].set(deviceInfo.id, tempDevice);
        this.temporaryDeviceIds.add(deviceInfo.id);
        
        // Trigger update event so UI and 3D scene know about this device
        this.store.dispatchEvent(new CustomEvent('update', { detail: tempDevice }));
        
        console.log(`Created temporary device for playback: ${deviceInfo.id} (${deviceInfo.kind})`);
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
      console.log(`Removed temporary device: ${deviceId}`);
    });
    this.temporaryDeviceIds.clear();
  }

  public destroy(): void {
    // Stop any ongoing recording or playback
    if (this.isRecording) {
      this.stopRecording();
    }
    if (this.isPlayingBack) {
      this.stopPlayback();
    }

    // Clean up intervals and animation frames
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (this.playbackAnimationId) {
      cancelAnimationFrame(this.playbackAnimationId);
      this.playbackAnimationId = null;
    }

    // Clean up audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clean up temporary devices
    this.cleanupTemporaryDevices();

    console.log('RecordingManager destroyed');
  }
} 