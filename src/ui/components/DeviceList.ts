import { HidManager } from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';
import { renderCard }  from './DeviceCard';
import { ConnectedDevice } from '../../types/device';
import styles from './styles/DeviceList.module.css';

// Define sorting order for consistent device display
const ARM_SIDE_ORDER = { 'left': 0, 'right': 1 };
const ARM_LEVEL_ORDER = { 'upper': 0, 'lower': 1, 'hand': 2 };
const KIND_ORDER = { 'tracker': 0, 'glove': 1 };

function sortDevices(devices: ConnectedDevice[]): ConnectedDevice[] {
  return devices.sort((a, b) => {
    // 1. Sort by arm side (left first, then right)
    const aSide = a.arm?.side;
    const bSide = b.arm?.side;
    if (aSide && bSide && aSide !== bSide) {
      return ARM_SIDE_ORDER[aSide] - ARM_SIDE_ORDER[bSide];
    }
    if (aSide && !bSide) return -1; // devices with arm info first
    if (!aSide && bSide) return 1;
    
    // 2. Sort by arm level (upper, lower, hand)
    const aLevel = a.arm?.level;
    const bLevel = b.arm?.level;
    if (aLevel && bLevel && aLevel !== bLevel) {
      return ARM_LEVEL_ORDER[aLevel] - ARM_LEVEL_ORDER[bLevel];
    }
    if (aLevel && !bLevel) return -1;
    if (!aLevel && bLevel) return 1;
    
    // 3. Sort by device kind (tracker first, then glove)
    if (a.kind !== b.kind) {
      return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    }
    
    // 4. Sort by ID as fallback for consistent ordering
    return a.id.localeCompare(b.id);
  });
}

export function mountDeviceList(parent: HTMLElement, hid: HidManager, store: DeviceStore){
  const wrapper = document.createElement('div');
  wrapper.id = 'deviceList';
  wrapper.className = styles.wrapper;
  parent.appendChild(wrapper);

  // Track currently rendered devices to avoid unnecessary re-renders
  let renderedDeviceIds = new Set<string>();

  const renderDeviceList = () => {
    // Get all devices from the store
    const allDevices = Array.from(store['map'].values());
    
    // Sort devices consistently
    const sortedDevices = sortDevices(allDevices);
    
    // Check if the device list has actually changed
    const currentDeviceIds = new Set(sortedDevices.map(d => d.id));
    const deviceOrderChanged = JSON.stringify([...currentDeviceIds]) !== JSON.stringify([...renderedDeviceIds]);
    
    // Only re-render if devices have been added/removed or order changed
    if (renderedDeviceIds.size !== currentDeviceIds.size || deviceOrderChanged) {
      // Clear existing content
      wrapper.innerHTML = '';
      renderedDeviceIds.clear();
      
      // Render devices in sorted order
      sortedDevices.forEach(device => {
        const card = renderCard(device, hid, store);
        card.setAttribute('data-id', device.id);
        wrapper.appendChild(card);
        renderedDeviceIds.add(device.id);
      });
      
      console.log(`DeviceList: Rendered ${sortedDevices.length} devices in sorted order`);
    }
  };

  // Initial render
  renderDeviceList();

  // Re-render when devices are added or updated
  store.addEventListener('update', () => {
    renderDeviceList();
  });

  // Handle device removal
  document.addEventListener('deviceRemoved', (e) => {
    const { id } = (e as CustomEvent<{id: string}>).detail;
    renderedDeviceIds.delete(id);
    renderDeviceList();
  });
}
