import { EidonDevice } from '../../../core/EidonTrackerManager';
import { DeviceRole, DEVICE_ROLE_NAMES } from '../../../core/constants';
import { eulerXYZ, formatQuaternion } from '../../../core/mathUtils';
import { quat } from 'gl-matrix';
import styles from './styles/SavedDeviceConnectionCard.module.css';
import { renderColorDropdown } from './ColorDropdown';
import { renderRoleSelector } from './RoleSelector';

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
 * Get child devices for a hub device
 * Tries multiple matching strategies: by hub ID, connectionId, or macAddress
 */
function getChildDevicesForHub(hubDevice: EidonDevice, allDevices?: EidonDevice[]): EidonDevice[] {
  if (!allDevices) return [];
  
  // Try to match by hub ID first
  let childDevices = allDevices.filter(d => d.parentHub === hubDevice.id);
  
  // If no matches, try by connectionId or macAddress
  if (childDevices.length === 0 && (hubDevice.connectionId || hubDevice.macAddress)) {
    const hubConnectionId = hubDevice.connectionId || hubDevice.macAddress;
    // Find the trackerManager device that matches this hub by connectionId/macAddress
    const matchingHub = allDevices.find(d => 
      (d.connectionId === hubConnectionId || d.macAddress === hubConnectionId) &&
      (d.role === hubDevice.role)
    );
    
    if (matchingHub) {
      // Use the matching hub's ID to find children
      childDevices = allDevices.filter(d => d.parentHub === matchingHub.id);
    }
  }
  
  return childDevices;
}

/**
 * Count connected child devices for a hub
 */
function getConnectedChildCount(device: EidonDevice, allDevices?: EidonDevice[]): string {
  if (!device.isHub || device.role === DeviceRole.CHEST) {
    return '';
  }
  
  const childDevices = getChildDevicesForHub(device, allDevices);
  const connectedCount = childDevices.filter(d => d.isConnected).length;
  const totalCount = childDevices.length;
  
  // If no children exist yet, show 0/2
  if (totalCount === 0) {
    return '0/2';
  }
  
  return `${connectedCount}/${totalCount}`;
}

/**
 * Get a fixed, visible color for data stream dials (independent of tracker color)
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
  
  // Parse quaternion: raw Bluetooth data is [w, x, y, z], but gl-matrix quat format is [x, y, z, w]
  const q: quat = [quaternion[1], quaternion[2], quaternion[3], quaternion[0]]; // [x, y, z, w]
  // eulerXYZ returns [yaw, pitch, roll] in radians with all swaps corrected
  const [yaw, pitch, roll] = eulerXYZ(q);
  const [yawDeg, pitchDeg, rollDeg] = [yaw, pitch, roll].map(rad => rad * 180 / Math.PI);
  const quatStr = formatQuaternion(q);
  
  return {
    euler: { yaw: yawDeg, pitch: pitchDeg, roll: rollDeg },
    quat: quatStr
  };
}

/**
 * Render data content HTML with canvas dials for a single device
 */
