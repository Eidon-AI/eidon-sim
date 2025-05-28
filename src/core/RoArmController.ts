import { DeviceStore } from './DeviceStore';
import { prefs } from './preferences';
import { vec3 } from 'gl-matrix';
import { HUM_LEN, RAD_LEN, HAND_LEN } from './constants';

type Side = 'left' | 'right';

interface HandData {
  finger?: number[];
}

interface DeviceUpdate {
  arm?: {
    side: Side;
  };
}

export class RoArmController {
  private lastSent: Record<Side, number> = { left: 0, right: 0 };
  private paused : Record<Side, boolean> = { left: false, right: false };
  private lastXYZ : Record<Side, vec3>   = { left:[NaN,NaN,NaN], right:[NaN,NaN,NaN] };
  private rightIndexAngle: number = 0;

  constructor(private store: DeviceStore) {
    store.addEventListener('update', e=>{
      const s = (e as CustomEvent<DeviceUpdate>).detail;
      if (!prefs.roArmEnabled) return;
      if (Date.now() - this.lastSent[s.arm?.side ?? 'left'] < 50) return; // 20 Hz
      
      // Update right index finger angle if we have hand data
      const rightHand = this.store.getBy('right', 'hand') as HandData | undefined;
      if (rightHand?.finger?.[5] !== undefined) {
        // Map finger value (0-220) to t value (0-3.14)
        // 0 (open) -> 0, 220 (closed) -> 3.14
        const cappedValue = Math.min(rightHand.finger[5], 220);
        this.rightIndexAngle = (cappedValue / 220) * Math.PI;
        console.log('finger value:', rightHand.finger[5], 'capped:', cappedValue, 't value:', this.rightIndexAngle);
      }
      
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
  
    this.lastXYZ[side] = vec3.clone(tip);

    let zTip = tip[1];
    if (zTip < -0.11) zTip = -0.11;

    const payload = {
      T: 1041,
      x: Math.round(tip[0] * prefs.roScale),
      y: Math.round(-tip[2] * prefs.roScale),
      z: Math.round(zTip * prefs.roScale),
      t: side === 'right' ? this.rightIndexAngle : 3.14 // Use right index angle for right arm, default for left
    };
  
    const url = (side==='left'?prefs.roLeftURL:prefs.roRightURL) +
                `?json=${encodeURIComponent(JSON.stringify(payload))}`;
  
    fetch(url, { method:'GET', mode:'no-cors' }).catch(()=>{});
  }
}
