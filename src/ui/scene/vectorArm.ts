import * as THREE from 'three';
import { vec3, quat } from 'gl-matrix';
import { DeviceStore } from '../../core/DeviceStore';
import { HUM_LEN, RAD_LEN, HAND_LEN } from '../../core/constants';
import { DeviceRole, Device } from '../../types/device';

export class VectorArm {
  private segs: THREE.Line[] = [];
  private upSegs: THREE.Line[] = [];
  private tubeSegs: THREE.Mesh[] = [];
  private upTubeSegs: THREE.Mesh[] = [];
  private arrowTips: THREE.Mesh[] = [];
  private upArrowTips: THREE.Mesh[] = [];
  private group: THREE.Group;
  
  // Geometry and material pools to prevent memory leaks
  private tubeGeometry: THREE.CylinderGeometry;
  private arrowGeometry: THREE.ConeGeometry;
  private materialPool: Map<string, THREE.MeshBasicMaterial> = new Map();
  
  // Timeout threshold for considering data stale (2 seconds)
  private static readonly DATA_TIMEOUT_MS = 2000;

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side: 'left' | 'right'
  ) {
    // Create shared geometries once
    this.tubeGeometry = new THREE.CylinderGeometry(0.005, 0.005, 1, 8);
    this.arrowGeometry = new THREE.ConeGeometry(0.01, 0.04, 8);
    
    // Create initial lines and tubes
    // Forward vectors use pink color
    const forwardColor = '#ff69b4'; // Pink
    for (let i = 0; i < 3; i++) {
      this.segs.push(this.build(forwardColor));
      this.tubeSegs.push(this.buildTube([0,0,0], [0,0.1,0], forwardColor));
      this.arrowTips.push(this.buildArrowTip(forwardColor));
    }
    
    // Up vectors use green color
    const upColor = '#00ff00'; // Green
    for (let i = 0; i < 3; i++) {
      this.upSegs.push(this.build(upColor));
      this.upTubeSegs.push(this.buildTube([0,0,0], [0,0.1,0], upColor));
      this.upArrowTips.push(this.buildArrowTip(upColor));
    }
    
    this.group = new THREE.Group();
    this.tubeSegs.forEach(tube => this.group.add(tube));
    this.upTubeSegs.forEach(tube => this.group.add(tube));
    this.arrowTips.forEach(tip => this.group.add(tip));
    this.upArrowTips.forEach(tip => this.group.add(tip));
    scene.add(this.group);

    store.addEventListener('update', () => this.refresh());
  }

  private getMaterial(color: string): THREE.MeshBasicMaterial {
    if (!this.materialPool.has(color)) {
      this.materialPool.set(color, new THREE.MeshBasicMaterial({ color }));
    }
    return this.materialPool.get(color)!;
  }

  private build(color: string) {
    // Create a simple line geometry - will be replaced with tube in refresh
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0)
    ]);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }

  private buildTube(start: vec3, end: vec3, color: string) {
    const direction = vec3.subtract(vec3.create(), end, start);
    const length = vec3.length(direction);

    if (length < 0.001) {
      // Return tube with empty scale for zero-length vectors
      const material = this.getMaterial(color);
      const tube = new THREE.Mesh(this.tubeGeometry, material);
      tube.scale.set(1, 0, 1); // Scale Y to 0 for zero-length
      tube.visible = false;
      return tube;
    }

    const material = this.getMaterial(color);
    const tube = new THREE.Mesh(this.tubeGeometry, material);

    // Scale the shared geometry to the desired length
    tube.scale.set(1, length, 1);

    // Position the tube at the midpoint
    const midpoint = vec3.lerp(vec3.create(), start, end, 0.5);
    tube.position.set(midpoint[0], midpoint[1], midpoint[2]);

    // Orient the tube to point from start to end
    const normalizedDirection = vec3.normalize(vec3.create(), direction);
    tube.lookAt(
      tube.position.x + normalizedDirection[0],
      tube.position.y + normalizedDirection[1],
      tube.position.z + normalizedDirection[2]
    );
    tube.rotateX(Math.PI / 2); // Cylinders point along Y by default, rotate to Z

    return tube;
  }

  private buildArrowTip(color: string) {
    const material = this.getMaterial(color);
    return new THREE.Mesh(this.arrowGeometry, material);
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
      return timeSinceLastData < VectorArm.DATA_TIMEOUT_MS;
    }

    // For hub devices, just check that data exists (more lenient)
    return true;
  }

  private refresh() {
    /* ---- gather devices by exact position ---- */
    const leftHub = this.store.getByPosition(DeviceRole.ROLE_LEFT_HUB);
    const rightHub = this.store.getByPosition(DeviceRole.ROLE_RIGHT_HUB);
    const leftForearm = this.store.getByPosition(DeviceRole.ROLE_LEFT_FOREARM);
    const rightForearm = this.store.getByPosition(DeviceRole.ROLE_RIGHT_FOREARM);
    const leftHand = this.store.getByPosition(DeviceRole.ROLE_LEFT_HAND);
    const rightHand = this.store.getByPosition(DeviceRole.ROLE_RIGHT_HAND);

    // Map to arm-specific devices based on side
    const hub = this.side === 'left' ? leftHub : rightHub;
    const forearm = this.side === 'left' ? leftForearm : rightForearm;
    const hand = this.side === 'left' ? leftHand : rightHand;

    // For child devices (forearm/hand), only use them if they have active incoming data
    // Hub devices can be used even without recent data (they're directly connected)
    const useForearm = forearm && this.hasActiveData(forearm, true);
    const useHand = hand && this.hasActiveData(hand, true);
    const useHub = hub && this.hasActiveData(hub, false);

    // Use validated devices for rendering
    const validatedHub = useHub ? hub : undefined;
    const validatedForearm = useForearm ? forearm : undefined;
    const validatedHand = useHand ? hand : undefined;

    /* ---- shoulder anchor ---- */
    const shoulder: vec3 = this.side === 'left'
      ? [-0.3, 0,  0]
      : [0.3, 0, 0];

    /* helper functions - no rotation applied (matches legacy RoArmController) */
    const rotFwd = (v: vec3) => v;  // Passthrough - no rotation
    const rotUp = (v: vec3) => v;  // Passthrough - no rotation

    /* ---- compute chain step-by-step ---- */
    const upperEnd = validatedHub
      ? vec3.scaleAndAdd(vec3.create(), shoulder, rotFwd(validatedHub.fwd), HUM_LEN())
      : vec3.clone(shoulder);

    const lowerEnd = validatedForearm
      ? vec3.scaleAndAdd(vec3.create(), upperEnd, rotFwd(validatedForearm.fwd), RAD_LEN())
      : vec3.clone(upperEnd);

    const handEnd  = validatedHand
      ? vec3.scaleAndAdd(vec3.create(), lowerEnd, rotFwd(validatedHand.fwd), HAND_LEN())
      : vec3.clone(lowerEnd);

    /* ---- update three line segments (forward vectors) ---- */
    const pts: [vec3, vec3, vec3, vec3] = [shoulder, upperEnd, lowerEnd, handEnd];

    pts.forEach((p, idx) => {
      if (idx === 3) return;                       // no segment after hand
      
      const dev = idx === 0 ? validatedHub : idx === 1 ? validatedForearm : validatedHand;
      const tube = this.tubeSegs[idx];
      const tip = this.arrowTips[idx];
      
      if (!dev) {
        // Hide tube and arrow tip if no device
        tube.visible = false;
        tip.visible = false;
        return;
      }
      
      // Show and update tube - reuse existing tube object
      tube.visible = true;
      tip.visible = true;
      
      // Forward vector visualization - fixed 0.35 unit length in fwd direction
      const fwdVector = rotFwd(dev.fwd);
      const forwardLength = 0.35; // Fixed 0.35 unit length
      const fwdEnd = vec3.scaleAndAdd(vec3.create(), pts[idx], fwdVector, forwardLength);
      
      const direction = vec3.subtract(vec3.create(), fwdEnd, pts[idx]);
      const length = vec3.length(direction);
      
      if (length > 0.001) {
        tube.scale.set(1, length, 1);
        
        // Position the tube at the midpoint
        const midpoint = vec3.lerp(vec3.create(), pts[idx], fwdEnd, 0.5);
        tube.position.set(midpoint[0], midpoint[1], midpoint[2]);

        // Orient the tube to point from start to end
        const normalizedDirection = vec3.normalize(vec3.create(), direction);
        tube.lookAt(
          tube.position.x + normalizedDirection[0],
          tube.position.y + normalizedDirection[1],
          tube.position.z + normalizedDirection[2]
        );
        tube.rotateX(Math.PI / 2);
      } else {
        tube.scale.set(1, 0, 1); // Zero length
      }

      /* position and orient arrow tip */
      tip.position.set(fwdEnd[0], fwdEnd[1], fwdEnd[2]);
      
      // Calculate direction vector for orientation
      if (vec3.length(fwdVector) > 0) {
        const normalizedFwd = vec3.normalize(vec3.create(), fwdVector);
        tip.lookAt(
          tip.position.x + normalizedFwd[0],
          tip.position.y + normalizedFwd[1], 
          tip.position.z + normalizedFwd[2]
        );
        // Rotate 90 degrees to point the cone tip in the right direction
        tip.rotateX(Math.PI / 2);
      }
      
      // Use fixed pink color for forward vectors
      const forwardColor = '#ff69b4'; // Pink
      const material = this.getMaterial(forwardColor);
      tube.material = material;
      tip.material = material;
    });

    /* ---- update up vector segments ---- */
    const devices = [validatedHub, validatedForearm, validatedHand];
    const startPoints = [shoulder, upperEnd, lowerEnd];
    
    startPoints.forEach((startPt, idx) => {
      const dev = devices[idx];
      const upTube = this.upTubeSegs[idx];
      const upTip = this.upArrowTips[idx];
      
      if (!dev || !dev.up) {
        // Hide tube and arrow tip if no device or no up vector
        upTube.visible = false;
        upTip.visible = false;
        return;
      }
      
      const upVector = rotUp(dev.up);
      // Fixed 0.2 unit length for up vector
      const upVectorLength = 0.2;
      const upEnd = vec3.scaleAndAdd(vec3.create(), startPt, upVector, upVectorLength);
      
      // Show and update up tube - reuse existing tube object
      upTube.visible = true;
      upTip.visible = true;
      
      // Update tube position and scale instead of recreating
      const upDirection = vec3.subtract(vec3.create(), upEnd, startPt);
      const upLength = vec3.length(upDirection);
      
      if (upLength > 0.001) {
        upTube.scale.set(1, upLength, 1);
        
        // Position the tube at the midpoint
        const midpoint = vec3.lerp(vec3.create(), startPt, upEnd, 0.5);
        upTube.position.set(midpoint[0], midpoint[1], midpoint[2]);

        // Orient the tube to point from start to end
        const normalizedUp = vec3.normalize(vec3.create(), upDirection);
        upTube.lookAt(
          upTube.position.x + normalizedUp[0],
          upTube.position.y + normalizedUp[1],
          upTube.position.z + normalizedUp[2]
        );
        upTube.rotateX(Math.PI / 2);
      } else {
        upTube.scale.set(1, 0, 1); // Zero length
      }

      /* position and orient up vector arrow tip */
      upTip.position.set(upEnd[0], upEnd[1], upEnd[2]);
      
      // Calculate direction vector for orientation
      if (vec3.length(upVector) > 0) {
        const normalizedUp = vec3.normalize(vec3.create(), upVector);
        upTip.lookAt(
          upTip.position.x + normalizedUp[0],
          upTip.position.y + normalizedUp[1], 
          upTip.position.z + normalizedUp[2]
        );
        // Rotate 90 degrees to point the cone tip in the right direction
        upTip.rotateX(Math.PI / 2);
      }
      
      // Use fixed green color for up vectors
      const upColor = '#00ff00'; // Green
      const material = this.getMaterial(upColor);
      upTube.material = material;
      upTip.material = material;
    });
  }

  public destroy(): void {
    // Clean up geometries
    this.tubeGeometry.dispose();
    this.arrowGeometry.dispose();
    
    // Clean up materials
    this.materialPool.forEach(material => material.dispose());
    this.materialPool.clear();
    
    // Remove from scene
    this.scene.remove(this.group);
    
    console.log('VectorArm destroyed');
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
