import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole, Device } from '../../types/device';
import { prefs } from '../../core/preferences';
import { quat, vec3 } from 'gl-matrix';
import { eulerXYZ } from '../../core/mathUtils';

const loader = new GLTFLoader();
const d2r = Math.PI / 180;

type Side = 'left' | 'right';
type ArmMap = Record<'shoulder' | 'elbow' | 'wrist', THREE.Bone>;

// Timeout threshold for considering data stale (2 seconds)
const DATA_TIMEOUT_MS = 2000;

export class SkeletalRig {
  private armBones:   Record<Side, ArmMap>        = {} as any;
  private handMesh:   Record<Side, THREE.Mesh[]>  = { left: [], right: [] };
  private fingerMap:  Record<Side, THREE.Bone[]>  = { left: [], right: [] };
  private extraMeshes!: { surface: THREE.Mesh; joints: THREE.Mesh };
  private root: THREE.Group | null = null;
  private useActuatorAngles: boolean = false;
  private pendingVisible: boolean = true; // Store visibility state until model loads
  private pendingPosition: { x: number; z: number } = { x: 0, z: 0 };
  private pendingScale: number = 1.0;
  private rigId: string;
  private isDestroyed: boolean = false; // Flag to prevent updates after destruction
  
  // Store event handler references for proper cleanup
  private deviceColorHandler: (e: Event) => void;
  private angleModeHandler: (e: Event) => void;
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
    
