import styles from './styles/ColorDropdown.module.css';
import { COLOR_OPTIONS } from '../../../types/deviceColors';

/**
 * Render color dropdown HTML
 */
export function renderColorDropdown(deviceId: string, selectedColor?: string, deviceColor?: string): string {
  const currentColor = selectedColor || deviceColor || '';
  const selectedOption = COLOR_OPTIONS.find(opt => opt.value === currentColor) || null;
  
  const optionsHtml = COLOR_OPTIONS.map(option => {
    const isSelected = option.value === currentColor;
    return `
      <div class="${styles.colorOption} ${isSelected ? styles.colorOptionSelected : ''}" 
           data-value="${option.value}" 
           data-device-id="${deviceId}">
        <span class="${styles.colorCircle}" style="background-color: ${option.color};"></span>
        <span class="${styles.colorLabel}">${option.label}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="${styles.colorDropdownWrapper}" data-device-id="${deviceId}">
      <div class="${styles.colorDropdownTrigger}" data-device-id="${deviceId}" data-selector-type="color">
        <span class="${styles.colorCircle}" style="background-color: ${selectedOption?.color || 'transparent'};"></span>
        <span class="${styles.colorDropdownText}">${selectedOption?.label || 'Select Color'}</span>
        <i class="fas fa-chevron-down ${styles.colorDropdownIcon}"></i>
      </div>
      <div class="${styles.colorDropdownMenu}" data-device-id="${deviceId}" style="display: none;">
        ${optionsHtml}
      </div>
      <input type="hidden" class="${styles.colorSelector}" data-device-id="${deviceId}" value="${currentColor}">
    </div>
  `;
}

