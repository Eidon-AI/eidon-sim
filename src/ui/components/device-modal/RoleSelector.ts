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
  { value: DeviceRole.LEFT_SHOULDER, label: DEVICE_ROLE_NAMES[DeviceRole.LEFT_SHOULDER] },
  { value: DeviceRole.RIGHT_SHOULDER, label: DEVICE_ROLE_NAMES[DeviceRole.RIGHT_SHOULDER] },
  { value: DeviceRole.CHEST, label: DEVICE_ROLE_NAMES[DeviceRole.CHEST] },
  { value: DeviceRole.UNKNOWN, label: DEVICE_ROLE_NAMES[DeviceRole.UNKNOWN] }
];

/**
 * Render role selector HTML
 * @param deviceId - The device ID
 * @param selectedRole - The currently selected role
 * @param deviceRole - The device's current role
 * @param excludedRoles - Optional array of roles to exclude from the dropdown
 */
export function renderRoleSelector(
  deviceId: string, 
  selectedRole?: DeviceRole, 
  deviceRole?: DeviceRole,
  excludedRoles?: DeviceRole[]
): string {
  const currentRole = selectedRole ?? deviceRole ?? DeviceRole.UNKNOWN;
  
  // Filter out excluded roles (roles already used by other saved devices)
  // But always include the current role even if it's excluded
  const availableOptions = excludedRoles 
    ? ROLE_OPTIONS.filter(option => 
        !excludedRoles.includes(option.value) || option.value === currentRole
      )
    : ROLE_OPTIONS;
  
  const optionsHtml = availableOptions.map(option => {
    const isSelected = option.value === currentRole;
    return `<option value="${option.value}" ${isSelected ? 'selected' : ''}>${option.label}</option>`;
  }).join('');

  return `
    <select class="${styles.roleSelector}" data-device-id="${deviceId}" data-selector-type="role">
      ${optionsHtml}
    </select>
  `;
}

