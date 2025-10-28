import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole } from '../../types/device';
import { prefs } from '../../core/preferences';
import { quat } from 'gl-matrix';

const loader = new GLTFLoader();
const d2r = Math.PI / 180;

type Side = 'left' | 'right';
type ArmMap = Record<'shoulder' | 'elbow' | 'wrist', THREE.Bone>;

export class SkeletalRig {
  private armBones:   Record<Side, ArmMap>        = {} as any;
  private handMesh:   Record<Side, THREE.Mesh[]>  = { left: [], right: [] };
  private fingerMap:  Record<Side, THREE.Bone[]>  = { left: [], right: [] };
  private extraMeshes!: { surface: THREE.Mesh; joints: THREE.Mesh };
  private root: THREE.Group | null = null;
  private pendingVisible: boolean = true; // Store visibility state until model loads
  private pendingPosition: { x: number; z: number } = { x: 0, z: 0 };
  private pendingScale: number = 1.0;
  private rigId: string;
  private isDestroyed: boolean = false; // Flag to prevent updates after destruction
  
  // Store event handler references for proper cleanup
  private deviceColorHandler: (e: Event) => void;
  private recolorHandler: () => void;
  private anglesHandler: () => void;

  constructor(
    private scene : THREE.Scene,
    private store : DeviceStore,
    private solver: ArmSolver,
    gltfPath = '/assets/YBot.gltf',
    initialVisible: boolean = true,
    position: { x: number; z: number } = { x: 0, z: 0 },
    scale: number = 1.0
  ) {
    this.rigId = `rig_${Math.random().toString(36).substr(2, 9)}`;
    this.pendingVisible = initialVisible;
    this.pendingPosition = position;
    this.pendingScale = scale;
    
    // Create bound event handlers for proper cleanup
    this.deviceColorHandler = (e: Event) => {
      const { id, hex } = (e as CustomEvent<any>).detail;
      const dev = this.store.getByPosition(DeviceRole.ROLE_RIGHT_HAND);
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
    };
    
    this.recolorHandler = () => {
      if (this.extraMeshes) {
        const surfaceMaterial = this.extraMeshes.surface?.material as THREE.MeshStandardMaterial;
        const jointsMaterial = this.extraMeshes.joints?.material as THREE.MeshStandardMaterial;
        surfaceMaterial?.color?.set?.(prefs.meshSurface);
        jointsMaterial?.color?.set?.(prefs.meshJoints);
      }
    };
    
    this.anglesHandler = () => {
      // Prevent updates after destruction to avoid race conditions during model switching
      if (this.isDestroyed) return;
      
      this.applySide('left');  
      this.applySide('right');
      this.updateChestYaw();
    };
    
    // Add event listeners
    document.addEventListener('deviceColor', this.deviceColorHandler);
    
    loader.load(
      gltfPath,
      (g: GLTF) => {
        this.init(g.scene);
      },
      undefined, // Remove progress logging
      (err) => {
        console.error('SkeletalRig: GLTF load error:', err);
      }
    );
  }

  private mapFinger(side: Side, digit: string, idx: number): THREE.Bone {
    if (!this.root) throw new Error('Root not initialized');
    return this.root.getObjectByName(`${side==='left'?'Left':'Right'}Hand${digit}${idx}`) as THREE.Bone;
  }

  /* ------------ once, both arms in one mesh ------------- */
  private init(root: THREE.Group) {
    root.position.set(this.pendingPosition.x, -1, this.pendingPosition.z);
    root.rotation.set(0, 180 * d2r, 0);
    root.scale.setScalar(this.pendingScale);
    
    // Apply any pending visibility state BEFORE adding to scene
    root.visible = this.pendingVisible;
    
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

    this.solver.addEventListener('angles', this.anglesHandler);

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

    const recolor = this.recolorHandler;
    recolor();
    document.addEventListener('prefsChanged', recolor);
  }

