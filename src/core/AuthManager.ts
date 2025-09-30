export interface AuthTokens {
  token: string;
  refreshToken?: string;
}

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

export class AuthManager {
  private static instance: AuthManager;
  private authUrl: string;
  private callbackUrlScheme: string;
  private currentUser: AuthUser | null = null;
  private tokens: AuthTokens | null = null;

  constructor() {
    // Load from environment variables
    this.authUrl = import.meta.env.VITE_AUTH_URL || 'https://auth.eidon.ai';
    this.callbackUrlScheme = 'eidon-sim'; // Custom URL scheme for the app
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  async signIn(): Promise<AuthTokens> {
    try {
      // 1. Build the login URL with current page as callback
      const currentUrl = window.location.origin + window.location.pathname;
      const authUrl = `${this.authUrl}?external-auth=redirect-with-token&redirect=${encodeURIComponent(currentUrl)}&response_type=token`;

      console.log('Opening auth URL:', authUrl);

      // 2. Open the web page and wait for the callback
      const popup = window.open(
        authUrl,
        'auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Failed to open authentication popup');
      }

      // 3. Wait for the callback
      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            reject(new Error('Authentication popup was closed'));
          }
        }, 1000);

        // Listen for URL changes in the popup (callback detection)
        const checkCallback = setInterval(() => {
          try {
            // Check if popup has navigated back to our app URL
            if (popup.location.href.startsWith(currentUrl)) {
              clearInterval(checkClosed);
              clearInterval(checkCallback);
              popup.close();

              // 4. Extract the token from result
              const url = new URL(popup.location.href);
              
              console.log("Auth callback received:", popup.location.href);
              console.log("Parsed URI:", url);
              console.log("Query parameters:", url.searchParams);
              
              const token = url.searchParams.get('token');
              const refreshToken = url.searchParams.get('refreshToken');
              
              console.log("Firebase token received:", token);
              console.log("Refresh token received:", refreshToken);
              
              if (!token) {
                throw new Error('No token received in callback');
              }

              const authTokens: AuthTokens = { token, refreshToken: refreshToken || undefined };
              
              this.tokens = authTokens;
              
              // Handle async user fetch
              this.getUserFromToken(token).then(user => {
                this.currentUser = user;
                this.saveAuthState();
                console.log("Auth: Login completed");
                resolve(authTokens);
              }).catch(error => {
                console.error("Failed to get user info:", error);
                // Still resolve with tokens even if user fetch fails
                this.saveAuthState();
                console.log("Auth: Login completed (without user info)");
                resolve(authTokens);
              });
            }
          } catch (error) {
            // Cross-origin error is expected until callback
            // This is normal behavior
          }
        }, 100);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(checkClosed);
          clearInterval(checkCallback);
          popup.close();
          reject(new Error('Authentication timeout'));
        }, 300000);
      });
    } catch (error) {
      console.error('Auth failed with error:', error);
      throw error;
    }
  }

  private async getUserFromToken(token: string): Promise<AuthUser> {
    try {
      // This would typically make an API call to get user info
      // For now, we'll return a mock user
      return {
        id: 'user_' + Date.now(),
        email: 'user@example.com',
        name: 'Authenticated User'
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw error;
    }
  }

  signOut(): void {
    this.currentUser = null;
    this.tokens = null;
    // Clear any stored tokens from localStorage
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('auth_user');
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null && this.tokens !== null;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  // Load auth state from localStorage on app start
  loadAuthState(): void {
    try {
      const storedTokens = localStorage.getItem('auth_tokens');
      const storedUser = localStorage.getItem('auth_user');

      if (storedTokens && storedUser) {
        this.tokens = JSON.parse(storedTokens);
        this.currentUser = JSON.parse(storedUser);
      }
    } catch (error) {
      console.error('Failed to load auth state:', error);
      this.signOut();
    }
  }

  // Save auth state to localStorage
  private saveAuthState(): void {
    if (this.tokens && this.currentUser) {
      localStorage.setItem('auth_tokens', JSON.stringify(this.tokens));
      localStorage.setItem('auth_user', JSON.stringify(this.currentUser));
    }
  }
}
