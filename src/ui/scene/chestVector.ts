import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole } from '../../types/device';

export class ChestVector {
  private tubeSeg: THREE.Mesh;
  private upTubeSeg: THREE.Mesh;
  private arrowTip: THREE.Mesh;
  private upArrowTip: THREE.Mesh;
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
    
    // Create chest vector elements
    this.tubeSeg = this.buildTube([0,0,0], [0,0.1,0], '#ff6');
    this.upTubeSeg = this.buildTube([0,0,0], [0,0.1,0], '#ff9');
    this.arrowTip = this.buildArrowTip('#ff6');
    this.upArrowTip = this.buildArrowTip('#ff9');
    
    this.group = new THREE.Group();
    this.group.add(this.tubeSeg);
    this.group.add(this.upTubeSeg);
    this.group.add(this.arrowTip);
    this.group.add(this.upArrowTip);
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

  private refresh() {
    // Get chest device
    const chest = this.store.getByPosition(DeviceRole.ROLE_CHEST);
    
    if (!chest) {
      // Hide all elements if no chest device
      this.tubeSeg.visible = false;
      this.upTubeSeg.visible = false;
      this.arrowTip.visible = false;
      this.upArrowTip.visible = false;
      return;
    }

    // Chest anchor point (moved forward to avoid model overlap)
    const chestAnchor: vec3 = [0, 0.4, -0.2]; // Moved 30cm forward
    
    // Chest forward vector length (representing torso orientation)
    const chestLength = 0.15; // 15cm forward vector
    const chestEnd = vec3.scaleAndAdd(vec3.create(), chestAnchor, chest.fwd, chestLength);
    
    // Chest up vector length (representing torso tilt)
    const upLength = 0.2; // 20cm up vector (longer)
    const upEnd = vec3.scaleAndAdd(vec3.create(), chestAnchor, chest.up, upLength);
    
    // Update forward vector tube
    this.tubeSeg.visible = true;
    const direction = vec3.subtract(vec3.create(), chestEnd, chestAnchor);
    const length = vec3.length(direction);
    
    if (length > 0.001) {
      this.tubeSeg.scale.set(1, length, 1);
      
      // Position the tube at the midpoint
      const midpoint = vec3.lerp(vec3.create(), chestAnchor, chestEnd, 0.5);
      this.tubeSeg.position.set(midpoint[0], midpoint[1], midpoint[2]);

      // Orient the tube to point from start to end
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

    // Position and orient forward arrow tip
    this.arrowTip.visible = true;
    this.arrowTip.position.set(chestEnd[0], chestEnd[1], chestEnd[2]);
    
    // Calculate direction vector for orientation
    if (vec3.length(direction) > 0) {
      vec3.normalize(direction, direction);
      this.arrowTip.lookAt(
        this.arrowTip.position.x + direction[0],
        this.arrowTip.position.y + direction[1], 
        this.arrowTip.position.z + direction[2]
      );
      // Rotate 90 degrees to point the cone tip in the right direction
      this.arrowTip.rotateX(Math.PI / 2);
    }
    
    // Update forward vector material color
    const colorHex = chest.color; // Use device backend color
    const material = this.getMaterial(colorHex);
    this.tubeSeg.material = material;
    this.arrowTip.material = material;

    // Update up vector tube
    this.upTubeSeg.visible = true;
    const upDirection = vec3.subtract(vec3.create(), upEnd, chestAnchor);
    const upLengthActual = vec3.length(upDirection);
    
    if (upLengthActual > 0.001) {
      this.upTubeSeg.scale.set(1, upLengthActual, 1);
      
      // Position the tube at the midpoint
      const upMidpoint = vec3.lerp(vec3.create(), chestAnchor, upEnd, 0.5);
      this.upTubeSeg.position.set(upMidpoint[0], upMidpoint[1], upMidpoint[2]);

      // Orient the tube to point from start to end
      const normalizedUp = vec3.normalize(vec3.create(), upDirection);
      this.upTubeSeg.lookAt(
        this.upTubeSeg.position.x + normalizedUp[0],
        this.upTubeSeg.position.y + normalizedUp[1],
        this.upTubeSeg.position.z + normalizedUp[2]
      );
      this.upTubeSeg.rotateX(Math.PI / 2);
    } else {
      this.upTubeSeg.scale.set(1, 0, 1); // Zero length
    }

    // Position and orient up vector arrow tip
    this.upArrowTip.visible = true;
    this.upArrowTip.position.set(upEnd[0], upEnd[1], upEnd[2]);
    
    // Calculate direction vector for orientation
    if (vec3.length(chest.up) > 0) {
      const normalizedUp = vec3.normalize(vec3.create(), chest.up);
      this.upArrowTip.lookAt(
        this.upArrowTip.position.x + normalizedUp[0],
        this.upArrowTip.position.y + normalizedUp[1], 
        this.upArrowTip.position.z + normalizedUp[2]
      );
      // Rotate 90 degrees to point the cone tip in the right direction
      this.upArrowTip.rotateX(Math.PI / 2);
    }
    
    // Update up vector material color
    const upColorHex = chest.color; // Use device backend color
    const upMaterial = this.getMaterial(upColorHex);
    this.upTubeSeg.material = upMaterial;
    this.upArrowTip.material = upMaterial;
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