function renderSingleDeviceDataContent(
  deviceName: string,
  deviceId: string,
  quaternionData?: { quaternion: number[]; timestamp: number }
): string {
  // CRITICAL: Always render the full dial structure with canvas elements
  // This ensures updateDeviceDials can find the canvases even when data hasn't arrived yet
  // If no data, show "Waiting for data..." but keep the canvas structure
  
  const formatted = quaternionData ? formatQuaternionData(quaternionData.quaternion) : null;
  
  return `
    <div class="${styles.deviceDataSection}" data-device-id="${deviceId}">
      <div class="${styles.deviceDataHeader}">${deviceName}</div>
      ${formatted ? `
      <div class="${styles.dialGrid}">
        <div class="${styles.dialItem}">
          <canvas class="${styles.dialCanvas}" data-dial="yaw" data-device-id="${deviceId}" width="40" height="40"></canvas>
          <div class="${styles.dialLabel}">Yaw</div>
          <div class="${styles.dialValue}">${formatted.euler.yaw.toFixed(1)}°</div>
        </div>
        <div class="${styles.dialItem}">
          <canvas class="${styles.dialCanvas}" data-dial="pitch" data-device-id="${deviceId}" width="40" height="40"></canvas>
          <div class="${styles.dialLabel}">Pitch</div>
          <div class="${styles.dialValue}">${formatted.euler.pitch.toFixed(1)}°</div>
        </div>
        <div class="${styles.dialItem}">
          <canvas class="${styles.dialCanvas}" data-dial="roll" data-device-id="${deviceId}" width="40" height="40"></canvas>
          <div class="${styles.dialLabel}">Roll</div>
          <div class="${styles.dialValue}">${formatted.euler.roll.toFixed(1)}°</div>
        </div>
      </div>
      <div class="${styles.quatRow}">
        <div class="${styles.dataLabel}">Quat:</div>
        <div class="${styles.dataValue} ${styles.quatValue}" data-device-id="${deviceId}">${formatted.quat}</div>
      </div>
      ` : `
      <div class="${styles.dialGrid}">
        <div class="${styles.dialItem}">
          <canvas class="${styles.dialCanvas}" data-dial="yaw" data-device-id="${deviceId}" width="40" height="40"></canvas>
          <div class="${styles.dialLabel}">Yaw</div>
          <div class="${styles.dialValue}">--</div>
        </div>
        <div class="${styles.dialItem}">
          <canvas class="${styles.dialCanvas}" data-dial="pitch" data-device-id="${deviceId}" width="40" height="40"></canvas>
          <div class="${styles.dialLabel}">Pitch</div>
          <div class="${styles.dialValue}">--</div>
        </div>
        <div class="${styles.dialItem}">
          <canvas class="${styles.dialCanvas}" data-dial="roll" data-device-id="${deviceId}" width="40" height="40"></canvas>
          <div class="${styles.dialLabel}">Roll</div>
          <div class="${styles.dialValue}">--</div>
        </div>
      </div>
      <div class="${styles.quatRow}">
        <div class="${styles.dataLabel}">Quat:</div>
        <div class="${styles.dataValue} ${styles.quatValue}" data-device-id="${deviceId}">Waiting for data...</div>
      </div>
      `}
    </div>
  `;
}

/**
 * Render data content HTML with canvas dials (supports hub with child devices)
 * Simple approach: Directly map quaternion data by deviceId pattern
 * Uses trackerManager device ID to ensure correct quaternion data lookup
 */
function renderDataContent(
  device: EidonDevice,
  allDevices?: EidonDevice[],
  quaternionDataMap?: Map<string, { quaternion: number[]; timestamp: number }>
): string {
  const isHub = device.isHub && (device.role === DeviceRole.LEFT_HUB || device.role === DeviceRole.RIGHT_HUB);
  
  if (!isHub) {
    // Non-hub device - render single device data
    // Try to find matching trackerManager device to get correct ID
    const trackerDevice = allDevices?.find(d => 
      d.id === device.id || 
      d.connectionId === device.connectionId || 
      d.macAddress === device.macAddress ||
      (d.connectionId === device.connectionId && d.role === device.role)
    );
    const deviceIdForData = trackerDevice?.id || device.id;
    const quatData = quaternionDataMap?.get(deviceIdForData);
    return renderSingleDeviceDataContent(device.name, deviceIdForData, quatData);
  }
  
  // Hub device - render hub data + child device data streams
  // CRITICAL: Find matching trackerManager hub device to get correct ID for quaternion lookups
  // The trackerManager uses IDs like `${hubId}_hand` and `${hubId}_forearm` for child devices
  const trackerHubDevice = allDevices?.find(d => 
    d.id === device.id || 
    d.connectionId === device.connectionId || 
    d.macAddress === device.macAddress ||
    (d.connectionId === device.connectionId && d.role === device.role)
  );
  
  // Use trackerManager hub device ID if found, otherwise fall back to saved device ID
  const hubIdForData = trackerHubDevice?.id || device.id;
  const handId = `${hubIdForData}_hand`;
  const forearmId = `${hubIdForData}_forearm`;
  
  const hubQuatData = quaternionDataMap?.get(hubIdForData);
  const handQuatData = quaternionDataMap?.get(handId);
  const forearmQuatData = quaternionDataMap?.get(forearmId);
  
  let html = '';
  
  // Hub's own quaternion data (from QUATERNION_CHAR_UUID)
  const hubRoleName = DEVICE_ROLE_NAMES[device.role];
  html += renderSingleDeviceDataContent(hubRoleName, hubIdForData, hubQuatData);
  
  // Hand quaternion data (from HAND_QUATERNION_CHAR_UUID)
  // CRITICAL: Always render the full dial structure (with canvases) so updateDeviceDials can find them
  // even if data hasn't arrived yet
  const handRoleName = device.role === DeviceRole.LEFT_HUB 
    ? DEVICE_ROLE_NAMES[DeviceRole.LEFT_HAND]
    : DEVICE_ROLE_NAMES[DeviceRole.RIGHT_HAND];
  
  html += renderSingleDeviceDataContent(handRoleName, handId, handQuatData);
  
  // Forearm quaternion data (from FOREARM_QUATERNION_CHAR_UUID)
  // CRITICAL: Always render the full dial structure (with canvases) so updateDeviceDials can find them
  // even if data hasn't arrived yet
  const forearmRoleName = device.role === DeviceRole.LEFT_HUB
    ? DEVICE_ROLE_NAMES[DeviceRole.LEFT_FOREARM]
    : DEVICE_ROLE_NAMES[DeviceRole.RIGHT_FOREARM];
  
  html += renderSingleDeviceDataContent(forearmRoleName, forearmId, forearmQuatData);
  
  return html;
}

