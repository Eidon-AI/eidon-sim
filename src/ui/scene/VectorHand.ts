/**
 * VectorHand – renders glove IMU orientation vectors (forward + up) at the wrist.
 * Matches VectorArm style: pink = forward, green = up.
 */
import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole } from '../../types/device';
import { HUM_LEN, RAD_LEN } from '../../core/constants';

const FWD_COLOR = '#ff69b4'; // pink
const UP_COLOR  = '#00ff00'; // green
const FWD_LEN   = 0.35;
const UP_LEN    = 0.20;

export class VectorHand {
  private group:   THREE.Group;
  private fwdTube: THREE.Mesh;
  private fwdTip:  THREE.Mesh;
  private upTube:  THREE.Mesh;
  private upTip:   THREE.Mesh;
  private tubeGeo: THREE.CylinderGeometry;
  private coneGeo: THREE.ConeGeometry;
  private fwdMat:  THREE.MeshBasicMaterial;
  private upMat:   THREE.MeshBasicMaterial;

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side: 'left' | 'right'
  ) {
    this.tubeGeo = new THREE.CylinderGeometry(0.005, 0.005, 1, 8);
    this.coneGeo = new THREE.ConeGeometry(0.01, 0.04, 8);
    this.fwdMat  = new THREE.MeshBasicMaterial({ color: FWD_COLOR });
    this.upMat   = new THREE.MeshBasicMaterial({ color: UP_COLOR });

    this.fwdTube = new THREE.Mesh(this.tubeGeo, this.fwdMat);
    this.fwdTip  = new THREE.Mesh(this.coneGeo, this.fwdMat);
    this.upTube  = new THREE.Mesh(this.tubeGeo, this.upMat);
    this.upTip   = new THREE.Mesh(this.coneGeo, this.upMat);

    [this.fwdTube, this.fwdTip, this.upTube, this.upTip].forEach(m => (m.visible = false));

    this.group = new THREE.Group();
    this.group.add(this.fwdTube, this.fwdTip, this.upTube, this.upTip);
    scene.add(this.group);

    store.addEventListener('update', () => this.refresh());
  }

  private refresh(): void {
    const gloveRole = this.side === 'left'
      ? DeviceRole.ROLE_LEFT_GLOVE
      : DeviceRole.ROLE_RIGHT_GLOVE;

    const glove = this.store.getByPosition(gloveRole);
    if (!glove || vec3.length(glove.fwd) < 0.001) {
      [this.fwdTube, this.fwdTip, this.upTube, this.upTip].forEach(m => (m.visible = false));
      return;
    }

    // Compute wrist position from arm chain (same anchor logic as VectorArm)
    const hub     = this.store.getByPosition(this.side === 'left' ? DeviceRole.ROLE_LEFT_SHOULDER : DeviceRole.ROLE_RIGHT_SHOULDER);
    const forearm = this.store.getByPosition(this.side === 'left' ? DeviceRole.ROLE_LEFT_FOREARM  : DeviceRole.ROLE_RIGHT_FOREARM);

    const shoulder: vec3 = this.side === 'left' ? [0.3, 0, 0] : [-0.3, 0, 0];
    const upperEnd: vec3 = hub
      ? vec3.scaleAndAdd(vec3.create(), shoulder, hub.fwd, HUM_LEN())
      : vec3.clone(shoulder);
    const wrist: vec3 = forearm
      ? vec3.scaleAndAdd(vec3.create(), upperEnd, forearm.fwd, RAD_LEN())
      : vec3.clone(upperEnd);

    this.drawVector(wrist, glove.fwd, FWD_LEN, this.fwdTube, this.fwdTip);
    this.drawVector(wrist, glove.up,  UP_LEN,  this.upTube,  this.upTip);
  }

  private drawVector(origin: vec3, dir: vec3, length: number, tube: THREE.Mesh, tip: THREE.Mesh): void {
    const end = vec3.scaleAndAdd(vec3.create(), origin, dir, length);
    const mid = vec3.lerp(vec3.create(), origin, end, 0.5);
    const nDir = vec3.normalize(vec3.create(), dir);

    tube.visible = true;
    tip.visible  = true;

    tube.scale.set(1, length, 1);
    tube.position.set(mid[0], mid[1], mid[2]);
    tube.lookAt(tube.position.x + nDir[0], tube.position.y + nDir[1], tube.position.z + nDir[2]);
    tube.rotateX(Math.PI / 2);

    tip.position.set(end[0], end[1], end[2]);
    tip.lookAt(tip.position.x + nDir[0], tip.position.y + nDir[1], tip.position.z + nDir[2]);
    tip.rotateX(Math.PI / 2);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public destroy(): void {
    this.tubeGeo.dispose();
    this.coneGeo.dispose();
    this.fwdMat.dispose();
    this.upMat.dispose();
    this.scene.remove(this.group);
  }
}
