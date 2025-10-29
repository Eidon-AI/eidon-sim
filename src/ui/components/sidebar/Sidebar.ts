// src/ui/components/sidebar/Sidebar.ts
import { ArmSolver } from '../../../core/ArmSolver';
import { DeviceStore } from '../../../core/DeviceStore';
import { EidonTrackerManager } from '../../../core/EidonTrackerManager';
import { ActuatorAnglesSection } from './ActuatorAnglesSection';
import { DeviceListSection } from './DeviceListSection';
import styles from './styles/Sidebar.module.css';

export class Sidebar {
  private container: HTMLElement;
  private sidebar: HTMLElement;
  private content: HTMLElement;
  private isExpanded: boolean = false; // Default collapsed
  private actuatorSection: ActuatorAnglesSection | null = null;
  private deviceListSection: DeviceListSection | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = styles.container;
    
    this.sidebar = document.createElement('div');
    this.sidebar.className = styles.sidebar;
    
    this.sidebar.innerHTML = `
      <div class="${styles.sidebarHeader}">
      <i class="fas fa-chevron-up ${styles.mainChevron}"></i>
      </div>
      <div class="${styles.sidebarContent}">
      </div>
    `;
    
    this.content = this.sidebar.querySelector(`.${styles.sidebarContent}`) as HTMLElement;
    
    const header = this.sidebar.querySelector(`.${styles.sidebarHeader}`) as HTMLElement;
    
    // Header click toggles expand/collapse
    header.addEventListener('click', () => this.toggle());
    
    this.container.appendChild(this.sidebar);
    this.updateExpandedState();
  }

  private updateExpandedState(): void {
    if (this.isExpanded) {
      this.sidebar.classList.add(styles.expanded);
      this.content.style.display = '';
    } else {
      this.sidebar.classList.remove(styles.expanded);
      this.content.style.display = 'none';
    }
  }

  public toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.updateExpandedState();
  }

  public mount(parent: HTMLElement, solver: ArmSolver, store: DeviceStore, trackerManager?: EidonTrackerManager): void {
    parent.appendChild(this.container);
    
    // Mount actuator angles section
    this.actuatorSection = new ActuatorAnglesSection();
    this.actuatorSection.mount(this.content, solver);
    
    // Mount device list section
    this.deviceListSection = new DeviceListSection(store, trackerManager);
    this.deviceListSection.mount(this.content);
  }

  public unmount(): void {
    if (this.actuatorSection) {
      this.actuatorSection.unmount();
    }
    if (this.deviceListSection) {
      this.deviceListSection.unmount();
    }
    this.container.remove();
  }
}