/**
 * Update dial canvases for a device (same approach as NewDeviceConnectionCard - query DOM directly)
 * Similar to DeviceCard.ts which continuously listens for updates and redraws
 */
export function updateDeviceDials(deviceId: string, quaternionData?: { quaternion: number[]; timestamp: number }): void {
  // Strategy: For child devices (hand/forearm), they're nested inside parent hub cards
  // We need to find the parent hub card first, then search within it
  
  // Check if this is a child device ID (ends with _hand or _forearm)
  const isChildDevice = deviceId.endsWith('_hand') || deviceId.endsWith('_forearm');
  
  let container: HTMLElement | null = null;
  
  if (isChildDevice) {
    // For child devices, find ALL hub cards and search within each for the child device's data section
    // The child deviceId format is: ${hubId}_hand or ${hubId}_forearm
    // We need to search all hub cards since the saved device ID might differ from trackerManager hub ID
    const allHubCards = document.querySelectorAll(`.${styles.deviceCard}`);
    
    for (const hubCard of Array.from(allHubCards)) {
      // Search within this hub card for the child device's data section
      const childSection = hubCard.querySelector(`.${styles.deviceDataSection}[data-device-id="${deviceId}"]`) as HTMLElement;
      if (childSection) {
        container = childSection;
        break;
      }
    }
  }
  
  // If not found yet, try direct search (for hub devices or if parent search failed)
  if (!container) {
    container = document.querySelector(`.${styles.deviceDataSection}[data-device-id="${deviceId}"]`) as HTMLElement;
  }
  
  // If still not found, try to find a card element (for hub/chest devices)
  if (!container) {
    container = document.querySelector(`.${styles.deviceCard}[data-device-id="${deviceId}"]`) as HTMLElement;
  }
  
  // Last resort: try any element with this deviceId (fallback)
  if (!container) {
    container = document.querySelector(`[data-device-id="${deviceId}"]`) as HTMLElement;
  }
  
  if (!container) return;
  
  if (!quaternionData) {
    // Clear dials - search within the container for all canvases with this deviceId
    const canvases = container.querySelectorAll<HTMLCanvasElement>(`.${styles.dialCanvas}[data-device-id="${deviceId}"]`);
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
    // Search within the container for the specific dial canvas
    const canvas = container.querySelector<HTMLCanvasElement>(`.${styles.dialCanvas}[data-dial="${name}"][data-device-id="${deviceId}"]`);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawDial(ctx, value);
      }
      
      // Update the text value next to the dial
      const dialItem = canvas.closest(`.${styles.dialItem}`);
      if (dialItem) {
        const valueElement = dialItem.querySelector(`.${styles.dialValue}`);
        if (valueElement) {
          valueElement.textContent = `${value.toFixed(1)}°`;
        }
      }
    }
  });

  // Update the raw quaternion value text
  const quatValueElements = container.querySelectorAll(`.${styles.quatValue}[data-device-id="${deviceId}"]`);
  quatValueElements.forEach((element) => {
    if (formatted.quat) {
      element.textContent = formatted.quat;
    }
  });
}


