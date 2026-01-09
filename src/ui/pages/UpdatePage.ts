import { ESPLoader, Transport } from 'esptool-js';
import styles from './styles/UpdatePage.module.css';
import { DeviceColor } from '../../types/device';
import { DeviceRole, DEVICE_ROLE_NAMES } from '../../core/constants';
import { AuthTokens } from '../../core/AuthManager';
import { LoginStateManager } from '../../core/LoginStateManager';
import { LOGO_ASCII } from './utils/logoAscii';
import { renderColorDropdown } from '../../ui/components/device-modal/ColorDropdown';
import { renderRoleSelector } from '../../ui/components/device-modal/RoleSelector';
import colorDropdownStyles from '../../ui/components/device-modal/styles/ColorDropdown.module.css';

interface FirmwareVersion {
  version: string;
}

interface SavedDevice {
  id: string;
  name: string;
  position: DeviceRole;
  type: string;
  version: string;
  color: string;
  connectionId: string;
}

interface UpdateDeviceDto {
  name?: string;
  type?: string;
  position?: DeviceRole;
  color?: string;
  version?: string;
  connectionId?: string;
}

import { AuthModal } from '../../ui/components/AuthModal';

export class UpdatePage {
  private container: HTMLElement;
  private content: HTMLElement;
  private deviceLoader: ESPLoader | null = null;
  private transport: Transport | null = null;
  private port: any = null; // SerialPort from Web Serial API
  private latestVersion: string | null = null;
  private savedDevices: SavedDevice[] = [];
  private logContainer: HTMLElement;
  private progressBar: HTMLElement;
  private progressBarContainer: HTMLElement;
  private connectButton: HTMLButtonElement | null = null;
  private deviceListContainer: HTMLElement | null = null;
  private authModal: AuthModal | null = null;
  
  private versionInfoContainer: HTMLElement | null = null;
  private connectedDeviceCard: HTMLElement | null = null;
  private connectedDeviceTerminal: HTMLElement | null = null;
  private connectedDeviceProgressBar: HTMLElement | null = null;
  private connectedDeviceProgressContainer: HTMLElement | null = null;
  private connectedDeviceInfo: {
    chipType: string;
    macAddress: string;
    portInfo: string;
    matchedDevice?: SavedDevice;
    isSaved: boolean;
    selectedColor?: string;
    selectedRole?: DeviceRole;
  } | null = null;
  
  // Files to flash
  private bootloaderBlob: Blob | null = null;
  private partitionsBlob: Blob | null = null;
  private firmwareBlob: Blob | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = styles.container;
    
    this.content = document.createElement('div');
    this.content.className = styles.contentWrapper;
    this.container.appendChild(this.content);
    
    this.logContainer = document.createElement('div');
    this.logContainer.className = styles.logContainer;
    
