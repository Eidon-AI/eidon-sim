import { DeviceRole, DEVICE_ROLE_NAMES } from '../../../core/constants';
import styles from './styles/RoleSelector.module.css';

/**
 * Role option data
 */
export const ROLE_OPTIONS = [
  { value: DeviceRole.LEFT_HAND, label: DEVICE_ROLE_NAMES[DeviceRole.LEFT_HAND] },
  { value: DeviceRole.RIGHT_HAND, label: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_HAND] },
  { value: DeviceRole.LEFT_FOREARM, label: DEVICE_ROLE_NAMES[DeviceRole.LEFT_FOREARM] },
  { value: DeviceRole.RIGHT_FOREARM, label: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_FOREARM] },
  { value: DeviceRole.LEFT_HUB, label: DEVICE_ROLE_NAMES[DeviceRole.LEFT_HUB] },
  { value: DeviceRole.RIGHT_HUB, label: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_HUB] },
  { value: DeviceRole.CHEST, label: DEVICE_ROLE_NAMES[DeviceRole.CHEST] },
  { value: DeviceRole.LEFT_GLOVE, label: DEVICE_ROLE_NAMES[DeviceRole.LEFT_GLOVE] },
  { value: DeviceRole.RIGHT_GLOVE, label: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_GLOVE] },
  { value: DeviceRole.UNKNOWN, label: DEVICE_ROLE_NAMES[DeviceRole.UNKNOWN] }
];

/**
 * Render role selector HTML
 */
export function renderRoleSelector(deviceId: string, selectedRole?: DeviceRole, deviceRole?: DeviceRole): string {
  const currentRole = selectedRole ?? deviceRole ?? DeviceRole.UNKNOWN;
  
  const optionsHtml = ROLE_OPTIONS.map(option => {
    const isSelected = option.value === currentRole;
    return `<option value="${option.value}" ${isSelected ? 'selected' : ''}>${option.label}</option>`;
  }).join('');

  return `
    <select class="${styles.roleSelector}" data-device-id="${deviceId}" data-selector-type="role">
      ${optionsHtml}
    </select>
  `;
}

