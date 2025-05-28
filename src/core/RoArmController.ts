import { DeviceStore } from './DeviceStore';
import { prefs } from './preferences';
import { vec3 } from 'gl-matrix';
import { HUM_LEN, RAD_LEN, HAND_LEN } from './constants';

type Side = 'left' | 'right';

export class RoArmController {
  private lastSent: Record<Side, number> = { left: 0, right: 0 };
  private paused : Record<Side, boolean> = { left: false, right: false };
  private lastXYZ : Record<Side, vec3>   = { left:[NaN,NaN,NaN], right:[NaN,NaN,NaN] };

  constructor(private store: DeviceStore) {
    store.addEventListener('update', e=>{
      const s = (e as CustomEvent<any>).detail;
      if (!prefs.roArmEnabled) return;
      if (Date.now() - this.lastSent[s.arm?.side ?? 'left'] < 50) return; // 20 Hz
      this.sendTip('left'); this.sendTip('right');
    });
    document.addEventListener('prefsChanged', ()=>{}); // placeholder if needed
  }

  togglePause(side: Side) { this.paused[side] = !this.paused[side]; }

  private calcTip(side: Side): vec3 | null {
    const up   = this.store.getBy(side, 'upper');
    const low  = this.store.getBy(side, 'lower');
    const hand = this.store.getBy(side, 'hand');   // glove optional
  
    // need at least upper + lower to place hand tip reliably
    if (!up || !low) return null;
  
    const shoulder: vec3 = side === 'left'
      ? [-0.25, 0.05,  0.15]
      : [-0.25, 0.05, -0.15];
  
    const elbow = vec3.scaleAndAdd(vec3.create(), shoulder, up.fwd, HUM_LEN());
    const wrist = vec3.scaleAndAdd(vec3.create(), elbow   , low.fwd, RAD_LEN());
  
    // hand length always applied (glove or not)
    const tip   = vec3.scaleAndAdd(vec3.create(), wrist   ,
                  hand ? hand.fwd : low.fwd, HAND_LEN());
    return tip;
  }

  private sendTip(side: Side) {
    const tip = this.calcTip(side);
    if (!tip) return;                          // not enough data yet
  
    /* --- sidebar update every frame --- */
    document.dispatchEvent(new CustomEvent('roStatus', {
      detail: { side, xyz: tip, ts: Date.now(), paused: this.paused[side] }
    }));
  
    if (this.paused[side]) return;
  
    const prev = this.lastXYZ[side];
    const dist = Math.hypot(tip[0]-prev[0], tip[1]-prev[1], tip[2]-prev[2]);
    if (!isNaN(prev[0]) && dist < prefs.roDelta) return;
  
    this.lastXYZ[side] = [...tip];
  
    const url = (side==='left'?prefs.roLeftURL:prefs.roRightURL) +
                `/js?json=${encodeURIComponent(JSON.stringify({
                  T:1041, x:tip[0], y:tip[2], z:tip[1], t:3.14
                }))}`;
  
    fetch(url, { method:'GET', mode:'no-cors' }).catch(()=>{});
  }
}
