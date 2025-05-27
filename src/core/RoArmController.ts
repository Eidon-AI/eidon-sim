import { DeviceStore } from './DeviceStore';
import { prefs } from './preferences';

type Side = 'left' | 'right';

export class RoArmController {
  private lastSent: Record<Side, number> = { left: 0, right: 0 };
  private paused : Record<Side, boolean> = { left: false, right: false };

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

  private sendTip(side: Side) {
    if (this.paused[side]) return;
    const hand = this.store.getBy(side, 'hand');
    if (!hand) return;
    const url = side==='left' ? prefs.roLeftURL : prefs.roRightURL;
    const body = JSON.stringify({ x: hand.chainEnd[0],
                                  y: hand.chainEnd[1],
                                  z: hand.chainEnd[2] });
    fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body })
      .catch(()=>{/* swallow errors; could dispatch status event */});
    this.lastSent[side] = Date.now();
    document.dispatchEvent(new CustomEvent('roStatus', {
      detail:{ side, xyz: hand.chainEnd, ts: this.lastSent[side], paused:this.paused[side]}
    }));
  }
}
