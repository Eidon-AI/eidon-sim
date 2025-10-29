import { EidonTrackerManager, EidonDevice } from '../../../core/EidonTrackerManager';
import { DeviceRole } from '../../../core/constants';
import { LoginStateManager } from '../../../core/LoginStateManager';
import { createDeviceConnectionCard as createNewDeviceCard, setDeviceCardStyles as setNewDeviceCardStyles, cardStyles as newCardStyles } from './NewDeviceConnectionCard';
import { createDeviceConnectionCard as createSavedDeviceCard, setDeviceCardStyles as setSavedDeviceCardStyles, cardStyles as savedCardStyles } from './SavedDeviceConnectionCard';
import styles from './styles/DeviceModal.module.css';

export class DeviceModal {
  private container: HTMLElement;
  private modal: HTMLElement;
  private trackerManager: EidonTrackerManager;
  private loginStateManager: LoginStateManager;
  private isVisible = false;
  private savedDevices: EidonDevice[] = [];
  private discoveredDevices: EidonDevice[] = [];
  private deviceConfigs = new Map<string, { selectedColor?: string; selectedRole?: DeviceRole }>();
  private deviceQuaternionData = new Map<string, { quaternion: number[]; timestamp: number }>();

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

    // Listen for device info updates (e.g., role changes)
    this.trackerManager.addEventListener('deviceInfoUpdated', (e: any) => {
      const { deviceId, device } = e.detail;
      // Update the device in our lists and re-render
      const savedDevice = this.savedDevices.find(d => d.id === deviceId);
      if (savedDevice) {
        Object.assign(savedDevice, device);
        this.renderSavedDevices();
      }
      const discoveredDevice = this.discoveredDevices.find(d => d.id === deviceId);
      if (discoveredDevice) {
        Object.assign(discoveredDevice, device);
        this.renderDiscoveredDevices();
      }
    });

    // Listen for quaternion data updates
    this.trackerManager.addEventListener('quaternionData', ((e: Event) => {
      const event = e as CustomEvent<{ deviceId: string; quaternion: number[]; timestamp: number }>;
      const { deviceId, quaternion, timestamp } = event.detail;
      this.deviceQuaternionData.set(deviceId, { quaternion, timestamp });
      // Update data view if it's currently visible
      this.updateDeviceDataView(deviceId);
      // Update dials
      const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
      if (device) {
        // Determine which card type based on device location
        const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
        import(isSaved ? './SavedDeviceConnectionCard' : './NewDeviceConnectionCard').then(({ updateDeviceDials }) => {
          updateDeviceDials(deviceId, { quaternion, timestamp });
        });
      }
    }) as EventListener);

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
    if (!container) return;

    if (this.savedDevices.length === 0) {
      container.innerHTML = `<div class="${styles.noDevices}">
        <p>No saved devices. Connect and save devices to see them here.</p>
      </div>`;
      return;
    }

    // Simple list - no grouping needed
    const html = this.savedDevices.map(device => {
      const config = this.deviceConfigs.get(device.id);
      const hasChanges = this.hasDeviceChanges(device, config);
      const quatData = this.deviceQuaternionData.get(device.id);
      return createSavedDeviceCard(device, this.savedDevices, config?.selectedColor, config?.selectedRole, hasChanges, quatData);
    }).join('');

    container.innerHTML = html;
    setSavedDeviceCardStyles(container);
    this.attachDeviceEventListeners();
    
