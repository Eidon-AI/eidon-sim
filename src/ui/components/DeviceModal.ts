import { EidonTrackerManager, EidonDevice } from '../../core/EidonTrackerManager';
import { DeviceRole, DEVICE_ROLE_NAMES } from '../../core/constants';
import { LoginStateManager } from '../../core/LoginStateManager';
import styles from './styles/DeviceModal.module.css';

export class DeviceModal {
  private container: HTMLElement;
  private modal: HTMLElement;
  private trackerManager: EidonTrackerManager;
  private loginStateManager: LoginStateManager;
  private isVisible = false;
  private savedDevices: EidonDevice[] = [];
  private discoveredDevices: EidonDevice[] = [];

  constructor(trackerManager: EidonTrackerManager) {
    this.trackerManager = trackerManager;
    this.loginStateManager = LoginStateManager.getInstance();
    this.container = this.createContainer();
    this.modal = this.createModal();
    this.container.appendChild(this.modal);
    
    this.setupEventListeners();
    
    // Check initial login state and apply appropriate styling
    const initialState = this.loginStateManager.getState();
    if (!initialState.isLoggedIn) {
      this.container.className = `${styles.container} ${styles.loggedOut} ${styles.modalHidden}`;
    } else {
      this.container.className = `${styles.container} ${styles.modalHidden}`;
    }
    
    this.loadSavedDevices();
    
    // Show arrow indicator by default when logged in
    this.updateArrowVisibility();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = styles.container;
    
    // Add collapsed arrow indicator
    const arrowIndicator = document.createElement('div');
    arrowIndicator.className = styles.arrowIndicator;
    arrowIndicator.innerHTML = `
      <div class="${styles.arrowContent}">
        <i class="fas fa-chevron-right ${styles.arrowIcon}"></i>
      </div>
    `;
    arrowIndicator.addEventListener('click', () => this.show());
    
    container.appendChild(arrowIndicator);
    return container;
  }

  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = styles.modal;
    
    modal.innerHTML = `
      <div class="${styles.content}">
        <!-- Header with close button -->
        <div class="${styles.header}">
          <button class="${styles.closeButton}">&times;</button>
        </div>

        <!-- Saved Devices Section -->
        <div class="${styles.body}">
          <div class="${styles.section}">
            <div class="${styles.sectionHeader}">
              <h3 class="${styles.title} saved-devices-title">Saved Devices</h3>
              <button class="${styles.connectAllBtn}">
                <i class="fas fa-link mr-2"></i>
                Connect to All
              </button>
            </div>
            <div class="${styles.devicesContainer} saved-devices-container">
              <!-- Devices will be populated here -->
            </div>
          </div>

          <!-- Find Devices Section -->
          <div class="${styles.divider}">
            <div class="${styles.sectionHeader}">
              <h3 class="${styles.title}">Find Devices</h3>
              <button class="${styles.scanBtn}">
                <i class="fas fa-search mr-1"></i>
                Scan
              </button>
            </div>
            <div class="${styles.devicesContainer} discovered-devices-container">
              <div class="${styles.noDevices}">Click "Scan" to find nearby devices</div>
            </div>
          </div>
        </div>
      </div>
    `;

