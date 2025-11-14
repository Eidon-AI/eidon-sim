// Finger sensor visualization panel for glove devices
// Shows 16 real-time bars representing finger sensor values (0.0-1.0)

import styles from './styles/FingerSensorPanel.module.css';

// Finger sensor names matching firmware (16 sensors)
const FINGER_NAMES = [
  'Thumb CMC', 'Thumb MCP', 'Thumb IP', 'Thumb Flex',
  'Index MCP', 'Index PIP', 'Index DIP', 'Index Flex',
  'Middle MCP', 'Middle PIP', 'Middle DIP', 'Middle Flex',
  'Ring MCP', 'Ring PIP', 'Ring DIP', 'Ring Flex'
];

export class FingerSensorPanel {
  private root: HTMLElement;
  private deviceId: string;
  private bars: HTMLElement[] = [];
  private valueLabels: HTMLElement[] = [];
  private eventHandler: ((e: Event) => void) | null = null;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.root = document.createElement('div');
    this.root.className = styles.fingerPanel;
    this.createUI();
    this.setupEventListener();
  }

  private createUI(): void {
    // Create header
    const header = document.createElement('div');
    header.className = styles.header;
    header.textContent = 'Finger Sensors';
    this.root.appendChild(header);

    // Create sensor grid
    const grid = document.createElement('div');
    grid.className = styles.sensorGrid;

    for (let i = 0; i < 16; i++) {
      const sensorItem = document.createElement('div');
      sensorItem.className = styles.sensorItem;

      // Sensor label
      const label = document.createElement('div');
      label.className = styles.sensorLabel;
      label.textContent = FINGER_NAMES[i];
      sensorItem.appendChild(label);

      // Bar container
      const barContainer = document.createElement('div');
      barContainer.className = styles.barContainer;

      // Bar fill
      const bar = document.createElement('div');
      bar.className = styles.bar;
      bar.style.width = '0%';
      barContainer.appendChild(bar);

      sensorItem.appendChild(barContainer);

      // Value label
      const valueLabel = document.createElement('div');
      valueLabel.className = styles.valueLabel;
      valueLabel.textContent = '0.00';
      sensorItem.appendChild(valueLabel);

      grid.appendChild(sensorItem);

      this.bars.push(bar);
      this.valueLabels.push(valueLabel);
    }

    this.root.appendChild(grid);
  }

  private setupEventListener(): void {
    this.eventHandler = ((e: Event) => {
      const event = e as CustomEvent<{ deviceId: string; fingerValues: number[] }>;
      const { deviceId, fingerValues } = event.detail;

      // Only update if this is our device
      if (deviceId === this.deviceId) {
        this.updateValues(fingerValues);
      }
    }) as EventListener;

    document.addEventListener('fingerDataUpdate', this.eventHandler);
  }

  private updateValues(values: number[]): void {
    for (let i = 0; i < Math.min(16, values.length); i++) {
      const value = values[i];

      // Update bar width (0.0-1.0 -> 0%-100%)
      this.bars[i].style.width = `${value * 100}%`;

      // Color gradient: green (0.0) -> yellow (0.5) -> red (1.0)
      if (value < 0.5) {
        const g = 255;
        const r = Math.round(255 * (value * 2)); // 0 -> 255
        this.bars[i].style.backgroundColor = `rgb(${r}, ${g}, 0)`;
      } else {
        const r = 255;
        const g = Math.round(255 * (2 - value * 2)); // 255 -> 0
        this.bars[i].style.backgroundColor = `rgb(${r}, ${g}, 0)`;
      }

      // Update value label
      this.valueLabels[i].textContent = value.toFixed(2);
    }
  }

  public mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  public unmount(): void {
    if (this.eventHandler) {
      document.removeEventListener('fingerDataUpdate', this.eventHandler);
      this.eventHandler = null;
    }
    this.root.remove();
  }

  public getElement(): HTMLElement {
    return this.root;
  }
}
