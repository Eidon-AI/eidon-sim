import { EidonTrackerManager, EidonDevice } from '../../../core/EidonTrackerManager';
import { DeviceRole } from '../../../core/constants';
import { LoginStateManager } from '../../../core/LoginStateManager';
import { createDeviceConnectionCard as createNewDeviceCard, setDeviceCardStyles as setNewDeviceCardStyles, cardStyles as newCardStyles } from './NewDeviceConnectionCard';
import { createDeviceConnectionCard as createSavedDeviceCard, setDeviceCardStyles as setSavedDeviceCardStyles, cardStyles as savedCardStyles } from './SavedDeviceConnectionCard';
import colorDropdownStyles from './styles/ColorDropdown.module.css';
import roleSelectorStyles from './styles/RoleSelector.module.css';
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
  private deviceEditStates = new Map<string, boolean>(); // Track which devices have config section visible
  private deviceDataViewStates = new Map<string, boolean>(); // Track which devices have data stream visible
  private deviceDisconnecting = new Set<string>(); // Track devices currently disconnecting to prevent reconnection attempts

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
      const { deviceId, device } = e.detail;
      // Update by trackerManager deviceId
      this.updateDeviceConnectionStatus(deviceId, true);
      // Also update saved/discovered devices by connectionId if they match
      if (device && device.connectionId) {
        const savedDevice = this.savedDevices.find(d => 
          d.connectionId === device.connectionId || 
          d.macAddress === device.connectionId ||
          d.connectionId === device.macAddress ||
          d.macAddress === device.macAddress
        );
        if (savedDevice && savedDevice.id !== deviceId) {
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
      
      if (device) {
        // Store quaternion data using the saved/discovered device's ID (not trackerManager's deviceId)
        // This ensures dials update correctly
        const deviceIdForData = device.id;
        this.deviceQuaternionData.set(deviceIdForData, { quaternion, timestamp });
        
        // Update data view if it's currently visible
        this.updateDeviceDataView(deviceIdForData);
        
        // Determine which card type based on device location
        const isSaved = this.savedDevices.find(d => d.id === deviceIdForData) !== undefined;
        import(isSaved ? './SavedDeviceConnectionCard' : './NewDeviceConnectionCard').then(({ updateDeviceDials }) => {
          updateDeviceDials(deviceIdForData, { quaternion, timestamp });
        });
      } else {
        // Device not found in saved/discovered lists - still store by trackerManager deviceId
        // This handles edge cases where device might be connected but not in our lists
        this.deviceQuaternionData.set(deviceId, { quaternion, timestamp });
        this.updateDeviceDataView(deviceId);
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
    
    // Restore edit state (show config section if it was previously visible)
    this.deviceEditStates.forEach((isVisible, deviceId) => {
      if (isVisible) {
        const configSection = this.modal.querySelector(`.${savedCardStyles.configSection}[data-device-id="${deviceId}"]`) as HTMLElement;
        if (configSection) {
          configSection.style.display = 'block';
        }
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
      // For devices from NewDeviceConnectionCard, isSaved will be false, so isUpdate = false
      const isUpdate = isSaved;
      
      // Get color and role to save
      const colorToSave = config.selectedColor || device.color || 'rgb(40, 40, 40)'; // Default to black
      const positionToSave = config.selectedRole !== undefined ? config.selectedRole : device.role;

      // Build request body according to CreateDeviceDto (POST) or UpdateDeviceDto (PUT)
      const requestBody: any = {
        name: device.name,
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
    // Toggle visibility of config section (color dropdown, role selector, save button)
    const configSection = this.modal.querySelector(`.${savedCardStyles.configSection}[data-device-id="${deviceId}"]`) as HTMLElement;
    const editBtn = this.modal.querySelector(`.${savedCardStyles.editBtn}[data-device-id="${deviceId}"]`) as HTMLElement;
    
    if (!configSection || !editBtn) {
      // Config section might not exist if device is not connected - that's okay
      return;
    }
    
    const isHidden = configSection.style.display === 'none' || configSection.style.display === '';
    configSection.style.display = isHidden ? 'block' : 'none';
    
    // Update edit state map to preserve state across re-renders
    this.deviceEditStates.set(deviceId, isHidden);
    
    // Update edit button icon to indicate state (optional visual feedback)
    const icon = editBtn.querySelector('i');
    if (icon) {
      if (isHidden) {
        // Config is now visible - could change icon to indicate "done" or "editing"
        // Keep edit icon for now, but could change to fa-check or similar
      } else {
        // Config is now hidden - keep edit icon
      }
    }
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
    // Filter out devices that are already in savedDevices
    // Match by name (exact) or connectionId/macAddress
    this.discoveredDevices = devices.filter(discoveredDevice => {
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
    const html = this.discoveredDevices.map(device => {
      const config = this.deviceConfigs.get(device.id);
      const hasChanges = this.hasDeviceChanges(device, config);
      const quatData = this.deviceQuaternionData.get(device.id);
      return createNewDeviceCard(device, this.discoveredDevices, config?.selectedColor, config?.selectedRole, hasChanges, quatData);
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

