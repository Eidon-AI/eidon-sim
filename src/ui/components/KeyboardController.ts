import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface CameraPosition {
  position: [number, number, number];
  target: [number, number, number];
}

// CAD-style camera views mapped to number keys
const KEYBOARD_VIEWS: Record<string, CameraPosition> = {
  '1': { // Front view
    position: [0, 0, -5.5],
    target: [0, 0, 0]
  },
  '2': { // Back view
    position: [0, 0, 5.5],
    target: [0, 0, 0]
  },
  '3': { // Right view
    position: [5.5, 0, 0],
    target: [0, 0, 0]
  },
  '4': { // Left view
    position: [-5.5, 0, 0],
    target: [0, 0, 0]
  },
  '5': { // Top view
    position: [0, 5.5, 0],
    target: [0, 0, -0.2]
  },
  '6': { // Bottom view
    position: [0, -5.5, 0],
    target: [0, 0, -0.2]
  },
  '7': { // Isometric view 1
    position: [3, 3, 3],
    target: [0, 0, 0]
  },
  '8': { // Isometric view 2
    position: [-3, 3, -3],
    target: [0, 0, 0]
  },
  '9': { // Default perspective (reset)
    position: [1.5, 1.5, -3],
    target: [-0.1, 0.15, 0]
  }
};

const VIEW_NAMES: Record<string, string> = {
  '1': 'Front View',
  '2': 'Back View',
  '3': 'Right View',
  '4': 'Left View',
  '5': 'Top View',
  '6': 'Bottom View',
  '7': 'Isometric View',
  '8': 'Isometric View 2',
  '9': 'Default View'
};

export class KeyboardController {
  private onViewChange: (view: CameraPosition) => void;
  private boundKeyHandler: (e: KeyboardEvent) => void;
  private boundKeyUpHandler: (e: KeyboardEvent) => void;
  private boundBlurHandler: () => void;
  private isEnabled: boolean = true;
  
  // FPS-style movement
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private keys: Set<string> = new Set();
  private moveSpeed: number = 0.02;
  private zoomSpeed: number = 0.1;
  private rotationSpeed: number = 0.02;
  private speedBoostMultiplier: number = 3.0; // 3x speed when holding shift
  private animationId: number | null = null;
  private isMoving: boolean = false;

  constructor(onViewChange: (view: CameraPosition) => void, camera?: THREE.PerspectiveCamera, controls?: OrbitControls) {
    this.onViewChange = onViewChange;
    this.camera = camera || null;
    this.controls = controls || null;
    
    this.boundKeyHandler = this.handleKeyPress.bind(this);
    this.boundKeyUpHandler = this.handleKeyUp.bind(this);
    this.boundBlurHandler = () => {
      this.keys.clear();
      this.isMoving = false;
    };
    
    // Listen for keydown and keyup events
    document.addEventListener('keydown', this.boundKeyHandler);
    document.addEventListener('keyup', this.boundKeyUpHandler);
    
    // Clear stuck keys when window loses focus (prevents Command+W and similar issues)
    window.addEventListener('blur', this.boundBlurHandler);
    
    console.log('KeyboardController: Number keys 1-9 mapped to camera views');
    console.log('KeyboardController: WASD for movement, +/- for zoom');
    this.showConsoleHelp();
    
    // Start movement loop
    this.startMovementLoop();
  }

