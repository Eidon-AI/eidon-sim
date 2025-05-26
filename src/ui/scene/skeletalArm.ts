// src/ui/scene/SkeletalArm.ts
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';
import { SkeletonUtils } from 'three/examples/jsm/Addons.js';

const loader = new GLTFLoader();
let cachedScene: THREE.Group | null = null;   // shared
let loadP: Promise<void> | null = null;

function cloneForSide(src: THREE.Group, side: 'left' | 'right') {
  // deep clone (preserves skin + skeleton)
  const clone = SkeletonUtils.clone(src) as THREE.Group;

  if (side === 'right') {
    clone.scale.x *= -1;

    // normals have flipped winding; render both sides
    clone.traverse(o => {
      if ((o as any).isMesh) {
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach(mat => mat.side = THREE.DoubleSide);
        else (m as THREE.Material).side = THREE.DoubleSide;
      }
    });
  }
  clone.position.set(-0.25, 0.05, side === 'left' ? 0.15 : -0.15);
  clone.updateMatrixWorld(true);
  return clone;
}

export class SkeletalArm {
  private bones: Record<'shoulder'|'elbow'|'wrist', THREE.Bone> = {} as any;

  constructor(
    scene: THREE.Scene,
    private solver: ArmSolver,
    private side: 'left' | 'right',
    gltfPath = '/assets/YBot.gltf'
  ) {
    /* ensure GLTF loads once */
    if (!loadP) {
      loadP = new Promise<void>((res, rej) => {
        loader.load(
          gltfPath,
          (g: GLTF) => { cachedScene = g.scene; res(); },
          undefined,
          err => { console.error(err); rej(err); }
        );
      });
    }

    loadP.then(() => this.init(scene));
  }

  private init(scene: THREE.Scene) {
    if (!cachedScene) return;

    const root = cloneForSide(cachedScene, this.side);
    scene.add(root);

    const names = this.side === 'left'
      ? ['LeftArm','LeftForeArm','LeftHand']
      : ['RightArm','RightForeArm','RightHand'];

    const bones = names.map(n => root.getObjectByName(n) as THREE.Bone);
    if (bones.some(b => !b)) {
      console.error('Missing bones', names);
      return;
    }
    [this.bones.shoulder, this.bones.elbow, this.bones.wrist] = bones;

    this.solver.addEventListener('angles', () => this.applyAngles());
  }

  private applyAngles() {
    const a = this.solver.getAngles(this.side);
    if (!a) return;

    const d2r = Math.PI / 180;
    this.bones.shoulder.rotation.set(a.shRoll*d2r, a.shPitch*d2r, a.shYaw*d2r);
    this.bones.elbow.rotation.set(a.elFlex*d2r, 0, 0);
    this.bones.wrist.rotation.set(0, a.wrPitch*d2r, a.wrYaw*d2r);
  }
}
