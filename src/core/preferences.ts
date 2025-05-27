type Prefs = {
  humLen: number; radLen: number; handLen: number;
  angleAlpha: number; fingerAlpha: number;
  theme: 'dark' | 'light';
  meshSurface: string;   // hex
  meshJoints:  string;   // hex
};

const DEFAULT: Prefs = {
  humLen: 0.30, radLen: 0.26, handLen: 0.10,
  angleAlpha: 0.2, fingerAlpha: 0.25,
  theme: 'dark',
  meshSurface: '#6666ff',
  meshJoints : '#ff6666'
};

export const prefs: Prefs = Object.assign(
  {}, DEFAULT, JSON.parse(localStorage.getItem('eidonPrefs') || '{}')
);

export function savePrefs() {
  localStorage.setItem('eidonPrefs', JSON.stringify(prefs));
  document.dispatchEvent(new Event('prefsChanged'));
}
