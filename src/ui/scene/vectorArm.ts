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

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side: 'left' | 'right'
  ) {
    // Create placeholder lines and tubes
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

  private build(color: string) {
    // Create a simple line geometry as placeholder - will be replaced with tube in refresh
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
      // Return empty geometry for zero-length vectors
      const emptyGeo = new THREE.BufferGeometry();
      const mat = new THREE.MeshBasicMaterial({ color });
      return new THREE.Mesh(emptyGeo, mat);
    }

    const tubeGeometry = new THREE.CylinderGeometry(0.005, 0.005, length, 8);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);

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
    const coneGeometry = new THREE.ConeGeometry(0.01, 0.04, 8);
    const coneMaterial = new THREE.MeshBasicMaterial({ color });
    return new THREE.Mesh(coneGeometry, coneMaterial);
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
      
      // Show and update tube
      tube.visible = true;
      tip.visible = true;
      
      // Remove old tube and create new one with updated positions
      this.group.remove(tube);
      const colorHex = dev?.color ?? '#888';
      const newTube = this.buildTube(pts[idx], pts[idx+1], colorHex);
      this.tubeSegs[idx] = newTube;
      this.group.add(newTube);

      /* position and orient arrow tip */
      tip.position.set(pts[idx+1][0], pts[idx+1][1], pts[idx+1][2]);
      
      // Calculate direction vector for orientation
      const direction = vec3.subtract(vec3.create(), pts[idx+1], pts[idx]);
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
      
      (tip.material as THREE.MeshBasicMaterial).color.set(colorHex);
    });

    /* ---- update up vector segments ---- */
    const devices = [up, low, glove];
    const startPoints = [shoulder, upperEnd, lowerEnd];
    const segmentLengths = [HUM_LEN(), RAD_LEN(), HAND_LEN()]; // Forward vector segment lengths
    
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
      
      // Show and update up tube
      upTube.visible = true;
      upTip.visible = true;
      
      // Remove old tube and create new one with updated positions
      this.group.remove(upTube);
      const colorHex = dev?.color ?? '#888';
      const newUpTube = this.buildTube(startPt, upEnd, colorHex);
      this.upTubeSegs[idx] = newUpTube;
      this.group.add(newUpTube);

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
      
      (upTip.material as THREE.MeshBasicMaterial).color.set(colorHex);
    });
  }
}
