// src/ui/components/sidebar/DeviceListSection.ts
import { DeviceStore } from '../../../core/DeviceStore';
import { EidonTrackerManager } from '../../../core/EidonTrackerManager';
import { GloveManager } from '../../../core/GloveManager';
import { DeviceConnectionStateManager } from '../../../core/DeviceConnectionStateManager';
import { renderCard } from './DeviceCard';
import { Device, DeviceRole } from '../../../types/device';
import styles from './styles/DeviceListSection.module.css';

// Define sorting order for consistent device display
const POSITION_ORDER: Record<DeviceRole, number> = {
  [DeviceRole.ROLE_LEFT_SHOULDER]: 0,
  [DeviceRole.ROLE_LEFT_FOREARM]: 1,
  [DeviceRole.ROLE_LEFT_HAND]: 2,
  [DeviceRole.ROLE_LEFT_GLOVE]: 2,
  [DeviceRole.ROLE_RIGHT_SHOULDER]: 3,
  [DeviceRole.ROLE_RIGHT_FOREARM]: 4,
  [DeviceRole.ROLE_RIGHT_HAND]: 5,
  [DeviceRole.ROLE_RIGHT_GLOVE]: 5,
  [DeviceRole.ROLE_CHEST]: 6,
};

function sortDevices(devices: Device[]): Device[] {
  return devices.sort((a, b) => {
    return POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
  });
}

export class DeviceListSection {
  private section: HTMLElement;
  private content: HTMLElement;
  private isExpanded: boolean = true; // Default expanded
  private store: DeviceStore;
  private trackerManager?: EidonTrackerManager;
  private gloveManager?: GloveManager;
  private deviceConnectionStateManager: DeviceConnectionStateManager;
  private renderedDeviceIds = new Set<string>();
  private connectionCountIndicator: HTMLElement | null = null;

  constructor(store: DeviceStore, trackerManager: EidonTrackerManager | undefined, deviceConnectionStateManager: DeviceConnectionStateManager, gloveManager?: GloveManager) {
    this.store = store;
    this.trackerManager = trackerManager;
    this.gloveManager = gloveManager;
    this.deviceConnectionStateManager = deviceConnectionStateManager;
    
    this.section = document.createElement('div');
    this.section.className = styles.section;
    
    this.section.innerHTML = `
      <div class="${styles.sectionHeader}">
        <h4 class="${styles.sectionTitle}">
          <i class="fas fa-chevron-down ${styles.chevron}"></i>
          📱 Device List
          <span class="${styles.connectionCount}">0/7</span>
        </h4>
      </div>
      <div class="${styles.sectionContent}">
      </div>
    `;
    
    this.content = this.section.querySelector(`.${styles.sectionContent}`) as HTMLElement;
    this.connectionCountIndicator = this.section.querySelector(`.${styles.connectionCount}`) as HTMLElement;
    
    // Initialize as expanded
    this.section.classList.add(styles.expanded);
    this.content.style.display = '';
    
    const header = this.section.querySelector(`.${styles.sectionHeader}`) as HTMLElement;
    header.addEventListener('click', () => this.toggle());
    
    this.setupDeviceUpdates();
    this.setupConnectionStateUpdates();
    
    // Initial update
    this.updateConnectionCountVisibility();
  }

  private setupDeviceUpdates(): void {
    // Initial render
    this.renderDeviceList();

    // Re-render when devices are added or updated
    this.store.addEventListener('update', () => {
      this.renderDeviceList();
    });

    // Handle device removal
    document.addEventListener('deviceRemoved', (e) => {
      const { id } = (e as CustomEvent<{id: string}>).detail;
      this.renderedDeviceIds.delete(id);
      this.renderDeviceList();
    });
  }

  private setupConnectionStateUpdates(): void {
    // Listen for connection state changes
    this.deviceConnectionStateManager.addEventListener('connectionStateChanged', () => {
      this.updateConnectionCount();
    });

    // Listen for playback mode changes
    this.store.addEventListener('update', () => {
      // Check playback mode on any update (DeviceStore doesn't dispatch playback mode changes separately)
      // We'll check it in updateConnectionCountVisibility
      this.updateConnectionCountVisibility();
    });
  }

  private updateConnectionCount(): void {
    if (!this.connectionCountIndicator) return;
    
    const count = this.deviceConnectionStateManager.totalConnectedDevices;
    this.connectionCountIndicator.textContent = `${count}/7`;
  }

  private updateConnectionCountVisibility(): void {
    if (!this.connectionCountIndicator) return;
    
    // Only show connection count when NOT in playback mode
    const isPlaybackMode = this.store.isPlaybackMode();
    if (isPlaybackMode) {
      this.connectionCountIndicator.style.display = 'none';
    } else {
      this.connectionCountIndicator.style.display = '';
      this.updateConnectionCount();
    }
  }

  private renderDeviceList(): void {
    // Get all devices from the store
    const allDevices = Array.from(this.store['map'].values());
    
    // Sort devices consistently
    const sortedDevices = sortDevices(allDevices);
    
    // Check if the device list has actually changed
    const currentDeviceIds = new Set(sortedDevices.map(d => d.id));
    const deviceOrderChanged = JSON.stringify([...currentDeviceIds]) !== JSON.stringify([...this.renderedDeviceIds]);
    
    // Only re-render if devices have been added/removed or order changed
    if (this.renderedDeviceIds.size !== currentDeviceIds.size || deviceOrderChanged) {
      // Clear existing content
      this.content.innerHTML = '';
      this.renderedDeviceIds.clear();
      
      // Render devices in sorted order
      sortedDevices.forEach(device => {
        const card = renderCard(device, this.store, this.trackerManager, this.gloveManager);
        card.setAttribute('data-id', device.id);
        this.content.appendChild(card);
        this.renderedDeviceIds.add(device.id);
      });
    }
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.section);
  }

  public toggle(): void {
    this.isExpanded = !this.isExpanded;
    
    if (this.isExpanded) {
      this.section.classList.add(styles.expanded);
      this.content.style.display = '';
    } else {
      this.section.classList.remove(styles.expanded);
      this.content.style.display = 'none';
    }
  }

  public getElement(): HTMLElement {
    return this.section;
  }

  public unmount(): void {
    this.section.remove();
  }
}

