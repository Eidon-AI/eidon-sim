import { DeviceState } from '../../core/types';
import { HidManager }  from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';

export function renderCard(state: DeviceState, hid: HidManager, store: DeviceStore) {
  const el = document.createElement('div');
  el.className = 'flex items-center gap-2 border-b border-neutral-700 py-1';

  const colorBox = document.createElement('input');
  colorBox.type  = 'color';
  colorBox.value = state.color;
  colorBox.className = 'w-6 h-6 border-none bg-transparent p-0';
  el.appendChild(colorBox);

  const label = document.createElement('span');
  label.textContent = `${state.kind} ${state.arm?.side ?? ''} ${state.arm?.level ?? ''}`;
  el.appendChild(label);

  const btnCal = document.createElement('button');
  btnCal.textContent = '↻';
  btnCal.className   = 'px-2';
  el.appendChild(btnCal);

  const btnX = document.createElement('button');
  btnX.textContent = '✕';
  btnX.className   = 'px-2';
  el.appendChild(btnX);

  /* listeners */
  colorBox.oninput = () => {
    const rgb = colorBox.value.match(/\w\w/g)!.map(x=>parseInt(x,16)) as [number,number,number];
    const dev = hid['devices'].get(state.id);   // private but fine here
    if(dev) hid.setColor(dev, rgb);
    state.color = colorBox.value;
    // TODO update line colors in scene (future step)
  };

  btnCal.onclick = () => hid.sendCalibrateAll();         // per-device later
  btnX  .onclick = () => { hid['devices'].get(state.id)?.close(); store['map'].delete(state.id); el.remove(); };

  return el;
}
