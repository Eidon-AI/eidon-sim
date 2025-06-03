import * as THREE from 'three';

interface CameraPosition {
  position: [number, number, number];
  target: [number, number, number];
}

const VIEWS: Record<string, CameraPosition> = {
  top: {
    position: [0.15, 5, 0],
    target: [0.15, 0, 0]
  },
  front: {
    position: [0.15, 0, 5],
    target: [0.15, 0, 0]
  },
  right: {
    position: [5, 0, 0],
    target: [0.15, 0, 0]
  },
  back: {
    position: [0.15, 0, -5],
    target: [0.15, 0, 0]
  },
  left: {
    position: [-5, 0, 0],
    target: [0.15, 0, 0]
  },
  bottom: {
    position: [0.15, -5, 0],
    target: [0.15, 0, 0]
  }
};

export class CameraControl {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cube: THREE.Mesh;
  private edges: THREE.LineSegments;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private onViewChange: (view: CameraPosition) => void;
  private mainCamera: THREE.Camera;
  private animationId: number | null = null;

  constructor(onViewChange: (view: CameraPosition) => void, mainCamera: THREE.Camera) {
    this.onViewChange = onViewChange;
    this.mainCamera = mainCamera;
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.right = '10px';
    this.container.style.width = '100px';
    this.container.style.height = '100px';
    this.container.style.backgroundColor = 'transparent';
    this.container.style.borderRadius = '8px';
    this.container.style.overflow = 'hidden';
    this.container.style.cursor = 'pointer';
    this.container.className = 'z-5';

    this.canvas = document.createElement('canvas');
    this.canvas.width = 100;
    this.canvas.height = 100;
    this.container.appendChild(this.canvas);

    // Initialize Three.js
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas, 
      antialias: true,
      alpha: true
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(100, 100);
    this.scene = new THREE.Scene();
    
    // Set up the control camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(2, 2, 2);
    this.camera.lookAt(0, 0, 0);

    // Create cube with grayscale colors for each face
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0x808080, opacity: 0.5, transparent: true }), // right (+X)
      new THREE.MeshBasicMaterial({ color: 0x606060, opacity: 0.5, transparent: true }), // left (-X)
      new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true }), // top (+Y)
      new THREE.MeshBasicMaterial({ color: 0x404040, opacity: 0.5, transparent: true }), // bottom (-Y)
      new THREE.MeshBasicMaterial({ color: 0xa0a0a0, opacity: 0.5, transparent: true }), // front (+Z)
      new THREE.MeshBasicMaterial({ color: 0x202020, opacity: 0.5, transparent: true })  // back (-Z)
    ];
    this.cube = new THREE.Mesh(geometry, materials);
    
    // Center the cube on the origin
    this.cube.position.set(0, 0, 0);
    
    // Add edge lines
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ 
      color: 0xffffff,
      linewidth: 2
    });
    this.edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    this.cube.add(this.edges);
    this.scene.add(this.cube);

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x404040));

    // Setup raycaster with more precise settings
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
    this.raycaster.params.Line = { threshold: 0.1 };
    this.raycaster.params.Points = { threshold: 0.1 };
    this.mouse = new THREE.Vector2();

    // Add event listeners
    this.canvas.addEventListener('click', this.onClick.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));

    // Start animation
    this.animate();
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    
    // Create a correction quaternion to align with world axes
    const correction = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, 0)
    );
    
    // Apply inverse of camera quaternion with correction
    // The cube should show world orientation relative to camera, so it rotates opposite to camera
    this.cube.quaternion.copy(this.mainCamera.quaternion).invert().multiply(correction);
    
    this.renderer.render(this.scene, this.camera);
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private onClick(event: MouseEvent) {
    console.log('Click detected');
    console.log('Mouse position:', this.mouse);
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    console.log('Raycaster ray:', this.raycaster.ray);
    
    const intersects = this.raycaster.intersectObject(this.cube, true);
    console.log('Intersects:', intersects);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      console.log('Intersect object:', intersect.object);
      console.log('Intersect point:', intersect.point);
      
      if (intersect.face) {
        const normal = intersect.face.normal.clone();
        console.log('Face normal:', normal);
        
        // Convert normal to world space
        normal.applyQuaternion(this.cube.quaternion);
        console.log('World space normal:', normal);
        
        const view = this.getViewFromNormal(normal);
        if (view) {
          console.log('Selected view:', view);
          console.log('View position:', VIEWS[view].position);
          console.log('View target:', VIEWS[view].target);
          this.onViewChange(VIEWS[view]);
          
          // Update cube orientation to match the new view
          const lookAtMatrix = new THREE.Matrix4();
          lookAtMatrix.lookAt(
            new THREE.Vector3(...VIEWS[view].position),
            new THREE.Vector3(...VIEWS[view].target),
            new THREE.Vector3(0, 0.05, 0)
          );
          this.cube.quaternion.setFromRotationMatrix(lookAtMatrix);
          console.log('Updated cube quaternion:', this.cube.quaternion);
        } else {
          console.log('No view found for normal');
        }
      } else {
        console.log('No face found in intersection');
      }
    } else {
      console.log('No intersection found');
    }
  }

  private getViewFromNormal(normal: THREE.Vector3): string | null {
    // Find the dominant axis
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);
    
    console.log('Normal components:', { x: normal.x, y: normal.y, z: normal.z });
    console.log('Absolute values:', { x: absX, y: absY, z: absZ });
    
    // Use a higher threshold to ensure we're clicking on a face
    const threshold = 0.7;
    
    if (absX > threshold && absX > absY && absX > absZ) {
      return normal.x > 0 ? 'right' : 'left';
    } else if (absY > threshold && absY > absX && absY > absZ) {
      return normal.y > 0 ? 'top' : 'bottom';
    } else if (absZ > threshold && absZ > absX && absZ > absY) {
      return normal.z > 0 ? 'front' : 'back';
    }
    
    return null;
  }

  mount() {
    document.body.appendChild(this.container);
  }

  unmount() {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  destroy() {
    // Stop animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clean up Three.js resources
    this.renderer.dispose();
    this.scene.clear();

    // Clean up geometries and materials
    if (this.cube.geometry) {
      this.cube.geometry.dispose();
    }
    if (Array.isArray(this.cube.material)) {
      this.cube.material.forEach(material => material.dispose());
    } else if (this.cube.material) {
      this.cube.material.dispose();
    }
    
    if (this.edges.geometry) {
      this.edges.geometry.dispose();
    }
    if (this.edges.material) {
      (this.edges.material as THREE.LineBasicMaterial).dispose();
    }

    // Remove event listeners
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);

    // Remove from DOM
    this.unmount();

    console.log('CameraControl destroyed');
  }
} 