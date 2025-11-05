import styles from './styles/ColorDropdown.module.css';

/**
 * Color option data
 */
export const COLOR_OPTIONS = [
  { value: 'rgb(255, 0, 0)', label: 'Red', color: 'rgb(255, 0, 0)' },
  { value: 'rgb(0, 128, 0)', label: 'Green', color: 'rgb(0, 128, 0)' },
  { value: 'rgb(0, 0, 255)', label: 'Blue', color: 'rgb(0, 0, 255)' },
  { value: 'rgb(255, 255, 0)', label: 'Yellow', color: 'rgb(255, 255, 0)' },
  { value: 'rgb(128, 0, 128)', label: 'Purple', color: 'rgb(128, 0, 128)' },
  { value: 'rgb(255, 165, 0)', label: 'Orange', color: 'rgb(255, 165, 0)' },
  { value: 'rgb(255, 192, 203)', label: 'Pink', color: 'rgb(255, 192, 203)' },
  { value: 'rgb(0, 255, 255)', label: 'Cyan', color: 'rgb(0, 255, 255)' },
  { value: 'rgb(255, 255, 255)', label: 'White', color: 'rgb(255, 255, 255)' },
  { value: 'rgb(40, 40, 40)', label: 'Black', color: 'rgb(40, 40, 40)' }
];

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

