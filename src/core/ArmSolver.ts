import { quat, vec3 } from 'gl-matrix';
import { DeviceStore } from './DeviceStore';
import { DeviceRole } from '../types/device';
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

  // Track previous raw forearm roll values for angle unwrapping
  private prevFaRollL: number = 0;
  private prevFaRollR: number = 0;

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

  // Unwrap angle to prevent discontinuities (keeps angles continuous)
  private unwrapAngle(newAngle: number, prevAngle: number): number {
    const diff = newAngle - prevAngle;
    
    // If difference is > 180°, we likely wrapped around
    if (diff > 180) {
      return newAngle - 360;
    } else if (diff < -180) {
      return newAngle + 360;
    }
    
    return newAngle;
  }

  // Sanitize angle to prevent NaN/Infinity from breaking the model
  private sanitizeAngle(angle: number, fallback: number = 0): number {
    if (!Number.isFinite(angle) || Number.isNaN(angle)) {
      return fallback;
    }
    return angle;
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
    const upRole = side === 'left' ? DeviceRole.ROLE_LEFT_SHOULDER : DeviceRole.ROLE_RIGHT_SHOULDER;
    const lowRole = side === 'left' ? DeviceRole.ROLE_LEFT_FOREARM : DeviceRole.ROLE_RIGHT_FOREARM;
    const handRole = side === 'left' ? DeviceRole.ROLE_LEFT_HAND : DeviceRole.ROLE_RIGHT_HAND;
    
    const up   = this.store.getByPosition(upRole);
    const low  = this.store.getByPosition(lowRole);
    if(!up || !low) return null;

    const gloveRole = side === 'left' ? DeviceRole.ROLE_LEFT_GLOVE : DeviceRole.ROLE_RIGHT_GLOVE;
    const handDev = this.store.getByPosition(handRole) ?? this.store.getByPosition(gloveRole);
  
    const Q_TU = up.quat;
    const Q_TF = low.quat;
  
    /* ---------- shoulder ---------- */
    const [yaw, pitch, roll] = eulerZYX(Q_TU).map(r=>r*180/Math.PI);
    const shYaw = this.sanitizeAngle(yaw, 0);
    const shPitch = this.sanitizeAngle(pitch, 0); 
    const shRoll = this.sanitizeAngle(roll, 0);

    /* ---------- elbow flex via vector angle ---------- */
    const flexDeg = this.sanitizeAngle(elbowFlexDeg(up.fwd, low.fwd), 0);

    /* ---------- fore-arm roll (improved for bent elbow) ------------ */
    let faRoll = 0;
    
    // Use relative "up" vectors for more robust forearm roll calculation
    // This approach is more stable when elbow is bent
    const upperUp = up.up;      // upper arm "up" vector  
    const lowerUp = low.up;     // forearm "up" vector
    const lowerFwd = low.fwd;   // forearm forward vector (better for sign calculation)
    
    // Project both up vectors onto the plane perpendicular to forearm forward
    // This removes the component that changes due to elbow flex
    const upperUpProj = vec3.create();
    const lowerUpProj = vec3.create();
    
    // Project: v_proj = v - (v·forward) * forward
    const upperDot = vec3.dot(upperUp, lowerFwd);
    const lowerDot = vec3.dot(lowerUp, lowerFwd);
    
    vec3.scaleAndAdd(upperUpProj, upperUp, lowerFwd, -upperDot);
    vec3.scaleAndAdd(lowerUpProj, lowerUp, lowerFwd, -lowerDot);
    
    // Normalize the projected vectors
    if (vec3.length(upperUpProj) > 1e-6 && vec3.length(lowerUpProj) > 1e-6) {
      vec3.normalize(upperUpProj, upperUpProj);
      vec3.normalize(lowerUpProj, lowerUpProj);
      
      // Calculate angle between projected up vectors
      const cosAngle = Math.max(-1, Math.min(1, vec3.dot(upperUpProj, lowerUpProj)));
      const angle = Math.acos(cosAngle);
      
      // Determine sign using cross product with forearm forward
      const cross = vec3.create();
      vec3.cross(cross, upperUpProj, lowerUpProj);
      const sign = vec3.dot(cross, lowerFwd) >= 0 ? -1 : 1;  // Using forearm forward
      
      faRoll = this.sanitizeAngle(sign * angle * 180 / Math.PI, 0);
    }
    
    // Apply angle unwrapping to prevent discontinuities
    if (side === 'left') {
      faRoll = this.unwrapAngle(faRoll, this.prevFaRollL);
      this.prevFaRollL = faRoll;
    } else {
      faRoll = this.unwrapAngle(faRoll, this.prevFaRollR);
      this.prevFaRollR = faRoll;
    }
  
    /* ---------- wrist ---------- */
    let wrPitch = 0, wrYaw = 0;
    if(handDev){
      const Q_TH = handDev.quat;  // hand quaternion (absolute)
      const Q_TF = low.quat;      // forearm quaternion (absolute)
      
      // Calculate relative quaternion: hand orientation relative to forearm
      // This gives us the hand's rotation in the forearm's coordinate frame
      const Q_W = quat.multiply(quat.create(), quat.invert(quat.create(), Q_TF), Q_TH);
      
      // Normalize the relative quaternion to avoid drift
      quat.normalize(Q_W, Q_W);
      
      // Extract wrist angles using eulerZYX which gives [yaw, pitch, roll]
      const [wYaw, wRoll, wPitch] = eulerZYX(Q_W);
      
      // Convert to degrees and handle NaN cases
      wrYaw   = this.sanitizeAngle(wYaw * 180 / Math.PI, 0);
      wrPitch = this.sanitizeAngle(wPitch * 180 / Math.PI, 0);
      
      // Optional: Apply coordinate frame corrections if needed
      // Uncomment and adjust these if the wrist angles need sign/axis corrections
      // wrYaw = -wrYaw;    // flip yaw if needed
      // wrPitch = -wrPitch; // flip pitch if needed
    }
  
    return { shYaw, shPitch, shRoll,
             elFlex:flexDeg, faRoll,
             wrPitch, wrYaw };
  }
}