  private handleKeyPress(event: KeyboardEvent): void {
    // Only handle number keys and only when no input elements are focused
    if (!this.isEnabled) return;
    
    // Ignore all keyboard controls when modifier keys are held (for browser shortcuts)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    
    // Don't trigger if user is typing in an input field
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      (activeElement instanceof HTMLElement && activeElement.contentEditable === 'true')
    )) {
      return;
    }

    const key = event.key;
    
    // Handle number keys 1-9
    if (KEYBOARD_VIEWS[key]) {
      event.preventDefault(); // Prevent any default browser behavior
      
      const view = KEYBOARD_VIEWS[key];
      const viewName = VIEW_NAMES[key];
      
      console.log(`KeyboardController: Switching to ${viewName} (${key})`);
      this.onViewChange(view);
      
      // Show brief visual feedback
      this.showViewFeedback(viewName);
    }
    
    // Handle 'H' key for help
    else if (key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.showHelp();
    }
    
    // Handle FPS-style movement keys
    else if (['w', 'a', 's', 'd', 'q', 'e', '+', '=', '-', '_', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key.toLowerCase())) {
      event.preventDefault();
      this.keys.add(key.toLowerCase());
      this.isMoving = true;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.isEnabled) return;
    
    // Ignore all keyboard controls when modifier keys are held (for browser shortcuts)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (this.keys.has(key)) {
      this.keys.delete(key);
      
      // Stop movement if no more movement keys are pressed
      if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some(k => this.keys.has(k))) {
        this.isMoving = false;
      }
    }
  }

  private showViewFeedback(viewName: string): void {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.className = 'fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg z-50 pointer-events-none';
    feedback.textContent = `📹 ${viewName}`;
    
    document.body.appendChild(feedback);
    
    // Fade out and remove after 1.5 seconds
    setTimeout(() => {
      feedback.style.transition = 'opacity 0.5s ease-out';
      feedback.style.opacity = '0';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 500);
    }, 1000);
  }

  private showConsoleHelp(): void {
    console.log('⌨ Keyboard Camera Controls:');
    console.log('1️⃣ Front View    2️⃣ Back View     3️⃣ Right View');
    console.log('4️⃣ Left View     5️⃣ Top View      6️⃣ Bottom View');
    console.log('7️⃣ Isometric     8️⃣ Isometric 2   9️⃣ Default View');
    console.log('🎮 FPS Controls: WASD = Move, Q/E = Forward/Back, +/- = Zoom');
    console.log('🔄 Rotation: Arrow Keys = Look Around');
    console.log('⚡ Speed Boost: Hold Shift for 3x speed');
    console.log('H - Show this help');
  }

  private showHelp(): void {
    this.showConsoleHelp();
    
    // Show visual overlay
    this.showHelpOverlay();
  }

  private showHelpOverlay(): void {
    // Remove existing overlay if present
    const existingOverlay = document.getElementById('keyboard-help-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'keyboard-help-overlay';
    overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
    overlay.innerHTML = `
      <div class="bg-neutral-800 p-6 rounded-lg shadow-2xl max-w-md">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold text-white">⌨ Keyboard Camera Controls</h3>
          <button id="close-help" class="text-neutral-400 hover:text-white text-xl">✕</button>
        </div>
        <div class="grid grid-cols-3 gap-3 text-sm text-white">
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">1</div>
            <div>Front View</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">2</div>
            <div>Back View</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">3</div>
            <div>Right View</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">4</div>
            <div>Left View</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">5</div>
            <div>Top View</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">6</div>
            <div>Bottom View</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">7</div>
            <div>Isometric</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">8</div>
            <div>Isometric 2</div>
          </div>
          <div class="text-center p-2 bg-neutral-700 rounded">
            <div class="font-bold text-blue-400">9</div>
            <div>Default View</div>
          </div>
        </div>
        <div class="mt-4 text-center text-sm text-neutral-400">
          Press <span class="font-bold text-white">H</span> again to close • Press <span class="font-bold text-white">ESC</span> to close
        </div>
        <div class="mt-4 pt-4 border-t border-neutral-600">
          <div class="text-center text-sm font-bold text-green-400 mb-2">🎮 FPS Controls</div>
          <div class="grid grid-cols-2 gap-2 text-xs text-neutral-300">
            <div><span class="font-bold text-white">WASD</span> - Move</div>
            <div><span class="font-bold text-white">Q/E</span> - Forward/Back</div>
            <div><span class="font-bold text-white">+/-</span> - Zoom</div>
            <div><span class="font-bold text-white">↑↓←→</span> - Look Around</div>
            <div colspan="2"><span class="text-neutral-400">Hold keys for smooth movement</span></div>
          </div>
          <div class="mt-2 text-center text-xs">
            <span class="font-bold text-yellow-400">⚡ Shift</span> - <span class="text-neutral-300">Speed Boost (3x)</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = overlay.querySelector('#close-help') as HTMLButtonElement;
    const closeHandler = () => overlay.remove();
    
    closeBtn.onclick = closeHandler;
    overlay.onclick = (e) => {
      if (e.target === overlay) closeHandler();
    };

    // ESC key handler
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeHandler();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`KeyboardController: ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  public isKeyboardEnabled(): boolean {
    return this.isEnabled;
  }

  public getAvailableViews(): Record<string, string> {
    return { ...VIEW_NAMES };
  }

  public destroy(): void {
    // Stop movement loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Clear any active keys
    this.keys.clear();
    this.isMoving = false;
    
    // Clean up event listeners
    document.removeEventListener('keydown', this.boundKeyHandler);
    document.removeEventListener('keyup', this.boundKeyUpHandler);
    window.removeEventListener('blur', this.boundBlurHandler);
    
    console.log('KeyboardController destroyed');
  }

  private startMovementLoop(): void {
    const update = () => {
      if (this.isMoving && this.camera && this.controls) {
        this.updateMovement();
      }
      this.animationId = requestAnimationFrame(update);
    };
    update();
  }

  private updateMovement(): void {
    if (!this.camera || !this.controls) return;
    
    let moved = false;
    
    // Calculate speed based on whether shift is held
    const currentMoveSpeed = this.getCurrentMoveSpeed();
    const currentRotationSpeed = this.getCurrentRotationSpeed();
    const currentZoomSpeed = this.getCurrentZoomSpeed();
    
    // Get camera direction vectors
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    const right = new THREE.Vector3();
    right.crossVectors(direction, this.camera.up).normalize();
    
    const up = new THREE.Vector3(0, 1, 0);
    
    // Handle movement
    if (this.keys.has('w')) {
      // Move up
      this.camera.position.addScaledVector(up, currentMoveSpeed);
      this.controls.target.addScaledVector(up, currentMoveSpeed);
      moved = true;
    }
    if (this.keys.has('s')) {
      // Move down
      this.camera.position.addScaledVector(up, -currentMoveSpeed);
      this.controls.target.addScaledVector(up, -currentMoveSpeed);
      moved = true;
    }
    if (this.keys.has('a')) {
      // Strafe left
      this.camera.position.addScaledVector(right, -currentMoveSpeed);
      this.controls.target.addScaledVector(right, -currentMoveSpeed);
      moved = true;
    }
    if (this.keys.has('d')) {
      // Strafe right
      this.camera.position.addScaledVector(right, currentMoveSpeed);
      this.controls.target.addScaledVector(right, currentMoveSpeed);
      moved = true;
    }
    if (this.keys.has('q')) {
      // Move forward
      this.camera.position.addScaledVector(direction, -currentZoomSpeed);
      this.controls.target.addScaledVector(direction, -currentZoomSpeed);
      moved = true;
    }
    if (this.keys.has('e')) {
      // Move backward  
      this.camera.position.addScaledVector(direction, currentZoomSpeed);
      this.controls.target.addScaledVector(direction, currentZoomSpeed);
      moved = true;
    }
    
    // Handle rotation (look around)
    if (this.keys.has('arrowup')) {
      // Look up
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(this.camera.position.clone().sub(this.controls.target));
      spherical.phi -= currentRotationSpeed;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi)); // Constrain vertical rotation
      this.camera.position.setFromSpherical(spherical).add(this.controls.target);
      moved = true;
    }
    if (this.keys.has('arrowdown')) {
      // Look down
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(this.camera.position.clone().sub(this.controls.target));
      spherical.phi += currentRotationSpeed;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi)); // Constrain vertical rotation
      this.camera.position.setFromSpherical(spherical).add(this.controls.target);
      moved = true;
    }
    if (this.keys.has('arrowleft')) {
      // Look right
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(this.camera.position.clone().sub(this.controls.target));
      spherical.theta += currentRotationSpeed;
      this.camera.position.setFromSpherical(spherical).add(this.controls.target);
      moved = true;
    }
    if (this.keys.has('arrowright')) {
      // Look left
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(this.camera.position.clone().sub(this.controls.target));
      spherical.theta -= currentRotationSpeed;
      this.camera.position.setFromSpherical(spherical).add(this.controls.target);
      moved = true;
    }
    
    // Handle zoom
    if (this.keys.has('+') || this.keys.has('=')) {
      // Zoom in
      const zoomDirection = new THREE.Vector3();
      zoomDirection.subVectors(this.controls.target, this.camera.position).normalize();
      this.camera.position.addScaledVector(zoomDirection, currentZoomSpeed);
      moved = true;
    }
    if (this.keys.has('-') || this.keys.has('_')) {
      // Zoom out
      const zoomDirection = new THREE.Vector3();
      zoomDirection.subVectors(this.controls.target, this.camera.position).normalize();
      this.camera.position.addScaledVector(zoomDirection, -currentZoomSpeed);
      moved = true;
    }
    
    if (moved) {
      this.controls.update();
    }
  }

  private getCurrentMoveSpeed(): number {
    return this.keys.has('shift') ? this.moveSpeed * this.speedBoostMultiplier : this.moveSpeed;
  }

  private getCurrentRotationSpeed(): number {
    return this.keys.has('shift') ? this.rotationSpeed * this.speedBoostMultiplier : this.rotationSpeed;
  }

  private getCurrentZoomSpeed(): number {
    return this.keys.has('shift') ? this.zoomSpeed * this.speedBoostMultiplier : this.zoomSpeed;
  }
} 