    this.angleModeHandler = (e: Event) => {
      const { useActuatorAngles } = (e as CustomEvent<any>).detail;
      this.useActuatorAngles = useActuatorAngles;
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
    document.addEventListener('angleModeChanged', this.angleModeHandler);
    
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
    // Initialize with 0 rotation - yaw will be set by updateChestYaw() based on chest orientation
    root.rotation.set(0, 0, 0);
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
    
    if (this.useActuatorAngles) {
      this.applySideActuatorAngles(side);
    } else {
      this.applySideQuaternion(side);
    }

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

  /* ------------ Update model yaw based on chest UP vector (negated) ----- */
  /* NOTE: This function is not currently used, but can be tested as an alternative approach */
  private updateChestYawFromChestUp(): void {
    if (!this.root) return;
    
    const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
    if (!chest || !chest.up) return;
    
    // Chest device is worn vertically, with UP vector pointing forward
    // We negate the UP direction to align model orientation correctly
    // Project negated chest UP vector onto yaw plane (XZ plane, horizontal plane)
    // chest.up from quaternionToVectors() is [x, z, y] in scene space:
    // - chest.up[0] = X component (left/right)
    // - chest.up[1] = Z component (forward/back)
    // - chest.up[2] = Y component (up/down, vertical - not used for yaw)
    
    // Negate the UP vector components for yaw calculation
    const upX = -chest.up[0];  // Negated X component (left/right)
    const upZ = -chest.up[1];  // Negated Z component (forward/back)
    
    // Calculate yaw angle from negated UP vector projection onto XZ plane
    // atan2(x, z) gives us the angle in the horizontal plane:
    // - atan2(0, 1) = 0° = +Z (forward) 
    // - atan2(1, 0) = 90° = +X (right)
    // - atan2(0, -1) = 180° = -Z (backward)
    const yawRad = Math.atan2(upX, upZ);
    
    // Apply rotation to model root
    // Model should face in the negated direction of chest UP vector
    this.root.rotation.y = yawRad;
  }

  /**
   * Check if a device has active incoming data
   * For child devices (forearm/hand), we require recent data (within DATA_TIMEOUT_MS)
   * For hub devices, we're more lenient (they might be connected but children not yet)
   */
  private hasActiveData(device: Device | undefined, isChildDevice: boolean): boolean {
    if (!device) {
      return false;
    }

    // Check if device has valid vectors (not zero/default)
    const hasValidVectors = vec3.length(device.fwd) > 0.001 && vec3.length(device.up) > 0.001;
    
    if (!hasValidVectors) {
      return false;
    }

    // Check if quaternion is not identity (identity = [0, 0, 0, 1])
    const isIdentity = Math.abs(device.quat[0]) < 0.001 && 
                       Math.abs(device.quat[1]) < 0.001 && 
                       Math.abs(device.quat[2]) < 0.001 && 
                       Math.abs(device.quat[3] - 1.0) < 0.001;
    
    if (isIdentity) {
      return false;
    }

    // For child devices, require recent data (within timeout window)
    if (isChildDevice) {
      const now = performance.now();
      const timeSinceLastData = now - device.lastSeen;
      return timeSinceLastData < DATA_TIMEOUT_MS;
    }

    // For hub devices, just check that data exists (more lenient)
    return true;
  }

  /* ------------ Update model yaw based on average hub forward vectors ----- */
  private updateChestYaw(): void {
    if (!this.root) return;
    
    // Get left and right hub (shoulder) devices
    const leftHub = this.store.getByPosition(DeviceRole.ROLE_LEFT_HUB);
    const rightHub = this.store.getByPosition(DeviceRole.ROLE_RIGHT_HUB);
    
    // Project forward vectors onto yaw plane (XZ plane, horizontal plane)
    // fwd from quaternionToVectors() is [x, z, -y] in scene space:
    // - fwd[0] = X component (left/right)
    // - fwd[1] = Z component (forward/back)
    // - fwd[2] = -Y component (vertical, not used for yaw)
    
    let avgFwdX = 0;
    let avgFwdZ = 0;
    let count = 0;
    
    if (leftHub && leftHub.fwd && this.hasActiveData(leftHub, false)) {
      // Project onto yaw plane: use X and Z components only
      avgFwdX += leftHub.fwd[0];  // X component
      avgFwdZ += leftHub.fwd[1];  // Z component
      count++;
    }
    
    if (rightHub && rightHub.fwd && this.hasActiveData(rightHub, false)) {
      // Project onto yaw plane: use X and Z components only
      avgFwdX += rightHub.fwd[0];  // X component
      avgFwdZ += rightHub.fwd[1];  // Z component
      count++;
    }
    
    // If no hubs available, don't update rotation
    if (count === 0) return;
    
    // Average the yaw plane projections
    avgFwdX /= count;
    avgFwdZ /= count;
    
    // Calculate yaw angle from averaged forward vector projection
    // The model is consistently 90° off, so we swap atan2 arguments
    // atan2(x, z) instead of atan2(z, x) to compensate:
    // - atan2(0, 1) = 0° = +Z (forward) 
    // - atan2(1, 0) = 90° = +X (right)
    // - atan2(0, -1) = 180° = -Z (backward)
    // This accounts for Three.js rotation convention vs vector direction
    const yawRad = Math.atan2(avgFwdX, avgFwdZ);
    
    // Apply rotation to model root
    // Model should face in the average forward direction of the two hub devices
    this.root.rotation.y = yawRad;
  }

  /* ------------ Quaternion-based rotation (smooth) ---- */
  private applySideQuaternion(side: Side) {
    const a = this.solver.getAngles(side);
    if (!a) return;

    const arm = this.armBones[side];

    /* Shoulder: Use quaternion directly to avoid angle wrapping */
    const upperRole = side === 'left' ? DeviceRole.ROLE_LEFT_HUB : DeviceRole.ROLE_RIGHT_HUB;
    const upperDevice = this.store.getByPosition(upperRole);
    if (upperDevice && this.hasActiveData(upperDevice, false)) {
      const deviceQuat = upperDevice.quat;
      
      // Use eulerXYZ() which matches legacy firmware implementation
      // Returns [yaw, roll, pitch] in radians (note: pitch and roll are swapped in return)
      const [yawRad, rollRad, pitchRad] = eulerXYZ(deviceQuat);
      
      // Apply same coordinate corrections as actuator mode for shoulder:
      // arm.shoulder.rotation.set(-a.shRoll*d2r, a.shPitch*d2r, -a.shYaw*d2r);
      // Map eulerXYZ output [yaw, roll, pitch] to bone rotations
      const correctedRoll = -rollRad;   // roll (negated)
      const correctedPitch = pitchRad;  // pitch (no negation)
      const correctedYaw = -yawRad;     // yaw (negated)
      
      // Convert to THREE.js Euler angles (XYZ order)
      const correctedEuler = new THREE.Euler(correctedRoll, correctedPitch, correctedYaw, 'XYZ');
      const correctedQuat = new THREE.Quaternion().setFromEuler(correctedEuler);
      
      // Reset Euler rotation and use quaternion
      arm.shoulder.rotation.set(0, 0, 0);
      arm.shoulder.quaternion.copy(correctedQuat);
    } else {
      // Fallback to Euler if no device quaternion available
      // Match actuator mode formula: negate roll, no pitch negation, negate yaw, no offset
      arm.shoulder.quaternion.set(0, 0, 0, 1); // Reset quaternion
      arm.shoulder.rotation.set(-(a.shRoll - 0)*d2r, (a.shPitch - 0)*d2r, -(a.shYaw - 0)*d2r);
    }

    /* Elbow: Use quaternion-based calculation when devices available */
    const lowerRole = side === 'left' ? DeviceRole.ROLE_LEFT_FOREARM : DeviceRole.ROLE_RIGHT_FOREARM;
    const lowerDeviceRaw = this.store.getByPosition(lowerRole);
    const lowerDevice = lowerDeviceRaw && this.hasActiveData(lowerDeviceRaw, true) ? lowerDeviceRaw : undefined;
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
    const handDeviceRaw = this.store.getByPosition(handRole);
    const handDevice = handDeviceRaw && this.hasActiveData(handDeviceRaw, true) ? handDeviceRaw : undefined;
    if (handDevice && lowerDevice) {
      // Calculate relative rotation between forearm and hand
      const lowerQuat = lowerDevice.quat;
      const handQuat = handDevice.quat;
      
      // Calculate relative quaternion: hand relative to forearm
      const lowerInverse = quat.invert(quat.create(), lowerQuat);
      const relativeQuat = quat.multiply(quat.create(), lowerInverse, handQuat);
      
      // Use eulerXYZ() for consistency - returns [yaw, roll, pitch] in radians
      const [relYawRad, relRollRad, relPitchRad] = eulerXYZ(relativeQuat);
      
      // Apply coordinate corrections for wrist relative motion
      // Map eulerXYZ output [yaw, roll, pitch] to wrist rotations
      const correctedPitch = -relPitchRad; // pitch (negated)
      const correctedYaw = -relYawRad;     // yaw (negated)
      
      // Convert to THREE.js Euler angles (XYZ order)
      const correctedEuler = new THREE.Euler(correctedPitch, 0, correctedYaw, 'XYZ');
      const correctedQuat = new THREE.Quaternion().setFromEuler(correctedEuler);
      
      // Reset Euler rotation and use quaternion
      arm.wrist.rotation.set(0, 0, 0);
      arm.wrist.quaternion.copy(correctedQuat);
    } else if (handDevice) {
      // Fallback to absolute hand orientation if forearm device not available
      const deviceQuat = handDevice.quat;
      
      // Use eulerXYZ() for consistency - returns [yaw, roll, pitch] in radians
      const [yawRad, rollRad, pitchRad] = eulerXYZ(deviceQuat);
      
      // Apply same coordinate corrections as actuator mode for wrist:
      // arm.wrist.rotation.set(-a.wrPitch*d2r, 0, -a.wrYaw*d2r);
      const correctedPitch = -pitchRad;      // pitch (negated)
      const correctedYaw = -yawRad + 120*d2r; // yaw (negated + 120° offset)
      
      // Convert to THREE.js Euler angles (XYZ order)
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

  public resetToNormalPosition(): void {
    // Prevent operations after destruction
    if (this.isDestroyed || !this.root) return;
    
    // Reset root rotation to default (no yaw)
    this.root.rotation.y = 0;
    
    // Reset all arm bones to default rotation
    ['left', 'right'].forEach(side => {
      const arm = this.armBones[side as Side];
      if (arm) {
        // Reset quaternion to identity
        arm.shoulder.quaternion.set(0, 0, 0, 1);
        arm.shoulder.rotation.set(0, 0, 0);
        
        arm.elbow.quaternion.set(0, 0, 0, 1);
        arm.elbow.rotation.set(0, 0, 0);
        
        arm.wrist.quaternion.set(0, 0, 0, 1);
        arm.wrist.rotation.set(0, 0, 0);
      }
    });
    
    // Reset finger bones if they exist
    ['left', 'right'].forEach(side => {
      const fingers = this.fingerMap[side as Side];
      if (fingers) {
        fingers.forEach(bone => {
          if (bone) {
            bone.quaternion.set(0, 0, 0, 1);
            bone.rotation.set(0, 0, 0);
          }
        });
      }
    });
  }

  public destroy(): void {
    // Mark as destroyed first to prevent any further updates during cleanup
    this.isDestroyed = true;
    
    // Clean up event listeners
    document.removeEventListener('deviceColor', this.deviceColorHandler);
    document.removeEventListener('angleModeChanged', this.angleModeHandler);
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
