import { AuthManager, AuthUser, AuthTokens } from './AuthManager';
import { CurrentUser } from '../types/user';
import { prefs, savePrefs } from './preferences';

export interface LoginState {
  isLoggedIn: boolean;
  user: AuthUser | null;
  tokens: AuthTokens | null;
  profile: CurrentUser | null;
}

export type LoginStateListener = (state: LoginState) => void;

export class LoginStateManager {
  private static instance: LoginStateManager;
  private authManager: AuthManager;
  private state: LoginState;
  private listeners: Set<LoginStateListener> = new Set();

  private constructor() {
    this.authManager = AuthManager.getInstance();
    this.state = {
      isLoggedIn: false,
      user: null,
      tokens: null,
      profile: null
    };
    // Initialize state asynchronously
    this.initializeState().catch(error => {
      console.error('Failed to initialize login state:', error);
    });
  }

  static getInstance(): LoginStateManager {
    if (!LoginStateManager.instance) {
      LoginStateManager.instance = new LoginStateManager();
    }
    return LoginStateManager.instance;
  }

  private async initializeState() {
    // Load auth state from AuthManager
    this.authManager.loadAuthState();
    this.updateState();
    
    // If user is already logged in, fetch their profile
    if (this.state.isLoggedIn) {
      await this.fetchUserProfile();
    }
  }

  private updateState() {
    const isLoggedIn = this.authManager.isAuthenticated();
    const user = this.authManager.getCurrentUser();
    const tokens = this.authManager.getTokens();

    this.state = {
      isLoggedIn,
      user,
      tokens,
      profile: this.state.profile // Keep existing profile data
    };

    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Error in login state listener:', error);
      }
    });
  }

  // Public methods
  getState(): LoginState {
    return { ...this.state };
  }

  isLoggedIn(): boolean {
    return this.state.isLoggedIn;
  }

  getUser(): AuthUser | null {
    return this.state.user;
  }

  getTokens(): AuthTokens | null {
    return this.state.tokens;
  }

  getProfile(): CurrentUser | null {
    return this.state.profile;
  }

  async login(): Promise<void> {
    try {
      await this.authManager.signIn();
      this.updateState();
      
      // Fetch user profile after successful login
      await this.fetchUserProfile();
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  private async fetchUserProfile(): Promise<void> {
    try {
      const tokens = this.authManager.getTokens();
      if (!tokens?.token) {
        console.warn('No access token available for profile fetch');
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.error('VITE_API_URL environment variable is not set');
        return;
      }
      
      const response = await fetch(`${apiUrl}/users/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Profile fetch failed:', response.status, response.statusText, errorText);
        throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`);
      }

      const profile: CurrentUser = await response.json();
      
      // Update symColor in preferences if provided, otherwise keep default
      if (profile.symColor) {
        prefs.symColor = profile.symColor;
        savePrefs();
      }
      
      // Update state with profile data
      this.state = {
        ...this.state,
        profile
      };

      this.notifyListeners();
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      // Don't throw - profile fetch failure shouldn't break login
    }
  }

  logout(): void {
    this.authManager.signOut();
    this.state = {
      isLoggedIn: false,
      user: null,
      tokens: null,
      profile: null
    };
    this.notifyListeners();
  }

  // Event listeners
  addListener(listener: LoginStateListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  removeListener(listener: LoginStateListener): void {
    this.listeners.delete(listener);
  }

  // Force refresh state (useful for external auth changes)
  refreshState(): void {
    this.updateState();
  }
}
