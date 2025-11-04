import { EidonDevice } from '../../../core/EidonTrackerManager';
import { DeviceRole, DEVICE_ROLE_NAMES } from '../../../core/constants';
import { eulerXYZ, formatQuaternion } from '../../../core/mathUtils';
import { quat } from 'gl-matrix';
import styles from './styles/NewDeviceConnectionCard.module.css';
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
  
  // Parse quaternion: raw Bluetooth data is [w, x, y, z], but gl-matrix quat format is [x, y, z, w]
  // Bytes 0-3: w, Bytes 4-7: x, Bytes 8-11: y, Bytes 12-15: z
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
 * Render data content HTML with canvas dials for a single device
 */
function renderSingleDeviceDataContent(
  deviceName: string,
  deviceId: string,
  quaternionData?: { quaternion: number[]; timestamp: number }
): string {
  if (!quaternionData) {
    return `<div class="${styles.noData}">Waiting for data...</div>`;
  }
  
  const formatted = formatQuaternionData(quaternionData.quaternion);
  if (!formatted) {
    return `<div class="${styles.noData}">No data available</div>`;
  }
  
  return `
    <div class="${styles.deviceDataSection}" data-device-id="${deviceId}">
      <div class="${styles.deviceDataHeader}">${deviceName}</div>
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
    </div>
  `;
}

/**
 * Render data content HTML with canvas dials (supports hub with child devices)
 */
function renderDataContent(
  device: EidonDevice,
  allDevices?: EidonDevice[],
  quaternionDataMap?: Map<string, { quaternion: number[]; timestamp: number }>
): string {
  const isHub = device.isHub && (device.role === DeviceRole.LEFT_HUB || device.role === DeviceRole.RIGHT_HUB);
  
  if (!isHub) {
    // Non-hub device - render single device data
    const quatData = quaternionDataMap?.get(device.id);
    return renderSingleDeviceDataContent(device.name, device.id, quatData);
  }
  
  // Hub device - render hub data + child device data
  const hubQuatData = quaternionDataMap?.get(device.id);
  const childDevices = getChildDevicesForHub(device, allDevices);
  
  let html = '';
  
  // Hub's own data
  const hubRoleName = DEVICE_ROLE_NAMES[device.role];
  html += renderSingleDeviceDataContent(hubRoleName, device.id, hubQuatData);
  
  // Child device data
  const expectedChildRoles = device.role === DeviceRole.LEFT_HUB
    ? [
        { role: DeviceRole.LEFT_HAND, name: DEVICE_ROLE_NAMES[DeviceRole.LEFT_HAND] },
        { role: DeviceRole.LEFT_FOREARM, name: DEVICE_ROLE_NAMES[DeviceRole.LEFT_FOREARM] }
      ]
    : [
        { role: DeviceRole.RIGHT_HAND, name: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_HAND] },
        { role: DeviceRole.RIGHT_FOREARM, name: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_FOREARM] }
      ];
  
  for (const expectedRole of expectedChildRoles) {
    const childDevice = childDevices.find(d => d.role === expectedRole.role);
    
    // Try to find quaternion data using multiple possible IDs
    let childQuatData = childDevice ? quaternionDataMap?.get(childDevice.id) : undefined;
    
    // If no data found by child device ID, try to find by role in allDevices
    if (!childQuatData && allDevices) {
      // Find any device with matching role and parentHub that matches this hub
      const matchingChild = allDevices.find(d => 
        d.role === expectedRole.role &&
        d.parentHub && (
          d.parentHub === device.id ||
          (device.connectionId && d.parentHub === device.connectionId) ||
          (device.macAddress && d.parentHub === device.macAddress)
        )
      );
      
      if (matchingChild) {
        childQuatData = quaternionDataMap?.get(matchingChild.id);
        // Use the matching child device if we didn't have one before
        if (!childDevice && matchingChild) {
          // Update the childDevices array reference (childDevice is a local variable)
          const actualChildDevice = matchingChild;
          if (childQuatData) {
            html += renderSingleDeviceDataContent(expectedRole.name, actualChildDevice.id, childQuatData);
          } else {
            html += `
              <div class="${styles.deviceDataSection}" data-device-id="${actualChildDevice.id}">
                <div class="${styles.deviceDataHeader}">${expectedRole.name}</div>
                <div class="${styles.noData}">Waiting for data...</div>
              </div>
            `;
          }
          continue;
        }
      }
    }
    
    if (childDevice && childQuatData) {
      // Child device exists and has data
      html += renderSingleDeviceDataContent(expectedRole.name, childDevice.id, childQuatData);
    } else if (childDevice) {
      // Child device exists but no data yet
      html += `
        <div class="${styles.deviceDataSection}" data-device-id="${childDevice.id}">
          <div class="${styles.deviceDataHeader}">${expectedRole.name}</div>
          <div class="${styles.noData}">Waiting for data...</div>
        </div>
      `;
    } else {
      // Child device doesn't exist yet
      html += `
        <div class="${styles.deviceDataSection}">
          <div class="${styles.deviceDataHeader}">${expectedRole.name}</div>
          <div class="${styles.noData}">Device not connected</div>
        </div>
      `;
    }
  }
  
  return html;
}

/**
 * Update dial canvases for a device
 */
export function updateDeviceDials(deviceId: string, quaternionData?: { quaternion: number[]; timestamp: number }): void {
  // First try to find a card element (for hub/chest devices)
  let container = document.querySelector(`.${styles.deviceCard}[data-device-id="${deviceId}"]`) as HTMLElement;
  
  // If not found, try to find a deviceDataSection (for child devices nested in parent hub cards)
  if (!container) {
    container = document.querySelector(`.${styles.deviceDataSection}[data-device-id="${deviceId}"]`) as HTMLElement;
  }
  
  // If still not found, try to find any element with this deviceId (fallback)
  if (!container) {
    container = document.querySelector(`[data-device-id="${deviceId}"]`) as HTMLElement;
  }
  
  if (!container) return;
  
  if (!quaternionData) {
    // Clear dials
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
  
  // Find all dials for this device (may be nested in child device sections)
  dials.forEach(({ name, value }) => {
    const canvas = container.querySelector<HTMLCanvasElement>(`.${styles.dialCanvas}[data-dial="${name}"][data-device-id="${deviceId}"]`);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawDial(ctx, value);
      }
      
      // Update the text value next to the dial
      const valueElement = canvas?.closest(`.${styles.dialItem}`)?.querySelector(`.${styles.dialValue}`);
      if (valueElement) {
        valueElement.textContent = `${value.toFixed(1)}°`;
      }
    }
  });

  // Update the raw quaternion value text (may be multiple instances for hub + children)
  const quatValueElements = container.querySelectorAll(`.${styles.quatValue}[data-device-id="${deviceId}"]`);
  quatValueElements.forEach((element) => {
    if (formatted.quat) {
      element.textContent = formatted.quat;
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

  // If connected, show role/color selectors and save button
  if (device.isConnected) {
    cardHtml += `
      <div class="${styles.configSection}">
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
      
      <!-- Calibrate button below data stream -->
      <div class="${styles.cardBottom}">
        <button class="${styles.calibrateBtn}" data-device-id="${device.id}" data-connection-id="${device.connectionId || ''}">
          <i class="fas fa-compass"></i> Calibrate
        </button>
      </div>
    `;
  }

  cardHtml += `</div>`;

  return cardHtml;
}

