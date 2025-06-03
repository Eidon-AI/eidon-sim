console.log('Eidon Sim loaded..');

// src/ui/App.ts
import { HidManager }   from '../core/HidManager';
import { DeviceStore }  from '../core/DeviceStore';
import { ArmSolver }    from '../core/ArmSolver';
import { RecordingManager } from '../core/RecordingManager';
import { mountAnglePanel } from './components/AnglePanel';
import { mountDeviceList } from './components/DeviceList';
import { mountPrefs } from './components/PreferencesModal';
import { mountRoArmCard } from './components/RoArmCard';
import { initScene }    from './scene/sceneManager';
import { mountStereoCam } from './components/StereoCam';
import { RoArmController } from '../core/RoArmController';
import { prefs } from '../core/preferences';
import { IconOverlay } from './components/IconOverlay';
import { RecordingControls } from './components/RecordingControls';
import { renderCard } from './components/DeviceCard';

let selectedId: string | null = null;
let storeRef:  DeviceStore | null = null;
let logRef:    HTMLPreElement | null = null;
let recordingManager: RecordingManager;
let recordingControls: RecordingControls;
let gamepadController: any;
let sceneDestroy: (() => void) | null = null;
let gamepadButtonInterval: number | null = null;
let hidManager: HidManager | null = null;
let deviceStore: DeviceStore | null = null;

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

