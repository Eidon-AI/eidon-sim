// User profile interfaces for API responses
import { Device } from './device';

export interface CurrentUser {
  // Core user data
  id: string;  // Legacy database ID or generated ID for new users
  fullName: string;
  emailAddress: string | null;
  avatarUrl: string | null;  // If private asset, this will be a signed URL
  symColor: string;  // User's preferred color theme (RGB hex)
  points: number;  // User's points from legacy system
  devices: Device[];  // User's devices
  totalSecondsRecorded: number;  // Total duration of all recordings in seconds
  totalRecordings: number;  // Total number of completed recordings
  recordingPercentage: number | null;  // Percentage of total system recordings this user has contributed

  // Admin-only data (only populated if user is admin)
  isAdmin: boolean;  // True if user email ends with @eidon.ai
  systemTotalRecordings: number | null;  // Total recordings across all users (admin only)
  systemTotalSeconds: number | null;  // Total seconds across all users (admin only)
  systemTotalVideoOnlyRecordings: number | null;  // Total video-only recordings (admin only)
  systemTotalVideoOnlySeconds: number | null;  // Total seconds of video-only recordings (admin only)

  // Migration flags
  firstTime: boolean;  // True if this is a legacy user's first time in new system
  newUser: boolean;    // True if this is a completely new user (not from legacy)
}