  /* ------------ per-frame mapping ----------------------- */
  private applySide(side: Side) {
    // Prevent updates after destruction
    if (this.isDestroyed) return;
    
    // Always use actuator angles for the physical device
    this.applySideActuatorAngles(side);

    /* ----- Fingers mapping (disabled - finger data removed from Device interface) ----- */
    // const handRole = side === 'left' ? DeviceRole.ROLE_LEFT_HAND : DeviceRole.ROLE_RIGHT_HAND;
    // const glove = this.store.getByPosition(handRole);
    // const src = glove?.fingerSmooth ?? glove?.fingerNorm;

    // if (src) {
    //   const bones = this.fingerMap[side];
    //   const sgnYaw = side === 'left' ? 1 : -1;   // outward fan

    //   src.forEach((v: number, idx: number) => {
    //     const bend = v * 90 * d2r;

    //     switch (idx) {
    //       /* Thumb first joint */
    //       case 0:  
    //         bones[0].rotation.y = -bend;
    //         break;                // flex
    //       case 1:  
    //         bones[1].rotation.z = (v - 45) * 90 * d2r;
    //         break;       // yaw
    //       case 2:  
    //         bones[2].rotation.z = bend;
    //         break;                // Thumb2
    //       case 3:  
    //         bones[3].rotation.z = bend;
    //         break;                // Thumb3
    //       default: {
    //         const f = Math.floor((idx-4) / 3);   // digit 0..3 (Index..Pinky)
    //         const base = 4 + f*3;                // start idx for that digit
    //         const bFlex = bones[4 + f*3];        // MCP flex
    //         const bYaw  = bones[4 + f*3 + 1];    // MCP yaw
    //         const bPIP  = bones[4 + f*3 + 2];    // PIP

    //         if (idx === base)        bFlex.rotation.z = bend - 25*d2r;
    //         else if (idx === base+1) bYaw.rotation.x  =  sgnYaw * -bend;
    //         else if (idx === base+2) {
    //           bPIP.rotation.x = bend;           // PIP
    //           /* estimate DIP (third) as half PIP bend */
    //           const dipBone = this.mapFinger(side,['Index','Middle','Ring','Pinky'][f],3);
    //           dipBone.rotation.x = bend * 0.5;
    //         }
    //       }
    //     }
    //   });
    // }
  }

  /* ------------ Update model yaw based on chest UP vector ----- */
  private updateChestYaw(): void {
    if (!this.root) return;
    
    const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
    if (!chest || !chest.up) return;
    
    // Project chest UP vector onto yaw plane (XZ plane, horizontal plane)
    // chest.up is [x, y, z] in sensor space
    // For yaw calculation, we need the projection onto the horizontal plane
    const upX = chest.up[0];  // Left/Right component
    const upZ = chest.up[2];  // Forward/Back component (Y/Z swap from sensor)
    
    // Calculate yaw angle from UP vector projection onto XZ plane
    // atan2(z, x) gives us the angle in the horizontal plane
    const yawRad = Math.atan2(upZ, upX);
    
    // Convert to degrees
    const yawDeg = yawRad / d2r;
    
    // Apply rotation to model root
    // The model currently has 180° offset at initialization, so we add that
    // to maintain the same orientation as before, but now aligned with chest UP
    this.root.rotation.y = (yawDeg + 180) * d2r;
  }

