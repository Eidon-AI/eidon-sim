import { prefs } from '../../core/preferences';

export interface ViewToggleState {
  grid: boolean;
  riggedModel: boolean;
  vectorArms: boolean;
  multipleModels: boolean;
}

export interface ViewControlsState extends ViewToggleState {
  surfaceColor: string;
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

    // Ensure we have a valid hex color for the surface
    const surfaceColor = normalizeHexColor(prefs.meshSurface);

    this.state = {
      ...savedToggleState,
      surfaceColor: surfaceColor
    };

    this.container = this.createContainer();
    this.render();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `
      fixed bottom-0 left-0 z-40
      bg-neutral-800/95
      flex flex-col
    `;
    return container;
  }

  private createToggleButton(
    label: string, 
    key: keyof ViewToggleState, 
    icon: string
  ): HTMLElement {
    const button = document.createElement('button');
    button.className = `
      flex items-center justify-center w-10 h-10 text-base font-medium
      transition-all duration-200
      ${this.state[key] 
        ? 'bg-neutral-800 text-white hover:bg-neutral-700 hover:text-neutral-200' 
        : 'bg-neutral-900 text-white opacity-30 hover:bg-neutral-800 hover:opacity-50'
      }
    `;
    
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
    container.className = `
      flex items-center justify-center w-10 h-10
      bg-neutral-800 hover:bg-neutral-700
      transition-all duration-200
      relative group
    `;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    // Ensure the color value is properly normalized
    colorInput.value = normalizeHexColor(this.state.surfaceColor);
    colorInput.className = `
      w-6 h-6 rounded border-0 cursor-pointer
      appearance-none bg-transparent
    `;
    colorInput.title = 'Surface Color';

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
      this.state.surfaceColor = normalizedColor;
      
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
      this.state.surfaceColor = normalizedColor;
      
      // Dispatch event for final save when picker closes
      this.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: normalizedColor, save: true }
      }));
      
      // Also dispatch globally for other components
      document.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: normalizedColor, save: true }
      }));
    });

    container.appendChild(colorInput);
    return container;
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