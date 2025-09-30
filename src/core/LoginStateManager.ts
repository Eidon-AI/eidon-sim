import { AuthManager, AuthUser, AuthTokens } from './AuthManager';

export interface LoginState {
  isLoggedIn: boolean;
  user: AuthUser | null;
  tokens: AuthTokens | null;
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
      tokens: null
    };
    this.initializeState();
  }

  static getInstance(): LoginStateManager {
    if (!LoginStateManager.instance) {
      LoginStateManager.instance = new LoginStateManager();
    }
    return LoginStateManager.instance;
  }

  private initializeState() {
    // Load auth state from AuthManager
    this.authManager.loadAuthState();
    this.updateState();
  }

  private updateState() {
    const isLoggedIn = this.authManager.isAuthenticated();
    const user = this.authManager.getCurrentUser();
    const tokens = this.authManager.getTokens();

    this.state = {
      isLoggedIn,
      user,
      tokens
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

  async login(): Promise<void> {
    try {
      await this.authManager.signIn();
      this.updateState();
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  logout(): void {
    this.authManager.signOut();
    this.updateState();
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
