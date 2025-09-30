import { createEidonIcon } from './EidonIcon';
import { prefs } from '../../core/preferences';

export class IconOverlay {
  private container: HTMLDivElement;
  private icon!: SVGElement;
  private titleElement!: HTMLDivElement;
  private boundUpdateIcon: () => void;
  private boundColorChange: (e: Event) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.top = '20px';
    this.container.style.left = '20px';
    this.container.style.opacity = '9';
    this.container.style.pointerEvents = 'none';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '12px';
    this.container.className = 'z-5';

    // Create initial icon and title
    this.updateIcon();
    this.createTitle();

    // Store bound function references for cleanup
    this.boundUpdateIcon = () => this.updateIcon();
    this.boundColorChange = (e: Event) => {
      const { color } = (e as CustomEvent).detail;
      this.updateIconColor(color);
    };

    // Listen for preference changes to update the icon color
    document.addEventListener('prefsChanged', this.boundUpdateIcon);
    
    // Listen for direct color changes for instant feedback during dragging
    document.addEventListener('colorChange', this.boundColorChange);
  }

  private updateIcon(): void {
    // Remove the old icon if it exists
    if (this.icon && this.container.contains(this.icon)) {
      this.container.removeChild(this.icon);
    }
    
    // Create a new icon with updated preferences
    this.icon = createEidonIcon({ size: 64 });
    this.container.insertBefore(this.icon, this.titleElement);
  }

  private createTitle(): void {
    this.titleElement = document.createElement('div');
    this.titleElement.textContent = 'Eidon Sym';
    this.titleElement.style.fontFamily = 'var(--font-wallpoet)';
    this.titleElement.style.fontSize = '24px';
    this.titleElement.style.fontWeight = '400';
    this.titleElement.style.color = prefs.meshSurface;
    this.titleElement.style.textShadow = 'var(--text-shadow)';
    this.titleElement.style.letterSpacing = '1px';
    this.container.appendChild(this.titleElement);
  }

  private updateIconColor(color: string): void {
    // The logo color is controlled by the last path element (index 5) 
    // which uses colors[5] for fill and prefs.meshSurface for stroke
    const paths = this.icon.querySelectorAll('path');
    if (paths.length > 5) {
      const mainPath = paths[5]; // The last path (index 5)
      mainPath.setAttribute('fill', color);
      mainPath.setAttribute('stroke', color);
    }
    
    // Update the title color as well
    if (this.titleElement) {
      this.titleElement.style.color = color;
    }
  }

  mount() {
    document.body.appendChild(this.container);
  }

  unmount() {
    // Clean up event listeners
    document.removeEventListener('prefsChanged', this.boundUpdateIcon);
    document.removeEventListener('colorChange', this.boundColorChange);
    
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
} 