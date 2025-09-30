import { RecordingManager, Recording } from '../../core/RecordingManager';
import { LoginStateManager, LoginState } from '../../core/LoginStateManager';
import { AuthModal } from './AuthModal';
import { PaginatedRecordingsResponse } from '../../types/recording';

export class RecordingControls {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private recordingManager: RecordingManager;
  private loginStateManager: LoginStateManager;
  private authModal: AuthModal | null = null;
  private recordingsModal: HTMLElement | null = null;
  private profileModal: HTMLElement | null = null;
  private currentRecordings: any[] = [];
  private unsubscribe: (() => void) | null = null;
  
  constructor(recordingManager: RecordingManager) {
    this.recordingManager = recordingManager;
    this.loginStateManager = LoginStateManager.getInstance();
    this.container = this.createContainer();
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);
    
    this.setupEventListeners();
    this.render();
  }

  private setupEventListeners(): void {
    // Subscribe to login state changes
    this.unsubscribe = this.loginStateManager.addListener((state: LoginState) => {
      this.updateLoginButton(state);
    });
  }

  private render(): void {
    this.toolbar.innerHTML = `
      <button id="navConnect" class="nav-button" title="Devices">
        <i class="fas fa-microchip"></i>
        <span>Devices</span>
      </button>
      <div id="navSeparator" class="nav-separator" style="display: none;"></div>
      <button id="navRecordings" class="nav-button nav-recordings" title="Recordings (Login Required)" style="display: none;">
        <i class="fas fa-folder-open"></i>
        <span>Recordings</span>
      </button>
      <button id="userInfo" class="nav-button user-info" style="display: none;" title="User Profile">
        <img id="userAvatar" class="user-avatar" src="" alt="User Avatar" />
        <span id="userName" class="user-name"></span>
      </button>
      <button id="navLogin" class="nav-button nav-login" title="Login">
        <i class="fas fa-sign-in-alt"></i>
        <span>Login</span>
      </button>
    `;

    this.attachEventListeners();
    this.updateLoginButton(this.loginStateManager.getState());
  }

  private attachEventListeners(): void {
    const connectBtn = this.toolbar.querySelector('#navConnect') as HTMLButtonElement;
    const recordingsBtn = this.toolbar.querySelector('#navRecordings') as HTMLButtonElement;
    const userInfoBtn = this.toolbar.querySelector('#userInfo') as HTMLButtonElement;
    const loginBtn = this.toolbar.querySelector('#navLogin') as HTMLButtonElement;

    connectBtn.addEventListener('click', () => {
      // Emit connect event for existing handlers
      const event = new CustomEvent('navConnect');
      document.dispatchEvent(event);
    });

    recordingsBtn.addEventListener('click', () => {
      this.toggleRecordingsModal();
    });

    userInfoBtn.addEventListener('click', () => {
      this.toggleProfileModal();
    });

    loginBtn.addEventListener('click', () => {
      this.handleLoginLogout();
    });
  }

  private handleLoginLogout(): void {
    const state = this.loginStateManager.getState();
    
    if (state.isLoggedIn) {
      // Logout
      this.loginStateManager.logout();
      // Show auth modal after logout
      this.showAuthModal();
    } else {
      // Show auth modal for login
      this.showAuthModal();
    }
  }

  private showAuthModal(): void {
    if (this.authModal) {
      this.authModal.unmount();
    }

    this.authModal = new AuthModal(
      async () => {
        try {
          await this.loginStateManager.login();
          this.authModal!.unmount();
          this.authModal = null;
        } catch (error) {
          console.error('Login failed:', error);
          alert('Login failed. Please try again.');
        }
      },
      () => {
        // Anonymous access - just close modal
        this.authModal!.unmount();
        this.authModal = null;
      }
    );

    this.authModal.mount(this.container.parentElement!);
  }

  private toggleRecordingsModal(): void {
    if (this.recordingsModal) {
      this.hideRecordingsModal();
    } else {
      this.showRecordingsModal();
    }
  }

  private toggleProfileModal(): void {
    if (this.profileModal) {
      this.hideProfileModal();
    } else {
      this.showProfileModal();
    }
  }

  private async showRecordingsModal(): Promise<void> {
    this.hideProfileModal(); // Hide profile modal if open
    
    this.recordingsModal = this.createModal('Loading recordings...', true);
    this.container.appendChild(this.recordingsModal);
    
    // Position modal in center below toolbar
    this.positionModal(this.recordingsModal);
    
    try {
      // Fetch user recordings
      const recordings = await this.fetchUserRecordings();
      console.log('Fetched recordings:', recordings);
      this.updateRecordingsModal(recordings);
    } catch (error) {
      console.error('Failed to fetch recordings:', error);
      this.updateRecordingsModal(null, 'Failed to load recordings');
    }
  }

  private hideRecordingsModal(): void {
    if (this.recordingsModal) {
      this.recordingsModal.remove();
      this.recordingsModal = null;
    }
  }

  private showProfileModal(): void {
    this.hideRecordingsModal(); // Hide recordings modal if open
    
    const state = this.loginStateManager.getState();
    const profile = state.profile;
    
    if (profile) {
      this.profileModal = this.createUserProfileModal(profile);
    } else {
      const userName = state.user?.name || state.user?.email || 'User';
      this.profileModal = this.createModal(`This is ${userName}'s profile`);
    }
    
    this.container.appendChild(this.profileModal);
    
    // Position modal in center below toolbar
    this.positionModal(this.profileModal);
  }

  private hideProfileModal(): void {
    if (this.profileModal) {
      this.profileModal.remove();
      this.profileModal = null;
    }
  }

  private createModal(content: string, isRecordingsModal: boolean = false): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'controls-modal';
    if (isRecordingsModal) {
      modal.classList.add('recordings-modal');
    }
    modal.innerHTML = `
      <div class="controls-modal-content">
        <button class="controls-modal-close">&times;</button>
        <div class="controls-modal-body">
          ${content}
        </div>
      </div>
    `;
    
    // Add close button functionality
    const closeBtn = modal.querySelector('.controls-modal-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      modal.remove();
      if (modal === this.recordingsModal) {
        this.recordingsModal = null;
      } else if (modal === this.profileModal) {
        this.profileModal = null;
      }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        if (modal === this.recordingsModal) {
          this.recordingsModal = null;
        } else if (modal === this.profileModal) {
          this.profileModal = null;
        }
      }
    });
    
    return modal;
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
      throw new Error(`Failed to fetch recordings: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API response:', data);
    return data;
  }

  private updateRecordingsModal(recordings: PaginatedRecordingsResponse | null, errorMessage?: string): void {
    if (!this.recordingsModal) return;

    const modalBody = this.recordingsModal.querySelector('.controls-modal-body') as HTMLElement;
    
    if (errorMessage) {
      modalBody.innerHTML = `<div class="error-message">${errorMessage}</div>`;
      this.currentRecordings = [];
      return;
    }

    if (!recordings || !recordings.recordings || recordings.recordings.length === 0) {
      modalBody.innerHTML = '<div class="no-recordings">No recordings found</div>';
      this.currentRecordings = [];
      return;
    }

    // Store current recordings for lookup
    this.currentRecordings = recordings.recordings;
    
    modalBody.innerHTML = this.createRecordingsGrid(recordings);
    this.attachRecordingsEventListeners();
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
      <div class="recording-card" data-recording-id="${recording.id}">
        <div class="recording-thumbnail">
          ${recording.thumbnailReadUrl ? 
            `<img src="${recording.thumbnailReadUrl}" alt="Recording thumbnail" />` :
            `<div class="thumbnail-placeholder">No thumbnail</div>`
          }
          <button class="video-play-button" data-video-url="${recording.videoReadUrl}">
            <i class="fas fa-play"></i>
          </button>
        </div>
        <div class="recording-info">
          <h4 class="recording-task">${formatTaskType(recording.taskType)}</h4>
          <p class="recording-date">${formatDate(recording.createdAt.toString())}</p>
          <button class="playback-button" title="Playback video + device simulation">
            <i class="fas fa-play-circle"></i>
            <span>Playback Data</span>
          </button>
        </div>
      </div>
    `).join('');

    const pagination = this.createPagination(recordings.pagination);

    return `
      <div class="recordings-container">
        <div class="recordings-header">
          <h3>Your Recordings (${recordings.pagination.total})</h3>
        </div>
        <div class="recordings-grid">
          ${recordingsGrid}
        </div>
        ${pagination}
      </div>
    `;
  }

  private createPagination(pagination: any): string {
    if (pagination.totalPages <= 1) return '';

    const pages = [];
    const currentPage = pagination.page;
    const totalPages = pagination.totalPages;

    // Previous button
    if (pagination.hasPrev) {
      pages.push(`<button class="page-button prev-button" data-page="${currentPage - 1}">
        <i class="fas fa-chevron-left"></i> Previous
      </button>`);
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      if (i === currentPage) {
        pages.push(`<button class="page-button current-page">${i}</button>`);
      } else {
        pages.push(`<button class="page-button" data-page="${i}">${i}</button>`);
      }
    }

    // Next button
    if (pagination.hasNext) {
      pages.push(`<button class="page-button next-button" data-page="${currentPage + 1}">
        Next <i class="fas fa-chevron-right"></i>
      </button>`);
    }

    return `
      <div class="pagination">
        ${pages.join('')}
      </div>
    `;
  }

  private attachRecordingsEventListeners(): void {
    if (!this.recordingsModal) return;

    // Video play buttons
    const videoButtons = this.recordingsModal.querySelectorAll('.video-play-button');
    videoButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const videoUrl = target.closest('.video-play-button')?.getAttribute('data-video-url');
        const recordingCard = target.closest('.recording-card');
        const recordingId = recordingCard?.getAttribute('data-recording-id');
        
        if (videoUrl && recordingId) {
          // Find the recording data from the current recordings
          const recording = this.findRecordingById(recordingId);
          if (recording) {
            this.showVideoModal(videoUrl, recording);
          }
        }
      });
    });

    // Playback buttons
    const playbackButtons = this.recordingsModal.querySelectorAll('.playback-button');
    playbackButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const recordingCard = target.closest('.recording-card');
        const recordingId = recordingCard?.getAttribute('data-recording-id');
        if (recordingId) {
          this.handlePlayback(recordingId);
        }
      });
    });

    // Pagination buttons
    const pageButtons = this.recordingsModal.querySelectorAll('.page-button[data-page]');
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

  private async showVideoModal(videoUrl: string, recording: any): Promise<void> {
    // Create video modal with loading state
    const videoModal = document.createElement('div');
    videoModal.className = 'video-modal-overlay';
    videoModal.innerHTML = `
      <div class="video-modal-container">
        <button class="video-modal-close">
          <i class="fas fa-times"></i>
        </button>
        <div class="video-modal-content">
          <video class="video-player" controls>
            <source src="${videoUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <div class="video-modal-info">
            <div class="sensor-data-overview">
              <h4>Sensor Data Overview</h4>
              <div class="sensor-stats-grid">
                <div class="sensor-stat">
                  <span class="stat-value">Loading...</span>
                  <span class="stat-label">Devices</span>
                </div>
                <div class="sensor-stat">
                  <span class="stat-value">Loading...</span>
                  <span class="stat-label">Duration</span>
                </div>
                <div class="sensor-stat">
                  <span class="stat-value">Loading...</span>
                  <span class="stat-label">Sample Rate</span>
                </div>
                <div class="sensor-stat">
                  <span class="stat-value">Loading...</span>
                  <span class="stat-label">Data Points</span>
                </div>
              </div>
              <div class="video-modal-actions">
                <button class="device-data-button" title="Playback video + device simulation">
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
    const closeBtn = videoModal.querySelector('.video-modal-close') as HTMLButtonElement;
    const deviceDataBtn = videoModal.querySelector('.device-data-button') as HTMLButtonElement;

    closeBtn.addEventListener('click', () => {
      videoModal.remove();
    });

    deviceDataBtn.addEventListener('click', () => {
      // TODO: Implement device data playback
      console.log('Playback device data for video:', videoUrl);
    });

    // Close on overlay click
    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) {
        videoModal.remove();
      }
    });

    // Add to document
    document.body.appendChild(videoModal);

    // Load sensor data and update the modal
    try {
      await this.loadSensorDataAndUpdateModal(videoModal, recording);
    } catch (error) {
      console.error('Failed to load sensor data:', error);
      this.updateSensorDataWithError(videoModal);
    }
  }

  private async loadSensorDataAndUpdateModal(videoModal: HTMLElement, recording: any): Promise<void> {
    if (!recording.sensorDataReadUrl) {
      this.updateSensorDataWithError(videoModal, 'No sensor data available');
      return;
    }

    const response = await fetch(recording.sensorDataReadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sensor data: ${response.status}`);
    }

    const sensorData = await response.json();
    this.updateSensorDataInModal(videoModal, sensorData, recording);
  }

  private updateSensorDataInModal(videoModal: HTMLElement, sensorData: any, recording: any): void {
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
    const duration = recording.duration ? formatDuration(recording.duration) : 'Unknown';
    const sampleRate = sensorData.sampleRate ? `${sensorData.sampleRate} Hz` : 'Unknown';
    const dataPoints = sensorData.snapshots ? sensorData.snapshots.length : 0;

    // Update the stat values
    const statValues = videoModal.querySelectorAll('.sensor-stat .stat-value');
    if (statValues.length >= 4) {
      statValues[0].textContent = deviceCount.toString();
      statValues[1].textContent = duration;
      statValues[2].textContent = sampleRate;
      statValues[3].textContent = dataPoints.toLocaleString();
    }
  }

  private updateSensorDataWithError(videoModal: HTMLElement, errorMessage: string = 'Failed to load sensor data'): void {
    const statValues = videoModal.querySelectorAll('.sensor-stat .stat-value');
    statValues.forEach(stat => {
      stat.textContent = 'Error';
      stat.style.color = '#f44336';
    });
  }

  private findRecordingById(recordingId: string): any | null {
    return this.currentRecordings.find(recording => recording.id === recordingId) || null;
  }

  private handlePlayback(recordingId: string): void {
    // TODO: Implement playback functionality
    console.log('Handle playback for recording:', recordingId);
  }

  private async loadRecordingsPage(page: number): Promise<void> {
    try {
      const recordings = await this.fetchUserRecordings(page, 10);
      this.updateRecordingsModal(recordings);
    } catch (error) {
      console.error('Failed to load recordings page:', error);
    }
  }

  private positionModal(modal: HTMLElement): void {
    // Position modal centered below the toolbar
    const toolbarRect = this.toolbar.getBoundingClientRect();
    
    // Center horizontally and position below toolbar
    const modalWidth = modal.classList.contains('recordings-modal') ? 1000 : 500; // Larger for recordings
    const left = (toolbarRect.width - modalWidth) / 2;
    const top = toolbarRect.height + 16; // 16px gap below toolbar
    
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  }

  private createUserProfileModal(profile: any): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'controls-modal';
    
    const avatarUrl = profile.signedAvatarUrl || profile.avatarUrl;
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
    
    modal.innerHTML = `
      <div class="controls-modal-content user-profile-modal">
        <button class="controls-modal-close">&times;</button>
        <div class="user-profile-header">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="Profile" class="profile-avatar-large" />` : ''}
          <div class="profile-info">
            <h3 class="profile-name">${profile.fullName}</h3>
            ${profile.emailAddress ? `<p class="profile-email">${profile.emailAddress}</p>` : ''}
          </div>
        </div>
        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-value">${profile.totalRecordings}</div>
            <div class="stat-label">Recordings</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${formatDuration(profile.totalSecondsRecorded)}</div>
            <div class="stat-label">Total Recording Time</div>
          </div>
          ${profile.recordingPercentage ? `
          <div class="stat-item">
            <div class="stat-value">${profile.recordingPercentage.toFixed(1)}%</div>
            <div class="stat-label">System Share</div>
          </div>
          ` : ''}
          ${profile.devices && profile.devices.length > 0 ? `
          <div class="stat-item">
            <div class="stat-value">${profile.devices.length}</div>
            <div class="stat-label">Devices</div>
          </div>
          ` : ''}
        </div>
        ${profile.firstTime || profile.newUser ? `
        <div class="profile-badges">
          ${profile.newUser ? '<span class="badge new-user">New User</span>' : ''}
          ${profile.firstTime ? '<span class="badge first-time">First Time</span>' : ''}
        </div>
        ` : ''}
      </div>
    `;
    
    // Add close button functionality
    const closeBtn = modal.querySelector('.controls-modal-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      modal.remove();
      this.profileModal = null;
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        this.profileModal = null;
      }
    });
    
    return modal;
  }

  private updateLoginButton(state: LoginState): void {
    const loginBtn = this.toolbar.querySelector('#navLogin') as HTMLButtonElement;
    const recordingsBtn = this.toolbar.querySelector('#navRecordings') as HTMLButtonElement;
    const userInfo = this.toolbar.querySelector('#userInfo') as HTMLButtonElement;
    const userAvatar = this.toolbar.querySelector('#userAvatar') as HTMLImageElement;
    const userName = this.toolbar.querySelector('#userName') as HTMLSpanElement;
    const separator = this.toolbar.querySelector('#navSeparator') as HTMLDivElement;
    const icon = loginBtn.querySelector('i') as HTMLElement;
    const text = loginBtn.querySelector('span') as HTMLElement;

    if (state.isLoggedIn) {
      icon.className = 'fas fa-sign-out-alt';
      text.textContent = 'Logout';
      loginBtn.title = `Logged in as ${state.profile?.fullName || state.user?.name || state.user?.email || 'User'}`;
      
      // Show separator
      separator.style.display = 'block';
      
      // Show recordings button with premium styling
      recordingsBtn.style.display = 'flex';
      recordingsBtn.className = 'nav-button nav-recordings nav-recordings-premium';
      
      // Update recordings button text with count
      const recordingsCount = state.profile?.totalRecordings || 0;
      const recordingsText = recordingsBtn.querySelector('span') as HTMLSpanElement;
      recordingsText.textContent = `Recordings (${recordingsCount})`;
      recordingsBtn.title = 'Recordings';
      
      // Show user info if profile is available
      if (state.profile) {
        userInfo.style.display = 'flex';
        
        // Set avatar (use signedAvatarUrl if available, otherwise avatarUrl)
        const avatarUrl = state.profile.signedAvatarUrl || state.profile.avatarUrl;
        if (avatarUrl) {
          userAvatar.src = avatarUrl;
          userAvatar.style.display = 'block';
        } else {
          userAvatar.style.display = 'none';
        }
        
        // Set user name
        userName.textContent = state.profile.fullName;
      } else {
        userInfo.style.display = 'none';
      }
      
      // Update devices button text with count
      const devicesCount = state.profile?.devices?.length || 0;
      const devicesBtn = this.toolbar.querySelector('#navConnect') as HTMLButtonElement;
      const devicesText = devicesBtn.querySelector('span') as HTMLSpanElement;
      devicesText.textContent = `Devices (${devicesCount})`;
    } else {
      icon.className = 'fas fa-sign-in-alt';
      text.textContent = 'Login';
      loginBtn.title = 'Sign in to your account';
      
      // Hide separator, recordings button and user info
      separator.style.display = 'none';
      recordingsBtn.style.display = 'none';
      userInfo.style.display = 'none';
      
      // Reset devices button text
      const devicesBtn = this.toolbar.querySelector('#navConnect') as HTMLButtonElement;
      const devicesText = devicesBtn.querySelector('span') as HTMLSpanElement;
      devicesText.textContent = 'Devices';
    }
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-40';
    return container;
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'bg-neutral-900/50 backdrop-blur-sm border border-neutral-700/60 rounded-full px-6 py-3 shadow-lg flex items-center gap-3 text-white';
    return toolbar;
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  public unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    if (this.authModal) {
      this.authModal.unmount();
      this.authModal = null;
    }
    
    if (this.recordingsModal) {
      this.recordingsModal.remove();
      this.recordingsModal = null;
    }
    
    if (this.profileModal) {
      this.profileModal.remove();
      this.profileModal = null;
    }
    
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

} 