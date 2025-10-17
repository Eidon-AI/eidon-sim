import { PlaybackManager } from '../../core/PlaybackManager';
import { SensorRecording } from '../../types/sensorData';
import { RecordingWithUrls } from '../../types/recording';
import styles from './styles/PlaybackView.module.css';

export class PlaybackView {
  private container: HTMLElement;
  private videoElement: HTMLVideoElement | null = null;
  private playbackManager: PlaybackManager;
  private sensorData: SensorRecording;
  private apiRecording: RecordingWithUrls;
  private isPlaying: boolean = false;
  private isSeeking: boolean = false;
  private animationFrameId: number | null = null;
  private onExit: () => void;

  constructor(
    playbackManager: PlaybackManager,
    sensorData: SensorRecording,
    apiRecording: RecordingWithUrls,
    onExit: () => void
  ) {
    this.playbackManager = playbackManager;
    this.sensorData = sensorData;
    this.apiRecording = apiRecording;
    this.onExit = onExit;
    this.container = this.createContainer();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = styles.overlay;
    container.innerHTML = `
      <div class="${styles.videoContainer}">
        <video 
          class="${styles.video}" 
          src="${this.apiRecording.videoReadUrl}"
          playsinline
        ></video>
      </div>
      <div class="${styles.controlsContainer}">
        <div class="${styles.timelineContainer}">
          <div class="${styles.timeline}" data-timeline>
            <div class="${styles.timelineProgress}" data-progress></div>
            <div class="${styles.timelineThumb}" data-thumb></div>
          </div>
        </div>
        <div class="${styles.controlsRow}">
          <div class="${styles.playbackButtons}">
            <button class="${styles.controlButton}" data-skip-back title="Skip back 5s">
              <i class="fas fa-backward"></i>
            </button>
            <button class="${styles.controlButton} ${styles.playButton}" data-play-pause title="Play/Pause">
              <i class="fas fa-play"></i>
            </button>
            <button class="${styles.controlButton}" data-skip-forward title="Skip forward 5s">
              <i class="fas fa-forward"></i>
            </button>
          </div>
          <div class="${styles.timeDisplay}" data-time-display>
            0:00 / 0:00
          </div>
          <div class="${styles.volumeControls}">
            <button class="${styles.controlButton}" data-mute title="Mute/Unmute">
              <i class="fas fa-volume-up"></i>
            </button>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value="70" 
              class="${styles.volumeSlider}" 
              data-volume
              title="Volume"
            />
          </div>
          <button class="${styles.exitButton}" data-exit>
            <i class="fas fa-times"></i>
            <span>Exit Playback</span>
          </button>
        </div>
      </div>
    `;
    return container;
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
    this.videoElement = this.container.querySelector('video');
    this.attachEventListeners();
    this.startPlayback();
  }

  private attachEventListeners(): void {
    if (!this.videoElement) return;

    // Play/Pause button
    const playPauseBtn = this.container.querySelector('[data-play-pause]') as HTMLButtonElement;
    playPauseBtn.addEventListener('click', () => this.togglePlayPause());

    // Skip buttons
    const skipBackBtn = this.container.querySelector('[data-skip-back]') as HTMLButtonElement;
    skipBackBtn.addEventListener('click', () => this.skip(-5));

    const skipForwardBtn = this.container.querySelector('[data-skip-forward]') as HTMLButtonElement;
    skipForwardBtn.addEventListener('click', () => this.skip(5));

    // Volume slider
    const volumeSlider = this.container.querySelector('[data-volume]') as HTMLInputElement;
    volumeSlider.addEventListener('input', (e) => this.handleVolumeChange(e));

    // Mute button
    const muteBtn = this.container.querySelector('[data-mute]') as HTMLButtonElement;
    muteBtn.addEventListener('click', () => this.toggleMute());

    // Timeline scrubbing - simplified for better reliability
    const timeline = this.container.querySelector('[data-timeline]') as HTMLElement;
    timeline.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isSeeking = true;
      this.handleTimelineDrag(e);
      
      const handleMove = (moveEvent: MouseEvent) => {
        if (this.isSeeking) {
          this.handleTimelineDrag(moveEvent);
        }
      };
      
      const handleUp = () => {
        this.isSeeking = false;
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    });

