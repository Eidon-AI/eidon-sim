import { EidonTrackerManager, EidonDevice, RawMotionData } from '../../../core/EidonTrackerManager';
import { DeviceRole } from '../../../core/constants';
import { LoginStateManager } from '../../../core/LoginStateManager';
import { DeviceConnectionStateManager } from '../../../core/DeviceConnectionStateManager';
import { LatestVersionManager } from '../../../core/LatestVersionManager';
import { checkAndSyncVersion } from '../../../core/DeviceVersionSync';
import { createDeviceConnectionCard as createNewDeviceCard, setDeviceCardStyles as setNewDeviceCardStyles, cardStyles as newCardStyles } from './NewDeviceConnectionCard';
import { createDeviceConnectionCard as createSavedDeviceCard, setDeviceCardStyles as setSavedDeviceCardStyles, cardStyles as savedCardStyles } from './SavedDeviceConnectionCard';
import colorDropdownStyles from './styles/ColorDropdown.module.css';
import roleSelectorStyles from './styles/RoleSelector.module.css';
import styles from './styles/DeviceModal.module.css';

export class DeviceModal {
  private container: HTMLElement;
  private modal: HTMLElement;
  private trackerManager: EidonTrackerManager;
  private deviceConnectionStateManager: DeviceConnectionStateManager;
  private loginStateManager: LoginStateManager;
  private isVisible = false;
  private savedDevices: EidonDevice[] = [];
  private discoveredDevices: EidonDevice[] = [];
  private deviceConfigs = new Map<string, { selectedColor?: string; selectedRole?: DeviceRole; selectedName?: string }>();
  private deviceQuaternionData = new Map<string, { quaternion: number[]; timestamp: number }>();
  private deviceRawData = new Map<string, RawMotionData>(); // Key format: ${deviceId}_${type} (hub/hand/forearm)
  private deviceEditStates = new Map<string, boolean>(); // Track which devices have config section visible
  private deviceNameEditStates = new Map<string, boolean>(); // Track which device names are in edit mode
  private deviceDataViewStates = new Map<string, boolean>(); // Track which devices have data stream visible
  private deviceDisconnecting = new Set<string>(); // Track devices currently disconnecting to prevent reconnection attempts
  private connectionCountIndicator: HTMLElement | null = null;
  private calibrateAllBtn: HTMLButtonElement | null = null;
  private versionWarningUnsubscribe: (() => void) | null = null;

