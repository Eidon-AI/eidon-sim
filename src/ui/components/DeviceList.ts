import { HidManager } from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';
import { renderCard }  from './DeviceCard';

export function mountDeviceList(parent: HTMLElement, hid: HidManager, store: DeviceStore){
  const wrapper = document.createElement('div');
  wrapper.id = 'deviceList';
  wrapper.className = 'border-b border-neutral-700';
  parent.appendChild(wrapper);

  store.addEventListener('update', e=>{
    const s = (e as CustomEvent<any>).detail;
    if(wrapper.querySelector(`[data-id="${s.id}"]`)) return;  // already rendered
    const card = renderCard(s, hid, store);
    card.setAttribute('data-id', s.id);
    wrapper.appendChild(card);
  });
}
