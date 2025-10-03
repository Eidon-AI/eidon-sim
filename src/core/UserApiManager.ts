import { AuthTokens } from './AuthManager';

// User profile update payload matching the backend DTO
export interface UpdateProfilePayload {
  fullName?: string;
  avatarUrl?: string;
  symColor?: string;
}

/**
 * Background API manager for user profile updates
 * Failures are silent, successes are silent - frontend updates optimistically
 */
export class UserApiManager {
  private static instance: UserApiManager;

  public static getInstance(): UserApiManager {
    if (!this.instance) {
      this.instance = new UserApiManager();
    }
    return this.instance;
  }

  /**
   * Update user profile with symColor change
   * Runs silently in background - any errors are logged but not shown to user
   */
  async updateSymColor(symColor: string, tokens: AuthTokens): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.error('VITE_API_URL environment variable is not set');
        return;
      }

      const payload: UpdateProfilePayload = {
        symColor: symColor
      };

      const response = await fetch(`${apiUrl}/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('Failed to update symColor on server:', response.status, response.statusText);
        return;
      }

      console.log('SymColor successfully synced to server:', symColor);
    } catch (error) {
      console.error('Failed to sync symColor to server:', error);
      // Silent failure - user experience isn't affected
    }
  }

  /**
   * Update any user profile fields
   * General-purpose method for other profile updates
   */
  async updateProfile(payload: UpdateProfilePayload, tokens: AuthTokens): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.error('VITE_API_URL environment variable is not set');
        return;
      }

      const response = await fetch(`${apiUrl}/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('Failed to update profile on server:', response.status, response.statusText);
        return;
      }

      console.log('Profile successfully synced to server:', payload);
    } catch (error) {
      console.error('Failed to sync profile to server:', error);
      // Silent failure - user experience isn't affected
    }
  }
}
