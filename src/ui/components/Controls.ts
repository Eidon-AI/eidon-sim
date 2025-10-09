import { PlaybackManager, Recording } from '../../core/PlaybackManager';
import { LoginStateManager, LoginState } from '../../core/LoginStateManager';
import { AuthModal } from './AuthModal';
import { PaginatedRecordingsResponse } from '../../types/recording';
import { EidonTrackerManager } from '../../core/EidonTrackerManager';
import { DeviceModal } from './DeviceModal';
import { AuthManager } from '../../core/AuthManager';
import { UserApiManager } from '../../core/UserApiManager';
import styles from './styles/Controls.module.css';

export class Controls {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private playbackManager: PlaybackManager;
  private loginStateManager: LoginStateManager;
  private trackerManager: EidonTrackerManager;
  private authModal: AuthModal | null = null;
  private deviceModal: DeviceModal | null = null;
  private recordingsModal: HTMLElement | null = null;
  private profileModal: HTMLElement | null = null;
  private currentRecordings: any[] = [];
  private unsubscribe: (() => void) | null = null;
  
  constructor(playbackManager: PlaybackManager, trackerManager: EidonTrackerManager) {
    this.playbackManager = playbackManager;
    this.trackerManager = trackerManager;
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
      this.handleLoginStateChange(state);
    });
    
    // Listen for login requests from DeviceModal
    document.addEventListener('requestLogin', () => {
      this.showAuthModal();
    });
  }

  private render(): void {
    this.toolbar.innerHTML = `
      <button id="navConnect" class="${styles.navButton}" title="Devices">
        <i class="fas fa-microchip"></i>
        <span>Devices</span>
      </button>
      <div id="navSeparator" class="${styles.navSeparator}" style="display: none;"></div>
      <button id="navRecordings" class="${styles.navButton} ${styles.navRecordings}" title="Recordings (Login Required)" style="display: none;">
        <i class="fas fa-folder-open"></i>
        <span>Recordings</span>
      </button>
      <button id="userInfo" class="${styles.navButton} ${styles.userInfo}" style="display: none;" title="User Profile">
        <img id="userAvatar" class="${styles.userAvatar}" src="" alt="User Avatar" />
        <span id="userName" class="${styles.userName}"></span>
      </button>
      <button id="navLogin" class="${styles.navButton} ${styles.navLogin}" title="Login">
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
      this.showDeviceModal();
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

  private handleLoginStateChange(state: LoginState): void {
    if (state.isLoggedIn && !this.deviceModal) {
      // User just logged in, construct the modal
      this.constructDeviceModal();
    } else if (state.isLoggedIn && this.deviceModal) {
      // User logged in and modal exists, update the modal UI
      this.deviceModal.updateLoginState(true);
    } else if (!state.isLoggedIn && this.deviceModal) {
      // User logged out, update the modal UI but keep it constructed
      this.deviceModal.updateLoginState(false);
    }
  }

  private constructDeviceModal(): void {
    if (this.deviceModal) return; // Already constructed
    
    this.deviceModal = new DeviceModal(this.trackerManager);
    this.deviceModal.mount(this.container.parentElement!);
    // Modal starts in closed state by default
  }

  private showDeviceModal(): void {
    if (this.deviceModal) {
      // If modal exists, toggle it
      this.deviceModal.toggle();
    } else {
      // Fallback: construct modal if it doesn't exist (shouldn't happen normally)
      this.constructDeviceModal();
      this.deviceModal!.show();
    }
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

  private showProfileModal(profile?: any): void {
    this.hideRecordingsModal(); // Hide recordings modal if open
    
    if (profile) {
      this.profileModal = this.createUserProfileModal(profile);
    } else {
      const state = this.loginStateManager.getState();
      const stateProfile = state.profile;
      
      if (stateProfile) {
        this.profileModal = this.createUserProfileModal(stateProfile);
      } else {
        const userName = state.user?.name || state.user?.email || 'User';
        this.profileModal = this.createModal(`This is ${userName}'s profile`);
      }
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
    modal.className = styles.modal;
    if (isRecordingsModal) {
      modal.classList.add(styles.recordingsModal);
    }
    modal.innerHTML = `
      <div class="${styles.modalContent}">
        <button class="${styles.modalClose}">&times;</button>
        <div class="${styles.modalBody}">
          ${content}
        </div>
      </div>
    `;
    
    // Add close button functionality
    const closeBtn = modal.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
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

    const modalBody = this.recordingsModal.querySelector(`.${styles.modalBody}`) as HTMLElement;
    
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
          <h3>Your Recordings (${recordings.pagination.total})</h3>
        </div>
        <div class="${styles.recordingsGrid}">
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
      pages.push(`<button class="${styles.pageButton} prev-button" data-page="${currentPage - 1}">
        <i class="fas fa-chevron-left"></i> Previous
      </button>`);
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      if (i === currentPage) {
        pages.push(`<button class="${styles.pageButton} ${styles.pageButtonCurrentPage}">${i}</button>`);
      } else {
        pages.push(`<button class="${styles.pageButton}" data-page="${i}">${i}</button>`);
      }
    }

    // Next button
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
    videoModal.className = styles.videoModalOverlay;
    videoModal.innerHTML = `
      <div class="${styles.videoModalContainer}">
        <button class="${styles.videoModalClose}">
          <i class="fas fa-times"></i>
        </button>
        <div class="${styles.videoModalContent}">
          <video class="${styles.videoPlayer}" controls>
            <source src="${videoUrl}" type="video/mp4">
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
    const closeBtn = videoModal.querySelector(`.${styles.videoModalClose}`) as HTMLButtonElement;
    const deviceDataBtn = videoModal.querySelector(`.${styles.deviceDataButton}`) as HTMLButtonElement;

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
      (stat as HTMLElement).style.color = '#f44336';
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
    const modalWidth = modal.classList.contains(styles.recordingsModal) ? 1000 : 500; // Larger for recordings
    const left = (toolbarRect.width - modalWidth) / 2;
    const top = toolbarRect.height + 16; // 16px gap below toolbar
    
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  }

  private createUserProfileModal(profile: any): HTMLElement {
    const modal = document.createElement('div');
    modal.className = styles.modal;
    
    const avatarUrl = profile.avatarUrl;
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
      <div class="${styles.modalContent} ${styles.userProfileModal}">
        <button class="${styles.modalClose}">&times;</button>
        <div class="${styles.userProfileHeader}">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="Profile" class="${styles.profileAvatarLarge}" />` : ''}
          <div class="${styles.profileInfo}">
            <h3 class="${styles.profileName}">${profile.fullName}</h3>
            ${profile.emailAddress ? `<p class="${styles.profileEmail}">${profile.emailAddress}</p>` : ''}
          </div>
          <button class="${styles.editButton}" id="editProfileBtn">
            <i class="fas fa-edit"></i>
            Edit
          </button>
        </div>
        <div class="${styles.profileStats}">
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${profile.totalRecordings}</div>
            <div class="${styles.statLabel}">Recordings</div>
          </div>
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${formatDuration(profile.totalSecondsRecorded)}</div>
            <div class="${styles.statLabel}">Total Recording Time</div>
          </div>
          ${profile.recordingPercentage ? `
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${profile.recordingPercentage.toFixed(1)}%</div>
            <div class="${styles.statLabel}">System Share</div>
          </div>
          ` : ''}
          ${profile.devices && profile.devices.length > 0 ? `
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${profile.devices.length}</div>
            <div class="${styles.statLabel}">Devices</div>
          </div>
          ` : ''}
        </div>
        ${profile.firstTime || profile.newUser ? `
        <div class="${styles.profileBadges}">
          ${profile.newUser ? `<span class="${styles.badge} ${styles.badgeNewUser}">New User</span>` : ''}
          ${profile.firstTime ? `<span class="${styles.badge} ${styles.badgeFirstTime}">First Time</span>` : ''}
        </div>
        ` : ''}
      </div>
    `;
    
    // Add close button functionality
    const closeBtn = modal.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      modal.remove();
      this.profileModal = null;
    });

    // Add edit button functionality
    const editBtn = modal.querySelector('#editProfileBtn') as HTMLButtonElement;
    editBtn.addEventListener('click', () => {
      this.showEditProfileForm(modal, profile);
    });

    // Close on overlay click - improved implementation
    modal.addEventListener('click', (e) => {
      // Only close if clicking on the modal backdrop (not the content)
      if (e.target === modal) {
        this.closeModal(modal);
      }
    });

    // Prevent modal content clicks from bubbling to overlay
    const modalContent = modal.querySelector(`.${styles.modalContent}`) as HTMLElement;
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    
    return modal;
  }

  private showEditProfileForm(modal: HTMLElement, profile: any): void {
    const modalContent = modal.querySelector(`.${styles.modalContent}`) as HTMLElement;
    
    // Add edit form class to modal content for wider styling
    modalContent.classList.add(styles.editProfileForm);
    
    modalContent.innerHTML = `
      <button class="${styles.modalClose}">&times;</button>
      <div class="${styles.editFormContainer}">
        <div class="${styles.editFormHeader}">
          <button class="${styles.backButton} ${styles.editBackBtn}" id="backToProfileBtn">
            <i class="fas fa-arrow-left ${styles.backIcon}"></i>
            <span class="${styles.backText}">Back</span>
          </button>
          <h3 class="${styles.editFormTitle}">Edit Profile</h3>
        </div>
        
        <div class="${styles.formRow}">
          <div class="${styles.formGroup} ${styles.nameFieldGroup}">
            <label class="${styles.formLabel} ${styles.nameLabel}" for="profileName">Name</label>
            <input 
              type="text" 
              id="profileName" 
              class="${styles.formInput} ${styles.nameInput}" 
              value="${profile.fullName || ''}" 
              maxlength="100"
              placeholder="Enter your name"
            />
          </div>

          <div class="${styles.formGroup} ${styles.colorFieldGroup}">
            <label class="${styles.formLabel} ${styles.colorLabel}" for="symColor">Sym Color</label>
            <div class="${styles.colorPickerContainer}">
              <input 
                type="color" 
                id="symColor" 
                class="${styles.colorInput} ${styles.colorPicker}" 
                value="${profile.symColor || '#E93570'}"
              />
              <span class="${styles.colorValue} ${styles.colorHexDisplay}">${profile.symColor || '#E93570'}</span>
            </div>
          </div>
        </div>

        <div class="${styles.formGroup} ${styles.avatarFieldGroup}">
          <label class="${styles.formLabel} ${styles.avatarLabel}" for="profileAvatar">Profile Image</label>
          <div class="${styles.avatarUploadContainer}">
            <div class="${styles.avatarPreview} ${styles.avatarPreviewContainer}">
              ${profile.avatarUrl ? `<img src="${profile.avatarUrl}" alt="Current Avatar" class="${styles.avatarPreviewImg} ${styles.currentAvatarImg}" />` : '<div class="${styles.avatarPlaceholder} ${styles.avatarPlaceholderIcon}"><i class="fas fa-user"></i></div>'}
            </div>
            <input 
              type="file" 
              id="profileAvatar" 
              class="${styles.fileInput} ${styles.avatarFileInput}" 
              accept="image/*"
            />
            <button type="button" class="${styles.uploadButton} ${styles.avatarUploadBtn}" id="uploadAvatarBtn">
              <i class="fas fa-camera ${styles.uploadIcon}"></i>
              <span class="${styles.uploadText}">Choose Image</span>
            </button>
          </div>
        </div>

        <div class="${styles.formActions} ${styles.editFormActions}">
          <button type="button" class="${styles.cancelButton} ${styles.editCancelBtn}" id="cancelEditBtn">
            <span class="${styles.cancelText}">Cancel</span>
          </button>
          <button type="button" class="${styles.saveButton} ${styles.editSaveBtn}" id="saveProfileBtn">
            <i class="fas fa-save ${styles.saveIcon}"></i>
            <span class="${styles.saveText}">Save Changes</span>
          </button>
        </div>
      </div>
    `;

    // Add event listeners for the edit form
    this.setupEditFormEventListeners(modal, profile);
  }

  private setupEditFormEventListeners(modal: HTMLElement, originalProfile: any): void {
    const closeBtn = modal.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
    const backBtn = modal.querySelector(`.${styles.editBackBtn}`) as HTMLButtonElement;
    const cancelBtn = modal.querySelector(`.${styles.editCancelBtn}`) as HTMLButtonElement;
    const saveBtn = modal.querySelector(`.${styles.editSaveBtn}`) as HTMLButtonElement;
    const fileInput = modal.querySelector(`.${styles.avatarFileInput}`) as HTMLInputElement;
    const uploadBtn = modal.querySelector(`.${styles.avatarUploadBtn}`) as HTMLButtonElement;
    const colorInput = modal.querySelector(`.${styles.colorPicker}`) as HTMLInputElement;
    const colorValue = modal.querySelector(`.${styles.colorHexDisplay}`) as HTMLSpanElement;

    // Close button
    closeBtn.addEventListener('click', () => {
      this.closeModal(modal);
    });

    // Back button - return to profile view
    backBtn.addEventListener('click', () => {
      this.showProfileModal(originalProfile);
    });

    // Cancel button - restore original profile view
    cancelBtn.addEventListener('click', () => {
      this.showProfileModal(originalProfile);
    });

    // File input trigger
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // File selection handler
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleAvatarFileSelection(file, modal);
      }
    });

    // Color picker handler
    colorInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      colorValue.textContent = color;
      
      // Apply color changes optimistically to UI elements
      this.applyColorOptimistically(color);
    });

    // Save button
    saveBtn.addEventListener('click', () => {
      this.saveProfileChanges(modal, originalProfile);
    });

    // Close on overlay click - improved implementation
    modal.addEventListener('click', (e) => {
      // Only close if clicking on the modal backdrop (not the content)
      if (e.target === modal) {
        this.closeModal(modal);
      }
    });

    // Prevent modal content clicks from bubbling to overlay
    const editFormContainer = modal.querySelector(`.${styles.editFormContainer}`) as HTMLElement;
    if (editFormContainer) {
      editFormContainer.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  private handleAvatarFileSelection(file: File, modal: HTMLElement): void {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5MB.');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = modal.querySelector(`.${styles.currentAvatarImg}`) as HTMLImageElement;
      const placeholder = modal.querySelector(`.${styles.avatarPlaceholderIcon}`) as HTMLDivElement;
      
      if (previewImg) {
        previewImg.src = e.target?.result as string;
      } else if (placeholder) {
        placeholder.innerHTML = `<img src="${e.target?.result}" alt="Preview" class="${styles.avatarPreviewImg} ${styles.currentAvatarImg}" />`;
      }
    };
    reader.readAsDataURL(file);

    // Store the file for later upload
    (modal as any).selectedAvatarFile = file;
  }

  private async saveProfileChanges(modal: HTMLElement, originalProfile: any): Promise<void> {
    const nameInput = modal.querySelector(`.${styles.nameInput}`) as HTMLInputElement;
    const colorInput = modal.querySelector(`.${styles.colorPicker}`) as HTMLInputElement;
    const saveBtn = modal.querySelector(`.${styles.editSaveBtn}`) as HTMLButtonElement;
    const selectedFile = (modal as any).selectedAvatarFile as File;

    const fullName = nameInput.value.trim();
    const symColor = colorInput.value;

    // Validate name
    if (!fullName) {
      alert('Please enter a name.');
      // Restore button state
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>';
      return;
    }

    if (fullName.length > 100) {
      alert('Name must be 100 characters or less.');
      // Restore button state
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>';
      return;
    }

    // Show loading state
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
      let avatarUrl = originalProfile.avatarUrl;

      // Handle avatar upload if a new file was selected
      if (selectedFile) {
        try {
          avatarUrl = await this.uploadAvatar(selectedFile);
        } catch (uploadError) {
          console.error('Failed to upload avatar:', uploadError);
          alert('Failed to upload avatar. Please try again.');
          // Restore button state
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>';
          return;
        }
      }

      // Update profile
      try {
        await this.updateUserProfile({
          fullName,
          avatarUrl,
          symColor
        });
      } catch (profileError) {
        console.error('Failed to update profile:', profileError);
        alert('Failed to update profile. Please try again.');
        // Restore button state
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>';
        return;
      }

      // Show success and refresh profile
      const updatedProfile = { ...originalProfile, fullName, avatarUrl, symColor };
      this.showProfileModal(updatedProfile);

    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile changes. Please try again.');
      
      // Restore button state
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>';
    }
  }

  private async uploadAvatar(file: File): Promise<string> {
    // Get auth tokens from AuthManager
    const authManager = AuthManager.getInstance();
    const tokens = authManager.getTokens();
    if (!tokens) {
      throw new Error('User not authenticated');
    }

    // Use UserApiManager to handle the upload
    const userApiManager = UserApiManager.getInstance();
    return await userApiManager.uploadAvatar(file, tokens);
  }

  private applyColorOptimistically(color: string): void {
    // Update preferences optimistically
    const prefs = (window as any).prefs;
    if (prefs) {
      prefs.symColor = color;
    }

    // Dispatch color change event for IconOverlay to update robot/logo
    const colorChangeEvent = new CustomEvent('colorChange', {
      detail: { color }
    });
    document.dispatchEvent(colorChangeEvent);

    // Update only the Eidon Sym title color (not all text)
    this.updateEidonSymTitleColor(color);
  }

  private closeModal(modal: HTMLElement): void {
    modal.remove();
    this.profileModal = null;
  }

  private updateEidonSymTitleColor(color: string): void {
    // Find and update the Eidon Sym title specifically
    const eidonTitle = document.querySelector('[data-eidon-title]') as HTMLElement;
    if (eidonTitle) {
      eidonTitle.style.color = color;
    }
    
    // Also update any elements with specific Eidon title class
    const eidonTitleElements = document.querySelectorAll('.eidon-title, .eidon-sym-title');
    eidonTitleElements.forEach(element => {
      (element as HTMLElement).style.color = color;
    });
  }

  private async updateUserProfile(profileData: { fullName: string; avatarUrl?: string; symColor: string }): Promise<void> {
    // Get auth tokens from AuthManager
    const authManager = AuthManager.getInstance();
    const tokens = authManager.getTokens();
    if (!tokens) {
      throw new Error('User not authenticated');
    }

    // Use UserApiManager to update profile
    const userApiManager = UserApiManager.getInstance();
    await userApiManager.updateProfile(profileData, tokens);
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
      recordingsBtn.className = `${styles.navButton} ${styles.navRecordings} ${styles.navRecordingsPremium}`;
      
      // Update recordings button text with count
      const recordingsCount = state.profile?.totalRecordings || 0;
      const recordingsText = recordingsBtn.querySelector('span') as HTMLSpanElement;
      recordingsText.textContent = `Recordings (${recordingsCount})`;
      recordingsBtn.title = 'Recordings';
      
      // Show user info if profile is available
      if (state.profile) {
        userInfo.style.display = 'flex';
        
        // Set avatar
        const avatarUrl = state.profile.avatarUrl;
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
      
      // Keep devices button text simple
      const devicesBtn = this.toolbar.querySelector('#navConnect') as HTMLButtonElement;
      const devicesText = devicesBtn.querySelector('span') as HTMLSpanElement;
      devicesText.textContent = 'Devices';
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
    container.className = styles.container;
    return container;
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = styles.toolbar;
    return toolbar;
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
    
    // Check if user is already logged in and construct modal if needed
    const currentState = this.loginStateManager.getState();
    if (currentState.isLoggedIn) {
      this.constructDeviceModal();
    }
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
    
    if (this.deviceModal) {
      this.deviceModal.unmount();
      this.deviceModal = null;
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