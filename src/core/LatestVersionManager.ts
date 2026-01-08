interface FirmwareVersion {
  version: string;
}

export class LatestVersionManager {
  private static instance: LatestVersionManager;
  private latestVersion: string | null = null;
  private listeners: Set<(version: string | null) => void> = new Set();

  private constructor() {}

  static getInstance(): LatestVersionManager {
    if (!LatestVersionManager.instance) {
      LatestVersionManager.instance = new LatestVersionManager();
    }
    return LatestVersionManager.instance;
  }

  async fetchLatestVersion(): Promise<string | null> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/devices/latest-version`);
      if (response.ok) {
        const data: FirmwareVersion = await response.json();
        this.latestVersion = data.version;
        this.notifyListeners();
        return this.latestVersion;
      } else {
        console.warn('Failed to fetch latest version info.');
        return null;
      }
    } catch (e) {
      console.error('Error fetching latest version:', e);
      return null;
    }
  }

  getLatestVersion(): string | null {
    return this.latestVersion;
  }

  addListener(listener: (version: string | null) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current version
    listener(this.latestVersion);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.latestVersion);
      } catch (error) {
        console.error('Error in latest version listener:', error);
      }
    });
  }
}

