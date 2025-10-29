import { PlaybackManager } from '../../../core/PlaybackManager';
import { LoginStateManager, LoginState } from '../../../core/LoginStateManager';
import { AuthModal } from '../AuthModal';
import { PaginatedRecordingsResponse, RecordingWithUrls, AdminRecording } from '../../../types/recording';
import { SensorRecording } from '../../../types/sensorData';
import { EidonTrackerManager } from '../../../core/EidonTrackerManager';
import { DeviceModal } from '../device-modal/DeviceModal';
import { AuthManager } from '../../../core/AuthManager';
import { UserApiManager } from '../../../core/UserApiManager';
import { PlaybackView } from '../PlaybackView';
import { ProfileModal } from './ProfileModal';
import { RecordingsModal } from './RecordingsModal';
import { AdminRecordingsModal } from './AdminRecordingsModal';
import { VideoModal } from './VideoModal';
import styles from './styles/Controls.module.css';

export class Controls {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private playbackManager: PlaybackManager;
  private loginStateManager: LoginStateManager;
  private trackerManager: EidonTrackerManager;
  private authModal: AuthModal | null = null;
  private deviceModal: DeviceModal | null = null;
  private recordingsModal: RecordingsModal | null = null;
  private adminRecordingsModal: AdminRecordingsModal | null = null;
  private profileModal: ProfileModal | null = null;
  private playbackView: PlaybackView | null = null;
  private videoModal: VideoModal | null = null;
  private unsubscribe: (() => void) | null = null;
  private previousModal: string | null = null;
  
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
    // Listen for returnToModal event
    document.addEventListener('returnToModal', ((e: CustomEvent) => {
      const { modal } = e.detail;
      if (modal === 'recordings') {
        this.showRecordingsModal();
      } else if (modal === 'adminRecordings') {
        this.showAdminRecordingsModal();
      }
    }) as EventListener);
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
      <button id="navAdminRecordings" class="${styles.navButton} ${styles.navAdminRecordings}" title="System Recordings (Admin)" style="display: none;">
        <i class="fas fa-shield-alt"></i>
        <span>System Recordings</span>
      </button>
      <button id="userInfo" class="${styles.navButton} ${styles.userInfo}" style="display: none;" title="User Profile">
        <img id="userAvatar" class="${styles.userAvatar}" src="" alt="User Avatar" />
        <span id="userName" class="${styles.userName}"></span>
        <span id="adminBadge" class="${styles.adminBadge}" style="display: none;"><i class="fas fa-shield-alt"></i> Admin</span>
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
    const adminRecordingsBtn = this.toolbar.querySelector('#navAdminRecordings') as HTMLButtonElement;
    const userInfoBtn = this.toolbar.querySelector('#userInfo') as HTMLButtonElement;
    const loginBtn = this.toolbar.querySelector('#navLogin') as HTMLButtonElement;

    connectBtn.addEventListener('click', () => {
      this.showDeviceModal();
    });

    recordingsBtn.addEventListener('click', () => {
      this.toggleRecordingsModal();
    });

