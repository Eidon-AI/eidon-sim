import { DeviceStore } from '../../../core/DeviceStore';
import { EidonTrackerManager } from '../../../core/EidonTrackerManager';
import { renderCard }  from './DeviceCard';
import { Device, DeviceRole } from '../../../types/device';
import styles from './styles/DeviceList.module.css';

// Define sorting order for consistent device display
const POSITION_ORDER: Record<DeviceRole, number> = {
  [DeviceRole.ROLE_LEFT_HUB]: 0,
  [DeviceRole.ROLE_LEFT_FOREARM]: 1,
  [DeviceRole.ROLE_LEFT_HAND]: 2,
  [DeviceRole.ROLE_RIGHT_HUB]: 3,
  [DeviceRole.ROLE_RIGHT_FOREARM]: 4,
  [DeviceRole.ROLE_RIGHT_HAND]: 5,
  [DeviceRole.ROLE_CHEST]: 6,
};

function sortDevices(devices: Device[]): Device[] {
  return devices.sort((a, b) => {
    // Sort by position order
    return POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
  });
}

export function mountDeviceList(parent: HTMLElement, store: DeviceStore, trackerManager?: EidonTrackerManager){
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
        const card = renderCard(device, store, trackerManager);
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