  /* ------------ Quaternion-based rotation (smooth) ---- */
  private applySideQuaternion(side: Side) {
    const a = this.solver.getAngles(side);
    if (!a) return;

    const arm = this.armBones[side];

    /* Shoulder: Use quaternion directly to avoid angle wrapping */
    const upperRole = side === 'left' ? DeviceRole.ROLE_LEFT_HUB : DeviceRole.ROLE_RIGHT_HUB;
    const upperDevice = this.store.getByPosition(upperRole);
    if (upperDevice) {
      const deviceQuat = upperDevice.quat;
      
      // Convert gl-matrix quat to THREE.js quaternion
      const threeQuat = new THREE.Quaternion(deviceQuat[0], deviceQuat[1], deviceQuat[2], deviceQuat[3]);
      
      // Convert to Euler angles and apply EXACT same corrections as actuator mode
      const euler = new THREE.Euler().setFromQuaternion(threeQuat, 'XYZ');
      
      // Apply same coordinate corrections as actuator mode for shoulder:
      // arm.shoulder.rotation.set(a.shRoll*d2r, -a.shPitch*d2r, -(a.shYaw - 180)*d2r);
      const correctedRoll = -euler.x;   // X = roll
      const correctedPitch = euler.y; // Y = pitch (negated)
      const correctedYaw = -euler.z; // Z = yaw (offset and negated)
      
      // Convert back to quaternion with corrected Euler angles
      const correctedEuler = new THREE.Euler(correctedRoll, correctedPitch, correctedYaw, 'XYZ');
      const correctedQuat = new THREE.Quaternion().setFromEuler(correctedEuler);
      
      // Reset Euler rotation and use quaternion
      arm.shoulder.rotation.set(0, 0, 0);
      arm.shoulder.quaternion.copy(correctedQuat);
    } else {
      // Fallback to Euler if no device quaternion available
      arm.shoulder.quaternion.set(0, 0, 0, 1); // Reset quaternion
      arm.shoulder.rotation.set(a.shRoll*d2r, -a.shPitch*d2r, -(a.shYaw - 180)*d2r);
    }

    /* Elbow: Use quaternion-based calculation when devices available */
    const lowerRole = side === 'left' ? DeviceRole.ROLE_LEFT_FOREARM : DeviceRole.ROLE_RIGHT_FOREARM;
    const lowerDevice = this.store.getByPosition(lowerRole);
    if (upperDevice && lowerDevice) {
      // Calculate relative rotation between upper and lower arm
      const upperQuat = upperDevice.quat;
      const lowerQuat = lowerDevice.quat;
      
      // Calculate relative quaternion: lower relative to upper
      const upperInverse = quat.invert(quat.create(), upperQuat);
      const relativeQuat = quat.multiply(quat.create(), upperInverse, lowerQuat);
      
      // Convert to THREE.js quaternion and then to Euler to extract Z rotation (elbow flex)
      const threeRelQuat = new THREE.Quaternion(relativeQuat[0], relativeQuat[1], relativeQuat[2], relativeQuat[3]);
      const relativeEuler = new THREE.Euler().setFromQuaternion(threeRelQuat, 'XYZ');
      
      // Extract elbow flex (Z rotation) and apply mirroring
      const elbowFlex = -relativeEuler.z;
      
      arm.elbow.quaternion.set(0, 0, 0, 1); // Reset quaternion
      arm.elbow.rotation.set(0, 0, elbowFlex);
    } else {
      // Fallback to actuator angle if devices not available
      arm.elbow.quaternion.set(0, 0, 0, 1); // Reset quaternion
      arm.elbow.rotation.set(0, 0, (side === 'left' ? 1 : -1) * a.elFlex * d2r);
    }

    /* Wrist: Use relative quaternion between hand and forearm if both devices available */
    const handRole = side === 'left' ? DeviceRole.ROLE_LEFT_HAND : DeviceRole.ROLE_RIGHT_HAND;
    const handDevice = this.store.getByPosition(handRole);
    if (handDevice && lowerDevice) {
      // Calculate relative rotation between forearm and hand
      const lowerQuat = lowerDevice.quat;
      const handQuat = handDevice.quat;
      
      // Calculate relative quaternion: hand relative to forearm
      const lowerInverse = quat.invert(quat.create(), lowerQuat);
      const relativeQuat = quat.multiply(quat.create(), lowerInverse, handQuat);
      
      // Convert to THREE.js quaternion and then to Euler
      const threeRelQuat = new THREE.Quaternion(relativeQuat[0], relativeQuat[1], relativeQuat[2], relativeQuat[3]);
      const relativeEuler = new THREE.Euler().setFromQuaternion(threeRelQuat, 'XYZ');
      
      // Apply coordinate corrections for wrist relative motion
      const correctedPitch = -relativeEuler.x; // X = pitch (negated)
      const correctedYaw = -relativeEuler.z;   // Z = yaw (negated) 
      
      // Convert back to quaternion with corrected Euler angles
      const correctedEuler = new THREE.Euler(correctedPitch, 0, correctedYaw, 'XYZ');
      const correctedQuat = new THREE.Quaternion().setFromEuler(correctedEuler);
      
      // Reset Euler rotation and use quaternion
      arm.wrist.rotation.set(0, 0, 0);
      arm.wrist.quaternion.copy(correctedQuat);
    } else if (handDevice) {
      // Fallback to absolute hand orientation if forearm device not available
      const deviceQuat = handDevice.quat;
      
      // Convert gl-matrix quat to THREE.js quaternion
      const threeQuat = new THREE.Quaternion(deviceQuat[0], deviceQuat[1], deviceQuat[2], deviceQuat[3]);
      
      // Convert to Euler angles and apply EXACT same corrections as actuator mode
      const euler = new THREE.Euler().setFromQuaternion(threeQuat, 'XYZ');
      
      // Apply same coordinate corrections as actuator mode for wrist:
      // arm.wrist.rotation.set(-a.wrPitch*d2r, 0, -a.wrYaw*d2r);
      const correctedPitch = -euler.x; // Y = pitch (negated)
      const correctedYaw = -euler.z + 120*d2r;   // Z = yaw (negated)
      
      // Convert back to quaternion with corrected Euler angles
      const correctedEuler = new THREE.Euler(correctedPitch, 0, correctedYaw, 'XYZ');
      const correctedQuat = new THREE.Quaternion().setFromEuler(correctedEuler);
      
      // Reset Euler rotation and use quaternion
      arm.wrist.rotation.set(0, 0, 0);
      arm.wrist.quaternion.copy(correctedQuat);
    } else {
      // Fallback to Euler angles
      arm.wrist.quaternion.set(0, 0, 0, 1); // Reset quaternion
      arm.wrist.rotation.set(
        -a.wrPitch*d2r,
        0,
        -a.wrYaw*d2r
      );
    }
  }

