import { prefs } from '../../core/preferences';

export interface ViewToggleState {
  grid: boolean;
  riggedModel: boolean;
  vectorArms: boolean;
}

export interface ViewControlsState extends ViewToggleState {
  surfaceColor: string;
}

// Load saved view state from localStorage, with defaults
function loadViewState(): ViewToggleState {
  const saved = localStorage.getItem('viewControlsState');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        grid: parsed.grid !== undefined ? parsed.grid : true,
        riggedModel: parsed.riggedModel !== undefined ? parsed.riggedModel : true,
        vectorArms: parsed.vectorArms !== undefined ? parsed.vectorArms : true
      };
    } catch (e) {
      console.warn('Failed to parse saved view state, using defaults');
    }
  }
  
  // Default values
  return {
    grid: true,
    riggedModel: true,
    vectorArms: true
  };
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
    this.state = {
      ...savedToggleState,
      surfaceColor: prefs.meshSurface
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
      vectorArms: this.state.vectorArms
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
    colorInput.value = this.state.surfaceColor;
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
      this.state.surfaceColor = target.value;
      
      // Dispatch event for instant visual update (no save)
      this.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: target.value, save: false }
      }));
      
      // Also dispatch globally for other components
      document.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: target.value, save: false }
      }));
    });

    colorInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.state.surfaceColor = target.value;
      
      // Dispatch event for final save when picker closes
      this.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: target.value, save: true }
      }));
      
      // Also dispatch globally for other components
      document.dispatchEvent(new CustomEvent('colorChange', {
        detail: { color: target.value, save: true }
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
      this.createToggleButton('Toggle Vectors', 'vectorArms', '↑')
    ];

    buttons.forEach(button => {
      this.container.appendChild(button);
    });

    // Add color picker
    this.container.appendChild(this.createColorPicker());
  }

  public mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
    
    // Dispatch initial state events so scene manager applies saved settings
    this.dispatchInitialState();
  }

  private dispatchInitialState(): void {
    // Dispatch events for each toggle state so scene manager applies them
    (['grid', 'riggedModel', 'vectorArms'] as const).forEach(key => {
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

  public setState(newState: Partial<ViewControlsState>): void {
    Object.assign(this.state, newState);
    this.render();
  }

  public destroy(): void {
    this.unmount();
    console.log('ViewControls destroyed');
  }
} 