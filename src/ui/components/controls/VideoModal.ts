import { SensorRecording } from '../../../types/sensorData';
import styles from './styles/VideoModal.module.css';

export interface VideoModalCallbacks {
  onPlayback: (recording: any) => void;
}

export class VideoModal {
  private modal: HTMLElement | null = null;
  private videoUrl: string;
  private recording: any;
  private callbacks: VideoModalCallbacks;

  constructor(videoUrl: string, recording: any, callbacks: VideoModalCallbacks) {
    this.videoUrl = videoUrl;
    this.recording = recording;
    this.callbacks = callbacks;
    this.modal = this.createModal();
  }

  mount(): void {
    if (this.modal) {
      document.body.appendChild(this.modal);
      this.loadSensorDataAndUpdateModal();
    }
  }

  unmount(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = styles.videoModalOverlay;
    modal.innerHTML = `
      <div class="${styles.videoModalContainer}">
        <button class="${styles.videoModalClose}">
          <i class="fas fa-times"></i>
        </button>
        <div class="${styles.videoModalContent}">
          <video class="${styles.videoPlayer}" controls>
            <source src="${this.videoUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <div class="${styles.videoModalInfo}">
            <div class="${styles.sensorDataOverview}">
              <h4>Sensor Data Overview</h4>
              <div class="${styles.sensorStatsGrid}">
                <div class="${styles.sensorStat}">
                  <span class="${styles.statValue}">Loading...</span>
                  <span class="${styles.statLabel}">Devices</span>
                </div>
                <div class="${styles.sensorStat}">
                  <span class="${styles.statValue}">Loading...</span>
                  <span class="${styles.statLabel}">Duration</span>
                </div>
                <div class="${styles.sensorStat}">
                  <span class="${styles.statValue}">Loading...</span>
                  <span class="${styles.statLabel}">Sample Rate</span>
                </div>
                <div class="${styles.sensorStat}">
                  <span class="${styles.statValue}">Loading...</span>
                  <span class="${styles.statLabel}">Data Points</span>
                </div>
              </div>
              <div class="${styles.videoModalActions}">
                <button class="${styles.deviceDataButton}" title="Playback video + device simulation">
                  <i class="fas fa-play-circle"></i>
                  <span>Playback Device Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    const closeBtn = modal.querySelector(`.${styles.videoModalClose}`) as HTMLButtonElement;
    const deviceDataBtn = modal.querySelector(`.${styles.deviceDataButton}`) as HTMLButtonElement;

    closeBtn.addEventListener('click', () => {
      this.unmount();
    });

    deviceDataBtn.addEventListener('click', () => {
      this.callbacks.onPlayback(this.recording);
      this.unmount();
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.unmount();
      }
    });

    return modal;
  }

  private async loadSensorDataAndUpdateModal(): Promise<void> {
    if (!this.modal) return;

    if (!this.recording.sensorDataReadUrl) {
      this.updateSensorDataWithError('No sensor data available');
      return;
    }

    const response = await fetch(this.recording.sensorDataReadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sensor data: ${response.status}`);
    }

    const sensorData: SensorRecording = await response.json();
    this.updateSensorDataInModal(sensorData);
  }

  private updateSensorDataInModal(sensorData: SensorRecording): void {
    if (!this.modal) return;

    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      if (hours < 1) {
        return `${minutes}m`;
      } else if (hours >= 10) {
        return `${hours}h`;
      } else {
        return `${hours}h ${minutes}m`;
      }
    };

    const deviceCount = sensorData.devices ? sensorData.devices.length : 0;
    const duration = this.recording.duration ? formatDuration(this.recording.duration) : 'Unknown';
    const sampleRate = sensorData.sampleRate ? `${sensorData.sampleRate} Hz` : 'Unknown';
    const dataPoints = sensorData.snapshots ? sensorData.snapshots.length : 0;

    const statValues = this.modal.querySelectorAll(`.${styles.statValue}`);
    if (statValues.length >= 4) {
      statValues[0].textContent = deviceCount.toString();
      statValues[1].textContent = duration;
      statValues[2].textContent = sampleRate;
      statValues[3].textContent = dataPoints.toLocaleString();
    }
  }

  private updateSensorDataWithError(errorMessage: string = 'Failed to load sensor data'): void {
    if (!this.modal) return;

    const statValues = this.modal.querySelectorAll(`.${styles.statValue}`);
    statValues.forEach(stat => {
      stat.textContent = 'Error';
      (stat as HTMLElement).style.color = '#f44336';
    });
  }
}

