import { DeviceStore } from './DeviceStore';
import { prefs } from './preferences';
import { vec3 } from 'gl-matrix';

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

  private sendTip(side: Side) {
    if (this.paused[side]) return;
    const hand = this.store.getBy(side,'hand');
    if (!hand) return;

    const xyz = hand.chainEnd;
    const prev = this.lastXYZ[side];
    const dist = Math.hypot(xyz[0]-prev[0], xyz[1]-prev[1], xyz[2]-prev[2]);

    if (isNaN(prev[0]) || dist >= prefs.roDelta) {          // significant move
      this.lastXYZ[side] = [...xyz] as vec3;

      fetch(side==='left'?prefs.roLeftURL:prefs.roRightURL,{
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({x:xyz[0], y:xyz[1], z:xyz[2]})
      }).catch(()=>{});

      this.lastSent[side] = Date.now();
      document.dispatchEvent(new CustomEvent('roStatus',{
        detail:{side, xyz, ts:this.lastSent[side], paused:this.paused[side]}
      }));
    }
  }
}