  constructor(trackerManager: EidonTrackerManager, deviceConnectionStateManager: DeviceConnectionStateManager) {
    this.trackerManager = trackerManager;
    this.deviceConnectionStateManager = deviceConnectionStateManager;
    this.loginStateManager = LoginStateManager.getInstance();
    this.container = this.createContainer();
    this.modal = this.createModal();
    this.container.appendChild(this.modal);
    
    // Store reference to connection count indicator after modal is created
    this.connectionCountIndicator = this.modal.querySelector(`.${styles.connectionCount}`) as HTMLElement;
    this.calibrateAllBtn = this.modal.querySelector(`.${styles.calibrateAllBtn}`) as HTMLButtonElement;
    
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
    
    // Initialize connection count indicator
    this.updateConnectionCount();
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
        <!-- Header with close button and connection count -->
        <div class="${styles.header}">
          <div class="${styles.headerLeft}">
            <div class="${styles.connectionCount}">0/7</div>
            <button class="${styles.calibrateAllBtn}" disabled>
              <i class="fas fa-compass"></i>
              <span>Calibrate All</span>
            </button>
            <button class="${styles.closeButton} ${styles.closeButtonMobile}">&times;</button>
          </div>
          <button class="${styles.closeButton} ${styles.closeButtonDesktop}">&times;</button>
        </div>

        <!-- Saved Devices Section -->
        <div class="${styles.body}">
          <div class="${styles.section}">
            <div class="${styles.sectionHeader}">
              <h3 class="${styles.title} saved-devices-title">Primary Devices</h3>
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
        
        <!-- Mobile close button at bottom -->
        <button class="${styles.mobileCloseButton}">
          <i class="fas fa-times"></i>
          <span>Close</span>
        </button>
      </div>
    `;

    // Store reference to connection count indicator
    const connectionCountElement = modal.querySelector(`.${styles.connectionCount}`) as HTMLElement;

    return modal;
  }

  private setupEventListeners(): void {
    // Close buttons (both mobile and desktop)
    const closeButtons = this.modal.querySelectorAll(`.${styles.closeButton}`) as NodeListOf<HTMLButtonElement>;
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.hide());
    });

    // Mobile close button (bottom)
    const mobileCloseBtn = this.modal.querySelector(`.${styles.mobileCloseButton}`) as HTMLButtonElement;
    if (mobileCloseBtn) {
      mobileCloseBtn.addEventListener('click', () => this.hide());
    }

    // Remove overlay click to close since we're not using an overlay anymore

    // Scan button
    const scanBtn = this.modal.querySelector(`.${styles.scanBtn}`) as HTMLButtonElement;
    scanBtn.addEventListener('click', () => this.handleScan());

      // Tracker manager events
      this.trackerManager.addEventListener('deviceConnected', (e: any) => {
        const { deviceId, device } = e.detail;
        console.log('[DeviceModal] deviceConnected:', deviceId, device?.name, 'connectionId:', device?.connectionId);
        
        // Note: setupRawDataStreams will be called after deviceInfoUpdated
        // to ensure device role is available

      // Don't add child devices to any lists - they're handled by DeviceConnectionStateManager
      // Just update connection status for the device itself

      // Update by trackerManager deviceId (for non-child devices or after child is added)
      this.updateDeviceConnectionStatus(deviceId, true);

      // Also update saved/discovered devices by connectionId, macAddress, or name if they match
      if (device) {
        let savedDevice = this.savedDevices.find(d =>
          d.connectionId === device.connectionId ||
          d.macAddress === device.connectionId ||
          d.connectionId === device.macAddress ||
          d.macAddress === device.macAddress
        );

        // Also try matching by name (for auto-reconnect where connectionId might differ)
        if (!savedDevice && device.name) {
          savedDevice = this.savedDevices.find(d => d.name === device.name);
        }

        if (savedDevice && savedDevice.id !== deviceId) {
          console.log('[DeviceModal] Matched saved device:', savedDevice.id, savedDevice.name);
          savedDevice.isConnected = true;
          // Update connection info to match trackerManager device
          savedDevice.connectionId = device.connectionId;
          savedDevice.macAddress = device.macAddress || device.connectionId;

          // IMPORTANT: Update EidonDevice.color with saved database color
          // This ensures the color is available when bridging to DeviceStore
          // Prioritize saved database color over any existing color
          if (savedDevice.color) {
            device.color = savedDevice.color;
            // Update the device in trackerManager to persist the color
            const trackerDevice = this.trackerManager.getDevice(deviceId);
            if (trackerDevice) {
              trackerDevice.color = savedDevice.color;
              // Dispatch deviceInfoUpdated event so App.ts can sync to DeviceStore
              this.trackerManager.dispatchEvent(new CustomEvent('deviceInfoUpdated', {
                detail: { deviceId, device: trackerDevice }
              }));
            }
          }

          this.updateDeviceConnectionStatus(savedDevice.id, true);

          // Sync any existing quaternion data from trackerManager deviceId to saved device ID
          const quatData = this.deviceQuaternionData.get(deviceId);
          if (quatData) {
            this.deviceQuaternionData.set(savedDevice.id, quatData);
          }
        }
      }
    });

    this.trackerManager.addEventListener('deviceDisconnected', (e: any) => {
      const { deviceId } = e.detail;
      
      // Clean up raw data for disconnected device
      this.deviceRawData.delete(`${deviceId}_hub`);
      this.deviceRawData.delete(`${deviceId}_hand`);
      this.deviceRawData.delete(`${deviceId}_forearm`);
      // Update by trackerManager deviceId
      this.updateDeviceConnectionStatus(deviceId, false);
      // Also find and update by connectionId
      const trackerDevice = this.trackerManager.getDevice(deviceId);
      if (trackerDevice && trackerDevice.connectionId) {
        const savedDevice = this.savedDevices.find(d => 
          d.connectionId === trackerDevice.connectionId ||
          d.macAddress === trackerDevice.connectionId ||
          d.connectionId === trackerDevice.macAddress ||
          d.macAddress === trackerDevice.macAddress
        );
        if (savedDevice && savedDevice.id !== deviceId) {
          savedDevice.isConnected = false;
          this.updateDeviceConnectionStatus(savedDevice.id, false);
        }
      }
    });

    // Listen for device info updates (e.g., role changes, battery level)
    this.trackerManager.addEventListener('deviceInfoUpdated', (e: any) => {
      const { deviceId, device } = e.detail;
      console.log('[DeviceModal] deviceInfoUpdated:', deviceId, 'battery:', device.batteryLevel, 'role:', device.role, 'isHub:', device.isHub);
      
      // Setup raw data stream readers after device info is available (so we know the role)
      if (device.isConnected) {
        this.setupRawDataStreams(deviceId);
      }
      
      // Update the device in our lists and re-render
      // Try matching by ID first, then by connectionId/macAddress
      let savedDevice = this.savedDevices.find(d => d.id === deviceId);
      if (!savedDevice && device.connectionId) {
        savedDevice = this.savedDevices.find(d =>
          d.connectionId === device.connectionId || d.macAddress === device.connectionId
        );
      }
      
      // Auto-sync version if device version is newer than API stored version
      if (device.firmwareVersion && savedDevice) {
        checkAndSyncVersion(deviceId, device.firmwareVersion, savedDevice.firmwareVersion).catch(() => {
          // Fail silently - background operation
        });
      }
      if (savedDevice) {
        Object.assign(savedDevice, device);
        this.renderSavedDevices();
      }

      let discoveredDevice = this.discoveredDevices.find(d => d.id === deviceId);
      if (!discoveredDevice && device.connectionId) {
        discoveredDevice = this.discoveredDevices.find(d =>
          d.connectionId === device.connectionId || d.macAddress === device.connectionId
        );
      }
      if (discoveredDevice) {
        Object.assign(discoveredDevice, device);
        this.renderDiscoveredDevices();
      }
    });

    // Listen for quaternion data updates
    this.trackerManager.addEventListener('quaternionData', ((e: Event) => {
      const event = e as CustomEvent<{ deviceId: string; quaternion: number[]; timestamp: number }>;
      const { deviceId, quaternion, timestamp } = event.detail;
      
      // Get the trackerManager device to find its connectionId
      const trackerDevice = this.trackerManager.getDevice(deviceId);
      const connectionId = trackerDevice?.connectionId || trackerDevice?.macAddress;
      
      // Find matching saved/discovered device by trackerManager deviceId, connectionId, or macAddress
      let device = this.savedDevices.find(d => d.id === deviceId) || 
                   this.discoveredDevices.find(d => d.id === deviceId);
      
      // If not found by deviceId, try matching by connectionId/macAddress
      if (!device && connectionId) {
        device = this.savedDevices.find(d => 
          d.connectionId === connectionId || 
          d.macAddress === connectionId ||
          d.connectionId === trackerDevice?.macAddress ||
          d.macAddress === trackerDevice?.macAddress ||
          (trackerDevice && d.connectionId === trackerDevice.connectionId) ||
          (trackerDevice && d.macAddress === trackerDevice.connectionId)
        ) || this.discoveredDevices.find(d =>
          d.connectionId === connectionId || 
          d.macAddress === connectionId ||
          (trackerDevice && d.connectionId === trackerDevice.connectionId) ||
          (trackerDevice && d.macAddress === trackerDevice.connectionId)
        );
      }
      
      // Check if this is a child device by looking at trackerManager device
      const isChildDevice = trackerDevice?.parentHub !== undefined;
      
      // Store quaternion data by trackerManager deviceId (always use this for updates)
      // CRITICAL: Always use trackerManager deviceId for child devices (hand/forearm)
      // This ensures we can update dials correctly using the same ID pattern
      this.deviceQuaternionData.set(deviceId, { quaternion, timestamp });
      
      // ALWAYS update dials using trackerManager deviceId (works for hub, hand, and forearm)
      // This is similar to DeviceCard.ts which listens to every update event
      import('./SavedDeviceConnectionCard').then(({ updateDeviceDials: updateSaved }) => {
        import('./NewDeviceConnectionCard').then(({ updateDeviceDials: updateNew }) => {
          // Try both card types - one will match
          updateSaved(deviceId, { quaternion, timestamp });
          updateNew(deviceId, { quaternion, timestamp });
        });
      });
      
      // Also try to update data view using trackerManager deviceId
      this.updateDeviceDataView(deviceId);
      
      if (device) {
        // Store quaternion data using the saved/discovered device's ID as well (for backward compatibility)
        // But primary updates use trackerManager deviceId above
        const deviceIdForData = device.id;
        
        // Check if this is the first data packet for this device (for child devices, trigger re-render)
        const isFirstPacket = !this.deviceQuaternionData.has(deviceIdForData);
        
        this.deviceQuaternionData.set(deviceIdForData, { quaternion, timestamp });
        
        // If this is a child device's first data packet, re-render parent hub card to show child data stream
        if (isChildDevice && trackerDevice?.parentHub && isFirstPacket) {
          const parentHub = this.savedDevices.find(d => d.id === trackerDevice.parentHub) || 
                           this.discoveredDevices.find(d => d.id === trackerDevice.parentHub);
          if (parentHub) {
            // First data packet - re-render parent hub card to show child data stream
            if (this.savedDevices.find(d => d.id === trackerDevice.parentHub)) {
              this.renderSavedDevices();
            } else {
              this.renderDiscoveredDevices();
            }
          }
        }
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

    // Listen for connection state changes
    this.deviceConnectionStateManager.addEventListener('connectionStateChanged', () => {
      this.updateConnectionCount();
      this.updateCalibrateAllButtonState();
    });

    // Calibrate all button
    if (this.calibrateAllBtn) {
      this.calibrateAllBtn.addEventListener('click', () => this.handleCalibrateAll());
    }
    
    // Initial button state update
    this.updateCalibrateAllButtonState();
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
      
      // Match saved devices with trackerManager devices by connectionId/macAddress
      // and preserve connection status (for devices already in trackerManager)
      const trackerDevices = this.trackerManager.getAllDevices();
      this.savedDevices.forEach(savedDevice => {
        const connectionId = savedDevice.connectionId || savedDevice.macAddress;
        if (connectionId) {
          // Find matching device in trackerManager
          const matchedTrackerDevice = trackerDevices.find(trackerDevice =>
            trackerDevice.connectionId === connectionId ||
            trackerDevice.macAddress === connectionId ||
            trackerDevice.connectionId === savedDevice.macAddress ||
            trackerDevice.macAddress === savedDevice.macAddress
          );
          
          if (matchedTrackerDevice) {
            // Update connection status to match trackerManager
            savedDevice.isConnected = matchedTrackerDevice.isConnected;
            // Also update the device ID to match trackerManager's ID for consistent connections
            // We keep the API ID for saving, but use trackerManager ID for connections
            if (matchedTrackerDevice.isConnected) {
              console.log(`Found connected device: ${savedDevice.name}, matched to trackerManager device: ${matchedTrackerDevice.id}`);
              
              // IMPORTANT: Update EidonDevice.color with saved database color for already-connected devices
              // This ensures colors are synced when saved devices are loaded
              if (savedDevice.color && matchedTrackerDevice.color !== savedDevice.color) {
                matchedTrackerDevice.color = savedDevice.color;
                // Dispatch deviceInfoUpdated event so App.ts can sync to DeviceStore
                this.trackerManager.dispatchEvent(new CustomEvent('deviceInfoUpdated', { 
                  detail: { deviceId: matchedTrackerDevice.id, device: matchedTrackerDevice } 
                }));
              }
            }
          }
        }
      });
      
      this.renderSavedDevices();
      
      // Dispatch event so Controls can check for outdated devices
      document.dispatchEvent(new CustomEvent('savedDevicesLoaded'));

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

    // Hide the title when logged out
    title.classList.add('display-hidden');
    
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
      firmwareVersion: device.version || device.firmwareVersion, // API returns 'version', fallback to 'firmwareVersion'
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
      case 4: return DeviceRole.LEFT_SHOULDER;
      case 5: return DeviceRole.RIGHT_SHOULDER;
      case 6: return DeviceRole.CHEST;
      case 8: return DeviceRole.LEFT_GLOVE;
      case 9: return DeviceRole.RIGHT_GLOVE;
      default: return DeviceRole.UNKNOWN;
    }
  }

  private isHubRole(apiPosition: number): boolean {
    // Hubs are now right-side devices (RIGHT_HAND, RIGHT_FOREARM, RIGHT_SHOULDER) and chest
    return apiPosition === 1 || apiPosition === 3 || apiPosition === 5 || apiPosition === 6; // RIGHT_HAND, RIGHT_FOREARM, RIGHT_SHOULDER, CHEST
  }

  private getParentHub(device: any, allDevices: any[]): string | undefined {
    // Left devices connect to corresponding right devices via ESP-NOW
    if (device.position === 0) { // LEFT_HAND
      const rightHand = allDevices.find(d => d.position === 1); // RIGHT_HAND (hub)
      return rightHand?.id;
    } else if (device.position === 2) { // LEFT_FOREARM
      const rightForearm = allDevices.find(d => d.position === 3); // RIGHT_FOREARM (hub)
      return rightForearm?.id;
    } else if (device.position === 4) { // LEFT_SHOULDER
      const rightShoulder = allDevices.find(d => d.position === 5); // RIGHT_SHOULDER (hub)
      return rightShoulder?.id;
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

    // Get all devices from trackerManager (including child devices) for rendering child device data streams
    const allTrackerDevices = this.trackerManager.getAllDevices();
    
    // Sync device statuses from trackerManager to savedDevices
    this.savedDevices.forEach(savedDevice => {
      const trackerDevice = allTrackerDevices.find(d => d.id === savedDevice.id);
      if (trackerDevice) {
        savedDevice.isConnected = trackerDevice.isConnected;
        // Also sync other properties that might have changed
        Object.assign(savedDevice, trackerDevice);
      }
    });
    
    // Don't add child devices to savedDevices - they're handled by DeviceConnectionStateManager
    
    // Sort devices: hubs first (right side or chest), then left non-hub devices
    const hubDevices = this.savedDevices.filter(device => 
      device.isHub || device.role === DeviceRole.CHEST
    );
    const leftNonHubDevices = this.savedDevices.filter(device => 
      !device.isHub && device.role !== DeviceRole.CHEST &&
      (device.role === DeviceRole.LEFT_HAND || 
       device.role === DeviceRole.LEFT_FOREARM || 
       device.role === DeviceRole.LEFT_SHOULDER)
    );
    
    // Render hub devices first
    const hubHtml = hubDevices.map(device => {
      const config = this.deviceConfigs.get(device.id);
      const hasChanges = this.hasDeviceChanges(device, config);
      const isEditMode = this.deviceEditStates.get(device.id) || false;
      const isNameEditing = this.deviceNameEditStates.get(device.id) || false;
      return createSavedDeviceCard(device, allTrackerDevices, config?.selectedColor, config?.selectedRole, config?.selectedName, hasChanges, isEditMode, isNameEditing, this.deviceQuaternionData, this.deviceRawData);
    }).join('');
    
    // Add divider if we have both hub and left devices
    const leftDevicesHtml = leftNonHubDevices.map(device => {
      const config = this.deviceConfigs.get(device.id);
      const hasChanges = this.hasDeviceChanges(device, config);
      const isEditMode = this.deviceEditStates.get(device.id) || false;
      const isNameEditing = this.deviceNameEditStates.get(device.id) || false;
      return createSavedDeviceCard(device, allTrackerDevices, config?.selectedColor, config?.selectedRole, config?.selectedName, hasChanges, isEditMode, isNameEditing, this.deviceQuaternionData, this.deviceRawData);
    }).join('');
    
    const dividerHtml = (hubDevices.length > 0 && leftNonHubDevices.length > 0) 
      ? `<div class="${styles.divider}" style="margin: 1rem 0;">
          <button class="${styles.sectionToggle}" data-section="left-devices">
            <i class="fas fa-chevron-down ${styles.sectionToggleIcon}"></i>
            <h3 class="${styles.title}">Left Side devices (child devices)</h3>
          </button>
          <div class="${styles.collapsibleSection}" data-section="left-devices" style="display: block;">
            <div class="${styles.devicesContainer}">
              ${leftDevicesHtml}
            </div>
          </div>
        </div>`
      : leftNonHubDevices.length > 0 ? `<div class="${styles.devicesContainer}">${leftDevicesHtml}</div>` : '';

    container.innerHTML = hubHtml + dividerHtml;
    setSavedDeviceCardStyles(container);
    this.attachDeviceEventListeners();
    this.updateVersionWarnings();
    
    // Update dials for devices with quaternion data (HTML is already rendered, just update canvases)
    import('./SavedDeviceConnectionCard').then(({ updateDeviceDials }) => {
      const allTrackerDevicesForMount = this.trackerManager.getAllDevices();
      const allDeviceIds = new Set([
        ...this.savedDevices.map(d => d.id),
        ...allTrackerDevicesForMount.map(d => d.id)
      ]);
      
      allDeviceIds.forEach(deviceId => {
        const quatData = this.deviceQuaternionData.get(deviceId);
        if (quatData) {
          updateDeviceDials(deviceId, quatData);
        }
      });
    });
    
    // Restore edit state (show config section if it was previously visible)
    this.deviceEditStates.forEach((isVisible, deviceId) => {
      if (isVisible) {
        const configSection = this.modal.querySelector(`.${savedCardStyles.configSection}[data-device-id="${deviceId}"]`) as HTMLElement;
        if (configSection) {
          configSection.style.display = 'block';
        }
      }
    });

    // Restore name edit states
    this.deviceNameEditStates.forEach((isEditing, deviceId) => {
      if (isEditing) {
        // Name editing state will be preserved through re-render via isNameEditing parameter
        // Focus the input after render
        setTimeout(() => {
          const nameInput = this.modal.querySelector(`.${savedCardStyles.deviceNameInput}[data-device-id="${deviceId}"]`) as HTMLInputElement;
          if (nameInput) {
            nameInput.focus();
            nameInput.select();
          }
        }, 0);
      }
    });
    
    // Restore data view state (show data stream if it was previously visible)
    this.deviceDataViewStates.forEach((isVisible, deviceId) => {
      if (isVisible) {
        const dataContent = this.modal.querySelector(`.${savedCardStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
        const toggleBtn = this.modal.querySelector(`.${savedCardStyles.dataToggle}[data-device-id="${deviceId}"]`) as HTMLElement;
        const icon = toggleBtn?.querySelector(`.${savedCardStyles.dataToggleIcon}`) as HTMLElement;
        if (dataContent && toggleBtn && icon) {
          dataContent.style.display = 'block';
          icon.style.transform = 'rotate(180deg)';
        }
      }
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

    // Delete buttons (saved devices only) - show confirmation
    this.modal.querySelectorAll(`.${savedCardStyles.deleteBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.showDeleteConfirmation(deviceId));
      }
    });

    // Delete confirmation buttons
    this.modal.querySelectorAll(`.${savedCardStyles.deleteConfirmBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleDeviceDelete(deviceId));
      }
    });

    // Delete cancel buttons
    this.modal.querySelectorAll(`.${savedCardStyles.deleteCancelBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.hideDeleteConfirmation(deviceId));
      }
    });

    // Warning icon buttons (saved devices only)
    this.modal.querySelectorAll(`.${savedCardStyles.warningIcon}`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = '/update';
      });
    });

    // Color dropdown triggers (both lists) - using shared styles
    this.modal.querySelectorAll(`.${colorDropdownStyles.colorDropdownTrigger}`).forEach(trigger => {
      const deviceId = trigger.getAttribute('data-device-id');
      if (!deviceId) return;

      // Toggle dropdown on click
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrapper = trigger.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
        const menu = wrapper?.querySelector(`.${colorDropdownStyles.colorDropdownMenu}`) as HTMLElement;
        const isOpen = menu?.style.display !== 'none';
        
        // Close all other dropdowns
        this.modal.querySelectorAll(`.${colorDropdownStyles.colorDropdownMenu}`).forEach(otherMenu => {
          if (otherMenu !== menu) {
            (otherMenu as HTMLElement).style.display = 'none';
            const otherWrapper = otherMenu.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
            if (otherWrapper) otherWrapper.removeAttribute('data-open');
          }
        });

        if (menu && wrapper) {
          menu.style.display = isOpen ? 'none' : 'block';
          if (isOpen) {
            wrapper.removeAttribute('data-open');
          } else {
            wrapper.setAttribute('data-open', 'true');
          }
        }
      });
    });

    // Color option clicks (both lists) - using shared styles
    this.modal.querySelectorAll(`.${colorDropdownStyles.colorOption}`).forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const deviceId = option.getAttribute('data-device-id');
        const colorValue = option.getAttribute('data-value');
        
        if (deviceId && colorValue) {
          const wrapper = option.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
          const menu = wrapper?.querySelector(`.${colorDropdownStyles.colorDropdownMenu}`) as HTMLElement;
          const trigger = wrapper?.querySelector(`.${colorDropdownStyles.colorDropdownTrigger}`) as HTMLElement;
          const hiddenInput = wrapper?.querySelector(`.${colorDropdownStyles.colorSelector}`) as HTMLInputElement;

          // Update hidden input value
          if (hiddenInput) {
            hiddenInput.value = colorValue;
          }

          // Update trigger display
          if (trigger) {
            const colorCircle = trigger.querySelector(`.${colorDropdownStyles.colorCircle}`) as HTMLElement;
            const colorText = trigger.querySelector(`.${colorDropdownStyles.colorDropdownText}`) as HTMLElement;
            
            const optionText = option.querySelector(`.${colorDropdownStyles.colorLabel}`)?.textContent || '';
            
            if (colorCircle && colorValue) {
              colorCircle.style.backgroundColor = colorValue;
            }
            if (colorText) {
              colorText.textContent = optionText;
            }
          }

          // Update selected state
          wrapper?.querySelectorAll(`.${colorDropdownStyles.colorOption}`).forEach(opt => {
            opt.classList.remove(colorDropdownStyles.colorOptionSelected);
          });
          option.classList.add(colorDropdownStyles.colorOptionSelected);

          // Close menu
          if (menu) {
            menu.style.display = 'none';
          }
          if (wrapper) {
            wrapper.removeAttribute('data-open');
          }

          // Trigger color change handler
          this.handleColorChange(deviceId, colorValue);
        }
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${colorDropdownStyles.colorDropdownWrapper}`)) {
        this.modal.querySelectorAll(`.${colorDropdownStyles.colorDropdownMenu}`).forEach(menu => {
          (menu as HTMLElement).style.display = 'none';
          const wrapper = menu.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
          if (wrapper) wrapper.removeAttribute('data-open');
        });
      }
    }, true);

    // Role selectors (both lists) - using shared styles
    this.modal.querySelectorAll(`.${roleSelectorStyles.roleSelector}`).forEach(select => {
      select.addEventListener('change', (e) => {
        const deviceId = (e.target as HTMLSelectElement).getAttribute('data-device-id');
        const roleValue = parseInt((e.target as HTMLSelectElement).value);
        if (deviceId) {
          this.handleRoleChange(deviceId, roleValue);
        }
      });
    });

    // Name edit icon buttons (saved devices only)
    this.modal.querySelectorAll(`.${savedCardStyles.nameEditIcon}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleNameEditClick(deviceId));
      }
    });

    // Name input fields (saved devices only)
    this.modal.querySelectorAll(`.${savedCardStyles.deviceNameInput}`).forEach(input => {
      const deviceId = (input as HTMLInputElement).getAttribute('data-device-id');
      if (deviceId) {
        // Use input event to update config without re-rendering
        input.addEventListener('input', (e) => {
          const nameValue = (e.target as HTMLInputElement).value;
          // Update config directly without triggering re-render
          const config = this.deviceConfigs.get(deviceId) || {};
          config.selectedName = nameValue;
          this.deviceConfigs.set(deviceId, config);
          
          // Update save button state without re-rendering
          const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
          if (device) {
            const hasChanges = this.hasDeviceChanges(device, config);
            const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
            const cardStyles = isSaved ? savedCardStyles : newCardStyles;
            const saveBtn = this.modal.querySelector(`[data-device-id="${deviceId}"].${cardStyles.saveBtn}`) as HTMLButtonElement;
            if (saveBtn) {
              saveBtn.disabled = !hasChanges;
            }
          }
        });
        input.addEventListener('blur', () => {
          this.handleNameInputBlur(deviceId);
        });
        input.addEventListener('keydown', (e: Event) => {
          this.handleNameInputKeyDown(deviceId, e as KeyboardEvent);
        });
      }
    });

    // Calibrate buttons (both lists)
    this.modal.querySelectorAll(`.${newCardStyles.calibrateBtn}, .${savedCardStyles.calibrateBtn}`).forEach(btn => {
      const deviceId = btn.getAttribute('data-device-id');
      if (deviceId) {
        btn.addEventListener('click', () => this.handleDeviceCalibrate(deviceId));
      }
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

    // Raw data toggle buttons (saved devices only)
    this.modal.querySelectorAll(`.${savedCardStyles.rawDataToggle}`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest(`.${savedCardStyles.rawDataToggle}`) as HTMLElement;
        const rawDataId = button?.getAttribute('data-raw-data-id');
        if (rawDataId) {
          this.toggleRawDataView(rawDataId);
        }
      });
    });

    // Section toggle buttons (for collapsible sections)
    this.modal.querySelectorAll(`.${styles.sectionToggle}`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest(`.${styles.sectionToggle}`) as HTMLElement;
        const sectionName = button?.getAttribute('data-section');
        if (sectionName) {
          this.toggleSection(sectionName);
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
    
    // Track the data view state to preserve across re-renders
    this.deviceDataViewStates.set(deviceId, isHidden);
  }

  private toggleRawDataView(rawDataId: string): void {
    const toggleBtn = this.modal.querySelector(`.${savedCardStyles.rawDataToggle}[data-raw-data-id="${rawDataId}"]`) as HTMLElement;
    const rawDataContent = this.modal.querySelector(`.${savedCardStyles.rawDataContent}[data-raw-data-id="${rawDataId}"]`) as HTMLElement;
    const icon = toggleBtn?.querySelector(`.${savedCardStyles.rawDataToggleIcon}`) as HTMLElement;
    
    if (!rawDataContent || !toggleBtn || !icon) return;

    const isHidden = rawDataContent.style.display === 'none';
    rawDataContent.style.display = isHidden ? 'block' : 'none';
    icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  private toggleSection(sectionName: string): void {
    const toggleBtn = this.modal.querySelector(`.${styles.sectionToggle}[data-section="${sectionName}"]`) as HTMLElement;
    const sectionContent = this.modal.querySelector(`.${styles.collapsibleSection}[data-section="${sectionName}"]`) as HTMLElement;
    const icon = toggleBtn?.querySelector(`.${styles.sectionToggleIcon}`) as HTMLElement;
    
    if (!sectionContent || !toggleBtn || !icon) return;

    const isHidden = sectionContent.style.display === 'none';
    sectionContent.style.display = isHidden ? 'block' : 'none';
    icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  private async updateDeviceDataView(deviceId: string): Promise<void> {
    // Get quaternion data by trackerManager deviceId (always use this for updates)
    const quatData = this.deviceQuaternionData.get(deviceId);
    if (!quatData) return;
    
    // Try to find device in saved/discovered lists
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    
    // Determine if it's a saved or new device
    const isSaved = device ? this.savedDevices.find(d => d.id === deviceId) !== undefined : undefined;
    
    // Try both card styles if device not found (might be child device nested in parent card)
    const cardStylesList = isSaved !== undefined 
      ? [isSaved ? savedCardStyles : newCardStyles]
      : [savedCardStyles, newCardStyles];
    
    // Try to find data content in either card type
    let dataContent: HTMLElement | null = null;
    let cardStyles: typeof savedCardStyles | typeof newCardStyles | null = null;
    
    for (const styles of cardStylesList) {
      dataContent = this.modal.querySelector(`.${styles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
      if (dataContent) {
        cardStyles = styles;
        break;
      }
    }
    
    // If not found by deviceId, might be a child device - try to find parent hub card and search within it
    if (!dataContent) {
      const trackerDevice = this.trackerManager.getDevice(deviceId);
      if (trackerDevice?.parentHub) {
        // Find parent hub card
        const parentHub = this.savedDevices.find(d => d.id === trackerDevice.parentHub) || 
                         this.discoveredDevices.find(d => d.id === trackerDevice.parentHub);
        if (parentHub) {
          const parentIsSaved = this.savedDevices.find(d => d.id === parentHub.id) !== undefined;
          const parentCardStyles = parentIsSaved ? savedCardStyles : newCardStyles;
          const parentDataContent = this.modal.querySelector(`.${parentCardStyles.dataContent}[data-device-id="${parentHub.id}"]`) as HTMLElement;
          
          if (parentDataContent) {
            // Search for child device section within parent card
            dataContent = parentDataContent.querySelector(`.${parentCardStyles.deviceDataSection}[data-device-id="${deviceId}"]`) as HTMLElement;
            if (dataContent) {
              cardStyles = parentCardStyles;
            }
          }
        }
      }
    }
    
    if (!dataContent || dataContent.style.display === 'none') {
      return;
    }
    
    if (!cardStyles) return;

    const { updateDeviceDials } = await import(cardStyles === savedCardStyles ? './SavedDeviceConnectionCard' : './NewDeviceConnectionCard');
    const dialCanvas = dataContent.querySelector(`.${cardStyles.dialCanvas}`);
    if (!dialCanvas) {
      // Re-render the specific device card to update data view
      if (device && this.savedDevices.find(d => d.id === deviceId)) {
        this.renderSavedDevices();
      } else if (device) {
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
    const newDataContent = this.modal.querySelector(`.${cardStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
    if (newDataContent) {
      newDataContent.style.display = 'block';
      const toggleBtn = this.modal.querySelector(`.${cardStyles.dataToggle}[data-device-id="${deviceId}"]`) as HTMLElement;
      const icon = toggleBtn?.querySelector(`.${cardStyles.dataToggleIcon}`) as HTMLElement;
      if (icon) {
        icon.style.transform = 'rotate(180deg)';
      }
    }
  }

  private hasDeviceChanges(device: EidonDevice, config?: { selectedColor?: string; selectedRole?: DeviceRole; selectedName?: string }): boolean {
    if (!config) return false;
    const colorChanged = config.selectedColor !== undefined && config.selectedColor !== device.color;
    const roleChanged = config.selectedRole !== undefined && config.selectedRole !== device.role;
    const nameChanged = config.selectedName !== undefined && config.selectedName !== device.name && config.selectedName.trim() !== '';
    return colorChanged || roleChanged || nameChanged;
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

  private handleNameChange(deviceId: string, name: string): void {
    const config = this.deviceConfigs.get(deviceId) || {};
    config.selectedName = name;
    this.deviceConfigs.set(deviceId, config);
    
    // Update save button state without re-rendering (to preserve input focus)
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    if (device) {
      const hasChanges = this.hasDeviceChanges(device, config);
      const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
      const cardStyles = isSaved ? savedCardStyles : newCardStyles;
      const saveBtn = this.modal.querySelector(`[data-device-id="${deviceId}"].${cardStyles.saveBtn}`) as HTMLButtonElement;
      if (saveBtn) {
        saveBtn.disabled = !hasChanges;
      }
    }
  }

  private async handleDeviceCalibrate(deviceId: string): Promise<void> {
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    if (!device || !device.isConnected) {
      console.error('Device not connected for calibration:', deviceId);
      return;
    }

    // Get connectionId from the button's data attribute or device
    const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
    const cardStyles = isSaved ? savedCardStyles : newCardStyles;
    const calibrateBtn = this.modal.querySelector(`[data-device-id="${deviceId}"].${cardStyles.calibrateBtn}`) as HTMLButtonElement;
    if (!calibrateBtn) return;

    const connectionId = calibrateBtn.getAttribute('data-connection-id') || device.connectionId || device.macAddress;
    if (!connectionId) {
      console.error('No connectionId found for calibration:', deviceId);
      return;
    }

    try {
      calibrateBtn.disabled = true;
      calibrateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      await this.trackerManager.calibrateDevice(connectionId);
      
      calibrateBtn.innerHTML = '<i class="fas fa-check"></i> Calibrated';
      setTimeout(() => {
        calibrateBtn.innerHTML = '<i class="fas fa-compass"></i> Calibrate';
        calibrateBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('Calibration failed:', error);
      calibrateBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
      setTimeout(() => {
        calibrateBtn.innerHTML = '<i class="fas fa-compass"></i> Calibrate';
        calibrateBtn.disabled = false;
      }, 2000);
    }
  }

  private async handleDeviceSave(deviceId: string): Promise<void> {
    const device = this.savedDevices.find(d => d.id === deviceId) || this.discoveredDevices.find(d => d.id === deviceId);
    if (!device) return;

    // For saved devices, allow saving even when disconnected (updating via API)
    // For new/discovered devices, require connection
    const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
    if (!isSaved && !device.isConnected) return;

    const config = this.deviceConfigs.get(deviceId);
    if (!config || !this.hasDeviceChanges(device, config)) return;

    // Determine which card type
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
      // For devices from NewDeviceConnectionCard, isSaved will be false, so isUpdate = false
      const isUpdate = isSaved;
      
      // Get color, role, and name to save
      const colorToSave = config.selectedColor || device.color || 'rgb(40, 40, 40)'; // Default to black
      const positionToSave = config.selectedRole !== undefined ? config.selectedRole : device.role;
      const nameToSave = config.selectedName !== undefined && config.selectedName.trim() !== '' 
        ? config.selectedName.trim() 
        : device.name;

      // Build request body according to CreateDeviceDto (POST) or UpdateDeviceDto (PUT)
      const requestBody: any = {
        name: nameToSave,
        type: 'tracker', // TODO: Check if this should be an enum value
        position: positionToSave,
        color: colorToSave
      };

      // Only include connectionId for new devices (POST), not for updates (PUT)
      if (!isUpdate && (device.connectionId || device.macAddress)) {
        requestBody.connectionId = device.connectionId || device.macAddress;
      }

      // For PUT requests, deviceId should be in the URL path
      const url = isUpdate ? `${apiUrl}/devices/${deviceId}` : `${apiUrl}/devices`;
      
      const response = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${state.tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save device: ${response.status} ${errorText}`);
      }

      // Update device with saved values
      device.color = colorToSave;
      device.role = positionToSave;
      device.name = nameToSave;
      
      // Preserve connection state before reloading
      const wasConnected = device.isConnected;
      const trackerDeviceId = device.id; // This is the trackerManager's device ID
      const connectionId = device.connectionId || device.macAddress; // This is the API's connectionId

      // Clear config changes
      this.deviceConfigs.delete(deviceId);

      // For new devices, remove from discovered devices list
      if (!isUpdate) {
        const discoveredIndex = this.discoveredDevices.findIndex(d => d.id === deviceId);
        if (discoveredIndex !== -1) {
          this.discoveredDevices.splice(discoveredIndex, 1);
          this.renderDiscoveredDevices();
        }
      }

      // Reload saved devices to refresh from API (device will now appear in saved devices)
      await this.loadSavedDevices();

      // If device was connected, reconnect it using the trackerManager device ID
      if (wasConnected && connectionId) {
        // Find the device in trackerManager by connectionId
        const trackerDevices = this.trackerManager.getAllDevices();
        const matchedDevice = trackerDevices.find(d => 
          d.connectionId === connectionId || d.macAddress === connectionId
        );

        if (matchedDevice) {
          console.log(`Reconnecting to device after save: ${matchedDevice.name} (${matchedDevice.id})`);
          // Try to reconnect with retry logic
          await this.reconnectDeviceWithRetry(matchedDevice.id);
        } else {
          console.warn(`Could not find device with connectionId ${connectionId} in trackerManager`);
        }
      }

      console.log(`Successfully saved device: ${device.name}`);
      
      // Close config section after successful save
      this.deviceEditStates.set(deviceId, false);
      const configSection = this.modal.querySelector(`.${savedCardStyles.configSection}[data-device-id="${deviceId}"]`) as HTMLElement;
      if (configSection) {
        configSection.style.display = 'none';
      }
    } catch (error) {
      console.error(`Failed to save device ${deviceId}:`, error);
      // Show error to user
      alert(`Failed to save device: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
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


  /**
   * Try to connect to a device using previously paired Bluetooth devices (no popup)
   * Returns true if connection successful, false otherwise
   */
  private async tryConnectUsingPairedDevices(savedDevice: EidonDevice): Promise<boolean> {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth || typeof bluetooth.getDevices !== 'function') {
      console.log('[DeviceModal] Bluetooth getDevices() not available');
      return false;
    }

    try {
      // Get previously paired devices (no popup)
      const pairedDevices = await bluetooth.getDevices();
      console.log(`[DeviceModal] Found ${pairedDevices.length} paired devices`);

      // Find matching device by name or connectionId
      const matchingPairedDevice = pairedDevices.find((paired: any) => {
        // Match by connectionId or macAddress
        if (savedDevice.connectionId && 
            (paired.id === savedDevice.connectionId || paired.id === savedDevice.macAddress)) {
          return true;
        }
        // Match by device name (case-insensitive, must contain "eidon")
        const pairedName = (paired.name || '').trim().toLowerCase();
        const savedName = (savedDevice.name || '').trim().toLowerCase();
        return pairedName === savedName && pairedName.includes('eidon');
      });

      if (!matchingPairedDevice) {
        console.log(`[DeviceModal] No matching paired device found for ${savedDevice.name}`);
        return false;
      }

      console.log(`[DeviceModal] Found matching paired device: ${matchingPairedDevice.name} (${matchingPairedDevice.id})`);

      // Check if device is already in trackerManager
      let trackerDevice = this.trackerManager.getAllDevices().find(d => 
        d.connectionId === matchingPairedDevice.id ||
        d.macAddress === matchingPairedDevice.id ||
        (d.name && matchingPairedDevice.name && d.name.toLowerCase() === matchingPairedDevice.name.toLowerCase())
      );

      // If not in trackerManager, try to add it by processing the paired device
      // We need to wait a bit for autoReconnect to potentially add it, or trigger a refresh
      if (!trackerDevice) {
        console.log(`[DeviceModal] Device not in trackerManager yet, attempting to add via connection`);
        
        // The device connection logic in trackerManager's performConnection should handle
        // adding the device when we connect using a BluetoothDevice directly
        // But we need the device to be in trackerManager first to call connectToDevice
        // 
        // Actually, looking at the code flow: performConnection requires device to be in trackerManager
        // So we need a different approach. Let's create a minimal device entry based on saved device
        // info, add it to trackerManager, then connect
        
        // For now, let's wait a moment and check again (autoReconnect might add it)
        await new Promise(resolve => setTimeout(resolve, 500));
        trackerDevice = this.trackerManager.getAllDevices().find(d => 
          d.connectionId === matchingPairedDevice.id ||
          d.macAddress === matchingPairedDevice.id ||
          (d.name && matchingPairedDevice.name && d.name.toLowerCase() === matchingPairedDevice.name.toLowerCase())
        );
        
        if (!trackerDevice) {
          console.log(`[DeviceModal] Device still not in trackerManager after wait`);
          return false;
        }
      }

      // Device is in trackerManager, connect to it
      console.log(`[DeviceModal] Connecting to device in trackerManager: ${trackerDevice.id}`);
      const success = await this.reconnectDeviceWithRetry(trackerDevice.id, 3);
      
      if (success) {
        savedDevice.isConnected = true;
        this.updateDeviceConnectionStatus(savedDevice.id, true);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[DeviceModal] Error connecting via paired devices:', error);
      return false;
    }
  }

  private async reconnectDeviceWithRetry(deviceId: string, maxRetries: number = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const success = await this.trackerManager.connectToDevice(deviceId);
        if (success) {
          return true;
        }
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.log(`Reconnection failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Reconnection attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`Failed to reconnect to device after ${maxRetries} attempts: ${deviceId}`);
    return false;
  }

  private async handleDeviceConnect(deviceId: string): Promise<void> {
    // Check both saved and discovered devices
    let device = this.savedDevices.find(d => d.id === deviceId);
    if (!device) {
      device = this.discoveredDevices.find(d => d.id === deviceId);
    }
    if (!device) return;

    // Prevent connection attempts if device is currently disconnecting
    if (this.deviceDisconnecting.has(deviceId)) {
      console.log(`Device ${deviceId} is currently disconnecting, ignoring connect request`);
      return;
    }

    // Determine which card type
    const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
    const cardStyles = isSaved ? savedCardStyles : newCardStyles;
    const connectBtn = this.modal.querySelector(`[data-device-id="${deviceId}"] .${cardStyles.connectBtn}`) as HTMLButtonElement;
    if (!connectBtn) return;

    try {
      if (device.isConnected) {
        // Mark device as disconnecting to prevent reconnection attempts
        this.deviceDisconnecting.add(deviceId);
        
        // Set loading state for disconnect
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Disconnecting...';
        console.log(`Disconnecting device: ${deviceId}`);

        // Find the trackerManager device to get the correct device ID for disconnection
        let trackerDevice = this.trackerManager.getDevice(deviceId);
        if (!trackerDevice && device.connectionId) {
          const allTrackerDevices = this.trackerManager.getAllDevices();
          trackerDevice = allTrackerDevices.find(d => 
            d.connectionId === device.connectionId || 
            d.macAddress === device.connectionId ||
            d.connectionId === device.macAddress ||
            d.macAddress === device.macAddress
          );
        }

        if (trackerDevice) {
          await this.trackerManager.disconnectDevice(trackerDevice.id);
          console.log(`Successfully disconnected device: ${trackerDevice.name} (${trackerDevice.id})`);
        } else {
          // Fallback to original deviceId
          await this.trackerManager.disconnectDevice(deviceId);
          console.log(`Successfully disconnected device: ${deviceId}`);
        }

        // Immediately update device status to prevent accidental reconnection
        device.isConnected = false;
        
        // Update UI - this will re-render the card with "Connect" button
        this.updateDeviceConnectionStatus(deviceId, false);
        
        // Remove from disconnecting set - disconnect is complete
        this.deviceDisconnecting.delete(deviceId);
        
        // Early return to prevent any further execution
        return;
      } else {
        // Set loading state for connect
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        // Use connectionId only - API id is only for backend/database, not BLE
        const connectionId = device.connectionId || device.macAddress;
        if (!connectionId) {
          console.error(`Cannot connect: device missing connectionId`);
          connectBtn.disabled = false;
          return;
        }
        
        // Step 1: Lookup device in trackerManager by connectionId
        let trackerDevice = this.trackerManager.getDeviceByConnectionId(connectionId);
        
        // Step 2: If not present, register it first
        if (!trackerDevice) {
          try {
            const registeredDevice = await this.trackerManager.registerDeviceByName(device.name, connectionId);
            if (!registeredDevice) {
              console.warn(`Device registration failed or cancelled`);
              connectBtn.disabled = false;
              return;
            }
            trackerDevice = registeredDevice;
          } catch (error) {
            console.error(`Failed to register device:`, error);
            // User may have cancelled the device selection popup
            connectBtn.disabled = false;
            return;
          }
        }
        
        // Step 3: Connect to the device
        const success = await this.reconnectDeviceWithRetry(trackerDevice.id, 3);
        
        if (success) {
          // Update the saved/discovered device's connection status
          device.isConnected = true;
          device.connectionId = trackerDevice.connectionId;
          device.macAddress = trackerDevice.macAddress || trackerDevice.connectionId;
          this.updateDeviceConnectionStatus(deviceId, true);
          
          // Sync quaternion data from trackerManager deviceId to saved device ID
          const quatData = this.deviceQuaternionData.get(trackerDevice.id);
          if (quatData) {
            this.deviceQuaternionData.set(deviceId, quatData);
            // Update the data view and dials immediately
            this.updateDeviceDataView(deviceId);
            const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
            import(isSaved ? './SavedDeviceConnectionCard' : './NewDeviceConnectionCard').then(({ updateDeviceDials }) => {
              updateDeviceDials(deviceId, quatData);
            });
          }
        } else {
          // Step 4: If connection failed, try connectByName as fallback
          console.log(`Direct connection failed. Attempting connection by name: ${device.name}`);
          try {
            const connectedDevice = await this.trackerManager.connectToDeviceByName(
              device.name,
              connectionId
            );
            
            if (connectedDevice && connectedDevice.isConnected) {
              console.log(`Successfully connected via name: ${connectedDevice.name} (${connectedDevice.id})`);
              device.connectionId = connectedDevice.connectionId;
              device.macAddress = connectedDevice.macAddress || connectedDevice.connectionId;
              device.isConnected = true;
              this.updateDeviceConnectionStatus(deviceId, true);
              
              // Sync quaternion data
              const quatData = this.deviceQuaternionData.get(connectedDevice.id);
              if (quatData) {
                this.deviceQuaternionData.set(deviceId, quatData);
                this.updateDeviceDataView(deviceId);
                const isSaved = this.savedDevices.find(d => d.id === deviceId) !== undefined;
                import(isSaved ? './SavedDeviceConnectionCard' : './NewDeviceConnectionCard').then(({ updateDeviceDials }) => {
                  updateDeviceDials(deviceId, quatData);
                });
              }
            } else {
              console.warn(`Connection by name failed or user cancelled: ${device.name}`);
            }
          } catch (error) {
            console.error(`Connection by name failed:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Device connection failed for ${deviceId}:`, error);
      // If we were disconnecting, make sure to clean up the state
      if (this.deviceDisconnecting.has(deviceId)) {
        this.deviceDisconnecting.delete(deviceId);
      }
    } finally {
      // Reset button state only if not disconnected (disconnect path already returns early)
      // For connect path, the button will be updated by updateDeviceConnectionStatus
      if (!this.deviceDisconnecting.has(deviceId)) {
        connectBtn.disabled = false;
      }
      // The button text will be updated by updateDeviceConnectionStatus
    }
  }

  private handleDeviceEdit(deviceId: string): void {
    const device = this.savedDevices.find(d => d.id === deviceId);
    if (!device) return;

    // Toggle visibility of config section (color dropdown, role selector, save button)
    // This works for both connected and disconnected devices
    const configSection = this.modal.querySelector(`.${savedCardStyles.configSection}[data-device-id="${deviceId}"]`) as HTMLElement;
    const editBtn = this.modal.querySelector(`.${savedCardStyles.editBtn}[data-device-id="${deviceId}"]`) as HTMLElement;
    
    if (configSection && editBtn) {
      const isHidden = configSection.style.display === 'none' || configSection.style.display === '';
      
      // If opening edit mode for the first time, initialize config with current device values
      if (isHidden) {
        const existingConfig = this.deviceConfigs.get(deviceId);
        if (!existingConfig) {
          // Initialize config with current device values so dropdowns show current selections
          this.deviceConfigs.set(deviceId, {
            selectedColor: device.color,
            selectedRole: device.role,
            selectedName: device.name
          });
        }
      }
      
      configSection.style.display = isHidden ? 'block' : 'none';
      
      // Update edit state map to preserve state across re-renders
      this.deviceEditStates.set(deviceId, isHidden);
      
      // Re-render to show/hide edit icon next to name and update dropdowns with current values
      this.renderSavedDevices();
    }
  }

  private handleNameEditClick(deviceId: string): void {
    // Enable name editing mode
    this.deviceNameEditStates.set(deviceId, true);
    this.renderSavedDevices();
    
    // Focus the input field after render
    setTimeout(() => {
      const nameInput = this.modal.querySelector(`.${savedCardStyles.deviceNameInput}[data-device-id="${deviceId}"]`) as HTMLInputElement;
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
      }
    }, 0);
  }

  private handleNameInputBlur(deviceId: string): void {
    // Exit name editing mode
    this.deviceNameEditStates.set(deviceId, false);
    this.renderSavedDevices();
  }

  private handleNameInputKeyDown(deviceId: string, e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target as HTMLInputElement;
      input.blur(); // This will trigger handleNameInputBlur
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Cancel editing and restore original name
      const device = this.savedDevices.find(d => d.id === deviceId);
      if (device) {
        const config = this.deviceConfigs.get(deviceId);
        if (config) {
          delete config.selectedName;
          this.deviceConfigs.set(deviceId, config);
        }
      }
      this.deviceNameEditStates.set(deviceId, false);
      this.renderSavedDevices();
    }
  }

  private showDeleteConfirmation(deviceId: string): void {
    const confirmation = this.modal.querySelector(`.${savedCardStyles.deleteConfirmation}[data-device-id="${deviceId}"]`) as HTMLElement;
    if (confirmation) {
      confirmation.style.display = 'block';
    }
  }

  private hideDeleteConfirmation(deviceId: string): void {
    const confirmation = this.modal.querySelector(`.${savedCardStyles.deleteConfirmation}[data-device-id="${deviceId}"]`) as HTMLElement;
    if (confirmation) {
      confirmation.style.display = 'none';
    }
  }

  private async handleDeviceDelete(deviceId: string): Promise<void> {
    const device = this.savedDevices.find(d => d.id === deviceId);
    if (!device) return;

    // Hide confirmation UI
    this.hideDeleteConfirmation(deviceId);

    try {
      const state = this.loginStateManager.getState();
      if (!state.isLoggedIn || !state.tokens?.token) {
        console.error('Must be logged in to delete devices');
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('VITE_API_URL environment variable is not set');
      }

      const response = await fetch(`${apiUrl}/devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${state.tokens.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete device: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Remove device from local list
      this.savedDevices = this.savedDevices.filter(d => d.id !== deviceId);
      
      // Disconnect if connected
      if (device.isConnected) {
        try {
          await this.trackerManager.disconnectDevice(deviceId);
        } catch (error) {
          console.error('Failed to disconnect device during deletion:', error);
        }
      }

      // Re-render saved devices
      this.renderSavedDevices();
    } catch (error) {
      console.error('Failed to delete device:', error);
      // Error is logged, UI will update automatically when device is removed
    }
  }

  private setupRawDataStreams(deviceId: string): void {
    // Get device to determine its role
    const device = this.trackerManager.getDevice(deviceId);
    if (!device) {
      console.warn(`[DeviceModal] setupRawDataStreams: Device not found for ${deviceId}`);
      return;
    }
    
    // Right-side devices (RIGHT_HAND, RIGHT_FOREARM, RIGHT_SHOULDER) are hubs in the new architecture
    const isHub = device.role === DeviceRole.RIGHT_HAND || 
                  device.role === DeviceRole.RIGHT_FOREARM || 
                  device.role === DeviceRole.RIGHT_SHOULDER;
    const isHand = device.role === DeviceRole.LEFT_HAND || device.role === DeviceRole.RIGHT_HAND;
    const isForearm = device.role === DeviceRole.LEFT_FOREARM || device.role === DeviceRole.RIGHT_FOREARM;
    
    console.log(`[DeviceModal] setupRawDataStreams for ${deviceId}: role=${device.role}, isHub=${isHub}, isHand=${isHand}, isForearm=${isForearm}`);

    // Setup hub raw data stream (HUB_RAW_DATA_CHAR_UUID)
    // For hubs: this is their own data → store as 'hub'
    // For hand devices: this is their own data → store as 'hand'
    // For forearm devices: this is their own data → store as 'forearm'
    const hubStream = this.trackerManager.getHubRawDataStream(deviceId);
    if (hubStream) {
      console.log(`[DeviceModal] Setting up hub raw data stream for ${deviceId}`);
      const reader = hubStream.getReader();
      const readHubData = () => {
        reader.read().then(({ done, value }) => {
          if (done) return;
          if (value) {
            // Determine storage key based on device type
            let storageType: 'hub' | 'hand' | 'forearm';
            if (isHand) {
              storageType = 'hand';
            } else if (isForearm) {
              storageType = 'forearm';
            } else {
              storageType = 'hub';
            }
            this.deviceRawData.set(`${deviceId}_${storageType}`, value);
            this.updateRawDataDisplay(deviceId, storageType, value);
          }
          readHubData();
        }).catch((error) => {
          console.warn(`[DeviceModal] Hub raw data stream error for ${deviceId}:`, error);
          // Stream closed or error - stop reading
        });
      };
      readHubData();
    } else {
      console.log(`[DeviceModal] No hub raw data stream available for ${deviceId}`);
    }

    // Setup LEFT raw data stream (LEFT_RAW_DATA_CHAR_UUID)
    // Only right-side hubs have this characteristic - it reports data from corresponding left-side child device
    if (isHub) {
      const leftStream = this.trackerManager.getLeftRawDataStream(deviceId);
      if (leftStream) {
        console.log(`[DeviceModal] Setting up LEFT raw data stream for hub ${deviceId}`);
        const reader = leftStream.getReader();
        const readLeftData = () => {
          reader.read().then(({ done, value }) => {
            if (done) return;
            if (value) {
              console.log(`[DeviceModal] Received LEFT raw data for hub ${deviceId}`);
              // Determine child type based on hub role for storage and display
              const device = this.trackerManager.getDevice(deviceId);
              let childRawDataType: 'hand' | 'forearm' | null = null;
              if (device) {
                if (device.role === DeviceRole.RIGHT_HAND) childRawDataType = 'hand';
                else if (device.role === DeviceRole.RIGHT_FOREARM) childRawDataType = 'forearm';
                // RIGHT_SHOULDER doesn't have raw data (shoulder doesn't have sensors)
              }
              // Store raw data with key format: ${deviceId}_left (for lookup in renderDataContent)
              this.deviceRawData.set(`${deviceId}_left`, value);
              // Update display using the correct type ('hand' or 'forearm') to match renderRawMotionData format
              if (childRawDataType) {
                this.updateRawDataDisplay(deviceId, childRawDataType, value);
              }
            }
            readLeftData();
          }).catch((error) => {
            console.warn(`[DeviceModal] LEFT raw data stream error for ${deviceId}:`, error);
            // Stream closed or error - stop reading
          });
        };
        readLeftData();
      } else {
        console.log(`[DeviceModal] No LEFT raw data stream available for hub ${deviceId}`);
      }
    }
  }

  private updateRawDataDisplay(deviceId: string, type: 'hub' | 'hand' | 'forearm', rawData: RawMotionData): void {
    const dataId = `${deviceId}_${type}_raw`;
    // Find the raw data content section (inside the collapsible section)
    const rawDataContent = this.modal.querySelector(`.${savedCardStyles.rawDataContent}[data-raw-data-id="${dataId}"]`) as HTMLElement;
    if (!rawDataContent) {
      console.warn(`[DeviceModal] Raw data content not found for ${dataId}`);
      return;
    }

    // Check if data attributes exist (data might have arrived before initial render)
    const accelX = rawDataContent.querySelector(`[data-raw-accel-x]`) as HTMLElement;
    
    // If data attributes don't exist, we need to replace the "Waiting for data..." placeholder
    if (!accelX) {
      // Replace placeholder with actual data grid structure
      rawDataContent.innerHTML = `
        <div class="${savedCardStyles.rawDataGrid}">
          <div class="${savedCardStyles.rawDataGroup}">
            <div class="${savedCardStyles.rawDataLabel}" style="color: #ef4444;">Accelerometer (m/s²)</div>
            <div class="${savedCardStyles.rawDataRow}">
              <span>X: <span class="${savedCardStyles.rawDataValue}" data-raw-accel-x>${rawData.accelerometer.x.toFixed(3)}</span></span>
              <span>Y: <span class="${savedCardStyles.rawDataValue}" data-raw-accel-y>${rawData.accelerometer.y.toFixed(3)}</span></span>
              <span>Z: <span class="${savedCardStyles.rawDataValue}" data-raw-accel-z>${rawData.accelerometer.z.toFixed(3)}</span></span>
            </div>
          </div>
          <div class="${savedCardStyles.rawDataGroup}">
            <div class="${savedCardStyles.rawDataLabel}" style="color: #10b981;">Gyroscope (rad/s)</div>
            <div class="${savedCardStyles.rawDataRow}">
              <span>X: <span class="${savedCardStyles.rawDataValue}" data-raw-gyro-x>${rawData.gyroscope.x.toFixed(3)}</span></span>
              <span>Y: <span class="${savedCardStyles.rawDataValue}" data-raw-gyro-y>${rawData.gyroscope.y.toFixed(3)}</span></span>
              <span>Z: <span class="${savedCardStyles.rawDataValue}" data-raw-gyro-z>${rawData.gyroscope.z.toFixed(3)}</span></span>
            </div>
          </div>
          <div class="${savedCardStyles.rawDataGroup}">
            <div class="${savedCardStyles.rawDataLabel}" style="color: #3b82f6;">Magnetometer (µT)</div>
            <div class="${savedCardStyles.rawDataRow}">
              <span>X: <span class="${savedCardStyles.rawDataValue}" data-raw-mag-x>${rawData.magnetometer.x.toFixed(3)}</span></span>
              <span>Y: <span class="${savedCardStyles.rawDataValue}" data-raw-mag-y>${rawData.magnetometer.y.toFixed(3)}</span></span>
              <span>Z: <span class="${savedCardStyles.rawDataValue}" data-raw-mag-z>${rawData.magnetometer.z.toFixed(3)}</span></span>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Update accelerometer values
    if (accelX) accelX.textContent = rawData.accelerometer.x.toFixed(3);
    const accelY = rawDataContent.querySelector(`[data-raw-accel-y]`) as HTMLElement;
    if (accelY) accelY.textContent = rawData.accelerometer.y.toFixed(3);
    const accelZ = rawDataContent.querySelector(`[data-raw-accel-z]`) as HTMLElement;
    if (accelZ) accelZ.textContent = rawData.accelerometer.z.toFixed(3);

    // Update gyroscope values
    const gyroX = rawDataContent.querySelector(`[data-raw-gyro-x]`) as HTMLElement;
    const gyroY = rawDataContent.querySelector(`[data-raw-gyro-y]`) as HTMLElement;
    const gyroZ = rawDataContent.querySelector(`[data-raw-gyro-z]`) as HTMLElement;
    if (gyroX) gyroX.textContent = rawData.gyroscope.x.toFixed(3);
    if (gyroY) gyroY.textContent = rawData.gyroscope.y.toFixed(3);
    if (gyroZ) gyroZ.textContent = rawData.gyroscope.z.toFixed(3);

    // Update magnetometer values
    const magX = rawDataContent.querySelector(`[data-raw-mag-x]`) as HTMLElement;
    const magY = rawDataContent.querySelector(`[data-raw-mag-y]`) as HTMLElement;
    const magZ = rawDataContent.querySelector(`[data-raw-mag-z]`) as HTMLElement;
    if (magX) magX.textContent = rawData.magnetometer.x.toFixed(3);
    if (magY) magY.textContent = rawData.magnetometer.y.toFixed(3);
    if (magZ) magZ.textContent = rawData.magnetometer.z.toFixed(3);
  }

  private updateVersionWarnings(): void {
    const latestVersion = LatestVersionManager.getInstance().getLatestVersion();
    
    // Unsubscribe from previous listener if it exists
    if (this.versionWarningUnsubscribe) {
      this.versionWarningUnsubscribe();
      this.versionWarningUnsubscribe = null;
    }

    const updateWarnings = (version: string | null) => {
      if (!version) return;
      
      this.modal.querySelectorAll(`.${savedCardStyles.warningIcon}`).forEach((btn: Element) => {
        const warningBtn = btn as HTMLElement;
        const deviceVersion = warningBtn.getAttribute('data-device-version');
        
        if (deviceVersion && deviceVersion < version) {
          warningBtn.style.display = 'inline-flex';
        } else {
          warningBtn.style.display = 'none';
        }
      });
    };

    // Initial update
    if (latestVersion) {
      updateWarnings(latestVersion);
    }

    // Listen for latest version changes (only add once)
    this.versionWarningUnsubscribe = LatestVersionManager.getInstance().addListener(updateWarnings);
  }

  private updateDeviceConnectionStatus(deviceId: string, isConnected: boolean): void {
    // Get the device from trackerManager to check if it's a child device
    const trackerDevice = this.trackerManager.getDevice(deviceId);
    const isChildDevice = trackerDevice?.parentHub !== undefined;
    
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
    
    // If this is a child device, also re-render the parent hub card to update child count
    if (isChildDevice && trackerDevice?.parentHub) {
      const parentHub = this.savedDevices.find(d => d.id === trackerDevice.parentHub);
      if (parentHub) {
        // Update parent hub connection status (child devices affect parent's child count)
        // Don't change parent's isConnected, just trigger re-render
        this.renderSavedDevices();
      } else {
        const parentHubDiscovered = this.discoveredDevices.find(d => d.id === trackerDevice.parentHub);
        if (parentHubDiscovered) {
          this.renderDiscoveredDevices();
        }
      }
    }
  }

  private updateDiscoveredDevices(devices: EidonDevice[]): void {
    // Filter out devices that are already in savedDevices
    // Also filter out child devices - they connect through hub characteristics, not BLE directly
    // Match by name (exact) or connectionId/macAddress
    this.discoveredDevices = devices.filter(discoveredDevice => {
      // Filter out child devices - they connect through hub characteristics, not BLE
      if (discoveredDevice.parentHub) {
        return false;
      }
      
      // Filter out devices that are already in savedDevices
      return !this.savedDevices.some(savedDevice => {
        // Match by exact name (case-insensitive)
        if (savedDevice.name && discoveredDevice.name && 
            savedDevice.name.toLowerCase() === discoveredDevice.name.toLowerCase()) {
          return true;
        }
        // Match by connectionId or macAddress
        return (
          savedDevice.connectionId === discoveredDevice.connectionId ||
          savedDevice.macAddress === discoveredDevice.connectionId ||
          savedDevice.connectionId === discoveredDevice.macAddress ||
          savedDevice.macAddress === discoveredDevice.macAddress
        );
      });
    });
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
    // Get all devices from trackerManager (including child devices) for rendering child device data streams
    const allTrackerDevices = this.trackerManager.getAllDevices();
    
    // Sync device statuses from trackerManager to discoveredDevices
    this.discoveredDevices.forEach(discoveredDevice => {
      const trackerDevice = allTrackerDevices.find(d => d.id === discoveredDevice.id);
      if (trackerDevice) {
        discoveredDevice.isConnected = trackerDevice.isConnected;
        // Also sync other properties that might have changed
        Object.assign(discoveredDevice, trackerDevice);
      }
    });
    
    // Don't add child devices to discoveredDevices - they connect through hub characteristics, not BLE
    
    const html = this.discoveredDevices.map(device => {
      const config = this.deviceConfigs.get(device.id);
      const hasChanges = this.hasDeviceChanges(device, config);
      return createNewDeviceCard(device, allTrackerDevices, config?.selectedColor, config?.selectedRole, hasChanges, this.deviceQuaternionData);
    }).join('');

    container.innerHTML = html;
    setNewDeviceCardStyles(container);
    this.attachDeviceEventListeners();
    
    // Restore data view state for discovered devices (show data stream if it was previously visible)
    this.deviceDataViewStates.forEach((isVisible, deviceId) => {
      if (isVisible) {
        const dataContent = this.modal.querySelector(`.${newCardStyles.dataContent}[data-device-id="${deviceId}"]`) as HTMLElement;
        const toggleBtn = this.modal.querySelector(`.${newCardStyles.dataToggle}[data-device-id="${deviceId}"]`) as HTMLElement;
        const icon = toggleBtn?.querySelector(`.${newCardStyles.dataToggleIcon}`) as HTMLElement;
        if (dataContent && toggleBtn && icon) {
          dataContent.style.display = 'block';
          icon.style.transform = 'rotate(180deg)';
        }
      }
    });
    
    // Initialize dials for devices with quaternion data (including child devices)
    import('./NewDeviceConnectionCard').then(({ updateDeviceDials }) => {
      // Get all devices including child devices from trackerManager
      const allTrackerDevices = this.trackerManager.getAllDevices();
      const allDeviceIds = new Set([
        ...this.discoveredDevices.map(d => d.id),
        ...allTrackerDevices.map(d => d.id)
      ]);
      
      allDeviceIds.forEach(deviceId => {
        const quatData = this.deviceQuaternionData.get(deviceId);
        if (quatData) {
          updateDeviceDials(deviceId, quatData);
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
    }
  }

  private updateConnectionCount(): void {
    if (!this.connectionCountIndicator) return;
    
    const count = this.deviceConnectionStateManager.totalConnectedDevices;
    this.connectionCountIndicator.textContent = `${count}/7`;
  }

  private updateCalibrateAllButtonState(): void {
    if (!this.calibrateAllBtn) return;
    
    const count = this.deviceConnectionStateManager.totalConnectedDevices;
    this.calibrateAllBtn.disabled = count === 0;
  }

  private async handleCalibrateAll(): Promise<void> {
    if (!this.calibrateAllBtn) return;
    
    // Get all connected devices from trackerManager
    const connectedDevices = this.trackerManager.getConnectedDevices();
    
    if (connectedDevices.length === 0) {
      return;
    }

    try {
      this.calibrateAllBtn.disabled = true;
      this.calibrateAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Calibrating...</span>';

      // Calibrate all connected devices
      const calibrationPromises = connectedDevices.map(device => {
        const connectionId = device.connectionId || device.macAddress;
        if (!connectionId) {
          console.warn(`No connectionId found for device ${device.id}`);
          return Promise.resolve();
        }
        return this.trackerManager.calibrateDevice(connectionId);
      });

      await Promise.allSettled(calibrationPromises);
      
      this.calibrateAllBtn.innerHTML = '<i class="fas fa-check"></i> <span>Calibrated</span>';
      setTimeout(() => {
        if (this.calibrateAllBtn) {
          this.calibrateAllBtn.innerHTML = '<i class="fas fa-compass"></i> <span>Calibrate All</span>';
          this.updateCalibrateAllButtonState();
        }
      }, 2000);
    } catch (error) {
      console.error('Calibrate all failed:', error);
      if (this.calibrateAllBtn) {
        this.calibrateAllBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>Failed</span>';
        setTimeout(() => {
          if (this.calibrateAllBtn) {
            this.calibrateAllBtn.innerHTML = '<i class="fas fa-compass"></i> <span>Calibrate All</span>';
            this.updateCalibrateAllButtonState();
          }
        }, 2000);
      }
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

  public getSavedDevices(): EidonDevice[] {
    return [...this.savedDevices];
  }
}

