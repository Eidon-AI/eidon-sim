import { RecordingManager, Recording } from '../../core/RecordingManager';

export class RecordingControls {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private recordingManager: RecordingManager;
  private countdownOverlay: HTMLElement | null = null;
  private recordingModal: HTMLElement | null = null;
  private loadModal: HTMLElement | null = null;
  private currentRecording: Recording | null = null;
  private isDraggingScrubber = false;
  private lastSeekTime = 0;
  private pausedForDrag = false;
  
  constructor(recordingManager: RecordingManager) {
    this.recordingManager = recordingManager;
    this.container = this.createContainer();
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);
    
    this.setupEventListeners();
    this.updateUI();
  }

  private setupEventListeners(): void {
    this.recordingManager.addEventListener('recordingStateChanged', (e) => {
      const { state, recording } = (e as CustomEvent<any>).detail;
      this.handleRecordingStateChange(state, recording);
    });

    this.recordingManager.addEventListener('playbackStateChanged', (e) => {
      const { state } = (e as CustomEvent<any>).detail;
      // Only update UI when state changes, not on position updates
      if (state) {
        this.updateUI();
      }
    });

    this.recordingManager.addEventListener('playbackPositionUpdate', (e) => {
      const { position, duration } = (e as CustomEvent<any>).detail;
      this.updateScrubberWithValues(position, duration);
    });

    this.recordingManager.addEventListener('countdown', (e) => {
      const { count } = (e as CustomEvent<any>).detail;
      this.updateCountdown(count);
    });
  }

  private updateScrubberWithValues(position: number, duration: number): void {
    const scrubber = this.toolbar.querySelector('input[type="range"]') as HTMLInputElement;
    const timeDisplay = this.toolbar.querySelector('.font-mono') as HTMLElement;
    
    if (scrubber && timeDisplay) {
      // Completely skip slider value updates while dragging - let browser handle it
      if (this.isDraggingScrubber) {
        // Only update time display during drag, not slider value
        return;
      }
      
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
    toolbar.className = 'bg-neutral-900/50 backdrop-blur-sm border border-neutral-700/60 rounded-full px-4 py-2 shadow-lg flex items-center gap-3 text-white';
    return toolbar;
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
      <div class="bg-neutral-800/90 backdrop-blur-sm p-6 rounded-lg max-w-md w-full mx-4 text-white">
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
          <button id="playRecording" class="btn flex-1">▶ Play</button>
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
    
    // Don't rebuild UI while user is dragging - it would destroy the slider
    if (this.isDraggingScrubber) {
      console.log('Skipping UI rebuild during drag');
      return;
    }
    
    // Clear toolbar
    this.toolbar.innerHTML = '';

    // Playback indicator when active
    if (playbackState === 'playing' || playbackState === 'paused') {
      const indicator = document.createElement('div');
      indicator.className = 'px-3 py-1 bg-blue-900/80 border border-blue-600 rounded-full text-blue-200 text-sm font-medium';
      indicator.textContent = '📹 PLAYBACK MODE';
      this.toolbar.appendChild(indicator);
    }

    // Recording controls (only when not playing back)
    if (recordingState === 'idle' && playbackState === 'stopped') {
      const recordBtn = this.createButton('🔴 Record', 'Record', () => {
        this.recordingManager.startRecording();
      });
      this.toolbar.appendChild(recordBtn);
    } else if (recordingState === 'recording') {
      // Stop button will be added at the end
    }

    // Playback controls
    if (playbackState === 'playing') {
      const pauseBtn = this.createButton('||', 'Pause', () => {
        this.recordingManager.pausePlayback();
      }, {
        width: 38,
        fontWeight: 'bolder',
        letterSpacing: 1.5,
        paddingLeft: 13
      });
      this.toolbar.appendChild(pauseBtn);

      // Progress scrubber
      this.toolbar.appendChild(this.createScrubber());
    } else if (playbackState === 'paused') {
      const playBtn = this.createButton('▶', 'Resume', () => {
        this.recordingManager.resumePlayback();
      }, {
        width: 38,
        fontWeight: 'bolder',
        letterSpacing: 1.5,
        paddingLeft: 13
      });
      this.toolbar.appendChild(playBtn);

      // Progress scrubber
      this.toolbar.appendChild(this.createScrubber());
    }

    // File management controls (only when not recording/playing)
    if (recordingState === 'idle' && playbackState === 'stopped') {
      const loadBtn = this.createButton('📂', 'Load', () => {
        this.showLoadModal();
      });
      this.toolbar.appendChild(loadBtn);
    }

    // Add stop buttons at the end
    if (recordingState === 'recording') {
      const stopBtn = this.createButton('✕', 'Stop Recording', () => {
        this.recordingManager.stopRecording();
      });
      stopBtn.className += ' bg-red-900/80 border-red-600 text-red-200';
      this.toolbar.appendChild(stopBtn);
    }

    if (playbackState === 'playing' || playbackState === 'paused') {
      const stopBtn = this.createButton('✕', 'Stop', () => {
        this.recordingManager.stopPlayback();
      });
      this.toolbar.appendChild(stopBtn);
    }
  }

  private createButton(icon: string, tooltip: string, onClick: () => void, styles?: Record<string, string | number>): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'px-3 py-2 rounded-full hover:bg-neutral-700 border border-transparent hover:border-neutral-600 transition-colors flex items-center gap-1 text-sm text-white';
    btn.innerHTML = icon;
    btn.title = tooltip;
    btn.addEventListener('click', onClick);
    if (styles) {
      Object.entries(styles).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Convert camelCase to kebab-case and handle number values
          const cssProperty = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
          const cssValue = typeof value === 'number' ? `${value}px` : String(value);
          btn.style.setProperty(cssProperty, cssValue);
        }
      });
    }
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

    // Simplified drag handling - let browser control slider, we just track state
    const startDrag = () => {
      this.isDraggingScrubber = true;
      console.log('Drag started - disabling automatic slider updates');
      
      // Pause playback if it's currently playing
      if (this.recordingManager.playbackState === 'playing') {
        this.pausedForDrag = true;
        this.recordingManager.pausePlayback();
        console.log('Paused playback for dragging');
      }
    };

    const endDrag = () => {
      if (this.isDraggingScrubber) {
        this.isDraggingScrubber = false;
        console.log('Drag ended - resuming automatic slider updates');
        
        // Resume playback if we paused it for dragging
        if (this.pausedForDrag) {
          this.pausedForDrag = false;
          this.recordingManager.resumePlayback();
          console.log('Resumed playback after dragging');
        }
      }
    };

    const handleInput = () => {
      const newPosition = parseFloat(scrubber.value);
      // Always update time display immediately
      timeDisplay.textContent = `${this.formatTime(newPosition)} / ${this.formatTime(duration)}`;
      // Seek to new position
      this.recordingManager.seekTo(newPosition);
    };

    // Mouse events
    scrubber.addEventListener('mousedown', startDrag);
    document.addEventListener('mouseup', this.handleGlobalMouseUp);

    // Touch events for mobile
    scrubber.addEventListener('touchstart', startDrag);
    document.addEventListener('touchend', this.handleGlobalTouchEnd);

    // Input event for real-time updates during drag
    scrubber.addEventListener('input', handleInput);

    container.appendChild(timeDisplay);
    container.appendChild(scrubber);
    
    return container;
  }

  private showLoadModal(): void {
    const recordings = this.recordingManager.getRecordings();
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    // Store reference to modal for refreshing
    this.loadModal = modal;
    
    this.renderLoadModalContent(modal, recordings);

    // Event listeners
    modal.querySelector('#closeLoadModal')?.addEventListener('click', () => {
      modal.remove();
      this.loadModal = null;
    });

    this.setupImportHandler(modal);
    this.setupRecordingListHandlers(modal);

    document.body.appendChild(modal);
  }

  private renderLoadModalContent(modal: HTMLElement, recordings: Recording[]): void {
    const recordingsList = recordings.map(recording => {
      const duration = recording.snapshots.length > 0 
        ? recording.snapshots[recording.snapshots.length - 1].time 
        : 0;
      
      return `
        <div class="flex items-center justify-between p-3 hover:bg-neutral-800">
          <div>
            <div class="font-medium text-white cursor-pointer hover:text-blue-400 transition-colors playRecordingTitle" data-id="${recording.id}">${recording.name}</div>
            <div class="text-sm text-neutral-400">
              ${(duration / 1000).toFixed(1)}s • ${recording.devices.length} devices • ${recording.snapshots.length} frames
            </div>
          </div>
          <div class="flex gap-2">
            <button class="loadRecording btn-sm" data-id="${recording.id}">▶ Play</button>
            <button class="exportRecording btn-sm" data-id="${recording.id}">💾</button>
            <button class="deleteRecording btn-sm text-red-400" data-id="${recording.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="bg-neutral-800/90 backdrop-blur-sm p-6 rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-auto text-white">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">Load Recording</h3>
          <button id="closeLoadModal" class="text-neutral-400 hover:text-white">✕</button>
        </div>
        
        <div class="space-y-0 mb-4" id="recordingsList">
          ${recordings.length > 0 ? recordingsList : '<p class="text-neutral-400 text-center py-8">No recordings found</p>'}
        </div>

        <div class="flex justify-center gap-2 pt-4 border-t border-neutral-700">
          <button id="importRecording" class="btn">📥 Import Recording</button>
        </div>
      </div>
    `;
  }

  private refreshLoadModal(): void {
    if (!this.loadModal) return;
    
    const recordings = this.recordingManager.getRecordings();
    
    // Only update the recordings list content, not the entire modal
    const recordingsListContainer = this.loadModal.querySelector('#recordingsList');
    if (!recordingsListContainer) return;
    
    const recordingsList = recordings.map(recording => {
      const duration = recording.snapshots.length > 0 
        ? recording.snapshots[recording.snapshots.length - 1].time 
        : 0;
      
      return `
        <div class="flex items-center justify-between p-3 hover:bg-neutral-800">
          <div>
            <div class="font-medium text-white cursor-pointer hover:text-blue-400 transition-colors playRecordingTitle" data-id="${recording.id}">${recording.name}</div>
            <div class="text-sm text-neutral-400">
              ${(duration / 1000).toFixed(1)}s • ${recording.devices.length} devices • ${recording.snapshots.length} frames
            </div>
          </div>
          <div class="flex gap-2">
            <button class="loadRecording btn-sm" data-id="${recording.id}">▶ Play</button>
            <button class="exportRecording btn-sm" data-id="${recording.id}">💾</button>
            <button class="deleteRecording btn-sm text-red-400" data-id="${recording.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
    
    // Update only the recordings list content
    const newContent = recordings.length > 0 
      ? recordingsList 
      : '<p class="text-neutral-400 text-center py-8">No recordings found</p>';
    
    recordingsListContainer.innerHTML = newContent;
    
    // Re-setup only the recording list handlers (not the close/import handlers)
    this.setupRecordingListHandlers(this.loadModal);
  }

  private setupImportHandler(modal: HTMLElement): void {
    modal.querySelector('#importRecording')?.addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          try {
            await this.recordingManager.importRecording(file);
            alert('Recording imported successfully!');
            
            // Refresh the modal content instead of closing and reopening
            this.refreshLoadModal();
          } catch (e) {
            alert('Failed to import recording: ' + (e as Error).message);
          }
        }
      };
      
      input.click();
    });
  }

  private setupRecordingListHandlers(modal: HTMLElement): void {
    modal.querySelectorAll('.loadRecording').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const recording = this.recordingManager.loadRecording(id);
        if (recording) {
          this.recordingManager.startPlayback(recording);
          modal.remove();
          this.loadModal = null;
        }
      });
    });

    modal.querySelectorAll('.playRecordingTitle').forEach(title => {
      title.addEventListener('click', () => {
        const id = (title as HTMLElement).dataset.id!;
        const recording = this.recordingManager.loadRecording(id);
        if (recording) {
          this.recordingManager.startPlayback(recording);
          modal.remove();
          this.loadModal = null;
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
          // Refresh the modal content instead of closing and reopening
          this.refreshLoadModal();
        }
      });
    });
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  public unmount(): void {
    // Clean up global event listeners to prevent memory leaks
    document.removeEventListener('mouseup', this.handleGlobalMouseUp);
    document.removeEventListener('touchend', this.handleGlobalTouchEnd);
    
    // Clean up DOM elements
    this.container.remove();
    this.hideCountdown();
    this.hideRecordingModal();
    
    // Clean up load modal if it exists
    if (this.loadModal) {
      this.loadModal.remove();
      this.loadModal = null;
    }
  }

  private handleGlobalMouseUp = () => {
    if (this.isDraggingScrubber) {
      this.isDraggingScrubber = false;
      console.log('Drag ended - resuming automatic slider updates');
      
      // Resume playback if we paused it for dragging
      if (this.pausedForDrag) {
        this.pausedForDrag = false;
        this.recordingManager.resumePlayback();
        console.log('Resumed playback after dragging');
      }
    }
  };

  private handleGlobalTouchEnd = () => {
    this.handleGlobalMouseUp(); // Same logic for touch
  };
} 