    this.progressBarContainer = document.createElement('div');
    this.progressBarContainer.className = styles.progressBarContainer;
    this.progressBar = document.createElement('div');
    this.progressBar.className = styles.progressBar;
    this.progressBarContainer.appendChild(this.progressBar);
  }

  public async mount(parent: HTMLElement): Promise<void> {
    // Update SEO/OG metadata for update page
    this.updateMetadata();
    
    parent.innerHTML = ''; // Clear existing content (assuming full page takeover)
    parent.appendChild(this.container);

    this.renderHeader();
    
    // Check if logged in
    const loginState = LoginStateManager.getInstance().getState();
    if (!loginState.isLoggedIn) {
      this.showAuthModal();
      return;
    }

    // Check compatibility
    if (!('serial' in navigator)) {
      this.renderWarning('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    this.renderMainContent();
    
    // Fetch data
    await this.fetchLatestVersion();
    await this.fetchSavedDevices();
    
    // Render logs at the bottom
    this.content.appendChild(this.progressBarContainer);
    this.content.appendChild(this.logContainer);
    
    this.log('Ready to update devices.');
  }

  public unmount(): void {
    // Restore default metadata
    this.restoreDefaultMetadata();
    
    if (this.authModal) {
      this.authModal.unmount();
      this.authModal = null;
    }

    if (this.port) {
      this.port.close();
    }
    this.container.remove();
  }

  private updateMetadata(): void {
    // Update title
    document.title = 'Update Tracker Firmware - Eidon Sym';
    
    // Update primary meta tags
    this.setMetaTag('name', 'title', 'Update Tracker Firmware - Eidon Sym');
    this.setMetaTag('name', 'description', 'Update your Eidon tracker firmware to the latest version. Keep your motion tracking devices up to date with the newest features and improvements.');
    this.setMetaTag('name', 'keywords', 'firmware update, tracker update, device firmware, Eidon tracker, motion tracker update');
    
    // Update Open Graph tags
    this.setMetaTag('property', 'og:title', 'Update Tracker Firmware - Eidon Sym');
    this.setMetaTag('property', 'og:description', 'Update your Eidon tracker firmware to the latest version. Keep your motion tracking devices up to date with the newest features and improvements.');
    this.setMetaTag('property', 'og:type', 'website');
    
    // Update Twitter tags
    this.setMetaTag('name', 'twitter:title', 'Update Tracker Firmware - Eidon Sym');
    this.setMetaTag('name', 'twitter:description', 'Update your Eidon tracker firmware to the latest version. Keep your motion tracking devices up to date with the newest features and improvements.');
  }

  private restoreDefaultMetadata(): void {
    // Restore default title
    document.title = 'Eidon Sym';
    
    // Restore default meta tags
    this.setMetaTag('name', 'title', 'Eidon Sym');
    this.setMetaTag('name', 'description', 'Visualize sensor recordings, analyze device data, and test connections with Eidon Sym. Real-time visualization and playback of sensor recordings.');
    this.setMetaTag('name', 'keywords', 'sensor data, device testing, recording visualization, motion sensors, IMU, sensor playback');
    
    // Restore default Open Graph tags
    this.setMetaTag('property', 'og:title', 'Eidon Sym ');
    this.setMetaTag('property', 'og:description', 'Visualize sensor recordings, analyze device data, and test connections with Eidon Sym. Real-time visualization and playback of sensor recordings.');
    
    // Restore default Twitter tags
    this.setMetaTag('name', 'twitter:title', 'Eidon Sym ');
    this.setMetaTag('name', 'twitter:description', 'Visualize sensor recordings, analyze device data, and test connections with Eidon Sym. Real-time visualization and playback of sensor recordings.');
  }

  private setMetaTag(attribute: 'name' | 'property', key: string, value: string): void {
    let meta = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, key);
      document.head.appendChild(meta);
    }
    meta.content = value;
  }

  private showAuthModal(): void {
    // Clear content first to avoid clutter
    this.content.innerHTML = '';
    this.renderHeader(); // Keep header visible
    
    const message = document.createElement('div');
    message.className = styles.noRecordings; // Reuse existing style or create new
    message.textContent = 'Please sign in to access firmware updates and manage your devices.';
    message.style.marginTop = '2rem';
    this.content.appendChild(message);

    this.authModal = new AuthModal(
      async () => {
        try {
          await LoginStateManager.getInstance().login();
          if (this.authModal) {
            this.authModal.unmount();
            this.authModal = null;
          }
          // Reload content after login
          this.content.innerHTML = ''; // Clear auth message
          this.renderHeader(); // Re-render header
          
          // Continue with loading content
          if (!('serial' in navigator)) {
            this.renderWarning('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
            return;
          }
          this.renderMainContent();
          await this.fetchLatestVersion();
          await this.fetchSavedDevices();
          
          this.content.appendChild(this.progressBarContainer);
          this.content.appendChild(this.logContainer);
          this.log('Ready to update devices.');
          
        } catch (error) {
          console.error('Login failed:', error);
          alert('Login failed. Please try again.');
        }
      },
      () => {
        // If they choose explore anonymously, redirect to home since this page requires auth
        window.location.href = '/';
      }
    );
    
    this.authModal.mount(this.container);
  }

  private renderHeader(): void {
    const header = document.createElement('div');
    header.className = styles.header;
    
    const title = document.createElement('h1');
    title.className = styles.title;
    title.textContent = 'Device Update';
    
    const backBtn = document.createElement('button');
    backBtn.className = styles.backButton;
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to App';
    backBtn.onclick = () => {
      // Navigate back to main app
      window.location.href = '/';
    };
    
    header.appendChild(title);
    header.appendChild(backBtn);
    this.content.appendChild(header);
  }

  private renderWarning(msg: string): void {
    const warning = document.createElement('div');
    warning.className = styles.warning;
    warning.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${msg}`;
    this.content.appendChild(warning);
  }

  private renderInfo(msg: string): void {
    const info = document.createElement('div');
    info.className = styles.info;
    info.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    
    if (this.versionInfoContainer) {
      this.versionInfoContainer.innerHTML = '';
      this.versionInfoContainer.appendChild(info);
    } else {
      this.content.appendChild(info);
    }
  }

  private renderMainContent(): void {
    // Connection Section
    const connSection = document.createElement('div');
    connSection.className = styles.section;
    
    const connTitle = document.createElement('h2');
    connTitle.className = styles.sectionTitle;
    connTitle.innerHTML = '<i class="fas fa-plug"></i> Connect Device';
    
    this.connectButton = document.createElement('button');
    this.connectButton.className = styles.button;
    this.connectButton.innerHTML = 'Select Device';
    this.connectButton.onclick = () => this.handleConnect();
    
    connSection.appendChild(connTitle);
    connSection.appendChild(this.connectButton);
    this.content.appendChild(connSection);

    // Instructions Dropdown Section
    const instructionsSection = document.createElement('div');
    instructionsSection.className = styles.section;
    
    const instructionsContent = document.createElement('div');
    instructionsContent.className = styles.instructionsContent;
    instructionsContent.style.display = 'none';
    instructionsContent.innerHTML = `
      <div class="${styles.instructionStep}">
        <strong>1. Physically Connect</strong> - Connect your tracker to your computer using a USB-C cable. Make sure the cable is properly connected to both the tracker and your computer.
      </div>
      <div class="${styles.instructionStep}">
        <strong>2. Select Device</strong> - Click "Select Device" above and choose your tracker from the serial port dialog that appears.
      </div>
      <div class="${styles.instructionStep}">
        <strong>3. Auto-Detection</strong> - Device will be automatically matched if saved. If not found, you can manually select from your devices or create a new device.
      </div>
      <div class="${styles.instructionStep}">
        <strong>4. Update</strong> - After flashing completes, the UI will update and you can close the connection.
      </div>
    `;
    
    const instructionsHeader = document.createElement('div');
    instructionsHeader.className = styles.instructionsHeader;
    instructionsHeader.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <span>Instructions</span>
      <i class="fas fa-chevron-down ${styles.instructionsChevron}"></i>
    `;
    instructionsHeader.onclick = () => {
      const isOpen = instructionsContent.style.display !== 'none';
      instructionsContent.style.display = isOpen ? 'none' : 'block';
      const chevron = instructionsHeader.querySelector(`.${styles.instructionsChevron}`) as HTMLElement;
      if (chevron) {
        chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    };
    
    instructionsSection.appendChild(instructionsHeader);
    instructionsSection.appendChild(instructionsContent);
    this.content.appendChild(instructionsSection);

    // Version Info Container
    this.versionInfoContainer = document.createElement('div');
    this.content.appendChild(this.versionInfoContainer);

    // Device List Section
    const listSection = document.createElement('div');
    listSection.className = styles.section;
    
    const listTitle = document.createElement('h2');
    listTitle.className = styles.sectionTitle;
    listTitle.innerHTML = '<i class="fas fa-list"></i> Your Devices';
    
    this.deviceListContainer = document.createElement('div');
    this.deviceListContainer.className = styles.deviceList;
    this.deviceListContainer.textContent = 'Loading devices...';
    
    listSection.appendChild(listTitle);
    listSection.appendChild(this.deviceListContainer);
    this.content.appendChild(listSection);
  }

  private async fetchLatestVersion(): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/devices/latest-version`);
      if (response.ok) {
        const data: FirmwareVersion = await response.json();
        this.latestVersion = data.version;
        this.renderInfo(`Latest Firmware Version: ${this.latestVersion}`);
        
        // Pre-fetch firmware files
        this.fetchFirmwareFiles(this.latestVersion);
      } else {
        this.log('Failed to fetch latest version info.');
      }
    } catch (e) {
      this.log('Error fetching latest version: ' + e);
    }
  }

  private async fetchFirmwareFiles(version: string): Promise<void> {
    this.log(`Fetching firmware files for version ${version}...`);
    try {
      const [bootloader, partitions, firmware] = await Promise.all([
        fetch(`/firmware/${version}/bootloader.bin`).then(r => r.blob()),
        fetch(`/firmware/${version}/partitions.bin`).then(r => r.blob()),
        fetch(`/firmware/${version}/firmware.bin`).then(r => r.blob())
      ]);
      
      this.bootloaderBlob = bootloader;
      this.partitionsBlob = partitions;
      this.firmwareBlob = firmware;
      
      this.log('Firmware files downloaded and ready for flashing.');
    } catch (e) {
      this.log('Error fetching firmware files: ' + e);
    }
  }

  private async fetchSavedDevices(): Promise<void> {
    const tokens = LoginStateManager.getInstance().getState().tokens;
    if (!tokens) {
      if (this.deviceListContainer) this.deviceListContainer.textContent = 'Please log in to view saved devices.';
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/devices`, {
        headers: {
          'Authorization': `Bearer ${tokens.token}`
        }
      });
      
      if (response.ok) {
        this.savedDevices = await response.json();
        this.renderDeviceList();
      } else {
        this.log('Failed to fetch saved devices.');
      }
    } catch (e) {
      this.log('Error fetching saved devices: ' + e);
    }
  }

  private renderDeviceList(): void {
    if (!this.deviceListContainer) return;
    this.deviceListContainer.innerHTML = '';
    
    if (this.savedDevices.length === 0) {
      this.deviceListContainer.textContent = 'No saved devices found.';
      return;
    }

    this.savedDevices.forEach(device => {
      const card = document.createElement('div');
      card.className = styles.deviceCard;
      
      const info = document.createElement('div');
      info.className = styles.deviceInfo;
      
      const nameContainer = document.createElement('div');
      nameContainer.className = styles.deviceNameContainer;

      if (device.color) {
        const colorDot = document.createElement('div');
        colorDot.className = styles.deviceColorDot;
        colorDot.style.backgroundColor = device.color;
        nameContainer.appendChild(colorDot);
      }
      
      const name = document.createElement('div');
      name.className = styles.deviceName;
      name.textContent = device.name || 'Unnamed Device';
      nameContainer.appendChild(name);
      
      const meta = document.createElement('div');
      meta.className = styles.deviceMeta;
      const roleStr = DEVICE_ROLE_NAMES[device.position as DeviceRole] || 'Unknown';
      meta.textContent = `${roleStr} | v${device.version || 'Unknown'}`;
      
      info.appendChild(nameContainer);
      info.appendChild(meta);
      
      const status = document.createElement('div');
      status.className = styles.statusTag;
      
      if (this.latestVersion && device.version && device.version === this.latestVersion) {
        status.innerHTML = '<i class="fas fa-check-circle"></i> Up to Date';
        status.classList.add(styles.statusSafe);
      } else if (this.latestVersion && device.version && device.version < this.latestVersion) {
        status.textContent = 'Update Available';
        status.classList.add(styles.statusUpdate);
      } else {
        status.textContent = 'Check Version';
        status.classList.add(styles.statusUpdate);
      }
      
      card.appendChild(info);
      card.appendChild(status);
      this.deviceListContainer!.appendChild(card);
    });
  }

  private async handleConnect(): Promise<void> {
    if (!this.bootloaderBlob || !this.partitionsBlob || !this.firmwareBlob) {
      this.log('Firmware files not yet loaded. Please wait...');
      return;
    }

    // Clean up any existing connection
    if (this.connectedDeviceCard) {
      this.connectedDeviceCard.remove();
      this.connectedDeviceCard = null;
      this.connectedDeviceTerminal = null;
    }
    // Clean up any existing connection
    const previousPort = this.port;
    
    if (this.deviceLoader) {
      this.deviceLoader = null;
    }
    if (this.transport) {
      this.transport = null;
    }
    if (this.port) {
      try {
        // Always try to close, don't check readable/writable as they might be stale
        await this.port.close();
        // Wait a bit to ensure port is fully closed
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        // Ignore - port might already be closed
      }
      this.port = null;
    }
    this.connectedDeviceInfo = null;
    // Show bottom terminal when starting new connection
    this.logContainer.style.display = 'block';

    // Store original console methods for restoration (declare before try block)
    const originalConsoleLog = console.log;
    const originalConsoleTrace = console.trace;
    const originalConsoleDebug = console.debug;

    try {
      // This forces the browser to show EVERYTHING plugged in
      const port = await (navigator as any).serial.requestPort({ filters: [] });
      
      // Always ensure the port is closed before using it
      // The port might be open from a previous connection
      // We'll try to close it multiple times to be safe
      for (let i = 0; i < 3; i++) {
        try {
          await port.close();
          if (i === 0) {
            this.log('Ensuring port is closed...');
          }
        } catch (e) {
          // Port might already be closed, that's okay
        }
        // Wait between attempts
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      this.port = port;
      
      // Debug: Check if getInfo exists and log it (works on closed port)
      try {
        if (port.getInfo) {
          const info = port.getInfo();
          this.log(`Port Info: VID=${info.usbVendorId?.toString(16)} PID=${info.usbProductId?.toString(16)}`);
        }
      } catch (err) {
        console.warn('Error getting port info:', err);
      }

      // Create Transport - it will handle opening the port when connect() is called
      // Make sure port is definitely closed before this
      // The second parameter (true) means "autoOpen" - we want it to handle opening
      this.transport = new Transport(port, true);
      
      // Create a terminal-like object to capture logs (filter out TRACE messages)
      const terminal = {
        clean: () => { /* no-op */ },
        writeLine: (data: string) => {
          // Filter out verbose TRACE messages from esptool-js
          if (!data.includes('TRACE') && !data.trim().startsWith('TRACE')) {
            this.log(data);
          }
        },
        write: (data: string) => {
          // Filter out verbose TRACE messages from esptool-js
          if (!data.includes('TRACE') && !data.trim().startsWith('TRACE')) {
            this.log(data);
          }
        }
      };

      // Suppress console TRACE logs from esptool-js during connection
      
      console.log = (...args: any[]) => {
        const message = args.join(' ');
        // Filter out TRACE logs and verbose "Write bytes" messages from esptool-js
        if (!message.includes('TRACE') && 
            !message.trim().startsWith('TRACE') &&
            !message.includes('Write bytes')) {
          originalConsoleLog.apply(console, args);
        }
      };
      
      console.trace = (...args: any[]) => {
        // Suppress all trace calls
      };
      
      console.debug = (...args: any[]) => {
        const message = args.join(' ');
        // Filter out TRACE logs and verbose "Write bytes" messages
        if (!message.includes('TRACE') && 
            !message.trim().startsWith('TRACE') &&
            !message.includes('Write bytes')) {
          originalConsoleDebug.apply(console, args);
        }
      };

      this.deviceLoader = new ESPLoader({
        transport: this.transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: terminal
      });
      
      this.log('Connecting to device...');
      try {
        const chip = await this.deviceLoader.main();
        this.log(`Connected to ${chip} chip.`);
        const mac = await this.deviceLoader.chip.readMac(this.deviceLoader);
        this.log(`MAC Address: ${mac}`);
      } catch (mainError) {
        // If main() fails, it might be because the device is not in bootloader mode?
        // But esptool-js tries to reset it.
        // Let's log more details
        this.log('Error in loader.main(): ' + mainError);
        throw mainError;
      }

      // Store device info and render card
      const chipName = this.deviceLoader.chip.CHIP_NAME;
      const mac = await this.deviceLoader.chip.readMac(this.deviceLoader);
      
      let portInfoStr = 'Unknown';
      try {
        if (port.getInfo) {
          const info = port.getInfo();
          portInfoStr = `VID=${info.usbVendorId?.toString(16)} PID=${info.usbProductId?.toString(16)}`;
        }
      } catch (err) {
        // Ignore
      }
      
      // Match MAC address with saved devices
      const macUpper = mac.toUpperCase();
      const macNormalized = this.normalizeMacAddress(mac);
      
      // Try to match device by normalized MAC address
      const matchedDevice = this.savedDevices.find(d => {
        const connId = d.connectionId || '';
        const connIdNormalized = this.normalizeMacAddress(connId);
        const idNormalized = this.normalizeMacAddress(d.id || '');
        
        // Match if normalized MAC addresses are equal
        return connIdNormalized === macNormalized || idNormalized === macNormalized;
      });
      
      this.connectedDeviceInfo = {
        chipType: chipName,
        macAddress: mac,
        portInfo: portInfoStr,
        matchedDevice: matchedDevice,
        isSaved: !!matchedDevice,
        selectedColor: matchedDevice?.color,
        selectedRole: matchedDevice?.position
      };
      
      // Restore console methods after connection
      console.log = originalConsoleLog;
      console.trace = originalConsoleTrace;
      console.debug = originalConsoleDebug;
      
      // Hide bottom terminal and show card
      this.logContainer.style.display = 'none';
      this.renderConnectedDeviceCard();
      
      // Display ASCII art in terminal
      this.log(LOGO_ASCII);

    } catch (e) {
      // Restore console methods on error (always restore to original values)
      if (originalConsoleLog) console.log = originalConsoleLog;
      if (originalConsoleTrace) console.trace = originalConsoleTrace;
      if (originalConsoleDebug) console.debug = originalConsoleDebug;
      
      this.log('Connection failed: ' + e);
      if (this.port) {
        try {
          await this.port.close();
        } catch (closeErr) {
          // Ignore close errors
        }
      }
      this.connectedDeviceInfo = null;
      if (this.connectedDeviceCard) {
        (this.connectedDeviceCard as HTMLElement).remove();
        this.connectedDeviceCard = null;
        this.connectedDeviceTerminal = null;
      }
      // Show bottom terminal again when disconnected
      this.logContainer.style.display = 'block';
    }
  }

  private renderConnectedDeviceCard(): void {
    if (!this.connectedDeviceInfo) return;
    
    // Remove existing card if present
    if (this.connectedDeviceCard) {
      this.connectedDeviceCard.remove();
      this.connectedDeviceProgressBar = null;
      this.connectedDeviceProgressContainer = null;
    }
    
    // Find the connection section to insert after it
    const connSection = this.content.querySelector(`.${styles.section}`);
    if (!connSection) return;
    
    const device = this.connectedDeviceInfo.matchedDevice;
    const isSaved = this.connectedDeviceInfo.isSaved;
    const deviceColor = device?.color || 'rgb(40, 40, 40)';
    const deviceName = device?.name || 'Unsaved Device';
    const deviceRole = device?.position !== undefined ? (DEVICE_ROLE_NAMES[device.position as DeviceRole] || 'Unknown') : 'Not Set';
    const isUpToDate = device && this.latestVersion && device.version && device.version === this.latestVersion;
    
    // Create device card with device color
    this.connectedDeviceCard = document.createElement('div');
    this.connectedDeviceCard.className = styles.section;
    this.connectedDeviceCard.classList.add(styles.connectedDeviceCard);
    this.connectedDeviceCard.style.borderColor = deviceColor;
    this.connectedDeviceCard.style.backgroundColor = this.hexToRgba(deviceColor, 0.08);
    
    // Header
    const header = document.createElement('div');
    header.className = styles.connectedDeviceHeader;
    
    const title = document.createElement('h2');
    title.className = styles.sectionTitle;
    title.innerHTML = `<i class="fas fa-microchip"></i> ${deviceName}`;
    
    const headerRight = document.createElement('div');
    headerRight.className = styles.headerRight;
    
    const statusBadge = document.createElement('div');
    if (isUpToDate) {
      statusBadge.className = `${styles.statusTag} ${styles.statusSafe}`;
      statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> Connected & Up to Date';
    } else {
      statusBadge.className = `${styles.statusTag} ${styles.statusSafe}`;
      statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
    }
    
    const cancelButton = document.createElement('button');
    cancelButton.className = styles.cancelButton;
    cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancel';
    cancelButton.onclick = () => this.disconnectDevice();
    
    headerRight.appendChild(statusBadge);
    headerRight.appendChild(cancelButton);
    
    header.appendChild(title);
    header.appendChild(headerRight);
    
    // Device Selection Dropdown (if no match found)
    let deviceSelectionSection: HTMLElement | null = null;
    if (!isSaved && this.savedDevices.length > 0) {
      deviceSelectionSection = document.createElement('div');
      deviceSelectionSection.className = styles.deviceSelectionSection;
      
      const selectionTitle = document.createElement('div');
      selectionTitle.className = styles.selectionTitle;
      selectionTitle.innerHTML = '<i class="fas fa-question-circle"></i> Select Device';
      deviceSelectionSection.appendChild(selectionTitle);
      
      const selectionDescription = document.createElement('div');
      selectionDescription.className = styles.selectionDescription;
      selectionDescription.innerHTML = `
        <p>Device detection failed. You have two options:</p>
        <ul>
          <li><strong>Select an existing device:</strong> If this device is already saved, select it from the dropdown below.</li>
          <li><strong>Add a new device:</strong> If this is a new device, configure and save it first using the form below.</li>
        </ul>
      `;
      deviceSelectionSection.appendChild(selectionDescription);
      
      // Create custom dropdown with color indicators
      const deviceSelectWrapper = document.createElement('div');
      deviceSelectWrapper.className = styles.deviceSelectWrapper;
      
      const deviceSelectTrigger = document.createElement('div');
      deviceSelectTrigger.className = styles.deviceSelectTrigger;
      deviceSelectTrigger.innerHTML = '<span>-- Select a device --</span><i class="fas fa-chevron-down"></i>';
      
      const deviceSelectMenu = document.createElement('div');
      deviceSelectMenu.className = styles.deviceSelectMenu;
      deviceSelectMenu.style.display = 'none';
      
      // Add default option
      const defaultOption = document.createElement('div');
      defaultOption.className = styles.deviceSelectOption;
      defaultOption.innerHTML = '<span>-- Select a device --</span>';
      defaultOption.onclick = () => {
        deviceSelectTrigger.innerHTML = '<span>-- Select a device --</span><i class="fas fa-chevron-down"></i>';
        deviceSelectMenu.style.display = 'none';
      };
      deviceSelectMenu.appendChild(defaultOption);
      
      // Add device options with colors
      this.savedDevices.forEach(device => {
        const option = document.createElement('div');
        option.className = styles.deviceSelectOption;
        option.setAttribute('data-device-id', device.id);
        
        const colorDot = document.createElement('span');
        colorDot.className = styles.deviceSelectColorDot;
        colorDot.style.backgroundColor = device.color || 'rgb(40, 40, 40)';
        
        const roleStr = DEVICE_ROLE_NAMES[device.position as DeviceRole] || 'Unknown';
        const optionText = document.createElement('span');
        optionText.className = styles.deviceSelectOptionText;
        optionText.textContent = `${device.name} (${roleStr})`;
        
        const versionChip = document.createElement('span');
        versionChip.className = styles.deviceVersionChip;
        versionChip.textContent = `v${device.version || '?'}`;
        
        option.appendChild(colorDot);
        option.appendChild(optionText);
        option.appendChild(versionChip);
        
        option.onclick = () => {
          const selectedDevice = this.savedDevices.find(d => d.id === device.id);
          if (selectedDevice && this.connectedDeviceInfo) {
            // Update trigger to show selected device
            deviceSelectTrigger.innerHTML = '';
            const selectedColorDot = colorDot.cloneNode(true) as HTMLElement;
            const selectedText = optionText.cloneNode(true) as HTMLElement;
            selectedText.className = styles.deviceSelectOptionText;
            const selectedVersionChip = versionChip.cloneNode(true) as HTMLElement;
            deviceSelectTrigger.appendChild(selectedColorDot);
            deviceSelectTrigger.appendChild(selectedText);
            deviceSelectTrigger.appendChild(selectedVersionChip);
            const chevron = document.createElement('i');
            chevron.className = 'fas fa-chevron-down';
            deviceSelectTrigger.appendChild(chevron);
            
            deviceSelectMenu.style.display = 'none';
            
            this.log(`Device selected: ${selectedDevice.name} (${DEVICE_ROLE_NAMES[selectedDevice.position as DeviceRole]})`);
            
            // Update connected device info with selected device
            this.connectedDeviceInfo.matchedDevice = selectedDevice;
            this.connectedDeviceInfo.isSaved = true;
            this.connectedDeviceInfo.selectedColor = selectedDevice.color;
            this.connectedDeviceInfo.selectedRole = selectedDevice.position;
            
            // Update save button state
            this.updateSaveButtonState();
            
            // Re-render card to show selected device info
            this.renderConnectedDeviceCard();
          }
        };
        
        deviceSelectMenu.appendChild(option);
      });
      
      // Toggle menu on trigger click
      deviceSelectTrigger.onclick = (e) => {
        e.stopPropagation();
        deviceSelectMenu.style.display = deviceSelectMenu.style.display === 'none' ? 'block' : 'none';
      };
      
      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!deviceSelectWrapper.contains(e.target as Node)) {
          deviceSelectMenu.style.display = 'none';
        }
      });
      
      deviceSelectWrapper.appendChild(deviceSelectTrigger);
      deviceSelectWrapper.appendChild(deviceSelectMenu);
      deviceSelectionSection.appendChild(deviceSelectWrapper);
    }
    
    // Device Info
    const infoContainer = document.createElement('div');
    infoContainer.className = styles.connectedDeviceInfo;
    
    // Device name (if saved)
    if (isSaved && device) {
      const nameInfo = document.createElement('div');
      nameInfo.className = styles.deviceInfoRow;
      nameInfo.innerHTML = `
        <span class="${styles.deviceInfoLabel}">Name:</span>
        <span class="${styles.deviceInfoValue}">${device.name}</span>
      `;
      infoContainer.appendChild(nameInfo);
    }
    
    // Role (only show if device is saved/confirmed)
    if (isSaved && device) {
      const roleInfo = document.createElement('div');
      roleInfo.className = styles.deviceInfoRow;
      roleInfo.innerHTML = `
        <span class="${styles.deviceInfoLabel}">Role:</span>
        <span class="${styles.deviceInfoValue}">${deviceRole}</span>
      `;
      infoContainer.appendChild(roleInfo);
    }
    
    // Color (only show if device is saved/confirmed)
    if (isSaved && device) {
      const colorInfo = document.createElement('div');
      colorInfo.className = styles.deviceInfoRow;
      const colorDot = document.createElement('span');
      colorDot.style.display = 'inline-block';
      colorDot.style.width = '12px';
      colorDot.style.height = '12px';
      colorDot.style.borderRadius = '50%';
      colorDot.style.backgroundColor = deviceColor;
      colorDot.style.marginRight = '8px';
      colorDot.style.verticalAlign = 'middle';
      colorInfo.innerHTML = `
        <span class="${styles.deviceInfoLabel}">Color:</span>
        <span class="${styles.deviceInfoValue}"></span>
      `;
      colorInfo.querySelector(`.${styles.deviceInfoValue}`)?.appendChild(colorDot);
      colorInfo.querySelector(`.${styles.deviceInfoValue}`)!.appendChild(document.createTextNode(deviceColor));
      infoContainer.appendChild(colorInfo);
    }
    
    // Chip Type
    const chipInfo = document.createElement('div');
    chipInfo.className = styles.deviceInfoRow;
    chipInfo.innerHTML = `
      <span class="${styles.deviceInfoLabel}">Chip Type:</span>
      <span class="${styles.deviceInfoValue}">${this.connectedDeviceInfo.chipType}</span>
    `;
    infoContainer.appendChild(chipInfo);
    
    // MAC Address
    const macInfo = document.createElement('div');
    macInfo.className = styles.deviceInfoRow;
    macInfo.innerHTML = `
      <span class="${styles.deviceInfoLabel}">MAC Address:</span>
      <span class="${styles.deviceInfoValue}">${this.connectedDeviceInfo.macAddress}</span>
    `;
    infoContainer.appendChild(macInfo);
    
    // Port Info
    const portInfo = document.createElement('div');
    portInfo.className = styles.deviceInfoRow;
    portInfo.innerHTML = `
      <span class="${styles.deviceInfoLabel}">Port Info:</span>
      <span class="${styles.deviceInfoValue}">${this.connectedDeviceInfo.portInfo}</span>
    `;
    infoContainer.appendChild(portInfo);
    
    // Target Version
    const versionInfo = document.createElement('div');
    versionInfo.className = styles.deviceInfoRow;
    versionInfo.innerHTML = `
      <span class="${styles.deviceInfoLabel}">Target Version:</span>
      <span class="${styles.deviceInfoValue}">${this.latestVersion || 'Unknown'}</span>
    `;
    infoContainer.appendChild(versionInfo);
    
    // Configuration section for unsaved devices
    let configSection: HTMLElement | null = null;
    if (!isSaved) {
      configSection = document.createElement('div');
      configSection.className = styles.deviceConfigSection;
      
      const configTitle = document.createElement('div');
      configTitle.className = styles.configTitle;
      configTitle.textContent = 'Configure Device';
      configSection.appendChild(configTitle);
      
      const configRow = document.createElement('div');
      configRow.className = styles.configRow;
      
      // Color selector
      const colorGroup = document.createElement('div');
      colorGroup.className = styles.selectorGroup;
      const colorLabel = document.createElement('label');
      colorLabel.className = styles.selectorLabel;
      colorLabel.innerHTML = '<i class="fas fa-palette"></i> Color';
      colorGroup.appendChild(colorLabel);
      const colorDropdown = document.createElement('div');
      colorDropdown.innerHTML = renderColorDropdown('update-device', this.connectedDeviceInfo.selectedColor);
      colorGroup.appendChild(colorDropdown);
      configRow.appendChild(colorGroup);
      
      // Role selector
      const roleGroup = document.createElement('div');
      roleGroup.className = styles.selectorGroup;
      const roleLabel = document.createElement('label');
      roleLabel.className = styles.selectorLabel;
      roleLabel.innerHTML = '<i class="fas fa-tag"></i> Role';
      roleGroup.appendChild(roleLabel);
      const roleSelector = document.createElement('div');
      roleSelector.innerHTML = renderRoleSelector('update-device', this.connectedDeviceInfo.selectedRole);
      roleGroup.appendChild(roleSelector);
      configRow.appendChild(roleGroup);
      
      configSection.appendChild(configRow);
      
      // Save button
      const saveButton = document.createElement('button');
      saveButton.className = styles.saveDeviceButton;
      saveButton.innerHTML = '<i class="fas fa-save"></i> Save Device';
      saveButton.disabled = true; // Disabled by default until device is selected or configured
      saveButton.title = 'Please select a device from the dropdown above or configure this device with color and role before saving.';
      saveButton.onclick = () => this.saveDevice();
      configSection.appendChild(saveButton);
      
      // Store reference to save button for enabling/disabling
      (this as any).saveDeviceButton = saveButton;
      
      // Setup event listeners for color and role changes
      this.setupDeviceConfigListeners();
      
      // Update save button state after a short delay to ensure DOM is ready
      setTimeout(() => {
        this.updateSaveButtonState();
      }, 150);
    }
    
    // Terminal/Logs Section
    const terminalSection = document.createElement('div');
    terminalSection.className = styles.connectedDeviceTerminal;
    
    const terminalTitle = document.createElement('div');
    terminalTitle.className = styles.terminalTitle;
    terminalTitle.innerHTML = '<i class="fas fa-terminal"></i> Connection Logs';
    
    // Create a separate terminal container for the card
    this.connectedDeviceTerminal = document.createElement('div');
    this.connectedDeviceTerminal.className = styles.logContainer;
    
    // Copy existing logs to the new terminal
    const existingLogs = this.logContainer.querySelectorAll(`.${styles.logLine}`);
    if (this.connectedDeviceTerminal) {
      existingLogs.forEach(log => {
        this.connectedDeviceTerminal!.appendChild(log.cloneNode(true));
      });
    }
    
    terminalSection.appendChild(terminalTitle);
    terminalSection.appendChild(this.connectedDeviceTerminal);
    
    // Progress Bar for firmware update
    this.connectedDeviceProgressContainer = document.createElement('div');
    this.connectedDeviceProgressContainer.className = styles.connectedDeviceProgressContainer;
    this.connectedDeviceProgressBar = document.createElement('div');
    this.connectedDeviceProgressBar.className = styles.connectedDeviceProgressBar;
    this.connectedDeviceProgressContainer.appendChild(this.connectedDeviceProgressBar);
    this.connectedDeviceProgressContainer.style.display = 'none';
    
    // Update Button (only show if device is saved)
    let updateButton: HTMLButtonElement | null = null;
    if (isSaved) {
      updateButton = document.createElement('button');
      updateButton.className = styles.updateButton;
      updateButton.innerHTML = '<i class="fas fa-upload"></i> Update Firmware';
      updateButton.onclick = () => this.flashFirmware();
    }
    
    // Assemble card
    this.connectedDeviceCard.appendChild(header);
    if (deviceSelectionSection) {
      this.connectedDeviceCard.appendChild(deviceSelectionSection);
    }
    // Configuration section comes right after device selection (if no match found)
    if (configSection) {
      this.connectedDeviceCard.appendChild(configSection);
    }
    this.connectedDeviceCard.appendChild(infoContainer);
    this.connectedDeviceCard.appendChild(terminalSection);
    this.connectedDeviceCard.appendChild(this.connectedDeviceProgressContainer);
    if (updateButton) {
      this.connectedDeviceCard.appendChild(updateButton);
    }
    
    // Insert after connection section
    connSection.insertAdjacentElement('afterend', this.connectedDeviceCard);
    
    // Scroll logs to bottom
    this.connectedDeviceTerminal.scrollTop = this.connectedDeviceTerminal.scrollHeight;
  }
  
  private async disconnectDevice(): Promise<void> {
    this.log('Disconnecting device...');
    
    // Close serial port FIRST, before cleaning up transport/loader
    // This ensures the port is closed even if transport/loader are holding references
    if (this.port) {
      // Try to close the port multiple times to ensure it's fully closed
      for (let i = 0; i < 3; i++) {
        try {
          await this.port.close();
          if (i === 0) {
            this.log('Serial port closed.');
          }
        } catch (e) {
          // Port might already be closed, that's okay
        }
        // Wait between attempts
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      this.port = null;
    }
    
    // Clean up transport and loader after port is closed
    if (this.transport) {
      try {
        // Try to clean up transport if it has a close method
        if (typeof (this.transport as any).close === 'function') {
          await (this.transport as any).close();
        }
      } catch (e) {
        console.warn('Error closing transport:', e);
      }
      this.transport = null;
    }
    
    if (this.deviceLoader) {
      try {
        // Try to clean up loader if it has a close method
        if (typeof (this.deviceLoader as any).close === 'function') {
          await (this.deviceLoader as any).close();
        }
      } catch (e) {
        console.warn('Error closing loader:', e);
      }
      this.deviceLoader = null;
    }
    
    // Remove card
    if (this.connectedDeviceCard) {
      this.connectedDeviceCard.remove();
      this.connectedDeviceCard = null;
      this.connectedDeviceTerminal = null;
      this.connectedDeviceProgressBar = null;
      this.connectedDeviceProgressContainer = null;
    }
    
    // Clear device info
    this.connectedDeviceInfo = null;
    
    // Show bottom terminal again
    this.logContainer.style.display = 'block';
    
    this.log('Device disconnected.');
    
    // Refresh the page to ensure all state is cleared, including any internal
    // state in Transport/ESPLoader that might be holding onto the port
    window.location.reload();
  }
  
  /**
   * Normalize MAC address by removing colons and converting to uppercase
   * Also handles UUIDs and other formats (returns empty string if not MAC-like)
   */
  private normalizeMacAddress(address: string): string {
    if (!address) return '';
    
    // Remove colons, dashes, and spaces, convert to uppercase
    const normalized = address.replace(/[:-]/g, '').replace(/\s/g, '').toUpperCase();
    
    // Check if it looks like a MAC address (12 hex characters)
    // MAC addresses are 6 bytes = 12 hex chars
    if (/^[0-9A-F]{12}$/.test(normalized)) {
      return normalized;
    }
    
    // If it's a UUID format (with or without dashes), return empty string
    // UUIDs are 32 hex chars with optional dashes
    if (/^[0-9A-F]{8}-?[0-9A-F]{4}-?[0-9A-F]{4}-?[0-9A-F]{4}-?[0-9A-F]{12}$/i.test(address)) {
      return '';
    }
    
    // If it looks like base64 or other format, return empty string
    return '';
  }
  
  /**
   * Determine the type of connectionId
   */
  private getConnectionIdType(connectionId: string): 'mac' | 'uuid' | 'base64' | 'unknown' {
    if (!connectionId) return 'unknown';
    
    // Check if it's a MAC address format (contains colons and hex pairs)
    if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(connectionId)) {
      return 'mac';
    }
    
    // Check if it's a UUID format
    if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(connectionId)) {
      return 'uuid';
    }
    
    // Check if it looks like base64 (ends with == and contains base64 chars)
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(connectionId) && connectionId.length > 20) {
      return 'base64';
    }
    
    return 'unknown';
  }
  
  private hexToRgba(color: string, alpha: number): string {
    // Handle rgb() format
    if (color.startsWith('rgb(')) {
      const rgb = color.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      }
    }
    // Handle hex format
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(40, 40, 40, ${alpha})`; // Default fallback
  }
  
  private setupDeviceConfigListeners(): void {
    // Color dropdown listener - using correct CSS module classes
    setTimeout(() => {
      const colorTrigger = this.connectedDeviceCard?.querySelector(`.${colorDropdownStyles.colorDropdownTrigger}[data-device-id="update-device"]`) as HTMLElement;
      if (colorTrigger) {
        colorTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const wrapper = colorTrigger.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
          const menu = wrapper?.querySelector(`.${colorDropdownStyles.colorDropdownMenu}`) as HTMLElement;
          const isOpen = menu?.style.display !== 'none';
          
          // Close all other dropdowns
          if (this.connectedDeviceCard) {
            this.connectedDeviceCard.querySelectorAll(`.${colorDropdownStyles.colorDropdownMenu}`).forEach(otherMenu => {
              if (otherMenu !== menu) {
                (otherMenu as HTMLElement).style.display = 'none';
                const otherWrapper = otherMenu.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
                if (otherWrapper) otherWrapper.removeAttribute('data-open');
              }
            });
          }
          
          if (menu && wrapper) {
            menu.style.display = isOpen ? 'none' : 'block';
            if (isOpen) {
              wrapper.removeAttribute('data-open');
            } else {
              wrapper.setAttribute('data-open', 'true');
            }
          }
        });
      }
      
      // Color option listeners
      if (this.connectedDeviceCard) {
        this.connectedDeviceCard.querySelectorAll(`.${colorDropdownStyles.colorOption}[data-device-id="update-device"]`).forEach(option => {
          option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = (option as HTMLElement).getAttribute('data-value');
            if (value && this.connectedDeviceInfo) {
              this.connectedDeviceInfo.selectedColor = value;
              
              const wrapper = option.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
              const menu = wrapper?.querySelector(`.${colorDropdownStyles.colorDropdownMenu}`) as HTMLElement;
              const trigger = wrapper?.querySelector(`.${colorDropdownStyles.colorDropdownTrigger}`) as HTMLElement;
              const hiddenInput = wrapper?.querySelector(`.${colorDropdownStyles.colorSelector}`) as HTMLInputElement;
              
              // Update hidden input value
              if (hiddenInput) {
                hiddenInput.value = value;
              }
              
              // Update trigger display
              if (trigger) {
                const colorCircle = trigger.querySelector(`.${colorDropdownStyles.colorCircle}`) as HTMLElement;
                const colorText = trigger.querySelector(`.${colorDropdownStyles.colorDropdownText}`) as HTMLElement;
                const optionText = option.querySelector(`.${colorDropdownStyles.colorLabel}`)?.textContent || '';
                
                if (colorCircle && value) {
                  colorCircle.style.backgroundColor = value;
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
              
              // Update save button state
              this.updateSaveButtonState();
              
              // Re-render card to update color
              this.renderConnectedDeviceCard();
            }
          });
        });
      }
      
      // Role selector listener
      const roleSelector = this.connectedDeviceCard?.querySelector(`[data-device-id="update-device"][data-selector-type="role"]`) as HTMLSelectElement;
      if (roleSelector) {
        roleSelector.addEventListener('change', (e) => {
          const value = parseInt((e.target as HTMLSelectElement).value);
          if (this.connectedDeviceInfo) {
            this.connectedDeviceInfo.selectedRole = value as DeviceRole;
            // Update save button state
            this.updateSaveButtonState();
          }
        });
      }
      
      // Close dropdowns when clicking outside
      const clickOutsideHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (this.connectedDeviceCard && !target.closest(`.${colorDropdownStyles.colorDropdownWrapper}`)) {
          this.connectedDeviceCard.querySelectorAll(`.${colorDropdownStyles.colorDropdownMenu}`).forEach(menu => {
            (menu as HTMLElement).style.display = 'none';
            const wrapper = menu.closest(`.${colorDropdownStyles.colorDropdownWrapper}`) as HTMLElement;
            if (wrapper) wrapper.removeAttribute('data-open');
          });
        }
      };
      document.addEventListener('click', clickOutsideHandler, true);
      
      // Store handler for cleanup if needed
      (this as any).colorDropdownClickOutsideHandler = clickOutsideHandler;
    }, 100);
  }
  
  private updateSaveButtonState(): void {
    const saveButton = (this as any).saveDeviceButton as HTMLButtonElement | null;
    if (!saveButton) return;
    
    // Enable save button if:
    // 1. Device is saved (matchedDevice exists and isSaved is true), OR
    // 2. Device is not saved but has both color and role selected
    const canSave = this.connectedDeviceInfo?.isSaved || 
                   (this.connectedDeviceInfo?.selectedColor && 
                    this.connectedDeviceInfo?.selectedRole !== undefined);
    
    saveButton.disabled = !canSave;
    
    if (canSave) {
      saveButton.title = 'Save this device configuration.';
    } else {
      saveButton.title = 'Please select a device from the dropdown above or configure this device with color and role before saving.';
    }
  }
  
  private async saveDevice(): Promise<void> {
    if (!this.connectedDeviceInfo || !this.connectedDeviceInfo.selectedColor || this.connectedDeviceInfo.selectedRole === undefined) {
      this.log('Please select both color and role before saving.');
      return;
    }
    
    const tokens = LoginStateManager.getInstance().getState().tokens;
    if (!tokens) {
      this.log('Must be logged in to save device.');
      return;
    }
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        this.log('Error: VITE_API_URL environment variable is not set');
        return;
      }
      
      // Ensure URL doesn't have double slashes
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const url = `${baseUrl}/devices`;
      
      const requestBody = {
        name: `Device ${this.connectedDeviceInfo.macAddress.slice(-4)}`,
        type: 'tracker',
        position: this.connectedDeviceInfo.selectedRole,
        color: this.connectedDeviceInfo.selectedColor,
        connectionId: this.connectedDeviceInfo.macAddress,
        version: '0.1.0' // Default version for new devices
      };
      
      this.log(`Saving device: ${JSON.stringify(requestBody)}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const savedDevice = await response.json();
        this.log('Device saved successfully!');
        
        // Update connected device info
        this.connectedDeviceInfo.matchedDevice = savedDevice;
        this.connectedDeviceInfo.isSaved = true;
        
        // Update save button state
        this.updateSaveButtonState();
        
        // Refresh saved devices list
        await this.fetchSavedDevices();
        
        // Re-render card to show update button
        this.renderConnectedDeviceCard();
      } else {
        // Try to get error details from response body
        let errorMessage = response.statusText || 'Unknown error';
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else {
            errorMessage = JSON.stringify(errorData);
          }
        } catch (e) {
          // If response is not JSON, try to get text
          try {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          } catch (textError) {
            // Ignore - use statusText
          }
        }
        
        this.log(`Failed to save device (${response.status}): ${errorMessage}`);
      }
    } catch (e) {
      this.log(`Error saving device: ${e}`);
    }
  }

  private async readBlobAsBinaryString(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsBinaryString(blob);
    });
  }

  private async flashFirmware(): Promise<void> {
    if (!this.deviceLoader || !this.transport) return;
    
    // Suppress console TRACE logs from esptool-js during flashing
    const originalConsoleLog = console.log;
    const originalConsoleTrace = console.trace;
    const originalConsoleDebug = console.debug;
    
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      // Filter out TRACE logs and verbose "Write bytes" messages from esptool-js
      if (!message.includes('TRACE') && 
          !message.trim().startsWith('TRACE') &&
          !message.includes('Write bytes')) {
        originalConsoleLog.apply(console, args);
      }
    };
    
    console.trace = (...args: any[]) => {
      // Suppress all trace calls
    };
    
    console.debug = (...args: any[]) => {
      const message = args.join(' ');
      // Filter out TRACE logs and verbose "Write bytes" messages
      if (!message.includes('TRACE') && 
          !message.trim().startsWith('TRACE') &&
          !message.includes('Write bytes')) {
        originalConsoleDebug.apply(console, args);
      }
    };
    
    try {
      // Reset and show progress bar in connected device card
      if (this.connectedDeviceProgressBar) {
        this.connectedDeviceProgressBar.style.width = '0%';
      }
      if (this.connectedDeviceProgressContainer) {
        this.connectedDeviceProgressContainer.style.display = 'block';
      }
      // Also reset and show page-level progress bar
      this.progressBar.style.width = '0%';
      this.progressBarContainer.style.display = 'block';
      this.log('Preparing files...');
      
      const fileArray = [
        { data: await this.readBlobAsBinaryString(this.bootloaderBlob!), address: 0x0000 },
        { data: await this.readBlobAsBinaryString(this.partitionsBlob!), address: 0x8000 },
        { data: await this.readBlobAsBinaryString(this.firmwareBlob!), address: 0x10000 }
      ];

      this.log('Erasing flash...');
      // Note: esptool-js handles erase automatically if needed during write usually, but explicit stub might be safer.
      
      this.log('Writing to flash...');
      await this.deviceLoader.writeFlash({
        fileArray: fileArray,
          flashSize: 'keep',
          flashMode: 'keep',
          flashFreq: 'keep',
          eraseAll: false,
          compress: true,
          reportProgress: (fileIndex: number, written: number, total: number) => {
            const pct = Math.round((written / total) * 100);
            this.updateProgress(pct);
            if (pct % 10 === 0) this.log(`Progress: ${pct}%`);
          }
      });
      
      this.log('Flashing complete! Resetting device...');
      await this.transport.setDTR(false);
      await this.transport.setRTS(true); // Reset
      await new Promise(r => setTimeout(r, 100));
      await this.transport.setRTS(false);
      
      this.log('Device updated successfully.');
      
      // Update device info in backend
      await this.updateDeviceInBackend();
      
      // Show success message on card
      this.showFlashSuccessMessage();
      
      // Hide progress bar after completion
      if (this.connectedDeviceProgressContainer) {
        // Keep it visible but at 100%
        setTimeout(() => {
          if (this.connectedDeviceProgressContainer) {
            this.connectedDeviceProgressContainer.style.display = 'none';
          }
        }, 2000);
      }

    } catch (e) {
      this.log('Flashing error: ' + e);
      // Hide progress bar on error
      if (this.connectedDeviceProgressContainer) {
        this.connectedDeviceProgressContainer.style.display = 'none';
      }
    } finally {
      // Restore console methods
      console.log = originalConsoleLog;
      console.trace = originalConsoleTrace;
      console.debug = originalConsoleDebug;
      
      // Don't close connection automatically - let user close it
      // Clean up only the loader/transport references, keep port open
      this.transport = null;
      this.deviceLoader = null;
    }
  }
  
  private updateProgress(percent: number) {
    // Update both progress bars
    this.progressBar.style.width = `${percent}%`;
    if (this.connectedDeviceProgressBar) {
      this.connectedDeviceProgressBar.style.width = `${percent}%`;
    }
  }

  private showFlashSuccessMessage(): void {
    if (!this.connectedDeviceCard) return;
    
    // Remove any existing success message
    const existingSuccess = this.connectedDeviceCard.querySelector(`.${styles.flashSuccessMessage}`);
    if (existingSuccess) {
      existingSuccess.remove();
    }
    
    // Create success message
    const successMessage = document.createElement('div');
    successMessage.className = styles.flashSuccessMessage;
    
    const successIcon = document.createElement('div');
    successIcon.className = styles.successIcon;
    successIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
    
    const successContent = document.createElement('div');
    successContent.className = styles.successContent;
    
    const successTitle = document.createElement('div');
    successTitle.className = styles.successTitle;
    successTitle.textContent = 'Firmware Update Complete!';
    
    const successDescription = document.createElement('div');
    successDescription.className = styles.successDescription;
    successDescription.textContent = 'Your device has been successfully updated. You can now close the connection.';
    
    successContent.appendChild(successTitle);
    successContent.appendChild(successDescription);
    
    successMessage.appendChild(successIcon);
    successMessage.appendChild(successContent);
    
    // Insert at the top of the card, right after header
    const header = this.connectedDeviceCard.querySelector(`.${styles.connectedDeviceHeader}`);
    if (header) {
      header.insertAdjacentElement('afterend', successMessage);
    } else {
      // Fallback: insert at beginning
      this.connectedDeviceCard.insertBefore(successMessage, this.connectedDeviceCard.firstChild);
    }
    
    // Scroll to success message
    setTimeout(() => {
      successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  private async updateDeviceInBackend(): Promise<void> {
    // Use the selected/matched device from connectedDeviceInfo instead of trying to read MAC
    const device = this.connectedDeviceInfo?.matchedDevice;
    
    if (!device) {
      this.log('No device selected or matched. Backend not updated.');
      this.log('Please select a device from the dropdown if available, or ensure the device is saved in your account.');
      return;
    }

    if (!this.latestVersion) {
      this.log('No firmware version available. Backend not updated.');
      return;
    }
    
      this.log(`Updating backend record for device ${device.name}...`);
       const tokens = LoginStateManager.getInstance().getState().tokens;
    if (!tokens) {
      this.log('Not logged in. Backend not updated.');
      return;
    }
    
         const apiUrl = import.meta.env.VITE_API_URL;
         
         try {
           const response = await fetch(`${apiUrl}/devices/${device.id}`, {
             method: 'PUT',
             headers: {
               'Authorization': `Bearer ${tokens.token}`,
               'Content-Type': 'application/json'
             },
             body: JSON.stringify({
               version: this.latestVersion
             } as UpdateDeviceDto)
           });

           if (response.ok) {
             this.log('Backend record updated successfully.');
             await this.fetchSavedDevices(); // Refresh list to update UI
           } else {
             // Try to get error details from response body
             let errorMessage = response.statusText || 'Unknown error';
             try {
               const errorData = await response.json();
               if (errorData.message) {
                 errorMessage = errorData.message;
               }
             } catch (e) {
               // If response is not JSON, use status text
             }
             
             // Check if device is already up to date
             if (response.status === 400 || response.status === 409) {
               // Check if the error indicates the device is already at this version
               if (device.version === this.latestVersion || 
                   errorMessage.toLowerCase().includes('already') ||
                   errorMessage.toLowerCase().includes('up to date') ||
                   errorMessage.toLowerCase().includes('version')) {
                 this.log(`Device is already up to date (version ${this.latestVersion}). Backend record is current.`);
               } else {
                 this.log(`Failed to update backend: ${errorMessage}`);
               }
             } else {
               this.log(`Failed to update backend: ${errorMessage} (Status: ${response.status})`);
             }
           }
         } catch (err) {
            this.log(`Error updating backend: ${err}`);
    }
  }

  private log(msg: string): void {
    const line = document.createElement('div');
    line.className = styles.logLine;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    
    // Add to main log container
    this.logContainer.appendChild(line);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    
    // Also add to connected device terminal if it exists
    if (this.connectedDeviceTerminal) {
      const terminalLine = line.cloneNode(true) as HTMLElement;
      this.connectedDeviceTerminal.appendChild(terminalLine);
      this.connectedDeviceTerminal.scrollTop = this.connectedDeviceTerminal.scrollHeight;
    }
  }
}
