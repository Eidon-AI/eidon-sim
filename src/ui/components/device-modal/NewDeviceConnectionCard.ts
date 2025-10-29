import { EidonDevice } from '../../../core/EidonTrackerManager';
import { DeviceRole, DEVICE_ROLE_NAMES } from '../../../core/constants';
import { eulerXYZ } from '../../../core/mathUtils';
import { quat } from 'gl-matrix';
import styles from './styles/NewDeviceConnectionCard.module.css';

// Re-export styles for use in DeviceModal
export { styles as cardStyles };

/**
 * Get the connection status text for a device
 */
export function getDeviceStatus(device: EidonDevice, allDevices?: EidonDevice[]): string {
  // If device is connected via BLE, always show "Connected"
  if (device.isConnected) {
    return 'Connected';
  }
  
  // For disconnected devices, show availability status
  if (device.isHub || device.role === DeviceRole.CHEST) {
    return 'Disconnected';
  } else {
    // Child device status
    if (device.parentHub && allDevices) {
      const parentDevice = allDevices.find(d => d.id === device.parentHub);
      if (parentDevice?.isConnected) {
        return 'Available';
      }
    }
    return 'Disconnected';
  }
}

/**
 * Get the status color for a given status string
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'Connected':
      return '#10b981';
    case 'Available':
      return '#f59e0b';
    case 'Disconnected':
    default:
      return '#ef4444';
  }
}

/**
 * Apply CSS custom properties to device cards in a container
 */
export function setDeviceCardStyles(container: HTMLElement): void {
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

/**
 * Get device type class for styling
 */
function getDeviceTypeClass(device: EidonDevice): string {
  if (device.role === DeviceRole.LEFT_HUB || device.role === DeviceRole.RIGHT_HUB) {
    return styles.hubDevice;
  }
  if (device.role === DeviceRole.CHEST) {
    return styles.chestDevice;
  }
  return '';
}

/**
 * Get a fixed, visible color for data stream dials (independent of tracker color)
 * Uses bright cyan/blue colors that are always visible on dark backgrounds
 */
function getDataStreamColor(): string {
  return '#0ea5e9'; // Bright sky blue - always visible and independent of device color
}

/**
 * Draw a dial/gauge for an angle value
 */
function drawDial(ctx: CanvasRenderingContext2D, valDeg: number): void {
  // Normalize angle to 0-360 range with 0° at top
  const normalizedDeg = ((valDeg % 360) + 360) % 360;
  const r = 18;
  const size = 40;
  const center = size / 2;
  
  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = 3;
  
  // Draw background ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.arc(center, center, r, 0, Math.PI * 2);
  ctx.stroke();

  // Draw the pointer arc segment - use fixed bright color
  const angleRad = -Math.PI / 2 + normalizedDeg * Math.PI / 180; // 0° at top
  const arcWidth = 30 * Math.PI / 180; // 30° wide segment
  const dialColor = getDataStreamColor();
  ctx.strokeStyle = dialColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(center, center, r, angleRad - arcWidth / 2, angleRad + arcWidth / 2);
  ctx.stroke();

  // Draw the value text - use same bright color
  ctx.fillStyle = dialColor;
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(valDeg) + '°', center, center);
}

/**
 * Format quaternion data for display
 */
function formatQuaternionData(quaternion?: number[]): { euler: { yaw: number; pitch: number; roll: number }; quat: string } | null {
  if (!quaternion || quaternion.length !== 4) {
    return null;
  }
  
  const q: quat = [quaternion[0], quaternion[1], quaternion[2], quaternion[3]];
  const [yaw, pitch, roll] = eulerXYZ(q);
  
  // Convert to degrees
  const yawDeg = yaw * 180 / Math.PI;
  const pitchDeg = pitch * 180 / Math.PI;
  const rollDeg = roll * 180 / Math.PI;
  
  // Format quaternion values
  const quatStr = `(${quaternion[0].toFixed(3)}, ${quaternion[1].toFixed(3)}, ${quaternion[2].toFixed(3)}, ${quaternion[3].toFixed(3)})`;
  
  return {
    euler: {
      yaw: yawDeg,
      pitch: pitchDeg,
      roll: rollDeg
    },
    quat: quatStr
  };
}

/**
 * Render data content HTML with canvas dials
 */
