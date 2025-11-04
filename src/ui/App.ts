
// src/ui/App.ts
import { EidonTrackerManager, EidonDevice } from '../core/EidonTrackerManager';
import { DeviceStore }  from '../core/DeviceStore';
import { ArmSolver }    from '../core/ArmSolver';
import { PlaybackManager } from '../core/PlaybackManager';
import { DeviceConnectionStateManager } from '../core/DeviceConnectionStateManager';
import { mountPrefs } from './components/PreferencesModal';
import { initScene }    from './scene/sceneManager';
import { prefs } from '../core/preferences';
import { IconOverlay } from './components/IconOverlay';
import { Controls } from './components/controls/Controls';
import { AuthModal } from './components/AuthModal';
import { AuthManager } from '../core/AuthManager';
import { LoginStateManager } from '../core/LoginStateManager';
import { Sidebar } from './components/sidebar/Sidebar';
import { Device, DeviceRole, DeviceColor } from '../types/device';
import { quat, vec3 } from 'gl-matrix';
import { quaternionToVectors } from '../core/mathUtils';
import styles from './App.module.css';

let selectedId: string | null = null;
let storeRef:  DeviceStore | null = null;
let playbackManager: PlaybackManager;
let controls: Controls;
let sceneDestroy: (() => void) | null = null;
let trackerManager: EidonTrackerManager | null = null;
let deviceStore: DeviceStore | null = null;
let deviceConnectionStateManager: DeviceConnectionStateManager | null = null;
let authModal: AuthModal | null = null;
let authManager: AuthManager | null = null;
let loginStateManager: LoginStateManager | null = null;
let sidebar: Sidebar | null = null;
let isAuthenticated = false;

/* export so DeviceCard can import it */
export function setSelected(id: string | null) {
  selectedId = id;
  // Log functionality removed - sidebar no longer has log element
}

