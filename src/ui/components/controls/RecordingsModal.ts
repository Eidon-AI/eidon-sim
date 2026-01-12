import { LoginStateManager } from '../../../core/LoginStateManager';
import { PaginatedRecordingsResponse } from '../../../types/recording';
import styles from './styles/RecordingsModal.module.css';

export interface RecordingsModalCallbacks {
  onPlayback: (recording: any) => void;
  onShowVideoModal: (videoUrl: string, recording: any) => void;
  onClose: () => void;
}

export class RecordingsModal {
  private modal: HTMLElement | null = null;
  private parent: HTMLElement;
  private toolbar: HTMLElement;
  private loginStateManager: LoginStateManager;
  private callbacks: RecordingsModalCallbacks;
  private currentRecordings: any[] = [];

  constructor(parent: HTMLElement, toolbar: HTMLElement, callbacks: RecordingsModalCallbacks) {
    this.parent = parent;
    this.toolbar = toolbar;
    this.loginStateManager = LoginStateManager.getInstance();
    this.callbacks = callbacks;
    this.modal = this.createModal('Loading recordings...');
  }

  mount(): void {
    if (this.modal) {
      this.parent.appendChild(this.modal);
      this.positionModal(this.modal);
      this.loadRecordings();
    }
  }

  unmount(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  private positionModal(modal: HTMLElement): void {
    // On mobile, CSS handles full-screen positioning
    if (window.innerWidth > 768) {
      // Desktop positioning relative to toolbar
      const toolbarRect = this.toolbar.getBoundingClientRect();
      const modalWidth = 1000; // Recordings modal is wider
      const left = toolbarRect.left + (toolbarRect.width - modalWidth) / 2;
      const top = toolbarRect.bottom + 16;
      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
    }
    // Mobile positioning is handled by CSS media query
  }

  private createModal(content: string): HTMLElement {
    const modal = document.createElement('div');
    modal.className = styles.modal;
    modal.innerHTML = `
      <div class="${styles.modalContent}">
        <button class="${styles.modalClose}">&times;</button>
        <div class="${styles.modalBody}">
          ${content}
        </div>
      </div>
    `;
    
    const closeBtn = modal.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.callbacks.onClose();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.callbacks.onClose();
      }
    });
    
    return modal;
  }

  private async loadRecordings(): Promise<void> {
    try {
      const recordings = await this.fetchUserRecordings();
      console.log('Fetched recordings:', recordings);
      this.updateModal(recordings);
    } catch (error) {
      console.error('Failed to fetch recordings:', error);
      this.updateModal(null, 'Failed to load recordings');
    }
  }

  private async fetchUserRecordings(page: number = 1, limit: number = 10): Promise<PaginatedRecordingsResponse | null> {
    const state = this.loginStateManager.getState();
    const tokens = state.tokens;
    
    if (!tokens?.token) {
      throw new Error('No access token available');
    }

    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_URL environment variable is not set');
    }

    const response = await fetch(`${apiUrl}/recordings/user-recordings?page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokens.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 401) {
        console.log('Unauthorized response received, logging out user');
        this.loginStateManager.logout();
        throw new Error('Session expired. Please log in again.');
      }
      
      throw new Error(`Failed to fetch recordings: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API response:', data);
    return data;
  }

  private updateModal(recordings: PaginatedRecordingsResponse | null, errorMessage?: string): void {
    if (!this.modal) return;

    const modalBody = this.modal.querySelector(`.${styles.modalBody}`) as HTMLElement;
    
    if (errorMessage) {
      modalBody.innerHTML = `<div class="${styles.errorMessage}">${errorMessage}</div>`;
      this.currentRecordings = [];
      return;
    }

    if (!recordings || !recordings.recordings || recordings.recordings.length === 0) {
      modalBody.innerHTML = `<div class="${styles.noRecordings}">No recordings found</div>`;
      this.currentRecordings = [];
      return;
    }

    this.currentRecordings = recordings.recordings;
    
    modalBody.innerHTML = this.createRecordingsGrid(recordings);
    this.attachEventListeners();
  }

  private createRecordingsGrid(recordings: PaginatedRecordingsResponse): string {
    const formatTaskType = (taskType: string | null): string => {
      if (!taskType) return 'No task type';
      return taskType.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    };

    const formatDate = (dateString: string): string => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (diffDays === 1) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (diffDays < 7) {
        return `${diffDays} days ago`;
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      }
    };

    const recordingsGrid = recordings.recordings.map(recording => `
      <div class="${styles.recordingCard}" data-recording-id="${recording.id}">
        <div class="${styles.recordingThumbnail}">
          ${recording.thumbnailReadUrl ? 
            `<img src="${recording.thumbnailReadUrl}" alt="Recording thumbnail" />` :
            `<div class="${styles.thumbnailPlaceholder}">No thumbnail</div>`
          }
          <button class="${styles.videoPlayButton}" data-video-url="${recording.videoReadUrl}">
            <i class="fas fa-play"></i>
          </button>
        </div>
        <div class="${styles.recordingInfo}">
          <h4 class="${styles.recordingTask}">${formatTaskType(recording.taskType)}</h4>
          <p class="${styles.recordingDate}">${formatDate(recording.createdAt.toString())}</p>
          <button class="${styles.playbackButton}" title="Playback video + device simulation">
            <i class="fas fa-play-circle"></i>
            <span>Playback Data</span>
          </button>
        </div>
      </div>
    `).join('');

    const pagination = this.createPagination(recordings.pagination);

    return `
      <div class="${styles.recordingsContainer}">
        <div class="${styles.recordingsHeader}">
          <div class="${styles.headerLeft}">
            <h3>Your Recordings (${recordings.pagination.total})</h3>
          </div>
          ${pagination ? `<div class="${styles.headerRight}">${pagination}</div>` : ''}
        </div>
        <div class="${styles.recordingsGrid}">
          ${recordingsGrid}
        </div>
      </div>
    `;
  }

  private createPagination(pagination: any): string {
    const pages = [];
    const currentPage = pagination.page;
    const totalPages = pagination.totalPages;

    if (totalPages <= 1) {
      // Don't show pagination if there's only one page
      return '';
    }

    if (pagination.hasPrev) {
      pages.push(`<button class="${styles.pageButton} prev-button" data-page="${currentPage - 1}">
        <i class="fas fa-chevron-left"></i> Previous
      </button>`);
    }

    const showPage = (pageNum: number) => {
      if (pageNum === currentPage) {
        pages.push(`<button class="${styles.pageButton} ${styles.pageButtonCurrentPage}">${pageNum}</button>`);
      } else {
        pages.push(`<button class="${styles.pageButton}" data-page="${pageNum}">${pageNum}</button>`);
      }
    };

    if (totalPages <= 10) {
      for (let i = 1; i <= totalPages; i++) {
        showPage(i);
      }
    } else {
      showPage(1);

      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (startPage > 2) {
        pages.push(`<span class="${styles.pageEllipsis}">...</span>`);
      }

      for (let i = startPage; i <= endPage; i++) {
        showPage(i);
      }

      if (endPage < totalPages - 1) {
        pages.push(`<span class="${styles.pageEllipsis}">...</span>`);
      }

      showPage(totalPages);
    }

    if (pagination.hasNext) {
      pages.push(`<button class="${styles.pageButton} next-button" data-page="${currentPage + 1}">
        Next <i class="fas fa-chevron-right"></i>
      </button>`);
    }

    return `
      <div class="${styles.pagination}">
        ${pages.join('')}
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.modal) return;

    const videoButtons = this.modal.querySelectorAll(`.${styles.videoPlayButton}`);
    videoButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const videoUrl = target.closest(`.${styles.videoPlayButton}`)?.getAttribute('data-video-url');
        const recordingCard = target.closest(`.${styles.recordingCard}`);
        const recordingId = recordingCard?.getAttribute('data-recording-id');
        
        if (videoUrl && recordingId) {
          const recording = this.findRecordingById(recordingId);
          if (recording) {
            this.callbacks.onShowVideoModal(videoUrl, recording);
          }
        }
      });
    });

    const playbackButtons = this.modal.querySelectorAll(`.${styles.playbackButton}`);
    playbackButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const recordingCard = target.closest(`.${styles.recordingCard}`);
        const recordingId = recordingCard?.getAttribute('data-recording-id');
        if (recordingId) {
          const recording = this.findRecordingById(recordingId);
          if (recording) {
            console.log('Playback button clicked for recording:', recordingId);
            this.callbacks.onPlayback(recording);
          }
        }
      });
    });

    const pageButtons = this.modal.querySelectorAll(`.${styles.pageButton}[data-page]`);
    pageButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const page = target.getAttribute('data-page');
        if (page) {
          await this.loadRecordingsPage(parseInt(page));
        }
      });
    });
  }

  private async loadRecordingsPage(page: number): Promise<void> {
    try {
      const recordings = await this.fetchUserRecordings(page, 10);
      this.updateModal(recordings);
    } catch (error) {
      console.error('Failed to load recordings page:', error);
    }
  }

  private findRecordingById(recordingId: string): any | null {
    return this.currentRecordings.find(recording => recording.id === recordingId) || null;
  }
}

