import { PlaybackManager } from '../../core/PlaybackManager';
import { PlaybackView } from './PlaybackView';
import { fetchSensorData } from '../../utils/sensorDataFetch';
import { RecordingWithUrls, QcStatus } from '../../types/recording';
import styles from './SampleDataPanel.module.css';

const BASE_URL = 'https://storage.googleapis.com/eidon-sample-data';
const CSV_URL = `${BASE_URL}/tracker/tracker-data.csv`;
const STORAGE_KEY = 'eidonSampleAuth';
const PASSWORD = 'eidon*sample*data25';

interface SampleRow {
  counter: number;
  duration: number;
  task: string;
  createdDate: string;
  videoSize: number;
  sensorSize: number;
  recordingVersion: number;
  rawData: boolean;
}

export class SampleDataPanel {
  private playbackManager: PlaybackManager;
  private container: HTMLElement;
  private panelOverlay: HTMLElement | null = null;
  private playbackView: PlaybackView | null = null;
  private rows: SampleRow[] = [];

  constructor(playbackManager: PlaybackManager) {
    this.playbackManager = playbackManager;
    this.container = document.createElement('div');
  }

  mount(root: HTMLElement): void {
    root.appendChild(this.container);

    if (localStorage.getItem(STORAGE_KEY) === '1') {
      this.showPanel();
    } else {
      this.showPasswordGate();
    }
  }

  // ─── Password gate ────────────────────────────────────────────────────────

