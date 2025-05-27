import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';
import { DeviceStore } from '../../core/DeviceStore';

const loader = new GLTFLoader();

type Side = 'left' | 'right';
type ArmMap = Record<'shoulder' | 'elbow' | 'wrist', THREE.Bone>;

export class SkeletalRig {
  private armBones:   Record<Side, ArmMap>        = {} as any;
  private fingerMap:  Record<Side, THREE.Bone[]>  = { left: [], right: [] };

  constructor(
    private scene : THREE.Scene,
    private store : DeviceStore,
    private solver: ArmSolver,
    gltfPath = '/assets/YBot.gltf'
  ) {
    loader.load(
      gltfPath,
      (g: GLTF) => this.init(g.scene),
      undefined,
      err => console.error('GLTF load error', err)
    );
  }

  /* ------------ once, both arms in one mesh ------------- */
  private init(root: THREE.Group) {
    root.position.set(0, 0, 0);
    this.scene.add(root);

    this.armBones.left = {
      shoulder: root.getObjectByName('LeftArm')     as THREE.Bone,
      elbow:    root.getObjectByName('LeftForeArm') as THREE.Bone,
      wrist:    root.getObjectByName('LeftHand')    as THREE.Bone
    };
    this.armBones.right = {
      shoulder: root.getObjectByName('RightArm')     as THREE.Bone,
      elbow:    root.getObjectByName('RightForeArm') as THREE.Bone,
      wrist:    root.getObjectByName('RightHand')    as THREE.Bone
    };

    const fingerNames = (side: Side) => {
      const hand = side === 'left' ? 'LeftHand' : 'RightHand';
      return [
        ...['Thumb'].flatMap(d => [1,2,3,4].map(i => `${hand}${d}${i}`)), // Thumb1-4
        ...['Index','Middle','Ring','Pinky'].flatMap(d => [1,2,3].map(i => `${hand}${d}${i}`)) // Other fingers 1-3
      ];
    };

    this.fingerMap.left  = fingerNames('left') .map(n => root.getObjectByName(n) as THREE.Bone).filter(Boolean);
    this.fingerMap.right = fingerNames('right').map(n => root.getObjectByName(n) as THREE.Bone).filter(Boolean);

    this.solver.addEventListener('angles', () => {
      this.applySide('left');  this.applySide('right');
    });
  }

  /* ------------ per-frame mapping ----------------------- */
  private applySide(side: Side) {
    const a = this.solver.getAngles(side);
    if (!a) return;

    const arm = this.armBones[side];
    const d2r = Math.PI / 180;
    const sgn = side === 'left' ? 1 : -1;      // mirroring sign

    /* Shoulder (yaw Z, pitch Y, roll X) */
    arm.shoulder.rotation.set(a.shRoll*d2r, -a.shPitch*d2r, -a.shYaw*d2r);

    /* Elbow: hinge around local Z */
    arm.elbow.rotation.set(0, 0, sgn * a.elFlex * d2r);

    /* Wrist: pitch about X? yaw about Z; add full fore-arm roll */
    arm.wrist.rotation.set(
      -a.wrPitch*d2r,
      0,
      -sgn * (a.wrYaw + a.faRoll) * d2r
    );

    /* Fingers */
    const glove = this.store.getBy(side, 'hand');
    const fingerBones = this.fingerMap[side];
    if (glove?.fingerNorm && fingerBones.length >= 15) {
      glove.fingerNorm.forEach((v, i) => {
        const bend = v * 90 * d2r;
        fingerBones[i].rotation.x = -bend;       // curl inwards
      });
    }
  }
}
