/**
 * ProceduralHand – ported from eidon-glove/web/script.js
 *
 * Geometry and joint mapping are identical to the original visualizer.
 * All dimensions are scaled by SCALE (1 original unit = 0.025 m).
 *
 * fingerSmooth[0..15] layout (matches eidon-glove fingerJointMap):
 *   0  Thumb  CMC_ABDUCTION
 *   1  Thumb  CMC_FLEXION
 *   2  Thumb  MCP_FLEXION
 *   3  Thumb  IP_FLEXION
 *   4  Index  MCP_ABDUCTION
 *   5  Index  MCP_FLEXION
 *   6  Index  PIP_FLEXION
 *   7  Middle MCP_ABDUCTION
 *   8  Middle MCP_FLEXION
 *   9  Middle PIP_FLEXION
 *  10  Ring   MCP_ABDUCTION
 *  11  Ring   MCP_FLEXION
 *  12  Ring   PIP_FLEXION
 *  13  Pinky  MCP_ABDUCTION
 *  14  Pinky  MCP_FLEXION
 *  15  Pinky  PIP_FLEXION
 */
import * as THREE from 'three';
import { DeviceStore } from '../../core/DeviceStore';
import { DeviceRole } from '../../types/device';

const SCALE = 0.025; // 1 original unit → 0.025 m

const JOINT_MAP = [
  { finger: 0, type: 'CMC_ABDUCTION' },
  { finger: 0, type: 'CMC_FLEXION'   },
  { finger: 0, type: 'MCP_FLEXION'   },
  { finger: 0, type: 'IP_FLEXION'    },
  { finger: 1, type: 'MCP_ABDUCTION' },
  { finger: 1, type: 'MCP_FLEXION'   },
  { finger: 1, type: 'PIP_FLEXION'   },
  { finger: 2, type: 'MCP_ABDUCTION' },
  { finger: 2, type: 'MCP_FLEXION'   },
  { finger: 2, type: 'PIP_FLEXION'   },
  { finger: 3, type: 'MCP_ABDUCTION' },
  { finger: 3, type: 'MCP_FLEXION'   },
  { finger: 3, type: 'PIP_FLEXION'   },
  { finger: 4, type: 'MCP_ABDUCTION' },
  { finger: 4, type: 'MCP_FLEXION'   },
  { finger: 4, type: 'PIP_FLEXION'   },
] as const;

interface FingerModel {
  base:           THREE.Group;
  rotationGroups: THREE.Group[];
}

export class ProceduralHand {
  private group:    THREE.Group;
  private palm:     THREE.Mesh;
  private fingers:  FingerModel[] = [];
  private mat:      THREE.MeshPhongMaterial;
  private jointMat: THREE.MeshPhongMaterial;
  private wantVisible = false;

  constructor(
    private scene: THREE.Scene,
    private store: DeviceStore,
    private side:  'left' | 'right'
  ) {
    this.mat      = new THREE.MeshPhongMaterial({ color: 0xf5c396 });
    this.jointMat = new THREE.MeshPhongMaterial({ color: 0xe3a977 });

    this.group = new THREE.Group();
    this.group.visible = false;

    // Mirror the left hand along X (same geometry, flipped)
    if (side === 'left') this.group.scale.x = -1;

    // Rotate so fingers point +Y and palm faces +Z
    this.group.rotation.x = Math.PI / 2;
    this.group.rotation.z = Math.PI;

    this.palm = this._buildPalmAndFingers();
    scene.add(this.group);
    store.addEventListener('update', () => this._refresh());
  }

  private _buildPalmAndFingers(): THREE.Mesh {
    const s = SCALE;

    // Palm – BoxGeometry(6, 1.25, 7), same rotations as original
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(6 * s, 1.25 * s, 7 * s),
      this.mat
    );
    palm.rotation.x = Math.PI;
    palm.rotation.y = Math.PI;
    this.group.add(palm);

    const fingerWidth = 1 * s;
    const fingerHeight = 0.8 * s;
    const segLengths = [3 * s, 2 * s, 1.5 * s];

