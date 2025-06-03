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
    10
  );
  cam.position.set(1.5, 1.5, -3);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(-0.3, 0.15, 0);
  controls.update();

  /* ------------ gamepad controller ----------------- */
  const gamepadController = new GamepadController(cam, controls);

  /* ------------ scene objects ------------------- */
  const leftArm = new VectorArm(scene, store, 'left');
  const rightArm = new VectorArm(scene, store, 'right');
  const rig = new SkeletalRig(scene, store, solver);

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

  /* ------------ render loop ---------------------- */
  function animate() {
    requestAnimationFrame(animate);
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
      
      // Clean up Three.js resources
      renderer.dispose();
      scene.clear();
      
      // Clean up controls
      controls.dispose();
      
      console.log('Scene destroyed');
    }
  };
}
