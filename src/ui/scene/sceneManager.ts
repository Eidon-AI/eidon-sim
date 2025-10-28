// src/ui/scene/sceneManager.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DeviceStore } from '../../core/DeviceStore';
import { ArmSolver } from '../../core/ArmSolver';
import { VectorArm } from './vectorArm';
import { ChestVector } from './chestVector';
import { SkeletalRig } from './skeletalRig';
import { CameraControl } from '../components/CameraControl';
import { KeyboardController } from '../components/KeyboardController';
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
  cam.position.set(0, 0, -6);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(0, 0, 0);
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

  /* ------------ view controls -------------------- */
  const viewControls = new ViewControls();
  viewControls.mount();
  
  // Expose ViewControls globally for other components to access
  (window as any).viewControls = viewControls;
  
  /* ------------ camera animation system --------- */
  let cameraAnimation: {
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    center: THREE.Vector3;
    startRadius: number;
    endRadius: number;
    startAngle: { theta: number; phi: number };
    endAngle: { theta: number; phi: number };
    progress: number;
    duration: number;
  } | null = null;

  document.addEventListener('cameraViewChange', (e: Event) => {
    const { position, target } = (e as CustomEvent).detail;
    
    const startPos = cam.position.clone();
    const endPos = new THREE.Vector3(...position);
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(...target);
    
    // Calculate the center point (average of start and end targets)
    const center = new THREE.Vector3().addVectors(startTarget, endTarget).multiplyScalar(0.5);
    
    // Convert start and end positions to spherical coordinates around center
    const startOffset = new THREE.Vector3().subVectors(startPos, center);
    const endOffset = new THREE.Vector3().subVectors(endPos, center);
    
    const startRadius = startOffset.length();
    const endRadius = endOffset.length();
    
    // Calculate spherical angles (theta = azimuthal, phi = polar)
    const startTheta = Math.atan2(startOffset.x, startOffset.z);
    const startPhi = Math.acos(startOffset.y / startRadius);
    
    const endTheta = Math.atan2(endOffset.x, endOffset.z);
    const endPhi = Math.acos(endOffset.y / endRadius);
    
    // Choose shortest angular path (handle wrapping around 2π)
    let deltaTheta = endTheta - startTheta;
    if (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
    if (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;
    
    // Start camera animation with spherical interpolation
    cameraAnimation = {
      startPos,
      endPos,
      startTarget,
      endTarget,
      center,
      startRadius,
      endRadius,
      startAngle: { theta: startTheta, phi: startPhi },
      endAngle: { theta: startTheta + deltaTheta, phi: endPhi },
      progress: 0,
      duration: 0.8 // 0.8 second animation
    };
  });

  // Update camera animation in render loop
  function updateCameraAnimation(deltaTime: number) {
    if (!cameraAnimation) return;

    cameraAnimation.progress += deltaTime / cameraAnimation.duration;
    
    if (cameraAnimation.progress >= 1) {
      // Animation complete
      cam.position.copy(cameraAnimation.endPos);
      controls.target.copy(cameraAnimation.endTarget);
      controls.update();
      cameraAnimation = null;
    } else {
      // Ease in-out cubic
      const t = cameraAnimation.progress;
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      
      // Spherical interpolation for position (arc around center)
      const theta = THREE.MathUtils.lerp(cameraAnimation.startAngle.theta, cameraAnimation.endAngle.theta, eased);
      const phi = THREE.MathUtils.lerp(cameraAnimation.startAngle.phi, cameraAnimation.endAngle.phi, eased);
      const radius = THREE.MathUtils.lerp(cameraAnimation.startRadius, cameraAnimation.endRadius, eased);
      
      // Convert spherical back to Cartesian
      const x = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.cos(theta);
      
      cam.position.copy(cameraAnimation.center).add(new THREE.Vector3(x, y, z));
      
      // Linear interpolation for target
      controls.target.lerpVectors(cameraAnimation.startTarget, cameraAnimation.endTarget, eased);
      controls.update();
    }
  }
  
  /* ------------ scene objects ------------------- */
  const leftArm = new VectorArm(scene, store, 'left');
  const rightArm = new VectorArm(scene, store, 'right');
  const chestVector = new ChestVector(scene, store);

  // Model arrays - we'll populate these based on toggle state
  let rigs: SkeletalRig[] = [];
  let currentMultipleModelsState: boolean | null;

  // Function to create single model
  const createSingleModel = (visible: boolean) => {
    const rig = new SkeletalRig(scene, store, solver, '/assets/YBot.gltf', visible);
    return [rig];
  };

  // Function to create multiple models  
  const createMultipleModels = (visible: boolean) => {
    // Define model configurations: position, scale, description
    const modelConfigs = [
      // Front row - main models
      { pos: { x: 0, z: 0 }, scale: 1.0, desc: 'Main center model' },
      { pos: { x: +1.5, z: 0 }, scale: 0.8, desc: 'Left side model' },
      { pos: { x: -1.5, z: 0 }, scale: 0.8, desc: 'Right side model' },

      // Back row - smaller models
      { pos: { x: +0.75, z: +1.5 }, scale: 0.6, desc: 'Back left model' },
      { pos: { x: -0.75, z: +1.5 }, scale: 0.6, desc: 'Back right model' },

      // Side models - different scales
      { pos: { x: +2.5, z: -0.5 }, scale: 0.5, desc: 'Far left mini model' },
      { pos: { x: -2.5, z: -0.5 }, scale: 0.5, desc: 'Far right mini model' },

      // Center back - large model
      { pos: { x: 0, z: +2.5 }, scale: 1.2, desc: 'Large back model' }
    ];

    // Create all models
    const newRigs: SkeletalRig[] = [];
    modelConfigs.forEach((config) => {
      const rig = new SkeletalRig(
        scene, 
        store, 
        solver, 
        '/assets/YBot.gltf', 
        visible,
        config.pos,  // Position (accounting for 180° model rotation)
        config.scale // Scale
      );
      newRigs.push(rig);
    });

    return newRigs;
  };

  // Function to clean up existing models
  const cleanupModels = () => {
    rigs.forEach(rig => rig.destroy());
    rigs = [];
  };

  // Function to switch model mode
  const switchModelMode = (useMultiple: boolean, visible: boolean) => {
    // Clean up existing models
    cleanupModels();

    // Create new models based on mode
    if (useMultiple) {
      rigs = createMultipleModels(visible);
    } else {
      rigs = createSingleModel(visible);
    }
    
    currentMultipleModelsState = useMultiple;
  };

  // Initialize with default state - let applyInitialState() handle model creation
  const initialRiggedModelState = viewControls.getInitialRiggedModelState();
  const initialMultipleModelsState = viewControls.getState().multipleModels;
  currentMultipleModelsState = null; // Will be set by first event


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
        rigs.forEach(rig => rig.setVisible(enabled));
        break;
      case 'vectorArms':
        leftArm.setVisible(enabled);
        rightArm.setVisible(enabled);
        break;
      case 'chestVector':
        chestVector.setVisible(enabled);
        break;
      case 'multipleModels':
        // Only switch if the state is actually changing (or if this is the first time)
        if (currentMultipleModelsState === null || enabled !== currentMultipleModelsState) {
          // Get current visibility state of rigged models
          const currentRiggedModelState = viewControls.getState().riggedModel;
          // Switch model mode while preserving visibility state
          switchModelMode(enabled, currentRiggedModelState);
        }
        break;
    }
  });

  // Handle color change events
  viewControls.addEventListener('colorChange', (e) => {
    const { color, save } = (e as CustomEvent).detail;
    
    // Always update the material directly for instant visual feedback
    rigs.forEach(rig => rig.updateSurfaceColor(color));
    
    // Only save preferences when the picker closes (save: true)
    if (save) {
      prefs.meshSurface = color;
      savePrefs(); // This will also update the logo
    }
  });

  // Handle model reset events (from playback exit)
  document.addEventListener('resetModel', () => {
    // Trigger a device update to refresh all visuals
    // This will cause the rigs to return to default positions
    store.dispatchEvent(new CustomEvent('update'));
  });

  // Apply initial view state after event listeners are set up
  viewControls.applyInitialState();

  /* ------------ render loop ---------------------- */
  let lastTime = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000; // Convert to seconds
    lastTime = now;
    
    // Update camera animation if active
    updateCameraAnimation(deltaTime);
    
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

  // Return cleanup function
  return {
    destroy() {
      // Clean up window event listeners
      window.removeEventListener('resize', handleResize);
      
      // Clean up components
      leftArm.destroy();
      rightArm.destroy();
      chestVector.destroy();
      cleanupModels(); // Use our new cleanup function
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
    }
  };
}