    // Exact base positions from original script.js
    const basePositions: [number, number, number][] = [
      [ 3    * s,  0,        0        ], // Thumb
      [ 2.5  * s, -0.5 * s, -3.5 * s ], // Index
      [ 0.83 * s, -0.5 * s, -3.5 * s ], // Middle
      [-0.83 * s, -0.5 * s, -3.5 * s ], // Ring
      [-2.5  * s, -0.5 * s, -3.5 * s ], // Pinky
    ];

    for (let f = 0; f < 5; f++) {
      const fm: FingerModel = { base: new THREE.Group(), rotationGroups: [] };
      fm.base.position.set(...basePositions[f]);
      palm.add(fm.base);

      let parent: THREE.Group = fm.base;

      for (let seg = 0; seg < 3; seg++) {
        const rotGrp = new THREE.Group();
        parent.add(rotGrp);
        fm.rotationGroups.push(rotGrp);

        const segGrp = new THREE.Group();
        rotGrp.add(segGrp);

        // Joint sphere
        segGrp.add(new THREE.Mesh(
          new THREE.SphereGeometry(fingerWidth * 0.6, 8, 8),
          this.jointMat
        ));

        // Segment box
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(fingerWidth, fingerHeight, segLengths[seg]),
          this.mat
        );
        box.position.z = -segLengths[seg] / 2;
        segGrp.add(box);

        // Next joint pivot at end of segment
        if (seg < 2) {
          const next = new THREE.Group();
          next.position.z = -segLengths[seg];
          segGrp.add(next);
          parent = next;
        }
      }

      this.fingers.push(fm);
    }

    return palm;
  }

  private _refresh(): void {
    if (!this.wantVisible) return;

    const role  = this.side === 'left' ? DeviceRole.ROLE_LEFT_GLOVE : DeviceRole.ROLE_RIGHT_GLOVE;
    const glove = this.store.getByPosition(role);

    this.group.visible = !!glove;
    if (!glove) return;

    const src = glove.fingerSmooth ?? glove.fingerNorm;
    if (!src) return;

    for (let i = 0; i < 16; i++) {
      const info = JOINT_MAP[i];
      const { finger, type } = info;
      // Our values are 0-1; scale to 0-255 to match original logic
      const value = (src[i] ?? 0) * 255;
      const f = this.fingers[finger];
      if (!f) continue;

      if (type.includes('FLEXION')) {
        const angle = (value / 255) * (Math.PI / 2);

        if (finger === 0) { // Thumb
          if (type === 'CMC_FLEXION') f.rotationGroups[0].rotation.x = angle;
          if (type === 'MCP_FLEXION') f.rotationGroups[1].rotation.x = angle;
          if (type === 'IP_FLEXION')  f.rotationGroups[2].rotation.x = angle;
        } else {
          if (type === 'MCP_FLEXION') {
            f.rotationGroups[0].rotation.x = angle;
          } else if (type === 'PIP_FLEXION') {
            f.rotationGroups[1].rotation.x = angle;
            if (f.rotationGroups[2]) f.rotationGroups[2].rotation.x = angle * 0.6;
          }
        }
      } else if (type.includes('ABDUCTION')) {
        const norm = (value - 127) / 127; // -1 to 1

        if (finger === 0) { // Thumb CMC_ABDUCTION
          const angle = norm * (Math.PI / 2);
          f.base.rotation.z = (Math.PI / 4) - (angle * 0.75);
          f.base.rotation.y = -(Math.PI / 2) - (angle * 0.25);
        } else {
          let a = norm * (Math.PI / 4);
          if (finger === 1 || finger === 4) a *= 0.5;
          if (finger === 2 || finger === 3) a *= 0.3;
          f.rotationGroups[0].rotation.y = a;
        }
      }
    }
  }

  public setVisible(visible: boolean): void {
    this.wantVisible = visible;
    if (!visible) {
      this.group.visible = false;
    } else {
      this._refresh();
    }
  }

  public destroy(): void {
    this.mat.dispose();
    this.jointMat.dispose();
    this.scene.remove(this.group);
  }
}
