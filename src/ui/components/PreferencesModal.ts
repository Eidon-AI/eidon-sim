import { prefs, savePrefs } from '../../core/preferences';

export function mountPrefs(root: HTMLElement) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center';
  modal.innerHTML = `
    <div class="bg-neutral-800 p-4 rounded w-64 space-y-3">
      <h3 class="font-bold text-lg mb-2">Preferences</h3>

      <label>Humerus (m)<input id="pHum" type="number" step="0.01" class="w-16 ml-2 color-black"></label><br>
      <label>Radius (m) <input id="pRad" type="number" step="0.01" class="w-16 ml-2"></label><br>
      <label>Hand  (m) <input id="pHand" type="number" step="0.01" class="w-16 ml-2"></label><br>

      <label>Angle α <input id="pAng" type="number" step="0.05" class="w-16 ml-2"></label><br>
      <label>Finger α<input id="pFin" type="number" step="0.05" class="w-16 ml-2"></label><br>

      <label>Theme
        <select id="pTheme" class="ml-2">
          <option value="dark">Dark</option><option value="light">Light</option>
        </select>
      </label><br>

      <label>Surface <input id="pSurf" type="color" class="ml-2"></label><br>
      <label>Joints  <input id="pJoint" type="color" class="ml-2"></label><br>

      <label class="flex items-center">
        <input id="pStereoEn" type="checkbox" class="mr-2"> Stereo headset
      </label>
      <label>L-eye URL
        <input id="pLeftURL" type="text" class="ml-2 w-40">
      </label><br>
      <label>R-eye URL
        <input id="pRightURL" type="text" class="ml-2 w-40">
      </label>

      <button id="pSave" class="btn mt-2">Save</button>
    </div>`;
  root.appendChild(modal);

  /* open button */
  const gear = document.createElement('button');
  gear.textContent = '⚙';
  gear.className = 'btn absolute top-2 right-2';
  gear.onclick = ()=> modal.classList.toggle('hidden');
  root.appendChild(gear);

  /* fill inputs */
  const setValues = () => {
    (document.getElementById('pHum')  as HTMLInputElement).value = String(prefs.humLen);
    (document.getElementById('pRad')  as HTMLInputElement).value = String(prefs.radLen);
    (document.getElementById('pHand') as HTMLInputElement).value = String(prefs.handLen);
    (document.getElementById('pAng')  as HTMLInputElement).value = String(prefs.angleAlpha);
    (document.getElementById('pFin')  as HTMLInputElement).value = String(prefs.fingerAlpha);
    (document.getElementById('pTheme')as HTMLSelectElement).value = prefs.theme;
    (document.getElementById('pSurf') as HTMLInputElement).value = prefs.meshSurface;
    (document.getElementById('pJoint')as HTMLInputElement).value = prefs.meshJoints;
    (document.getElementById('pStereoEn') as HTMLInputElement).checked = prefs.stereoEnabled;
    (document.getElementById('pLeftURL')  as HTMLInputElement).value = prefs.leftURL;
    (document.getElementById('pRightURL') as HTMLInputElement).value = prefs.rightURL;
  };
  setValues();

  /* save */
  document.getElementById('pSave')!.onclick = () => {
    prefs.humLen      = parseFloat((document.getElementById('pHum')  as HTMLInputElement).value);
    prefs.radLen      = parseFloat((document.getElementById('pRad')  as HTMLInputElement).value);
    prefs.handLen     = parseFloat((document.getElementById('pHand') as HTMLInputElement).value);
    prefs.angleAlpha  = parseFloat((document.getElementById('pAng')  as HTMLInputElement).value);
    prefs.fingerAlpha = parseFloat((document.getElementById('pFin')  as HTMLInputElement).value);
    prefs.theme       = (document.getElementById('pTheme') as HTMLSelectElement).value as any;
    prefs.meshSurface = (document.getElementById('pSurf') as HTMLInputElement).value;
    prefs.meshJoints  = (document.getElementById('pJoint')as HTMLInputElement).value;
    prefs.stereoEnabled = (document.getElementById('pStereoEn') as HTMLInputElement).checked;
    prefs.leftURL  = (document.getElementById('pLeftURL')  as HTMLInputElement).value;
    prefs.rightURL = (document.getElementById('pRightURL') as HTMLInputElement).value;

    document.documentElement.dataset.theme = prefs.theme;
    savePrefs();
    modal.classList.add('hidden');
  };
}
