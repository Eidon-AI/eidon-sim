import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';
import { DeviceStore } from '../../core/DeviceStore';
import { prefs } from '../../core/preferences';

const loader = new GLTFLoader();

type Side = 'left' | 'right';
type ArmMap = Record<'shoulder' | 'elbow' | 'wrist', THREE.Bone>;

export class SkeletalRig {
  private armBones:   Record<Side, ArmMap>        = {} as any;
  private handMesh:   Record<Side, THREE.Mesh[]>  = { left: [], right: [] };
  private fingerMap:  Record<Side, THREE.Bone[]>  = { left: [], right: [] };
  private extraMeshes!: { surface: THREE.Mesh; joints: THREE.Mesh };
  private root: THREE.Group | null = null;

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

    document.addEventListener('deviceColor', e=>{
      const { id, hex } = (e as CustomEvent<any>).detail;
      const dev = this.store.getBy('right','hand');
      if (dev && dev.id===id) {
        this.handMesh.left.forEach(mesh => {
          if (mesh.material) (mesh.material as THREE.MeshStandardMaterial).color.set(hex);
        });
      }
      if (dev && dev.id===id) {
        this.handMesh.right.forEach(mesh => {
          if (mesh.material) (mesh.material as THREE.MeshStandardMaterial).color.set(hex);
        });
      }
    });
  }

  private mapFinger(side: Side, digit: string, idx: number): THREE.Bone {
    if (!this.root) throw new Error('Root not initialized');
    return this.root.getObjectByName(`${side==='left'?'Left':'Right'}Hand${digit}${idx}`) as THREE.Bone;
  }

  /* ------------ once, both arms in one mesh ------------- */
  private init(root: THREE.Group) {
    root.position.set(0, 0, 0);
    this.scene.add(root);
    this.root = root;

    this.extraMeshes = {
      surface: root.getObjectByName('Alpha_Surface') as THREE.Mesh,
      joints : root.getObjectByName('Alpha_Joints')  as THREE.Mesh
    };

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

    // Find all mesh objects that are children of the hand bones
    const leftHand = root.getObjectByName('LeftHand') as THREE.Object3D;
    const rightHand = root.getObjectByName('RightHand') as THREE.Object3D;
    
    if (leftHand) {
      leftHand.traverse(child => {
        if (child instanceof THREE.Mesh) {
          this.handMesh.left.push(child);
        }
      });
    }
    
    if (rightHand) {
      rightHand.traverse(child => {
        if (child instanceof THREE.Mesh) {
          this.handMesh.right.push(child);
        }
      });
    }

    this.solver.addEventListener('angles', () => {
      this.applySide('left');  this.applySide('right');
    });

    ['left','right'].forEach(s=>{
      const side = s as Side;
    
      this.fingerMap[side] = [
        this.mapFinger(side,'Thumb',1),
        this.mapFinger(side,'Thumb',1), // Z axis same bone
        this.mapFinger(side,'Thumb',2),
        this.mapFinger(side,'Thumb',3),
    
        ...(['Index','Middle','Ring','Pinky'] as const).flatMap(digit=>[
          this.mapFinger(side,digit,1),           // flex
          this.mapFinger(side,digit,1),           // yaw
          this.mapFinger(side,digit,2)            // PIP
        ])
      ];
    });

    const recolor = ()=>{
      this.extraMeshes.surface.material.color.set(prefs.meshSurface);
      this.extraMeshes.joints .material.color.set(prefs.meshJoints );
    };
    recolor();
    document.addEventListener('prefsChanged', recolor);
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
      -a.wrYaw*d2r// -sgn * (a.wrYaw + a.faRoll) * d2r
    );

    /* ----- Fingers mapping ----- */
    const glove = this.store.getBy(side, 'hand');
    const src = glove?.fingerSmooth ?? glove?.fingerNorm;

    if (src) {
      const bones = this.fingerMap[side];
      const sgnYaw = side === 'left' ? 1 : -1;   // outward fan

      src.forEach((v, idx) => {
        const bend = v * 90 * d2r;

        switch (idx) {
          /* Thumb first joint */
          case 0:  
            bones[0].rotation.y = -bend;
            break;                // flex
          case 1:  
            bones[1].rotation.z = (v - 45) * 90 * d2r;
            break;       // yaw
          case 2:  
            bones[2].rotation.z = bend;
            break;                // Thumb2
          case 3:  
            bones[3].rotation.z = bend;
            break;                // Thumb3
          default: {
            const f = Math.floor((idx-4) / 3);   // digit 0..3 (Index..Pinky)
            const base = 4 + f*3;                // start idx for that digit
            const bFlex = bones[4 + f*3];        // MCP flex
            const bYaw  = bones[4 + f*3 + 1];    // MCP yaw
            const bPIP  = bones[4 + f*3 + 2];    // PIP

            if (idx === base)        bFlex.rotation.z = bend;
            else if (idx === base+1) bYaw.rotation.x  =  sgnYaw * -bend;
            else if (idx === base+2) {
              bPIP.rotation.x = bend;           // PIP
              /* estimate DIP (third) as half PIP bend */
              const dipBone = this.mapFinger(side,['Index','Middle','Ring','Pinky'][f],3);
              dipBone.rotation.x = bend * 0.5;
            }
          }
        }
      });
    }
  }
}
