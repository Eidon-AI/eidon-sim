import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DeviceStore } from '../../core/DeviceStore';
import { VectorArm } from './vectorArm';
import { SkeletalRig } from './skeletalRig';
import { ArmSolver } from '../../core/ArmSolver';

export function initScene(
  canvas: HTMLCanvasElement,
  store: DeviceStore,
  solver: ArmSolver
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.setSize(window.innerWidth - 320, window.innerHeight); // sidebar=320
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const cam = new THREE.PerspectiveCamera(45, (window.innerWidth-320)/window.innerHeight, 0.1, 10);
  cam.position.set(1.2, 0.8, 1.2);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.target.set(-0.25,0.05,0);
  ctl.update();

  new VectorArm(scene, store, 'left');
  new VectorArm(scene, store, 'right');

  // new SkeletalArm(scene, solver, 'left');
  // new SkeletalArm(scene, solver, 'right');

  new SkeletalRig(scene, solver);

  window.addEventListener('resize', ()=>{
    renderer.setSize(window.innerWidth-320, window.innerHeight);
    cam.aspect = (window.innerWidth-320)/window.innerHeight;
    cam.updateProjectionMatrix();
  });

  function loop(t:number){
    requestAnimationFrame(loop);
    renderer.render(scene, cam);
  }
  loop(0);
}
