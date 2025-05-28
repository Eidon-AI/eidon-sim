import { createEidonIcon } from './EidonIcon';

export class IconOverlay {
  private container: HTMLDivElement;
  private icon: SVGElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.top = '20px';
    this.container.style.left = '20px';
    this.container.style.opacity = '9';
    this.container.style.pointerEvents = 'none';
    this.container.className = 'z-5';

    this.icon = createEidonIcon({ size: 48 });
    this.container.appendChild(this.icon);
  }

  mount() {
    document.body.appendChild(this.container);
  }

  unmount() {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
} 