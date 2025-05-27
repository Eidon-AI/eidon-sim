import { quat } from 'gl-matrix';
import { DeviceStore } from './DeviceStore';
import { eulerZYX, twistAroundX, elbowFlexDeg, rollAroundForward } from './mathUtils';
import { JOINT_LIMITS, ANGLE_ALPHA } from './constants';

function clamp(name: keyof SevenAngles, v: number): number {
  const [min, max] = (JOINT_LIMITS as any)[name];
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

export interface SevenAngles {
  shYaw: number; shPitch: number; shRoll: number;
  elFlex: number; faRoll: number;
  wrPitch: number; wrYaw: number;
}

export class ArmSolver extends EventTarget {
  private left: SevenAngles | null = null;
  private right: SevenAngles | null = null;

  private smoothL: SevenAngles | null = null;
  private smoothR: SevenAngles | null = null;

  constructor(private store: DeviceStore) {
    super();

    // Initialize smooth angles with default values
    this.smoothL = {
      shYaw: 0, shPitch: 0, shRoll: 0,
      elFlex: 0, faRoll: 0,
      wrPitch: 0, wrYaw: 0
    };
    this.smoothR = { ...this.smoothL };

    store.addEventListener('update', () => this.update());
  }

  getAngles(side: 'left' | 'right') {
    return side === 'left' ? this.smoothL : this.smoothR;
  }

  /* -------- core update loop (stub) ---------------- */
  private update() {
    const rawL  = this.solveSide('left' );
    const rawR  = this.solveSide('right');
  
    if (rawL) this.smoothL = this.filter(rawL, this.smoothL);
    if (rawR) this.smoothR = this.filter(rawR, this.smoothR);
  
    this.dispatchEvent(new Event('angles'));
  }

  private filter(newA: SevenAngles, prev: SevenAngles | null): SevenAngles {
    const out: SevenAngles = { ...newA } as any;
    for (const k of Object.keys(newA) as (keyof SevenAngles)[]) {
      // clamp
      out[k] = clamp(k, newA[k]);
      // smooth
      if (prev) out[k] = lerp(prev[k], out[k], ANGLE_ALPHA());
    }
    return out;
  }

  private solveSide(side: 'left' | 'right'): SevenAngles | null {
    const up   = this.store.getBy(side,'upper');
    const low  = this.store.getBy(side,'lower');
    if(!up || !low) return null;
  
    const handDev = this.store.getBy(side,'hand');         // glove optional
  
    const Q_TU = up.quat;
    const Q_TF = low.quat;
  
    /* ---------- shoulder ---------- */
    const [yaw, pitch, roll] = eulerZYX(Q_TU).map(r=>r*180/Math.PI);

    /* ---------- elbow flex via vector angle ---------- */
    const flexDeg = elbowFlexDeg(up.fwd, low.fwd);

    /* ---------- fore-arm roll (unchanged) ------------ */
    const faRoll = rollAroundForward(up.quat, low.quat, up.fwd);
  
    /* ---------- elbow hinge + fore-arm roll ---------- */
    // const Q_E = quat.multiply(quat.create(), quat.invert(quat.create(), Q_TU), Q_TF);
    // const [flex] = eulerYZX(Q_E);              // first axis = flex (rad)
    // const flexDeg = flex*180/Math.PI;
    // const faRoll  = twistAroundX(Q_E)*180/Math.PI;
  
    /* ---------- wrist ---------- */
    let wrPitch = 0, wrYaw = 0;
    if(handDev){
      const Q_TH = handDev.quat;
      const Q_W  = quat.multiply(quat.create(), quat.invert(quat.create(), Q_TF), Q_TH);
      const [wYaw, wPitch] = eulerZYX(Q_W);
      wrYaw   = wYaw  *180/Math.PI;
      wrPitch = wPitch*180/Math.PI;
    }
  
    return { shYaw:yaw, shPitch:pitch, shRoll:roll,
             elFlex:flexDeg, faRoll,
             wrPitch, wrYaw };
  }
}
