import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmSolver } from '../../core/ArmSolver';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole, Device } from '../../types/device';
import { prefs } from '../../core/preferences';
import { quat, vec3 } from 'gl-matrix';
import { eulerXYZ } from '../../core/mathUtils';
import { calculateYawFromChestUp, calculateYawFromHubs, calculateYawFromChestYaw, CHEST_YAW_METHOD } from '../../core/chestUtils';

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
  
  // Store initial pose quaternions for left and right shoulders
  private initialPoseQuat: Record<Side, THREE.Quaternion> = {
    left: new THREE.Quaternion(),
    right: new THREE.Quaternion()
  };
  
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
    // Initialize with 0 rotation - yaw will be set by updateChestYaw() based on CHEST_YAW_METHOD
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

    // Set default pose to arms extended forward with palms facing down
    // Rotation order: XYZ (roll, pitch, yaw)
    // - X rotation (roll): 90 degrees to rotate palms down (negated for left arm for mirroring)
    // - Y rotation (pitch): -90 degrees - shoulder flexion forward
    // - Z rotation (yaw): 0 (no yaw rotation)
    const forwardPitch = -Math.PI;   // -90 degrees - shoulder flexion forward
    
    // Left arm: forward extension with palms down (negated roll for mirroring)
    if (this.armBones.left.shoulder) {
      this.armBones.left.shoulder.rotation.set(-Math.PI, forwardPitch, -Math.PI / 2);
      // Store initial pose quaternion for left shoulder
      this.initialPoseQuat.left.copy(this.armBones.left.shoulder.quaternion);
    }
    
    // Right arm: forward extension with palms down
    if (this.armBones.right.shoulder) {
      this.armBones.right.shoulder.rotation.set(Math.PI, forwardPitch, Math.PI / 2);
      // Store initial pose quaternion for right shoulder
      this.initialPoseQuat.right.copy(this.armBones.right.shoulder.quaternion);
    }

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
   * During playback mode, only accepts devices with playback data (userId === 'playback')
   */
  private hasActiveData(device: Device | undefined, isChildDevice: boolean): boolean {
    if (!device) {
      return false;
    }

    // During playback mode, only use devices that have playback data
    // Playback devices are identified by userId === 'playback'
    if (this.store.isPlaybackMode()) {
      if (device.userId !== 'playback') {
        return false; // Reject live devices during playback
      }
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
    // During playback, we don't need to check timeout since playback updates are continuous
    if (isChildDevice && !this.store.isPlaybackMode()) {
      const now = performance.now();
      const timeSinceLastData = now - device.lastSeen;
      return timeSinceLastData < DATA_TIMEOUT_MS;
    }

    // For hub devices, just check that data exists (more lenient)
    return true;
  }

  /* ------------ Update model yaw based on CHEST_YAW_METHOD selection ----- */
  private updateChestYaw(): void {
    if (!this.root) return;
    
    let yawRad: number | null = null;
    
    if (CHEST_YAW_METHOD === 1) {
      // Method 1: Calculate yaw from average forward direction of hubs
      const leftHub = this.store.getByPosition(DeviceRole.ROLE_LEFT_SHOULDER);
      const rightHub = this.store.getByPosition(DeviceRole.ROLE_RIGHT_SHOULDER);
      yawRad = calculateYawFromHubs(leftHub, rightHub, this.hasActiveData.bind(this));
    } else if (CHEST_YAW_METHOD === 2) {
      // Method 2: Calculate yaw from chest UP vector projection
      const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
      if (chest && this.hasActiveData(chest, false)) {
        yawRad = calculateYawFromChestUp(chest);
      }
    } else if (CHEST_YAW_METHOD === 3) {
      // Method 3: Calculate yaw directly from chest device quaternion
      const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
      if (chest && this.hasActiveData(chest, false)) {
        yawRad = calculateYawFromChestYaw(chest);
      }
    }
    
    // Apply rotation to model root if we have a valid yaw
    if (yawRad !== null) {
      this.root.rotation.y = yawRad;
    }
  }

  /* ------------ Quaternion-based rotation (smooth) ---- */
  private applySideQuaternion(side: Side) {
    const a = this.solver.getAngles(side);
    if (!a) return;

    const arm = this.armBones[side];

    /* Shoulder: Use quaternion directly to avoid angle wrapping */
    const upperRole = side === 'left' ? DeviceRole.ROLE_LEFT_SHOULDER : DeviceRole.ROLE_RIGHT_SHOULDER;
    const upperDevice = this.store.getByPosition(upperRole);
    if (upperDevice && this.hasActiveData(upperDevice, false)) {
      const deviceQuat = upperDevice.quat;
      
      // Use eulerXYZ() which matches legacy firmware implementation
      // Returns [yaw, roll, pitch] in radians (note: pitch and roll are swapped in return)
      const [yawRad, rollRad, pitchRad] = eulerXYZ(deviceQuat);
      
      // Apply coordinate corrections for shoulder:
      // Map eulerXYZ output [yaw, roll, pitch] to bone rotations
      const correctedRoll = -rollRad;   // roll (negated)
      const correctedPitch = pitchRad;  // pitch (no negation)
      const correctedYaw = yawRad;      // yaw (no negation)
      
      // Convert to THREE.js Euler angles (XYZ order) and apply directly
      const correctedEuler = new THREE.Euler(correctedRoll, correctedPitch, correctedYaw, 'XYZ');
      const correctedQuat = new THREE.Quaternion().setFromEuler(correctedEuler);
      
      // Apply quaternion directly (no relative rotation math)
      arm.shoulder.rotation.set(0, 0, 0);
      arm.shoulder.quaternion.copy(correctedQuat);
    } else {
      // Fallback: when no device, use initial pose
      arm.shoulder.quaternion.copy(this.initialPoseQuat[side]);
      arm.shoulder.rotation.set(0, 0, 0);
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
    const gloveRole = side === 'left' ? DeviceRole.ROLE_LEFT_GLOVE : DeviceRole.ROLE_RIGHT_GLOVE;
    // Try hand first, fall back to glove (both represent hand position)
    const handDeviceRaw = this.store.getByPosition(handRole) || this.store.getByPosition(gloveRole);
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

    /* Shoulder: Apply actuator angles with offset to forward pose */
    // Define forward pose offsets (in degrees) - these represent the forward pose when actuator angles are 0
    // Forward pose rotations: Left (-180°, 0°, -90°), Right (180°, 0°, 90°)
    // Pitch offset changed from -180° to 0° to match corrected forward vector direction
    const forwardPoseOffsets = {
      left: { roll: -180, pitch: 0, yaw: -90 },
      right: { roll: 180, pitch: 0, yaw: 90 }
    };
    const offsets = forwardPoseOffsets[side];
    
    // Since we flipped X in the vector math, positive Yaw input now creates 
    // negative rotation in the scene. We must subtract the yaw angle.
    arm.shoulder.rotation.set(
      -(offsets.roll + a.shRoll) * d2r,
      (offsets.pitch + a.shPitch) * d2r,
      -(offsets.yaw - a.shYaw) * d2r
    );

    /* Elbow: Use calculated actuator angle */
    arm.elbow.quaternion.set(0, 0, 0, 1); // Reset quaternion
    
    // FIX: Negate the flexion due to Handedness flip (Right-Hand Rule vs Left-Hand Rule)
    // Was: const elbowFlex = sgn * a.elFlex * d2r;
    const elbowFlex = -sgn * a.elFlex * d2r;    
    
    // Invert forearm roll by π radians to flip default from hand up to hand down
    const forearmRoll = (-1) * a.faRoll * d2r + Math.PI;       
    
    const flexQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), elbowFlex);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), forearmRoll);
    
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
    
    // Reset all arm bones to default rotation (arms extended forward with palms down)
    // Match the initial pose values exactly
    const forwardPitch = -Math.PI;
    
    ['left', 'right'].forEach(side => {
      const arm = this.armBones[side as Side];
      if (arm) {
        // Reset quaternion to identity
        arm.shoulder.quaternion.set(0, 0, 0, 1);
        // Match initial pose: left arm has negated roll and yaw, right arm has positive
        if (side === 'left') {
          arm.shoulder.rotation.set(-Math.PI, forwardPitch, -Math.PI / 2);
        } else {
          arm.shoulder.rotation.set(Math.PI, forwardPitch, Math.PI / 2);
        }
        
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
