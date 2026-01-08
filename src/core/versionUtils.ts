/**
 * Version comparison utilities
 * Handles version strings in MAJOR.MINOR.PATCH format
 */

/**
 * Strips non-numeric characters from version string (handles 'v' prefix)
 */
function normalizeVersion(version: string): string {
  return version.replace(/[^0-9.]/g, '');
}

/**
 * Splits version string into parts and pads missing parts with zeros
 * Ensures 3 parts: MAJOR.MINOR.PATCH
 */
function parseVersionParts(version: string): number[] {
  const normalized = normalizeVersion(version);
  const parts = normalized.split('.').map(part => parseInt(part, 10) || 0);
  
  // Pad to 3 parts if needed
  while (parts.length < 3) {
    parts.push(0);
  }
  
  return parts.slice(0, 3); // Ensure exactly 3 parts
}

/**
 * Compares two version strings
 * Returns true if v1 > v2, false if equal or v1 < v2
 */
export function isVersionGreaterThan(v1: string, v2: string): boolean {
  const parts1 = parseVersionParts(v1);
  const parts2 = parseVersionParts(v2);
  
  // Compare parts numerically from left to right
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) {
      return true;
    } else if (parts1[i] < parts2[i]) {
      return false;
    }
  }
  
  // Versions are equal
  return false;
}

/**
 * Checks if an update is available
 * Returns true when latest > current
 */
export function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  if (!currentVersion || !latestVersion) {
    return false;
  }
  return isVersionGreaterThan(latestVersion, currentVersion);
}

