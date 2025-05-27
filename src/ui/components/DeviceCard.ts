import { DeviceState } from '../../core/types';
import { HidManager }  from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';

export function renderCard(state: DeviceState, hid: HidManager, store: DeviceStore) {

  const el = document.createElement('div');
  el.className = 'flex flex-col gap-2 border-b border-neutral-700 py-1';

  const topRow = document.createElement('div');
  topRow.className = 'flex items-center gap-2 w-full';

  const colorBox = document.createElement('input');
  colorBox.type  = 'color';
  colorBox.value = state.color;
  colorBox.className = 'w-6 h-6 border-none bg-transparent p-0';
  topRow.appendChild(colorBox);

  const label = document.createElement('span');
  label.textContent = `${state.kind} ${state.arm?.side ?? ''} ${state.arm?.level ?? ''}`;
  label.className = 'flex-1';
  topRow.appendChild(label);

  const btnCal = document.createElement('button');
  btnCal.textContent = '↻';
  btnCal.className   = 'px-2';
  topRow.appendChild(btnCal);

  const btnX = document.createElement('button');
  btnX.textContent = '✕';
  btnX.className   = 'px-2';
  topRow.appendChild(btnX);

  el.appendChild(topRow);

  /* listeners */
  colorBox.oninput = () => {
    const rgb = colorBox.value.match(/\w\w/g)!.map(x => parseInt(x, 16)) as [number, number, number];
    const dev = hid['devices'].get(state.id);
    if (dev) hid.setColor(dev, rgb);           // write feature report
  
    state.color = colorBox.value;              // update local snapshot
    /* 🔔 notify store so scene & other UI react */
    store.dispatchEvent(new CustomEvent('update', { detail: state }));
  };

  btnCal.onclick = () => hid.sendCalibrate(state.id);
  btnX  .onclick = () => { hid.unpair(state.id); store['map'].delete(state.id); el.remove(); };

  document.addEventListener('deviceColor', e =>{
    const { id, hex } = (e as CustomEvent<any>).detail;
    if(id === state.id) colorBox.value = hex;
  });

  document.addEventListener('deviceRemoved', e => {
    if ((e as CustomEvent<{id:string}>).detail.id === state.id) {
      el.remove();
    }
  });

  // Finger bars
  if(state.finger){
    const container = document.createElement('div');
    container.className = 'w-full mt-2';
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-4 gap-1 w-full';
    
    // Create 16 bars total (4 + 3 + 3 + 3 + 3)
    for(let i=0;i<16;i++){
      const bar = document.createElement('div');
      bar.className = 'h-1 bg-neutral-700';
      bar.dataset['idx'] = String(i);
      
      // Position bars in the grid
      if (i < 4) {
        // First row: all 4 columns
        bar.style.gridColumn = `${i + 1}`;
        bar.style.gridRow = '1';
      } else if (i < 7) {
        // Second row: first 3 columns
        bar.style.gridColumn = `${(i - 4) + 1}`;
        bar.style.gridRow = '2';
      } else if (i < 10) {
        // Third row: first 3 columns
        bar.style.gridColumn = `${(i - 7) + 1}`;
        bar.style.gridRow = '3';
      } else if (i < 13) {
        // Fourth row: first 3 columns
        bar.style.gridColumn = `${(i - 10) + 1}`;
        bar.style.gridRow = '4';
      } else {
        // Fifth row: first 3 columns
        bar.style.gridColumn = `${(i - 13) + 1}`;
        bar.style.gridRow = '5';
      }
      
      grid.appendChild(bar);
    }
    container.appendChild(grid);
    el.appendChild(container);
  
    /* update bars on store update */
    store.addEventListener('update', ev=>{
      console.log("update");
      const s = (ev as CustomEvent<DeviceState>).detail;
      if(s.id!==state.id||!s.fingerNorm) return;
      
      grid.childNodes.forEach((c,j)=>{
        (c as HTMLElement).style.width = `${Math.round(s.fingerNorm![j]*100)}%`;
        (c as HTMLElement).style.backgroundColor = state.color;
      });
    });
  }

  return el;
}
