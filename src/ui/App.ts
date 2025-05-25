console.log('App.ts loaded');      // top-most line

// src/ui/App.ts
import { HidManager }   from '../core/HidManager';
import { DeviceStore }  from '../core/DeviceStore';
import { ArmSolver }    from '../core/ArmSolver';
import { mountAnglePanel } from './components/AnglePanel';
import { initScene }    from './scene/sceneManager';

export function mount(root: HTMLElement) {
  /* ------------------------------------------------------------
   * 1. Inject sidebar + canvas markup
   * ---------------------------------------------------------- */
  root.innerHTML = `
    <div class="sidebar flex flex-col w-80 border-r border-neutral-700 p-4 gap-2">
      <button id="btnConnect"    class="btn">Connect HID</button>
      <button id="btnDisconnect" class="btn">Disconnect</button>
      <button id="btnCal"        class="btn">Calibrate All</button>

      <pre id="log" class="flex-1 overflow-auto text-xs mt-2 bg-neutral-900 p-2 rounded"></pre>
    </div>
    <canvas id="gl" class="flex-1"></canvas>
  `;

  console.log('Sidebar HTML injected',
    !!document.getElementById('btnConnect'));

  /* ------------------------------------------------------------
   * 2. Grab the freshly-injected elements
   * ---------------------------------------------------------- */
  const btnConnect    = document.getElementById('btnConnect')    as HTMLButtonElement;
  const btnDisconnect = document.getElementById('btnDisconnect') as HTMLButtonElement;
  const btnCal        = document.getElementById('btnCal')        as HTMLButtonElement;
  const logEl         = document.getElementById('log')           as HTMLPreElement;
  const canvas        = document.getElementById('gl')            as HTMLCanvasElement;
  const sidebar       = document.querySelector('.sidebar')       as HTMLDivElement;

  /* ------------------------------------------------------------
   * 3. Core singletons
   * ---------------------------------------------------------- */
  const hid   = new HidManager();
  const store = new DeviceStore();
  const solver= new ArmSolver(store);

  /* ---------- HID → store pipeline ---------- */
  hid.addEventListener('report', e => {
    const { id, data } = (e as CustomEvent<{ id: string; data: DataView }>).detail;
    store.handleRaw(id, data);
  });

  /* ------------------------------------------------------------
   * 4. Buttons
   * ---------------------------------------------------------- */
  btnConnect.addEventListener('click', async () => {
    console.log('Connect clicked');
    try {
      await hid.connect();
    } catch (err) {
      console.error(err);
      alert(`WebHID error: ${err}`);
    }
  });

  btnDisconnect?.addEventListener('click', () => hid.disconnectAll());
  btnCal?.addEventListener('click', () => hid.sendCalibrateAll());

  /* ------------------------------------------------------------
   * 5. Debug log of latest device update
   * ---------------------------------------------------------- */
  store.addEventListener('update', e => {
    logEl.textContent = JSON.stringify((e as CustomEvent<any>).detail, null, 2);
  });

  /* ------------------------------------------------------------
   * 6. Angle table
   * ---------------------------------------------------------- */
  mountAnglePanel(sidebar, solver);

  /* ------------------------------------------------------------
   * 7. Three.js scene
   * ---------------------------------------------------------- */
  initScene(canvas, store);
}