function renderDataContent(quaternionData?: { quaternion: number[]; timestamp: number }): string {
  if (!quaternionData) {
    return `<div class="${styles.noData}">Waiting for data...</div>`;
  }
  
  const formatted = formatQuaternionData(quaternionData.quaternion);
  if (!formatted) {
    return `<div class="${styles.noData}">No data available</div>`;
  }
  
  return `
    <div class="${styles.dialGrid}">
      <div class="${styles.dialItem}">
        <canvas class="${styles.dialCanvas}" data-dial="yaw" width="40" height="40"></canvas>
        <div class="${styles.dialLabel}">Yaw</div>
        <div class="${styles.dialValue}">${formatted.euler.yaw.toFixed(1)}°</div>
      </div>
      <div class="${styles.dialItem}">
        <canvas class="${styles.dialCanvas}" data-dial="pitch" width="40" height="40"></canvas>
        <div class="${styles.dialLabel}">Pitch</div>
        <div class="${styles.dialValue}">${formatted.euler.pitch.toFixed(1)}°</div>
      </div>
      <div class="${styles.dialItem}">
        <canvas class="${styles.dialCanvas}" data-dial="roll" width="40" height="40"></canvas>
        <div class="${styles.dialLabel}">Roll</div>
        <div class="${styles.dialValue}">${formatted.euler.roll.toFixed(1)}°</div>
      </div>
    </div>
    <div class="${styles.quatRow}">
      <div class="${styles.dataLabel}">Quaternion:</div>
      <div class="${styles.dataValue} ${styles.quatValue}">${formatted.quat}</div>
    </div>
  `;
}

/**
 * Update dial canvases for a device
 */
export function updateDeviceDials(deviceId: string, quaternionData?: { quaternion: number[]; timestamp: number }): void {
  const card = document.querySelector(`[data-device-id="${deviceId}"]`);
  if (!card) return;
  
  if (!quaternionData) {
    // Clear dials
    const canvases = card.querySelectorAll<HTMLCanvasElement>(`.${styles.dialCanvas}`);
    canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 40, 40);
      }
    });
    return;
  }
  
  const formatted = formatQuaternionData(quaternionData.quaternion);
  if (!formatted) return;
  
  // Update each dial
  const dials = [
    { name: 'yaw', value: formatted.euler.yaw },
    { name: 'pitch', value: formatted.euler.pitch },
    { name: 'roll', value: formatted.euler.roll }
  ];
  
  dials.forEach(({ name, value }) => {
    const canvas = card.querySelector<HTMLCanvasElement>(`.${styles.dialCanvas}[data-dial="${name}"]`);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawDial(ctx, value);
      }
    }
    
    // Update the text value next to the dial
    const valueElement = canvas?.closest(`.${styles.dialItem}`)?.querySelector(`.${styles.dialValue}`);
    if (valueElement) {
      valueElement.textContent = `${value.toFixed(1)}°`;
    }
  });
}

/**
 * Create HTML string for a device connection card
 */
