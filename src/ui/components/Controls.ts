import { RecordingManager, Recording } from '../../core/RecordingManager';
import { LoginStateManager, LoginState } from '../../core/LoginStateManager';
import { AuthModal } from './AuthModal';

export class RecordingControls {
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private recordingManager: RecordingManager;
  private loginStateManager: LoginStateManager;
  private authModal: AuthModal | null = null;
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
      <button id="navConnect" class="nav-button" title="Connect Devices">
        <i class="fas fa-plug"></i>
        <span>Connect</span>
      </button>
      <button id="navRecordings" class="nav-button nav-recordings" title="Recordings (Login Required)" style="display: none;">
        <i class="fas fa-folder-open"></i>
        <span>Recordings</span>
      </button>
      <div id="userInfo" class="user-info" style="display: none;">
        <img id="userAvatar" class="user-avatar" src="" alt="User Avatar" />
        <span id="userName" class="user-name"></span>
      </div>
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
    const loginBtn = this.toolbar.querySelector('#navLogin') as HTMLButtonElement;

    connectBtn.addEventListener('click', () => {
      // Emit connect event for existing handlers
      const event = new CustomEvent('navConnect');
      document.dispatchEvent(event);
    });

    recordingsBtn.addEventListener('click', () => {
      // TODO: Implement recordings modal/page
      console.log('Recordings clicked');
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

  private updateLoginButton(state: LoginState): void {
    const loginBtn = this.toolbar.querySelector('#navLogin') as HTMLButtonElement;
    const recordingsBtn = this.toolbar.querySelector('#navRecordings') as HTMLButtonElement;
    const userInfo = this.toolbar.querySelector('#userInfo') as HTMLDivElement;
    const userAvatar = this.toolbar.querySelector('#userAvatar') as HTMLImageElement;
    const userName = this.toolbar.querySelector('#userName') as HTMLSpanElement;
    const icon = loginBtn.querySelector('i') as HTMLElement;
    const text = loginBtn.querySelector('span') as HTMLElement;

    if (state.isLoggedIn) {
      icon.className = 'fas fa-sign-out-alt';
      text.textContent = 'Logout';
      loginBtn.title = `Logged in as ${state.profile?.fullName || state.user?.name || state.user?.email || 'User'}`;
      
      // Show recordings button with premium styling
      recordingsBtn.style.display = 'flex';
      recordingsBtn.className = 'nav-button nav-recordings nav-recordings-premium';
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
    } else {
      icon.className = 'fas fa-sign-in-alt';
      text.textContent = 'Login';
      loginBtn.title = 'Sign in to your account';
      
      // Hide recordings button and user info
      recordingsBtn.style.display = 'none';
      userInfo.style.display = 'none';
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
    
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

} 