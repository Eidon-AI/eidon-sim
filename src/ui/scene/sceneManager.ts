// src/ui/scene/sceneManager.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DeviceStore } from '../../core/DeviceStore';
import { ArmSolver } from '../../core/ArmSolver';
import { VectorArm } from './vectorArm';
import { SkeletalRig } from './skeletalRig';
import { CameraControl } from '../components/CameraControl';
import { KeyboardController } from '../components/KeyboardController';
import { GamepadController } from '../components/GamepadController';
import { ViewControls } from '../components/ViewControls';
import { prefs, savePrefs } from '../../core/preferences';

export function initScene(
  canvas: HTMLCanvasElement,
  store: DeviceStore,
  solver: ArmSolver
) {
  /* ------------ renderer & basic scene ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth - 0, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;       // <-- crucial
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  /* ------------ lighting ------------------------ */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 4, 1);
  scene.add(dir);

  /* ------------ camera + controls -------------- */
  const cam = new THREE.PerspectiveCamera(
    25,
    (window.innerWidth - 0) / window.innerHeight,
    0.1,
    1000
  );
  cam.position.set(1.5, 1.5, -3);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(-0.1, 0.15, 0);
  controls.update();

  /* ------------ infinite grid plane ------------ */
  const createInfiniteGrid = () => {
    // Create a large plane geometry
    const size = 50;
    const divisions = 100;
    const geometry = new THREE.PlaneGeometry(size, size, divisions, divisions);
    
    // Create shader material that fades with distance
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCameraPosition: { value: cam.position }
      },
      vertexShader: `
        uniform vec3 uCameraPosition;
        varying vec3 vWorldPosition;
        varying float vDistanceToCamera;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vDistanceToCamera = distance(worldPosition.xyz, uCameraPosition);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying float vDistanceToCamera;
        
        void main() {
          // Create grid lines
          vec2 grid = abs(fract(vWorldPosition.xz * 4.0) - 0.5) / fwidth(vWorldPosition.xz * 4.0);
          float line = min(grid.x, grid.y);
          
          // Major grid lines every 4 units
          vec2 majorGrid = abs(fract(vWorldPosition.xz) - 0.5) / fwidth(vWorldPosition.xz);
          float majorLine = min(majorGrid.x, majorGrid.y);
          
          // Combine grid lines
          float gridStrength = 1.0 - min(line, 1.0);
          float majorGridStrength = 1.0 - min(majorLine, 1.0);
          
          // Mix major and minor grid lines
          float finalGrid = max(gridStrength * 0.3, majorGridStrength * 0.6);
          
          // Fade with distance
          float fadeStart = 5.0;
          float fadeEnd = 25.0;
          float fadeFactor = 1.0 - smoothstep(fadeStart, fadeEnd, vDistanceToCamera);
          
          // Grid color
          vec3 gridColor = vec3(0.4, 0.4, 0.4);
          
          gl_FragColor = vec4(gridColor, finalGrid * fadeFactor);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    const gridMesh = new THREE.Mesh(geometry, material);
    gridMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat on XZ plane
    gridMesh.position.y = -1.0; // Position slightly below the character
    
    return { mesh: gridMesh, material };
  };
  
  const { mesh: gridMesh, material: gridMaterial } = createInfiniteGrid();
  scene.add(gridMesh);

  /* ------------ gamepad controller ----------------- */
  const gamepadController = new GamepadController(cam, controls);

  /* ------------ view controls -------------------- */
  const viewControls = new ViewControls();
  viewControls.mount();
  
  /* ------------ scene objects ------------------- */
  const leftArm = new VectorArm(scene, store, 'left');
  const rightArm = new VectorArm(scene, store, 'right');
  
  const initialRiggedModelState = viewControls.getInitialRiggedModelState();
  console.log('SceneManager: Creating SkeletalRig with saved riggedModel =', initialRiggedModelState);
  const rig = new SkeletalRig(scene, store, solver, '/assets/YBot.gltf', initialRiggedModelState);

  /* ------------ camera control ------------------- */
  const cameraChangeHandler = (pos: any) => {
    cam.position.set(pos.position[0], pos.position[1], pos.position[2]);
    cam.lookAt(pos.target[0], pos.target[1], pos.target[2]);
    controls.target.set(pos.target[0], pos.target[1], pos.target[2]);
    controls.update();
  };

  const cameraControl = new CameraControl(cameraChangeHandler, cam);
  cameraControl.mount();
  const keyboardController = new KeyboardController(cameraChangeHandler, cam, controls);

  // Handle view toggle events
  viewControls.addEventListener('viewToggle', (e) => {
    const { type, enabled } = (e as CustomEvent).detail;
    
    switch (type) {
      case 'grid':
        gridMesh.visible = enabled;
        break;
      case 'riggedModel':
        console.log('SceneManager: Setting skeleton visible =', enabled);
        rig.setVisible(enabled);
        break;
      case 'vectorArms':
        leftArm.setVisible(enabled);
        rightArm.setVisible(enabled);
        break;
    }
  });

  // Handle color change events
  viewControls.addEventListener('colorChange', (e) => {
    const { color, save } = (e as CustomEvent).detail;
    
    // Always update the material directly for instant visual feedback
    rig.updateSurfaceColor(color);
    
    // Only save preferences when the picker closes (save: true)
    if (save) {
      prefs.meshSurface = color;
      savePrefs(); // This will also update the logo
    }
  });

  // Apply initial view state after event listeners are set up
  console.log('SceneManager: Applying initial view state...');
  viewControls.applyInitialState();

  /* ------------ render loop ---------------------- */
  function animate() {
    requestAnimationFrame(animate);
    
    // Update grid shader uniform with camera position for proper distance fading
    gridMaterial.uniforms.uCameraPosition.value.copy(cam.position);
    
    controls.update();
    renderer.render(scene, cam);
  }
  animate();

  /* ------------ resize ----------------------------- */
  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', handleResize);

  // Return cleanup function and gamepad controller
  return {
    gamepadController,
    destroy() {
      console.log('Destroying scene...');
      
      // Clean up window event listeners
      window.removeEventListener('resize', handleResize);
      
      // Clean up components
      leftArm.destroy();
      rightArm.destroy();
      gamepadController.destroy();
      cameraControl.unmount();
      cameraControl.destroy();
      keyboardController.destroy();
      viewControls.destroy();
      
      // Clean up grid
      gridMesh.geometry.dispose();
      gridMaterial.dispose();
      
      // Clean up Three.js resources
      renderer.dispose();
      scene.clear();
      
      // Clean up controls
      controls.dispose();
      
      console.log('Scene destroyed');
    }
  };
}