/**
 * Create HTML string for a saved device connection card (includes edit/delete buttons)
 */
export function createDeviceConnectionCard(
  device: EidonDevice, 
  allDevices?: EidonDevice[], 
  selectedColor?: string, 
  selectedRole?: DeviceRole, 
  hasChanges?: boolean,
  quaternionDataMap?: Map<string, { quaternion: number[]; timestamp: number }>
): string {
  const status = getDeviceStatus(device, allDevices);
  const statusColor = getStatusColor(status);
  const roleName = DEVICE_ROLE_NAMES[device.role];
  const deviceTypeClass = getDeviceTypeClass(device);
  const displayColor = selectedColor || device.color || '#666';
  const displayRole = selectedRole !== undefined ? DEVICE_ROLE_NAMES[selectedRole] : roleName;

  // Check if this is a hub and get child device count
  const isHub = device.isHub && (device.role === DeviceRole.LEFT_HUB || device.role === DeviceRole.RIGHT_HUB);
  const childCountText = isHub ? getConnectedChildCount(device, allDevices) : '';
  
  let cardHtml = `
    <div class="${styles.deviceCard} ${deviceTypeClass}" data-device-id="${device.id}">
      <div class="${styles.cardTop}">
        <div class="${styles.cardLeft}">
          <div class="${styles.colorIndicator}" data-color="${displayColor}"></div>
          <div class="${styles.deviceInfo}">
            <div class="${styles.deviceName}">${device.name}</div>
          </div>
        </div>
      </div>
      <div class="${styles.cardMiddle}">
        <div class="${styles.leftColumn}">
          <div class="${styles.roleSection}">
            <div class="${styles.deviceRole}">${displayRole}</div>
          </div>
          ${childCountText ? `
          <div class="${styles.childIndicatorRow}">
            <div class="${styles.childIndicator}">${childCountText} children connected</div>
          </div>
          ` : ''}
        </div>
        <div class="${styles.rightColumn}">
          <div class="${styles.connectSection}">
            <button class="${styles.connectBtn}" data-device-id="${device.id}">
              ${device.isConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
          <div class="${styles.statusSection}">
            <div class="${styles.statusBadge}" data-status-color="${statusColor}">
              ${status}
            </div>
          </div>
        </div>
      </div>
  `;

  // If connected, show role/color selectors (hidden by default, shown via edit button)
  if (device.isConnected) {
    // Config section - hidden by default, shown via edit button
    cardHtml += `
      <div class="${styles.configSection}" data-device-id="${device.id}" style="display: none;">
        <div class="${styles.configRow}">
          <div class="${styles.selectorGroup}">
            <label class="${styles.selectorLabel}">
              <i class="fas fa-palette"></i> Color
            </label>
            ${renderColorDropdown(device.id, selectedColor, device.color)}
          </div>
          <div class="${styles.selectorGroup}">
            <label class="${styles.selectorLabel}">
              <i class="fas fa-tag"></i> Role
            </label>
            ${renderRoleSelector(device.id, selectedRole, device.role)}
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
          ${renderDataContent(device, allDevices, quaternionDataMap)}
        </div>
      </div>
    `;
  }

  // Show calibrate button (if connected) and edit/delete buttons for saved devices
  if (device.isConnected) {
    cardHtml += `
      <div class="${styles.cardBottom}">
        <div class="${styles.actionButtons}">
          <button class="${styles.calibrateBtn}" data-device-id="${device.id}" data-connection-id="${device.connectionId || ''}">
            <i class="fas fa-compass"></i> Calibrate
          </button>
          <div class="${styles.rightActions}">
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
  } else {
    // Show only edit/delete buttons when disconnected
    cardHtml += `
      <div class="${styles.cardBottom}">
        <div class="${styles.actionButtons} ${styles.actionsRightOnly}">
          <div class="${styles.rightActions}">
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

  cardHtml += `</div>`;

  return cardHtml;
}

