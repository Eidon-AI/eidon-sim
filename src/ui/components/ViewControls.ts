import { prefs } from '../../core/preferences';
import { UserApiManager } from '../../core/UserApiManager';
import { AuthManager } from '../../core/AuthManager';
import styles from './styles/ViewControls.module.css';

export interface ViewToggleState {
  grid: boolean;
  riggedModel: boolean;
  vectorArms: boolean;
  multipleModels: boolean;
}

export interface ViewControlsState extends ViewToggleState {
  symColor: string;
}

// Helper function to ensure hex color is in full 6-digit format
function normalizeHexColor(color: string): string {
  if (!color || !color.startsWith('#')) {
    return '#ffff00'; // Default yellow
  }

  // Convert 3-digit hex to 6-digit hex
  if (color.length === 4) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }

  // Return as-is if already 6-digit or invalid
  return color.length === 7 ? color : '#ffff00';
}

// Load saved view state from localStorage, with defaults
function loadViewState(): ViewToggleState {
  const saved = localStorage.getItem('viewControlsState');
  
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const result = {
        grid: parsed.grid !== undefined ? parsed.grid : true,
        riggedModel: parsed.riggedModel !== undefined ? parsed.riggedModel : true,
        vectorArms: parsed.vectorArms !== undefined ? parsed.vectorArms : true,
        multipleModels: parsed.multipleModels !== undefined ? parsed.multipleModels : false
      };
      return result;
    } catch (e) {
      console.warn('Failed to parse saved view state, using defaults');
    }
  }
  
  // Default values
  const defaults = {
    grid: true,
    riggedModel: true,
    vectorArms: true,
    multipleModels: false
  };
  return defaults;
}

// Save view state to localStorage
function saveViewState(state: ViewToggleState): void {
  localStorage.setItem('viewControlsState', JSON.stringify(state));
}

export class ViewControls extends EventTarget {
  private container: HTMLElement;
  private state: ViewControlsState;

  constructor() {
    super();

    // Load saved state or use defaults
    const savedToggleState = loadViewState();

    // Get symColor from profile/preferences
    const symColor = normalizeHexColor(prefs.symColor || '#E93570');

    this.state = {
      ...savedToggleState,
      symColor: symColor
    };

    this.container = this.createContainer();
    this.render();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = styles.container;
    return container;
  }

  private createToggleButton(
    label: string, 
    key: keyof ViewToggleState, 
    icon: string
  ): HTMLElement {
    const button = document.createElement('button');
    button.className = `${styles.toggleButton} ${this.state[key] ? styles.active : styles.inactive}`;
    
    button.innerHTML = icon;
    button.title = label; // Native browser tooltip

    button.addEventListener('click', () => {
      this.toggleState(key);
    });

    return button;
  }

  private toggleState(key: keyof ViewToggleState): void {
    this.state[key] = !this.state[key];
    this.render();
    
    // Save the toggle state to localStorage
    saveViewState({
      grid: this.state.grid,
      riggedModel: this.state.riggedModel,
      vectorArms: this.state.vectorArms,
      multipleModels: this.state.multipleModels
    });
    
    // Dispatch event for scene manager to handle
    this.dispatchEvent(new CustomEvent('viewToggle', {
      detail: { type: key, enabled: this.state[key] }
    }));
  }

  private createColorPicker(): HTMLElement {
    const container = document.createElement('div');
    container.className = styles.colorPickerContainer;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    // Ensure the color value is properly normalized
    colorInput.value = normalizeHexColor(this.state.symColor);
    colorInput.className = styles.colorInput;
    colorInput.title = 'Sym Color';

    // Style the color input to look like a color swatch
    colorInput.style.cssText = `
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      background-color: transparent;
      border: none;
      cursor: pointer;
    `;

    colorInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const normalizedColor = normalizeHexColor(target.value);
      this.state.symColor = normalizedColor;
      
      // Update preferences optimistically
      prefs.symColor = normalizedColor;
      
      // Dispatch event for instant visual update (no save)
      this.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: normalizedColor, save: false }
      }));
      
      // Also dispatch globally for other components
      document.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: normalizedColor, save: false }
      }));
    });

    colorInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const normalizedColor = normalizeHexColor(target.value);
      this.state.symColor = normalizedColor;
      
      // Update preferences optimistically
      prefs.symColor = normalizedColor;
      
      // Dispatch event for final save when picker closes
      this.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: normalizedColor, save: true }
      }));
      
      // Also dispatch globally for other components
      document.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: normalizedColor, save: true }
      }));
      
      // Save to backend
      this.saveSymColorToBackend(normalizedColor);
    });

    container.appendChild(colorInput);
    return container;
  }

  private async saveSymColorToBackend(color: string): Promise<void> {
    try {
      // Get auth tokens
      const authManager = AuthManager.getInstance();
      const tokens = authManager.getTokens();
      
      if (!tokens) {
        console.log('User not authenticated, skipping backend save');
        return;
      }

      // Use UserApiManager to update profile
      const userApiManager = UserApiManager.getInstance();
      await userApiManager.updateProfile({ symColor: color }, tokens);
      
      console.log('SymColor saved to backend:', color);
    } catch (error) {
      console.error('Failed to save symColor to backend:', error);
    }
  }

  public updateSymColor(color: string): void {
    const normalizedColor = normalizeHexColor(color);
    this.state.symColor = normalizedColor;
    
    // Update the color picker input if it exists
    const colorInput = this.container.querySelector(`.${styles.colorInput}`) as HTMLInputElement;
    if (colorInput) {
      colorInput.value = normalizedColor;
    }
  }

  private render(): void {
    this.container.innerHTML = '';

    // Add toggle buttons (vertical layout)
    const buttons = [
      this.createToggleButton('Toggle Grid', 'grid', '⊞'),
      this.createToggleButton('Toggle Skeleton', 'riggedModel', '🦴'),
      this.createToggleButton('Toggle Vectors', 'vectorArms', '↑'),
      this.createToggleButton('Toggle Multiple Models', 'multipleModels', '👥')
    ];

    buttons.forEach(button => {
      this.container.appendChild(button);
    });

    // Add color picker
    this.container.appendChild(this.createColorPicker());
  }

  public mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  public applyInitialState(): void {
    // Dispatch events for each toggle state so scene manager applies them
    (['grid', 'riggedModel', 'vectorArms', 'multipleModels'] as const).forEach(key => {
      this.dispatchEvent(new CustomEvent('viewToggle', {
        detail: { type: key, enabled: this.state[key] }
      }));
    });
  }

  public unmount(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  public getState(): ViewControlsState {
    return { ...this.state };
  }

  public getInitialRiggedModelState(): boolean {
    return this.state.riggedModel;
  }

  public setState(newState: Partial<ViewControlsState>): void {
    Object.assign(this.state, newState);
    this.render();
  }

  public destroy(): void {
    this.unmount();
  }
} 