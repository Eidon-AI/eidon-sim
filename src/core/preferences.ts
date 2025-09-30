type Prefs = {
  humLen: number; radLen: number; handLen: number;
  angleAlpha: number; fingerAlpha: number;
  theme: 'dark' | 'light';
  meshSurface: string;   // hex
  meshJoints:  string;   // hex
  stereoEnabled: boolean;
  leftURL:  string;
  rightURL: string;
};

const DEFAULT: Prefs = {
  humLen: 0.30, radLen: 0.26, handLen: 0.10,
  angleAlpha: 0.2, fingerAlpha: 0.25,
  theme: 'dark',
  meshSurface: '#ff0',
  meshJoints : '#888',
  stereoEnabled: false,
  leftURL: 'http://eidon-glass-47bc.local:81/stream',
  rightURL: 'http://eidon-glass-0214.local:81/stream'
};

export const prefs: Prefs = Object.assign(
  {}, DEFAULT, JSON.parse(localStorage.getItem('eidonPrefs') || '{}')
);

export function savePrefs() {
  localStorage.setItem('eidonPrefs', JSON.stringify(prefs));
  document.dispatchEvent(new Event('prefsChanged'));
}
