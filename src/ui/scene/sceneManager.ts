// src/ui/scene/sceneManager.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DeviceStore } from '../../core/DeviceStore';
import { ArmSolver } from '../../core/ArmSolver';
import { VectorArm } from './vectorArm';
import { SkeletalRig } from './skeletalRig';

export function initScene(
  canvas: HTMLCanvasElement,
  store: DeviceStore,
  solver: ArmSolver
) {
  /* ------------ renderer & basic scene ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth - 0, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;       // <-- crucial
  renderer.toneMapping   = THREE.ACESFilmicToneMapping;

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
  cam.position.set(2, 3, 3);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.set(0.15, 0.95, 0);
  controls.update();

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