    adminRecordingsBtn?.addEventListener('click', () => {
      this.toggleAdminRecordingsModal();
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

  private showRecordingsModal(): void {
    // Hide other modals if open
    this.hideProfileModal();
    this.hideAdminRecordingsModal();
    
    this.recordingsModal = new RecordingsModal(
      this.container,
      this.toolbar,
      {
        onPlayback: (recording: any) => this.handlePlayback(recording),
        onShowVideoModal: (videoUrl: string, recording: any) => this.showVideoModal(videoUrl, recording),
        onClose: () => this.hideRecordingsModal()
      }
    );
    this.recordingsModal.mount();
  }

  private hideRecordingsModal(): void {
    if (this.recordingsModal) {
      this.recordingsModal.unmount();
      this.recordingsModal = null;
    }
  }

  private showProfileModal(profile?: any): void {
    // Hide recordings modals if open
    this.hideRecordingsModal();
    this.hideAdminRecordingsModal();
    
    let profileData: any;
    if (profile) {
      profileData = profile;
    } else {
      const state = this.loginStateManager.getState();
      profileData = state.profile;
      
      if (!profileData) {
        console.warn('No profile data available');
        return;
      }
    }
    
    this.profileModal = new ProfileModal(profileData, this.container, this.toolbar);
    this.profileModal.mount();
  }

  private hideProfileModal(): void {
    if (this.profileModal) {
      this.profileModal.unmount();
      this.profileModal = null;
    }
  }

  private toggleAdminRecordingsModal(): void {
    if (this.adminRecordingsModal) {
      this.hideAdminRecordingsModal();
    } else {
      this.showAdminRecordingsModal();
    }
  }

  private hideAdminRecordingsModal(): void {
    if (this.adminRecordingsModal) {
      this.adminRecordingsModal.unmount();
      this.adminRecordingsModal = null;
    }
  }

  private showAdminRecordingsModal(): void {
    // Hide other modals
    this.hideProfileModal();
    this.hideRecordingsModal();
    
    this.adminRecordingsModal = new AdminRecordingsModal(
      this.container,
      this.toolbar,
      {
        onPlayback: (recording: any) => this.handlePlayback(recording),
        onShowVideoModal: (videoUrl: string, recording: any) => this.showVideoModal(videoUrl, recording),
        onClose: () => this.hideAdminRecordingsModal()
      }
    );
    this.adminRecordingsModal.mount();
  }




  private showVideoModal(videoUrl: string, recording: any): void {
    this.videoModal = new VideoModal(videoUrl, recording, {
      onPlayback: (recording: any) => this.handlePlayback(recording)
    });
    this.videoModal.mount();
  }

  private async handlePlayback(recording: any): Promise<void> {
    try {
      // Use the recording data passed from the modal
      const apiRecording = recording;

      // 1. Check if sensor data URL exists
      if (!apiRecording.sensorDataReadUrl) {
        console.error('No sensor data URL for recording:', recording.id);
        alert('No sensor data available for this recording');
        return;
      }

      // 2. Fetch the sensor data JSON from GCS
      console.log('Fetching sensor data from:', apiRecording.sensorDataReadUrl);
      const sensorResponse = await fetch(apiRecording.sensorDataReadUrl);
      if (!sensorResponse.ok) {
        throw new Error(`Failed to fetch sensor data: ${sensorResponse.status} ${sensorResponse.statusText}`);
      }

      const sensorData: SensorRecording = await sensorResponse.json();
      console.log('Sensor data loaded:', sensorData);

      // 3. Validate sensor data
      if (!sensorData.devices || !sensorData.snapshots) {
        throw new Error('Invalid sensor data format: missing devices or snapshots');
      }

      // 4. Store which modal was open before closing
      if (this.recordingsModal) {
        this.previousModal = 'recordings';
        this.recordingsModal.unmount();
        this.recordingsModal = null;
      } else if (this.adminRecordingsModal) {
        this.previousModal = 'adminRecordings';
        this.adminRecordingsModal.unmount();
        this.adminRecordingsModal = null;
      }

      // 5. Animate camera to back view (key "2" position)
      this.animateCameraToBackView();

      // 6. Open playback view with video + controls
      this.playbackView = new PlaybackView(
        this.playbackManager,
        sensorData,
        apiRecording,
        () => this.handlePlaybackExit(),
        this.previousModal
      );
      this.playbackView.mount(document.body);
      
      console.log('Playback view opened for:', sensorData.name);

    } catch (error) {
      console.error('Failed to start playback:', error);
      alert(`Failed to start playback: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private animateCameraToBackView(): void {
    // Trigger camera animation to back view (position from KeyboardController key "2")
    const viewControls = (window as any).viewControls;
    if (viewControls) {
      // Back view: position [0, 0, 5.5], slightly elevated
      const backView = {
        position: [0, 1, 5.5] as [number, number, number],  // Slightly elevated (y=1)
        target: [0, 0.5, 0] as [number, number, number]     // Look at upper body
      };
      
      // Use the view change system if available
      document.dispatchEvent(new CustomEvent('cameraViewChange', { detail: backView }));
    }
  }

  private handlePlaybackExit(): void {
    this.playbackView = null;
    console.log('Playback exited');
    // Camera returns to user control automatically
  }

  public async fetchAndPlayRecording(recordingId: string): Promise<void> {
    try {
      const state = this.loginStateManager.getState();
      
      // Check if user is logged in
      if (!state.isLoggedIn || !state.tokens?.token) {
        console.log('User not logged in, requesting login');
        // Trigger login flow by dispatching event
        document.dispatchEvent(new CustomEvent('requestLogin'));
        throw new Error('Please log in to view this recording');
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('VITE_API_URL environment variable is not set');
      }

      // Fetch the specific recording from admin endpoint
      console.log('Fetching recording from admin endpoint:', recordingId);
      const response = await fetch(`${apiUrl}/recordings/admin/${recordingId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${state.tokens.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // If unauthorized (401), trigger login
        if (response.status === 401) {
          console.log('Unauthorized - need to login');
          document.dispatchEvent(new CustomEvent('requestLogin'));
          throw new Error('Please log in to view this recording');
        }
        
        throw new Error(`Failed to fetch recording: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const apiRecording: AdminRecording = await response.json();
      console.log('Fetched recording from URL:', apiRecording);

      // Check if sensor data URL exists
      if (!apiRecording.sensorDataReadUrl) {
        console.error('No sensor data URL for recording:', recordingId);
        alert('No sensor data available for this recording');
        return;
      }

      // Fetch the sensor data JSON from GCS
      console.log('Fetching sensor data from:', apiRecording.sensorDataReadUrl);
      const sensorResponse = await fetch(apiRecording.sensorDataReadUrl);
      if (!sensorResponse.ok) {
        throw new Error(`Failed to fetch sensor data: ${sensorResponse.status} ${sensorResponse.statusText}`);
      }

      const sensorData: SensorRecording = await sensorResponse.json();
      console.log('Sensor data loaded:', sensorData);

      // Validate sensor data
      if (!sensorData.devices || !sensorData.snapshots) {
        throw new Error('Invalid sensor data format: missing devices or snapshots');
      }

      // Animate camera to back view
      this.animateCameraToBackView();

      // Open playback view with video + controls
      this.playbackView = new PlaybackView(
        this.playbackManager,
        sensorData,
        apiRecording,
        () => this.handlePlaybackExit()
      );
      this.playbackView.mount(document.body);
      
      console.log('Playback view opened for:', sensorData.name);

      // Clear the URL parameter to avoid reloading on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('recordingId');
      window.history.replaceState({}, '', url.toString());

    } catch (error) {
      console.error('Failed to load recording from URL:', error);
      alert(`Failed to load recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }




  private updateLoginButton(state: LoginState): void {
    const loginBtn = this.toolbar.querySelector('#navLogin') as HTMLButtonElement;
    const recordingsBtn = this.toolbar.querySelector('#navRecordings') as HTMLButtonElement;
    const adminRecordingsBtn = this.toolbar.querySelector('#navAdminRecordings') as HTMLButtonElement;
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
      
      // Show admin recordings button if user is admin
      if (state.profile?.isAdmin) {
        adminRecordingsBtn.style.display = 'flex';
        const systemRecordingsCount = state.profile?.systemTotalRecordings || 0;
        const adminRecordingsText = adminRecordingsBtn.querySelector('span') as HTMLSpanElement;
        adminRecordingsText.textContent = `System Recordings (${systemRecordingsCount})`;
        adminRecordingsBtn.title = 'System Recordings (Admin)';
      } else {
        adminRecordingsBtn.style.display = 'none';
      }
      
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
        
        // Show admin badge if user is admin
        const adminBadge = this.toolbar.querySelector('#adminBadge') as HTMLSpanElement;
        if (adminBadge) {
          if (state.profile.isAdmin) {
            adminBadge.style.display = 'inline-flex';
          } else {
            adminBadge.style.display = 'none';
          }
        }
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
      adminRecordingsBtn.style.display = 'none';
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
      this.recordingsModal.unmount();
      this.recordingsModal = null;
    }
    
    if (this.adminRecordingsModal) {
      this.adminRecordingsModal.unmount();
      this.adminRecordingsModal = null;
    }
    
    if (this.profileModal) {
      this.profileModal.unmount();
      this.profileModal = null;
    }

    if (this.videoModal) {
      this.videoModal.unmount();
      this.videoModal = null;
    }

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

} 