export function createDeviceConnectionCard(
  device: EidonDevice, 
  allDevices?: EidonDevice[], 
  selectedColor?: string, 
  selectedRole?: DeviceRole, 
  hasChanges?: boolean,
  quaternionData?: { quaternion: number[]; timestamp: number }
): string {
  const status = getDeviceStatus(device, allDevices);
  const statusColor = getStatusColor(status);
  const roleName = DEVICE_ROLE_NAMES[device.role];
  const deviceTypeClass = getDeviceTypeClass(device);
  const displayColor = selectedColor || device.color || '#666';
  const displayRole = selectedRole !== undefined ? DEVICE_ROLE_NAMES[selectedRole] : roleName;

  let cardHtml = `
    <div class="${styles.deviceCard} ${deviceTypeClass}" data-device-id="${device.id}">
      <div class="${styles.cardTop}">
        <div class="${styles.cardLeft}">
          <div class="${styles.colorIndicator}" data-color="${displayColor}"></div>
          <div class="${styles.deviceInfo}">
            <div class="${styles.deviceName}">${device.name}</div>
            <div class="${styles.deviceRole}">${displayRole}</div>
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
  `;

  // If connected, show role/color selectors and save button
  if (device.isConnected) {
    cardHtml += `
      <div class="${styles.configSection}">
        <div class="${styles.configRow}">
          <div class="${styles.selectorGroup}">
            <label class="${styles.selectorLabel}">
              <i class="fas fa-palette"></i> Color
            </label>
            <select class="${styles.colorSelector}" data-device-id="${device.id}" data-selector-type="color">
              <option value="">Select Color</option>
              <option value="rgb(255, 0, 0)" ${selectedColor === 'rgb(255, 0, 0)' || device.color === 'rgb(255, 0, 0)' ? 'selected' : ''}>Red</option>
              <option value="rgb(0, 128, 0)" ${selectedColor === 'rgb(0, 128, 0)' || device.color === 'rgb(0, 128, 0)' ? 'selected' : ''}>Green</option>
              <option value="rgb(0, 0, 255)" ${selectedColor === 'rgb(0, 0, 255)' || device.color === 'rgb(0, 0, 255)' ? 'selected' : ''}>Blue</option>
              <option value="rgb(255, 255, 0)" ${selectedColor === 'rgb(255, 255, 0)' || device.color === 'rgb(255, 255, 0)' ? 'selected' : ''}>Yellow</option>
              <option value="rgb(128, 0, 128)" ${selectedColor === 'rgb(128, 0, 128)' || device.color === 'rgb(128, 0, 128)' ? 'selected' : ''}>Purple</option>
              <option value="rgb(255, 165, 0)" ${selectedColor === 'rgb(255, 165, 0)' || device.color === 'rgb(255, 165, 0)' ? 'selected' : ''}>Orange</option>
              <option value="rgb(255, 192, 203)" ${selectedColor === 'rgb(255, 192, 203)' || device.color === 'rgb(255, 192, 203)' ? 'selected' : ''}>Pink</option>
              <option value="rgb(0, 255, 255)" ${selectedColor === 'rgb(0, 255, 255)' || device.color === 'rgb(0, 255, 255)' ? 'selected' : ''}>Cyan</option>
              <option value="rgb(255, 255, 255)" ${selectedColor === 'rgb(255, 255, 255)' || device.color === 'rgb(255, 255, 255)' ? 'selected' : ''}>White</option>
              <option value="rgb(40, 40, 40)" ${selectedColor === 'rgb(40, 40, 40)' || device.color === 'rgb(40, 40, 40)' ? 'selected' : ''}>Black</option>
            </select>
          </div>
          <div class="${styles.selectorGroup}">
            <label class="${styles.selectorLabel}">
              <i class="fas fa-tag"></i> Role
            </label>
            <select class="${styles.roleSelector}" data-device-id="${device.id}" data-selector-type="role">
              <option value="0" ${(selectedRole ?? device.role) === DeviceRole.LEFT_HAND ? 'selected' : ''}>Left Hand</option>
              <option value="1" ${(selectedRole ?? device.role) === DeviceRole.RIGHT_HAND ? 'selected' : ''}>Right Hand</option>
              <option value="2" ${(selectedRole ?? device.role) === DeviceRole.LEFT_FOREARM ? 'selected' : ''}>Left Forearm</option>
              <option value="3" ${(selectedRole ?? device.role) === DeviceRole.RIGHT_FOREARM ? 'selected' : ''}>Right Forearm</option>
              <option value="4" ${(selectedRole ?? device.role) === DeviceRole.LEFT_HUB ? 'selected' : ''}>Left Hub</option>
              <option value="5" ${(selectedRole ?? device.role) === DeviceRole.RIGHT_HUB ? 'selected' : ''}>Right Hub</option>
              <option value="6" ${(selectedRole ?? device.role) === DeviceRole.CHEST ? 'selected' : ''}>Chest</option>
              <option value="7" ${(selectedRole ?? device.role) === DeviceRole.UNKNOWN ? 'selected' : ''}>Unknown</option>
            </select>
          </div>
        </div>
        <button class="${styles.saveBtn}" data-device-id="${device.id}" ${hasChanges ? '' : 'disabled'}>
          <i class="fas fa-save"></i> Save
        </button>
      </div>
      
      <!-- Data View Section -->
      <div class="${styles.dataSection}">
        <button class="${styles.dataToggle}" data-device-id="${device.id}">
          <i class="fas fa-chevron-down ${styles.dataToggleIcon}"></i>
          <span>Data Stream</span>
        </button>
        <div class="${styles.dataContent}" data-device-id="${device.id}" style="display: none;">
          ${renderDataContent(quaternionData)}
        </div>
      </div>
    `;
  }

  cardHtml += `</div>`;

  return cardHtml;
}