export function mount(root: HTMLElement) {
  /* ------------------------------------------------------------
   * 1. Inject sidebar + canvas markup
   * ---------------------------------------------------------- */
  root.innerHTML = `
    <div class="sidebar fixed bottom-0 right-0 w-80 flex flex-col bg-neutral-900/50 backdrop-blur-sm border-neutral-700 p-4 gap-2 overflow-y-auto z-10">
      <div class="flex gap-2 justify-start">
        <button id="btnConnect"    class="btn" style="font-size: 1.2rem;">✛</button>
        <button id="btnCal"        class="btn">♺</button>
        <div class="flex-1"></div>
        <button id="btnPrefs"      class="btn" style="font-size: 1.4rem; padding-top: 2px;">⛭</button>
      </div>
      <pre id="log" class="flex-1 overflow-auto text-xs bg-neutral-900/50 ph-2 border-neutral-700"></pre>
    </div>
    <div id="calOverlay" class="fixed inset-0 bg-black/70 flex flex-col items-center justify-center text-4xl font-bold text-white z-50 hidden">
      <div class="text-8xl mb-8">T</div>
      <div class="text-2xl mb-4">Hold T-pose position</div>
      <span id="calCount">5</span>
    </div>
    <canvas id="gl" class="fixed inset-0 w-screen h-full"></canvas>
  `;

  /* ------------------------------------------------------------
   * 2. Grab the freshly-injected elements
   * ---------------------------------------------------------- */
  const btnConnect    = document.getElementById('btnConnect')    as HTMLButtonElement;
  const btnDisconnect = document.getElementById('btnDisconnect') as HTMLButtonElement;
  const btnCal        = document.getElementById('btnCal')        as HTMLButtonElement;
  const btnPrefs      = document.getElementById('btnPrefs')      as HTMLButtonElement;
  const canvas        = document.getElementById('gl')            as HTMLCanvasElement;
  const sidebar       = document.querySelector('.sidebar')       as HTMLDivElement;
  logRef = document.getElementById('log') as HTMLPreElement;

  /* ------------------------------------------------------------
   * 3. Core singletons
   * ---------------------------------------------------------- */
  const store = new DeviceStore();
  deviceStore = store;
  const hid   = new HidManager();
  hidManager = hid;
  const solver = new ArmSolver(store);
  const ro = new RoArmController(store);

  const { gamepadController: gc, destroy } = initScene(canvas, store, solver);
  gamepadController = gc;
  sceneDestroy = destroy;

  recordingManager = new RecordingManager(store, solver);
  recordingControls = new RecordingControls(recordingManager);
  recordingControls.mount(document.body);

  storeRef = store;

  /* ---------- HID → store pipeline ---------- */
  hid.addEventListener('report', e => {
    const { id, data } = (e as CustomEvent<{ id: string; data: DataView }>).detail;
    store.handleRaw(id, data);
  });

  /* ------------------------------------------------------------
   * 4. Buttons
   * ---------------------------------------------------------- */
  btnConnect.addEventListener('click', async () => {
    try {
      await hid.connect();
    } catch (err) {
      console.error(err);
      alert(`WebHID error: ${err}`);
    }
  });

  btnDisconnect?.addEventListener('click', () => hid.disconnectAll());
  btnCal?.addEventListener('click', () => hid.startCalibration());
  btnPrefs?.addEventListener('click', () => {
    // Implement preferences button functionality
    console.log('Preferences button clicked');
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
    location.reload();
  });

  /* ------------ prefs ------------ */
  mountPrefs(root);

  /* ------------ Device list ------------ */
  mountDeviceList(sidebar, hid, store);

  /* ------------ stereo cam ------------ */
  mountStereoCam(sidebar);

  /* ------------ Ro-Arm control ------------ */
  if (prefs.roArmEnabled) mountRoArmCard(sidebar, ro);

  /* ------------ Angle table ------------ */
  mountAnglePanel(sidebar, solver);

  /* ------------ Recording Controls ------------ */
  recordingControls = new RecordingControls(recordingManager);
  recordingControls.mount(root);

  /* ------------ Gamepad button in sidebar ------------ */
  const btnGamepad = document.createElement('button');
  btnGamepad.textContent = '🎮';
  btnGamepad.className = 'btn';
  btnGamepad.title = 'Gamepad Controls';
  btnGamepad.style.display = 'none'; // Hidden by default

  // Insert after btnCal
  btnCal.parentNode!.insertBefore(btnGamepad, btnCal.nextSibling);

  // Check gamepad status and show/hide button
  const updateGamepadButton = () => {
    const info = gamepadController.getGamepadInfo();
    btnGamepad.style.display = info.connected ? 'inline-block' : 'none';
  };

  // Check periodically for gamepad connection changes
  gamepadButtonInterval = setInterval(updateGamepadButton, 1000);
  updateGamepadButton(); // Initial check

  // Create gamepad modal
  const gamepadModal = document.createElement('div');
  gamepadModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-50';
  gamepadModal.innerHTML = `
    <div class="modal bg-neutral-800/70 backdrop-blur-sm p-5 rounded-lg w-128 space-y-3">
      <div class="flex justify-between items-center mb-2">
        <h3 class="font-bold text-lg">🎮 Gamepad Controls</h3>
        <button id="gamepadModalClose" class="text-neutral-400 hover:text-white">✕</button>
      </div>
      
      <div id="gamepadStatus" class="bg-neutral-900/50 p-3 rounded mb-4">
        <div><strong>Status:</strong> <span id="connectionStatus">Checking...</span></div>
        <div><strong>Controller:</strong> <span id="controllerName">None</span></div>
        <div><strong>Mode:</strong> <span id="currentMode">orbit</span></div>
        <div><strong>Enabled:</strong> <span id="enabledStatus">Yes</span></div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div>
          <strong>Orbit Mode:</strong><br>
          • Left Stick: Pan camera<br>
          • Right Stick: Rotate around target<br>
          • Left Trigger: Zoom in • Right Trigger: Zoom out
        </div>
        <div>
          <strong>Free Look Mode:</strong><br>
          • Left Stick: Move forward/strafe<br>
          • Right Stick: Look around<br>
          • Left Trigger: Move up • Right Trigger: Move down
        </div>
      </div>
      
      <div style="margin-top: 15px; text-align: center; padding-top: 10px; border-top: 1px solid #444;">
        <strong>Button Controls:</strong><br>
        A: Toggle camera mode • B: Reset camera • Y: Enable/disable gamepad
      </div>
      
      <div style="margin-top: 15px; text-align: center; padding-top: 10px; border-top: 1px solid #444;">
        <strong>⌨️ Keyboard Shortcuts:</strong><br>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 0.9em;">
          <div>1️⃣ Front View</div><div>2️⃣ Back View</div><div>3️⃣ Right View</div>
          <div>4️⃣ Left View</div><div>5️⃣ Top View</div><div>6️⃣ Bottom View</div>
          <div>7️⃣ Isometric</div><div>8️⃣ Isometric 2</div><div>9️⃣ Default View</div>
        </div>
        <div style="margin-top: 8px; font-size: 0.85em; color: #999;">Press H for keyboard help</div>
      </div>
    </div>
  `;
  root.appendChild(gamepadModal);

  // Gamepad button click handler
  btnGamepad.onclick = () => {
    const info = gamepadController.getGamepadInfo();
    
    // Update status in modal
    document.getElementById('connectionStatus')!.textContent = info.connected ? 'Connected' : 'Disconnected';
    document.getElementById('controllerName')!.textContent = info.name || 'Unknown';
    document.getElementById('currentMode')!.textContent = info.mode;
    document.getElementById('enabledStatus')!.textContent = info.enabled ? 'Yes' : 'No';
    
    gamepadModal.classList.remove('hidden');
    gamepadModal.classList.add('flex');
  };

  // Close modal handlers
  document.getElementById('gamepadModalClose')!.onclick = () => {
    gamepadModal.classList.add('hidden');
    gamepadModal.classList.remove('flex');
  };

  gamepadModal.onclick = (e) => {
    if (e.target === gamepadModal) {
      gamepadModal.classList.add('hidden');
      gamepadModal.classList.remove('flex');
    }
  };

  /* ------------ Icon Overlay ------------ */
  const iconOverlay = new IconOverlay();
  iconOverlay.mount();

  log('App mounted');
}

// Cleanup function for proper resource management
export function unmount() {
  if (recordingControls) {
    recordingControls.unmount();
  }
  if (recordingManager) {
    recordingManager.destroy();
  }
  if (sceneDestroy) {
    sceneDestroy();
    sceneDestroy = null;
  }
  
  if (gamepadButtonInterval) {
    clearInterval(gamepadButtonInterval);
    gamepadButtonInterval = null;
  }
  
  if (hidManager) {
    hidManager.destroy();
    hidManager = null;
  }
  
  if (deviceStore) {
    deviceStore.destroy();
    deviceStore = null;
  }
  
  console.log('App unmounted');
}