    return modal;
  }

  private setupEventListeners(): void {
    // Close button
    const closeBtn = this.modal.querySelector(`.${styles.closeButton}`) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.hide());

    // Remove overlay click to close since we're not using an overlay anymore

    // Connect all button
    const connectAllBtn = this.modal.querySelector(`.${styles.connectAllBtn}`) as HTMLButtonElement;
    connectAllBtn.addEventListener('click', () => this.handleConnectAll());

    // Scan button
    const scanBtn = this.modal.querySelector(`.${styles.scanBtn}`) as HTMLButtonElement;
    scanBtn.addEventListener('click', () => this.handleScan());

    // Tracker manager events
    this.trackerManager.addEventListener('deviceConnected', (e: any) => {
      this.updateDeviceConnectionStatus(e.detail.deviceId, true);
    });

    this.trackerManager.addEventListener('deviceDisconnected', (e: any) => {
      this.updateDeviceConnectionStatus(e.detail.deviceId, false);
    });

    // Listen for discovered devices event
    this.trackerManager.addEventListener('devicesDiscovered', ((e: Event) => {
      const event = e as CustomEvent<{ detail: EidonDevice[] }>;
      // Event detail is already the array, not wrapped
      const devices = (event as any).detail as EidonDevice[];
      this.updateDiscoveredDevices(devices);
    }) as EventListener);

    // Listen for discovery errors
    this.trackerManager.addEventListener('discoveryError', ((e: Event) => {
      const event = e as CustomEvent<{ error: Error }>;
      console.error('[DeviceModal] Discovery error:', event.detail);
      const container = this.modal.querySelector('.discovered-devices-container') as HTMLElement;
      if (container) {
        container.innerHTML = `<div class="${styles.noDevices}">Scan error: ${event.detail?.error?.message || 'Unknown error'}</div>`;
      }
    }) as EventListener);

    // Listen for login state changes to update arrow visibility
    this.loginStateManager.addListener(() => {
      this.updateArrowVisibility();
    });
  }

  private async loadSavedDevices(): Promise<void> {
    try {
      const state = this.loginStateManager.getState();
      if (!state.isLoggedIn || !state.tokens?.token) {
        console.log('User not logged in, showing login prompt');
        this.showLoginPrompt();
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('VITE_API_URL environment variable is not set');
      }

      const response = await fetch(`${apiUrl}/devices`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${state.tokens.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // If unauthorized (401), log the user out
        if (response.status === 401) {
          console.log('Unauthorized response received, logging out user');
          this.loginStateManager.logout();
          this.showLoginPrompt();
          return;
        }
        
        throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const devicesData = await response.json();

      // Convert API devices to EidonDevice format
      this.savedDevices = this.convertApiDevicesToEidonDevices(devicesData);
      this.renderSavedDevices();

    } catch (error) {
      console.error('Failed to load saved devices:', error);
      // Fall back to login prompt
      this.showLoginPrompt();
    }
  }

  private showLoginPrompt(): void {
    const container = this.modal.querySelector('.saved-devices-container') as HTMLElement;
    const title = this.modal.querySelector('.saved-devices-title') as HTMLElement;
    
    if (!container || !title) return;

    // Hide the title and connect button when logged out
    title.classList.add('display-hidden');
    const connectAllBtn = this.modal.querySelector('.connect-all-btn') as HTMLElement;
    if (connectAllBtn) {
      connectAllBtn.classList.add('display-hidden');
    }
    
    // Show login prompt
    container.innerHTML = `
      <div class="${styles.loginPrompt}">
        <div class="${styles.loginPromptIcon}">
          <i class="fas fa-sign-in-alt"></i>
          <p class="${styles.loginPromptText}">Sign in to save and manage your devices</p>
        </div>
        <button class="${styles.loginPromptBtn}">
          <i class="fas fa-sign-in-alt mr-2"></i>
          Sign In
        </button>
      </div>
    `;

    // Add event listener for login button
    const loginBtn = container.querySelector(`.${styles.loginPromptBtn}`) as HTMLButtonElement;
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        // Dispatch event to trigger login modal
        document.dispatchEvent(new CustomEvent('requestLogin'));
      });
    }
  }

  private convertApiDevicesToEidonDevices(apiDevices: any[]): EidonDevice[] {
    return apiDevices.map(device => ({
      id: device.id,
      name: device.name,
      role: this.mapApiRoleToDeviceRole(device.position),
      macAddress: device.connectionId || device.id,
      connectionId: device.connectionId || device.id,
      isConnected: false, // Will be updated based on actual connection status
      isHub: this.isHubRole(device.position),
      parentHub: this.getParentHub(device, apiDevices),
      color: this.mapApiColorToHex(device.color),
      batteryLevel: device.batteryLevel,
      firmwareVersion: device.firmwareVersion,
      lastSeen: performance.now()
    }));
  }

  private mapApiRoleToDeviceRole(apiPosition: number): DeviceRole {
    // Map API position values to DeviceRole enum
    switch (apiPosition) {
      case 0: return DeviceRole.LEFT_HAND;
      case 1: return DeviceRole.RIGHT_HAND;
      case 2: return DeviceRole.LEFT_FOREARM;
      case 3: return DeviceRole.RIGHT_FOREARM;
      case 4: return DeviceRole.LEFT_HUB;
      case 5: return DeviceRole.RIGHT_HUB;
      case 6: return DeviceRole.CHEST;
      case 8: return DeviceRole.LEFT_GLOVE;
      case 9: return DeviceRole.RIGHT_GLOVE;
      default: return DeviceRole.UNKNOWN;
    }
  }

  private isHubRole(apiPosition: number): boolean {
    return apiPosition === 4 || apiPosition === 5 || apiPosition === 6; // LEFT_HUB, RIGHT_HUB, CHEST
  }

  private getParentHub(device: any, allDevices: any[]): string | undefined {
    // For child devices, find their parent hub
    if (device.position === 0 || device.position === 2) { // LEFT_HAND, LEFT_FOREARM
      const leftHub = allDevices.find(d => d.position === 4); // LEFT_HUB
      return leftHub?.id;
    } else if (device.position === 1 || device.position === 3) { // RIGHT_HAND, RIGHT_FOREARM
      const rightHub = allDevices.find(d => d.position === 5); // RIGHT_HUB
      return rightHub?.id;
    }
    return undefined;
  }

  private mapApiColorToHex(apiColor: string): string {
    // Convert API color format to hex
    if (apiColor.startsWith('#')) {
      return apiColor;
    }
    if (apiColor.startsWith('rgb')) {
      // Convert rgb(r,g,b) to hex
      const matches = apiColor.match(/\d+/g);
      if (matches && matches.length >= 3) {
        const r = parseInt(matches[0]).toString(16).padStart(2, '0');
        const g = parseInt(matches[1]).toString(16).padStart(2, '0');
        const b = parseInt(matches[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    return '#666666'; // Default color
  }

  private renderSavedDevices(): void {
    const container = this.modal.querySelector('.saved-devices-container') as HTMLElement;
    const title = this.modal.querySelector('.saved-devices-title') as HTMLElement;
    if (!container || !title) return;

    // Reset title to "Saved Devices" and show it
    title.textContent = 'Saved Devices';
    title.classList.remove('display-hidden');
    
    // Show the connect button
    const connectAllBtn = this.modal.querySelector('.connect-all-btn') as HTMLElement;
    if (connectAllBtn) {
      connectAllBtn.classList.remove('display-hidden');
    }

    // Group devices by side
    const leftDevices = this.savedDevices.filter(d => 
      d.role === DeviceRole.LEFT_HUB || d.role === DeviceRole.LEFT_HAND || d.role === DeviceRole.LEFT_FOREARM
    );
    const rightDevices = this.savedDevices.filter(d => 
      d.role === DeviceRole.RIGHT_HUB || d.role === DeviceRole.RIGHT_HAND || d.role === DeviceRole.RIGHT_FOREARM
    );
    const chestDevices = this.savedDevices.filter(d => d.role === DeviceRole.CHEST);

    let html = '';

    // Left side devices
    if (leftDevices.length > 0) {
      html += `<div class="${styles.deviceGroup}">`;
      html += `<div class="${styles.groupTitle}">Left Side</div>`;
      leftDevices.forEach(device => {
        html += this.createDeviceCard(device);
      });
      html += '</div>';
    }

    // Right side devices
    if (rightDevices.length > 0) {
      html += `<div class="${styles.deviceGroup}">`;
      html += `<div class="${styles.groupTitle}">Right Side</div>`;
      rightDevices.forEach(device => {
        html += this.createDeviceCard(device);
      });
      html += '</div>';
    }

    // Chest devices
    if (chestDevices.length > 0) {
      html += `<div class="${styles.deviceGroup}">`;
      html += `<div class="${styles.groupTitle}">Chest</div>`;
      chestDevices.forEach(device => {
        html += this.createDeviceCard(device);
      });
      html += '</div>';
    }

    container.innerHTML = html;
    this.setDeviceCardStyles();
    this.attachDeviceEventListeners();
  }

  private setDeviceCardStyles(): void {
    const container = this.modal.querySelector('.saved-devices-container') as HTMLElement;
    if (!container) return;

    const colorIndicators = container.querySelectorAll(`.${styles.colorIndicator}[data-color]`);
    colorIndicators.forEach(indicator => {
      const color = indicator.getAttribute('data-color');
      if (color) {
        (indicator as HTMLElement).style.setProperty('--device-color', color);
      }
    });

    const statusBadges = container.querySelectorAll(`.${styles.statusBadge}[data-status-color]`);
    statusBadges.forEach(badge => {
      const statusColor = badge.getAttribute('data-status-color');
      if (statusColor) {
        (badge as HTMLElement).style.setProperty('--status-color', statusColor);
        (badge as HTMLElement).style.setProperty('--status-bg-color', `${statusColor}20`);
      }
    });
  }

  private createDeviceCard(device: EidonDevice): string {
    const status = this.getDeviceStatus(device);
    const statusColor = this.getStatusColor(status);
    const roleName = DEVICE_ROLE_NAMES[device.role];

    return `
      <div class="${styles.deviceCard}" data-device-id="${device.id}">
        <div class="${styles.cardTop}">
          <div class="${styles.cardLeft}">
            <div class="${styles.colorIndicator}" data-color="${device.color || '#666'}"></div>
            <div class="${styles.deviceInfo}">
              <div class="${styles.deviceName}">${device.name}</div>
              <div class="${styles.deviceRole}">${roleName}</div>
            </div>
          </div>
          <div class="${styles.cardRight}">
            <div class="${styles.statusBadge}" data-status-color="${statusColor}">
              ${status}
            </div>
            <button class="${styles.connectBtn}" data-device-id="${device.id}">
              ${device.isConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </div>
        <div class="${styles.cardBottom}">
          <div class="${styles.macAddress}">${device.macAddress}</div>
          <div class="${styles.actionButtons}">
            <button class="${styles.editBtn}" data-device-id="${device.id}">
              <i class="fas fa-edit"></i>
            </button>
            <button class="${styles.deleteBtn}" data-device-id="${device.id}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private getDeviceStatus(device: EidonDevice): string {
    if (device.isHub || device.role === DeviceRole.CHEST) {
      return device.isConnected ? 'Connected' : 'Disconnected';
    } else {
      // Child device status
      if (device.isConnected) {
        return 'Connected via Hub';
      } else if (device.parentHub) {
        const parentDevice = this.savedDevices.find(d => d.id === device.parentHub);
        if (parentDevice?.isConnected) {
          return 'Available';
        }
      }
      return 'Disconnected';
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'Connected':
      case 'Connected via Hub':
        return '#10b981';
      case 'Available':
        return '#f59e0b';
      case 'Disconnected':
      default:
        return '#ef4444';
    }
  }

  private attachDeviceEventListeners(): void {
    // Connect/Disconnect buttons
    const connectBtns = this.modal.querySelectorAll(`.${styles.connectBtn}`);
    connectBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const deviceId = (e.target as HTMLElement).getAttribute('data-device-id');
        if (deviceId) {
          this.handleDeviceConnect(deviceId);
        }
      });
    });

    // Edit buttons
    const editBtns = this.modal.querySelectorAll(`.${styles.editBtn}`);
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const deviceId = (e.target as HTMLElement).getAttribute('data-device-id');
        if (deviceId) {
          this.handleDeviceEdit(deviceId);
        }
      });
    });

    // Delete buttons
    const deleteBtns = this.modal.querySelectorAll(`.${styles.deleteBtn}`);
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const deviceId = (e.target as HTMLElement).getAttribute('data-device-id');
        if (deviceId) {
          this.handleDeviceDelete(deviceId);
        }
      });
    });
  }

  private async handleConnectAll(): Promise<void> {
    const connectAllBtn = this.modal.querySelector(`.${styles.connectAllBtn}`) as HTMLButtonElement;
    if (!connectAllBtn) return;

    try {
      // Set loading state
      connectAllBtn.disabled = true;
      connectAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Connecting...';
      console.log('Starting connection to all devices...');

      await this.trackerManager.connectToAll();
      
      console.log('Successfully connected to all devices');
    } catch (error) {
      console.error('Failed to connect to all devices:', error);
    } finally {
      // Reset button state
      connectAllBtn.disabled = false;
      connectAllBtn.innerHTML = '<i class="fas fa-link mr-2"></i>Connect to All';
    }
  }

  private async handleScan(): Promise<void> {
    const scanBtn = this.modal.querySelector(`.${styles.scanBtn}`) as HTMLButtonElement;
    const container = this.modal.querySelector('.discovered-devices-container') as HTMLElement;
    
    try {
      scanBtn.disabled = true;
      scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Scanning...';
      
      // Show loading state in the container
      if (container) {
        container.innerHTML = `<div class="${styles.noDevices}"><i class="fas fa-spinner fa-spin mr-2"></i>Scanning for devices...</div>`;
      }

      const discoveredDevices = await this.trackerManager.startDiscovery();
      
      // Update UI with discovered devices
      this.updateDiscoveredDevices(discoveredDevices);
    } catch (error) {
      console.error('[DeviceModal] Device scan failed:', error);
      // Show error message in the container
      if (container) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        container.innerHTML = `<div class="${styles.noDevices}">Scan failed: ${errorMessage}</div>`;
      }
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<i class="fas fa-search mr-1"></i>Scan';
    }
  }


  private async handleDeviceConnect(deviceId: string): Promise<void> {
    const device = this.savedDevices.find(d => d.id === deviceId);
    if (!device) return;

    const connectBtn = this.modal.querySelector(`[data-device-id="${deviceId}"] .device-connect-btn`) as HTMLButtonElement;
    if (!connectBtn) return;

    try {
      if (device.isConnected) {
        // Set loading state for disconnect
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Disconnecting...';
        console.log(`Disconnecting device: ${deviceId}`);

        await this.trackerManager.disconnectDevice(deviceId);
        console.log(`Successfully disconnected device: ${deviceId}`);
      } else {
        // Set loading state for connect
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Connecting...';
        console.log(`Connecting to device: ${deviceId}`);

        const success = await this.trackerManager.connectToDevice(deviceId);
        if (success) {
          console.log(`Successfully connected to device: ${deviceId}`);
        } else {
          console.error(`Failed to connect to device: ${deviceId}`);
        }
      }
    } catch (error) {
      console.error(`Device connection failed for ${deviceId}:`, error);
    } finally {
      // Reset button state - the UI will be updated by the event listeners
      connectBtn.disabled = false;
      // The button text will be updated by updateDeviceConnectionStatus
    }
  }

  private handleDeviceEdit(deviceId: string): void {
    // TODO: Implement device editing
    console.log('Edit device:', deviceId);
  }

  private handleDeviceDelete(deviceId: string): void {
    // TODO: Implement device deletion
    console.log('Delete device:', deviceId);
  }

  private updateDeviceConnectionStatus(deviceId: string, isConnected: boolean): void {
    const device = this.savedDevices.find(d => d.id === deviceId);
    if (device) {
      device.isConnected = isConnected;
      this.renderSavedDevices();
    }
  }

  private updateDiscoveredDevices(devices: EidonDevice[]): void {
    this.discoveredDevices = devices;
    this.renderDiscoveredDevices();
  }

  private renderDiscoveredDevices(): void {
    const container = this.modal.querySelector('.discovered-devices-container') as HTMLElement;
    if (!container) return;

    if (this.discoveredDevices.length === 0) {
      container.innerHTML = `<div class="${styles.noDevices}">
        <p>No previously paired devices found.</p>
        <p style="font-size: 0.875rem; margin-top: 0.5rem; color: rgba(255,255,255,0.7);">
          To add a new device, you'll need to connect to it first through your device's Bluetooth settings or connect directly from the device.
        </p>
      </div>`;
      return;
    }

    const html = this.discoveredDevices.map(device => this.createDeviceCard(device)).join('');
    container.innerHTML = html;
    this.setDeviceCardStyles();
    this.attachDeviceEventListeners();
  }

  public show(): void {
    this.isVisible = true;
    this.container.classList.remove(styles.modalHidden);
    // Hide arrow indicator when modal is open
    const arrow = this.container.querySelector(`.${styles.arrowIndicator}`) as HTMLElement;
    if (arrow) {
      arrow.style.display = 'none';
      arrow.style.opacity = '0';
    }
  }

  public hide(): void {
    this.isVisible = false;
    this.container.classList.add(styles.modalHidden);
    // Show arrow indicator when modal is closed (if logged in)
    this.updateArrowVisibility();
  }

  private updateArrowVisibility(): void {
    const arrow = this.container.querySelector(`.${styles.arrowIndicator}`) as HTMLElement;
    if (!arrow) return;

    const isLoggedIn = this.loginStateManager.getState().isLoggedIn;
    
    if (isLoggedIn && !this.isVisible) {
      arrow.style.display = '';
      arrow.style.opacity = '1';
    } else {
      arrow.style.display = 'none';
      arrow.style.opacity = '0';
    }
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  public updateLoginState(isLoggedIn: boolean): void {
    if (isLoggedIn) {
      // User logged in, load saved devices
      this.loadSavedDevices();
      // Reset container position for logged in state
      this.container.className = `${styles.container} ${styles.modalHidden}`;
    } else {
      // User logged out, show login prompt
      this.showLoginPrompt();
      // Move container to match logged in position with custom CSS class
      this.container.className = `${styles.container} ${styles.loggedOut} ${styles.modalHidden}`;
    }
    this.updateArrowVisibility();
  }

  public unmount(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
