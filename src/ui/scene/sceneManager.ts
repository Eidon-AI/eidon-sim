// src/ui/scene/sceneManager.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DeviceStore } from '../../core/DeviceStore';
import { ArmSolver } from '../../core/ArmSolver';
import { VectorArm } from './vectorArm';
import { SkeletalRig } from './skeletalRig';
import { CameraControl } from '../components/CameraControl';
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

  /* ------------ gamepad help overlay -------------- */
  const createGamepadHelp = () => {
    const helpOverlay = document.createElement('div');
    helpOverlay.id = 'gamepadHelp';
    helpOverlay.style.position = 'fixed';
    helpOverlay.style.top = '50%';
    helpOverlay.style.left = '50%';
    helpOverlay.style.transform = 'translate(-50%, -50%)';
    helpOverlay.style.background = 'rgba(0,0,0,0.9)';
    helpOverlay.style.color = 'white';
    helpOverlay.style.padding = '20px';
    helpOverlay.style.borderRadius = '8px';
    helpOverlay.style.fontSize = '14px';
    helpOverlay.style.zIndex = '30';
    helpOverlay.style.display = 'none';
    helpOverlay.style.maxWidth = '400px';
    helpOverlay.innerHTML = `
      <h3 style="margin-bottom: 15px; text-align: center;">🎮 Gamepad Camera Controls</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div>
          <strong>Orbit Mode:</strong><br>
          • Left Stick: Rotate around target<br>
          • Right Stick: Pan camera<br>
          • Triggers: Zoom in/out
        </div>
        <div>
          <strong>Free Look Mode:</strong><br>
          • Left Stick: Move forward/strafe<br>
          • Right Stick: Look around<br>
          • Triggers: Move up/down
        </div>
      </div>
      <div style="margin-top: 15px; text-align: center; padding-top: 10px; border-top: 1px solid #444;">
        <strong>Button Controls:</strong><br>
        A: Toggle camera mode • B: Reset camera • Y: Enable/disable gamepad
      </div>
      <div style="text-align: center; margin-top: 10px;">
        <button id="closeGamepadHelp" style="background: #444; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Close</button>
      </div>
    `;
    document.body.appendChild(helpOverlay);

    // Close button
    document.getElementById('closeGamepadHelp')!.onclick = () => {
      helpOverlay.style.display = 'none';
    };

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && helpOverlay.style.display !== 'none') {
        helpOverlay.style.display = 'none';
      }
    });

    return helpOverlay;
  };

  const gamepadHelp = createGamepadHelp();

  // Add gamepad help button
  const gamepadHelpBtn = document.createElement('button');
  gamepadHelpBtn.innerHTML = '🎮';
  gamepadHelpBtn.title = 'Gamepad Controls Help';
  gamepadHelpBtn.style.position = 'fixed';
  gamepadHelpBtn.style.top = '10px';
  gamepadHelpBtn.style.right = '130px';
  gamepadHelpBtn.style.background = 'rgba(0,0,0,0.7)';
  gamepadHelpBtn.style.color = 'white';
  gamepadHelpBtn.style.border = 'none';
  gamepadHelpBtn.style.padding = '8px 12px';
  gamepadHelpBtn.style.borderRadius = '4px';
  gamepadHelpBtn.style.cursor = 'pointer';
  gamepadHelpBtn.style.fontSize = '16px';
  gamepadHelpBtn.style.zIndex = '20';
  gamepadHelpBtn.onclick = () => {
    gamepadHelp.style.display = gamepadHelp.style.display === 'none' ? 'block' : 'none';
  };
  document.body.appendChild(gamepadHelpBtn);

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
