import styles from './styles/DebugPage.module.css';
import { LOGO_ASCII } from './utils/logoAscii';

export class DebugPage {
  private container: HTMLElement;
  private content: HTMLElement;
  private port: any = null; // SerialPort from Web Serial API
  private logContainer: HTMLElement;
  private connectButton: HTMLButtonElement | null = null;
  private disconnectButton: HTMLButtonElement | null = null;
  private restartButton: HTMLButtonElement | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private isConnected: boolean = false;
  private dividerAdded: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = styles.container;
    
    this.content = document.createElement('div');
    this.content.className = styles.contentWrapper;
    this.container.appendChild(this.content);
    
    this.logContainer = document.createElement('div');
    this.logContainer.className = styles.logContainer;
  }

  public async mount(parent: HTMLElement): Promise<void> {
    // Update SEO/OG metadata for debug page
    this.updateMetadata();
    
    parent.innerHTML = ''; // Clear existing content
    parent.appendChild(this.container);

    this.renderHeader();
    
    // Check compatibility
    if (!('serial' in navigator)) {
      this.renderWarning('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    this.renderMainContent();
    
    // Render terminal section (header + logs in unified container)
    const terminalSection = (this as any).terminalSection;
    if (terminalSection) {
      this.content.appendChild(terminalSection);
    }
    
    this.log('Ready to connect to device.');
  }

  public unmount(): void {
    // Restore default metadata
    this.restoreDefaultMetadata();
    
    // Disconnect if connected
    if (this.isConnected) {
      this.disconnectDevice();
    }
    
    this.container.remove();
  }

  private updateMetadata(): void {
    // Update title
    document.title = 'Serial Debug Terminal - Eidon Sym';
    
    // Update primary meta tags
    this.setMetaTag('name', 'title', 'Serial Debug Terminal - Eidon Sym');
    this.setMetaTag('name', 'description', 'Connect to your Eidon tracker via serial port and view real-time debug logs.');
    this.setMetaTag('name', 'keywords', 'serial debug, device logs, serial terminal, Eidon tracker, debug console');
    
    // Update Open Graph tags
    this.setMetaTag('property', 'og:title', 'Serial Debug Terminal - Eidon Sym');
    this.setMetaTag('property', 'og:description', 'Connect to your Eidon tracker via serial port and view real-time debug logs.');
    this.setMetaTag('property', 'og:type', 'website');
    
    // Update Twitter tags
    this.setMetaTag('name', 'twitter:title', 'Serial Debug Terminal - Eidon Sym');
    this.setMetaTag('name', 'twitter:description', 'Connect to your Eidon tracker via serial port and view real-time debug logs.');
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

  private renderHeader(): void {
    const header = document.createElement('div');
    header.className = styles.header;
    
    const title = document.createElement('h1');
    title.className = styles.title;
    title.textContent = 'Serial Debug Terminal';
    
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

  private renderMainContent(): void {
    // Connection Section
    const connSection = document.createElement('div');
    connSection.className = styles.section;
    
    const connTitle = document.createElement('h2');
    connTitle.className = styles.sectionTitle;
    connTitle.innerHTML = '<i class="fas fa-plug"></i> Connect Device';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = styles.buttonContainer;
    
    // Connect button (standalone)
    this.connectButton = document.createElement('button');
    this.connectButton.className = styles.button;
    this.connectButton.innerHTML = '<i class="fas fa-link"></i> Connect';
    this.connectButton.onclick = () => this.handleConnect();
    this.connectButton.disabled = this.isConnected;
    
    buttonContainer.appendChild(this.connectButton);
    
    connSection.appendChild(connTitle);
    connSection.appendChild(buttonContainer);
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
        <strong>2. Connect</strong> - Click "Connect" above and choose your tracker from the serial port dialog that appears.
      </div>
      <div class="${styles.instructionStep}">
        <strong>3. View Logs</strong> - Serial logs from your device will appear in real-time in the terminal below.
      </div>
      <div class="${styles.instructionStep}">
        <strong>4. Disconnect</strong> - Click "Disconnect" when you're done viewing logs.
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
    
    // Terminal section (unified container for header, buttons, and terminal)
    const terminalSection = document.createElement('div');
    terminalSection.className = styles.terminalSection;
    
    // Terminal header with controls
    const terminalHeader = document.createElement('div');
    terminalHeader.className = styles.terminalHeader;
    
    const terminalTitle = document.createElement('div');
    terminalTitle.className = styles.terminalTitle;
    terminalTitle.innerHTML = '<i class="fas fa-terminal"></i> Serial Terminal';
    
    const connectionControls = document.createElement('div');
    connectionControls.className = styles.connectionControls;
    
    this.restartButton = document.createElement('button');
    this.restartButton.className = `${styles.button} ${styles.restartButton}`;
    this.restartButton.innerHTML = '<i class="fas fa-redo"></i> Restart';
    this.restartButton.onclick = () => this.resetDevice();
    this.restartButton.disabled = !this.isConnected;
    this.restartButton.style.display = this.isConnected ? 'inline-flex' : 'none';
    
    this.disconnectButton = document.createElement('button');
    this.disconnectButton.className = `${styles.button} ${styles.disconnectButton}`;
    this.disconnectButton.innerHTML = '<i class="fas fa-unlink"></i> Disconnect';
    this.disconnectButton.onclick = () => this.disconnectDevice();
    this.disconnectButton.disabled = !this.isConnected;
    this.disconnectButton.style.display = this.isConnected ? 'inline-flex' : 'none';
    
    connectionControls.appendChild(this.restartButton);
    connectionControls.appendChild(this.disconnectButton);
    
    terminalHeader.appendChild(terminalTitle);
    terminalHeader.appendChild(connectionControls);
    
    terminalSection.appendChild(terminalHeader);
    terminalSection.appendChild(this.logContainer);
    
    // Store reference for later appending
    (this as any).terminalSection = terminalSection;
  }

  private async handleConnect(): Promise<void> {
    try {
      // Request serial port
      const port = await (navigator as any).serial.requestPort({ filters: [] });
      
      // Close port if it was previously open
      try {
        await port.close();
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        // Port might already be closed
      }
      
      this.port = port;
      
      // Open port with baud rate
      await this.port.open({ baudRate: 115200 });
      
      this.log('Connected to serial port.');
      this.log('Reading serial data...');
      
      // Update UI
      this.isConnected = true;
      this.dividerAdded = false; // Reset divider flag on new connection
      if (this.connectButton) {
        this.connectButton.disabled = true;
      }
      if (this.disconnectButton) {
        this.disconnectButton.disabled = false;
        this.disconnectButton.style.display = 'inline-flex';
      }
      if (this.restartButton) {
        this.restartButton.disabled = false;
        this.restartButton.style.display = 'inline-flex';
      }
      
      // Start reading from serial port
      this.readSerialData();
      
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        this.log('No port selected.');
      } else {
        this.log(`Connection failed: ${e.message || e}`);
      }
    }
  }

  private async readSerialData(): Promise<void> {
    if (!this.port || !this.port.readable) {
      return;
    }

    const port = this.port; // Store reference for type safety
    if (!port || !port.readable) {
      return;
    }

    try {
      const decoder = new TextDecoder();
      const reader = port.readable.getReader();
      this.reader = reader;
      
      while (this.isConnected && reader) {
        const { value, done } = await reader.read();
        
        if (done) {
          this.log('Serial port closed.');
          // Update UI to reflect disconnection
          this.isConnected = false;
          if (this.connectButton) {
            this.connectButton.disabled = false;
          }
          if (this.disconnectButton) {
            this.disconnectButton.disabled = true;
            this.disconnectButton.style.display = 'none';
          }
          if (this.restartButton) {
            this.restartButton.disabled = true;
            this.restartButton.style.display = 'none';
          }
          break;
        }
        
        if (value) {
          // Decode the data and display it
          const text = decoder.decode(value, { stream: true });
          this.logRaw(text);
        }
      }
    } catch (e: any) {
      // Only handle errors if we're still supposed to be connected
      if (this.isConnected) {
        if (e.name === 'NetworkError' || e.name === 'InvalidStateError') {
          this.log('Serial port connection lost.');
        } else {
          this.log(`Error reading serial data: ${e.message || e}`);
        }
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private async disconnectDevice(): Promise<void> {
    // Prevent multiple simultaneous disconnect calls
    if (!this.isConnected && !this.port) {
      return;
    }
    
    this.log('Disconnecting...');
    
    this.isConnected = false;
    
    // Release reader if active
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        // Ignore cancel errors
      }
      try {
        this.reader.releaseLock();
      } catch (e) {
        // Ignore release errors
      }
      this.reader = null;
    }
    
    // Close serial port
    if (this.port) {
      try {
        await this.port.close();
        this.log('Serial port closed.');
      } catch (e) {
        // Ignore close errors (port might already be closed)
      }
      this.port = null;
    }
    
    // Update UI
    this.dividerAdded = false; // Reset divider flag on disconnect
    if (this.connectButton) {
      this.connectButton.disabled = false;
    }
    if (this.disconnectButton) {
      this.disconnectButton.disabled = true;
      this.disconnectButton.style.display = 'none';
    }
    if (this.restartButton) {
      this.restartButton.disabled = true;
      this.restartButton.style.display = 'none';
    }
    
    this.log('Disconnected.');
  }

  private clearLogs(): void {
    this.logContainer.innerHTML = '';
    this.dividerAdded = false; // Reset divider flag when clearing
  }

  private async resetDevice(): Promise<void> {
    if (!this.port || !this.isConnected) {
      this.log('Device not connected. Cannot reset.');
      return;
    }

    const port = this.port; // Store reference for type safety
    if (!port) {
      return;
    }

    try {
      // Clear previous logs
      this.clearLogs();
      
      this.log('Resetting device...');
      
      // Reset sequence using DTR/RTS signals
      await port.setSignals({ dataTerminalReady: false });
      await port.setSignals({ requestToSend: true }); // Triggers reset
      await new Promise(resolve => setTimeout(resolve, 100));
      await port.setSignals({ requestToSend: false });
      
      this.log('Device reset signal sent.');
      
      // Display ASCII art
      this.log('\n' + LOGO_ASCII);
      this.log('Device restarting...\n');
      
    } catch (e: any) {
      this.log(`Error resetting device: ${e.message || e}`);
    }
  }

  private log(msg: string): void {
    const line = document.createElement('div');
    line.className = styles.logLine;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    
    this.logContainer.appendChild(line);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  private logRaw(text: string): void {
    // Add divider before first device log
    if (!this.dividerAdded && text.trim()) {
      this.addDivider();
      this.dividerAdded = true;
    }
    
    // Split by newlines to handle multi-line output
    const lines = text.split('\n');
    
    lines.forEach((line, index) => {
      if (line.trim() || index < lines.length - 1) {
        const logLine = document.createElement('div');
        logLine.className = styles.logLine;
        logLine.textContent = line;
        
        this.logContainer.appendChild(logLine);
      }
    });
    
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  private addDivider(): void {
    const divider = document.createElement('div');
    divider.className = styles.logDivider;
    divider.textContent = '-------------';
    this.logContainer.appendChild(divider);
  }
}