export function log(msg: string) {
  // Log functionality removed - sidebar no longer has log element
  console.log(msg);
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

/**
 * Convert hex color to RGB format (for DeviceColor enum compatibility)
 */
function hexToRgb(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  // Parse r, g, b
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get device color prioritizing saved database color, then device color, then default
 */
function getDeviceColor(eidonDevice: EidonDevice): DeviceColor {
  // Priority 1: Use saved color from database if available
  if (eidonDevice.color) {
    // Convert hex to RGB if needed (saved colors from database are hex)
    const colorStr = eidonDevice.color.startsWith('#') 
      ? hexToRgb(eidonDevice.color)
      : eidonDevice.color;
    // Cast to DeviceColor (enum allows any color string in practice)
    return colorStr as DeviceColor;
  }
  
  // Priority 2: Default color (device's own color would be read from hardware via DEVICE_INFO characteristic,
  // but that's handled separately in EidonTrackerManager.fetchDeviceInfo)
  // For now, use default orange
  return DeviceColor.ORANGE;
}

/**
 * Bridge function: Convert EidonDevice (Bluetooth) to Device (DeviceStore)
 */
function bridgeEidonDeviceToDeviceStore(eidonDevice: EidonDevice, store: DeviceStore): void {
  // Check if device already exists
  if (store['map'].has(eidonDevice.id)) {
    // Update existing device
    const existingDevice = store['map'].get(eidonDevice.id)!;
    existingDevice.name = eidonDevice.name;
    // Map from constants.DeviceRole to types/device.DeviceRole
    existingDevice.position = mapDeviceRole(eidonDevice.role);
    existingDevice.connectionId = eidonDevice.connectionId;
    
    // Update color if saved color is available (prioritize saved database color)
    const deviceColor = getDeviceColor(eidonDevice);
    if (deviceColor !== existingDevice.color) {
      existingDevice.color = deviceColor;
    }
    
    existingDevice.lastSeen = performance.now();
    store.dispatchEvent(new CustomEvent('update', { detail: existingDevice }));
    return;
  }

  // Create new Device from EidonDevice
  const device: Device = {
    id: eidonDevice.id,
    name: eidonDevice.name,
    position: mapDeviceRole(eidonDevice.role),
    color: getDeviceColor(eidonDevice), // Use saved color from database if available, otherwise default
    connectionId: eidonDevice.connectionId,
    quat: quat.create(),
    up: vec3.create(),
    fwd: vec3.create(),
    chainStart: vec3.create(),
    chainEnd: vec3.create(),
    lastSeen: performance.now()
  };

  store['map'].set(device.id, device);
  store.dispatchEvent(new CustomEvent('update', { detail: device }));
}

/**
 * Map DeviceRole from constants.ts to DeviceRole from types/device.ts
 * Both enums have the same numeric values but different names
 */
function mapDeviceRole(role: import('../core/constants').DeviceRole): DeviceRole {
  // Map by numeric value since they have the same values
  const roleMap: Record<number, DeviceRole> = {
    [0]: DeviceRole.ROLE_LEFT_HAND,
    [1]: DeviceRole.ROLE_RIGHT_HAND,
    [2]: DeviceRole.ROLE_LEFT_FOREARM,
    [3]: DeviceRole.ROLE_RIGHT_FOREARM,
    [4]: DeviceRole.ROLE_LEFT_HUB,
    [5]: DeviceRole.ROLE_RIGHT_HUB,
    [6]: DeviceRole.ROLE_CHEST,
  };
  return roleMap[role] ?? DeviceRole.ROLE_LEFT_HAND; // Default fallback
}

/**
 * Update Device in DeviceStore with quaternion data from Bluetooth
 */
function updateDeviceWithQuaternion(deviceId: string, quaternion: number[], store: DeviceStore): void {
  // Device must exist in store
  const device = store['map'].get(deviceId);
  if (!device) {
    // Device not in store yet - might be connecting
    return;
  }

  // Note: DeviceStore.handleRaw() checks playbackMode, but we're bypassing that
  // We should respect playback mode here too. However, since we're updating directly,
  // we'll let DeviceStore's internal logic handle it if needed.

  // Parse quaternion: bytes are [w, x, y, z], but gl-matrix quat format is [x, y, z, w]
  // Bytes 0-3: w, Bytes 4-7: x, Bytes 8-11: y, Bytes 12-15: z
  const q: quat = [quaternion[1], quaternion[2], quaternion[3], quaternion[0]]; // [x, y, z, w]

  // Update quaternion
  device.quat = q;

  // Calculate derived vectors using centralized function
  const { up, fwd } = quaternionToVectors(q);
  device.up = up;
  device.fwd = fwd;

  // Update timestamp
  device.lastSeen = performance.now();

  // Dispatch update event
  store.dispatchEvent(new CustomEvent('update', { detail: device }));
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

  // Create device connection state manager
  const connectionStateManager = new DeviceConnectionStateManager();
  deviceConnectionStateManager = connectionStateManager;
  
  // Expose to window for Sidebar access (temporary until we refactor to pass it properly)
  (window as any).deviceConnectionStateManager = connectionStateManager;

  const { destroy } = initScene(canvas, store, solver);
  sceneDestroy = destroy;

  playbackManager = new PlaybackManager(store, solver);
  controls = new Controls(playbackManager, tracker, connectionStateManager);
  controls.mount(root);

  storeRef = store;

  /* ---------- Tracker → store pipeline ---------- */
  // Handle device connections - create Device in DeviceStore
  tracker.addEventListener('deviceConnected', ((e: Event) => {
    const event = e as CustomEvent<{ deviceId: string; device: any }>;
    const { deviceId, device: eidonDevice } = event.detail;
    bridgeEidonDeviceToDeviceStore(eidonDevice, store);
    
    // Update connection state manager
    // For child devices, add individually
    if (eidonDevice.parentHub) {
      connectionStateManager.addDeviceWithColor(
        deviceId,
        eidonDevice.name,
        eidonDevice.role,
        eidonDevice.color,
        true // isChild
      );
    } else {
      // For primary devices, do bulk update from all connected devices
      const connectedDevices = tracker.getConnectedDevices();
      connectionStateManager.updateConnectedDevices(connectedDevices);
    }
  }) as EventListener);

  // Handle quaternion data updates
  tracker.addEventListener('quaternionData', ((e: Event) => {
    const event = e as CustomEvent<{ deviceId: string; quaternion: number[]; timestamp: number }>;
    const { deviceId, quaternion } = event.detail;
    updateDeviceWithQuaternion(deviceId, quaternion, store);
  }) as EventListener);

  // Handle device disconnections
  tracker.addEventListener('deviceDisconnected', ((e: Event) => {
    const event = e as CustomEvent<{ deviceId: string }>;
    const { deviceId } = event.detail;
    // Remove from store and dispatch event
    store['map'].delete(deviceId);
    document.dispatchEvent(new CustomEvent('deviceRemoved', { detail: { id: deviceId } }));
    
    // Update connection state manager
    connectionStateManager.removeDevice(deviceId);
    
    // Also sync bulk update to ensure consistency
    const connectedDevices = tracker.getConnectedDevices();
    connectionStateManager.updateConnectedDevices(connectedDevices);
  }) as EventListener);

  // Handle device info updates (including color updates from saved devices)
  tracker.addEventListener('deviceInfoUpdated', ((e: Event) => {
    const event = e as CustomEvent<{ deviceId: string; device: EidonDevice }>;
    const { deviceId, device: eidonDevice } = event.detail;
    // Update device color in DeviceStore if device exists
    const storeDevice = store['map'].get(deviceId);
    if (storeDevice && eidonDevice.color) {
      const deviceColor = getDeviceColor(eidonDevice);
      if (storeDevice.color !== deviceColor) {
        storeDevice.color = deviceColor;
        store.dispatchEvent(new CustomEvent('update', { detail: storeDevice }));
      }
    }
    
    // Update connection state manager if device is connected
    if (eidonDevice.isConnected) {
      const existingDevice = connectionStateManager.getDevice(deviceId);
      if (existingDevice) {
        connectionStateManager.addDeviceWithColor(
          deviceId,
          eidonDevice.name,
          eidonDevice.role,
          eidonDevice.color,
          !!eidonDevice.parentHub // isChild
        );
      }
    }
  }) as EventListener);

  // Periodic sync of connection state (handles edge cases)
  setInterval(() => {
    if (!store.isPlaybackMode()) {
      const connectedDevices = tracker.getConnectedDevices();
      connectionStateManager.updateConnectedDevices(connectedDevices);
    }
  }, 2000); // Sync every 2 seconds

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
    if (s.id === selectedId) {
      // Device selection logging removed - sidebar no longer has log element
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

  /* ------------ Sidebar ------------ */
  sidebar = new Sidebar();
  sidebar.mount(root, solver, store, tracker);

  /* ------------ Icon Overlay ------------ */
  const iconOverlay = new IconOverlay();
  iconOverlay.mount();

  /* ------------ Initialize angle mode from preferences ------------ */
  // Dispatch initial angle mode state so SkeletalRig loads with correct mode
  document.dispatchEvent(new CustomEvent('angleModeChanged', {
    detail: { useActuatorAngles: prefs.useActuatorAngles || false }
  }));
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
