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
    <div class="sidebar fixed bottom-0 right-0 w-80 flex flex-col bg-neutral-900/80 backdrop-blur-sm border-neutral-700 p-4 gap-2 overflow-y-auto z-10">
      <div class="flex gap-2 justify-start">
        <button id="btnConnect"    class="btn" style="font-size: 1.2rem;">✛</button>
        <button id="btnCal"        class="btn">Calibrate All</button>
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
  if (prefs.roArmEnabled) mountRoArmCard(sidebar, roCtrl);

  /* ------------ Angle table ------------ */
  mountAnglePanel(sidebar, solver);

  /* ------------ Three.js scene ------------ */
  initScene(canvas, store, solver);
}
