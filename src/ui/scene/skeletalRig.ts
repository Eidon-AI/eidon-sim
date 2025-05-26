import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';

const loader = new GLTFLoader();

type Side = 'left' | 'right';
type BoneMap = Record<'shoulder' | 'elbow' | 'wrist', THREE.Bone>;

export class SkeletalRig {
  private bones: Record<Side, BoneMap> = {} as any;

  constructor(
    private scene: THREE.Scene,
    private solver: ArmSolver,
    gltfPath = '/assets/YBot.gltf'
  ) {
    loader.load(
      gltfPath,
      (gltf: GLTF) => this.init(gltf.scene),
      undefined,
      err => console.error('GLTF load error', err)
    );
  }

  /* ----------------- initialise once ---------------- */
  private init(root: THREE.Group) {
    // Place the full body once
    root.position.set(-0.25, 0, 0);
    this.scene.add(root);

    this.bones.left = {
      shoulder: root.getObjectByName("LeftArm")     as THREE.Bone,
      elbow:    root.getObjectByName("LeftForeArm") as THREE.Bone,
      wrist:    root.getObjectByName("LeftHand")    as THREE.Bone
    };

    this.bones.right = {
      shoulder: root.getObjectByName("RightArm")     as THREE.Bone,
      elbow:    root.getObjectByName("RightForeArm") as THREE.Bone,
      wrist:    root.getObjectByName("RightHand")    as THREE.Bone
    };

    if (Object.values(this.bones.left).some(b => !b) ||
        Object.values(this.bones.right).some(b => !b)) {
      console.error('One or more arm bones not found in model');
      return;
    }

    // Drive both arms each solver update
    this.solver.addEventListener('angles', () => {
      this.apply('left');  this.apply('right');
    });
  }

  /* ----------------- map angles → bones ------------- */
  private apply(side: Side) {
    const a = this.solver.getAngles(side);
    if (!a) return;

    const b = this.bones[side];
    const d2r = Math.PI / 180;

    /* -- Shoulder stays the same (sign-flipped Y & Z) -- */
    b.shoulder.rotation.set(a.shRoll*d2r, -a.shPitch*d2r, -a.shYaw*d2r);

    /* -- Elbow hinge (still +flex) -- */
    if (side === 'left') {
      b.elbow.rotation.set(0, 0,  a.elFlex * d2r);   // +flex bends upward
    } else {
      b.elbow.rotation.set(0, 0, -a.elFlex * d2r);   // mirror for right
    }

    /* -- Wrist: pitch needs the same Y flip, yaw flip on Z -- */
    b.wrist.rotation.set(
      -a.wrPitch * d2r,
      0,//-a.faRoll * d2r,
      -a.wrYaw * d2r
    );
  }
}
