import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole, Device } from '../../types/device';
import { CHEST_YAW_METHOD } from '../../core/chestUtils';
import { eulerXYZ } from '../../core/mathUtils';

export class ChestVector {
  private tubeSeg: THREE.Mesh;
  private arrowTip: THREE.Mesh;
  private group: THREE.Group;
  
  // Geometry and material pools to prevent memory leaks
  private tubeGeometry: THREE.CylinderGeometry;
  private arrowGeometry: THREE.ConeGeometry;
  private materialPool: Map<string, THREE.MeshBasicMaterial> = new Map();

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore
  ) {
    // Create shared geometries once
    this.tubeGeometry = new THREE.CylinderGeometry(0.005, 0.005, 1, 8); // Same as VectorArm
    this.arrowGeometry = new THREE.ConeGeometry(0.01, 0.04, 8); // Same as VectorArm
    
    // Create chest vector elements - yellow for UP vector projection on XZ plane
    const projectionColor = '#ffff00'; // Yellow
    this.tubeSeg = this.buildTube([0,0,0], [0,0.1,0], projectionColor);
    this.arrowTip = this.buildArrowTip(projectionColor);
    
    this.group = new THREE.Group();
    this.group.add(this.tubeSeg);
    this.group.add(this.arrowTip);
    scene.add(this.group);

    store.addEventListener('update', () => this.refresh());
  }

  private getMaterial(color: string): THREE.MeshBasicMaterial {
    if (!this.materialPool.has(color)) {
      this.materialPool.set(color, new THREE.MeshBasicMaterial({ color }));
    }
    return this.materialPool.get(color)!;
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
   * For hub devices, we're more lenient (they might be connected but children not yet)
   * During playback mode, only accepts devices with playback data (userId === 'playback')
   */
  private hasActiveData(device: Device | undefined): boolean {
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

    // For hub devices, just check that data exists (more lenient)
    return true;
  }

  private refresh() {
    // Chest anchor point (positioned above the model)
    const chestAnchor: vec3 = [0, 1.0, -0.2]; // Moved up above the model
    const fixedLength = 0.35; // Fixed 0.35 unit length
    
    let directionVector: vec3 | null = null;
    
    if (CHEST_YAW_METHOD === 1) {
      // Method 1: Show average forward direction of hubs
      const leftHub = this.store.getByPosition(DeviceRole.ROLE_LEFT_HUB);
      const rightHub = this.store.getByPosition(DeviceRole.ROLE_RIGHT_HUB);
      
      const leftHubValid = leftHub && this.hasActiveData(leftHub);
      const rightHubValid = rightHub && this.hasActiveData(rightHub);
      
      if (!leftHubValid && !rightHubValid) {
        // Hide if no valid hubs
        this.tubeSeg.visible = false;
        this.arrowTip.visible = false;
        return;
      }
      
      // Average the forward vectors from available hubs
      // fwd from quaternionToVectors() is [x, z, y] in scene space:
      let avgFwdX = 0;
      let avgFwdZ = 0;
      let count = 0;
      
      if (leftHubValid && leftHub.fwd) {
        avgFwdX += leftHub.fwd[0];
        avgFwdZ += leftHub.fwd[1];
        count++;
      }
      
      if (rightHubValid && rightHub.fwd) {
        avgFwdX += rightHub.fwd[0];
        avgFwdZ += rightHub.fwd[1];
        count++;
      }
      
      if (count > 0) {
        avgFwdX /= count;
        avgFwdZ /= count;
        
        // Create direction vector on XZ plane [x, y, z]
        directionVector = [avgFwdX, 0, avgFwdZ];
      }
      
    } else if (CHEST_YAW_METHOD === 2) {
      // Method 2: Show chest UP vector projection on XZ plane
      const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
      
      if (!chest || !chest.up || !this.hasActiveData(chest)) {
        // Hide if no chest device
        this.tubeSeg.visible = false;
        this.arrowTip.visible = false;
        return;
      }
      
      // Project chest UP vector onto XZ plane
      // chest.up from quaternionToVectors() is [x, z, y] in scene space:
      const projectionX = chest.up[0];  // X component
      const projectionZ = chest.up[1];  // Z component
      
      // Create projection vector on XZ plane in vec3 format [x, y, z]
      directionVector = [projectionX, 0, projectionZ];
      
    } else if (CHEST_YAW_METHOD === 3) {
      // Method 3: Show yaw direction from chest quaternion
      const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
      
      if (!chest || !chest.quat || !this.hasActiveData(chest)) {
        // Hide if no chest device
        this.tubeSeg.visible = false;
        this.arrowTip.visible = false;
        return;
      }
      
      // Extract yaw directly from quaternion
      const [yawRad] = eulerXYZ(chest.quat);
      
      // Convert yaw angle to direction vector on XZ plane
      // yawRad is rotation around Y axis:
      // - 0° = +Z (forward)
      // - 90° = +X (right)
      // - 180° = -Z (backward)
      const dirX = Math.sin(yawRad);  // X component
      const dirZ = Math.cos(yawRad);  // Z component
      
      // Create direction vector on XZ plane [x, y, z]
      directionVector = [dirX, 0, dirZ];
      
    } else {
      // Invalid method - hide
      this.tubeSeg.visible = false;
      this.arrowTip.visible = false;
      return;
    }
    
    // Check if we have a valid direction vector
    if (!directionVector || vec3.length(directionVector) < 0.001) {
      // Hide if vector is too small
      this.tubeSeg.visible = false;
      this.arrowTip.visible = false;
      return;
    }
    
    // Normalize the direction and scale to fixed length for visualization
    const normalizedDirection = vec3.normalize(vec3.create(), directionVector);
    const scaledDirection = vec3.scale(vec3.create(), normalizedDirection, fixedLength);
    
    // Calculate end point on XZ plane (Y stays at anchor Y)
    const vectorEnd: vec3 = [
      chestAnchor[0] + scaledDirection[0],
      chestAnchor[1], // Keep Y at anchor height (horizontal)
      chestAnchor[2] + scaledDirection[2]
    ];
    
    // Update tube visualization
    this.tubeSeg.visible = true;
    const direction = vec3.subtract(vec3.create(), vectorEnd, chestAnchor);
    const length = vec3.length(direction);
    
    if (length > 0.001) {
      this.tubeSeg.scale.set(1, length, 1);
      
      // Position the tube at the midpoint
      const midpoint = vec3.lerp(vec3.create(), chestAnchor, vectorEnd, 0.5);
      this.tubeSeg.position.set(midpoint[0], midpoint[1], midpoint[2]);

      // Orient the tube to point from start to end (horizontal direction)
      const normalizedDirection = vec3.normalize(vec3.create(), direction);
      this.tubeSeg.lookAt(
        this.tubeSeg.position.x + normalizedDirection[0],
        this.tubeSeg.position.y + normalizedDirection[1],
        this.tubeSeg.position.z + normalizedDirection[2]
      );
      this.tubeSeg.rotateX(Math.PI / 2);
    } else {
      this.tubeSeg.scale.set(1, 0, 1); // Zero length
    }

    // Position and orient arrow tip
    this.arrowTip.visible = true;
    this.arrowTip.position.set(vectorEnd[0], vectorEnd[1], vectorEnd[2]);
    
    // Calculate direction vector for orientation
    const normalizedDir = vec3.normalize(vec3.create(), directionVector);
    this.arrowTip.lookAt(
      this.arrowTip.position.x + normalizedDir[0],
      this.arrowTip.position.y + normalizedDir[1], 
      this.arrowTip.position.z + normalizedDir[2]
    );
    // Rotate 90 degrees to point the cone tip in the right direction
    this.arrowTip.rotateX(Math.PI / 2);
    
    // Use fixed yellow color for visualization
    const projectionColor = '#ffff00'; // Yellow
    const material = this.getMaterial(projectionColor);
    this.tubeSeg.material = material;
    this.arrowTip.material = material;
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
    
    console.log('ChestVector destroyed');
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
