// src/ui/components/sidebar/Sidebar.ts
import { ArmSolver } from '../../../core/ArmSolver';
import { DeviceStore } from '../../../core/DeviceStore';
import { EidonTrackerManager } from '../../../core/EidonTrackerManager';
import { ActuatorAnglesSection } from './ActuatorAnglesSection';
import { DeviceListSection } from './DeviceListSection';
import { prefs, savePrefs } from '../../../core/preferences';
import styles from './styles/Sidebar.module.css';

export class Sidebar {
  private container: HTMLElement;
  private sidebar: HTMLElement;
  private content: HTMLElement;
  private angleModeButton: HTMLElement | null = null;
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
    
    // Create angle mode toggle button
    this.createAngleModeButton();
    
    this.container.appendChild(this.sidebar);
    this.updateExpandedState();
  }

  private createAngleModeButton(): void {
    const button = document.createElement('button');
    button.className = styles.angleModeButton;
    this.angleModeButton = button;
    this.updateAngleModeButton();
    
    button.addEventListener('click', () => {
      // Toggle the preference
      prefs.useActuatorAngles = !prefs.useActuatorAngles;
      
      // Save to localStorage
      savePrefs();
      
      // Dispatch event for SkeletalRig to listen
      document.dispatchEvent(new CustomEvent('angleModeChanged', {
        detail: { useActuatorAngles: prefs.useActuatorAngles }
      }));
      
      // Update button UI
      this.updateAngleModeButton();
    });
    
    // Insert button at the beginning of sidebar content
    this.content.insertBefore(button, this.content.firstChild);
  }

  private updateAngleModeButton(): void {
    if (!this.angleModeButton) return;
    
    const isActuatorMode = prefs.useActuatorAngles || false;
    
    this.angleModeButton.innerHTML = `
      <i class="fas ${isActuatorMode ? 'fa-calculator' : 'fa-cube'}"></i>
      <span>${isActuatorMode ? 'Actuator Mode' : 'Quaternion Mode'}</span>
    `;
    
    this.angleModeButton.className = isActuatorMode 
      ? `${styles.angleModeButton} ${styles.active}`
      : styles.angleModeButton;
    
    this.angleModeButton.title = isActuatorMode 
      ? 'Switch to Quaternion Mode (Smooth)' 
      : 'Switch to Actuator Mode (Validation)';
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
    
    // Mount device list section - need DeviceConnectionStateManager
    // Get it from global scope (created in App.ts)
    const deviceConnectionStateManager = (window as any).deviceConnectionStateManager as any;
    if (!deviceConnectionStateManager) {
      console.warn('[Sidebar] DeviceConnectionStateManager not found, connection count will not be shown');
    }
    this.deviceListSection = new DeviceListSection(store, trackerManager, deviceConnectionStateManager);
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