  /* ------------ Actuator angle-based rotation (validation) ---- */
  private applySideActuatorAngles(side: Side) {
    const a = this.solver.getAngles(side);
    if (!a) return;

    const arm = this.armBones[side];
    const sgn = side === 'left' ? 1 : -1;      // mirroring sign

    /* Shoulder: Use calculated actuator angles */
    arm.shoulder.quaternion.set(0, 0, 0, 1); // Reset quaternion
    arm.shoulder.rotation.set(-(a.shRoll - 0)*d2r, (a.shPitch - 0)*d2r, -(a.shYaw - 0)*d2r);

    /* Elbow: Use calculated actuator angle */
    arm.elbow.quaternion.set(0, 0, 0, 1); // Reset quaternion
    
    // Apply both elbow flex (Z rotation) and forearm roll (Y rotation) 
    // The elbow bone is actually the forearm, so it needs both rotations
    const elbowFlex = sgn * a.elFlex * d2r;    // flex around Z (hinge)
    const forearmRoll = (-1) * a.faRoll * d2r;       // roll around Y (length of forearm)
    
    // Create separate rotations and combine them
    const flexQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), elbowFlex);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), forearmRoll);
    
    // Combine: apply roll first, then flex (so flex has priority)
    arm.elbow.quaternion.multiplyQuaternions(flexQuat, rollQuat);

    /* Wrist: Use calculated actuator angles */
    arm.wrist.quaternion.set(0, 0, 0, 1); // Reset quaternion
    arm.wrist.rotation.set(
      -a.wrPitch*d2r,
      0,
      -a.wrYaw*d2r
    );
  }

  public setPosition(x: number, z: number): void {
    this.pendingPosition = { x, z };
    if (this.root) {
      this.root.position.x = x;
      this.root.position.z = z;
    }
  }

  public setScale(scale: number): void {
    this.pendingScale = scale;
    if (this.root) {
      this.root.scale.setScalar(scale);
    }
  }

  public isLoaded(): boolean {
    return this.root !== null;
  }

  public setVisible(visible: boolean): void {
    // Prevent operations after destruction
    if (this.isDestroyed) return;
    
    // Always store the desired visibility state
    this.pendingVisible = visible;
    
    // Apply immediately if the model is loaded
    if (this.root) {
      this.root.visible = visible;
    }
  }

  public updateSurfaceColor(color: string): void {
    // Prevent operations after destruction
    if (this.isDestroyed) return;
    
    if (this.extraMeshes && this.extraMeshes.surface && this.extraMeshes.surface.material) {
      // Update surface material color instantly
      (this.extraMeshes.surface.material as THREE.MeshStandardMaterial).color.set(color);
      
      // Force material to update
      const surfaceMaterial = this.extraMeshes.surface.material as THREE.MeshStandardMaterial;
      surfaceMaterial.needsUpdate = true;
    }
  }

  public destroy(): void {
    // Mark as destroyed first to prevent any further updates during cleanup
    this.isDestroyed = true;
    
    // Clean up event listeners
    document.removeEventListener('deviceColor', this.deviceColorHandler);
    document.removeEventListener('prefsChanged', this.recolorHandler);
    
    // Remove solver event listener
    this.solver.removeEventListener('angles', this.anglesHandler);
    
    // Remove from scene
    if (this.root) {
      this.scene.remove(this.root);
      this.root = null;
    }
  }
}
