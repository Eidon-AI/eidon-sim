import { AuthTokens } from './AuthManager';

// User profile update payload matching the backend DTO
export interface UpdateProfilePayload {
  fullName?: string;
  avatarUrl?: string;
  symColor?: string;
}

// Avatar upload response from the server
export interface AvatarUploadResponse {
  uploadUrl: string;
  filePath: string;
  publicUrl: string;
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
   * Get current user profile from server
   */
  async getProfile(tokens: AuthTokens): Promise<any> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('VITE_API_URL environment variable is not set');
      }

      const response = await fetch(`${apiUrl}/users/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // If unauthorized (401), we should let the caller handle logout
        if (response.status === 401) {
          console.log('Unauthorized response received in UserApiManager');
          throw new Error('Session expired. Please log in again.');
        }
        
        throw new Error(`Failed to fetch profile: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch profile from server:', error);
      throw error;
    }
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
        // If unauthorized (401), log it but don't throw since this is a silent operation
        if (response.status === 401) {
          console.log('Unauthorized response received in updateSymColor - session may have expired');
        }
        console.error('Failed to update symColor on server:', response.status, response.statusText);
        return;
      }

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
        // If unauthorized (401), log it but don't throw since this is a silent operation
        if (response.status === 401) {
          console.log('Unauthorized response received in updateProfile - session may have expired');
        }
        console.error('Failed to update profile on server:', response.status, response.statusText);
        return;
      }

      console.log('Profile successfully synced to server:', payload);
    } catch (error) {
      console.error('Failed to sync profile to server:', error);
      // Silent failure - user experience isn't affected
    }
  }

  /**
   * Get signed upload URL for avatar
   */
  async getAvatarUploadUrl(tokens: AuthTokens): Promise<AvatarUploadResponse> {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      throw new Error('VITE_API_URL environment variable is not set');
    }

    const response = await fetch(`${apiUrl}/users/avatar/upload-url`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${tokens.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Upload avatar file to signed URL
   */
  async uploadAvatarToSignedUrl(file: File, uploadUrl: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/*'
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(`Failed to upload avatar: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Complete avatar upload flow: get signed URL, upload file, return public URL
   */
  async uploadAvatar(file: File, tokens: AuthTokens): Promise<string> {
    // Step 1: Get signed upload URL
    const uploadData = await this.getAvatarUploadUrl(tokens);
    
    // Step 2: Upload file to signed URL
    await this.uploadAvatarToSignedUrl(file, uploadData.uploadUrl);
    
    // Step 3: Return public URL for profile update
    return uploadData.publicUrl;
  }
}
