// User profile interfaces for API responses
import { Device } from './device';

export interface CurrentUser {
  // Core user data
  id: string;  // Legacy database ID or generated ID for new users
  fullName: string;
  emailAddress: string | null;
  avatarUrl: string | null;
  signedAvatarUrl?: string | null;  // Optional signed URL for the avatar
  points: number;  // User's points from legacy system
  devices: Device[];  // User's devices
  totalSecondsRecorded: number;  // Total duration of all recordings in seconds
  recordingPercentage: number | null;  // Percentage of total system recordings this user has contributed

  // Migration flags
  firstTime: boolean;  // True if this is a legacy user's first time in new system
  newUser: boolean;    // True if this is a completely new user (not from legacy)
}

