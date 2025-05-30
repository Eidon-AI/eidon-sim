import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class GamepadController {
  private gamepadIndex: number | null = null;
  private isEnabled: boolean = false;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sensitivity: number = 2.0;
  private moveSpeed: number = 0.02;
  private zoomSpeed: number = 0.05;
  private deadZone: number = 0.15;
  private mode: 'orbit' | 'freeLook' = 'orbit';
  private isConnected: boolean = false;

  // Velocity smoothing
  private velocity = new THREE.Vector3();
  private rotationVelocity = new THREE.Euler();
  private damping: number = 0.85;
  
  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    
    this.initGamepadSupport();
    this.startGamepadLoop();
  }

  private initGamepadSupport() {
    // Listen for gamepad connection/disconnection
    window.addEventListener('gamepadconnected', (e) => {
      console.log('Gamepad connected:', e.gamepad.id);
      this.gamepadIndex = e.gamepad.index;
      this.isConnected = true;
      this.showGamepadStatus('Connected: ' + e.gamepad.id);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('Gamepad disconnected:', e.gamepad.id);
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = null;
        this.isConnected = false;
        this.showGamepadStatus('Gamepad disconnected');
      }
    });

    // Check for already connected gamepads
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        this.gamepadIndex = i;
        this.isConnected = true;
        this.showGamepadStatus('Connected: ' + gamepads[i]!.id);
        break;
      }
    }
  }

  private showGamepadStatus(message: string) {
    // Create or update gamepad status indicator
    let indicator = document.getElementById('gamepadStatus');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'gamepadStatus';
      indicator.style.position = 'fixed';
      indicator.style.top = '110px';
      indicator.style.right = '10px';
      indicator.style.background = 'rgba(0,0,0,0.7)';
      indicator.style.color = 'white';
      indicator.style.padding = '8px 12px';
      indicator.style.borderRadius = '4px';
      indicator.style.fontSize = '12px';
      indicator.style.zIndex = '20';
      indicator.style.transition = 'opacity 0.3s';
      document.body.appendChild(indicator);
    }
    
    indicator.textContent = message;
    indicator.style.opacity = '1';
    
    // Fade out after 3 seconds if connected, keep visible if disconnected
    if (this.isConnected) {
      setTimeout(() => {
        if (indicator) indicator.style.opacity = '0.3';
      }, 3000);
    }
  }

  private applyDeadZone(value: number): number {
    return Math.abs(value) < this.deadZone ? 0 : value;
  }

  private updateOrbitMode(gamepad: Gamepad, deltaTime: number) {
    // Left stick: rotate around target
    const leftX = this.applyDeadZone(gamepad.axes[0]);
    const leftY = this.applyDeadZone(gamepad.axes[1]);
    
    if (leftX !== 0 || leftY !== 0) {
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(this.camera.position.clone().sub(this.controls.target));
      
      spherical.theta -= leftX * this.sensitivity * deltaTime;
      spherical.phi += leftY * this.sensitivity * deltaTime;
      
      // Constrain phi to avoid flipping
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
      
      this.camera.position.setFromSpherical(spherical).add(this.controls.target);
      this.controls.update();
    }

    // Right stick: pan
    const rightX = this.applyDeadZone(gamepad.axes[2]);
    const rightY = this.applyDeadZone(gamepad.axes[3]);
    
    if (rightX !== 0 || rightY !== 0) {
      const panDirection = new THREE.Vector3();
      this.camera.getWorldDirection(panDirection);
      
      const right = new THREE.Vector3();
      right.crossVectors(panDirection, this.camera.up).normalize();
      
      const up = new THREE.Vector3();
      up.crossVectors(right, panDirection).normalize();
      
      const panAmount = this.moveSpeed * deltaTime;
      const panVector = new THREE.Vector3()
        .addScaledVector(right, rightX * panAmount)
        .addScaledVector(up, -rightY * panAmount);
      
      this.controls.target.add(panVector);
      this.camera.position.add(panVector);
      this.controls.update();
    }

    // Triggers: zoom
    const leftTrigger = gamepad.buttons[6]?.value || 0;
    const rightTrigger = gamepad.buttons[7]?.value || 0;
    
    if (leftTrigger > 0.1 || rightTrigger > 0.1) {
      const zoomDelta = (rightTrigger - leftTrigger) * this.zoomSpeed * deltaTime;
      const direction = new THREE.Vector3();
      direction.subVectors(this.camera.position, this.controls.target).normalize();
      
      this.camera.position.addScaledVector(direction, zoomDelta);
      this.controls.update();
    }
  }

  private updateFreeLookMode(gamepad: Gamepad, deltaTime: number) {
    // Left stick: move forward/back and strafe
    const leftX = this.applyDeadZone(gamepad.axes[0]);
    const leftY = this.applyDeadZone(gamepad.axes[1]);
    
    if (leftX !== 0 || leftY !== 0) {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      
      const right = new THREE.Vector3();
      right.crossVectors(forward, this.camera.up).normalize();
      
      const moveAmount = this.moveSpeed * deltaTime;
      const movement = new THREE.Vector3()
        .addScaledVector(forward, -leftY * moveAmount)
        .addScaledVector(right, leftX * moveAmount);
      
      this.camera.position.add(movement);
    }

    // Right stick: look around
    const rightX = this.applyDeadZone(gamepad.axes[2]);
    const rightY = this.applyDeadZone(gamepad.axes[3]);
    
    if (rightX !== 0 || rightY !== 0) {
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(this.camera.quaternion);
      
      euler.y -= rightX * this.sensitivity * deltaTime;
      euler.x -= rightY * this.sensitivity * deltaTime;
      
      // Constrain pitch
      euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x));
      
      this.camera.quaternion.setFromEuler(euler);
    }

    // Triggers: move up/down
    const leftTrigger = gamepad.buttons[6]?.value || 0;
    const rightTrigger = gamepad.buttons[7]?.value || 0;
    
    if (leftTrigger > 0.1 || rightTrigger > 0.1) {
      const verticalMovement = (rightTrigger - leftTrigger) * this.moveSpeed * deltaTime;
      this.camera.position.y += verticalMovement;
    }
  }

  private handleButtons(gamepad: Gamepad) {
    // Button mappings (standard gamepad)
    // A button (0): toggle camera mode
    if (gamepad.buttons[0]?.pressed) {
      if (!this.buttonStates[0]) {
        this.toggleCameraMode();
        this.buttonStates[0] = true;
      }
    } else {
      this.buttonStates[0] = false;
    }

    // B button (1): reset camera
    if (gamepad.buttons[1]?.pressed) {
      if (!this.buttonStates[1]) {
        this.resetCamera();
        this.buttonStates[1] = true;
      }
    } else {
      this.buttonStates[1] = false;
    }

    // Y button (3): toggle gamepad enabled
    if (gamepad.buttons[3]?.pressed) {
      if (!this.buttonStates[3]) {
        this.toggleEnabled();
        this.buttonStates[3] = true;
      }
    } else {
      this.buttonStates[3] = false;
    }
  }

  private buttonStates: boolean[] = new Array(16).fill(false);

  private toggleCameraMode() {
    this.mode = this.mode === 'orbit' ? 'freeLook' : 'orbit';
    this.showGamepadStatus(`Camera mode: ${this.mode}`);
    
    if (this.mode === 'orbit') {
      this.controls.enabled = true;
    } else {
      this.controls.enabled = false;
    }
  }

  private resetCamera() {
    if (this.mode === 'orbit') {
      this.camera.position.set(1.5, 1.5, -3);
      this.controls.target.set(-0.3, 0.15, 0);
      this.controls.update();
    } else {
      this.camera.position.set(1.5, 1.5, -3);
      this.camera.lookAt(-0.3, 0.15, 0);
    }
    this.showGamepadStatus('Camera reset');
  }

  private toggleEnabled() {
    this.isEnabled = !this.isEnabled;
    this.showGamepadStatus(`Gamepad camera: ${this.isEnabled ? 'enabled' : 'disabled'}`);
    
    if (!this.isEnabled && this.mode === 'freeLook') {
      // Re-enable orbit controls when disabling gamepad in free look mode
      this.controls.enabled = true;
    }
  }

  private startGamepadLoop() {
    let lastTime = performance.now();

    const update = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      if (this.isEnabled && this.gamepadIndex !== null) {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[this.gamepadIndex];
        
        if (gamepad) {
          this.handleButtons(gamepad);
          
          if (this.mode === 'orbit') {
            this.updateOrbitMode(gamepad, deltaTime);
          } else {
            this.updateFreeLookMode(gamepad, deltaTime);
          }
        }
      }

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  // Public API
  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public setSensitivity(sensitivity: number) {
    this.sensitivity = sensitivity;
  }

  public setMoveSpeed(speed: number) {
    this.moveSpeed = speed;
  }

  public getMode(): string {
    return this.mode;
  }

  public isGamepadConnected(): boolean {
    return this.isConnected;
  }
} 