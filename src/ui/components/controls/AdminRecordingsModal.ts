import { LoginStateManager } from '../../../core/LoginStateManager';
import { AdminRecording, PaginatedRecordingsResponse } from '../../../types/recording';
import styles from './styles/RecordingsModal.module.css';

export interface AdminRecordingsModalCallbacks {
  onPlayback: (recording: any) => void;
  onShowVideoModal: (videoUrl: string, recording: any) => void;
  onClose: () => void;
}

export class AdminRecordingsModal {
  private modal: HTMLElement | null = null;
  private parent: HTMLElement;
  private toolbar: HTMLElement;
  private loginStateManager: LoginStateManager;
  private callbacks: AdminRecordingsModalCallbacks;
  private currentRecordings: AdminRecording[] = [];
  private pagination: any = null;
  private recordingDetails: Record<string, { time: number; total: number }> | null = null;
  private detailsLoading: boolean = false;
  private detailsExpanded: boolean = false;

  constructor(parent: HTMLElement, toolbar: HTMLElement, callbacks: AdminRecordingsModalCallbacks) {
    this.parent = parent;
    this.toolbar = toolbar;
    this.loginStateManager = LoginStateManager.getInstance();
    this.callbacks = callbacks;
    this.modal = this.createModal('Loading admin recordings...');
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
    const toolbarRect = this.toolbar.getBoundingClientRect();
    const modalWidth = 1000; // Admin recordings modal is wider
    const left = (toolbarRect.width - modalWidth) / 2;
    const top = toolbarRect.height + 16;
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
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
      const recordings = await this.fetchAdminRecordings();
      console.log('Fetched admin recordings:', recordings);
      this.updateModal(recordings);
    } catch (error) {
      console.error('Failed to fetch admin recordings:', error);
      this.updateModal(null, 'Failed to load admin recordings');
    }
  }

  private async fetchAdminRecordings(page: number = 1, limit: number = 10): Promise<any> {
    const state = this.loginStateManager.getState();
    const tokens = state.tokens;
    
    if (!tokens?.token) {
      throw new Error('No access token available');
    }

    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_URL environment variable is not set');
    }

    const response = await fetch(`${apiUrl}/recordings/admin/all-recordings?page=${page}&limit=${limit}`, {
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
      
      throw new Error(`Failed to fetch admin recordings: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Admin recordings API response:', data);
    
    // Handle both array and object responses
    if (Array.isArray(data)) {
      return data;
    } else if (data.recordings && Array.isArray(data.recordings)) {
      return data;
    } else {
      console.error('Unexpected admin recordings response format:', data);
      return [];
    }
  }

  private async fetchRecordingDetails(): Promise<void> {
    if (this.detailsLoading) {
      return; // Already loading
    }
    
    if (this.recordingDetails) {
      // Already loaded, just render it
      this.renderRecordingDetails();
      return;
    }

    const state = this.loginStateManager.getState();
    const tokens = state.tokens;
    
    if (!tokens?.token) {
      throw new Error('No access token available');
    }

    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_URL environment variable is not set');
    }

    this.detailsLoading = true;
    this.updateDetailsButton();

    try {
      const response = await fetch(`${apiUrl}/recordings/admin/recording-details`, {
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
        
        throw new Error(`Failed to fetch recording details: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Recording details API response:', data);
      
      this.recordingDetails = data;
      this.detailsLoading = false;
      this.renderRecordingDetails();
    } catch (error) {
      console.error('Failed to fetch recording details:', error);
      this.detailsLoading = false;
      this.updateDetailsButton();
      // Show error in the details area
      this.renderRecordingDetailsError(error instanceof Error ? error.message : 'Failed to load recording details');
    }
  }

  private updateDetailsButton(): void {
    if (!this.modal) return;
    
    const detailsButton = this.modal.querySelector(`.${styles.recordingDetailsButton}`) as HTMLElement;
    if (detailsButton) {
      if (this.detailsLoading) {
        detailsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading...`;
        detailsButton.style.pointerEvents = 'none';
        detailsButton.style.opacity = '0.6';
      } else {
        const icon = this.detailsExpanded ? 'fa-chevron-up' : 'fa-chevron-down';
        detailsButton.innerHTML = `See recording details <i class="fas ${icon}"></i>`;
        detailsButton.style.pointerEvents = 'auto';
        detailsButton.style.opacity = '1';
      }
    }
  }

  private renderRecordingDetails(): void {
    if (!this.modal || !this.recordingDetails) return;

    const detailsContainer = this.modal.querySelector(`.${styles.recordingDetailsContainer}`);
    if (!detailsContainer) return;

    const formatTaskType = (taskType: string): string => {
      if (!taskType) return 'No task type';
      return taskType.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    };

    const entries = Object.entries(this.recordingDetails).sort((a, b) => b[1].total - a[1].total);
    
    const detailsHTML = entries.map(([taskType, data]) => `
      <div class="${styles.recordingDetailItem}">
        <div class="${styles.recordingDetailTaskType}">${formatTaskType(taskType)}</div>
        <div class="${styles.recordingDetailStats}">
          <span class="${styles.recordingDetailCount}">${data.total} recording${data.total !== 1 ? 's' : ''}</span>
          <span class="${styles.recordingDetailTime}">${this.formatDuration(data.time)}</span>
        </div>
      </div>
    `).join('');

    detailsContainer.innerHTML = `
      <div class="${styles.recordingDetailsList}">
        ${detailsHTML}
      </div>
    `;
  }

  private renderRecordingDetailsError(errorMessage: string): void {
    if (!this.modal) return;

    const detailsContainer = this.modal.querySelector(`.${styles.recordingDetailsContainer}`);
    if (detailsContainer) {
      detailsContainer.innerHTML = `
        <div class="${styles.errorMessage}">${errorMessage}</div>
      `;
    }
  }

  private updateModal(recordings: any, errorMessage?: string): void {
    if (!this.modal) return;

    const modalBody = this.modal.querySelector(`.${styles.modalBody}`) as HTMLElement;
    
    if (errorMessage) {
      modalBody.innerHTML = `<div class="${styles.errorMessage}">${errorMessage}</div>`;
      this.currentRecordings = [];
      this.pagination = null;
      return;
    }

    if (!recordings) {
      modalBody.innerHTML = `<div class="${styles.noRecordings}">No admin recordings found</div>`;
      this.currentRecordings = [];
      this.pagination = null;
      return;
    }

    // Handle paginated response
    let recordingsList: AdminRecording[] = [];
    let pagination = null;

    if (Array.isArray(recordings)) {
      recordingsList = recordings;
    } else if (recordings.recordings && Array.isArray(recordings.recordings)) {
      recordingsList = recordings.recordings;
      pagination = recordings.pagination;
    }

    if (recordingsList.length === 0) {
      modalBody.innerHTML = `<div class="${styles.noRecordings}">No admin recordings found</div>`;
      this.currentRecordings = [];
      this.pagination = null;
      return;
    }

    this.currentRecordings = recordingsList;
    this.pagination = pagination;
    
    modalBody.innerHTML = this.createAdminRecordingsGrid(recordingsList, pagination);
    this.attachEventListeners();
    
    // Update button state to reflect current expanded state
    this.updateDetailsButton();
    
    // If details were already loaded and expanded, re-render them
    if (this.detailsExpanded && this.recordingDetails) {
      const detailsContainer = this.modal.querySelector(`.${styles.recordingDetailsContainer}`) as HTMLElement;
      if (detailsContainer) {
        detailsContainer.style.display = 'block';
        this.renderRecordingDetails();
      }
    }
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${secs}s`;
    }
  }

  private createAdminRecordingsGrid(recordings: AdminRecording[], pagination?: any): string {
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

    const recordingsGrid = recordings.map(recording => `
      <div class="${styles.recordingCard} ${styles.adminRecordingCard}" data-recording-id="${recording.id}">
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
          <p class="${styles.adminRecordingUser}">${recording.userFullName}${recording.userEmail ? ` (${recording.userEmail})` : ''}</p>
          <h4 class="${styles.recordingTask}">${formatTaskType(recording.taskType)}</h4>
          <p class="${styles.recordingDate}">${formatDate(recording.createdAt.toString())}</p>
          <button class="${styles.playbackButton}" title="Playback video + device simulation">
            <i class="fas fa-play-circle"></i>
            <span>Playback Data</span>
          </button>
        </div>
      </div>
    `).join('');

    const state = this.loginStateManager.getState();
    const totalRecordings = pagination?.total || state.profile?.systemTotalRecordings || recordings.length;
    const totalSeconds = state.profile?.systemTotalSeconds;
    const totalSecondsFormatted = totalSeconds ? this.formatDuration(totalSeconds) : '';

    const paginationHTML = pagination ? this.createPagination(pagination) : '';

    return `
      <div class="${styles.recordingsContainer}">
        <div class="${styles.recordingsHeader} ${styles.adminHeader}">
          <div class="${styles.headerLeft}">
            <h3>System Recordings (${totalRecordings})</h3>
            ${totalSecondsFormatted ? `<p class="${styles.recordingsSubtext}">Total recording time: ${totalSecondsFormatted}</p>` : ''}
            <button class="${styles.recordingDetailsButton}">
              See recording details <i class="fas fa-chevron-down"></i>
            </button>
            <div class="${styles.recordingDetailsContainer}" style="display: ${this.detailsExpanded ? 'block' : 'none'};"></div>
          </div>
          ${paginationHTML ? `<div class="${styles.headerRight}">${paginationHTML}</div>` : ''}
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
            console.log('Admin playback button clicked for recording:', recordingId);
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
          await this.loadAdminRecordingsPage(parseInt(page));
        }
      });
    });

    const detailsButton = this.modal.querySelector(`.${styles.recordingDetailsButton}`);
    if (detailsButton) {
      detailsButton.addEventListener('click', async () => {
        this.detailsExpanded = !this.detailsExpanded;
        const detailsContainer = this.modal?.querySelector(`.${styles.recordingDetailsContainer}`) as HTMLElement;
        
        if (detailsContainer) {
          if (this.detailsExpanded) {
            detailsContainer.style.display = 'block';
            await this.fetchRecordingDetails();
          } else {
            detailsContainer.style.display = 'none';
          }
        }
        
        this.updateDetailsButton();
      });
    }
  }

  private async loadAdminRecordingsPage(page: number): Promise<void> {
    try {
      const recordings = await this.fetchAdminRecordings(page, 10);
      this.updateModal(recordings);
    } catch (error) {
      console.error('Failed to load admin recordings page:', error);
    }
  }

  private findRecordingById(recordingId: string): AdminRecording | null {
    return this.currentRecordings.find(recording => recording.id === recordingId) || null;
  }
}

