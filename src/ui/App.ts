
// src/ui/App.ts
import { EidonTrackerManager } from '../core/EidonTrackerManager';
import { DeviceStore }  from '../core/DeviceStore';
import { ArmSolver }    from '../core/ArmSolver';
import { PlaybackManager } from '../core/PlaybackManager';
import { mountDeviceList } from './components/DeviceList';
import { mountPrefs } from './components/PreferencesModal';
import { initScene }    from './scene/sceneManager';
import { prefs } from '../core/preferences';
import { IconOverlay } from './components/IconOverlay';
import { Controls } from './components/controls/Controls';
import { renderCard } from './components/DeviceCard';
import { AuthModal } from './components/AuthModal';
import { AuthManager } from '../core/AuthManager';
import { LoginStateManager } from '../core/LoginStateManager';
import { Sidebar } from './components/Sidebar';
import styles from './App.module.css';

let selectedId: string | null = null;
let storeRef:  DeviceStore | null = null;
let logRef:    HTMLPreElement | null = null;
let playbackManager: PlaybackManager;
let controls: Controls;
let sceneDestroy: (() => void) | null = null;
let trackerManager: EidonTrackerManager | null = null;
let deviceStore: DeviceStore | null = null;
let authModal: AuthModal | null = null;
let authManager: AuthManager | null = null;
let loginStateManager: LoginStateManager | null = null;
let sidebar: Sidebar | null = null;
let isAuthenticated = false;

/* export so DeviceCard can import it */
export function setSelected(id: string | null) {
  selectedId = id;
  if (!storeRef || !logRef) return;

  if (id) {
    const s = storeRef['map'].get(id);
    logRef.textContent = s ? JSON.stringify(s, null, 2) : '';
  } else {
    logRef.textContent = '';
  }
}

export function log(msg: string) {
  if (!logRef) return;
  const ts = new Date().toLocaleTimeString();
  logRef.textContent += `[${ts}] ${msg}\n`;
  logRef.scrollTop = logRef.scrollHeight;
}

// For debugging
(window as any).setSelected = setSelected;

let pendingRecordingId: string | null = null;

export function mount(root: HTMLElement) {
  // Initialize login state manager
  loginStateManager = LoginStateManager.getInstance();
  isAuthenticated = loginStateManager.isLoggedIn();

  // Listen for login state changes to retry loading recording
  loginStateManager.addListener(async (state) => {
    if (state.isLoggedIn && pendingRecordingId && controls) {
      console.log('User logged in, retrying to load recording:', pendingRecordingId);
      await tryLoadRecording(pendingRecordingId);
    }
  });

  // Always initialize the app first, then show auth modal if needed
  initializeApp(root);

  // Check for recordingId URL parameter
  checkUrlForRecordingId();

  if (!isAuthenticated) {
    // Show auth modal as overlay
    showAuthModal(root);
  }
}

async function checkUrlForRecordingId() {
  const urlParams = new URLSearchParams(window.location.search);
  const recordingId = urlParams.get('recordingId');
  
  if (!recordingId) return;
  
  console.log('Found recordingId in URL:', recordingId);
  pendingRecordingId = recordingId;
  
  // Wait for controls to be initialized
  if (!controls) {
    setTimeout(() => checkUrlForRecordingId(), 100);
    return;
  }
  
  // Try to load the recording
  await tryLoadRecording(recordingId);
}

async function tryLoadRecording(recordingId: string) {
  try {
    await controls.fetchAndPlayRecording(recordingId);
    pendingRecordingId = null; // Clear on success
  } catch (error) {
    console.error('Failed to load recording from URL:', error);
    // If 401, user will be prompted to login
    // We'll retry when they log in
  }
}

function showAuthModal(root: HTMLElement) {
  authModal = new AuthModal(
    async () => {
      try {
        await loginStateManager!.login();
        isAuthenticated = true;
        authModal!.unmount();
        authModal = null;
      } catch (error) {
        console.error('OAuth sign in failed:', error);
        alert('Sign in failed. Please try again.');
      }
    },
    () => {
      isAuthenticated = true; // Allow anonymous access
      authModal!.unmount();
      authModal = null;
    }
  );

  authModal.mount(root);
}

function initializeApp(root: HTMLElement) {
  /* ------------------------------------------------------------
   * 1. Inject canvas markup
   * ---------------------------------------------------------- */
  root.innerHTML = `
    <canvas id="gl" class="${styles.canvas}"></canvas>
  `;

  /* ------------------------------------------------------------
   * 2. Grab the canvas element
   * ---------------------------------------------------------- */
  const canvas = document.getElementById('gl') as HTMLCanvasElement;

  /* ------------------------------------------------------------
   * 3. Core singletons
   * ---------------------------------------------------------- */
  const store = new DeviceStore();
  deviceStore = store;
  const tracker = new EidonTrackerManager();
  trackerManager = tracker;
  const solver = new ArmSolver(store);

  const { destroy } = initScene(canvas, store, solver);
  sceneDestroy = destroy;

  playbackManager = new PlaybackManager(store, solver);
  controls = new Controls(playbackManager, tracker);
  controls.mount(root);

  storeRef = store;

  /* ---------- Tracker → store pipeline ---------- */
  tracker.addEventListener('quaternionData', e => {
    const { deviceId, quaternion, timestamp } = (e as CustomEvent<{ deviceId: string; quaternion: number[]; timestamp: number }>).detail;
    // TODO: Update DeviceStore to handle quaternion data from Bluetooth
    console.log('Quaternion data received:', { deviceId, quaternion, timestamp });
  });

  /* ------------------------------------------------------------
   * 4. Controls (navigation)
   * ---------------------------------------------------------- */
  // Controls already mounted above

  // Handle navigation events
  document.addEventListener('navCalibrate', () => {
    // TODO: Implement calibration for Bluetooth devices
    console.log('Calibration requested');
  });

  document.addEventListener('navPreferences', () => {
    // Implement preferences button functionality
  });

  /* ---- log update only for selected device ---- */
  store.addEventListener('update', e => {
    const s = (e as CustomEvent<any>).detail;
    if (s.id === selectedId && logRef) {
      logRef.textContent = JSON.stringify(s, null, 2);
    }
  });

  document.addEventListener('deviceRemoved', e => {
    const id = (e as CustomEvent<{id:string}>).detail.id;
    if (id === selectedId) setSelected(null);
  });

  document.addEventListener('prefsChanged', ()=>{
    // simple reload approach
    // location.reload();
  });

  /* ------------ prefs ------------ */
  mountPrefs(root);

  /* ------------ Device list ------------ */
  // TODO: Update DeviceList to work with EidonTrackerManager
  // mountDeviceList(sidebar, tracker, store);

  /* ------------ Sidebar ------------ */
  sidebar = new Sidebar();
  sidebar.mount(root, solver);
  logRef = sidebar.getLogElement();

  /* ------------ Icon Overlay ------------ */
  const iconOverlay = new IconOverlay();
  iconOverlay.mount();
}

// Cleanup function for proper resource management
export function unmount() {
  if (authModal) {
    authModal.unmount();
    authModal = null;
  }
  
  if (sidebar) {
    sidebar.unmount();
    sidebar = null;
  }
  
  if (controls) {
    controls.unmount();
  }
  if (playbackManager) {
    playbackManager.destroy();
  }
  if (sceneDestroy) {
    sceneDestroy();
    sceneDestroy = null;
  }
  
  if (trackerManager) {
    trackerManager.destroy();
    trackerManager = null;
  }
  
  if (deviceStore) {
    deviceStore.destroy();
    deviceStore = null;
  }
  
}