  private showPasswordGate(): void {
    this.container.innerHTML = `
      <div class="${styles.passwordOverlay}">
        <form class="${styles.passwordForm}" id="samplePasswordForm">
          <label class="${styles.passwordLabel}">
            <span class="${styles.prompt}">&gt;</span>
            <span class="${styles.passwordText}">PASSWORD:</span>
          </label>
          <input
            type="password"
            class="${styles.passwordInput}"
            id="samplePasswordInput"
            autofocus
            required
          />
          <p class="${styles.passwordDescription}">
            Enter the sample data password our team shared.
          </p>
          <div class="${styles.passwordError}" id="samplePasswordError" style="display:none">
            Incorrect password
          </div>
        </form>
      </div>
    `;

    const form = this.container.querySelector('#samplePasswordForm') as HTMLFormElement;
    const input = this.container.querySelector('#samplePasswordInput') as HTMLInputElement;
    const error = this.container.querySelector('#samplePasswordError') as HTMLElement;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value === PASSWORD) {
        localStorage.setItem(STORAGE_KEY, '1');
        this.container.innerHTML = '';
        this.showPanel();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
      }
    });

    input.addEventListener('input', () => {
      error.style.display = 'none';
    });
  }

  // ─── Panel (recording browser) ────────────────────────────────────────────

  private showPanel(): void {
    this.panelOverlay = document.createElement('div');
    this.panelOverlay.className = styles.panelOverlay;
    this.panelOverlay.innerHTML = `
      <div class="${styles.panel}">
        <div class="${styles.panelHeader}">
          <div>
            <h3 class="${styles.panelTitle}">Sample Recordings</h3>
            <p class="${styles.panelSubtext}">Click a recording to play back sensor + video data</p>
          </div>
          <button class="${styles.panelClose}" id="samplePanelClose">&times;</button>
        </div>
        <div class="${styles.panelBody}" id="samplePanelBody">
          <div class="${styles.loading}">Loading recordings...</div>
        </div>
      </div>
    `;

    this.container.appendChild(this.panelOverlay);

    this.panelOverlay.querySelector('#samplePanelClose')!.addEventListener('click', () => {
      this.closePanel();
    });

    // Close on backdrop click
    this.panelOverlay.addEventListener('click', (e) => {
      if (e.target === this.panelOverlay) this.closePanel();
    });

    this.loadRecordings();
  }

  public show(): void {
    if (this.panelOverlay) return;
    this.showPanel();
  }

  private closePanel(): void {
    if (this.panelOverlay) {
      this.panelOverlay.remove();
      this.panelOverlay = null;
    }
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  private async loadRecordings(): Promise<void> {
    const body = this.panelOverlay?.querySelector('#samplePanelBody') as HTMLElement | null;
    if (!body) return;

    try {
      this.rows = await this.fetchCSV();
      body.innerHTML = this.renderGrid(this.rows);
      this.attachPlayListeners();
      this.loadThumbnails(this.rows);
    } catch {
      body.innerHTML = `<div class="${styles.error}">Failed to load recordings. Please try again.</div>`;
    }
  }

  private async fetchCSV(): Promise<SampleRow[]> {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
      const v = line.split(',').map(s => s.trim());
      return {
        counter: parseInt(v[0], 10) || 0,
        duration: parseInt(v[1], 10) || 0,
        task: v[2] || '',
        createdDate: v[3] || '',
        videoSize: parseInt(v[4], 10) || 0,
        sensorSize: parseInt(v[5], 10) || 0,
        recordingVersion: parseInt(v[6], 10) || 1,
        rawData: v[7]?.toLowerCase() === 'true',
      };
    });
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  private formatTask(task: string): string {
    return task
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (diffDays === 0) return `Today`;
    if (diffDays === 1) return `Yesterday`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private renderGrid(rows: SampleRow[]): string {
    if (rows.length === 0) {
      return `<div class="${styles.empty}">No recordings available</div>`;
    }

    return `
      <div class="${styles.grid}">
        ${rows.map(row => `
          <div class="${styles.card}">
            <div class="${styles.cardThumb}">
              <img class="${styles.thumbImg}" data-thumb="${row.counter}" style="display:none" alt="" />
              <div class="${styles.thumbPlaceholder}" data-placeholder="${row.counter}">
                <i class="fas fa-wave-square"></i>
              </div>
              <span class="${styles.badge}">
                <i class="fas fa-wave-square"></i> Tracker
              </span>
            </div>
            <div class="${styles.cardInfo}">
              <p class="${styles.cardTask}">${this.formatTask(row.task)}</p>
              <p class="${styles.cardMeta}">${this.formatDuration(row.duration)} &middot; ${this.formatDate(row.createdDate)}</p>
              <button class="${styles.playBtn}" data-counter="${row.counter}">
                <i class="fas fa-play"></i> Play
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── Thumbnails ───────────────────────────────────────────────────────────

  private loadThumbnails(rows: SampleRow[]): void {
    const CONCURRENCY = 4;
    let index = 0;

    const next = () => {
      if (index >= rows.length) return;
      const row = rows[index++];
      this.extractThumbnail(row.counter).then(next).catch(next);
    };

    for (let i = 0; i < CONCURRENCY; i++) next();
  }

  private extractThumbnail(counter: number): Promise<void> {
    return new Promise((resolve) => {
      const videoUrl = `${BASE_URL}/tracker/${counter}_video.mp4`;
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'metadata';

      const cleanup = () => {
        video.src = '';
        video.load();
      };

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

          const img = this.panelOverlay?.querySelector(`[data-thumb="${counter}"]`) as HTMLImageElement | null;
          const placeholder = this.panelOverlay?.querySelector(`[data-placeholder="${counter}"]`) as HTMLElement | null;
          if (img && placeholder) {
            img.src = dataUrl;
            img.style.display = 'block';
            placeholder.style.display = 'none';
          }
        } catch {
          // canvas taint or other error — leave placeholder
        }
        cleanup();
        resolve();
      }, { once: true });

      video.addEventListener('error', () => { cleanup(); resolve(); }, { once: true });

      video.src = videoUrl;
      video.currentTime = 0.5;
    });
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  private attachPlayListeners(): void {
    this.panelOverlay?.querySelectorAll(`.${styles.playBtn}`).forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const counter = parseInt((e.currentTarget as HTMLElement).dataset.counter || '0', 10);
        const row = this.rows.find(r => r.counter === counter);
        if (row) await this.playRecording(row, e.currentTarget as HTMLButtonElement);
      });
    });
  }

  private async playRecording(row: SampleRow, btn: HTMLButtonElement): Promise<void> {
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

    const sensorUrl = `${BASE_URL}/tracker/${row.counter}_sensor.json`;
    const videoUrl = `${BASE_URL}/tracker/${row.counter}_video.mp4`;

    try {
      const sensorData = await fetchSensorData(sensorUrl);

      if (!sensorData?.devices || !sensorData?.snapshots) {
        throw new Error('Invalid sensor data format: missing devices or snapshots');
      }

      // Close panel so full playback screen is visible
      this.closePanel();

      // Position camera to back view (same as Controls.handlePlayback)
      document.dispatchEvent(new CustomEvent('cameraViewChange', {
        detail: {
          position: [0, 1, 5.5] as [number, number, number],
          target: [0, 0.5, 0] as [number, number, number],
        }
      }));

      const recording = {
        id: `sample-${row.counter}`,
        videoReadUrl: videoUrl,
        sensorDataReadUrl: sensorUrl,
        thumbnailReadUrl: null,
        videoOnly: false,
        videoUrl: '',
        sensorDataUrl: sensorUrl,
        thumbnailUrl: null,
        duration: row.duration,
        recordingVersion: String(row.recordingVersion),
        taskType: null,
        completed: true,
        valid: true,
        qcStatus: QcStatus.VALID,
        qcMetadata: null,
        userId: '',
        user: {} as any,
        createdAt: new Date(row.createdDate),
        updatedAt: new Date(row.createdDate),
      } as unknown as RecordingWithUrls;

      this.playbackView = new PlaybackView(
        this.playbackManager,
        sensorData,
        recording,
        () => { this.playbackView = null; }
      );
      this.playbackView.mount(document.body);
    } catch (err) {
      console.error('Failed to load sample recording:', err);
      alert('Failed to load recording. Please try again.');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}
