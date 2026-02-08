// Recording-related types and interfaces

export enum TaskType {
  COOKING = 'cooking',
  FOLDING_LAUNDRY = 'folding_laundry',
  CLEANING = 'cleaning',
  MAKING_THE_BED = 'making_the_bed',
  WATERING_PLANTS = 'watering_plants',
  DOING_THE_DISHES = 'doing_the_dishes',
}

export interface Recording {
  // From BaseEntity
  id: string;           // UUID
  createdAt: Date;
  updatedAt: Date;
  
  // Recording-specific fields
  userId: string;       // Foreign key to users table
  user: User;           // User relation
  videoUrl: string;     // GCS URL for video file
  sensorDataUrl: string | null; // GCS URL for sensor data file (null for video-only)
  thumbnailUrl: string | null; // GCS URL for thumbnail (optional)
  duration: number | null;     // Recording duration in seconds (optional)
  recordingVersion: string | null;    // Version string (null for video-only recordings)
  taskType: TaskType | null;   // Task type enum (optional)
  completed: boolean;          // Completion status (default: false)
  videoOnly: boolean;          // True if this is a video-only recording (no sensor data)
  valid: boolean;              // False if marked invalid by admin (default: true)
}

export interface RecordingWithUrls extends Recording {
  videoReadUrl: string;        // Signed URL for video access
  sensorDataReadUrl: string | null;   // Signed URL for sensor data access (null for video-only)
  thumbnailReadUrl: string | null;  // Signed URL for thumbnail (if exists)
}

export interface PaginatedRecordingsResponse {
  recordings: RecordingWithUrls[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Admin-only interface that extends Recording with signed URLs and user information
export interface AdminRecording extends Recording {
  videoReadUrl: string;
  sensorDataReadUrl: string | null;  // null for video-only recordings
  thumbnailReadUrl: string | null;
  userFullName: string;
  userEmail: string | null;
}

// Import User type (assuming it exists in user.ts)
import { CurrentUser as User } from './user';
