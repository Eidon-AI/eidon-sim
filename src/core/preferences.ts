import { UserApiManager } from './UserApiManager';
import { LoginStateManager } from './LoginStateManager';

type Prefs = {
  humLen: number; radLen: number; handLen: number;
  angleAlpha: number; fingerAlpha: number;
  theme: 'dark' | 'light';
  meshSurface: string;   // hex
  meshJoints:  string;   // hex
  symColor: string;      // hex - user's preferred color for logo/title
  stereoEnabled: boolean;
  leftURL:  string;
  rightURL: string;
  useActuatorAngles: boolean;  // Use actuator angles instead of quaternion-based rotation
};

const DEFAULT: Prefs = {
  humLen: 0.30, radLen: 0.26, handLen: 0.10,
  angleAlpha: 0.2, fingerAlpha: 0.25,
  theme: 'dark',
  meshSurface: '#ff0',
  meshJoints : '#888',
  symColor: '#FF006F',  // Default sym color
  stereoEnabled: false,
  leftURL: 'http://eidon-glass-47bc.local:81/stream',
  rightURL: 'http://eidon-glass-0214.local:81/stream',
  useActuatorAngles: false  // Default to quaternion mode (smooth)
};

export const prefs: Prefs = Object.assign(
  {}, DEFAULT, JSON.parse(localStorage.getItem('eidonPrefs') || '{}')
);

async function syncSymColorToServer(): Promise<void> {
  try {
    const loginState = LoginStateManager.getInstance().getState();
    
    // Only sync if user is logged in and has tokens
    if (loginState.isLoggedIn && loginState.tokens) {
      const apiManager = UserApiManager.getInstance();
      await apiManager.updateSymColor(prefs.symColor, loginState.tokens);
    }
  } catch (error) {
    // Silent failure - user experience isn't affected
    console.error('Failed to sync symColor to server:', error);
  }
}

export async function savePrefs() {
  // Save to localStorage immediately for responsive UI
  localStorage.setItem('eidonPrefs', JSON.stringify(prefs));
  document.dispatchEvent(new Event('prefsChanged'));

  // Sync symColor to server in background if user is logged in
  await syncSymColorToServer();
}
