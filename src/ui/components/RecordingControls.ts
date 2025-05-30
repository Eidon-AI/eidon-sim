import { RecordingManager, Recording } from '../../core/RecordingManager';

export class RecordingControls {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private recordingManager: RecordingManager;
  private countdownOverlay: HTMLElement | null = null;
  private recordingModal: HTMLElement | null = null;
  private currentRecording: Recording | null = null;
  private uiUpdateInterval: number | null = null;

  constructor(recordingManager: RecordingManager) {
    this.recordingManager = recordingManager;
    this.container = this.createContainer();
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);
    
    this.setupEventListeners();
    this.updateUI();
    this.startUIUpdateLoop();
  }

  private startUIUpdateLoop(): void {
    // Update UI every 100ms for smooth progress updates
    this.uiUpdateInterval = window.setInterval(() => {
      if (this.recordingManager.playbackState === 'playing') {
        this.updateScrubber();
      }
    }, 100);
  }

  private updateScrubber(): void {
    const scrubber = this.toolbar.querySelector('input[type="range"]') as HTMLInputElement;
    const timeDisplay = this.toolbar.querySelector('.font-mono') as HTMLElement;
    
    if (scrubber && timeDisplay) {
      const position = this.recordingManager.currentPlaybackPosition;
      const duration = this.recordingManager.currentPlaybackDuration;
      
      scrubber.value = position.toString();
      timeDisplay.textContent = `${this.formatTime(position)} / ${this.formatTime(duration)}`;
    }
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-40';
    return container;
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'bg-white/90 backdrop-blur-sm border border-gray-300 rounded-full px-4 py-2 shadow-lg flex items-center gap-3';
    return toolbar;
  }

  private setupEventListeners(): void {
    this.recordingManager.addEventListener('recordingStateChanged', (e) => {
      const { state, recording } = (e as CustomEvent<any>).detail;
      this.handleRecordingStateChange(state, recording);
    });

    this.recordingManager.addEventListener('playbackStateChanged', (e) => {
      this.updateUI();
    });

    this.recordingManager.addEventListener('countdown', (e) => {
      const { count } = (e as CustomEvent<any>).detail;
      this.updateCountdown(count);
    });
  }

  private handleRecordingStateChange(state: string, recording?: Recording): void {
    if (state === 'countdown') {
      this.showCountdown();
    } else if (state === 'recording') {
      this.hideCountdown();
    } else if (state === 'stopped' && recording) {
      this.currentRecording = recording;
      this.showRecordingComplete(recording);
    }
    this.updateUI();
  }

  private showCountdown(): void {
    if (this.countdownOverlay) return;

    this.countdownOverlay = document.createElement('div');
    this.countdownOverlay.className = 'fixed inset-0 bg-black/70 flex flex-col items-center justify-center text-white z-50';
    this.countdownOverlay.innerHTML = `
      <div class="text-8xl mb-8">🎬</div>
      <div class="text-4xl mb-4 font-bold">Recording starts in</div>
      <div id="countdownNumber" class="text-6xl font-bold">3</div>
    `;
    
    document.body.appendChild(this.countdownOverlay);
  }

  private updateCountdown(count: number): void {
    if (!this.countdownOverlay) return;
    
    const numberEl = this.countdownOverlay.querySelector('#countdownNumber');
    if (numberEl) {
      if (count === 0) {
        numberEl.textContent = 'GO!';
        numberEl.className = 'text-6xl font-bold text-green-400';
      } else {
        numberEl.textContent = count.toString();
      }
    }
  }

  private hideCountdown(): void {
    if (this.countdownOverlay) {
      this.countdownOverlay.remove();
      this.countdownOverlay = null;
    }
  }

  private showRecordingComplete(recording: Recording): void {
    if (this.recordingModal) return;

    const duration = recording.snapshots.length > 0 
      ? recording.snapshots[recording.snapshots.length - 1].time 
      : 0;

    this.recordingModal = document.createElement('div');
    this.recordingModal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    this.recordingModal.innerHTML = `
      <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg max-w-md w-full mx-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-2xl">✅</div>
          <h3 class="text-xl font-bold">Recording Complete!</h3>
        </div>
        
        <div class="space-y-2 mb-6">
          <div><strong>Name:</strong> ${recording.name}</div>
          <div><strong>Duration:</strong> ${(duration / 1000).toFixed(1)}s</div>
          <div><strong>Devices:</strong> ${recording.devices.length}</div>
          <div><strong>Snapshots:</strong> ${recording.snapshots.length}</div>
        </div>

        <div class="flex gap-2">
          <button id="playRecording" class="btn flex-1">▶️ Play</button>
          <button id="exportRecording" class="btn">💾 Export</button>
          <button id="uploadRecording" class="btn">☁️ Upload</button>
          <button id="closeModal" class="btn">✕</button>
        </div>
      </div>
    `;

    // Event listeners for modal buttons
    this.recordingModal.querySelector('#playRecording')?.addEventListener('click', () => {
      this.recordingManager.startPlayback(recording);
      this.hideRecordingModal();
    });

    this.recordingModal.querySelector('#exportRecording')?.addEventListener('click', () => {
      this.recordingManager.exportRecording(recording);
    });

    this.recordingModal.querySelector('#uploadRecording')?.addEventListener('click', async () => {
      const btn = this.recordingModal!.querySelector('#uploadRecording') as HTMLButtonElement;
      btn.textContent = '⏳ Uploading...';
      btn.disabled = true;
      
      try {
        await this.recordingManager.uploadRecording(recording);
        btn.textContent = '✅ Uploaded';
      } catch (e) {
        btn.textContent = '❌ Failed';
      }
      
      setTimeout(() => {
        btn.textContent = '☁️ Upload';
        btn.disabled = false;
      }, 2000);
    });

    this.recordingModal.querySelector('#closeModal')?.addEventListener('click', () => {
      this.hideRecordingModal();
    });

    document.body.appendChild(this.recordingModal);
  }

  private hideRecordingModal(): void {
    if (this.recordingModal) {
      this.recordingModal.remove();
      this.recordingModal = null;
    }
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private updateUI(): void {
    const recordingState = this.recordingManager.recordingState;
    const playbackState = this.recordingManager.playbackState;
    
    // Clear toolbar
    this.toolbar.innerHTML = '';

    // Recording controls
    if (recordingState === 'idle') {
      const recordBtn = this.createButton('🔴', 'Record', () => {
        this.recordingManager.startRecording();
      });
      this.toolbar.appendChild(recordBtn);
    } else if (recordingState === 'recording') {
      const stopBtn = this.createButton('⏹️', 'Stop Recording', () => {
        this.recordingManager.stopRecording();
      });
      stopBtn.className += ' bg-red-100 border-red-300';
      this.toolbar.appendChild(stopBtn);
    }

    // Playback controls
    if (playbackState === 'playing') {
      const pauseBtn = this.createButton('⏸️', 'Pause', () => {
        this.recordingManager.pausePlayback();
      });
      this.toolbar.appendChild(pauseBtn);

      const stopBtn = this.createButton('⏹️', 'Stop', () => {
        this.recordingManager.stopPlayback();
      });
      this.toolbar.appendChild(stopBtn);

      // Progress scrubber
      this.toolbar.appendChild(this.createScrubber());
    } else if (playbackState === 'paused') {
      const playBtn = this.createButton('▶️', 'Resume', () => {
        this.recordingManager.resumePlayback();
      });
      this.toolbar.appendChild(playBtn);

      const stopBtn = this.createButton('⏹️', 'Stop', () => {
        this.recordingManager.stopPlayback();
      });
      this.toolbar.appendChild(stopBtn);

      // Progress scrubber
      this.toolbar.appendChild(this.createScrubber());
    }

    // File management controls (only when not recording/playing)
    if (recordingState === 'idle' && playbackState === 'stopped') {
      const loadBtn = this.createButton('📁', 'Load', () => {
        this.showLoadModal();
      });
      this.toolbar.appendChild(loadBtn);

      const importBtn = this.createButton('📄', 'Import', () => {
        this.importFile();
      });
      this.toolbar.appendChild(importBtn);
    }
  }

  private createButton(icon: string, tooltip: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'px-3 py-2 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors flex items-center gap-1 text-sm';
    btn.innerHTML = `<span>${icon}</span>`;
    btn.title = tooltip;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private createScrubber(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'flex items-center gap-2 mx-2';

    const position = this.recordingManager.currentPlaybackPosition;
    const duration = this.recordingManager.currentPlaybackDuration;

    const timeDisplay = document.createElement('span');
    timeDisplay.className = 'text-sm font-mono';
    timeDisplay.textContent = `${this.formatTime(position)} / ${this.formatTime(duration)}`;

    const scrubber = document.createElement('input');
    scrubber.type = 'range';
    scrubber.min = '0';
    scrubber.max = duration.toString();
    scrubber.value = position.toString();
    scrubber.className = 'w-32';

    scrubber.addEventListener('input', () => {
      this.recordingManager.seekTo(parseFloat(scrubber.value));
    });

    container.appendChild(timeDisplay);
    container.appendChild(scrubber);
    
    return container;
  }

  private showLoadModal(): void {
    const recordings = this.recordingManager.getRecordings();
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    const recordingsList = recordings.map(recording => {
      const duration = recording.snapshots.length > 0 
        ? recording.snapshots[recording.snapshots.length - 1].time 
        : 0;
      
      return `
        <div class="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50">
          <div>
            <div class="font-medium">${recording.name}</div>
            <div class="text-sm text-gray-600">
              ${(duration / 1000).toFixed(1)}s • ${recording.devices.length} devices • ${recording.snapshots.length} frames
            </div>
          </div>
          <div class="flex gap-2">
            <button class="loadRecording btn-sm" data-id="${recording.id}">▶️ Play</button>
            <button class="exportRecording btn-sm" data-id="${recording.id}">💾</button>
            <button class="deleteRecording btn-sm text-red-600" data-id="${recording.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="bg-white/90 backdrop-blur-sm p-6 rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">Load Recording</h3>
          <button id="closeLoadModal" class="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        
        <div class="space-y-0">
          ${recordings.length > 0 ? recordingsList : '<p class="text-gray-500 text-center py-8">No recordings found</p>'}
        </div>
      </div>
    `;

    // Event listeners
    modal.querySelector('#closeLoadModal')?.addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelectorAll('.loadRecording').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const recording = this.recordingManager.loadRecording(id);
        if (recording) {
          this.recordingManager.startPlayback(recording);
          modal.remove();
        }
      });
    });

    modal.querySelectorAll('.exportRecording').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const recording = this.recordingManager.loadRecording(id);
        if (recording) {
          this.recordingManager.exportRecording(recording);
        }
      });
    });

    modal.querySelectorAll('.deleteRecording').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        if (confirm('Delete this recording?')) {
          this.recordingManager.deleteRecording(id);
          modal.remove();
          this.showLoadModal(); // Refresh the list
        }
      });
    });

    document.body.appendChild(modal);
  }

  private importFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          await this.recordingManager.importRecording(file);
          alert('Recording imported successfully!');
        } catch (e) {
          alert('Failed to import recording: ' + (e as Error).message);
        }
      }
    };
    input.click();
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  public unmount(): void {
    this.container.remove();
    this.hideCountdown();
    this.hideRecordingModal();
    
    if (this.uiUpdateInterval) {
      clearInterval(this.uiUpdateInterval);
      this.uiUpdateInterval = null;
    }
  }
} 