console.log('Eidon Sim loaded..');

// src/ui/App.ts
import { HidManager }   from '../core/HidManager';
import { DeviceStore }  from '../core/DeviceStore';
import { ArmSolver }    from '../core/ArmSolver';
import { mountAnglePanel } from './components/AnglePanel';
import { mountDeviceList } from './components/DeviceList';
import { mountPrefs } from './components/PreferencesModal';
import { mountRoArmCard } from './components/RoArmCard';
import { initScene }    from './scene/sceneManager';
import { mountStereoCam } from './components/StereoCam';
import { RoArmController } from '../core/RoArmController';
import { prefs } from '../core/preferences';

let selectedId: string | null = null;
let storeRef:  DeviceStore | null = null;
let logRef:    HTMLPreElement | null = null;

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

export function mount(root: HTMLElement) {
  /* ------------------------------------------------------------
   * 1. Inject sidebar + canvas markup
   * ---------------------------------------------------------- */
  root.innerHTML = `
    <div class="sidebar flex flex-col w-80 border-r border-neutral-700 p-4 gap-2">
      <button id="btnConnect"    class="btn">Connect HID</button>
      <button id="btnDisconnect" class="btn">Disconnect All</button>
      <button id="btnCal"        class="btn">Calibrate All</button>
      <pre id="log" class="flex-1 overflow-auto text-xs mt-2 bg-neutral-900 p-2 border-b border-neutral-700"></pre>
    </div>
    <div id="calOverlay" class="fixed inset-0 bg-black/70 flex flex-col items-center justify-center text-4xl font-bold text-white hidden">
      <div class="text-8xl mb-8">T</div>
      <div class="text-2xl mb-4">Hold T-pose position</div>
      <span id="calCount">5</span>
    </div>
    <canvas id="gl" class="flex-1"></canvas>
  `;

  /* ------------------------------------------------------------
   * 2. Grab the freshly-injected elements
   * ---------------------------------------------------------- */
  const btnConnect    = document.getElementById('btnConnect')    as HTMLButtonElement;
  const btnDisconnect = document.getElementById('btnDisconnect') as HTMLButtonElement;
  const btnCal        = document.getElementById('btnCal')        as HTMLButtonElement;
  const canvas        = document.getElementById('gl')            as HTMLCanvasElement;
  const sidebar       = document.querySelector('.sidebar')       as HTMLDivElement;
  logRef = document.getElementById('log') as HTMLPreElement;

  /* ------------------------------------------------------------
   * 3. Core singletons
   * ---------------------------------------------------------- */
  const hid   = new HidManager();
  const store = new DeviceStore();
  const solver= new ArmSolver(store);
  const roCtrl = new RoArmController(store);
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

  /* ------------ prefs ------------ */
  mountPrefs(root);

  /* ------------ stereo cam ------------ */
  mountStereoCam(sidebar);

  /* ------------------------------------------------------------
   * Device list
   * ---------------------------------------------------------- */
  mountDeviceList(sidebar, hid, store);

  /* ------------------------------------------------------------
   * Angle table
   * ---------------------------------------------------------- */
  mountAnglePanel(sidebar, solver);

  /* ------------------------------------------------------------
   * Ro-Arm control
   * ---------------------------------------------------------- */
  if (prefs.roArmEnabled) {
    mountRoArmCard('left', sidebar, roCtrl);
    mountRoArmCard('right', sidebar, roCtrl);
  }
  document.addEventListener('prefsChanged', ()=>{
    // simple reload approach
    location.reload();
  });

  /* ------------------------------------------------------------
   * Three.js scene
   * ---------------------------------------------------------- */
  initScene(canvas, store, solver);
}
