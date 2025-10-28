import { prefs, savePrefs } from '../../core/preferences';
import styles from './styles/PreferencesModal.module.css';

export function mountPrefs(root: HTMLElement) {
  const modal = document.createElement('div');
  modal.className = `${styles.modal} ${styles.hidden}`;
  modal.innerHTML = `
    <div class="${styles.content}">
      <div class="${styles.header}">
        <h3 class="${styles.title}">Preferences</h3>
        <button id="pClose" class="${styles.closeButton}">✕</button>
      </div>

      <label class="${styles.label}">Humerus (m)<input id="pHum" type="number" step="0.01" class="${styles.input}"></label>
      <label class="${styles.label}">Radius (m) <input id="pRad" type="number" step="0.01" class="${styles.input}"></label>
      <label class="${styles.label}">Hand  (m) <input id="pHand" type="number" step="0.01" class="${styles.input}"></label>

      <label class="${styles.label}">Angle α <input id="pAng" type="number" step="0.05" class="${styles.input}"></label>
      <label class="${styles.label}">Finger α<input id="pFin" type="number" step="0.05" class="${styles.input}"></label>

      <!-- <label>Theme
        <select id="pTheme" class="ml-2">
          <option value="dark">Dark</option><option value="light">Light</option>
        </select>
      </label> -->

      <label class="${styles.label}">Surface <input id="pSurf" type="color" class="${styles.colorInput}"></label>
      <label class="${styles.label}">Joints  <input id="pJoint" type="color" class="${styles.colorInput}"></label>
      <label class="${styles.label}">Sym Color <input id="pSymColor" type="color" class="${styles.colorInput}"></label>

      <label class="${styles.checkboxLabel}">
        <input id="pStereoEn" type="checkbox" class="${styles.checkbox}"> Enable POV
      </label>
      <label class="${styles.label}">L-eye URL
        <input id="pLeftURL" type="text" class="${styles.urlInput}">
      </label>
      <label class="${styles.label}">R-eye URL
        <input id="pRightURL" type="text" class="${styles.urlInput}">
      </label>


      <div class="${styles.actions}">
        <button id="pCancel" class="${styles.button}">Cancel</button>
        <button id="pSave" class="${styles.button}">Save</button>
      </div>
    </div>`;
  root.appendChild(modal);

  // Store original values when opening modal
  let originalValues: any = null;

  // Set up the preferences button click handler
  const btnPrefs = document.getElementById('btnPrefs');
  if (btnPrefs) {
    btnPrefs.onclick = () => {
      modal.classList.toggle(styles.hidden);
      if (!modal.classList.contains(styles.hidden)) {
        // Store original values when opening
        originalValues = {
          humLen: prefs.humLen,
          radLen: prefs.radLen,
          handLen: prefs.handLen,
          angleAlpha: prefs.angleAlpha,
          fingerAlpha: prefs.fingerAlpha,
          meshSurface: prefs.meshSurface,
          meshJoints: prefs.meshJoints,
          symColor: prefs.symColor,
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
    (document.getElementById('pSymColor') as HTMLInputElement).value = prefs.symColor;
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
    prefs.symColor = (document.getElementById('pSymColor') as HTMLInputElement).value;
    prefs.stereoEnabled = (document.getElementById('pStereoEn') as HTMLInputElement).checked;
    prefs.leftURL  = (document.getElementById('pLeftURL')  as HTMLInputElement).value;
    prefs.rightURL = (document.getElementById('pRightURL') as HTMLInputElement).value;

    document.documentElement.dataset.theme = prefs.theme;
    savePrefs();
    modal.classList.add(styles.hidden);
  };

  /* cancel */
  document.getElementById('pCancel')!.onclick = () => {
    restoreValues();
    modal.classList.add(styles.hidden);
  };

  /* close */
  document.getElementById('pClose')!.onclick = () => {
    restoreValues();
    modal.classList.add(styles.hidden);
  };
}
