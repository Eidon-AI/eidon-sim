import { LoginStateManager } from './LoginStateManager';
import { isVersionGreaterThan } from './versionUtils';

/**
 * Automatically syncs device firmware version to backend if device version is newer
 * Runs silently in background, fails silently on errors
 */
export async function checkAndSyncVersion(
  deviceId: string,
  deviceFirmwareVersion: string,
  apiStoredVersion?: string
): Promise<void> {
  try {
    // If no device version, can't sync
    if (!deviceFirmwareVersion) {
      return;
    }

    // If no API stored version, or device version is newer, update backend
    if (!apiStoredVersion || isVersionGreaterThan(deviceFirmwareVersion, apiStoredVersion)) {
      const state = LoginStateManager.getInstance().getState();
      if (!state.isLoggedIn || !state.tokens?.token) {
        // Not logged in, can't sync - fail silently
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.warn('[DeviceVersionSync] VITE_API_URL not set');
        return;
      }

      // Update device version in backend
      const response = await fetch(`${apiUrl}/devices/${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${state.tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: deviceFirmwareVersion
        })
      });

      if (response.ok) {
        console.log(`[DeviceVersionSync] Updated device ${deviceId} version to ${deviceFirmwareVersion}`);
      } else {
        // Fail silently - don't log errors for background sync
      }
    }
  } catch (error) {
    // Fail silently - background operation shouldn't disrupt user experience
  }
}

