// src/ui/scene/sceneManager.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DeviceStore } from '../../core/DeviceStore';
import { ArmSolver } from '../../core/ArmSolver';
import { VectorArm } from './vectorArm';
import { SkeletalRig } from './skeletalRig';
import { CameraControl } from '../components/CameraControl';

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
  cam.position.set(-2, 3, 5);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(0.15, 0.9, 0);
  controls.update();

  /* ------------ camera control cube ------------ */
  const cameraControl = new CameraControl(({ position, target }) => {
    // Animate camera to new position
    const duration = 500; // ms
    const startPosition = cam.position.clone();
    const startTarget = controls.target.clone();
    const endPosition = new THREE.Vector3(...position);
    const endTarget = new THREE.Vector3(...target);
    const startTime = performance.now();

    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease in-out
      const t = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      cam.position.lerpVectors(startPosition, endPosition, t);
      controls.target.lerpVectors(startTarget, endTarget, t);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    animate();
  }, cam);
  cameraControl.mount();

  /* ------------ visuals ------------------------- */
  new VectorArm(scene, store, 'left');
  new VectorArm(scene, store, 'right');
  new SkeletalRig(scene, store, solver);      // single model drives both arms

  /* ------------ resize + loop ------------------- */
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth - 0, window.innerHeight);
    cam.aspect = (window.innerWidth - 0) / window.innerHeight;
    cam.updateProjectionMatrix();
  });

  const loop = () => {
    requestAnimationFrame(loop);
    renderer.render(scene, cam);
  };
  loop();
}