    // Exit button
    const exitBtn = this.container.querySelector('[data-exit]') as HTMLButtonElement;
    exitBtn.addEventListener('click', () => this.exit());

    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyPress);

    // Video events
    this.videoElement.addEventListener('loadedmetadata', () => {
      console.log('Video loaded, duration:', this.videoElement?.duration);
      this.updateTimeDisplay();
      // Set initial volume
      this.videoElement!.volume = 0.7;
      volumeSlider.value = '70';
      volumeSlider.style.setProperty('--volume-percent', '70%');
    });

    this.videoElement.addEventListener('ended', () => {
      this.handleVideoEnd();
    });

    // Sync loop
    this.startSyncLoop();
  }

  private handleKeyPress = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.exit();
    } else if (e.key === ' ') {
      e.preventDefault();
      this.togglePlayPause();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.skip(-5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.skip(5);
    }
  };

  private startPlayback(): void {
    if (!this.videoElement) return;

    // Start sensor data playback
    this.playbackManager.startPlayback(this.sensorData);

    // Start video playback (autoplay)
    this.videoElement.play().then(() => {
      this.isPlaying = true;
      this.updatePlayPauseButton();
      console.log('Playback started (video + sensor data)');
    }).catch(error => {
      console.error('Failed to autoplay video:', error);
      // If autoplay fails, pause the sensor playback too
      this.playbackManager.pausePlayback();
    });
  }

  private togglePlayPause(): void {
    if (!this.videoElement) return;

    if (this.isPlaying) {
      this.videoElement.pause();
      this.playbackManager.pausePlayback();
      this.isPlaying = false;
    } else {
      this.videoElement.play();
      this.playbackManager.resumePlayback();
      this.isPlaying = true;
    }
    this.updatePlayPauseButton();
  }

  private skip(seconds: number): void {
    if (!this.videoElement) return;

    const newTime = Math.max(0, Math.min(this.videoElement.currentTime + seconds, this.videoElement.duration));
    this.seekTo(newTime);
  }

  private seekTo(timeInSeconds: number): void {
    if (!this.videoElement) return;

    // Update video
    this.videoElement.currentTime = timeInSeconds;

    // Update sensor playback (convert to milliseconds)
    const timeInMs = timeInSeconds * 1000;
    this.playbackManager.seekTo(timeInMs);
  }

  private handleTimelineDrag(e: MouseEvent): void {
    if (!this.videoElement || !this.videoElement.duration) return;
    
    const timeline = this.container.querySelector('[data-timeline]') as HTMLElement;
    const rect = timeline.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const timeInSeconds = percent * this.videoElement.duration;
    
    this.seekTo(timeInSeconds);
  }

  private handleVolumeChange(e: Event): void {
    if (!this.videoElement) return;
    const slider = e.target as HTMLInputElement;
    const volume = parseInt(slider.value) / 100;
    this.videoElement.volume = volume;
    
    // Update volume slider fill position
    slider.style.setProperty('--volume-percent', slider.value + '%');
    
    // Update mute button icon if volume is 0
    this.updateMuteButton();
  }

  private toggleMute(): void {
    if (!this.videoElement) return;
    
    this.videoElement.muted = !this.videoElement.muted;
    this.updateMuteButton();
  }

  private updateMuteButton(): void {
    if (!this.videoElement) return;
    
    const muteBtn = this.container.querySelector('[data-mute]') as HTMLButtonElement;
    const icon = muteBtn.querySelector('i');
    
    if (icon) {
      if (this.videoElement.muted || this.videoElement.volume === 0) {
        icon.className = 'fas fa-volume-mute';
      } else if (this.videoElement.volume < 0.5) {
        icon.className = 'fas fa-volume-down';
      } else {
        icon.className = 'fas fa-volume-up';
      }
    }
  }

  private startSyncLoop(): void {
    const update = () => {
      if (!this.isSeeking) {
        this.updateTimeline();
        this.updateTimeDisplay();
      }
      this.animationFrameId = requestAnimationFrame(update);
    };
    this.animationFrameId = requestAnimationFrame(update);
  }

  private updateTimeline(): void {
    if (!this.videoElement) return;

    const progress = this.container.querySelector('[data-progress]') as HTMLElement;
    const thumb = this.container.querySelector('[data-thumb]') as HTMLElement;

    const percent = (this.videoElement.currentTime / this.videoElement.duration) * 100;
    progress.style.width = `${percent}%`;
    thumb.style.left = `${percent}%`;
  }

  private updateTimeDisplay(): void {
    if (!this.videoElement) return;

    const display = this.container.querySelector('[data-time-display]') as HTMLElement;
    const current = this.formatTime(this.videoElement.currentTime);
    const duration = this.formatTime(this.videoElement.duration);
    display.textContent = `${current} / ${duration}`;
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private updatePlayPauseButton(): void {
    const playPauseBtn = this.container.querySelector('[data-play-pause]') as HTMLButtonElement;
    const icon = playPauseBtn.querySelector('i');
    if (icon) {
      icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }
  }

  private handleVideoEnd(): void {
    this.isPlaying = false;
    this.updatePlayPauseButton();
    // Sensor playback loops automatically, but we stop it here
    this.playbackManager.pausePlayback();
  }

  private exit(): void {
    // Stop playback (this removes temporary devices and cleans up vectors)
    if (this.videoElement) {
      this.videoElement.pause();
    }
    this.playbackManager.stopPlayback();

    // Clean up animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyPress);

    // Return camera to default position
    this.returnCameraToDefault();

    // Remove from DOM
    this.container.remove();

    // Call exit callback
    this.onExit();
  }

  private returnCameraToDefault(): void {
    // Animate back to default view (key "9" position)
    const defaultView = {
      position: [1.5, 1.5, -3] as [number, number, number],
      target: [-0.1, 0.15, 0] as [number, number, number]
    };
    
    document.dispatchEvent(new CustomEvent('cameraViewChange', { detail: defaultView }));
  }

  public destroy(): void {
    this.exit();
  }
}

