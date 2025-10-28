// src/ui/components/Sidebar.ts
import { ArmSolver } from '../../core/ArmSolver';
import { mountAnglePanel } from './AnglePanel';
import styles from './styles/Sidebar.module.css';

export class Sidebar {
  private container: HTMLElement;
  private sidebar: HTMLElement;
  private isExpanded: boolean = false;
  private logElement: HTMLPreElement | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.innerHTML = `
      <div class="${styles.sidebar}">
        <div class="${styles.sidebarHeader}">
          <div class="${styles.headerLeft}">
            <h3 class="${styles.title}">
              📐 Actuator Angles
            </h3>
            <div class="${styles.colorIndicator}">
              <span class="${styles.colorDot}" style="background-color: #ff69b4;"></span>
              <span class="${styles.colorLabel}">Forward Vector</span>
              <span class="${styles.colorDot}" style="background-color: #00ff00;"></span>
              <span class="${styles.colorLabel}">Up Vector</span>
            </div>
          </div>
          <button class="${styles.sidebarToggle}" data-sidebar-toggle>
            <i class="fas fa-chevron-up"></i>
          </button>
        </div>
        <div class="${styles.sidebarContent}">
          <pre id="sidebar-log" class="${styles.log}"></pre>
        </div>
      </div>
    `;
    
    this.sidebar = this.container.querySelector(`.${styles.sidebar}`) as HTMLElement;
    const toggleBtn = this.sidebar.querySelector('[data-sidebar-toggle]') as HTMLButtonElement;
    this.logElement = this.container.querySelector('#sidebar-log') as HTMLPreElement;
    
    this.setupToggle(toggleBtn);
  }

  private setupToggle(toggleBtn: HTMLButtonElement): void {
    toggleBtn.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
      
      if (this.isExpanded) {
        this.sidebar.classList.add(styles.expanded);
      } else {
        this.sidebar.classList.remove(styles.expanded);
      }
    });
  }

  public mount(parent: HTMLElement, solver: ArmSolver): void {
    parent.appendChild(this.container);
    
    // Mount angle panel into the sidebar content
    const sidebarContent = this.sidebar.querySelector(`.${styles.sidebarContent}`) as HTMLElement;
    mountAnglePanel(sidebarContent, solver);
  }

  public getLogElement(): HTMLPreElement | null {
    return this.logElement;
  }

  public unmount(): void {
    this.container.remove();
  }
}

