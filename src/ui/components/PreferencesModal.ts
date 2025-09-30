import { prefs, savePrefs } from '../../core/preferences';

export function mountPrefs(root: HTMLElement) {
  const modal = document.createElement('div');
  modal.className = 'flex fixed inset-0 bg-black/60 hidden items-center justify-center z-50';
  modal.innerHTML = `
    <div class="modal bg-neutral-800/70 backdrop-blur-sm p-5 rounded-lg w-128 space-y-3">
      <div class="flex justify-between items-center mb-2">
        <h3 class="font-bold text-lg">Preferences</h3>
        <button id="pClose" class="text-neutral-400 hover:text-white">✕</button>
      </div>

      <label>Humerus (m)<input id="pHum" type="number" step="0.01" class="w-16 ml-2 color-black"></label>
      <label>Radius (m) <input id="pRad" type="number" step="0.01" class="w-16 ml-2"></label>
      <label>Hand  (m) <input id="pHand" type="number" step="0.01" class="w-16 ml-2"></label>

      <label>Angle α <input id="pAng" type="number" step="0.05" class="w-16 ml-2"></label>
      <label>Finger α<input id="pFin" type="number" step="0.05" class="w-16 ml-2"></label>

      <!-- <label>Theme
        <select id="pTheme" class="ml-2">
          <option value="dark">Dark</option><option value="light">Light</option>
        </select>
      </label> -->

      <label>Surface <input id="pSurf" type="color" class="ml-2"></label>
      <label>Joints  <input id="pJoint" type="color" class="ml-2"></label>

      <label class="flex items-center">
        <input id="pStereoEn" type="checkbox" class="mr-2"> Enable POV
      </label>
      <label>L-eye URL
        <input id="pLeftURL" type="text" class="ml-2 w-50">
      </label>
      <label>R-eye URL
        <input id="pRightURL" type="text" class="ml-2 w-50">
      </label>


      <div class="flex justify-end gap-2 mt-4">
        <button id="pCancel" class="btn">Cancel</button>
        <button id="pSave" class="btn">Save</button>
      </div>
    </div>`;
  root.appendChild(modal);

  // Store original values when opening modal
  let originalValues: any = null;

  // Set up the preferences button click handler
  const btnPrefs = document.getElementById('btnPrefs');
  if (btnPrefs) {
    btnPrefs.onclick = () => {
      modal.classList.toggle('hidden');
      if (!modal.classList.contains('hidden')) {
        // Store original values when opening
        originalValues = {
          humLen: prefs.humLen,
          radLen: prefs.radLen,
          handLen: prefs.handLen,
          angleAlpha: prefs.angleAlpha,
          fingerAlpha: prefs.fingerAlpha,
          meshSurface: prefs.meshSurface,
          meshJoints: prefs.meshJoints,
          stereoEnabled: prefs.stereoEnabled,
          leftURL: prefs.leftURL,
          rightURL: prefs.rightURL,
        };
        setValues();
      }
    };
  }

  /* fill inputs */
  const setValues = () => {
    (document.getElementById('pHum')  as HTMLInputElement).value = String(prefs.humLen);
    (document.getElementById('pRad')  as HTMLInputElement).value = String(prefs.radLen);
    (document.getElementById('pHand') as HTMLInputElement).value = String(prefs.handLen);
    (document.getElementById('pAng')  as HTMLInputElement).value = String(prefs.angleAlpha);
    (document.getElementById('pFin')  as HTMLInputElement).value = String(prefs.fingerAlpha);
    // (document.getElementById('pTheme')as HTMLSelectElement).value = prefs.theme;
    (document.getElementById('pSurf') as HTMLInputElement).value = prefs.meshSurface;
    (document.getElementById('pJoint')as HTMLInputElement).value = prefs.meshJoints;
    (document.getElementById('pStereoEn') as HTMLInputElement).checked = prefs.stereoEnabled;
    (document.getElementById('pLeftURL')  as HTMLInputElement).value = prefs.leftURL;
    (document.getElementById('pRightURL') as HTMLInputElement).value = prefs.rightURL;
  };

  /* restore original values */
  const restoreValues = () => {
    if (!originalValues) return;
    Object.assign(prefs, originalValues);
  };

  /* save */
  document.getElementById('pSave')!.onclick = () => {
    prefs.humLen      = parseFloat((document.getElementById('pHum')  as HTMLInputElement).value);
    prefs.radLen      = parseFloat((document.getElementById('pRad')  as HTMLInputElement).value);
    prefs.handLen     = parseFloat((document.getElementById('pHand') as HTMLInputElement).value);
    prefs.angleAlpha  = parseFloat((document.getElementById('pAng')  as HTMLInputElement).value);
    prefs.fingerAlpha = parseFloat((document.getElementById('pFin')  as HTMLInputElement).value);
    // prefs.theme       = (document.getElementById('pTheme') as HTMLSelectElement).value as any;
    prefs.meshSurface = (document.getElementById('pSurf') as HTMLInputElement).value;
    prefs.meshJoints  = (document.getElementById('pJoint')as HTMLInputElement).value;
    prefs.stereoEnabled = (document.getElementById('pStereoEn') as HTMLInputElement).checked;
    prefs.leftURL  = (document.getElementById('pLeftURL')  as HTMLInputElement).value;
    prefs.rightURL = (document.getElementById('pRightURL') as HTMLInputElement).value;

    document.documentElement.dataset.theme = prefs.theme;
    savePrefs();
    modal.classList.add('hidden');
  };

  /* cancel */
  document.getElementById('pCancel')!.onclick = () => {
    restoreValues();
    modal.classList.add('hidden');
  };

  /* close */
  document.getElementById('pClose')!.onclick = () => {
    restoreValues();
    modal.classList.add('hidden');
  };
}