    // Initialize dials for devices with quaternion data
    import('./SavedDeviceConnectionCard').then(({ updateDeviceDials }) => {
      this.savedDevices.forEach(device => {
        const quatData = this.deviceQuaternionData.get(device.id);
        if (quatData) {
          updateDeviceDials(device.id, quatData);
        }
      });
    });
  }


  private attachDeviceEventListeners(): void {
    // Connect/Disconnect buttons (both lists)
    this.modal.querySelectorAll(`.${newCardStyles.connectBtn}, .${savedCardStyles.connectBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleDeviceConnect(deviceId));
      }
    });

    // Edit buttons (saved devices only)
    this.modal.querySelectorAll(`.${savedCardStyles.editBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleDeviceEdit(deviceId));
      }
    });

    // Delete buttons (saved devices only)
    this.modal.querySelectorAll(`.${savedCardStyles.deleteBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleDeviceDelete(deviceId));
      }
    });

    // Color selectors (both lists)
    this.modal.querySelectorAll(`.${newCardStyles.colorSelector}, .${savedCardStyles.colorSelector}`).forEach(select => {
      select.addEventListener('change', (e) => {
        const deviceId = (e.target as HTMLSelectElement).getAttribute('data-device-id');
        const color = (e.target as HTMLSelectElement).value;
        if (deviceId) {
          this.handleColorChange(deviceId, color);
        }
      });
    });

    // Role selectors (both lists)
    this.modal.querySelectorAll(`.${newCardStyles.roleSelector}, .${savedCardStyles.roleSelector}`).forEach(select => {
      select.addEventListener('change', (e) => {
        const deviceId = (e.target as HTMLSelectElement).getAttribute('data-device-id');
        const roleValue = parseInt((e.target as HTMLSelectElement).value);
        if (deviceId) {
          this.handleRoleChange(deviceId, roleValue);
        }
      });
    });

    // Save buttons (both lists)
    this.modal.querySelectorAll(`.${newCardStyles.saveBtn}, .${savedCardStyles.saveBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleDeviceSave(deviceId));
      }
    });

    // Data view toggle buttons (both lists)
    this.modal.querySelectorAll(`.${newCardStyles.dataToggle}, .${savedCardStyles.dataToggle}`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest(`.${newCardStyles.dataToggle}, .${savedCardStyles.dataToggle}`) as HTMLElement;
        const deviceId = button?.getAttribute('data-device-id');
        if (deviceId) {
          this.toggleDataView(deviceId);
        }
      });
    });
  }

  private toggleDataView(deviceId: string): void {
    // Try saved devices first, then new devices
    let toggleBtn = this.modal.querySelector(`.${savedCardStyles.dataToggle}[data-device-id="${deviceId}"]`) as HTMLElement;
    let dataContent = this.modal.querySelector(`.${savedCardStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
    let icon = toggleBtn?.querySelector(`.${savedCardStyles.dataToggleIcon}`) as HTMLElement;
    
    if (!toggleBtn || !dataContent) {
      toggleBtn = this.modal.querySelector(`.${newCardStyles.dataToggle}[data-device-id="${deviceId}"]`) as HTMLElement;
      dataContent = this.modal.querySelector(`.${newCardStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
      icon = toggleBtn?.querySelector(`.${newCardStyles.dataToggleIcon}`) as HTMLElement;
    }
    
    if (!dataContent || !toggleBtn || !icon) return;

    const isHidden = dataContent.style.display === 'none';
    dataContent.style.display = isHidden ? 'block' : 'none';
    icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  private async updateDeviceDataView(deviceId: string): Promise<void> {
    // Determine if it's a saved or new device
    const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
    const cardStyles = isSaved ? savedCardStyles : newCardStyles;
    
    const dataContent = this.modal.querySelector(`.${cardStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
    if (!dataContent || dataContent.style.display === 'none') {
      return;
    }

    const quatData = this.deviceQuaternionData.get(deviceId);
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    
    if (!device || !quatData) return;

    const { updateDeviceDials } = await import(isSaved ? './SavedDeviceConnectionCard' : './NewDeviceConnectionCard');
    const dialCanvas = dataContent.querySelector(`.${cardStyles.dialCanvas}`);
    if (!dialCanvas) {
      // Re-render the specific device card to update data view
      if (this.savedDevices.find(d => d.id === deviceId)) {
        this.renderSavedDevices();
      } else {
        this.renderDiscoveredDevices();
      }
      // Re-attach event listeners since we re-rendered
      this.attachDeviceEventListeners();
      // Wait for DOM update then initialize dials
      setTimeout(() => {
        const newQuatData = this.deviceQuaternionData.get(deviceId);
        if (newQuatData) {
          updateDeviceDials(deviceId, newQuatData);
        }
      }, 0);
    } else {
      // Update existing dials directly
      updateDeviceDials(deviceId, quatData);
    }
    
    // Re-expand the data view if it was open
    const contentStyles = isSaved ? savedCardStyles : newCardStyles;
    const newDataContent = this.modal.querySelector(`.${contentStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
    if (newDataContent) {
      newDataContent.style.display = 'block';
      const toggleBtn = this.modal.querySelector(`.${contentStyles.dataToggle}[data-device-id="${deviceId}"]`) as HTMLElement;
      const icon = toggleBtn?.querySelector(`.${contentStyles.dataToggleIcon}`) as HTMLElement;
      if (icon) {
        icon.style.transform = 'rotate(180deg)';
      }
    }
  }

  private hasDeviceChanges(device: EidonDevice, config?: { selectedColor?: string; selectedRole?: DeviceRole }): boolean {
    if (!config) return false;
    const colorChanged = config.selectedColor !== undefined && config.selectedColor !== device.color;
    const roleChanged = config.selectedRole !== undefined && config.selectedRole !== device.role;
    return colorChanged || roleChanged;
  }

  private handleColorChange(deviceId: string, color: string): void {
    const config = this.deviceConfigs.get(deviceId) || {};
    config.selectedColor = color;
    this.deviceConfigs.set(deviceId, config);
    
    // Re-render to show/hide save button
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    if (device) {
      if (this.savedDevices.find(d => d.id === deviceId)) {
        this.renderSavedDevices();
      } else {
        this.renderDiscoveredDevices();
      }
    }
  }

  private handleRoleChange(deviceId: string, role: DeviceRole): void {
    const config = this.deviceConfigs.get(deviceId) || {};
    config.selectedRole = role;
    this.deviceConfigs.set(deviceId, config);
    
    // Re-render to show/hide save button
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    if (device) {
      if (this.savedDevices.find(d => d.id === deviceId)) {
        this.renderSavedDevices();
      } else {
        this.renderDiscoveredDevices();
      }
    }
  }

  private async handleDeviceSave(deviceId: string): Promise<void> {
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    if (!device || !device.isConnected) return;

    const config = this.deviceConfigs.get(deviceId);
    if (!config || !this.hasDeviceChanges(device, config)) return;

    // Determine which card type
    const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
    const cardStyles = isSaved ? savedCardStyles : newCardStyles;
    const saveBtn = this.modal.querySelector(`[data-device-id="${deviceId}"].${cardStyles.saveBtn}`) as HTMLButtonElement;
    if (!saveBtn) return;

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      const state = this.loginStateManager.getState();
      if (!state.isLoggedIn || !state.tokens?.token) {
        throw new Error('Must be logged in to save device');
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('VITE_API_URL environment variable is not set');
      }

      // Determine if this is an update or new device
      const isUpdate = this.savedDevices.find(d => d.id === deviceId) !== undefined;
      
      // Use device ID if update, connectionId for new device
      const deviceIdToUse = isUpdate ? deviceId : device.connectionId || deviceId;
      
      // Get color and role to save
      const colorToSave = config.selectedColor || device.color || 'rgb(0, 0, 0)';
      const roleToSave = config.selectedRole !== undefined ? config.selectedRole : device.role;

      const response = await fetch(`${apiUrl}/devices`, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${state.tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: deviceIdToUse,
          type: 'tracker',
          role: roleToSave,
          color: colorToSave,
          name: device.name,
          connectionId: device.connectionId || device.macAddress,
          isUpdate: isUpdate
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save device: ${response.status} ${errorText}`);
      }

      // Update device with saved values
      device.color = colorToSave;
      device.role = roleToSave;
      
      // Clear config changes
      this.deviceConfigs.delete(deviceId);

      // Reload saved devices to refresh from API
      await this.loadSavedDevices();
      
      // Also update discovered devices if needed
      const discoveredDevice = this.discoveredDevices.find(d => d.id === deviceId);
      if (discoveredDevice) {
        Object.assign(discoveredDevice, device);
        this.renderDiscoveredDevices();
      }

      console.log(`Successfully saved device: ${device.name}`);
    } catch (error) {
      console.error(`Failed to save device ${deviceId}:`, error);
      // Show error to user
      alert(`Failed to save device: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
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
    // Check both saved and discovered devices
    let device = this.savedDevices.find(d => d.id === deviceId);
    if (!device) {
      device = this.discoveredDevices.find(d => d.id === deviceId);
    }
    if (!device) return;

    // Determine which card type
    const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
    const cardStyles = isSaved ? savedCardStyles : newCardStyles;
    const connectBtn = this.modal.querySelector(`[data-device-id="${deviceId}"] .${cardStyles.connectBtn}`) as HTMLButtonElement;
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
    // Update device in savedDevices
    const savedDevice = this.savedDevices.find(d => d.id === deviceId);
    if (savedDevice) {
      savedDevice.isConnected = isConnected;
      this.renderSavedDevices();
    }
    
    // Update device in discoveredDevices
    const discoveredDevice = this.discoveredDevices.find(d => d.id === deviceId);
    if (discoveredDevice) {
      discoveredDevice.isConnected = isConnected;
      this.renderDiscoveredDevices();
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
        <p>No devices found. Click "Scan" to discover nearby devices.</p>
      </div>`;
      return;
    }

    // Simple list of discovered devices
    const html = this.discoveredDevices.map(device => {
      const config = this.deviceConfigs.get(device.id);
      const hasChanges = this.hasDeviceChanges(device, config);
      const quatData = this.deviceQuaternionData.get(device.id);
      return createNewDeviceCard(device, this.discoveredDevices, config?.selectedColor, config?.selectedRole, hasChanges, quatData);
    }).join('');

    container.innerHTML = html;
    setNewDeviceCardStyles(container);
    this.attachDeviceEventListeners();
    
    // Initialize dials for devices with quaternion data
    import('./NewDeviceConnectionCard').then(({ updateDeviceDials }) => {
      this.discoveredDevices.forEach(device => {
        const quatData = this.deviceQuaternionData.get(device.id);
        if (quatData) {
          updateDeviceDials(device.id, quatData);
        }
      });
    });
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
      console.log('Hiding arrow');
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
