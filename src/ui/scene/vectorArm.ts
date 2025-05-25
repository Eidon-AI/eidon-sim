import * as THREE from 'three';
import { DeviceStore } from '../../core/DeviceStore';

export class VectorArm {
  private segs: THREE.Line[] = [];

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side: 'left' | 'right'
  ) {
    ['#ff6', '#6ff', '#f6f'].forEach(c => this.segs.push(this.build(c)));
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
    const upper = this.store.getBy(this.side, 'upper');
    const lower = this.store.getBy(this.side, 'lower');
    const hand  = this.store.getBy(this.side, 'hand');
    [upper, lower, hand].forEach((d, i) => {
      if (!d) return;
      const arr = this.segs[i].geometry.attributes.position.array as Float32Array;
      arr[0] = d.chainStart[0]; arr[1] = d.chainStart[1]; arr[2] = d.chainStart[2];
      arr[3] = d.chainEnd[0];   arr[4] = d.chainEnd[1];   arr[5] = d.chainEnd[2];
      this.segs[i].geometry.attributes.position.needsUpdate = true;
    });
  }
}
