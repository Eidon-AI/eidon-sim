import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
import { DeviceStore } from '../../core/DeviceStore';
import { HUM_LEN, RAD_LEN, HAND_LEN } from '../../core/constants';

export class VectorArm {
  private segs: THREE.Line[] = [];

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side: 'left' | 'right'
  ) {
    ['#ff6', '#6ff', '#f6f'].forEach(col => this.segs.push(this.build(col)));
    const group = new THREE.Group();
    this.segs.forEach(s => group.add(s));
    scene.add(group);

    store.addEventListener('update', () => this.refresh());
  }

  private build(color: string) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3()
    ]);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }

  private refresh() {
    /* ---- gather devices ---- */
    const up    = this.store.getBy(this.side, 'upper');
    const low   = this.store.getBy(this.side, 'lower');
    const glove = this.store.getBy(this.side, 'hand');      // may be undefined

    /* ---- shoulder anchor ---- */
    const shoulder: vec3 = this.side === 'left'
      ? [-0.25, 0.05,  0.15]
      : [-0.25, 0.05, -0.15];

    /* ---- compute chain step-by-step ---- */
    const upperEnd = up
      ? vec3.scaleAndAdd(vec3.create(), shoulder, up.fwd, HUM_LEN)
      : vec3.clone(shoulder);

    const lowerEnd = low
      ? vec3.scaleAndAdd(vec3.create(), upperEnd, low.fwd, RAD_LEN)
      : vec3.clone(upperEnd);

    const handEnd  = glove
      ? vec3.scaleAndAdd(vec3.create(), lowerEnd, glove.fwd, HAND_LEN)
      : vec3.clone(lowerEnd);

    /* ---- update three line segments ---- */
    const pts: [vec3, vec3, vec3, vec3] = [shoulder, upperEnd, lowerEnd, handEnd];

    pts.forEach((p, idx) => {
      if (idx === 3) return;                       // no segment after hand
      const line = this.segs[idx];
      const arr  = line.geometry.attributes.position.array as Float32Array;
      arr[0] = pts[idx][0]; arr[1] = pts[idx][1]; arr[2] = pts[idx][2];
      arr[3] = pts[idx+1][0]; arr[4] = pts[idx+1][1]; arr[5] = pts[idx+1][2];
      line.geometry.attributes.position.needsUpdate = true;

      /* colour sync */
      const dev = idx === 0 ? up : idx === 1 ? low : glove;
      const colorHex = dev?.color ?? '#888';
      (line.material as THREE.LineBasicMaterial).color.set(colorHex);
    });
  }
}
