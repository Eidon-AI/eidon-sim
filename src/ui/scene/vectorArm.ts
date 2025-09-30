import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
import { DeviceStore } from '../../core/DeviceStore';
import { HUM_LEN, RAD_LEN, HAND_LEN } from '../../core/constants';

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

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side: 'left' | 'right'
  ) {
    // Create shared geometries once
    this.tubeGeometry = new THREE.CylinderGeometry(0.005, 0.005, 1, 8);
    this.arrowGeometry = new THREE.ConeGeometry(0.01, 0.04, 8);
    
    // Create initial lines and tubes
    ['#ff6', '#6ff', '#f6f'].forEach(col => {
      this.segs.push(this.build(col));
      this.tubeSegs.push(this.buildTube([0,0,0], [0,0.1,0], col));
      this.arrowTips.push(this.buildArrowTip(col));
    });
    
    ['#ff9', '#9ff', '#f9f'].forEach(col => {
      this.upSegs.push(this.build(col));
      this.upTubeSegs.push(this.buildTube([0,0,0], [0,0.1,0], col));
      this.upArrowTips.push(this.buildArrowTip(col));
    });
    
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

  private refresh() {
    /* ---- gather devices ---- */
    const up    = this.store.getBy(this.side, 'upper');
    const low   = this.store.getBy(this.side, 'lower');
    const glove = this.store.getBy(this.side, 'hand');      // may be undefined

    /* ---- shoulder anchor ---- */
    const shoulder: vec3 = this.side === 'left'
      ? [-0.3, 0,  0]
      : [0.3, 0, 0];

    // rotation that spins 90° about +Y
    const rightYaw90Array = new Float32Array([
      0, 0, 1,
      0, 1, 0,
      -1, 0, 0
    ]);
    const leftYaw90Array = new Float32Array([
      0, 0, -1,
      0, 1, 0,
      1, 0, 0
    ]);

    /* helper to maybe rotate fwd for right arm */
    const rotFwd = (v: vec3) =>
      this.side === 'right'
        ? vec3.transformMat3(vec3.create(), v, rightYaw90Array)
        : vec3.transformMat3(vec3.create(), v, leftYaw90Array);

    /* helper to maybe rotate up for right arm */
    const rotUp = (v: vec3) =>
      this.side === 'right'
        ? vec3.transformMat3(vec3.create(), v, rightYaw90Array)
        : vec3.transformMat3(vec3.create(), v, leftYaw90Array);

    /* ---- compute chain step-by-step ---- */
    const upperEnd = up
      ? vec3.scaleAndAdd(vec3.create(), shoulder, rotFwd(up.fwd), HUM_LEN())
      : vec3.clone(shoulder);

    const lowerEnd = low
      ? vec3.scaleAndAdd(vec3.create(), upperEnd, rotFwd(low.fwd), RAD_LEN())
      : vec3.clone(upperEnd);

    const handEnd  = glove
      ? vec3.scaleAndAdd(vec3.create(), lowerEnd, rotFwd(glove.fwd), HAND_LEN())
      : vec3.clone(lowerEnd);

    /* ---- update three line segments (forward vectors) ---- */
    const pts: [vec3, vec3, vec3, vec3] = [shoulder, upperEnd, lowerEnd, handEnd];

    pts.forEach((p, idx) => {
      if (idx === 3) return;                       // no segment after hand
      
      const dev = idx === 0 ? up : idx === 1 ? low : glove;
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
      
      // Update tube position and scale instead of recreating
      const direction = vec3.subtract(vec3.create(), pts[idx+1], pts[idx]);
      const length = vec3.length(direction);
      
      if (length > 0.001) {
        tube.scale.set(1, length, 1);
        
        // Position the tube at the midpoint
        const midpoint = vec3.lerp(vec3.create(), pts[idx], pts[idx+1], 0.5);
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
      tip.position.set(pts[idx+1][0], pts[idx+1][1], pts[idx+1][2]);
      
      // Calculate direction vector for orientation
      if (vec3.length(direction) > 0) {
        vec3.normalize(direction, direction);
        tip.lookAt(
          tip.position.x + direction[0],
          tip.position.y + direction[1], 
          tip.position.z + direction[2]
        );
        // Rotate 90 degrees to point the cone tip in the right direction
        tip.rotateX(Math.PI / 2);
      }
      
      // Update material color using shared material
      const colorHex = dev?.color ?? '#888';
      const material = this.getMaterial(colorHex);
      tube.material = material;
      tip.material = material;
    });

    /* ---- update up vector segments ---- */
    const devices = [up, low, glove];
    const startPoints = [shoulder, upperEnd, lowerEnd];
    const segmentLengths = [HUM_LEN(), RAD_LEN(), HAND_LEN()];
    
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
      // Make up vector length proportional to forward vector segment length (20% of segment length)
      const upVectorLength = segmentLengths[idx] * 0.2;
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
      
      // Update material color using shared material
      const colorHex = dev?.color ?? '#888';
      const material = this.getMaterial(colorHex);
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
